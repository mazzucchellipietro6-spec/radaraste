"""Flusso completo: il fondatore incarica l'AI CEO, che divide il lavoro tra colleghi (con una dipendenza),
aspetta i risultati e consegna la sintesi. Tutto passa per la coda nel database, come in produzione."""

from __future__ import annotations

import json

from wc_agents.orchestrator import Orchestrator

from .conftest import new_task
from .fake_llm import FakeLLM, first_text, last_tool_results, text, tool_use


def ids_from(call) -> list[str]:
    return [json.loads(r["content"])["task_id"] for r in last_tool_results(call) if not r.get("is_error")]


def ceo(call):
    if "FASE DI SINTESI" in first_text(call):
        msg = first_text(call)
        assert "Lead Generation" in msg or "03-lead-generation" in msg
        return [text("Riunisco i risultati."), tool_use(
            "submit_result", status="completed",
            summary="Trovato 1 importatore negli EAU (duplicato scartato); analisi di mercato, bozza contrattuale e simulazione fiscale pronte.",
            verified_facts=[{"fact": "Lead salvato nel CRM", "source_ids": ["leads"]}],
            estimates=[{"item": "Clienti acquisibili", "value": "1-2", "basis": "un solo lead qualificato"}],
            unknowns=["Volumi di acquisto degli importatori"], approval_required=False,
            next_action="Il fondatore decide se approvare la prima email commerciale")]
    if call.turn == 1:
        return [text("Divido il lavoro."),
                tool_use("delegate_task", agent_id="03-lead-generation", title="Importatori di marmo negli EAU",
                         instructions="Trova importatori di marmo negli Emirati Arabi Uniti da fonti pubbliche e salvali nel CRM."),
                tool_use("delegate_task", agent_id="24-legal-counsel", title="Contratto di fornitura EAU",
                         instructions="Prepara una bozza di contratto di compravendita internazionale per clienti negli EAU.")]
    if call.turn == 2:
        lead, legal = ids_from(call)
        return [tool_use("delegate_task", agent_id="04-export-manager", title="Mercato EAU", after=[lead],
                         instructions="Analizza requisiti di importazione e logistica per il marmo negli EAU."),
                tool_use("delegate_task", agent_id="25-tax-accounting-advisor", title="Fiscalità export EAU", after=[legal],
                         instructions="Verifica IVA e imposte di una vendita RESALE di marmo verso gli EAU.")]
    return [tool_use("wait_for_delegates", note="Sintesi per il fondatore")]


def lead_gen(call):
    if call.turn == 1:
        common = dict(company_name="Gulf Stone Trading LLC", country="AE", city="Dubai", segment="importer",
                      source_url="https://gulfstone.example/about", data_status="verified")
        return [tool_use("lead_save", website="https://www.gulfstone.example", **common),
                tool_use("lead_save", website="gulfstone.example", **common)]
    res = [json.loads(r["content"]) for r in last_tool_results(call)]
    assert res[0]["duplicate"] is False and res[1]["duplicate"] is True and res[0]["id"] == res[1]["id"]
    return [tool_use("submit_result", summary="1 importatore salvato (1 duplicato scartato)",
                     verified_facts=[{"fact": "Gulf Stone Trading LLC, importatore a Dubai", "source_ids": [res[0]["id"], "https://gulfstone.example/about"]}])]


def export(call):
    if call.turn == 1:
        return [tool_use("market_analysis_save", country="ae", title="Marmo negli EAU", summary="Mercato edilizio attivo.",
                         import_requirements="Da verificare con le dogane", sources=[{"url": "https://www.example.gov.ae/customs"}],
                         data_status="estimated")]
    return [tool_use("submit_result", summary="Analisi salvata", estimates=[{"item": "Domanda", "value": "media", "basis": "fonti pubbliche"}])]


def legal(call):
    if call.turn == 1:
        return [tool_use("legal_doc_save", kind="contract_draft", title="Bozza contratto di vendita EAU",
                         body="Bozza di contratto di compravendita internazionale di lastre di marmo con clausole Incoterms e pagamento anticipato.",
                         jurisdiction="Italia, foro di Massa (da negoziare)", applicable_law="Legge italiana e CISG",
                         sources=[{"title": "CISG", "url": "https://uncitral.un.org/en/texts/salegoods/conventions/sale_of_goods/cisg",
                                   "retrieved_at": "2026-11-06"}],
                         points_to_verify=["Applicabilità della CISG agli EAU", "Foro e arbitrato"], risks=["Esecuzione delle sentenze negli EAU"])]
    out = json.loads(last_tool_results(call)[0]["content"])
    assert out["review"].startswith("Revisione")
    return [tool_use("submit_result", summary="Bozza contrattuale pronta: serve la revisione di un avvocato abilitato", approval_required=True)]


