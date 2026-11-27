"""Invio delle email (Resend), condiviso da approvazioni e follow-up automatici consentiti dalla politica."""

from __future__ import annotations

from typing import Any, Awaitable, Callable

import httpx

Sender = Callable[[dict], Awaitable[dict]]


class EmailNotConfigured(Exception):
    pass


def resend_sender(settings: Any) -> Sender:
    async def send(msg: dict) -> dict:
        if not (settings.resend_api_key and settings.email_from):
            raise EmailNotConfigured("RESEND_API_KEY ed EMAIL_FROM non configurati")
        body = {"from": settings.email_from, "to": [msg["to"]], "subject": msg["subject"], "text": msg["body"]}
        if settings.email_reply_to:
            body["reply_to"] = settings.email_reply_to
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post("https://api.resend.com/emails", json=body,
                                  headers={"Authorization": f"Bearer {settings.resend_api_key}"})
        if r.status_code >= 300:
            raise RuntimeError(f"Resend {r.status_code}: {r.text[:300]}")
        return {"provider_id": r.json().get("id")}

    return send


UNSUBSCRIBE_IT = "\n\n—\nSe non desidera ricevere altre comunicazioni da WHITE CARRARA, risponda a questa email scrivendo «cancellami»."
UNSUBSCRIBE_EN = "\n\n—\nIf you prefer not to receive further messages from WHITE CARRARA, reply to this email with “unsubscribe”."
