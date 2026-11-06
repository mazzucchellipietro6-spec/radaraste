"""Pricing RESALE / BROKERAGE, analisi dei mercati, materiali di marketing, finanza e quadro aziendale."""

from __future__ import annotations

import re
from datetime import date
from typing import Any, Literal

from pydantic import Field, field_validator

from .. import pricing
from ..db import jsonb
from .base import Args, DataStatus, ToolContext, ToolError, tool

AMOUNT_HELP = (
    'Ogni importo è {"value": numero, "status": "verified|estimated|assumed|unknown"}. '
    "RESALE: incoterm (EXW, FCA, FAS, FOB, CFR, CIF, CPT, CIP, DAP, DPU, DDP), currency, unit, quantity, purchase_unit_cost, "
    "processing_cost, packaging_cost, freight_cost, insurance_rate (%) o insurance_cost, duties_rate (%), taxes_rate (%), "
    "payment_fee_rate (%), target_margin_rate (%). "
    "BROKERAGE: deal_value, commission_rate (%), fixed_fee, travel_cost, samples_cost, other_costs, payment_fee_rate (%), commission_payer."
)


class PricingSimulate(Args):
    model: Literal["resale", "brokerage"]
    inputs: dict[str, Any] = Field(description=AMOUNT_HELP)
    title: str = Field("", max_length=200, description="Titolo per salvare la simulazione")
    save: bool = True


@tool("pricing_simulate", "Calcola prezzo e margine RESALE o commissione BROKERAGE con lo stesso motore del pannello; salva la simulazione.", PricingSimulate, "calculation")
async def pricing_simulate(ctx: ToolContext, a: PricingSimulate) -> dict:
    try:
        out = pricing.simulate(a.model, a.inputs)
    except pricing.PricingError as e:
        raise ToolError(str(e)) from e
    if a.save:
        row = await ctx.db.fetchone(
            """insert into public.pricing_simulations (title, model, currency, inputs, outputs, created_by_agent, task_id)
               values (%s, %s, %s, %s, %s, %s, %s) returning id""",
            (a.title or f"Simulazione {a.model} {date.today():%d/%m/%Y}", a.model, a.inputs.get("currency", "EUR"),
             jsonb(a.inputs), jsonb(out), ctx.agent.id, ctx.task["id"]),
            actor=ctx.actor,
        )
        out["simulation_id"] = str(row["id"])
        ctx.note_created("pricing_simulations", row["id"], a.title or a.model)
    return out


class Source(Args):
    url: str
    title: str = ""
    retrieved_at: date | None = None

    @field_validator("url")
    @classmethod
    def http(cls, v: str) -> str:
        if not re.match(r"^https?://", v.strip()):
            raise ValueError("la fonte deve essere un indirizzo web")
        return v.strip()


class MarketSave(Args):
    country: str = Field(description="Codice ISO a due lettere")
    title: str = Field(max_length=300)
    summary: str
    import_requirements: str | None = None
    documents: str | None = Field(None, description="Documenti doganali e commerciali richiesti")
    logistics: str | None = None
    risks: str | None = None
    opportunity: str | None = None
    sources: list[Source] = []
    data_status: DataStatus

    @field_validator("country")
    @classmethod
    def iso(cls, v: str) -> str:
        v = v.strip().upper()
        if not re.fullmatch(r"[A-Z]{2}", v):
            raise ValueError("usa il codice ISO a due lettere")
        return v


@tool("market_analysis_save", "Salva un'analisi di mercato per un Paese (requisiti di importazione, documenti, logistica, rischi) con le fonti.", MarketSave, "writing")
async def market_analysis_save(ctx: ToolContext, a: MarketSave) -> dict:
    if a.data_status == "verified" and not a.sources:
        raise ToolError("Un'analisi verificata deve citare le fonti")
    row = await ctx.db.fetchone(
        """insert into public.market_analyses (country, title, summary, import_requirements, documents, logistics, risks, opportunity,
                                               sources, data_status, created_by_agent, task_id)
           values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) returning id""",
        (a.country, a.title, a.summary, a.import_requirements, a.documents, a.logistics, a.risks, a.opportunity,
         jsonb([s.model_dump(mode="json") for s in a.sources]), a.data_status, ctx.agent.id, ctx.task["id"]),
        actor=ctx.actor,
    )
    ctx.note_created("market_analyses", row["id"], f"{a.country} — {a.title}")
    return {"id": str(row["id"])}


class MarketSearch(Args):
    country: str | None = None
    query: str = ""
    limit: int = Field(10, ge=1, le=50)


