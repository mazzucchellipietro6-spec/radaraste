"""Approvazioni del fondatore: gli agenti preparano, il fondatore decide, il servizio esegue e registra."""

from __future__ import annotations

from wc_agents.approvals import ApprovalExecutor
from wc_agents.orchestrator import Orchestrator

from .conftest import new_task
from .fake_llm import FakeLLM, tool_use


async def draft_email(db, settings, agents, to="buyer@gulfstone.example"):
    lead = await db.fetchone(
        """insert into public.leads (company_name, email, country, dedupe_key, source_url, consent_status)
           values ('Gulf Stone', %s, 'AE', 'gulfstone.example', 'https://gulfstone.example', 'legitimate_interest') returning id""",
        (to,),
    )

    def crm(call):
        if call.turn == 1:
            return [tool_use("email_draft", lead_id=str(lead["id"]), subject="Marmo di Carrara per i vostri progetti",
                             body="Gentili, siamo WHITE CARRARA...", legal_basis="legitimate_interest")]
        return [tool_use("submit_result", summary="Email preparata, in attesa di approvazione", approval_required=True)]

    tid = await new_task(db, "05-crm-follow-up", "Primo contatto Gulf Stone")
    await Orchestrator(db, settings, agents, FakeLLM({"CRM & Follow-up Agent": crm})).run_until_idle()
    appr = await db.fetchone("select * from public.approvals where task_id = %s", (tid,))
    return lead["id"], appr


async def test_email_is_sent_only_after_approval(clean, settings, agents):
    lead_id, appr = await draft_email(clean, settings, agents)
    assert appr["kind"] == "outbound_message" and appr["status"] == "pending"
    sent = []

    async def sender(msg):
        sent.append(msg)
        return {"provider_id": "re_test_1"}

    ex = ApprovalExecutor(clean.agent, settings, sender=sender)
    await ex.run_once()
    assert not sent, "inviata senza approvazione"
    await clean.execute("update public.approvals set status = 'approved', decided_at = now() where id = %s", (appr["id"],))
    await ex.run_once()
    assert len(sent) == 1 and sent[0]["to"] == "buyer@gulfstone.example"
    a = await clean.fetchone("select status, execution_result, executed_at from public.approvals where id = %s", (appr["id"],))
    assert a["status"] == "executed" and a["executed_at"] and a["execution_result"]["provider_id"] == "re_test_1"
    assert await clean.fetchone("select 1 from public.email_log where status = 'sent' and related_id = %s", (appr["id"],))
    assert await clean.fetchone("select 1 from public.crm_activities where lead_id = %s and kind = 'email' and status = 'done'", (lead_id,))
    assert (await clean.fetchone("select qualification from public.leads where id = %s", (lead_id,)))["qualification"] == "contacted"
    note = await clean.fetchone("select subject from public.ai_messages where to_agent = '05-crm-follow-up'")
    assert note and "inviata" in note["subject"]
    await ex.run_once()
    assert len(sent) == 1, "inviata due volte"


async def test_suppressed_at_send_time_is_not_sent(clean, settings, agents):
    _, appr = await draft_email(clean, settings, agents)
    await clean.execute("insert into public.suppression_list (domain, reason) values ('gulfstone.example', 'richiesta del cliente')")
    await clean.execute("update public.approvals set status = 'approved', decided_at = now() where id = %s", (appr["id"],))
    sent = []

    async def sender(msg):
        sent.append(msg)
        return {}

    await ApprovalExecutor(clean.agent, settings, sender=sender).run_once()
    a = await clean.fetchone("select status, execution_result from public.approvals where id = %s", (appr["id"],))
    assert not sent and a["status"] == "failed" and "esclusione" in a["execution_result"]["error"]


async def test_email_waits_for_configuration(clean, settings, agents):
    _, appr = await draft_email(clean, settings, agents)
    await clean.execute("update public.approvals set status = 'approved', decided_at = now() where id = %s", (appr["id"],))
    await ApprovalExecutor(clean.agent, settings).run_once()  # nessuna chiave Resend nei test
    a = await clean.fetchone("select status, execution_result from public.approvals where id = %s", (appr["id"],))
    assert a["status"] == "approved" and a["execution_result"]["waiting_config"] is True


async def test_supplier_purchase_rejected_cancels_po(clean, settings, agents):
    sup = await clean.fetchone("insert into public.suppliers (name, active) values ('Laboratorio Apuano', true) returning id")

    def sm(call):
        if call.turn == 1:
            return [tool_use("purchase_order_draft", supplier_id=str(sup["id"]), justification="Ordine cliente EAU",
                             lines=[{"description": "Calacatta 2 cm", "quantity": 50, "unit_cost": 180, "cost_status": "estimated"}])]
        return [tool_use("submit_result", summary="Ordine al fornitore preparato", approval_required=True)]

    await new_task(clean, "11-supplier-manager", "Acquisto Calacatta")
    await Orchestrator(clean.agent, settings, agents, FakeLLM({"Supplier Manager": sm})).run_until_idle()
    po = await clean.fetchone("select id, status, total, approval_id from public.purchase_orders")
    assert po["status"] == "pending_approval" and float(po["total"]) == 9000 and po["approval_id"]
    appr = await clean.fetchone("select summary, amount from public.approvals where id = %s", (po["approval_id"],))
    assert "non ancora verificato" in appr["summary"] and float(appr["amount"]) == 9000
    await clean.execute("update public.approvals set status = 'rejected', decision_note = 'Prezzo da rinegoziare' where id = %s", (po["approval_id"],))
    await ApprovalExecutor(clean.agent, settings).run_once()
    assert (await clean.fetchone("select status from public.purchase_orders where id = %s", (po["id"],)))["status"] == "cancelled"


async def test_manual_kinds_are_authorized_not_executed(clean, settings, agents):
    await clean.execute(
        "insert into public.approvals (kind, title, summary, requested_by_agent, status) values ('payment', 'Acconto fornitore', 'x', '18-cfo', 'approved')")
    await ApprovalExecutor(clean.agent, settings).run_once()
    a = await clean.fetchone("select status, execution_result from public.approvals")
    assert a["status"] == "approved" and a["execution_result"]["action"] == "manual"


async def test_pending_approvals_expire(clean, settings, agents):
    await clean.execute(
        "insert into public.approvals (kind, title, summary, requested_by_agent, expires_at) values ('discount', 'Sconto', 'x', '13-pricing-manager', now() - interval '1 day')")
    await ApprovalExecutor(clean.agent, settings).run_once()
    assert (await clean.fetchone("select status from public.approvals"))["status"] == "expired"
