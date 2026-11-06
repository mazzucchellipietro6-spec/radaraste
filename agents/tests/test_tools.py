"""Strumenti: pricing (casi condivisi con il pannello), IVA, finanza, redditività, documenti advisory, automazioni."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from wc_agents import pricing
from wc_agents.orchestrator import Orchestrator
from wc_agents.tools import TOOLS, ToolContext, ToolError
from wc_agents.tools.advisory import TaxSim, vat_treatment
from wc_agents.tools.sales import dedupe_key

from .conftest import new_task

CASES = json.loads((Path(__file__).resolve().parents[2] / "tests/fixtures/pricing-cases.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_pricing_cases(case):
    out = pricing.simulate(case["model"], case["inputs"])
    for k, v in case["expect"].items():
        if isinstance(v, dict):
            for kk, vv in v.items():
                assert out[k][kk] == vv, (k, kk)
        else:
            assert out[k] == v, k


def test_pricing_refuses_missing_cost():
    with pytest.raises(pricing.PricingError):
        pricing.simulate("resale", {"quantity": {"value": 10, "status": "verified"}, "target_margin_rate": {"value": 20, "status": "assumed"}})


def test_dedupe_key():
    assert dedupe_key("Gulf Stone LLC", "https://www.GulfStone.example/about", "AE") == "gulfstone.example"
    assert dedupe_key("Gulf Stone LLC", None, "ae") == "gulf-stone|AE"


@pytest.mark.parametrize("inp,code,rate", [
    (dict(model="resale", amount=100, customer_country="IT"), "imponibile", 22),
    (dict(model="resale", amount=100, customer_country="DE", customer_vat_valid_vies=True), "non_imponibile_intra_ue", 0),
    (dict(model="resale", amount=100, customer_country="DE"), "da_determinare", None),
    (dict(model="resale", amount=100, customer_country="FR", customer_type="consumer"), "vendita_a_distanza_ue", None),
    (dict(model="resale", amount=100, customer_country="AE", goods_leave_eu=True), "non_imponibile_export", 0),
    (dict(model="resale", amount=100, customer_country="AE", goods_leave_eu=False), "imponibile", 22),
    (dict(model="brokerage", amount=100, customer_country="ES"), "non_soggetta_art7ter", 0),
    (dict(model="brokerage", amount=100, customer_country="US"), "non_soggetta_art7ter", 0),
    (dict(model="brokerage", amount=100, customer_country="IT"), "imponibile", 22),
    (dict(model="brokerage", amount=100, customer_country="IT", intermediated_goods_exported=True), "possibile_non_imponibile_art9", 0),
])
def test_vat_treatment(inp, code, rate):
    t = vat_treatment(TaxSim(**inp), 22)
    assert t["code"] == code and t["rate"] == rate and t["references_to_verify"]


def ctx_for(db, settings, agents, agent_id, task_id):
    return ToolContext(db=db, settings=settings, agent=agents[agent_id], task={"id": task_id, "depth": 0, "agent_id": agent_id}, agents=agents)


async def call(ctx, name, **kw):
    t = TOOLS[name]
    return await t.handler(ctx, t.args.model_validate(kw))


async def seed_business(db):
    sup = await db.fetchone("insert into public.suppliers (name) values ('Fornitore di prova') returning id")
    q = await db.fetchone("insert into public.quotes (customer_name, model, status, total, sent_at) values ('Cliente', 'trading', 'accepted', 10000, now() - interval '3 days') returning id")
    await db.execute("""insert into public.quote_items (quote_id, marble_slug, description, quantity, unit_price) values
                        (%s, 'calacatta', 'Calacatta', 40, 200), (%s, 'statuario', 'Statuario', 10, 200)""", (q["id"], q["id"]))
    d1 = await db.fetchone(
        """insert into public.deals (model, title, quote_id, supplier_id, stage, sale_amount, purchase_cost, logistics_cost)
           values ('trading', 'Vendita Calacatta', %s, %s, 'closed_won', 10000, 6000, 1000) returning id""", (q["id"], sup["id"]))
    await db.execute("insert into public.orders (deal_id, quote_id, customer_name, total, status) values (%s, %s, 'Cliente', 10000, 'confirmed')", (d1["id"], q["id"]))
    d2 = await db.fetchone(
        """insert into public.deals (model, title, supplier_id, stage, deal_value, commission_percent)
           values ('brokerage', 'Intermediazione Statuario', %s, 'agreed', 50000, 3) returning id""", (sup["id"],))
    await db.execute("insert into public.commissions (deal_id, amount, status, due_date) values (%s, 1500, 'invoiced', current_date)", (d2["id"],))


async def test_finance_and_profitability_keep_models_separate(clean, settings, agents):
    await seed_business(clean)
    tid = await new_task(clean, "23-business-analyst", "Redditività")
    ctx = ctx_for(clean, settings, agents, "23-business-analyst", tid)
    fin = await call(ctx, "finance_summary")
    assert fin["resale"]["revenue_eur"] == 10000 and fin["resale"]["gross_margin_known_eur"] == 3000
    assert fin["brokerage"]["commission_revenue_eur"] == 1500
    assert fin["revenue_total_eur"] == 11500 and fin["target"]["gap_eur"] == 18500
    assert float(fin["brokerage"]["gmv_intermediated"][0]["gmv"]) == 50000  # valore intermediato: separato, non ricavo
    prof = await call(ctx, "profitability_analysis", months=12)
    assert prof["by_model"]["trading"]["revenue"] == 10000 and prof["by_model"]["trading"]["margin_rate_known"] == 30.0
    assert prof["by_model"]["brokerage"]["revenue"] == 1500 and prof["by_model"]["brokerage"]["gmv_intermediated"] == 50000
    cal = next(s for s in prof["by_marble"] if s["marble"] == "calacatta")
    assert cal["revenue"] == 8000 and cal["margin_known"] == 2400
    hist = await call(ctx, "revenue_history", months=3)
    assert hist["months"][-1]["total_revenue"] == 11500 and hist["basis"] == "actual"
    fc = await call(ctx, "revenue_forecast", months_ahead=2)
    assert fc["basis"] == "estimate" and fc["commission_rate_used"] == 3.0 and len(fc["months"]) == 2
    perf = await call(ctx, "sales_performance", days=30)
    assert perf["quote_acceptance_rate"]["value"] == 100.0
    pm = await call(ctx, "process_metrics", days=30)
    assert pm["lead_times"]["request_to_quote"]["data_status"] == "unknown"  # nessun dato: non inventato
    assert pm["backlog"]["approvals_pending"] == 0
    ov = await call(ctx, "company_overview")
    assert ov["counts"]["orders_open"] == 1


async def test_advisory_documents_rules(clean, settings, agents):
    tid = await new_task(clean, "25-tax-accounting-advisor", "Cash flow")
    ctx = ctx_for(clean, settings, agents, "25-tax-accounting-advisor", tid)
    with pytest.raises(ToolError, match="effettivi ma senza fonte"):
        await call(ctx, "tax_doc_save", kind="cash_flow_forecast", title="Cash flow Q1", body="x" * 60,
                   figures=[{"label": "Incassi", "value": 1000, "basis": "actual"}], points_to_verify=["Saldo banca"])
    with pytest.raises(ToolError, match="fonti normative"):
        await call(ctx, "tax_doc_save", kind="vat_analysis", title="IVA", body="x" * 60,
                   figures=[{"label": "IVA", "value": 0, "basis": "simulation"}], points_to_verify=["Regime"])
    out = await call(ctx, "tax_doc_save", kind="cash_flow_forecast", title="Cash flow Q1", body="x" * 60,
                     figures=[{"label": "Incassi", "value": 1000, "basis": "actual", "source": "revenue_history 2026-11"},
                              {"label": "Pagamenti fornitori", "value": 600, "basis": "estimate"}], points_to_verify=["Saldo banca"])
    doc = await clean.fetchone("select category, review_required, figures from public.advisory_documents where id = %s", (out["id"],))
    assert doc["category"] == "tax" and doc["review_required"] and doc["figures"][1]["basis"] == "estimate"
    lctx = ctx_for(clean, settings, agents, "24-legal-counsel", tid)
    with pytest.raises(Exception):  # senza fonti normative: rifiutato già dallo schema
        await call(lctx, "legal_doc_save", kind="legal_memo", title="Privacy", body="y" * 60, jurisdiction="Italia",
                   applicable_law="GDPR", sources=[], points_to_verify=["DPO"])
    sim = await call(ctx, "tax_simulate", model="brokerage", amount=1500, customer_country="DE", cost_amount=200)
    assert sim["vat"]["code"] == "non_soggetta_art7ter" and sim["income_taxes_estimate"]["basis"] == "simulation"
    assert sim["parameters"]["status"] == "assumed"


async def test_proposed_automation_runs_only_after_activation(clean, settings, agents):
    tid = await new_task(clean, "22-business-process-engineer", "Automazioni")
    ctx = ctx_for(clean, settings, agents, "22-business-process-engineer", tid)
    out = await call(ctx, "schedule_propose", agent_id="05-crm-follow-up", title="Follow-up settimanale",
                     instructions="Controlla i follow-up scaduti e prepara le bozze", every_hours=168,
                     reason="Oggi i follow-up scaduti si accumulano senza un controllo periodico")
    assert out["enabled"] is False
    orch = Orchestrator(clean, settings, agents, None)
    await clean.execute("update public.ai_schedules set next_run_at = now() - interval '1 minute'")
    assert await orch.run_schedules() == 0
    await clean.execute("update public.ai_schedules set enabled = true")
    assert await orch.run_schedules() == 1
    t = await clean.fetchone("select agent_id, context from public.ai_tasks where agent_id = '05-crm-follow-up'")
    assert t["context"]["schedule_id"] == out["id"]
    assert await orch.run_schedules() == 0  # prossima esecuzione tra una settimana


def test_registry_has_25_agents_and_advisory_department(agents):
    assert len(agents) == 25
    adv = {a.id: a for a in agents.values() if a.department == "advisory"}
    assert sorted(adv) == ["21-operations-manager", "22-business-process-engineer", "23-business-analyst", "24-legal-counsel",
                           "25-tax-accounting-advisor"]
    assert adv["24-legal-counsel"].team == "Avvocato aziendale AI" and adv["25-tax-accounting-advisor"].team == "Commercialista AI"
    for a in agents.values():
        assert a.prompt.strip() and "submit_result" in a.tools
        for t in a.tools:
            assert t in TOOLS or t in ("web_search", "web_fetch"), (a.id, t)
    # collaborazione: CEO, CFO, Pricing, Export, Compliance possono coinvolgere il nuovo reparto
    ids = list(agents)
    assert "24-legal-counsel" in agents["01-ai-ceo"].delegates(ids)
    assert "25-tax-accounting-advisor" in agents["18-cfo"].delegates(ids)
    assert "25-tax-accounting-advisor" in agents["13-pricing-manager"].delegates(ids)
    assert "24-legal-counsel" in agents["04-export-manager"].delegates(ids)
    assert "24-legal-counsel" in agents["20-compliance-risk"].delegates(ids)
    assert "14-logistics-manager" in agents["21-operations-manager"].delegates(ids)
    for aid, words in (("24-legal-counsel", "NON sei un avvocato abilitato"), ("25-tax-accounting-advisor", "NON sei un commercialista abilitato")):
        assert words in " ".join(agents[aid].prompt.split())


async def test_registry_synced_to_database(clean):
    rows = await clean.fetch("select id, department, team from public.ai_agents order by id")
    assert len(rows) == 25 and sum(1 for r in rows if r["department"] == "advisory") == 5


async def test_default_schedules_are_added_disabled_once(clean, settings):
    from wc_agents.registry import sync_default_schedules

    n = await sync_default_schedules(clean, settings.config_dir)
    assert n >= 5
    assert await sync_default_schedules(clean, settings.config_dir) == 0
    rows = await clean.fetch("select enabled from public.ai_schedules")
    assert rows and not any(r["enabled"] for r in rows)
    assert await Orchestrator(clean, settings, {}, None).run_schedules() == 0


async def test_smoke_command(clean, settings, agents):
    from wc_agents.smoke import run_smoke

    from .fake_llm import FakeLLM, tool_use

    def bi(call):
        return [tool_use("company_overview")] if call.turn == 1 else [tool_use("submit_result", summary="Gestionale vuoto: nessun ordine.")]

    out = await run_smoke(clean, settings, agents, FakeLLM({"Business Intelligence Analyst": bi}))
    assert out["status"] == "completed" and out["calls"] == 2 and out["cost_usd"] > 0 and "Gestionale" in out["summary"]