@tool("market_analysis_search", "Cerca le analisi di mercato già fatte.", MarketSearch, "research")
async def market_analysis_search(ctx: ToolContext, a: MarketSearch) -> dict:
    rows = await ctx.db.fetch(
        """select id, country, title, summary, import_requirements, documents, logistics, risks, opportunity, sources, data_status,
                  status, created_by_agent, created_at
           from public.market_analyses
           where (%(c)s::text is null or country = %(c)s) and (%(q)s = '' or title ilike %(like)s or summary ilike %(like)s)
             and status <> 'archived'
           order by created_at desc limit %(l)s""",
        {"c": a.country.upper() if a.country else None, "q": a.query, "like": f"%{a.query}%", "l": a.limit},
    )
    return {"results": rows}


class AssetSave(Args):
    kind: Literal["seo", "content", "campaign", "catalog", "ad", "strategy"]
    title: str = Field(max_length=300)
    body: str = Field(description="Testo completo in Markdown")
    lang: str = "it"
    channel: str | None = Field(None, description="sito, linkedin, instagram, google_ads, catalogo, ...")


@tool("marketing_asset_save", "Salva un materiale di marketing in bozza (articolo, SEO, campagna, catalogo, annuncio, strategia). Non pubblica nulla.", AssetSave, "writing")
async def marketing_asset_save(ctx: ToolContext, a: AssetSave) -> dict:
    row = await ctx.db.fetchone(
        """insert into public.marketing_assets (kind, title, body, lang, channel, created_by_agent, task_id)
           values (%s, %s, %s, %s, %s, %s, %s) returning id""",
        (a.kind, a.title, a.body, a.lang, a.channel, ctx.agent.id, ctx.task["id"]),
        actor=ctx.actor,
    )
    ctx.note_created("marketing_assets", row["id"], a.title)
    return {"id": str(row["id"]), "status": "draft", "message": "Bozza salvata: la pubblicazione la decide il fondatore"}


class AssetSearch(Args):
    kind: Literal["seo", "content", "campaign", "email", "catalog", "ad", "strategy"] | None = None
    query: str = ""
    limit: int = Field(15, ge=1, le=50)


@tool("marketing_search", "Cerca materiali di marketing esistenti.", AssetSearch, "research")
async def marketing_search(ctx: ToolContext, a: AssetSearch) -> dict:
    rows = await ctx.db.fetch(
        """select id, kind, title, left(body, 1200) as excerpt, lang, channel, status, created_by_agent, created_at
           from public.marketing_assets
           where (%(k)s::text is null or kind = %(k)s) and (%(q)s = '' or title ilike %(like)s or body ilike %(like)s)
           order by created_at desc limit %(l)s""",
        {"k": a.kind, "q": a.query, "like": f"%{a.query}%", "l": a.limit},
    )
    return {"results": rows}


class Period(Args):
    month: str | None = Field(None, description="Mese AAAA-MM; vuoto per il mese in corso")


def _month_bounds(month: str | None) -> tuple[date, date]:
    if month:
        if not re.fullmatch(r"\d{4}-\d{2}", month):
            raise ToolError("Mese nel formato AAAA-MM")
        y, m = map(int, month.split("-"))
    else:
        t = date.today()
        y, m = t.year, t.month
    start = date(y, m, 1)
    end = date(y + (m == 12), m % 12 + 1, 1)
    return start, end


