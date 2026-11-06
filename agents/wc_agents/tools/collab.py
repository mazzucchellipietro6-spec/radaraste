"""Strumenti comuni: consegna del risultato, delega, note tra agenti, memoria, approvazioni."""

from __future__ import annotations

from typing import Literal

from pydantic import Field, field_validator

from ..db import jsonb
from .base import Args, DataStatus, ToolContext, ToolError, tool


class Fact(Args):
    fact: str
    source_ids: list[str] = Field(description="ID di record del gestionale o indirizzi web che provano il fatto")


class Estimate(Args):
    item: str
    value: str
    basis: str = Field(description="Come è stata ottenuta la stima")


class Impact(Args):
    amount: float | None = None
    currency: str = "EUR"
    data_status: DataStatus = "unknown"
    note: str = ""


class SubmitResult(Args):
    status: Literal["completed", "partial", "blocked"] = "completed"
    summary: str = Field(description="Sintesi per il fondatore o per chi ha delegato, in italiano")
    verified_facts: list[Fact] = []
    estimates: list[Estimate] = []
    assumptions: list[str] = []
    unknowns: list[str] = []
    risks: list[str] = []
    source_ids: list[str] = []
    financial_impact: Impact = Impact()
    approval_required: bool = False
    next_action: str = ""
    report: str = Field("", description="Rapporto completo in Markdown, se utile")

    @field_validator("verified_facts")
    @classmethod
    def facts_have_sources(cls, v: list[Fact]) -> list[Fact]:
        for f in v:
            if not [s for s in f.source_ids if s.strip()]:
                raise ValueError(f"il fatto «{f.fact[:60]}» è indicato come verificato ma non ha fonti: spostalo tra stime o ipotesi")
        return v


@tool("submit_result", "Consegna il risultato finale strutturato dell'incarico. Obbligatorio per concludere.", SubmitResult, "reporting")
async def submit_result(ctx: ToolContext, a: SubmitResult) -> dict:
    pending = await ctx.db.fetchone(
        "select count(*)::int as n from public.ai_tasks where parent_id = %s and status in ('queued', 'running', 'waiting')", (ctx.task["id"],)
    )
    if pending and pending["n"] > 0:
        raise ToolError(f"Ci sono ancora {pending['n']} incarichi delegati in corso: chiama wait_for_delegates e riprenderai con i loro risultati")
    ctx.result = a.model_dump()
    ctx.result["records"] = ctx.created
    ctx.finished = True
    return {"ok": True, "message": "Risultato registrato. L'incarico verrà chiuso."}


class Delegate(Args):
    agent_id: str
    title: str = Field(min_length=3, max_length=300)
    instructions: str = Field(min_length=10, max_length=12000, description="Cosa deve fare, con criteri di qualità e formato atteso")
    context: dict = Field(default_factory=dict, description="Dati da passare (per esempio ID di lead o fornitori)")
    after: list[str] = Field(default_factory=list, description="ID di incarichi delegati da completare prima (dipendenze)")
    priority: int = Field(5, ge=1, le=9)


@tool("delegate_task", "Assegna un incarico a un collega. Restituisce l'ID dell'incarico; usa 'after' per le dipendenze.", Delegate, "coordination")
async def delegate_task(ctx: ToolContext, a: Delegate) -> dict:
    allowed = ctx.agent.delegates(list(ctx.agents))
    if a.agent_id not in allowed:
        raise ToolError(f"Non puoi delegare a {a.agent_id}. Colleghi disponibili: {', '.join(allowed)}")
    settings = {r["key"]: r["value"] for r in await ctx.db.fetch("select key, value from public.ai_settings")}
    max_depth = int(settings.get("max_delegation_depth", {}).get("value", 3))
    max_children = int(settings.get("max_children_per_task", {}).get("value", 8))
    if ctx.task["depth"] + 1 > max_depth:
        raise ToolError(f"Limite di deleghe a catena raggiunto ({max_depth}): svolgi tu questa parte")
    n = await ctx.db.fetchone("select count(*)::int as n from public.ai_tasks where parent_id = %s", (ctx.task["id"],))
    if n and n["n"] >= max_children:
        raise ToolError(f"Hai già delegato {max_children} incarichi: è il massimo per un singolo incarico")
    known = {str(r["id"]) for r in await ctx.db.fetch("select id from public.ai_tasks where parent_id = %s", (ctx.task["id"],))}
    bad = [x for x in a.after if x not in known]
    if bad:
        raise ToolError(f"Dipendenze sconosciute: {bad}. Usa gli ID restituiti da delegate_task")
    root = ctx.task.get("root_id") or ctx.task["id"]
    row = await ctx.db.fetchone(
        """insert into public.ai_tasks (parent_id, root_id, agent_id, title, instructions, context, priority, depends_on, depth, created_by_agent)
           values (%s, %s, %s, %s, %s, %s, %s, %s::uuid[], %s, %s) returning id""",
        (ctx.task["id"], root, a.agent_id, a.title, a.instructions, jsonb(a.context), a.priority, a.after, ctx.task["depth"] + 1, ctx.agent.id),
        actor=ctx.actor,
    )
    tid = str(row["id"])
    ctx.delegated.append(tid)
    await ctx.db.execute(
        "insert into public.ai_task_events (task_id, agent_id, kind, activity, message, data) values (%s, %s, 'delegated', 'coordination', %s, %s)",
        (ctx.task["id"], ctx.agent.id, f"Delegato a {a.agent_id}: {a.title}", jsonb({"child": tid, "to": a.agent_id})),
    )
    return {"task_id": tid, "agent_id": a.agent_id, "status": "queued"}