def tax(call):
    if call.turn == 1:
        return [tool_use("tax_simulate", model="resale", amount=20000, cost_amount=15000, customer_country="AE",
                         goods_destination_country="AE", goods_leave_eu=True, incoterm="CIF")]
    if call.turn == 2:
        sim = json.loads(last_tool_results(call)[0]["content"])
        assert sim["vat"]["code"] == "non_imponibile_export" and sim["basis"] == "simulation"
        return [tool_use("tax_doc_save", kind="vat_analysis", title="IVA export EAU",
                         body="Esportazione non imponibile se la merce esce dall'UE con prova doganale; verificare il DAE.",
                         figures=[{"label": "Imponibile", "value": 20000, "unit": "EUR", "basis": "simulation"},
                                  {"label": "IVA", "value": 0, "unit": "EUR", "basis": "simulation"}],
                         sources=[{"title": "DPR 633/1972 art. 8", "url": "https://www.normattiva.it/", "retrieved_at": "2026-11-06"}],
                         points_to_verify=["Prova di uscita", "Regime dell'azienda"])]
    return [tool_use("submit_result", summary="Operazione non imponibile IVA (simulazione da verificare con il commercialista)")]


async def test_ceo_delegates_waits_and_synthesizes(clean, settings, agents):
    db = clean
    llm = FakeLLM({"AI CEO": ceo, "Lead Generation Agent": lead_gen, "Export Manager": export,
                   "Legal Counsel Agent": legal, "Tax & Accounting Advisor": tax})
    root = await new_task(db, "01-ai-ceo", "Importatori EAU", "Trova 30 importatori di marmo negli Emirati Arabi Uniti e prepara una strategia.")
    orch = Orchestrator(db, settings, agents, llm)
    await orch.run_until_idle()

    tasks = await db.fetch("select id, agent_id, status, phase, depth, parent_id, depends_on, started_at, finished_at, result from public.ai_tasks order by created_at")
    by = {t["agent_id"]: t for t in tasks}
    assert len(tasks) == 5
    assert all(t["status"] == "completed" for t in tasks), [(t["agent_id"], t["status"]) for t in tasks]
    ceo_t = by["01-ai-ceo"]
    assert str(ceo_t["id"]) == root and ceo_t["phase"] == "synthesis"
    assert ceo_t["result"]["agent_id"] == "01-ai-ceo" and "EAU" in ceo_t["result"]["summary"]
    for a in ("03-lead-generation", "04-export-manager", "24-legal-counsel", "25-tax-accounting-advisor"):
        assert str(by[a]["parent_id"]) == root and by[a]["depth"] == 1
    # dipendenze rispettate
    assert by["04-export-manager"]["started_at"] >= by["03-lead-generation"]["finished_at"]
    assert by["25-tax-accounting-advisor"]["started_at"] >= by["24-legal-counsel"]["finished_at"]

    # dati reali nel gestionale
    leads = await db.fetch("select company_name, dedupe_key, created_by_agent from public.leads")
    assert len(leads) == 1 and leads[0]["dedupe_key"] == "gulfstone.example"
    ma = await db.fetchone("select country, data_status from public.market_analyses")
    assert ma["country"] == "AE"
    docs = await db.fetch("select category, review_required, review_status, body from public.advisory_documents order by category")
    assert [d["category"] for d in docs] == ["legal", "tax"]
    assert all(d["review_required"] and d["review_status"] == "required" for d in docs)
    assert "Non è un parere legale" in docs[0]["body"] and "Non è una consulenza fiscale" in docs[1]["body"]

    # costi e registri
    usage = await db.fetchone("select count(*)::int as n, sum(cost_usd) as usd from public.ai_usage")
    assert usage["n"] == len(llm.calls) and float(usage["usd"]) > 0
    kinds = {r["kind"] for r in await db.fetch("select distinct kind from public.ai_task_events where task_id = %s", (root,))}
    assert {"started", "delegated", "waiting", "resumed", "completed"} <= kinds
    rt = await db.fetchone("select info from public.ai_runtime where id = %s", (settings.worker_id,))
    assert rt and rt["info"]["agents"] == 25
