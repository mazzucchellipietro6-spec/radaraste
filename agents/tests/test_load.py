"""Carico e concorrenza: due servizi agenti sulla stessa coda (come due processi in produzione).
Ogni incarico deve essere eseguito una sola volta, nessuno perso, nessun doppione."""

from __future__ import annotations

import asyncio
import time

from wc_agents.orchestrator import Orchestrator

from .fake_llm import FakeLLM, tool_use

N = 150


async def test_two_workers_share_the_queue_without_duplicates(clean, settings, agents):
    await clean.execute(
        """insert into public.ai_tasks (agent_id, title, instructions)
           select '19-business-intelligence', 'Incarico di carico ' || g, 'Riepilogo' from generate_series(1, %s) g""", (N,))
    await clean.execute("update public.ai_agents set daily_task_limit = 1000 where id = '19-business-intelligence'")

    def script(call):
        return [tool_use("submit_result", summary="ok")]

    s1 = settings.model_copy(update={"worker_id": "carico-1", "worker_concurrency": 8})
    s2 = settings.model_copy(update={"worker_id": "carico-2", "worker_concurrency": 8})
    llm1, llm2 = FakeLLM({"Business Intelligence Analyst": script}), FakeLLM({"Business Intelligence Analyst": script})
    t0 = time.monotonic()
    await asyncio.gather(Orchestrator(clean.agent, s1, agents, llm1).run_until_idle(max_rounds=500),
                         Orchestrator(clean.agent, s2, agents, llm2).run_until_idle(max_rounds=500))
    elapsed = time.monotonic() - t0
    done = await clean.fetchone("select count(*)::int as n from public.ai_tasks where status = 'completed'")
    dup = await clean.fetchone(
        """select count(*)::int as n from (select task_id from public.ai_task_events where kind = 'started' group by task_id having count(*) > 1) d""")
    assert done["n"] == N, f"completati {done['n']} di {N}"
    assert dup["n"] == 0, "incarichi eseguiti due volte"
    assert len(llm1.calls) + len(llm2.calls) == N
    assert len(llm1.calls) > 0 and len(llm2.calls) > 0, "un servizio non ha lavorato"
    print(f"\n{N} incarichi in {elapsed:.1f} s ({N / elapsed:.0f}/s) — servizio 1: {len(llm1.calls)}, servizio 2: {len(llm2.calls)}")
