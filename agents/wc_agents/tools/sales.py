"""Lead, CRM, opportunità, preventivi ed email commerciali (sempre da approvare)."""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Literal
from urllib.parse import urlparse

from pydantic import Field, field_validator

from ..db import jsonb
from .base import Args, DataStatus, ToolContext, ToolError, tool
from .collab import create_approval

SEGMENTS = Literal["importer", "distributor", "architect", "designer", "fabricator", "contractor", "developer", "hospitality", "retailer", "other"]


def dedupe_key(company: str, website: str | None, country: str | None) -> str:
    if website:
        host = urlparse(website if "://" in website else f"https://{website}").hostname or ""
        host = re.sub(r"^www\.", "", host.lower())
        if host:
            return host
    name = re.sub(r"[^a-z0-9]+", "-", company.lower()).strip("-")
    name = re.sub(r"-(llc|ltd|srl|spa|sa|gmbh|inc|co|fze|fzco|llp|bv)$", "", name)
    return f"{name}|{(country or '').upper()}"


class LeadSearch(Args):
    query: str = ""
    country: str | None = Field(None, description="Codice ISO a due lettere")
    segment: SEGMENTS | None = None
    qualification: Literal["new", "qualified", "disqualified", "contacted", "converted"] | None = None
    limit: int = Field(30, ge=1, le=100)


@tool("lead_search", "Cerca lead e contatti nel CRM.", LeadSearch, "crm")
async def lead_search(ctx: ToolContext, a: LeadSearch) -> dict:
    rows = await ctx.db.fetch(
        """select id, company_name, website, country, city, segment, contact_name, contact_role, email, source_url, retrieved_at,
                  data_status, qualification, score, consent_status, created_by_agent
           from public.leads
           where (%(q)s = '' or company_name ilike %(like)s or coalesce(notes, '') ilike %(like)s or coalesce(website, '') ilike %(like)s)
             and (%(c)s::text is null or country = %(c)s) and (%(s)s::text is null or segment = %(s)s)
             and (%(ql)s::text is null or qualification = %(ql)s)
           order by created_at desc limit %(l)s""",
        {"q": a.query, "like": f"%{a.query}%", "c": a.country.upper() if a.country else None, "s": a.segment, "ql": a.qualification, "l": a.limit},
    )
    total = await ctx.db.fetchone("select count(*)::int as n from public.leads")
    return {"results": rows, "total_leads_in_crm": total["n"] if total else 0}


