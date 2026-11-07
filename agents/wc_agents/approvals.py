"""Esecuzione delle decisioni del fondatore.

Gli agenti preparano le richieste; solo un amministratore (con verifica in due passaggi) le approva o le
rifiuta dal pannello. Qui il servizio esegue ciò che è automatizzabile e avvisa l'agente richiedente:

- outbound_message approvata → invio dell'email (Resend), registro in email_log e nel CRM;
- supplier_purchase approvata → ordine al fornitore "approvato" (l'invio al fornitore resta una persona);
- binding_quote approvata → promemoria nel CRM per inviare il preventivo dal pannello;
- altri tipi → l'autorizzazione è registrata, l'azione la esegue una persona;
- rifiuti e scadenze → bozze archiviate, ordini annullati, nota all'agente.
"""

from __future__ import annotations

import logging
from typing import Any, Awaitable, Callable

import httpx

from .db import Database, jsonb

log = logging.getLogger("wc_agents.approvals")

Sender = Callable[[dict], Awaitable[dict]]


class EmailNotConfigured(Exception):
    pass


class ApprovalExecutor:
    def __init__(self, db: Database, settings: Any, sender: Sender | None = None):
        self.db = db
        self.settings = settings
        self.custom_sender = sender is not None
        self.sender = sender or self.send_resend

    @property
    def email_ready(self) -> bool:
        return self.custom_sender or bool(self.settings.resend_api_key and self.settings.email_from)

    async def send_resend(self, msg: dict) -> dict:
        if not (self.settings.resend_api_key and self.settings.email_from):
            raise EmailNotConfigured("RESEND_API_KEY ed EMAIL_FROM non configurati")
        body = {"from": self.settings.email_from, "to": [msg["to"]], "subject": msg["subject"], "text": msg["body"]}
        if self.settings.email_reply_to:
            body["reply_to"] = self.settings.email_reply_to
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post("https://api.resend.com/emails", json=body,
                                  headers={"Authorization": f"Bearer {self.settings.resend_api_key}"})
        if r.status_code >= 300:
            raise RuntimeError(f"Resend {r.status_code}: {r.text[:300]}")
        return {"provider_id": r.json().get("id")}

    async def notify(self, appr: dict, subject: str, body: str) -> None:
        if appr.get("requested_by_agent"):
            await self.db.execute(
                "insert into public.ai_messages (task_id, from_agent, to_agent, subject, body, data) values (%s, null, %s, %s, %s, %s)",
                (appr.get("task_id"), appr["requested_by_agent"], subject, body, jsonb({"approval_id": str(appr["id"])})),
            )

    async def mark(self, appr: dict, status: str | None, result: dict) -> None:
        await self.db.execute(
            """update public.approvals set status = coalesce(%s, status), execution_result = %s,
                 executed_at = case when %s = 'executed' then now() else executed_at end where id = %s""",
            (status, jsonb(result), status, appr["id"]),
            actor="sistema:approvazioni",
        )

    async def run_once(self) -> int:
        done = await self.expire()
        rows = await self.db.fetch(
            """select * from public.approvals
               where (status in ('approved', 'rejected') and execution_result is null)
                  or (status = 'approved' and kind = 'outbound_message' and execution_result ->> 'waiting_config' = 'true')
               order by decided_at nulls last limit 20"""
        )
        for a in rows:
            if a["status"] == "approved" and a["kind"] == "outbound_message" and a["execution_result"] and not self.email_ready:
                continue  # ancora senza configurazione email: si riprova quando c'è
            try:
                if a["status"] == "rejected":
                    await self.on_rejected(a)
                else:
                    await self.on_approved(a)
                done += 1
            except Exception as e:  # l'errore resta registrato sull'approvazione
                log.exception("approvazione %s", a["number"])
                await self.mark(a, "failed", {"error": str(e)[:500]})
                await self.notify(a, f"Esecuzione non riuscita: {a['number']}", f"{a['title']}: {e}")
        return done

    async def expire(self) -> int:
        rows = await self.db.fetch(
            """update public.approvals set status = 'expired', execution_result = '{"expired": true}'
               where status = 'pending' and expires_at < now() returning *""",
            actor="sistema:approvazioni",
        )
        for a in rows:
            await self.cleanup_rejected(a)
            await self.notify(a, f"Richiesta scaduta: {a['number']}", f"{a['title']} non è stata decisa entro la scadenza.")
        return len(rows)

    async def cleanup_rejected(self, a: dict) -> None:
        p = a.get("payload") or {}
        if a["kind"] == "outbound_message" and p.get("asset_id"):
            await self.db.execute("update public.marketing_assets set status = 'archived' where id = %s", (p["asset_id"],))
        if a["kind"] == "supplier_purchase" and p.get("purchase_order_id"):
            await self.db.execute(
                "update public.purchase_orders set status = 'cancelled' where id = %s and status = 'pending_approval'",
                (p["purchase_order_id"],), actor="sistema:approvazioni",
            )

    async def on_rejected(self, a: dict) -> None:
        await self.cleanup_rejected(a)
        await self.mark(a, None, {"notified": True})
        await self.notify(a, f"Rifiutata: {a['number']}", f"Il fondatore ha rifiutato «{a['title']}». Nota: {a.get('decision_note') or '—'}")

    async def on_approved(self, a: dict) -> None:
        p = a.get("payload") or {}
        note = a.get("decision_note") or ""
        if a["kind"] == "outbound_message":
            await self.send_email(a, p)
            return
        if a["kind"] == "supplier_purchase" and p.get("purchase_order_id"):
            po = await self.db.fetchone(
                "update public.purchase_orders set status = 'approved' where id = %s and status = 'pending_approval' returning number",
                (p["purchase_order_id"],), actor="sistema:approvazioni",
            )
            res = {"purchase_order": po["number"] if po else None,
                   "next": "Ordine autorizzato: va inviato al fornitore e la conferma registrata nel pannello"}
            await self.mark(a, "executed", res)
            await self.notify(a, f"Approvato: {a['number']}", f"Ordine al fornitore autorizzato. {res['next']}. {note}")
            return
        if a["kind"] == "binding_quote" and p.get("quote_id"):
            q = await self.db.fetchone("select number, customer_id from public.quotes where id = %s", (p["quote_id"],))
            if q and q["customer_id"]:
                await self.db.execute(
                    """insert into public.crm_activities (customer_id, kind, subject, body, due_at, created_by_agent)
                       values (%s, 'task', %s, %s, now() + interval '1 day', %s)""",
                    (q["customer_id"], f"Inviare il preventivo {q['number']} approvato", f"Approvazione {a['number']}. {note}",
                     a.get("requested_by_agent")),
                )
            res = {"quote": q["number"] if q else None, "next": "Preventivo autorizzato: invialo al cliente da Preventivi nel pannello"}
            await self.mark(a, "executed", res)
            await self.notify(a, f"Approvato: {a['number']}", res["next"])
            return
        # pagamenti, contratti, impegni, sconti, prenotazioni di stock, operazioni legali: azione di una persona
        res = {"action": "manual", "message": "Autorizzazione registrata: l'azione va eseguita da una persona, non dagli agenti"}
        await self.mark(a, None, res)
        await self.notify(a, f"Approvato: {a['number']}", f"«{a['title']}» è autorizzata. {res['message']}. {note}")

    async def send_email(self, a: dict, p: dict) -> None:
        to = p.get("to")
        if not to or not p.get("subject") or not p.get("body"):
            raise RuntimeError("Richiesta senza destinatario, oggetto o testo")
        domain = to.split("@")[-1].lower()
        # i controlli si ripetono al momento dell'invio: consenso e lista di esclusione possono essere cambiati
        if await self.db.fetchone("select 1 from public.suppression_list where email = %s or domain = %s", (to, domain)):
            await self.mark(a, "failed", {"error": "Destinatario nella lista di esclusione: email non inviata"})
            await self.log_email(to, p["subject"], "skipped", None, "suppressed", a)
            return
        lead = await self.db.fetchone("select id, consent_status from public.leads where id = %s", (p["lead_id"],)) if p.get("lead_id") else None
        if lead and lead["consent_status"] == "opted_out":
            await self.mark(a, "failed", {"error": "Il contatto ha negato il consenso: email non inviata"})
            await self.log_email(to, p["subject"], "skipped", None, "opted_out", a)
            return
        try:
            sent = await self.sender({"to": to, "subject": p["subject"], "body": p["body"]})
        except EmailNotConfigured as e:
            await self.mark(a, None, {"waiting_config": True, "message": f"Approvata ma non inviata: {e}"})
            return
        except Exception as e:
            await self.log_email(to, p["subject"], "failed", None, str(e)[:300], a)
            raise
        await self.log_email(to, p["subject"], "sent", sent.get("provider_id"), None, a)
        if lead:
            await self.db.execute(
                """insert into public.crm_activities (lead_id, kind, direction, subject, body, status, done_at, created_by_agent)
                   values (%s, 'email', 'out', %s, %s, 'done', now(), %s)""",
                (lead["id"], p["subject"], p["body"][:8000], a.get("requested_by_agent")),
            )
            await self.db.execute("update public.leads set qualification = 'contacted' where id = %s and qualification in ('new', 'qualified')",
                                  (lead["id"],), actor="sistema:approvazioni")
        if p.get("asset_id"):
            await self.db.execute("update public.marketing_assets set status = 'published' where id = %s", (p["asset_id"],))
        await self.mark(a, "executed", {"sent_to": to, "provider_id": sent.get("provider_id")})
        await self.notify(a, f"Email inviata: {a['number']}", f"Email «{p['subject']}» inviata a {to} dopo l'approvazione.")

    async def log_email(self, to: str, subject: str, status: str, provider_id, error, a: dict) -> None:
        await self.db.execute(
            """insert into public.email_log (to_email, subject, template, status, provider_id, error, related_type, related_id)
               values (%s, %s, 'ai_outbound', %s, %s, %s, 'approval', %s)""",
            (to, subject, status, provider_id, error, a["id"]),
        )