class Wait(Args):
    note: str = Field("", description="Cosa farai quando i colleghi avranno finito")


@tool("wait_for_delegates", "Metti in pausa l'incarico finché i colleghi a cui hai delegato non hanno finito.", Wait, "coordination")
async def wait_for_delegates(ctx: ToolContext, a: Wait) -> dict:
    n = await ctx.db.fetchone("select count(*)::int as n from public.ai_tasks where parent_id = %s and status in ('queued', 'running', 'waiting')", (ctx.task["id"],))
    if not n or n["n"] == 0:
        raise ToolError("Non ci sono incarichi delegati in corso: concludi con submit_result")
    ctx.waiting = True
    return {"ok": True, "pending": n["n"], "message": "In attesa dei colleghi. Riprenderai con i loro risultati."}


class Note(Args):
    to_agent: str
    subject: str = Field(max_length=200)
    body: str = Field(max_length=6000)


@tool("send_note", "Lascia una nota a un collega: la leggerà all'inizio del suo prossimo incarico.", Note, "coordination")
async def send_note(ctx: ToolContext, a: Note) -> dict:
    if a.to_agent not in ctx.agents:
        raise ToolError("Agente sconosciuto")
    await ctx.db.execute(
        "insert into public.ai_messages (task_id, from_agent, to_agent, subject, body) values (%s, %s, %s, %s, %s)",
        (ctx.task["id"], ctx.agent.id, a.to_agent, a.subject, a.body),
    )
    return {"ok": True}


class MemorySearch(Args):
    query: str = Field(min_length=2)
    scope: Literal["mine", "shared", "all"] = "all"
    limit: int = Field(8, ge=1, le=20)


@tool("memory_search", "Cerca nella memoria tua e aziendale (fatti salvati in incarichi precedenti).", MemorySearch, "analysis")
async def memory_search(ctx: ToolContext, a: MemorySearch) -> dict:
    scope_sql = {"mine": "agent_id = %(agent)s", "shared": "agent_id is null", "all": "(agent_id = %(agent)s or agent_id is null)"}[a.scope]
    rows = await ctx.db.fetch(
        f"""select id, agent_id, topic, content, data_status, source, created_at from public.ai_memory
            where {scope_sql} and (expires_at is null or expires_at > now())
              and (search @@ plainto_tsquery('simple', %(q)s) or topic ilike %(like)s or content ilike %(like)s)
            order by pinned desc, created_at desc limit %(limit)s""",
        {"agent": ctx.agent.id, "q": a.query, "like": f"%{a.query}%", "limit": a.limit},
    )
    return {"results": rows}


class MemorySave(Args):
    topic: str = Field(min_length=2, max_length=200)
    content: str = Field(min_length=2, max_length=8000)
    data_status: DataStatus
    source: str = Field("", description="Fonte: ID di record o indirizzo web; obbligatoria per i dati verificati")
    shared: bool = Field(False, description="True per la memoria aziendale visibile a tutti gli agenti")


