"""Ciclo completo con dati fittizi, come richiesto per il collaudo:
ricerca fornitore → acquisizione del servizio → catalogo → prezzo → lead → preventivo → approvazione →
prenotazione simulata → analisi del margine → report dell'AI CEO.

Ogni passo è un incarico eseguito dall'agente giusto attraverso la coda, con gli strumenti veri sul database;
le decisioni del proprietario sono simulate aggiornando le approvazioni, come farebbe il pannello.
"""

from __future__ import annotations

import json

from wc_agents.approvals import ApprovalExecutor
from wc_agents.orchestrator import Orchestrator

from .conftest import new_task
from .fake_llm import FakeLLM, last_tool_results, tool_use

STATE: dict = {}


def result(call, i: int = 0) -> dict:
    return json.loads(last_tool_results(call)[i]["content"])


def supplier_manager(call):
    if call.turn == 1:
        return [tool_use("tour_partner_save", name="Guide Apuane di prova", kind="guide", regions=["Toscana"], languages=["it", "en"],
                         website="https://guide-apuane.example", email="info@guide-apuane.example",
                         license_info="Guida ambientale escursionistica (dichiarata sul sito)",
                         source_url="https://guide-apuane.example/chi-siamo")]
    if call.turn == 2:
        STATE["partner_id"] = result(call)["id"]
        return [tool_use("offer_save", partner_id=STATE["partner_id"], kind="tour_service", subject="Visita guidata alle cave, 3 ore",
                         unit_cost=60, unit="persona", valid_until="2027-12-31", conditions="Minimo 2 persone; cancellazione gratuita fino a 48 ore",
                         payment_terms="30 giorni data fattura", source="Listino 2027 inviato via email dal partner", data_status="verified",
                         analysis="Costo in linea con il mercato; condizioni di cancellazione favorevoli; manca l'assicurazione RC: da chiedere.")]
    if call.turn == 3:
        STATE["offer_id"] = result(call)["id"]
        return [tool_use("offer_accept_request", offer_id=STATE["offer_id"],
                         justification="Servizio richiesto per i tour di lusso alle cave; costo verificato sul listino")]
    return [tool_use("submit_result", summary="Partner registrato, offerta analizzata, accettazione chiesta al proprietario", approval_required=True)]


def product_manager(call):
    if call.turn == 1:
        return [tool_use("catalog_service_save", kind="tour", title="Cave di Carrara con guida", offer_id=STATE["offer_id"],
                         unit="persona", price=95, price_status="verified", activate=True)]
    out = result(call)
    STATE["service"] = out
    return [tool_use("submit_result", summary=f"Servizio {out['code']} attivo, margine {out['margin_rate']}%")]


def lead_gen(call):
    if call.turn == 1:
        return [tool_use("lead_save", company_name="Viaggi di Lusso di Prova SRL", website="https://viaggi-lusso.example", country="IT",
                         city="Milano", segment="other", email="info@viaggi-lusso.example", source_url="https://viaggi-lusso.example/contatti",
                         data_status="verified")]
    STATE["lead_id"] = result(call)["id"]
    return [tool_use("submit_result", summary="Lead registrato",
                     verified_facts=[{"fact": "Agenzia di viaggi di lusso a Milano", "source_ids": [STATE["lead_id"]]}])]


def concierge(call):
    if call.turn == 1:
        return [tool_use("itinerary_draft", title="Una giornata tra le cave di Carrara", lead_id=STATE["lead_id"], customer_name="Viaggi di Lusso",
                         start_date="2027-05-20", days=1, participants=4,
                         items=[{"day": 1, "title": "Cave di Carrara con guida", "service_id": STATE["service"]["id"]}])]
    if call.turn == 2:
        STATE["itinerary"] = result(call)
        return [tool_use("quote_draft", lead_id=STATE["lead_id"], model="trading", fulfilment_mode="supplier_direct", valid_until="2027-04-30",
                         items=[{"description": "Cave di Carrara con guida, 20 maggio 2027", "quantity": 4, "unit": "persona", "unit_price": 95,
                                 "price_status": "verified"}], request_send_approval=True)]
    STATE["quote"] = result(call)
    return [tool_use("submit_result", summary="Itinerario e preventivo pronti; invio da approvare", approval_required=True)]


def order_manager(call):
    if call.turn == 1:
        return [tool_use("availability_check", partner_id=STATE["partner_id"], day="2027-05-20", participants=4)]
    if call.turn == 2:
        assert result(call)["real_availability"] == "unknown"
        return [tool_use("booking_prepare", kind="experience", item_title="Cave di Carrara con guida", itinerary_id=STATE["itinerary"]["id"],
                         first_name="Laura", last_name="Prova", email="laura.prova@example.com", preferred_date="2027-05-20", participants=4,
                         price=380, partner_id=STATE["partner_id"], partner_cost=240, partner_cost_status="verified")]
    STATE["booking"] = result(call)
    return [tool_use("submit_result", summary="Prenotazione preparata; conferma da approvare", approval_required=True)]