class LeadSave(Args):
    company_name: str = Field(min_length=2, max_length=300)
    website: str | None = None
    country: str | None = Field(None, description="Codice ISO a due lettere, per esempio AE")
    city: str | None = None
    segment: SEGMENTS = "other"
    contact_name: str | None = None
    contact_role: str | None = None
    email: str | None = Field(None, description="Solo indirizzi aziendali pubblicati dall'azienda stessa")
    phone: str | None = None
    source_url: str = Field(description="Pagina pubblica da cui viene l'informazione")
    source_note: str | None = None
    data_status: DataStatus = "unknown"
    notes: str | None = None

    @field_validator("country")
    @classmethod
    def iso(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip().upper()
        if not re.fullmatch(r"[A-Z]{2}", v):
            raise ValueError("usa il codice ISO a due lettere del Paese")
        return v

    @field_validator("source_url")
    @classmethod
    def url(cls, v: str) -> str:
        if not re.match(r"^https?://", v.strip()):
            raise ValueError("la fonte deve essere un indirizzo web (http/https)")
        return v.strip()


@tool("lead_save", "Salva un lead nel CRM con fonte e data; se esiste già (stesso sito o nome e Paese) lo aggiorna senza duplicarlo.", LeadSave, "crm")
async def lead_save(ctx: ToolContext, a: LeadSave) -> dict:
    key = dedupe_key(a.company_name, a.website, a.country)
    if a.email:
        sup = await ctx.db.fetchone(
            "select 1 from public.suppression_list where email = %s or domain = %s", (a.email, a.email.split("@")[-1].lower())
        )
        if sup:
            a.email = None  # escluso: non si registra l'indirizzo
    existing = await ctx.db.fetchone("select id, qualification from public.leads where dedupe_key = %s", (key,))
    if existing:
        await ctx.db.execute(
            """update public.leads set website = coalesce(website, %s), city = coalesce(city, %s), contact_name = coalesce(contact_name, %s),
                 contact_role = coalesce(contact_role, %s), email = coalesce(email, %s), phone = coalesce(phone, %s),
                 notes = concat_ws(E'\n', notes, %s::text) where id = %s""",
            (a.website, a.city, a.contact_name, a.contact_role, a.email, a.phone,
             f"[{datetime.now():%Y-%m-%d}] fonte aggiuntiva: {a.source_url}", existing["id"]),
            actor=ctx.actor,
        )
        return {"id": str(existing["id"]), "duplicate": True, "message": "Lead già presente: aggiornati solo i campi vuoti"}
    row = await ctx.db.fetchone(
        """insert into public.leads (company_name, website, country, city, segment, contact_name, contact_role, email, phone,
                                     source_url, source_note, data_status, notes, dedupe_key, created_by_agent)
           values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) returning id""",
        (a.company_name, a.website, a.country, a.city, a.segment, a.contact_name, a.contact_role, a.email, a.phone,
         a.source_url, a.source_note, a.data_status, a.notes, key, ctx.agent.id),
        actor=ctx.actor,
    )
    ctx.note_created("leads", row["id"], a.company_name)
    return {"id": str(row["id"]), "duplicate": False}


class LeadUpdate(Args):
    lead_id: str
    qualification: Literal["new", "qualified", "disqualified", "contacted", "converted"] | None = None
    score: int | None = Field(None, ge=0, le=100)
    score_reason: str | None = None
    notes: str | None = None


@tool("lead_update", "Aggiorna qualifica, punteggio e note di un lead.", LeadUpdate, "crm")
async def lead_update(ctx: ToolContext, a: LeadUpdate) -> dict:
    row = await ctx.db.fetchone(
        """update public.leads set qualification = coalesce(%s, qualification), score = coalesce(%s, score),
             score_reason = coalesce(%s, score_reason), notes = case when %s::text is null then notes else concat_ws(E'\n', notes, %s::text) end
           where id = %s returning id""",
        (a.qualification, a.score, a.score_reason, a.notes, a.notes, a.lead_id),
        actor=ctx.actor,
    )
    if not row:
        raise ToolError("Lead non trovato")
    return {"ok": True}


class Activity(Args):
    lead_id: str | None = None
    customer_id: str | None = None
    opportunity_id: str | None = None
    kind: Literal["note", "email", "call", "meeting", "follow_up", "task"]
    subject: str = Field(max_length=300)
    body: str | None = None
    due_at: datetime | None = Field(None, description="Scadenza del follow-up")


@tool("crm_add_activity", "Registra nel CRM una nota, un follow-up o un'attività da fare (non invia nulla).", Activity, "crm")
async def crm_add_activity(ctx: ToolContext, a: Activity) -> dict:
    if not (a.lead_id or a.customer_id or a.opportunity_id):
        raise ToolError("Indica lead_id, customer_id o opportunity_id")
    row = await ctx.db.fetchone(
        """insert into public.crm_activities (lead_id, customer_id, opportunity_id, kind, subject, body, due_at, created_by_agent)
           values (%s, %s, %s, %s, %s, %s, %s, %s) returning id""",
        (a.lead_id, a.customer_id, a.opportunity_id, a.kind, a.subject, a.body, a.due_at, ctx.agent.id),
        actor=ctx.actor,
    )
    ctx.note_created("crm_activities", row["id"], a.subject)
    return {"id": str(row["id"])}


class Opportunity(Args):
    id: str | None = Field(None, description="Per aggiornare un'opportunità esistente")
    title: str = Field(max_length=300)
    lead_id: str | None = None
    customer_id: str | None = None
    stage: Literal["new", "qualified", "proposal", "negotiation", "won", "lost"] = "new"
    model: Literal["trading", "brokerage"] | None = None
    estimated_value: float | None = None
    value_status: DataStatus = "unknown"
    currency: str = "EUR"
    probability: int | None = Field(None, ge=0, le=100)
    expected_close: date | None = None
    next_step: str | None = None
    notes: str | None = None


@tool("opportunity_save", "Crea o aggiorna un'opportunità commerciale nella pipeline.", Opportunity, "crm")
async def opportunity_save(ctx: ToolContext, a: Opportunity) -> dict:
    if a.estimated_value is not None and a.value_status == "verified":
        raise ToolError("Il valore di un'opportunità aperta è una stima: usa estimated o assumed")
    if a.id:
        row = await ctx.db.fetchone(
            """update public.opportunities set title = %s, stage = %s, model = coalesce(%s, model), estimated_value = coalesce(%s, estimated_value),
                 value_status = %s, probability = coalesce(%s, probability), expected_close = coalesce(%s, expected_close),
                 next_step = coalesce(%s, next_step), notes = coalesce(%s, notes) where id = %s returning id""",
            (a.title, a.stage, a.model, a.estimated_value, a.value_status, a.probability, a.expected_close, a.next_step, a.notes, a.id),
            actor=ctx.actor,
        )
        if not row:
            raise ToolError("Opportunità non trovata")
        return {"id": str(row["id"]), "updated": True}
    row = await ctx.db.fetchone(
        """insert into public.opportunities (title, lead_id, customer_id, stage, model, estimated_value, value_status, currency, probability,
                                             expected_close, next_step, notes, created_by_agent)
           values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) returning id""",
        (a.title, a.lead_id, a.customer_id, a.stage, a.model, a.estimated_value, a.value_status, a.currency, a.probability,
         a.expected_close, a.next_step, a.notes, ctx.agent.id),
        actor=ctx.actor,
    )
    ctx.note_created("opportunities", row["id"], a.title)
    return {"id": str(row["id"]), "created": True}


class Empty(Args):
    pass


@tool("pipeline_summary", "Riepilogo della pipeline: lead per stato, opportunità per fase e modello, follow-up scaduti.", Empty, "analysis")
async def pipeline_summary(ctx: ToolContext, a: Empty) -> dict:
    leads = await ctx.db.fetch("select qualification, count(*)::int as n from public.leads group by 1 order by 1")
    opps = await ctx.db.fetch(
        """select stage, coalesce(model, 'n.d.') as model, count(*)::int as n, coalesce(sum(estimated_value), 0) as value,
                  coalesce(sum(estimated_value * coalesce(probability, 0) / 100.0), 0) as weighted
           from public.opportunities group by 1, 2 order by 1, 2"""
    )
    overdue = await ctx.db.fetchone("select count(*)::int as n from public.crm_activities where status = 'open' and due_at < now()")
    return {"leads_by_status": leads, "opportunities": opps, "overdue_followups": overdue["n"] if overdue else 0,
            "note": "I valori delle opportunità sono stime commerciali, non ricavi"}


class Suppression(Args):
    email: str


@tool("suppression_check", "Controlla se un indirizzo o il suo dominio è nella lista di esclusione o ha negato il consenso.", Suppression, "review")
async def suppression_check(ctx: ToolContext, a: Suppression) -> dict:
    domain = a.email.split("@")[-1].lower()
    sup = await ctx.db.fetchone("select reason from public.suppression_list where email = %s or domain = %s", (a.email, domain))
    lead = await ctx.db.fetchone("select consent_status from public.leads where email = %s", (a.email,))
    return {"suppressed": bool(sup), "reason": sup["reason"] if sup else None, "consent_status": lead["consent_status"] if lead else "unknown"}


class EmailDraft(Args):
    lead_id: str | None = None
    to_email: str | None = None
    subject: str = Field(max_length=200)
    body: str = Field(max_length=8000, description="Testo dell'email. Nessun dato su fornitori, costi o margini")
    lang: str = "en"
    legal_basis: Literal["legitimate_interest", "opt_in", "existing_customer"] = Field(description="Base giuridica dell'invio")


@tool("email_draft", "Prepara un'email commerciale e chiede l'approvazione per inviarla. Non invia nulla da sola.", EmailDraft, "writing")
async def email_draft(ctx: ToolContext, a: EmailDraft) -> dict:
    to = a.to_email
    if a.lead_id:
        lead = await ctx.db.fetchone("select email, consent_status, company_name from public.leads where id = %s", (a.lead_id,))
        if not lead:
            raise ToolError("Lead non trovato")
        to = to or lead["email"]
        if lead["consent_status"] == "opted_out":
            raise ToolError("Il contatto ha negato il consenso: non si può scrivere")
    if not to:
        raise ToolError("Manca l'indirizzo del destinatario")
    domain = to.split("@")[-1].lower()
    if await ctx.db.fetchone("select 1 from public.suppression_list where email = %s or domain = %s", (to, domain)):
        raise ToolError("Indirizzo nella lista di esclusione")
    asset = await ctx.db.fetchone(
        """insert into public.marketing_assets (kind, title, body, lang, channel, created_by_agent, task_id)
           values ('email', %s, %s, %s, 'email', %s, %s) returning id""",
        (a.subject, a.body, a.lang, ctx.agent.id, ctx.task["id"]),
        actor=ctx.actor,
    )
    res = await create_approval(
        ctx, "outbound_message", f"Email a {to}: {a.subject}",
        f"Invio di un'email commerciale a {to} (base giuridica: {a.legal_basis}). Testo nella richiesta.",
        None, None, {"to": to, "subject": a.subject, "body": a.body, "lead_id": a.lead_id, "asset_id": str(asset["id"]), "legal_basis": a.legal_basis},
    )
    await ctx.db.execute("update public.marketing_assets set approval_id = %s where id = %s", (res["approval_id"], asset["id"]), actor=ctx.actor)
    return {**res, "asset_id": str(asset["id"])}


class QuoteItem(Args):
    description: str
    marble_slug: str | None = None
    finish: str | None = None
    thickness: str | None = None
    quantity: float = Field(gt=0)
    unit: str = "m2"
    unit_price: float = Field(ge=0)
    price_status: DataStatus = Field(description="verified solo se il prezzo viene da un costo documentato e da una simulazione salvata")


class QuoteDraft(Args):
    customer_id: str | None = None
    lead_id: str | None = None
    customer_name: str | None = None
    customer_email: str | None = None
    customer_company: str | None = None
    model: Literal["trading", "brokerage"]
    fulfilment_mode: Literal["own_stock", "showroom_stock", "supplier_direct"]
    currency: str = "EUR"
    incoterm: str | None = None
    valid_until: date | None = None
    payment_terms: str | None = None
    delivery_terms: str | None = None
    items: list[QuoteItem] = Field(min_length=1)
    notes: str | None = None
    request_send_approval: bool = Field(False, description="True per chiedere al fondatore l'approvazione all'invio")


@tool("quote_draft", "Crea un preventivo in bozza (con versione 1) e, se richiesto, chiede l'approvazione all'invio.", QuoteDraft, "writing")
async def quote_draft(ctx: ToolContext, a: QuoteDraft) -> dict:
    name, email, company = a.customer_name, a.customer_email, a.customer_company
    if a.lead_id:
        lead = await ctx.db.fetchone("select company_name, contact_name, email from public.leads where id = %s", (a.lead_id,))
        if not lead:
            raise ToolError("Lead non trovato")
        company = company or lead["company_name"]
        name = name or lead["contact_name"]
        email = email or lead["email"]
    weak = [i.description for i in a.items if i.price_status != "verified"]
    note = a.notes or ""
    if weak:
        note = (note + "\n" if note else "") + "Prezzi indicativi da confermare: " + "; ".join(weak)
    async with ctx.db.tx(ctx.actor) as c:
        cur = await c.execute(
            """insert into public.quotes (customer_id, customer_name, customer_email, customer_company, model, fulfilment_mode, currency,
                                          incoterm, valid_until, payment_terms, delivery_terms, notes, status)
               values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'draft') returning id, number""",
            (a.customer_id, name, email, company, a.model, a.fulfilment_mode, a.currency, a.incoterm, a.valid_until,
             a.payment_terms, a.delivery_terms, note),
        )
        q = await cur.fetchone()
        for pos, it in enumerate(a.items):
            await c.execute(
                """insert into public.quote_items (quote_id, position, marble_slug, description, finish, thickness, quantity, unit, unit_price)
                   values (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (q["id"], pos, it.marble_slug, it.description, it.finish, it.thickness, it.quantity, it.unit, it.unit_price),
            )
        await c.execute(
            "insert into public.quote_versions (quote_id, version, snapshot, created_by_agent) values (%s, 1, %s, %s)",
            (q["id"], jsonb(a.model_dump(mode="json")), ctx.agent.id),
        )
    ctx.note_created("quotes", q["id"], q["number"])
    out = {"quote_id": str(q["id"]), "number": q["number"], "status": "draft", "unverified_prices": weak}
    if a.request_send_approval:
        total = sum(i.quantity * i.unit_price for i in a.items)
        out["approval"] = await create_approval(
            ctx, "binding_quote", f"Invio preventivo {q['number']} a {company or name or email}",
            f"Preventivo {a.model} ({a.fulfilment_mode}) di {total:,.2f} {a.currency}." + (f" Prezzi da confermare: {len(weak)} righe." if weak else ""),
            total, a.currency, {"quote_id": str(q["id"])},
        )
    return out
