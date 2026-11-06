"""Regole del runtime: strumenti autorizzati, validazione, budget, tentativi, risultato obbligatorio, servizio senza chiave."""

from __future__ import annotations

from wc_agents.orchestrator import Orchestrator

from .conftest import new_task
from .fake_llm import FakeLLM, last_tool_results, text, tool_use, transient


async def run(db, settings, agents, scripts):
    llm = FakeLLM(scripts)
    await Orchestrator(db, settings, agents, llm).run_until_idle()
    return llm


async def status(db, tid):
    return await db.fetchone("select status, error, attempts, result from public.ai_tasks where id = %s", (tid,))


async def test_unauthorized_tool_is_refused(clean, settings, agents):
    def content(call):
        if call.turn == 1:
            return [tool_use("lead_save", company_name="X", source_url="https://x.example", data_status="unknown")]
        r = last_tool_results(call)[0]
        assert r["is_error"] and "non autorizzato" in r["content"]
        return [tool_use("submit_result", summary="Fatto senza strumenti non miei")]

    tid = await new_task(clean, "07-content-creator", "Articolo sul Calacatta")
    await run(clean, settings, agents, {"Content Creator": content})
    assert (await status(clean, tid))["status"] == "completed"
    assert await clean.fetchone("select 1 from public.ai_task_events where task_id = %s and kind = 'unauthorized_tool'", (tid,))
    assert not await clean.fetchone("select 1 from public.leads")


async def test_verified_fact_without_source_is_rejected(clean, settings, agents):
    def bi(call):
        if call.turn == 1:
            return [tool_use("submit_result", summary="x", verified_facts=[{"fact": "Ricavi a 50.000 €", "source_ids": []}])]
        r = last_tool_results(call)[0]
        assert r["is_error"] and "INVALID_INPUT" in r["content"]
        return [tool_use("submit_result", summary="Ricavi sconosciuti", unknowns=["Ricavi del mese"])]

    tid = await new_task(clean, "19-business-intelligence", "Report mensile")
    await run(clean, settings, agents, {"Business Intelligence Analyst": bi})
    st = await status(clean, tid)
    assert st["status"] == "completed" and st["result"]["unknowns"] == ["Ricavi del mese"]


async def test_monthly_budget_blocks_without_calling_the_model(clean, settings, agents):
    await clean.execute("insert into public.ai_usage (agent_id, model, cost_usd) values ('05-crm-follow-up', 'claude-opus-5-5', 50)")
    tid = await new_task(clean, "05-crm-follow-up", "Follow-up")
    llm = await run(clean, settings, agents, {})
    st = await status(clean, tid)
    assert st["status"] == "blocked" and "Budget mensile" in st["error"] and not llm.calls


async def test_company_daily_cap(clean, settings, agents):
    await clean.execute("""update public.ai_settings set value = '{"amount": 1}' where key = 'daily_budget_usd'""")
    await clean.execute("insert into public.ai_usage (agent_id, model, cost_usd) values ('01-ai-ceo', 'claude-opus-5-5', 1.5)")
    tid = await new_task(clean, "13-pricing-manager", "Listino")
    await run(clean, settings, agents, {})
    assert "giornaliero" in (await status(clean, tid))["error"]


async def test_transient_error_is_retried(clean, settings, agents):
    calls = {"n": 0}

    def pm(call):
        calls["n"] += 1
        if calls["n"] == 1:
            return transient()
        return [tool_use("submit_result", summary="Listino pronto")]

    tid = await new_task(clean, "13-pricing-manager", "Listino")
    llm = FakeLLM({"Pricing Manager": pm})
    orch = Orchestrator(clean, settings, agents, llm)
    await orch.run_until_idle()
    st = await status(clean, tid)
    assert st["status"] == "queued" and "temporaneo" in st["error"]
    await clean.execute("update public.ai_tasks set run_after = now() where id = %s", (tid,))
    await orch.run_until_idle()
    st = await status(clean, tid)
    assert st["status"] == "completed" and st["attempts"] == 2


