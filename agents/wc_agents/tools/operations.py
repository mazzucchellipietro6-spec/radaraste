"""Operatività quotidiana: fornitori e partner, offerte, catalogo dei servizi, itinerari, richieste,
prenotazioni, campagne, follow-up consentiti, escalation all'AI CEO, controllo e report del CEO.

Regola comune: ciò che è ordinario e dentro la politica di autonomia (ai_settings.autonomy_policy) gli agenti
lo fanno da soli; ogni impegno economico, condizione vincolante, prezzo fuori soglia o campagna a pagamento
diventa una richiesta di approvazione. I vincoli sono ripetuti nel database (trigger), non solo qui.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from typing import Literal
from urllib.parse import urlparse

from pydantic import Field, field_validator

from ..db import jsonb
from ..mailer import UNSUBSCRIBE_EN, UNSUBSCRIBE_IT, EmailNotConfigured
from .base import Args, DataStatus, ToolContext, ToolError, tool
from .collab import create_approval

STATUS_ORDER = ["unknown", "assumed", "estimated", "verified"]


async def policy(ctx: ToolContext) -> dict:
    row = await ctx.db.fetchone("select value from public.ai_settings where key = 'autonomy_policy'")
    return (row or {}).get("value") or {}


def _host(url: str | None) -> str | None:
    if not url:
        return None
    h = urlparse(url if "://" in url else f"https://{url}").hostname or ""
    return re.sub(r"^www\.", "", h.lower()) or None


def _http(v: str) -> str:
    if not re.match(r"^https?://", v.strip()):
        raise ValueError("serve un indirizzo web (http/https)")
    return v.strip()


# ---------------------------------------------------------------- fornitori e partner
class SupplierSave(Args):
    name: str = Field(min_length=2, max_length=300)
    website: str | None = None
    country: str | None = None
    city: str | None = None
    materials: list[str] = []
    email: str | None = Field(None, description="Solo indirizzi aziendali pubblicati dal fornitore")
    phone: str | None = None
    source_url: str = Field(description="Pagina pubblica da cui viene l'informazione")
    notes: str | None = None

    @field_validator("source_url")
    @classmethod
    def check_url(cls, v: str) -> str:
        return _http(v)


@tool("supplier_save", "Registra un nuovo fornitore trovato da fonti pubbliche (resta «non verificato» finché una persona non lo controlla).", SupplierSave, "research")
async def supplier_save(ctx: ToolContext, a: SupplierSave) -> dict:
    host = _host(a.website)
    existing = await ctx.db.fetchone(
        """select id, name from public.suppliers where (%(h)s::text is not null and lower(website) like %(like)s) or lower(name) = lower(%(n)s) limit 1""",
        {"h": host, "like": f"%{host}%" if host else "", "n": a.name},
    )
    if existing:
        return {"id": str(existing["id"]), "duplicate": True, "message": f"Fornitore già presente: {existing['name']}"}
    note = f"[{date.today():%Y-%m-%d}] Trovato da {ctx.agent.name}. Fonte: {a.source_url}" + (f"\n{a.notes}" if a.notes else "")
    row = await ctx.db.fetchone(
        """insert into public.suppliers (name, website, country, city, materials, email, phone, notes, verification_status, active)
           values (%s, %s, %s, %s, %s, %s, %s, %s, 'unverified', true) returning id""",
        (a.name, a.website, a.country, a.city, a.materials, a.email, a.phone, note),
        actor=ctx.actor,
    )
    ctx.note_created("suppliers", row["id"], a.name)
    return {"id": str(row["id"]), "duplicate": False, "verification_status": "unverified"}


PARTNER_KINDS = Literal["guide", "driver", "transfer", "quarry", "workshop", "sculptor", "restaurant", "winery", "agency", "boat", "other"]


class PartnerSearch(Args):
    query: str = ""
    kind: PARTNER_KINDS | None = None
    region: str | None = None
    only_verified: bool = False
    limit: int = Field(30, ge=1, le=100)


@tool("tour_partner_search", "Cerca i partner dei tour (guide, autisti, transfer, laboratori, ristoranti) con stato di verifica.", PartnerSearch, "research")
async def tour_partner_search(ctx: ToolContext, a: PartnerSearch) -> dict:
    rows = await ctx.db.fetch(
        """select id, name, kind, regions, languages, website, contact_name, email, phone, verified_at, active, notes
           from public.tour_partners
           where (%(q)s = '' or name ilike %(like)s or coalesce(notes, '') ilike %(like)s)
             and (%(k)s::text is null or kind = %(k)s) and (%(r)s::text is null or %(r)s = any(regions))
             and (not %(v)s or verified_at is not null)
           order by verified_at is not null desc, name limit %(l)s""",
        {"q": a.query, "like": f"%{a.query}%", "k": a.kind, "r": a.region, "v": a.only_verified, "l": a.limit},
    )
    return {"results": rows, "note": "Partner senza verified_at non sono ancora verificati da una persona"}


class PartnerSave(Args):
    name: str = Field(min_length=2, max_length=300)
    kind: PARTNER_KINDS
    regions: list[str] = []
    languages: list[str] = []
    website: str | None = None
    email: str | None = None
    phone: str | None = None
    license_info: str | None = Field(None, description="Licenza o abilitazione dichiarata (per esempio guida turistica), con fonte")
    source_url: str
    notes: str | None = None

    @field_validator("source_url")
    @classmethod
    def check_url(cls, v: str) -> str:
        return _http(v)


@tool("tour_partner_save", "Registra un nuovo partner per tour ed esperienze trovato da fonti pubbliche (inattivo finché non viene verificato).", PartnerSave, "research")
async def tour_partner_save(ctx: ToolContext, a: PartnerSave) -> dict:
    host = _host(a.website)
    existing = await ctx.db.fetchone(
        "select id, name from public.tour_partners where (%(h)s::text is not null and lower(website) like %(like)s) or lower(name) = lower(%(n)s) limit 1",
        {"h": host, "like": f"%{host}%" if host else "", "n": a.name},
    )
    if existing:
        return {"id": str(existing["id"]), "duplicate": True}
    note = f"[{date.today():%Y-%m-%d}] Trovato da {ctx.agent.name}. Fonte: {a.source_url}" + (f"\n{a.notes}" if a.notes else "")
    row = await ctx.db.fetchone(
        """insert into public.tour_partners (name, kind, regions, languages, website, email, phone, license_info, notes, active)
           values (%s, %s, %s, %s, %s, %s, %s, %s, %s, false) returning id""",
        (a.name, a.kind, a.regions, a.languages, a.website, a.email, a.phone, a.license_info, note),
        actor=ctx.actor,
    )
    ctx.note_created("tour_partners", row["id"], a.name)
    return {"id": str(row["id"]), "duplicate": False, "active": False, "message": "Partner registrato come inattivo: lo attiva una persona dopo la verifica"}


# ---------------------------------------------------------------- offerte
OFFER_KINDS = Literal["material", "tour_service", "transfer", "accommodation", "guide", "experience", "other"]


class OfferSave(Args):
    supplier_id: str | None = None
    partner_id: str | None = None
    kind: OFFER_KINDS
    subject: str = Field(min_length=3, max_length=300, description="Cosa viene offerto")
    unit_cost: float | None = Field(None, ge=0)
    unit: str = "servizio"
    currency: str = "EUR"
    min_quantity: float | None = None
    valid_until: date | None = None
    conditions: str | None = None
    payment_terms: str | None = None
    source: str = Field(min_length=3, description="Documento, email o pagina da cui viene l'offerta")
    source_url: str | None = None
    data_status: DataStatus = Field(description="verified solo se l'offerta è scritta dal fornitore (documento, email, listino)")
    analysis: str | None = Field(None, description="Analisi: convenienza, rischi, condizioni critiche, confronto con altre offerte")


@tool("offer_save", "Registra e analizza un'offerta di un fornitore o partner (costo, condizioni, validità, fonte).", OfferSave, "analysis")
async def offer_save(ctx: ToolContext, a: OfferSave) -> dict:
    if not (a.supplier_id or a.partner_id):
        raise ToolError("Indica supplier_id o partner_id")
    if a.data_status == "verified" and not (a.source_url or a.source):
        raise ToolError("Un'offerta verificata deve avere la fonte")
    row = await ctx.db.fetchone(
        """insert into public.supplier_offers (supplier_id, partner_id, kind, subject, unit_cost, unit, currency, min_quantity, valid_until,
                                               conditions, payment_terms, source, source_url, data_status, status, analysis, created_by_agent, task_id)
           values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) returning id, number""",
        (a.supplier_id, a.partner_id, a.kind, a.subject, a.unit_cost, a.unit, a.currency, a.min_quantity, a.valid_until, a.conditions,
         a.payment_terms, a.source, a.source_url, a.data_status, "analyzed" if a.analysis else "received", a.analysis, ctx.agent.id, ctx.task["id"]),
        actor=ctx.actor,
    )
    ctx.note_created("supplier_offers", row["id"], row["number"])
    return {"id": str(row["id"]), "number": row["number"]}


class OfferSearch(Args):
    query: str = ""
    status: Literal["received", "analyzed", "pending_approval", "accepted", "rejected", "expired"] | None = None
    partner_id: str | None = None
    supplier_id: str | None = None
    limit: int = Field(30, ge=1, le=100)


@tool("offer_search", "Cerca le offerte registrate di fornitori e partner.", OfferSearch, "research")
async def offer_search(ctx: ToolContext, a: OfferSearch) -> dict:
    rows = await ctx.db.fetch(
        """select o.id, o.number, o.kind, o.subject, o.unit_cost, o.unit, o.currency, o.valid_until, o.conditions, o.payment_terms,
                  o.data_status, o.status, o.analysis, o.source, coalesce(s.name, p.name) as counterpart, o.supplier_id, o.partner_id
           from public.supplier_offers o left join public.suppliers s on s.id = o.supplier_id left join public.tour_partners p on p.id = o.partner_id
           where (%(q)s = '' or o.subject ilike %(like)s) and (%(st)s::text is null or o.status = %(st)s)
             and (%(p)s::uuid is null or o.partner_id = %(p)s::uuid) and (%(s)s::uuid is null or o.supplier_id = %(s)s::uuid)
           order by o.created_at desc limit %(l)s""",
        {"q": a.query, "like": f"%{a.query}%", "st": a.status, "p": a.partner_id, "s": a.supplier_id, "l": a.limit},
    )
    return {"results": rows}


class OfferAccept(Args):
    offer_id: str
    justification: str = Field(min_length=10)


@tool("offer_accept_request", "Chiede al proprietario di accettare le condizioni vincolanti di un'offerta (acquisizione del servizio).", OfferAccept, "review")
async def offer_accept_request(ctx: ToolContext, a: OfferAccept) -> dict:
    o = await ctx.db.fetchone(
        """select o.*, coalesce(s.name, p.name) as counterpart from public.supplier_offers o left join public.suppliers s on s.id = o.supplier_id
           left join public.tour_partners p on p.id = o.partner_id where o.id = %s""", (a.offer_id,))
    if not o:
        raise ToolError("Offerta non trovata")
    if o["status"] in ("accepted", "pending_approval"):
        raise ToolError(f"Offerta già {o['status']}")
    res = await create_approval(
        ctx, "binding_conditions", f"Accettare l'offerta {o['number']} di {o['counterpart']}",
        f"{o['subject']}: {o['unit_cost']} {o['currency']} per {o['unit']}. Condizioni: {o['conditions'] or 'non indicate'}. "
        f"Pagamento: {o['payment_terms'] or 'non indicato'}. Validità: {o['valid_until'] or 'non indicata'}.",
        float(o["unit_cost"]) if o["unit_cost"] is not None else None, o["currency"], {"offer_id": str(o["id"])},
        reason=a.justification, effects="Le condizioni del fornitore diventano vincolanti per WHITE CARRARA e il servizio può entrare nel catalogo",
        risk_level="high" if o["data_status"] != "verified" else "medium",
    )
    await ctx.db.execute("update public.supplier_offers set status = 'pending_approval', approval_id = %s where id = %s",
                         (res["approval_id"], o["id"]), actor=ctx.actor)
    return res


# ---------------------------------------------------------------- catalogo dei servizi
class ServiceSave(Args):
    id: str | None = Field(None, description="Per aggiornare un servizio esistente")
    kind: Literal["tour", "experience", "transfer", "marble_product", "other"]
    title: str = Field(min_length=3, max_length=300)
    description: str | None = None
    offer_id: str | None = None
    partner_id: str | None = None
    supplier_id: str | None = None
    unit: str = "persona"
    cost: float | None = Field(None, ge=0, description="Costo per unità; se vuoto si usa quello dell'offerta")
    price: float = Field(ge=0, description="Prezzo di vendita per unità")
    currency: str = "EUR"
    price_status: DataStatus = "estimated"
    activate: bool = Field(False, description="Rendere il servizio vendibile (nei limiti di margine; altrimenti si chiede l'approvazione)")


@tool("catalog_service_save", "Crea o aggiorna un servizio del catalogo (tour, esperienza, transfer, prodotto) con costo, prezzo e margine.", ServiceSave, "calculation")
async def catalog_service_save(ctx: ToolContext, a: ServiceSave) -> dict:
    cost = a.cost
    partner, supplier = a.partner_id, a.supplier_id
    if a.offer_id:
        o = await ctx.db.fetchone("select unit_cost, partner_id, supplier_id, status from public.supplier_offers where id = %s", (a.offer_id,))
        if not o:
            raise ToolError("Offerta non trovata")
        cost = cost if cost is not None else (float(o["unit_cost"]) if o["unit_cost"] is not None else None)
        partner = partner or (str(o["partner_id"]) if o["partner_id"] else None)
        supplier = supplier or (str(o["supplier_id"]) if o["supplier_id"] else None)
    pol = await policy(ctx)
    margin = round((a.price - cost) / a.price * 100, 2) if cost is not None and a.price > 0 else None
    lo, hi = float(pol.get("min_margin_rate", 15)), float(pol.get("max_margin_rate", 70))
    within = margin is not None and lo <= margin <= hi
    old = await ctx.db.fetchone("select id, status, price from public.service_catalog where id = %s", (a.id,)) if a.id else None
    if a.id and not old:
        raise ToolError("Servizio non trovato")
    if old and old["status"] == "active" and old["price"]:
        change = abs(a.price - float(old["price"])) / float(old["price"]) * 100
        within = within and change <= float(pol.get("max_price_change_rate", 10))
    status = "active" if a.activate and within else ("pending_approval" if a.activate else (old["status"] if old and old["status"] != "pending_approval" else "draft"))
    if old and old["status"] == "active" and not within:
        status = "pending_approval"
    params = (a.kind, a.title, a.description, a.offer_id, partner, supplier, a.unit, cost, a.price, a.currency, a.price_status, status)
    if old:
        row = await ctx.db.fetchone(
            """update public.service_catalog set kind = %s, title = %s, description = %s, offer_id = %s, partner_id = %s, supplier_id = %s, unit = %s,
                 cost = %s, price = case when %s = 'pending_approval' then price else %s end, currency = %s, price_status = %s, status = %s
               where id = %s returning id, code""",
            (a.kind, a.title, a.description, a.offer_id, partner, supplier, a.unit, cost, status, a.price, a.currency, a.price_status, status, a.id),
            actor=ctx.actor,
        )
    else:
        row = await ctx.db.fetchone(
            """insert into public.service_catalog (kind, title, description, offer_id, partner_id, supplier_id, unit, cost, price, currency,
                                                   price_status, status, created_by_agent, task_id)
               values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) returning id, code""",
            params + (ctx.agent.id, ctx.task["id"]), actor=ctx.actor,
        )
        ctx.note_created("service_catalog", row["id"], f"{row['code']} {a.title}")
    out = {"id": str(row["id"]), "code": row["code"], "status": status, "margin_rate": margin, "policy": {"min": lo, "max": hi}}
    if status == "pending_approval":
        out["approval"] = await create_approval(
            ctx, "price_change", f"Prezzo di {a.title}: {a.price:,.2f} {a.currency} per {a.unit}",
            f"Costo {cost if cost is not None else 'sconosciuto'} {a.currency}, prezzo {a.price:,.2f}, margine {margin if margin is not None else 'non calcolabile'}% "
            f"(limiti autorizzati {lo}-{hi}%).", a.price, a.currency, {"service_id": str(row["id"]), "price": a.price},
            reason="Prezzo fuori dai limiti autorizzati o variazione oltre la soglia",
            effects="Il servizio diventa vendibile a questo prezzo", risk_level="medium" if margin is not None else "high",
        )
    return out


class ServiceSearch(Args):
    query: str = ""
    kind: Literal["tour", "experience", "transfer", "marble_product", "other"] | None = None
    only_active: bool = False
    include_public_site: bool = Field(True, description="Includi esperienze e destinazioni pubblicate sul sito (prezzi di listino al pubblico)")


@tool("catalog_service_search", "Cerca nel catalogo dei servizi (interno, con costi e margini) e nelle esperienze pubblicate sul sito.", ServiceSearch, "research")
async def catalog_service_search(ctx: ToolContext, a: ServiceSearch) -> dict:
    rows = await ctx.db.fetch(
        """select c.id, c.code, c.kind, c.title, c.unit, c.cost, c.price, c.currency, c.margin_rate, c.price_status, c.status,
                  p.name as partner, p.verified_at as partner_verified
           from public.service_catalog c left join public.tour_partners p on p.id = c.partner_id
           where (%(q)s = '' or c.title ilike %(like)s or coalesce(c.description, '') ilike %(like)s)
             and (%(k)s::text is null or c.kind = %(k)s) and (not %(act)s or c.status = 'active')
           order by c.status = 'active' desc, c.title limit 60""",
        {"q": a.query, "like": f"%{a.query}%", "k": a.kind, "act": a.only_active},
    )
    public = []
    if a.include_public_site:
        import json

        for folder in ("experiences", "destinations"):
            for f in sorted((ctx.settings.content_dir / folder).glob("*.json")):
                try:
                    d = json.loads(f.read_text(encoding="utf-8"))
                except (OSError, json.JSONDecodeError):
                    continue
                if not d.get("active", True):
                    continue
                text = f"{d.get('title', '')} {d.get('summary', '')}"
                if a.query and a.query.lower() not in text.lower():
                    continue
                public.append({"slug": f.stem, "type": folder, "title": d.get("title"), "summary": d.get("summary"), "duration": d.get("duration"),
                               "public_price": d.get("price"), "price_unit": d.get("priceUnit"), "price_note": d.get("priceNote")})
    return {"internal": rows, "public_site": public,
            "note": "I prezzi del sito sono il listino al pubblico; il costo e il margine stanno solo nel catalogo interno"}


# ---------------------------------------------------------------- itinerari
class ItineraryItem(Args):
    day: int = Field(ge=1, le=60)
    title: str
    service_id: str | None = Field(None, description="Servizio del catalogo interno, per costi e prezzi")
    description: str | None = None
    quantity: float | None = Field(None, gt=0, description="Se vuoto: numero di partecipanti per i servizi a persona, 1 altrimenti")


class ItineraryDraft(Args):
    title: str = Field(min_length=3, max_length=300)
    lead_id: str | None = None
    request_id: str | None = None
    customer_name: str | None = None
    start_date: date | None = None
    days: int = Field(ge=1, le=60)
    participants: int = Field(ge=1, le=500)
    items: list[ItineraryItem] = Field(min_length=1)
    notes: str | None = None


@tool("itinerary_draft", "Prepara un itinerario personalizzato giorno per giorno con i servizi del catalogo, costi e prezzo totale.", ItineraryDraft, "writing")
async def itinerary_draft(ctx: ToolContext, a: ItineraryDraft) -> dict:
    total_cost, total_price, statuses, missing = 0.0, 0.0, [], []
    items = []
    for it in a.items:
        entry = it.model_dump()
        if it.service_id:
            s = await ctx.db.fetchone("select title, unit, cost, price, price_status, status from public.service_catalog where id = %s", (it.service_id,))
            if not s:
                raise ToolError(f"Servizio non trovato: {it.service_id}")
            qty = it.quantity or (a.participants if s["unit"] == "persona" else 1)
            entry.update(quantity=qty, unit=s["unit"], unit_price=float(s["price"] or 0), unit_cost=float(s["cost"]) if s["cost"] is not None else None,
                         service_status=s["status"])
            total_price += qty * float(s["price"] or 0)
            if s["cost"] is None:
                missing.append(it.title)
            else:
                total_cost += qty * float(s["cost"])
            statuses.append(s["price_status"] if s["status"] == "active" else "estimated")
        else:
            missing.append(it.title)
            statuses.append("unknown")
        items.append(entry)
    price_status = min(statuses, key=STATUS_ORDER.index) if statuses else "unknown"
    row = await ctx.db.fetchone(
        """insert into public.itineraries (lead_id, request_id, customer_name, title, start_date, days, participants, items, total_cost, total_price,
                                           price_status, notes, created_by_agent, task_id)
           values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) returning id, number""",
        (a.lead_id, a.request_id, a.customer_name, a.title, a.start_date, a.days, a.participants, jsonb(items), round(total_cost, 2),
         round(total_price, 2), price_status, a.notes, ctx.agent.id, ctx.task["id"]),
        actor=ctx.actor,
    )
    ctx.note_created("itineraries", row["id"], f"{row['number']} {a.title}")
    margin = round((total_price - total_cost) / total_price * 100, 1) if total_price and not missing else None
    return {"id": str(row["id"]), "number": row["number"], "total_price": round(total_price, 2), "total_cost": round(total_cost, 2),
            "margin_rate": margin, "price_status": price_status, "items_without_price": missing,
            "note": "Il prezzo diventa un impegno solo con un preventivo approvato"}


# ---------------------------------------------------------------- richieste dei clienti
class RequestSearch(Args):
    status: Literal["new", "in_progress", "waiting_customer", "quoted", "won", "lost", "closed", "open"] | None = "open"
    kind: str | None = None
    limit: int = Field(30, ge=1, le=100)


@tool("request_search", "Richieste dei clienti dal sito (preventivi, concierge, viaggi su misura, contatti).", RequestSearch, "crm")
async def request_search(ctx: ToolContext, a: RequestSearch) -> dict:
    rows = await ctx.db.fetch(
        """select id, reference, kind, status, name, email, company, country, lang, interest, left(message, 1500) as message, marbles,
                  details, created_at
           from public.requests
           where (%(s)s::text is null or (%(s)s = 'open' and status in ('new', 'in_progress', 'waiting_customer')) or status = %(s)s)
             and (%(k)s::text is null or kind = %(k)s) and status <> 'spam'
           order by created_at limit %(l)s""",
        {"s": a.status, "k": a.kind, "l": a.limit},
    )
    return {"results": rows, "note": "Dati personali dei clienti: usali solo per rispondere alla loro richiesta"}


class RequestUpdate(Args):
    request_id: str
    status: Literal["in_progress", "waiting_customer", "quoted", "won", "lost", "closed"]
    note: str = Field(min_length=3, max_length=2000)


@tool("request_update", "Aggiorna lo stato di una richiesta del cliente e annota cosa è stato fatto.", RequestUpdate, "crm")
async def request_update(ctx: ToolContext, a: RequestUpdate) -> dict:
    row = await ctx.db.fetchone(
        """update public.requests set status = %s,
             details = jsonb_set(coalesce(details, '{}'), '{agent_notes}', coalesce(details -> 'agent_notes', '[]') || %s::jsonb)
           where id = %s returning reference""",
        (a.status, jsonb([{"at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "agent": ctx.agent.id, "note": a.note}]), a.request_id),
        actor=ctx.actor,
    )
    if not row:
        raise ToolError("Richiesta non trovata")
    return {"reference": row["reference"], "status": a.status}


# ---------------------------------------------------------------- prenotazioni
class BookingSearch(Args):
    status: Literal["requested", "checking", "confirmed", "awaiting_payment", "paid", "completed", "declined", "cancelled", "open"] | None = "open"
    date_from: date | None = None
    date_to: date | None = None
    limit: int = Field(30, ge=1, le=100)


@tool("booking_search", "Prenotazioni di esperienze, tour e transfer con stato, date, prezzo e costo del partner.", BookingSearch, "research")
async def booking_search(ctx: ToolContext, a: BookingSearch) -> dict:
    rows = await ctx.db.fetch(
        """select b.id, b.reference, b.kind, b.item_title, b.first_name, b.status, b.preferred_date, b.participants, b.price, b.currency,
                  b.confirmed_at, b.created_by_agent, bi.partner_id, p.name as partner, bi.partner_cost, bi.partner_confirmed_at
           from public.bookings b left join public.booking_internal bi on bi.booking_id = b.id left join public.tour_partners p on p.id = bi.partner_id
           where (%(s)s::text is null or (%(s)s = 'open' and b.status in ('requested', 'checking', 'confirmed', 'awaiting_payment')) or b.status = %(s)s)
             and (%(f)s::date is null or b.preferred_date >= %(f)s) and (%(t)s::date is null or b.preferred_date <= %(t)s)
           order by b.preferred_date nulls last limit %(l)s""",
        {"s": a.status, "f": a.date_from, "t": a.date_to, "l": a.limit},
    )
    return {"results": rows}


class Availability(Args):
    partner_id: str | None = None
    service_id: str | None = None
    day: date
    participants: int = Field(1, ge=1)


@tool("availability_check", "Controlla la disponibilità con i dati interni (partner, servizio, prenotazioni già confermate quel giorno).", Availability, "research")
async def availability_check(ctx: ToolContext, a: Availability) -> dict:
    partner_id = a.partner_id
    service = None
    if a.service_id:
        service = await ctx.db.fetchone("select title, status, partner_id from public.service_catalog where id = %s", (a.service_id,))
        if not service:
            raise ToolError("Servizio non trovato")
        partner_id = partner_id or (str(service["partner_id"]) if service["partner_id"] else None)
    partner = await ctx.db.fetchone("select name, active, verified_at from public.tour_partners where id = %s", (partner_id,)) if partner_id else None
    same_day = await ctx.db.fetchone(
        """select count(*)::int as n, coalesce(sum(b.participants), 0)::int as people from public.bookings b
           join public.booking_internal bi on bi.booking_id = b.id
           where bi.partner_id = %s and b.preferred_date = %s and b.status in ('confirmed', 'awaiting_payment', 'paid')""",
        (partner_id, a.day),
    ) if partner_id else None
    issues = []
    if service and service["status"] != "active":
        issues.append(f"servizio non attivo ({service['status']})")
    if partner and not partner["active"]:
        issues.append("partner non attivo")
    if partner and not partner["verified_at"]:
        issues.append("partner non verificato")
    return {
        "internal": {"service": service, "partner": partner, "bookings_same_day": same_day, "issues": issues},
        "real_availability": "unknown",
        "note": "Non esiste un collegamento autorizzato ai sistemi del partner: la disponibilità reale va confermata dal partner "
                "(telefono o email) prima di confermare al cliente.",
    }


class BookingPrepare(Args):
    kind: Literal["experience", "destination", "custom_trip", "transfer"]
    item_title: str
    item_slug: str | None = None
    itinerary_id: str | None = None
    request_id: str | None = None
    first_name: str
    last_name: str
    email: str
    phone: str | None = None
    lang: str = "it"
    preferred_date: date
    participants: int = Field(ge=1, le=500)
    price: float = Field(gt=0, description="Prezzo al cliente")
    currency: str = "EUR"
    partner_id: str
    partner_cost: float = Field(ge=0, description="Costo del partner (impegno economico di WHITE CARRARA)")
    partner_cost_status: DataStatus
    notes: str | None = None


@tool("booking_prepare", "Prepara una prenotazione con partner e costo; la conferma (impegno economico) passa dall'approvazione del proprietario.", BookingPrepare, "writing")
async def booking_prepare(ctx: ToolContext, a: BookingPrepare) -> dict:
    partner = await ctx.db.fetchone("select name, active, verified_at from public.tour_partners where id = %s", (a.partner_id,))
    if not partner:
        raise ToolError("Partner non trovato")
    pol = await policy(ctx)
    margin = round((a.price - a.partner_cost) / a.price * 100, 2)
    warnings = []
    if not partner["active"] or not partner["verified_at"]:
        warnings.append("partner non ancora verificato o attivo")
    if margin < float(pol.get("min_margin_rate", 15)):
        warnings.append(f"margine {margin}% sotto il minimo autorizzato")
    if a.partner_cost_status != "verified":
        warnings.append("costo del partner non confermato per iscritto")
    async with ctx.db.tx(ctx.actor) as c:
        cur = await c.execute(
            """insert into public.bookings (kind, item_slug, item_title, first_name, last_name, email, phone, lang, preferred_date, participants,
                                            price, currency, status, notes, itinerary_id, created_by_agent, details)
               values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'checking', %s, %s, %s, %s) returning id, reference""",
            (a.kind, a.item_slug, a.item_title, a.first_name, a.last_name, a.email, a.phone, a.lang, a.preferred_date, a.participants,
             a.price, a.currency, a.notes, a.itinerary_id, ctx.agent.id, jsonb({"request_id": a.request_id, "prepared_by": ctx.agent.id})),
        )
        b = await cur.fetchone()
        await c.execute("insert into public.booking_internal (booking_id, partner_id, partner_cost, notes) values (%s, %s, %s, %s)",
                        (b["id"], a.partner_id, a.partner_cost, f"Costo {a.partner_cost_status}"))
    ctx.note_created("bookings", b["id"], b["reference"])
    auto = float(pol.get("booking_auto_commitment_eur", 0))
    out = {"booking_id": str(b["id"]), "reference": b["reference"], "status": "checking", "margin_rate": margin, "warnings": warnings}
    if a.partner_cost <= auto and not warnings and auto > 0:
        out["note"] = "Costo entro la soglia autorizzata: confermabile senza approvazione dopo la conferma del partner"
        return out
    out["approval"] = await create_approval(
        ctx, "booking_commitment", f"Confermare {b['reference']}: {a.item_title} per {a.first_name} {a.last_name[:1]}.",
        f"{a.participants} persone il {a.preferred_date:%d/%m/%Y}. Prezzo al cliente {a.price:,.2f} {a.currency}, costo del partner "
        f"{partner['name']} {a.partner_cost:,.2f} {a.currency}, margine {margin}%." + (f" Attenzione: {'; '.join(warnings)}." if warnings else ""),
        a.partner_cost, a.currency, {"booking_id": str(b["id"]), "partner_id": a.partner_id},
        reason="La conferma impegna WHITE CARRARA a pagare il partner", effects="La prenotazione diventa confermata e il costo del partner un impegno",
        risk_level="high" if warnings else "medium",
    )
    return out


# ---------------------------------------------------------------- campagne
class CampaignPrepare(Args):
    title: str = Field(min_length=3, max_length=200)
    platform: str = Field(description="Google Ads, Meta, LinkedIn, rivista di settore, ...")
    objective: str
    audience: str | None = None
    countries: list[str] = []
    budget_daily: float = Field(0, ge=0)
    budget_total: float = Field(0, ge=0)
    start_date: date | None = None
    end_date: date | None = None
    asset_id: str | None = Field(None, description="Materiale di marketing con i testi")
    kpis: dict = Field(default_factory=dict, description="Obiettivi misurabili: clic, lead, costo per lead stimato")


@tool("campaign_prepare", "Prepara una campagna pubblicitaria; sopra la soglia di budget autorizzata chiede l'approvazione per attivarla.", CampaignPrepare, "writing")
async def campaign_prepare(ctx: ToolContext, a: CampaignPrepare) -> dict:
    pol = await policy(ctx)
    auto = float(pol.get("campaign_auto_budget_eur", 0))
    needs = max(a.budget_total, a.budget_daily) > auto
    row = await ctx.db.fetchone(
        """insert into public.campaigns (title, platform, objective, audience, countries, budget_daily, budget_total, start_date, end_date, asset_id,
                                         kpis, status, created_by_agent, task_id)
           values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) returning id, number""",
        (a.title, a.platform, a.objective, a.audience, a.countries, a.budget_daily, a.budget_total, a.start_date, a.end_date, a.asset_id,
         jsonb(a.kpis), "pending_approval" if needs else "approved", ctx.agent.id, ctx.task["id"]),
        actor=ctx.actor,
    )
    ctx.note_created("campaigns", row["id"], row["number"])
    out = {"id": str(row["id"]), "number": row["number"], "status": "pending_approval" if needs else "approved"}
    if needs:
        out["approval"] = await create_approval(
            ctx, "campaign_activation", f"Campagna {row['number']}: {a.title} su {a.platform}",
            f"Obiettivo: {a.objective}. Budget {a.budget_daily:,.2f} €/giorno, totale {a.budget_total:,.2f} €, dal {a.start_date or '—'} al {a.end_date or '—'}. "
            f"Paesi: {', '.join(a.countries) or '—'}.", a.budget_total, "EUR", {"campaign_id": str(row["id"])},
            reason="Spesa pubblicitaria oltre la soglia autorizzata",
            effects="La campagna può essere attivata sulla piattaforma (attivazione manuale: nessun collegamento automatico alla piattaforma)",
            risk_level="high" if a.budget_total > 1000 else "medium",
        )
    return out


class CampaignSearch(Args):
    status: Literal["draft", "pending_approval", "approved", "active", "paused", "ended", "rejected"] | None = None
    limit: int = Field(20, ge=1, le=100)


@tool("campaign_search", "Campagne pubblicitarie con budget, stato e obiettivi.", CampaignSearch, "research")
async def campaign_search(ctx: ToolContext, a: CampaignSearch) -> dict:
    rows = await ctx.db.fetch(
        """select id, number, title, platform, objective, countries, budget_daily, budget_total, spent, start_date, end_date, status, kpis, created_by_agent
           from public.campaigns where (%(s)s::text is null or status = %(s)s) order by created_at desc limit %(l)s""",
        {"s": a.status, "l": a.limit},
    )
    return {"results": rows, "note": "La spesa effettiva va letta sulla piattaforma: non c'è un collegamento automatico"}


# ---------------------------------------------------------------- follow-up consentiti
class Followup(Args):
    lead_id: str
    subject: str = Field(max_length=200)
    body: str = Field(max_length=4000, description="Testo breve e utile; niente dati di fornitori, costi o margini")
    lang: Literal["it", "en"] = "en"


@tool("followup_send", "Invia un follow-up a un contatto già in conversazione, entro la politica autorizzata (non per i primi contatti).", Followup, "crm")
async def followup_send(ctx: ToolContext, a: Followup) -> dict:
    pol = await policy(ctx)
    if not pol.get("followup_auto_send", False):
        raise ToolError("I follow-up automatici sono disattivati dal proprietario: usa email_draft per chiedere l'approvazione")
    lead = await ctx.db.fetchone("select id, email, consent_status, company_name from public.leads where id = %s", (a.lead_id,))
    if not lead or not lead["email"]:
        raise ToolError("Lead non trovato o senza email")
    if lead["consent_status"] == "opted_out":
        raise ToolError("Il contatto ha negato il consenso")
    domain = lead["email"].split("@")[-1].lower()
    if await ctx.db.fetchone("select 1 from public.suppression_list where email = %s or domain = %s", (lead["email"], domain)):
        raise ToolError("Indirizzo nella lista di esclusione")
    last = await ctx.db.fetchone(
        """select max(done_at) as last from public.crm_activities where lead_id = %s and kind = 'email' and direction = 'out' and status = 'done'""",
        (a.lead_id,))
    if not last or not last["last"]:
        raise ToolError("Primo contatto: serve l'approvazione del proprietario (usa email_draft)")
    gap = int(pol.get("followup_min_days_between", 3))
    if last["last"] > datetime.now(timezone.utc) - timedelta(days=gap):
        raise ToolError(f"Ultima email inviata meno di {gap} giorni fa: aspetta o chiedi l'approvazione")
    sent_today = await ctx.db.fetchone(
        "select count(*)::int as n from public.email_log where template = 'ai_followup' and created_at >= date_trunc('day', now())")
    cap = int(pol.get("followup_daily_cap", 20))
    if sent_today and sent_today["n"] >= cap:
        raise ToolError(f"Raggiunto il limite giornaliero di {cap} follow-up automatici")
    if ctx.email_sender is None:
        raise ToolError("Invio email non configurato nel servizio: usa email_draft")
    body = a.body.rstrip() + (UNSUBSCRIBE_IT if a.lang == "it" else UNSUBSCRIBE_EN)
    try:
        sent = await ctx.email_sender({"to": lead["email"], "subject": a.subject, "body": body})
    except EmailNotConfigured as e:
        raise ToolError(f"Email non configurata ({e}): usa email_draft") from e
    await ctx.db.execute(
        """insert into public.email_log (to_email, subject, template, status, provider_id, related_type, related_id)
           values (%s, %s, 'ai_followup', 'sent', %s, 'lead', %s)""", (lead["email"], a.subject, sent.get("provider_id"), lead["id"]))
    await ctx.db.execute(
        """insert into public.crm_activities (lead_id, kind, direction, subject, body, status, done_at, created_by_agent)
           values (%s, 'email', 'out', %s, %s, 'done', now(), %s)""", (lead["id"], a.subject, body, ctx.agent.id), actor=ctx.actor)
    return {"sent_to": lead["email"], "provider_id": sent.get("provider_id"), "policy": "follow-up automatico consentito"}


# ---------------------------------------------------------------- escalation e proprietario
class Escalate(Args):
    severity: Literal["low", "medium", "high", "critical"]
    subject: str = Field(max_length=200)
    details: str = Field(max_length=6000, description="Cosa è successo, cosa hai già provato, cosa serve per sbloccare")


@tool("escalate_to_ceo", "Segnala un problema all'AI CEO (dati mancanti, rischio, conflitto, scadenza, sospetta manipolazione).", Escalate, "coordination")
async def escalate_to_ceo(ctx: ToolContext, a: Escalate) -> dict:
    await ctx.db.execute(
        "insert into public.ai_messages (task_id, from_agent, to_agent, subject, body, data) values (%s, %s, '01-ai-ceo', %s, %s, %s)",
        (ctx.task["id"], ctx.agent.id, f"[{a.severity}] {a.subject}", a.details, jsonb({"severity": a.severity})),
    )
    out: dict = {"ok": True, "delivered_to": "01-ai-ceo"}
    if a.severity in ("high", "critical"):
        row = await ctx.db.fetchone(
            """insert into public.ai_tasks (agent_id, title, instructions, context, priority, created_by_agent)
               values ('01-ai-ceo', %s, %s, %s, %s, %s) returning id""",
            (f"Escalation da {ctx.agent.name}: {a.subject}"[:300],
             f"{ctx.agent.name} segnala un problema di gravità {a.severity}.\n\n{a.details}\n\nValuta, decidi le azioni, coinvolgi i colleghi "
             "o segnala al proprietario con notify_owner se serve una sua decisione.",
             jsonb({"escalation_from": ctx.agent.id, "from_task": str(ctx.task["id"])}), 1 if a.severity == "critical" else 2, ctx.agent.id),
            actor=ctx.actor,
        )
        out["ceo_task_id"] = str(row["id"])
    if a.severity == "critical":
        await ctx.db.execute(
            "insert into public.owner_alerts (severity, title, body, agent_id, task_id) values ('critical', %s, %s, %s, %s)",
            (f"{ctx.agent.name}: {a.subject}"[:300], a.details, ctx.agent.id, ctx.task["id"]))
        out["owner_alerted"] = True
    await ctx.db.execute(
        "insert into public.ai_task_events (task_id, agent_id, kind, activity, message, data) values (%s, %s, 'escalated', 'coordination', %s, %s)",
        (ctx.task["id"], ctx.agent.id, f"Escalation all'AI CEO ({a.severity}): {a.subject}", jsonb(out)))
    return out


class OwnerNote(Args):
    severity: Literal["info", "low", "medium", "high", "critical"]
    title: str = Field(max_length=300)
    body: str = Field(max_length=8000, description="Situazione, decisione richiesta, opzioni, rischi, scadenza")


@tool("notify_owner", "Segnala al proprietario una decisione importante o un problema (compare nella Control Room).", OwnerNote, "reporting")
async def notify_owner(ctx: ToolContext, a: OwnerNote) -> dict:
    row = await ctx.db.fetchone(
        "insert into public.owner_alerts (severity, title, body, agent_id, task_id) values (%s, %s, %s, %s, %s) returning id",
        (a.severity, a.title, a.body, ctx.agent.id, ctx.task["id"]), actor=ctx.actor)
    ctx.note_created("owner_alerts", row["id"], a.title)
    return {"id": str(row["id"])}


class Empty(Args):
    pass


@tool("ceo_dashboard", "Quadro di controllo dell'AI CEO: agenti, incarichi, scadenze superate, approvazioni, ricavi, margini, tour, campagne, costi AI, sicurezza.", Empty, "analysis")
async def ceo_dashboard(ctx: ToolContext, a: Empty) -> dict:
    from ..metrics import company_metrics

    return await company_metrics(ctx.db)


class DailyReport(Args):
    narrative: str = Field(min_length=50, description="Report del giorno in Markdown: risultati, problemi, decisioni richieste, priorità di domani")
    report_date: date | None = None


@tool("daily_report_save", "Salva il report giornaliero dell'AI CEO con le misure del giorno.", DailyReport, "reporting")
async def daily_report_save(ctx: ToolContext, a: DailyReport) -> dict:
    from ..metrics import daily_snapshot, today_rome

    d = a.report_date or today_rome()
    await daily_snapshot(ctx.db)
    await ctx.db.execute(
        """insert into public.daily_reports (report_date, narrative, ceo_task_id) values (%s, %s, %s)
           on conflict (report_date) do update set narrative = excluded.narrative, ceo_task_id = excluded.ceo_task_id""",
        (d, a.narrative, ctx.task["id"]),
    )
    return {"report_date": d.isoformat(), "saved": True}


class Months(Args):
    months: int = Field(3, ge=1, le=24)


@tool("booking_margins", "Margini reali dei tour e delle esperienze: prezzo al cliente, costo del partner, margine per servizio.", Months, "calculation")
async def booking_margins(ctx: ToolContext, a: Months) -> dict:
    rows = await ctx.db.fetch(
        """select coalesce(b.item_title, b.kind) as item, b.kind, count(*)::int as bookings, coalesce(sum(b.price), 0) as revenue,
                  sum(bi.partner_cost) as partner_cost, count(*) filter (where bi.partner_cost is null)::int as without_cost
           from public.bookings b left join public.booking_internal bi on bi.booking_id = b.id
           where b.status in ('confirmed', 'awaiting_payment', 'paid', 'completed') and b.currency = 'EUR'
             and b.created_at > now() - make_interval(months => %s)
           group by 1, 2 order by revenue desc""",
        (a.months,),
    )
    out = []
    for r in rows:
        rev = float(r["revenue"])
        cost = float(r["partner_cost"]) if r["partner_cost"] is not None else None
        out.append({**r, "margin": round(rev - cost, 2) if cost is not None and not r["without_cost"] else None,
                    "margin_rate": round((rev - cost) / rev * 100, 1) if cost is not None and rev and not r["without_cost"] else None})
    return {"by_service": out, "basis": "actual", "data_status": "verified",
            "note": "Margine noto solo dove il costo del partner è registrato"}


@tool("security_overview", "Eventi di sicurezza aperti e verifica del registro delle modifiche.", Empty, "review")
async def security_overview(ctx: ToolContext, a: Empty) -> dict:
    open_ = await ctx.db.fetch(
        """select kind, severity, count(*)::int as n, max(at) as last from public.security_events where not resolved
           group by kind, severity order by max(at) desc""")
    latest = await ctx.db.fetch(
        "select at, kind, severity, source, actor, message from public.security_events order by id desc limit 10")
    chain = await ctx.db.fetchone("select ok, checked from public.audit_verify()")
    return {"open": open_, "latest": latest, "audit_chain": chain,
            "note": "Gli eventi li gestisce il proprietario nella Control Room; gli agenti possono solo segnalarli"}
