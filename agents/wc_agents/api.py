"""API del servizio agenti (FastAPI).

- GET  /health                 stato del servizio (pubblico, senza dati aziendali)
- GET  /agents                 agenti con stato reale            (Authorization: Bearer AGENTS_API_TOKEN)
- POST /tasks                  nuovo incarico                    (idem)
- GET  /tasks/{id}             incarico con eventi e figli       (idem)
- POST /tasks/{id}/cancel      annulla                           (idem)
- POST /tasks/{id}/retry       rimette in coda un incarico fallito o bloccato
- WS   /ws/events?token=...    eventi in tempo reale; token firmato dal pannello con AGENTS_WS_SECRET

Il pannello del sito normalmente scrive direttamente nel database con l'identità dell'utente (RLS):
questa API serve per integrazioni da server a server e per il flusso di eventi in tempo reale.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from . import __version__
from .config import Settings, get_settings
from .db import Database, jsonb
from .llm import ClaudeLLM
from .orchestrator import Orchestrator
from .registry import load_registry

log = logging.getLogger("wc_agents.api")


def ws_token(secret: str, ttl: int = 600, now: float | None = None) -> str:
    exp = int((now or time.time()) + ttl)
    sig = hmac.new(secret.encode(), str(exp).encode(), hashlib.sha256).hexdigest()
    return f"{exp}.{sig}"


def check_ws_token(secret: str | None, token: str | None, now: float | None = None) -> bool:
    if not secret or not token or "." not in token:
        return False
    exp_s, sig = token.split(".", 1)
    if not exp_s.isdigit():
        return False
    exp = int(exp_s)
    t = now or time.time()
    if exp < t or exp > t + 3600:
        return False
    good = hmac.new(secret.encode(), exp_s.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(good, sig)


class NewTask(BaseModel):
    agent_id: str
    title: str = Field(min_length=3, max_length=300)
    instructions: str = Field(min_length=1, max_length=20000)
    context: dict = Field(default_factory=dict)
    priority: int = Field(5, ge=1, le=9)
    created_by: str | None = Field(None, description="ID dell'utente del pannello che assegna l'incarico")


AGENT_STATE_SQL = """
select a.id, a.name, a.department, a.team, a.title, a.enabled, a.model, a.effort, a.monthly_budget_usd,
       (select json_build_object('id', t.id, 'title', t.title, 'activity', t.activity, 'started_at', t.started_at)
          from public.ai_tasks t where t.agent_id = a.id and t.status = 'running' order by t.started_at desc limit 1) as running,
       (select count(*) from public.ai_tasks t where t.agent_id = a.id and t.status = 'queued')::int as queued,
       (select count(*) from public.ai_tasks t where t.agent_id = a.id and t.status = 'waiting')::int as waiting,
       (select coalesce(sum(u.cost_usd), 0) from public.ai_usage u where u.agent_id = a.id and u.at >= date_trunc('month', now())) as cost_month