def cfo(call):
    if call.turn == 1:
        return [tool_use("booking_margins", months=12)]
    STATE["margins"] = result(call)
    return [tool_use("submit_result", summary="Margine dei tour calcolato")]


def ceo(call):
    if call.turn == 1:
        return [tool_use("ceo_dashboard")]
    if call.turn == 2:
        STATE["dashboard"] = result(call)
        t = STATE["dashboard"]["tours_month"]
        return [tool_use("daily_report_save", narrative=(
            f"## Report del giorno\n\nPrima prenotazione di tour confermata: ricavo {t['revenue_eur']} €, costo partner "
            f"{t['partner_cost_eur']} €, margine {t['margin_eur']} €. Nessuna approvazione in attesa. Priorità di domani: "
            "chiedere al partner l'assicurazione RC e preparare il follow-up con l'agenzia."))]
    return [tool_use("submit_result", summary="Report giornaliero salvato")]


async def run(clean, settings, agents, scripts):
    await Orchestrator(clean.agent, settings, agents, FakeLLM(scripts)).run_until_idle()


async def approve_all(clean, settings, kind: str):
    await clean.execute("update public.approvals set status = 'approved', decided_at = now(), decision_note = 'ok (collaudo)' "
                        "where status = 'pending' and kind = %s", (kind,))
    await ApprovalExecutor(clean.agent, settings).run_once()


async def test_full_business_cycle(clean, settings, agents):
    STATE.clear()
    # 1. ricerca fornitore e offerta
    await new_task(clean, "11-supplier-manager", "Nuovo partner per le visite alle cave")
    await run(clean, settings, agents, {"Supplier Manager": supplier_manager})
    partner = await clean.fetchone("select active, verified_at from public.tour_partners where id = %s", (STATE["partner_id"],))
    assert partner["active"] is False and partner["verified_at"] is None  # nessun partner attivo senza verifica umana
    # 2. acquisizione del servizio: il proprietario approva le condizioni; una persona verifica il partner
    await approve_all(clean, settings, "binding_conditions")
    assert (await clean.fetchone("select status from public.supplier_offers where id = %s", (STATE["offer_id"],)))["status"] == "accepted"
    await clean.execute("update public.tour_partners set active = true, verified_at = current_date where id = %s", (STATE["partner_id"],))
    # 3-4. catalogo e prezzo
    await new_task(clean, "10-product-manager", "Mettere a catalogo la visita alle cave")
    await run(clean, settings, agents, {"Product Manager": product_manager})
    assert STATE["service"]["status"] == "active" and STATE["service"]["margin_rate"] == 36.84
    # 5. lead
    await new_task(clean, "03-lead-generation", "Agenzie di viaggio di lusso in Lombardia")
    await run(clean, settings, agents, {"Lead Generation Agent": lead_gen})
    # 6. itinerario e preventivo
    await new_task(clean, "16-customer-success", "Proposta per Viaggi di Lusso")
    await run(clean, settings, agents, {"Luxury Concierge": concierge})
    assert STATE["itinerary"]["total_price"] == 380 and STATE["itinerary"]["total_cost"] == 240
    q = await clean.fetchone("select status, total from public.quotes where id = %s", (STATE["quote"]["quote_id"],))
    assert q["status"] == "draft" and float(q["total"]) == 380
    # 7. approvazione del preventivo e accettazione del cliente (simulata)
    await approve_all(clean, settings, "binding_quote")
    await clean.execute("update public.quotes set status = 'accepted', responded_at = now() where id = %s", (STATE["quote"]["quote_id"],))
    # 8. prenotazione simulata: preparata dall'agente, confermata solo dopo l'approvazione
    await new_task(clean, "15-order-manager", "Prenotare la visita del 20 maggio")
    await run(clean, settings, agents, {"Order Manager": order_manager})
    b = await clean.fetchone("select status from public.bookings where id = %s", (STATE["booking"]["booking_id"],))
    assert b["status"] == "checking" and STATE["booking"]["approval"]["status"] == "pending"
    await approve_all(clean, settings, "booking_commitment")
    assert (await clean.fetchone("select status from public.bookings where id = %s", (STATE["booking"]["booking_id"],)))["status"] == "confirmed"
    # 9. margine
    await new_task(clean, "18-cfo", "Margini dei tour")
    await run(clean, settings, agents, {"CFO / Controller": cfo})
    m = STATE["margins"]["by_service"][0]
    assert float(m["revenue"]) == 380 and m["margin"] == 140 and m["margin_rate"] == 36.8
    # 10. report dell'AI CEO
    await new_task(clean, "01-ai-ceo", "Report giornaliero")
    await run(clean, settings, agents, {"AI CEO": ceo})
    rep = await clean.fetchone("select narrative, metrics, audit_anchor from public.daily_reports order by report_date desc limit 1")
    assert "margine 140" in rep["narrative"] and rep["metrics"]["tours_month"]["margin_eur"] == 140
    assert rep["audit_anchor"]["ok"] is True
    # ogni decisione economica è passata dal proprietario ed è registrata
    kinds = {r["kind"] for r in await clean.fetch("select kind from public.approvals where status = 'executed'")}
    assert kinds == {"binding_conditions", "binding_quote", "booking_commitment"}
    assert (await clean.fetchone("select ok from public.audit_verify()"))["ok"]


