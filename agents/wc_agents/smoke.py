"""Prima prova reale con Claude, a costo limitato (`python -m wc_agents smoke`).

Crea un piccolo incarico per il Business Intelligence Analyst (leggere il quadro aziendale e
riassumerlo), lo esegue subito con al massimo 4 passi e 0,50 USD di spesa e mostra esito, costo e
risultato. Serve a verificare chiave, modello, strumenti e registrazione dei costi prima di dare
lavoro vero agli agenti.
"""

from __future__ import annotations

from typing import Any

from .db import Database
from .llm import LLM
from .registry import AgentDef, sync_registry
from .runtime import AgentRuntime

SMOKE_AGENT = "19-business-intelligence"
SMOKE_TITLE = "Prova di collegamento a Claude"
SMOKE_INSTRUCTIONS = (
    "Questa è una prova tecnica del collegamento. Usa company_overview una sola volta e consegna con "
    "submit_result un riepilogo di al massimo tre righe di ciò che risulta nel gestionale. Non usare altri strumenti."
)


async def run_smoke(db: Database, settings: Any, agents: dict[str, AgentDef], llm: LLM) -> dict:
    await sync_registry(db, agents, settings.ai_model)
    task = await db.fetchone(
        """insert into public.ai_tasks (agent_id, title, instructions, priority, status, locked_by, locked_at, attempts, started_at, max_attempts)
           values (%s, %s, %s, 1, 'running', %s, now(), 1, now(), 1) returning *""",
        (SMOKE_AGENT, SMOKE_TITLE, SMOKE_INSTRUCTIONS, f"{settings.worker_id}-smoke"),
        actor="sistema:prova",
    )
    limited = settings.model_copy(update={"max_turns_per_task": 4, "max_cost_per_task_usd": 0.5})
    status = await AgentRuntime(db, limited, agents, llm).run(task)
    row = await db.fetchone(
        "select id, status, cost_usd, input_tokens, output_tokens, result_summary, error from public.ai_tasks where id = %s", (task["id"],)
    )
    calls = await db.fetchone("select count(*)::int as n, string_agg(distinct model, ', ') as models from public.ai_usage where task_id = %s", (task["id"],))
    return {"status": status, "task_id": str(row["id"]), "cost_usd": float(row["cost_usd"]), "input_tokens": row["input_tokens"],
            "output_tokens": row["output_tokens"], "summary": row["result_summary"], "error": row["error"],
            "calls": calls["n"] if calls else 0, "models": calls["models"] if calls else None}