async def test_task_without_result_fails(clean, settings, agents):
    tid = await new_task(clean, "16-customer-success", "Risposta al cliente")
    await run(clean, settings, agents, {"Customer Success Agent": lambda c: [text("Ho finito, credo.")]})
    st = await status(clean, tid)
    assert st["status"] == "failed" and "submit_result" in st["error"]


async def test_without_api_key_tasks_wait_and_agents_are_not_connected(clean, settings, agents):
    tid = await new_task(clean, "01-ai-ceo", "Strategia")
    orch = Orchestrator(clean, settings, agents, None)
    await orch.run_until_idle()
    assert (await status(clean, tid))["status"] == "queued"
    rt = await clean.fetchone("select info from public.ai_runtime where id = %s", (settings.worker_id,))
    assert rt["info"]["llm_configured"] is False


async def test_disabled_agent_is_not_picked(clean, settings, agents):
    await clean.execute("update public.ai_agents set enabled = false where id = '09-advertising-agent'")
    tid = await new_task(clean, "09-advertising-agent", "Campagna")
    await run(clean, settings, agents, {})
    assert (await status(clean, tid))["status"] == "queued"


async def test_stale_task_of_dead_worker_is_recovered(clean, settings, agents):
    tid = await new_task(clean, "15-order-manager", "Ordini aperti")
    await clean.execute("update public.ai_tasks set status = 'running', locked_by = 'morto', locked_at = now(), attempts = 1 where id = %s", (tid,))
    orch = Orchestrator(clean, settings, agents, None)
    assert await orch.reclaim_stale() == 1
    assert (await status(clean, tid))["status"] == "queued"


async def test_failed_dependency_blocks(clean, settings, agents):
    a = await new_task(clean, "14-logistics-manager", "Quotazione trasporto")
    b = await new_task(clean, "15-order-manager", "Ordine")
    await clean.execute("update public.ai_tasks set status = 'failed' where id = %s", (a,))
    await clean.execute("update public.ai_tasks set depends_on = array[%s::uuid] where id = %s", (a, b))
    await Orchestrator(clean, settings, agents, None).block_failed_dependencies()
    assert (await status(clean, b))["status"] == "blocked"


async def test_delegation_outside_allowed_colleagues(clean, settings, agents):
    def mkt(call):
        if call.turn == 1:
            return [tool_use("delegate_task", agent_id="18-cfo", title="Budget", instructions="Calcola il budget marketing")]
        r = last_tool_results(call)[0]
        assert r["is_error"] and "Non puoi delegare" in r["content"]
        return [tool_use("submit_result", summary="Non delegabile")]

    tid = await new_task(clean, "06-marketing-director", "Piano marketing")
    await run(clean, settings, agents, {"Marketing Director": mkt})
    assert (await status(clean, tid))["status"] == "completed"
    assert not await clean.fetchone("select 1 from public.ai_tasks where parent_id = %s", (tid,))


async def test_cfo_collaborates_with_advisory_team(clean, settings, agents):
    def cfo(call):
        if "FASE DI SINTESI" in call.messages[0]["content"]:
            return [tool_use("submit_result", summary="Sintesi con analisi del commercialista AI")]
        if call.turn == 1:
            return [tool_use("delegate_task", agent_id="25-tax-accounting-advisor", title="Imposte trimestre",
                             instructions="Stima le imposte del trimestre separando effettivo, stime e simulazioni")]
        return [tool_use("wait_for_delegates")]

    def taxa(call):
        if call.turn == 1:
            return [tool_use("finance_summary")]
        return [tool_use("submit_result", summary="Nessun ricavo registrato: imposte non stimabili", unknowns=["Ricavi"])]

    tid = await new_task(clean, "18-cfo", "Chiusura trimestre")
    await run(clean, settings, agents, {"CFO / Controller": cfo, "Tax & Accounting Advisor": taxa})
    rows = await clean.fetch("select agent_id, status from public.ai_tasks order by created_at")
    assert [(r["agent_id"], r["status"]) for r in rows] == [("18-cfo", "completed"), ("25-tax-accounting-advisor", "completed")]