@tool("memory_save", "Salva un fatto o una decisione utile per incarichi futuri (memoria persistente).", MemorySave, "writing")
async def memory_save(ctx: ToolContext, a: MemorySave) -> dict:
    if a.data_status == "verified" and not a.source.strip():
        raise ToolError("Un dato verificato deve avere una fonte")
    row = await ctx.db.fetchone(
        "insert into public.ai_memory (agent_id, topic, content, data_status, source, task_id) values (%s, %s, %s, %s, %s, %s) returning id",
        (None if a.shared else ctx.agent.id, a.topic, a.content, a.data_status, a.source or None, ctx.task["id"]),
    )
    return {"id": str(row["id"])}


APPROVAL_KINDS = Literal["supplier_purchase", "payment", "contract", "financial_commitment", "binding_quote", "discount",
                         "stock_reservation", "legal", "outbound_message", "other"]


class Approval(Args):
    kind: APPROVAL_KINDS
    title: str = Field(max_length=200)
    summary: str = Field(description="Cosa si chiede di approvare, perché, rischi e alternative")
    amount: float | None = None
    currency: str | None = "EUR"
    payload: dict = Field(default_factory=dict, description="Dettagli necessari per eseguire l'azione dopo l'approvazione")


@tool("request_approval", "Chiede al fondatore di approvare un'azione vincolante. Non esegue l'azione.", Approval, "review")
async def request_approval(ctx: ToolContext, a: Approval) -> dict:
    return await create_approval(ctx, a.kind, a.title, a.summary, a.amount, a.currency, a.payload)


async def create_approval(ctx: ToolContext, kind: str, title: str, summary: str, amount, currency, payload: dict) -> dict:
    row = await ctx.db.fetchone(
        """insert into public.approvals (kind, title, summary, amount, currency, payload, requested_by_agent, task_id, expires_at)
           values (%s, %s, %s, %s, %s, %s, %s, %s, now() + interval '30 days') returning id, number""",
        (kind, title, summary, amount, currency, jsonb(payload), ctx.agent.id, ctx.task["id"]),
        actor=ctx.actor,
    )
    await ctx.db.execute(
        "insert into public.ai_task_events (task_id, agent_id, kind, activity, message, data) values (%s, %s, 'approval_requested', 'review', %s, %s)",
        (ctx.task["id"], ctx.agent.id, f"Richiesta approvazione {row['number']}: {title}", jsonb({"approval_id": str(row["id"])})),
    )
    ctx.note_created("approvals", row["id"], row["number"])
    return {"approval_id": str(row["id"]), "number": row["number"], "status": "pending",
            "message": "Richiesta inviata al fondatore. L'azione NON è stata eseguita: lo sarà solo dopo l'approvazione."}


class Empty(Args):
    pass


@tool("list_agents", "Elenco dei 20 agenti con ruolo, reparto e stato.", Empty, "coordination")
async def list_agents(ctx: ToolContext, a: Empty) -> dict:
    rows = await ctx.db.fetch("select id, name, title, department, enabled from public.ai_agents order by id")
    return {"agents": rows}


class ApprovalsList(Args):
    status: Literal["pending", "approved", "rejected", "executed", "failed", "expired", "any"] = "pending"
    limit: int = Field(20, ge=1, le=100)


@tool("approvals_list", "Elenco delle richieste di approvazione.", ApprovalsList, "review")
async def approvals_list(ctx: ToolContext, a: ApprovalsList) -> dict:
    rows = await ctx.db.fetch(
        """select id, number, kind, title, summary, amount, currency, status, requested_by_agent, decision_note, created_at
           from public.approvals where (%(s)s = 'any' or status = %(s)s) order by created_at desc limit %(l)s""",
        {"s": a.status, "l": a.limit},
    )
    return {"approvals": rows}


@tool("ai_stats", "Andamento degli agenti negli ultimi 30 giorni: incarichi, esiti e costi.", Empty, "analysis")
async def ai_stats(ctx: ToolContext, a: Empty) -> dict:
    rows = await ctx.db.fetch(
        """select a.id, a.name,
                  count(t.*) filter (where t.status = 'completed') as completed,
                  count(t.*) filter (where t.status = 'failed') as failed,
                  count(t.*) filter (where t.status = 'blocked') as blocked,
                  coalesce(sum(t.cost_usd), 0) as cost_usd
           from public.ai_agents a left join public.ai_tasks t on t.agent_id = a.id and t.created_at > now() - interval '30 days'
           group by a.id, a.name order by a.id"""
    )
    return {"agents": rows, "note": "Costi in dollari USA, dalle chiamate registrate in ai_usage"}
