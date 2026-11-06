"""Orchestratore: coda degli incarichi nel database, esecuzione in parallelo, dipendenze, risveglio dei
genitori, incarichi bloccati da un servizio caduto, pianificazioni e battito cardiaco.

Più processi possono lavorare sulla stessa coda: ogni incarico si prende con FOR UPDATE SKIP LOCKED.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from . import __version__
from .approvals import ApprovalExecutor
from .db import Database, jsonb
from .llm import LLM
from .registry import AgentDef, sync_default_schedules, sync_registry
from .runtime import AgentRuntime

log = logging.getLogger("wc_agents.orchestrator")

CLAIM_SQL = """
with c as (
  select t.id from public.ai_tasks t
  join public.ai_agents a on a.id = t.agent_id
  where t.status = 'queued' and t.run_after <= now() and a.enabled and a.autonomy <> 'disabled'
    and not exists (select 1 from public.ai_tasks d where d.id = any (t.depends_on) and d.status <> 'completed')
  order by t.priority, t.created_at
  for update of t skip locked
  limit 1
)
update public.ai_tasks t set status = 'running', locked_by = %(w)s, locked_at = now(), attempts = t.attempts + 1,
  started_at = coalesce(t.started_at, now()), activity = 'analysis', error = null
from c where t.id = c.id
returning t.*
"""


class Orchestrator:
    def __init__(self, db: Database, settings: Any, agents: dict[str, AgentDef], llm: LLM | None, *, email_sender=None):
        self.db = db
        self.settings = settings
        self.agents = agents
        self.llm = llm
        self.runtime = AgentRuntime(db, settings, agents, llm)
        self.approvals = ApprovalExecutor(db, settings, sender=email_sender)
        self.worker_id = settings.worker_id
        self.wake = asyncio.Event()
        self.running: set[asyncio.Task] = set()
        self.stopping = False

    # ------------------------------------------------------------------ manutenzione della coda
    async def heartbeat(self) -> None:
        info = {"llm_configured": self.llm is not None, "model": self.settings.ai_model, "concurrency": self.settings.worker_concurrency,
                "running": len(self.running), "agents": len(self.agents), "env": self.settings.app_env}
        await self.db.execute(
            """insert into public.ai_runtime (id, version, info) values (%s, %s, %s)
               on conflict (id) do update set last_seen = now(), version = excluded.version, info = excluded.info""",
            (self.worker_id, __version__, jsonb(info)),
        )

    async def reclaim_stale(self) -> int:
        """Incarichi rimasti "in corso" su un servizio fermo o oltre il tempo massimo: si rimettono in coda."""
        rows = await self.db.fetch(
            """update public.ai_tasks t set
                 status = case when t.attempts >= t.max_attempts then 'failed' else 'queued' end,
                 error = 'Servizio agenti interrotto durante l''esecuzione', locked_by = null, locked_at = null, activity = null,
                 finished_at = case when t.attempts >= t.max_attempts then now() else null end,
                 run_after = now() + interval '30 seconds'
               where t.status = 'running' and (
                 t.locked_at < now() - make_interval(secs => %(timeout)s)
                 or (t.locked_by is distinct from %(w)s and not exists (
                       select 1 from public.ai_runtime r where r.id = t.locked_by and r.last_seen > now() - make_interval(secs => %(hb)s))))
               returning t.id, t.agent_id, t.status""",
            {"timeout": self.settings.lock_timeout_seconds, "w": self.worker_id, "hb": max(self.settings.heartbeat_seconds * 6, 60)},
        )
        for r in rows:
            await self.db.execute(
                "insert into public.ai_task_events (task_id, agent_id, kind, message) values (%s, %s, 'recovered', %s)",
                (r["id"], r["agent_id"], f"Incarico ripreso dopo un'interruzione del servizio (ora: {r['status']})"),
            )
        return len(rows)

    async def block_failed_dependencies(self) -> int:
        rows = await self.db.fetch(
            """update public.ai_tasks t set status = 'blocked', wait_reason = 'dependencies', finished_at = now(),
                 error = 'Un incarico da cui dipende non è stato completato'
               where t.status = 'queued' and exists (
                 select 1 from public.ai_tasks d where d.id = any (t.depends_on) and d.status in ('failed', 'cancelled', 'blocked'))
               returning t.id, t.agent_id"""
        )
        for r in rows:
            await self.db.execute(
                "insert into public.ai_task_events (task_id, agent_id, kind, message) values (%s, %s, 'blocked', %s)",
                (r["id"], r["agent_id"], "Bloccato: una dipendenza è fallita, annullata o bloccata"),
            )
        return len(rows)

    async def wake_parents(self) -> int:
        """Un incarico in attesa riparte (fase di sintesi) quando tutti i figli sono conclusi."""
        rows = await self.db.fetch(
            """update public.ai_tasks p set status = 'queued', phase = 'synthesis', wait_reason = null, run_after = now(),
                 attempts = 0
               where p.status = 'waiting' and p.wait_reason = 'children'
                 and not exists (select 1 from public.ai_tasks c where c.parent_id = p.id and c.status in ('queued', 'running', 'waiting'))
               returning p.id, p.agent_id"""
        )
        for r in rows:
            await self.db.execute(
                "insert into public.ai_task_events (task_id, agent_id, kind, activity, message) values (%s, %s, 'resumed', 'coordination', %s)",
                (r["id"], r["agent_id"], "I colleghi hanno finito: riprende con i loro risultati"),
            )
        if rows:
            self.wake.set()
        return len(rows)

    async def cancel_orphans(self) -> int:
        """Figli di un incarico annullato: annullati anche loro."""
        rows = await self.db.fetch(
            """update public.ai_tasks c set status = 'cancelled', finished_at = now(), error = 'Annullato insieme all''incarico principale'
               where c.status in ('queued', 'waiting', 'blocked') and exists (
                 select 1 from public.ai_tasks p where p.id = c.parent_id and p.status = 'cancelled')
               returning c.id"""
        )
        return len(rows)

    async def run_schedules(self) -> int:
        rows = await self.db.fetch(
            """with due as (
                 select s.id from public.ai_schedules s join public.ai_agents a on a.id = s.agent_id
                 where s.enabled and s.next_run_at <= now() and a.enabled for update of s skip locked)
               update public.ai_schedules s set next_run_at = now() + make_interval(hours => s.every_hours)
               from due where s.id = due.id
               returning s.id, s.agent_id, s.title, s.instructions"""
        )
        for s in rows:
            await self.db.execute(
                """insert into public.ai_tasks (agent_id, title, instructions, context, priority)
                   values (%s, %s, %s, %s, 6)""",
                (s["agent_id"], s["title"][:300], s["instructions"], jsonb({"schedule_id": str(s["id"]), "scheduled": True})),
                actor="sistema:pianificazione",
            )
        if rows:
            self.wake.set()
        return len(rows)

    async def maintenance(self) -> None:
        await self.heartbeat()
        await self.reclaim_stale()
        await self.cancel_orphans()
        await self.block_failed_dependencies()
        await self.wake_parents()
        await self.run_schedules()
        await self.approvals.run_once()

    # ------------------------------------------------------------------ esecuzione
    async def claim(self) -> dict | None:
        if self.llm is None:
            return None  # senza chiave gli incarichi restano in coda: la sede mostra gli agenti come non collegati
        return await self.db.fetchone(CLAIM_SQL, {"w": self.worker_id})

    async def execute(self, task: dict) -> None:
        try:
            status = await self.runtime.run(task)
            log.info("incarico %s (%s): %s", task["id"], task["agent_id"], status)
        finally:
            await self.wake_parents()
            self.wake.set()

    async def fill(self) -> int:
        started = 0
        while not self.stopping and len(self.running) < self.settings.worker_concurrency:
            task = await self.claim()
            if not task:
                break
            t = asyncio.create_task(self.execute(task))
            self.running.add(t)
            t.add_done_callback(self.running.discard)
            started += 1
        return started

    async def run_until_idle(self, max_rounds: int = 200) -> None:
        """Per i test e per l'esecuzione una tantum: lavora finché la coda non è vuota."""
        for _ in range(max_rounds):
            await self.maintenance()
            await self.fill()
            if self.running:
                await asyncio.wait(set(self.running))
                continue
            await self.maintenance()
            if not await self.db.fetchone(
                "select 1 from public.ai_tasks where status = 'queued' and run_after <= now() limit 1"
            ) or self.llm is None:
                return

    async def listen(self) -> None:
        while not self.stopping:
            try:
                conn = await self.db.listen_connection()
                async with conn:
                    await conn.execute("listen ai_tasks")
                    async for note in conn.notifies():
                        try:
                            payload = json.loads(note.payload)
                        except json.JSONDecodeError:
                            payload = {}
                        if payload.get("status") in ("queued", "cancelled", "completed", "failed", "blocked"):
                            self.wake.set()
                        if self.stopping:
                            break
            except Exception as e:  # connessione persa: si riprova
                log.warning("LISTEN interrotto (%s): riprovo tra 5 s", e)
                await asyncio.sleep(5)

    async def serve(self) -> None:
        await sync_registry(self.db, self.agents, self.settings.ai_model)
        await sync_default_schedules(self.db, self.settings.config_dir)
        log.info("servizio agenti %s avviato: %d agenti, modello predefinito %s, chiave Claude %s", self.worker_id, len(self.agents),
                 self.settings.ai_model, "configurata" if self.llm else "NON configurata")
        listener = asyncio.create_task(self.listen())
        last_maint = 0.0
        loop = asyncio.get_running_loop()
        try:
            while not self.stopping:
                now = loop.time()
                if now - last_maint >= self.settings.heartbeat_seconds:
                    try:
                        await self.maintenance()
                    except Exception:
                        log.exception("manutenzione")
                    last_maint = now
                try:
                    await self.fill()
                except Exception:
                    log.exception("presa in carico")
                self.wake.clear()
                try:
                    await asyncio.wait_for(self.wake.wait(), timeout=self.settings.poll_seconds)
                except asyncio.TimeoutError:
                    pass
        finally:
            listener.cancel()
            if self.running:
                await asyncio.wait(set(self.running), timeout=30)
            await self.db.execute("delete from public.ai_runtime where id = %s", (self.worker_id,))

    def stop(self) -> None:
        self.stopping = True
        self.wake.set()