from public.ai_agents a order by a.id
"""


def create_app(settings: Settings | None = None, *, db: Database | None = None, llm=None, run_worker: bool = True,
               email_sender=None) -> FastAPI:
    settings = settings or get_settings()
    state: dict[str, Any] = {}

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        database = db or Database(settings.database_url, max_size=settings.worker_concurrency + 6)
        await database.open()
        agents = load_registry(settings.config_dir)
        model = llm if llm is not None else (ClaudeLLM(settings.anthropic_api_key) if settings.llm_configured else None)
        orch = Orchestrator(database, settings, agents, model, email_sender=email_sender)
        state.update(db=database, agents=agents, orch=orch)
        worker = asyncio.create_task(orch.serve()) if run_worker else None
        if not run_worker:
            from .registry import sync_registry
            await sync_registry(database, agents, settings.ai_model)
        try:
            yield
        finally:
            orch.stop()
            if worker:
                try:
                    await asyncio.wait_for(worker, timeout=40)
                except (asyncio.TimeoutError, Exception):
                    worker.cancel()
            if db is None:
                await database.close()

    app = FastAPI(title="WHITE CARRARA — servizio agenti", version=__version__, lifespan=lifespan,
                  docs_url="/docs" if settings.app_env != "production" else None, redoc_url=None)

    async def auth(authorization: str | None = Header(None)) -> None:
        if not settings.agents_api_token:
            raise HTTPException(503, "AGENTS_API_TOKEN non configurato: API disattivata")
        expected = f"Bearer {settings.agents_api_token}"
        if not authorization or not hmac.compare_digest(authorization.encode(), expected.encode()):
            raise HTTPException(401, "Non autorizzato")

    @app.get("/health")
    async def health() -> dict:
        ok = True
        try:
            await state["db"].fetchone("select 1 as ok")
        except Exception:
            ok = False
        orch: Orchestrator = state["orch"]
        return {"ok": ok, "version": __version__, "worker_id": orch.worker_id, "llm_configured": orch.llm is not None,
                "agents": len(state["agents"]), "running": len(orch.running)}

    @app.get("/agents", dependencies=[Depends(auth)])
    async def agents() -> dict:
        return {"agents": await state["db"].fetch(AGENT_STATE_SQL)}

    @app.post("/tasks", dependencies=[Depends(auth)], status_code=201)
    async def create_task(t: NewTask) -> dict:
        if t.agent_id not in state["agents"]:
            raise HTTPException(404, "Agente sconosciuto")
        row = await state["db"].fetchone(
            """insert into public.ai_tasks (agent_id, title, instructions, context, priority, created_by)
               values (%s, %s, %s, %s, %s, %s) returning id, status""",
            (t.agent_id, t.title, t.instructions, jsonb(t.context), t.priority, t.created_by),
            actor="api:agenti",
        )
        state["orch"].wake.set()
        return {"id": str(row["id"]), "status": row["status"]}

    @app.get("/tasks/{task_id}", dependencies=[Depends(auth)])
    async def get_task(task_id: str) -> dict:
        db_: Database = state["db"]
        try:
            task = await db_.fetchone("select * from public.ai_tasks where id = %s::uuid", (task_id,))
        except Exception:
            task = None
        if not task:
            raise HTTPException(404, "Incarico non trovato")
        events = await db_.fetch("select id, kind, activity, message, data, at from public.ai_task_events where task_id = %s order by id", (task_id,))
        children = await db_.fetch(
            "select id, agent_id, title, status, result_summary, error, cost_usd from public.ai_tasks where parent_id = %s order by created_at", (task_id,))
        return {"task": task, "events": events, "children": children}

    @app.post("/tasks/{task_id}/cancel", dependencies=[Depends(auth)])
    async def cancel(task_id: str) -> dict:
        row = await state["db"].fetchone(
            """update public.ai_tasks set status = 'cancelled', finished_at = now()
               where id = %s::uuid and status in ('queued', 'running', 'waiting', 'blocked') returning id""",
            (task_id,), actor="api:agenti")
        if not row:
            raise HTTPException(409, "Incarico non annullabile")
        return {"ok": True}

    @app.post("/tasks/{task_id}/retry", dependencies=[Depends(auth)])
    async def retry(task_id: str) -> dict:
        row = await state["db"].fetchone(
            """update public.ai_tasks set status = 'queued', attempts = 0, run_after = now(), error = null, wait_reason = null,
                 finished_at = null where id = %s::uuid and status in ('failed', 'blocked') returning id""",
            (task_id,), actor="api:agenti")
        if not row:
            raise HTTPException(409, "Si possono rimettere in coda solo incarichi falliti o bloccati")
        state["orch"].wake.set()
        return {"ok": True}

    @app.websocket("/ws/events")
    async def events(ws: WebSocket, token: str | None = None) -> None:
        if not check_ws_token(settings.agents_ws_secret, token):
            await ws.close(code=4401)
            return
        await ws.accept()
        conn = await state["db"].listen_connection()
        try:
            async with conn:
                await conn.execute("listen ai_events")
                await conn.execute("listen ai_tasks")
                await ws.send_json({"type": "hello", "llm_configured": state["orch"].llm is not None})
                async for note in conn.notifies():
                    try:
                        payload = json.loads(note.payload)
                    except json.JSONDecodeError:
                        continue
                    await ws.send_json({"type": "event" if note.channel == "ai_events" else "task", **payload})
        except (WebSocketDisconnect, RuntimeError):
            pass

    return app