async def finance_report(db, month: str | None = None) -> dict:
    """Ricavi reali del mese dai record del gestionale. RESALE e BROKERAGE restano voci separate."""
    start, end = _month_bounds(month)
    p = {"s": start, "e": end}
    resale = await db.fetch(
        """select o.currency, count(*)::int as orders, coalesce(sum(o.total), 0) as revenue,
                  coalesce(sum(d.purchase_cost + coalesce(d.logistics_cost, 0) + coalesce(d.other_costs, 0))
                           filter (where d.purchase_cost is not null), 0) as costs,
                  coalesce(sum(o.total) filter (where d.purchase_cost is not null), 0) as revenue_with_costs,
                  count(*) filter (where d.purchase_cost is null)::int as orders_without_costs
           from public.orders o left join public.deals d on d.id = o.deal_id
           where o.status <> 'cancelled' and o.created_at >= %(s)s and o.created_at < %(e)s
             and (d.id is null or d.model = 'trading')
           group by o.currency""",
        p,
    )
    brokerage = await db.fetch(
        """select currency,
                  coalesce(sum(amount) filter (where status in ('invoiced', 'paid') and coalesce(paid_at, due_date, created_at::date) >= %(s)s
                                                 and coalesce(paid_at, due_date, created_at::date) < %(e)s), 0) as earned,
                  coalesce(sum(amount) filter (where status = 'paid' and paid_at >= %(s)s and paid_at < %(e)s), 0) as collected,
                  coalesce(sum(amount) filter (where status = 'expected'), 0) as expected_open
           from public.commissions group by currency""",
        p,
    )
    gmv = await db.fetch(
        """select currency, count(*)::int as deals, coalesce(sum(deal_value), 0) as gmv
           from public.deals where model = 'brokerage' and stage in ('agreed', 'ordered', 'delivered', 'closed_won')
             and updated_at >= %(s)s and updated_at < %(e)s group by currency""",
        p,
    )
    cash = await db.fetch(
        """select currency, kind, coalesce(sum(amount), 0) as amount, count(*)::int as n
           from public.payments where status = 'paid' and paid_at >= %(s)s and paid_at < %(e)s group by currency, kind""",
        p,
    )
    receivables = await db.fetch(
        """select currency, coalesce(sum(total - paid_amount), 0) as open_amount
           from public.orders where status <> 'cancelled' and payment_status in ('unpaid', 'partial') group by currency""",
    )
    pipeline = await db.fetch(
        """select coalesce(model, 'n.d.') as model, currency, coalesce(sum(estimated_value * coalesce(probability, 0) / 100.0), 0) as weighted
           from public.opportunities where stage not in ('won', 'lost') group by 1, 2""",
    )
    ai = await db.fetchone("select coalesce(sum(cost_usd), 0) as usd from public.ai_usage where at >= %(s)s and at < %(e)s", p)
    target_row = await db.fetchone("select value from public.ai_settings where key = 'monthly_revenue_target'")
    target = float((target_row or {}).get("value", {}).get("amount", 30000))

    def eur(rows: list[dict], key: str) -> float:
        return float(sum(r[key] for r in rows if r["currency"] == "EUR"))

    resale_eur = eur(resale, "revenue")
    commissions_eur = eur(brokerage, "earned")
    revenue = resale_eur + commissions_eur
    margin_known = eur(resale, "revenue_with_costs") - eur(resale, "costs")
    return {
        "period": {"from": start.isoformat(), "to": end.isoformat()},
        "data_status": "verified",
        "source": "record del gestionale (ordini, trattative, commissioni, pagamenti)",
        "resale": {"by_currency": resale, "revenue_eur": resale_eur, "gross_margin_known_eur": margin_known,
                   "note": "Margine calcolato solo sugli ordini con costi registrati nella trattativa"},
        "brokerage": {"commissions_by_currency": brokerage, "commission_revenue_eur": commissions_eur,
                      "gmv_intermediated": gmv, "note": "Il valore intermediato non è un ricavo"},
        "revenue_total_eur": revenue,
        "cash_in": cash,
        "receivables_open": receivables,
        "pipeline_weighted": pipeline,
        "target": {"amount_eur": target, "gap_eur": round(target - revenue, 2),
                   "progress_pct": round(revenue / target * 100, 1) if target else None,
                   "note": "Obiettivo, non previsione"},
        "ai_costs_usd": float(ai["usd"]) if ai else 0.0,
        "other_currencies": sorted({r["currency"] for r in resale + brokerage if r["currency"] != "EUR"}),
    }


@tool("finance_summary", "Ricavi reali del mese (RESALE e commissioni BROKERAGE separati), margini noti, incassi, crediti, obiettivo.", Period, "calculation")
async def finance_summary(ctx: ToolContext, a: Period) -> dict:
    return await finance_report(ctx.db, a.month)


class Empty(Args):
    pass


async def overview(db) -> dict:
    row = await db.fetchone(
        """select
             (select count(*) from public.leads)::int as leads,
             (select count(*) from public.leads where qualification = 'qualified')::int as leads_qualified,
             (select count(*) from public.opportunities where stage not in ('won', 'lost'))::int as opportunities_open,
             (select count(*) from public.quotes where status = 'draft')::int as quotes_draft,
             (select count(*) from public.quotes where status = 'sent')::int as quotes_sent,
             (select count(*) from public.orders where status not in ('delivered', 'cancelled'))::int as orders_open,
             (select count(*) from public.shipments where status = 'in_transit')::int as shipments_in_transit,
             (select count(*) from public.suppliers where active)::int as suppliers_active,
             (select count(*) from public.suppliers where verification_status = 'verified')::int as suppliers_verified,
             (select count(*) from public.materials where active and availability = 'available'
                and availability_source is not null and (recheck_at is null or recheck_at > now()))::int as materials_available_proven,
             (select count(*) from public.materials where active and recheck_at < now())::int as materials_to_recheck,
             (select count(*) from public.approvals where status = 'pending')::int as approvals_pending,
             (select count(*) from public.ai_tasks where status in ('queued', 'running', 'waiting'))::int as tasks_active,
             (select count(*) from public.requests where status = 'new')::int as requests_new"""
    )
    return {"counts": row, "data_status": "verified", "source": "conteggi sul database"}


@tool("company_overview", "Quadro dell'azienda: lead, opportunità, preventivi, ordini, fornitori, disponibilità, approvazioni.", Empty, "analysis")
async def company_overview(ctx: ToolContext, a: Empty) -> dict:
    return await overview(ctx.db)
