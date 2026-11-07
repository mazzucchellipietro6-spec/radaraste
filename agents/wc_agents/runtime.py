"""Esecuzione di un incarico da parte di un agente: budget, prompt, ciclo degli strumenti, registri, esito.

Un incarico è "completato" solo quando l'agente ha chiamato submit_result con un risultato valido.
Ogni chiamata al modello è registrata in ai_usage; ogni passo in ai_task_events.
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any

from pydantic import ValidationError

from .db import Database, jsonb
from .guard import INJECTION_NOTICE, scan_values, security_event, system_paused
from .llm import LLM, FatalLLMError, LLMResponse, TransientLLMError
from .prompts import system_prompt, task_message
from .registry import AgentDef, load_live
from .tools import SERVER_TOOLS, TOOLS, ToolContext, ToolError
from .tools.base import as_json

log = logging.getLogger("wc_agents.runtime")

MAX_RESULT_CHARS = 24_000
MAX_NUDGES = 2


class Blocked(Exception):
    """L'incarico non può proseguire senza un intervento (budget, agente disattivato, chiave mancante)."""


def backoff_seconds(attempt: int) -> int:
    return min(30 * 2 ** max(attempt - 1, 0), 1800)


class AgentRuntime:
    def __init__(self, db: Database, settings: Any, agents: dict[str, AgentDef], llm: LLM | None):
        self.db = db
        self.settings = settings
        self.agents = agents
        self.llm = llm

    # ------------------------------------------------------------------ registri
    async def event(self, task: dict, kind: str, message: str, activity: str | None = None, data: dict | None = None) -> None:
        await self.db.execute(
            "insert into public.ai_task_events (task_id, agent_id, kind, activity, message, data) values (%s, %s, %s, %s, %s, %s)",
            (task["id"], task["agent_id"], kind, activity, message[:2000], jsonb(data or {})),
        )

    async def set_activity(self, task: dict, activity: str | None) -> None:
        await self.db.execute("update public.ai_tasks set activity = %s where id = %s", (activity, task["id"]))

    async def record_usage(self, task: dict, agent: AgentDef, resp: LLMResponse) -> None:
        for u in resp.usage:
            await self.db.execute(
                """insert into public.ai_usage (agent_id, task_id, model, input_tokens, output_tokens, cache_read_tokens,
                                                cache_write_tokens, web_searches, cost_usd, request_id)
                   values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (agent.id, task["id"], u.model, u.input_tokens, u.output_tokens, u.cache_read_tokens, u.cache_write_tokens,
                 u.web_searches, round(u.cost_usd, 6), resp.request_id),
            )
        await self.db.execute(
            """update public.ai_tasks set input_tokens = input_tokens + %s, output_tokens = output_tokens + %s,
                 cost_usd = cost_usd + %s where id = %s""",
            (sum(u.input_tokens + u.cache_read_tokens + u.cache_write_tokens for u in resp.usage),
             sum(u.output_tokens for u in resp.usage), round(resp.cost_usd, 6), task["id"]),
        )

    # ------------------------------------------------------------------ controlli prima di iniziare
    async def check_limits(self, agent: AgentDef, task: dict) -> None:
        if not agent.enabled:
            raise Blocked(f"L'agente {agent.name} è disattivato dal pannello")
        month = await self.db.fetchone(
            "select coalesce(sum(cost_usd), 0) as usd from public.ai_usage where agent_id = %s and at >= date_trunc('month', now())",
            (agent.id,),
        )
        if month and float(month["usd"]) >= agent.monthly_budget_usd:
            raise Blocked(f"Budget mensile di {agent.name} esaurito ({float(month['usd']):.2f} di {agent.monthly_budget_usd:.2f} USD)")
        day = await self.db.fetchone("select coalesce(sum(cost_usd), 0) as usd from public.ai_usage where at >= date_trunc('day', now())")
        limit = await self.db.fetchone("select value from public.ai_settings where key = 'daily_budget_usd'")
        daily = float(((limit or {}).get("value") or {}).get("amount", 25))
        if day and float(day["usd"]) >= daily:
            raise Blocked(f"Tetto di spesa giornaliero dell'azienda raggiunto ({float(day['usd']):.2f} di {daily:.2f} USD)")
        if task.get("phase") != "synthesis":
            n = await self.db.fetchone(
                """select count(*)::int as n from public.ai_tasks where agent_id = %s and started_at >= date_trunc('day', now())
                     and id <> %s and phase = 'work'""",
                (agent.id, task["id"]),
            )
            if n and n["n"] >= agent.daily_task_limit:
                raise Blocked(f"Limite giornaliero di incarichi di {agent.name} raggiunto ({agent.daily_task_limit})")

    # ------------------------------------------------------------------ contesto dell'incarico
    async def build_messages(self, agent: AgentDef, task: dict) -> list[dict]:
        inbox = await self.db.fetch(
            """update public.ai_messages set read_at = now() where id in (
                 select id from public.ai_messages where to_agent = %s and read_at is null order by created_at limit 20)
               returning from_agent, subject, body""",
            (agent.id,),
        )
        memories = await self.db.fetch(
            """select topic, content, data_status, source from public.ai_memory
               where (agent_id = %(a)s or agent_id is null) and (expires_at is null or expires_at > now())
               order by pinned desc, (search @@ plainto_tsquery('simple', %(q)s)) desc, created_at desc limit 8""",
            {"a": agent.id, "q": task["title"]},
        )
        children = None
        if task.get("phase") == "synthesis":
            children = await self.db.fetch(
                "select id, agent_id, title, status, result, result_summary, error from public.ai_tasks where parent_id = %s order by created_at",
                (task["id"],),
            )
        text = task_message(task, inbox=inbox, memories=memories, children=children)
        if task.get("attempts", 1) > 1:
            prev = await self.db.fetch(
                "select data from public.ai_task_events where task_id = %s and kind = 'tool' and data ? 'created'", (task["id"],)
            )
            created = [c for e in prev for c in (e["data"].get("created") or [])]
            if created:
                text += ("\n\nATTENZIONE: questo è un nuovo tentativo. Nei tentativi precedenti hai già creato questi record "
                         "(non duplicarli): " + json.dumps(created, ensure_ascii=False))
        return [{"role": "user", "content": text}]

    def tool_schemas(self, agent: AgentDef) -> list[dict]:
        out = []
        for name in agent.tools:
            if name in TOOLS:
                out.append({**TOOLS[name].schema(), "eager_input_streaming": True})
            elif name in SERVER_TOOLS:
                out.append(SERVER_TOOLS[name](self.settings))
        return out

    # ------------------------------------------------------------------ esecuzione
    async def run(self, task: dict) -> str:
        """Esegue un incarico già preso in carico (stato running). Restituisce lo stato finale."""
        agent = await load_live(self.db, self.agents, task["agent_id"])
        try:
            if agent is None:
                return await self.finish(task, "failed", error=f"Agente sconosciuto: {task['agent_id']}")
            if self.llm is None:
                raise Blocked("Chiave API di Claude non configurata (ANTHROPIC_API_KEY): l'agente non può lavorare")
            paused, reason = await system_paused(self.db)
            if paused:
                return await self.suspend(task, f"Sistema degli agenti sospeso dal proprietario{': ' + reason if reason else ''}")
            await self.check_limits(agent, task)
            return await self.loop(agent, task)
        except Blocked as e:
            await self.event(task, "blocked", str(e))
            if "Budget" in str(e) or "Tetto" in str(e) or "Costo massimo" in str(e):
                await security_event(self.db, "budget_exceeded", "low", str(e), actor=f"agente:{task['agent_id']}",
                                     details={"task_id": str(task["id"])})
            return await self.finish(task, "blocked", error=str(e))
        except FatalLLMError as e:
            log.error("errore del modello non recuperabile per %s: %s", task["id"], e)
            await self.event(task, "error", f"Errore del modello: {e}")
            return await self.finish(task, "blocked", error=f"Errore del modello che richiede un intervento: {e}")
        except TransientLLMError as e:
            return await self.retry_or_fail(task, f"Errore temporaneo del modello: {e}")
        except Exception as e:  # errore inatteso: registrato e ritentato come gli errori temporanei
            log.exception("errore durante l'incarico %s", task["id"])
            return await self.retry_or_fail(task, f"Errore interno: {type(e).__name__}: {e}")

    async def suspend(self, task: dict, reason: str) -> str:
        """Sospensione dal pannello (sistema o agente): l'incarico torna in coda, senza consumare tentativi."""
        await self.db.execute(
            """update public.ai_tasks set status = 'queued', attempts = greatest(attempts - 1, 0), locked_by = null, locked_at = null,
                 activity = null, run_after = now() + interval '30 seconds' where id = %s and status = 'running'""",
            (task["id"],),
        )
        await self.event(task, "paused", reason)
        return "queued"

    async def agent_enabled(self, agent_id: str) -> bool:
        row = await self.db.fetchone("select enabled and autonomy <> 'disabled' as on from public.ai_agents where id = %s", (agent_id,))
        return bool(row and row["on"])

    async def retry_or_fail(self, task: dict, error: str) -> str:
        row = await self.db.fetchone("select attempts, max_attempts, status from public.ai_tasks where id = %s", (task["id"],))
        if row and row["status"] == "cancelled":
            return "cancelled"
        if row and row["attempts"] < row["max_attempts"]:
            wait = backoff_seconds(row["attempts"])
            await self.db.execute(
                """update public.ai_tasks set status = 'queued', locked_by = null, locked_at = null, activity = null, error = %s,
                     run_after = now() + make_interval(secs => %s) where id = %s""",
                (error[:4000], wait, task["id"]),
            )
            await self.event(task, "retry", f"{error[:500]} — nuovo tentativo tra {wait} s", data={"attempt": row["attempts"]})
            return "queued"
        await self.event(task, "failed", error[:1000])
        return await self.finish(task, "failed", error=error)

    async def finish(self, task: dict, status: str, *, error: str | None = None, result: dict | None = None,
                     wait_reason: str | None = None) -> str:
        summary = (result or {}).get("summary")
        await self.db.execute(
            """update public.ai_tasks set status = %s, error = %s, result = coalesce(%s, result), result_summary = coalesce(%s, result_summary),
                 wait_reason = %s, activity = null, locked_by = null, locked_at = null,
                 finished_at = case when %s in ('completed', 'failed', 'blocked', 'cancelled') then now() else null end
               where id = %s and status = 'running'""",
            (status, error[:4000] if error else None, jsonb(result) if result is not None else None, summary[:1000] if summary else None,
             wait_reason, status, task["id"]),
            actor=f"agente:{task['agent_id']}",
        )
        return status

    async def cancelled(self, task: dict) -> bool:
        row = await self.db.fetchone("select status from public.ai_tasks where id = %s", (task["id"],))
        return not row or row["status"] == "cancelled"

    async def loop(self, agent: AgentDef, task: dict) -> str:
        colleagues = [self.agents[i] for i in agent.delegates(list(self.agents)) if i in self.agents]
        system = system_prompt(agent, colleagues)
        tools = self.tool_schemas(agent)
        messages: list[dict] = await self.build_messages(agent, task)
        found = scan_values([task.get("instructions"), task.get("context")])
        if found:
            messages[0]["content"] += "\n\n" + INJECTION_NOTICE
            await security_event(self.db, "prompt_injection", "medium", f"Istruzioni sospette nel materiale dell'incarico «{task['title'][:120]}»",
                                 actor=f"agente:{agent.id}", details={"task_id": str(task["id"]), "found": found})
        ctx = ToolContext(db=self.db, settings=self.settings, agent=agent, task=task, agents=self.agents)
        injection_alert = False
        web_sources: list[dict] = []
        nudges = 0
        model = agent.model or self.settings.ai_model
        await self.event(task, "started", f"{agent.name} inizia: {task['title']}" + (" (sintesi)" if task.get("phase") == "synthesis" else ""),
                         "analysis", {"model": model, "phase": task.get("phase")})
        await self.set_activity(task, "analysis")

        for turn in range(1, self.settings.max_turns_per_task + 1):
            if await self.cancelled(task):
                await self.event(task, "cancelled", "Incarico annullato durante l'esecuzione")
                return "cancelled"
            paused, reason = await system_paused(self.db)
            if paused:
                return await self.suspend(task, f"Sistema degli agenti sospeso dal proprietario{': ' + reason if reason else ''}")
            if turn > 1 and not await self.agent_enabled(agent.id):
                return await self.suspend(task, f"{agent.name} sospeso dal proprietario")
            spent = await self.db.fetchone("select cost_usd from public.ai_tasks where id = %s", (task["id"],))
            if spent and float(spent["cost_usd"]) >= self.settings.max_cost_per_task_usd:
                raise Blocked(f"Costo massimo per incarico raggiunto ({self.settings.max_cost_per_task_usd:.2f} USD)")

            resp = await self.llm.create(model=model, system=system, messages=messages, tools=tools, effort=agent.effort,
                                         max_tokens=16000)
            await self.record_usage(task, agent, resp)
            messages.append({"role": "assistant", "content": resp.content})
            self.collect_web(resp, web_sources)
            web_found = scan_values([b for b in resp.blocks if b.get("type") in ("web_fetch_tool_result", "web_search_tool_result")])
            if web_found:
                injection_alert = True
                await security_event(self.db, "prompt_injection", "medium", "Pagina web con istruzioni rivolte agli agenti",
                                     actor=f"agente:{agent.id}", details={"task_id": str(task["id"]), "found": web_found})
            text = " ".join(b.get("text", "") for b in resp.blocks if b.get("type") == "text").strip()
            await self.event(task, "llm", text[:600] or f"Passo {turn}", None,
                             {"turn": turn, "stop_reason": resp.stop_reason, "model": resp.model, "cost_usd": round(resp.cost_usd, 6),
                              "fallback": resp.fallback_used})

            if resp.stop_reason == "refusal":
                await self.event(task, "refusal", "Il modello ha rifiutato la richiesta", data={"details": resp.stop_details})
                await security_event(self.db, "model_refusal", "low", f"Il modello ha rifiutato l'incarico «{task['title'][:120]}»",
                                     actor=f"agente:{agent.id}", details={"task_id": str(task["id"]), "stop_details": resp.stop_details})
                return await self.finish(task, "failed", error="Il modello ha rifiutato di svolgere l'incarico")
            if resp.stop_reason == "pause_turn":
                continue  # ricerca web lunga: si riprende con la stessa conversazione

            uses = [b for b in resp.blocks if b.get("type") == "tool_use"]
            if resp.stop_reason == "max_tokens":
                if uses:  # input dello strumento troncato: non si esegue
                    messages.append({"role": "user", "content": [
                        {"type": "tool_result", "tool_use_id": u["id"], "is_error": True,
                         "content": "Risposta troncata: lo strumento non è stato eseguito. Ripeti la chiamata con un contenuto più breve."}
                        for u in uses]})
                else:
                    messages.append({"role": "user", "content": "La risposta si è interrotta per lunghezza. Continua in modo più conciso."})
                continue

            if uses:
                results: list[dict] = []
                for u in uses:
                    results.append(await self.run_tool(ctx, task, u))
                if injection_alert:
                    results.append({"type": "text", "text": INJECTION_NOTICE})
                    injection_alert = False
                messages.append({"role": "user", "content": results})
                if ctx.finished:
                    return await self.complete(task, ctx, web_sources)
                if ctx.waiting:
                    await self.event(task, "waiting", f"In attesa di {len(ctx.delegated) or 'tutti i'} colleghi", "coordination",
                                     {"children": ctx.delegated})
                    return await self.finish(task, "waiting", wait_reason="children")
                continue

            # nessuno strumento e nessun risultato consegnato
            if nudges >= MAX_NUDGES:
                return await self.finish(task, "failed", error="L'agente si è fermato senza consegnare il risultato (submit_result)")
            nudges += 1
            messages.append({"role": "user", "content": "Non hai ancora consegnato il risultato. Se hai finito chiama submit_result; "
                             "se hai delegato, chiama wait_for_delegates; altrimenti continua con gli strumenti."})

        raise Blocked(f"Numero massimo di passi raggiunto ({self.settings.max_turns_per_task}) senza un risultato")

    def collect_web(self, resp: LLMResponse, sink: list[dict]) -> None:
        today = date.today().isoformat()
        for b in resp.blocks:
            if b.get("type") == "web_search_tool_result" and isinstance(b.get("content"), list):
                for r in b["content"]:
                    if r.get("url"):
                        sink.append({"url": r["url"], "title": r.get("title", ""), "retrieved_at": today})
            elif b.get("type") == "web_fetch_tool_result" and isinstance(b.get("content"), dict) and b["content"].get("url"):
                sink.append({"url": b["content"]["url"], "title": "", "retrieved_at": today})

    async def run_tool(self, ctx: ToolContext, task: dict, use: dict) -> dict:
        name, raw = use.get("name"), use.get("input") or {}
        tool = TOOLS.get(name)
        if tool is None or name not in ctx.agent.tools:
            await self.event(task, "unauthorized_tool", f"Strumento non autorizzato: {name}", "review", {"tool": name})
            await security_event(self.db, "unauthorized_tool", "medium", f"{ctx.agent.name} ha tentato di usare {name}",
                                 actor=f"agente:{ctx.agent.id}", details={"task_id": str(task["id"]), "tool": name})
            return {"type": "tool_result", "tool_use_id": use["id"], "is_error": True,
                    "content": f"Strumento non autorizzato per {ctx.agent.name}: {name}"}
        await self.set_activity(task, tool.activity)
        try:
            args = tool.args.model_validate(raw)
        except ValidationError as e:
            errs = "; ".join(f"{'.'.join(map(str, x['loc']))}: {x['msg']}" for x in e.errors()[:8])
            await self.event(task, "tool_error", f"{name}: dati non validi", tool.activity, {"tool": name, "errors": errs})
            return {"type": "tool_result", "tool_use_id": use["id"], "is_error": True,
                    "content": json.dumps({"INVALID_INPUT": errs}, ensure_ascii=False)}
        found = scan_values(raw) if name != "submit_result" else []
        if found:
            await security_event(self.db, "prompt_injection", "medium" if name == "memory_save" else "low",
                                 f"Testo sospetto negli argomenti di {name}", actor=f"agente:{ctx.agent.id}",
                                 details={"task_id": str(task["id"]), "tool": name, "found": found})
            if name == "memory_save":
                return {"type": "tool_result", "tool_use_id": use["id"], "is_error": True,
                        "content": "Contenuto non salvato in memoria: contiene frasi che sembrano istruzioni per gli agenti. "
                                   "Salva solo fatti, con la fonte."}
        before = len(ctx.created)
        try:
            out = await tool.handler(ctx, args)
        except ToolError as e:
            await self.event(task, "tool_error", f"{name}: {e}", tool.activity, {"tool": name})
            return {"type": "tool_result", "tool_use_id": use["id"], "is_error": True, "content": str(e)}
        except Exception as e:
            log.exception("strumento %s", name)
            await self.event(task, "tool_error", f"{name}: errore interno", tool.activity, {"tool": name, "error": str(e)[:500]})
            return {"type": "tool_result", "tool_use_id": use["id"], "is_error": True,
                    "content": "Errore interno dello strumento: riprova più tardi o procedi senza"}
        created = ctx.created[before:]
        await self.event(task, "tool", f"{name}", tool.activity, {"tool": name, **({"created": created} if created else {})})
        body = as_json(out)
        if len(body) > MAX_RESULT_CHARS:
            body = body[:MAX_RESULT_CHARS] + "… [risultato troncato: restringi la ricerca]"
        return {"type": "tool_result", "tool_use_id": use["id"], "content": body}

    async def complete(self, task: dict, ctx: ToolContext, web_sources: list[dict]) -> str:
        result = dict(ctx.result or {})
        if web_sources:
            seen, uniq = set(), []
            for s in web_sources:
                if s["url"] not in seen:
                    seen.add(s["url"])
                    uniq.append(s)
            result["web_sources"] = uniq[:60]
        result["agent_id"] = ctx.agent.id
        result["task_id"] = str(task["id"])
        result["completed_at"] = datetime.now(timezone.utc).isoformat()
        status = "blocked" if result.get("status") == "blocked" else "completed"
        await self.event(task, "completed" if status == "completed" else "blocked", result.get("summary", "")[:1000], "reporting",
                         {"records": result.get("records", []), "approval_required": result.get("approval_required", False)})
        return await self.finish(task, status, result=result,
                                 error=None if status == "completed" else "L'agente non ha potuto completare: " + result.get("summary", "")[:500])


def stale_cutoff(seconds: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(seconds=seconds)