async def test_price_outside_policy_needs_approval(clean, settings, agents):
    def pm(call):
        if call.turn == 1:
            return [tool_use("catalog_service_save", kind="transfer", title="Transfer Pisa-Carrara", cost=100, price=105, price_status="estimated", activate=True)]
        STATE["low"] = result(call)
        return [tool_use("submit_result", summary="Prezzo da approvare")]

    await new_task(clean, "13-pricing-manager", "Prezzo transfer")
    await run(clean, settings, agents, {"Pricing Manager": pm})
    assert STATE["low"]["status"] == "pending_approval" and STATE["low"]["approval"]["status"] == "pending"
    await approve_all(clean, settings, "price_change")
    assert (await clean.fetchone("select status from public.service_catalog where id = %s", (STATE["low"]["id"],)))["status"] == "active"


async def test_campaign_budget_and_escalation(clean, settings, agents):
    def adv(call):
        if call.turn == 1:
            return [tool_use("campaign_prepare", title="Tour delle cave, primavera", platform="Google Ads", objective="richieste di tour",
                             countries=["US", "GB"], budget_daily=30, budget_total=900)]
        if call.turn == 2:
            STATE["campaign"] = result(call)
            return [tool_use("escalate_to_ceo", severity="high", subject="Budget pubblicitario da decidere",
                             details="Serve una decisione sul budget di primavera prima del 1 marzo")]
        STATE["escalation"] = result(call)
        return [tool_use("submit_result", summary="Campagna pronta, decisione chiesta")]

    await new_task(clean, "09-advertising-agent", "Campagna primavera")
    await run(clean, settings, agents, {"Advertising Agent": adv,
                                        "AI CEO": lambda c: [tool_use("notify_owner", severity="high", title="Budget campagna primavera",
                                                                      body="Decidere il budget di 900 € entro il 1 marzo")] if c.turn == 1
                                        else [tool_use("submit_result", summary="Segnalato al proprietario")]})
    assert STATE["campaign"]["status"] == "pending_approval"
    assert (await clean.fetchone("select status from public.ai_tasks where id = %s", (STATE["escalation"]["ceo_task_id"],)))["status"] == "completed"
    assert await clean.fetchone("select 1 from public.owner_alerts where title = 'Budget campagna primavera'")


async def test_followup_policy(clean, settings, agents):
    lead = await clean.fetchone(
        """insert into public.leads (company_name, email, dedupe_key, consent_status) values ('Cliente follow-up', 'buyer@followup.example',
           'followup.example', 'legitimate_interest') returning id""")
    sent = []

    async def sender(msg):
        sent.append(msg)
        return {"provider_id": "re_test"}

    def crm(call):
        if call.turn == 1:
            return [tool_use("followup_send", lead_id=str(lead["id"]), subject="Seguito", body="Buongiorno, le scrivo per...", lang="it")]
        STATE["first"] = last_tool_results(call)[0]
        return [tool_use("submit_result", summary="ok")]

    await new_task(clean, "05-crm-follow-up", "Follow-up")
    await Orchestrator(clean.agent, settings, agents, FakeLLM({"CRM & Follow-up Agent": crm}), email_sender=sender).run_until_idle()
    assert STATE["first"]["is_error"] and "Primo contatto" in STATE["first"]["content"] and not sent

    await clean.execute(
        """insert into public.crm_activities (lead_id, kind, direction, subject, status, done_at) values (%s, 'email', 'out', 'Prima email', 'done',
           now() - interval '5 days')""", (lead["id"],))
    await new_task(clean, "05-crm-follow-up", "Follow-up 2")
    await Orchestrator(clean.agent, settings, agents, FakeLLM({"CRM & Follow-up Agent": crm}), email_sender=sender).run_until_idle()
    assert not STATE["first"].get("is_error") and len(sent) == 1 and "cancellami" in sent[0]["body"]
    assert await clean.fetchone("select 1 from public.email_log where template = 'ai_followup' and status = 'sent'")
