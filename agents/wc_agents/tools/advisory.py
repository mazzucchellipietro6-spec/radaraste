"""Team EXECUTIVE & PROFESSIONAL ADVISORY: ingegneria gestionale, avvocato aziendale AI, commercialista AI.

- Misure dei processi, redditività, performance commerciali, storico e previsioni: letti dal gestionale.
- Documenti (procedure, KPI, report, analisi legali e fiscali) salvati in advisory_documents.
- I documenti legali e fiscali sono bozze di assistenti AI: revisione di un professionista abilitato
  obbligatoria (vincolo anche nel database).
"""

from __future__ import annotations

import re
from datetime import date
from typing import Literal

from pydantic import Field, field_validator

from ..db import jsonb
from .base import Args, DataStatus, ToolContext, ToolError, tool

DISCLAIMER_LEGAL = (
    "> Documento preparato da un assistente AI (Legal Counsel Agent) di WHITE CARRARA. Non è un parere legale "
    "professionale: prima di qualsiasi uso, firma o invio va verificato da un avvocato abilitato e approvato dal fondatore."
)
DISCLAIMER_TAX = (
    "> Documento preparato da un assistente AI (Tax & Accounting Advisor) di WHITE CARRARA. Non è una consulenza "
    "fiscale professionale né un adempimento: va verificato da un commercialista abilitato prima di qualsiasi uso."
)


def _metric(value, unit: str, n: int, note: str = "") -> dict:
    out = {"value": None if value is None else round(float(value), 2), "unit": unit, "sample": int(n or 0),
           "data_status": "verified" if n else "unknown"}
    if note:
        out["note"] = note
    if not n:
        out["note"] = (note + " " if note else "") + "Nessun dato nel periodo: la misura non è disponibile."
    return out


class Window(Args):
    days: int = Field(90, ge=7, le=730, description="Periodo di osservazione in giorni")


@tool("process_metrics", "Misure reali dei processi: tempi richiesta→preventivo→ordine→consegna, conversioni, follow-up scaduti, approvazioni, incarichi degli agenti.", Window, "analysis")
async def process_metrics(ctx: ToolContext, a: Window) -> dict:
    p = {"d": a.days}
    q = await ctx.db.fetchone(
        """select
             (select avg(extract(epoch from (q.created_at - r.created_at)) / 3600) from public.quotes q
                join public.requests r on r.id = q.request_id where q.created_at > now() - make_interval(days => %(d)s)) as req_to_quote_h,
             (select count(*) from public.quotes q where q.request_id is not null and q.created_at > now() - make_interval(days => %(d)s)) as req_to_quote_n,
             (select avg(extract(epoch from (sent_at - created_at)) / 3600) from public.quotes
                where sent_at is not null and created_at > now() - make_interval(days => %(d)s)) as quote_to_send_h,
             (select count(*) from public.quotes where sent_at is not null and created_at > now() - make_interval(days => %(d)s)) as quote_to_send_n,
             (select avg(extract(epoch from (o.created_at - coalesce(q.sent_at, q.created_at))) / 86400) from public.orders o
                join public.quotes q on q.id = o.quote_id where o.created_at > now() - make_interval(days => %(d)s)) as quote_to_order_d,
             (select count(*) from public.orders o where o.quote_id is not null and o.created_at > now() - make_interval(days => %(d)s)) as quote_to_order_n,
             (select avg(extract(epoch from (s.updated_at - o.created_at)) / 86400) from public.shipments s
                join public.orders o on o.id = s.order_id where s.status = 'delivered' and s.updated_at > now() - make_interval(days => %(d)s)) as order_to_delivery_d,
             (select count(*) from public.shipments s where s.status = 'delivered' and s.updated_at > now() - make_interval(days => %(d)s)) as order_to_delivery_n,
             (select count(*) filter (where status = 'accepted') from public.quotes where sent_at > now() - make_interval(days => %(d)s)) as q_acc,
             (select count(*) filter (where status in ('accepted', 'rejected', 'expired')) from public.quotes where sent_at > now() - make_interval(days => %(d)s)) as q_closed,
             (select count(*) from public.requests where status in ('new', 'in_progress') and created_at < now() - interval '2 days') as requests_stale,
             (select count(*) from public.requests where status in ('new', 'in_progress')) as requests_open,
             (select count(*) from public.crm_activities where status = 'open' and due_at < now()) as followups_overdue,
             (select count(*) from public.approvals where status = 'pending') as approvals_pending,
             (select avg(extract(epoch from (now() - created_at)) / 3600) from public.approvals where status = 'pending') as approvals_pending_age_h,
             (select avg(extract(epoch from (decided_at - created_at)) / 3600) from public.approvals
                where decided_at > now() - make_interval(days => %(d)s)) as approval_decision_h,
             (select count(*) from public.approvals where decided_at > now() - make_interval(days => %(d)s)) as approval_decision_n,
             (select count(*) from public.purchase_orders where status = 'pending_approval') as po_pending,
             (select count(*) from public.materials where active and recheck_at < now()) as materials_to_recheck,
             (select count(*) from public.orders where fulfilment_mode = 'supplier_direct' and supplier_confirmed_at is null
                and status not in ('delivered', 'cancelled')) as orders_without_supplier_confirmation""",
        p,
    ) or {}
    agents = await ctx.db.fetch(
        """select agent_id, count(*)::int as tasks,
                  count(*) filter (where status = 'completed')::int as completed,
                  count(*) filter (where status = 'failed')::int as failed,
                  count(*) filter (where status = 'blocked')::int as blocked,
                  round(avg(extract(epoch from (finished_at - started_at)) / 60) filter (where status = 'completed')::numeric, 1) as avg_minutes,
                  round(coalesce(sum(cost_usd), 0)::numeric, 4) as cost_usd
           from public.ai_tasks where created_at > now() - make_interval(days => %(d)s) group by agent_id order by tasks desc""",
        p,
    )
    queue = await ctx.db.fetch("select status, count(*)::int as n from public.ai_tasks where status in ('queued', 'running', 'waiting', 'blocked') group by 1")
    conv = (q.get("q_acc") or 0) / q["q_closed"] * 100 if q.get("q_closed") else None
    return {
        "window_days": a.days,
        "source": "database del gestionale (misure calcolate ora)",
        "lead_times": {
            "request_to_quote": _metric(q.get("req_to_quote_h"), "ore", q.get("req_to_quote_n")),
            "quote_to_send": _metric(q.get("quote_to_send_h"), "ore", q.get("quote_to_send_n")),
            "quote_to_order": _metric(q.get("quote_to_order_d"), "giorni", q.get("quote_to_order_n")),
            "order_to_delivery": _metric(q.get("order_to_delivery_d"), "giorni", q.get("order_to_delivery_n"),
                                         "Data di consegna approssimata con l'ultimo aggiornamento della spedizione"),
            "approval_decision": _metric(q.get("approval_decision_h"), "ore", q.get("approval_decision_n")),
        },
        "conversion": {"quote_acceptance_rate": _metric(conv, "%", q.get("q_closed"))},
        "backlog": {k: int(q.get(k) or 0) for k in ("requests_open", "requests_stale", "followups_overdue", "approvals_pending",
                                                    "po_pending", "materials_to_recheck", "orders_without_supplier_confirmation")},
        "approvals_pending_avg_age_hours": round(float(q["approvals_pending_age_h"]), 1) if q.get("approvals_pending_age_h") else None,
        "ai_agents": agents,
        "ai_queue": queue,
    }


DOC_KINDS = {
    "operations": ("process_map", "procedure", "kpi_definition", "improvement_proposal", "ops_report", "business_report", "forecast"),
    "legal": ("contract_review", "contract_draft", "legal_memo", "compliance_check"),
    "tax": ("tax_analysis", "vat_analysis", "accounting_note", "cash_flow_forecast", "tax_planning"),
}


class Figure(Args):
    label: str
    value: float | str
    unit: str = ""
    basis: Literal["actual", "estimate", "simulation", "assumption"] = Field(
        description="actual = dato contabile o registrato nel gestionale; estimate = stima; simulation = simulazione; assumption = ipotesi")
    source: str = Field("", description="Per i dati actual: ID del record o strumento da cui viene")

    @field_validator("source")
    @classmethod
    def strip(cls, v: str) -> str:
        return v.strip()


def _check_figures(figures: list[Figure]) -> None:
    bad = [f.label for f in figures if f.basis == "actual" and not f.source]
    if bad:
        raise ToolError(f"Questi valori sono indicati come effettivi ma senza fonte: {', '.join(bad)}. Indica la fonte o cambiali in stima")


class LawSource(Args):
    title: str = Field(description="Norma o documento, per esempio «DPR 633/1972, art. 8»")
    url: str
    retrieved_at: date
    note: str = ""

    @field_validator("url")
    @classmethod
    def http(cls, v: str) -> str:
        if not re.match(r"^https?://", v.strip()):
            raise ValueError("la fonte deve essere un indirizzo web")
        return v.strip()


async def _save_doc(ctx: ToolContext, category: str, kind: str, title: str, body: str, *, data_status: str,
                    jurisdiction=None, applicable_law=None, sources=(), points=(), figures=(), related_type=None, related_id=None) -> dict:
    review = category in ("legal", "tax")
    row = await ctx.db.fetchone(
        """insert into public.advisory_documents (category, kind, title, body, jurisdiction, applicable_law, sources, points_to_verify,
                                                  figures, data_status, review_required, review_status, related_type, related_id,
                                                  created_by_agent, task_id)
           values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) returning id, number""",
        (category, kind, title, body, jurisdiction, applicable_law, jsonb([s.model_dump(mode="json") for s in sources]), list(points),
         jsonb([f.model_dump() for f in figures]), data_status, review, "required" if review else "not_required",
         related_type, related_id, ctx.agent.id, ctx.task["id"]),
        actor=ctx.actor,
    )
    ctx.note_created("advisory_documents", row["id"], f"{row['number']} {title}")
    out = {"id": str(row["id"]), "number": row["number"], "status": "draft"}
    if review:
        out["review"] = "Revisione di un professionista abilitato obbligatoria: il documento resta una bozza fino ad allora"
    return out


class ProcessDoc(Args):
    kind: Literal["process_map", "procedure", "kpi_definition", "improvement_proposal", "ops_report", "business_report", "forecast"]
    title: str = Field(min_length=3, max_length=300)
    body: str = Field(min_length=20, description="Testo completo in Markdown")
    figures: list[Figure] = []
    data_status: DataStatus
    related_type: str | None = None
    related_id: str | None = None


@tool("process_doc_save", "Salva un documento di ingegneria gestionale: mappa di processo, procedura, KPI, proposta di miglioramento, report, previsione.", ProcessDoc, "writing")
async def process_doc_save(ctx: ToolContext, a: ProcessDoc) -> dict:
    _check_figures(a.figures)
    return await _save_doc(ctx, "operations", a.kind, a.title, a.body, data_status=a.data_status, figures=a.figures,
                           related_type=a.related_type, related_id=a.related_id)


class LegalDoc(Args):
    kind: Literal["contract_review", "contract_draft", "legal_memo", "compliance_check"]
    title: str = Field(min_length=3, max_length=300)
    body: str = Field(min_length=50, description="Analisi o bozza completa in Markdown")
    jurisdiction: str = Field(min_length=2, description="Giurisdizione e foro competente (o le alternative)")
    applicable_law: str = Field(min_length=2, description="Legge applicabile, per esempio legge italiana, CISG, Incoterms 2020")
    sources: list[LawSource] = Field(min_length=1, description="Fonti normative consultate, con indirizzo e data")
    points_to_verify: list[str] = Field(min_length=1, description="Punti da far verificare a un avvocato abilitato")
    risks: list[str] = []
    data_status: DataStatus = "unknown"
    related_type: str | None = Field(None, description="supplier, customer, deal, order, quote, lead")
    related_id: str | None = None


@tool("legal_doc_save", "Salva un'analisi legale o una bozza contrattuale (revisione di un avvocato abilitato obbligatoria).", LegalDoc, "writing")
async def legal_doc_save(ctx: ToolContext, a: LegalDoc) -> dict:
    body = (f"{DISCLAIMER_LEGAL}\n\n**Giurisdizione:** {a.jurisdiction}  \n**Legge applicabile:** {a.applicable_law}\n\n{a.body}"
            + ("\n\n## Rischi\n" + "\n".join(f"- {r}" for r in a.risks) if a.risks else "")
            + "\n\n## Da verificare con un avvocato abilitato\n" + "\n".join(f"- {p}" for p in a.points_to_verify)
            + "\n\n## Fonti\n" + "\n".join(f"- {s.title}: {s.url} (consultata il {s.retrieved_at:%d/%m/%Y})" for s in a.sources))
    return await _save_doc(ctx, "legal", a.kind, a.title, body, data_status=a.data_status, jurisdiction=a.jurisdiction,
                           applicable_law=a.applicable_law, sources=a.sources, points=a.points_to_verify,
                           related_type=a.related_type, related_id=a.related_id)


class TaxDoc(Args):
    kind: Literal["tax_analysis", "vat_analysis", "accounting_note", "cash_flow_forecast", "tax_planning"]
    title: str = Field(min_length=3, max_length=300)
    body: str = Field(min_length=50, description="Analisi completa in Markdown")
    jurisdiction: str = "Italia"
    figures: list[Figure] = Field(min_length=1, description="Ogni numero con la sua natura: actual, estimate, simulation, assumption")
    sources: list[LawSource] = []
    points_to_verify: list[str] = Field(min_length=1, description="Punti da far verificare a un commercialista abilitato")
    data_status: DataStatus = "unknown"
    related_type: str | None = None
    related_id: str | None = None


@tool("tax_doc_save", "Salva un'analisi fiscale o contabile (IVA, imposte, cash flow, pianificazione); revisione del commercialista obbligatoria.", TaxDoc, "writing")
async def tax_doc_save(ctx: ToolContext, a: TaxDoc) -> dict:
    _check_figures(a.figures)
    if a.kind in ("tax_analysis", "vat_analysis", "tax_planning") and not a.sources:
        raise ToolError("Un'analisi fiscale deve citare le fonti normative consultate (indirizzo e data)")
    labels = {"actual": "dato effettivo", "estimate": "stima", "simulation": "simulazione", "assumption": "ipotesi"}
    table = "\n".join(f"| {f.label} | {f.value} {f.unit} | {labels[f.basis]} | {f.source or '—'} |" for f in a.figures)
    body = (f"{DISCLAIMER_TAX}\n\n**Giurisdizione:** {a.jurisdiction}\n\n{a.body}\n\n## Numeri usati\n"
            f"| Voce | Valore | Natura | Fonte |\n|---|---|---|---|\n{table}"
            + "\n\n## Da verificare con un commercialista abilitato\n" + "\n".join(f"- {p}" for p in a.points_to_verify)
            + ("\n\n## Fonti\n" + "\n".join(f"- {s.title}: {s.url} (consultata il {s.retrieved_at:%d/%m/%Y})" for s in a.sources) if a.sources else ""))
    return await _save_doc(ctx, "tax", a.kind, a.title, body, data_status=a.data_status, jurisdiction=a.jurisdiction,
                           sources=a.sources, points=a.points_to_verify, figures=a.figures,
                           related_type=a.related_type, related_id=a.related_id)


class DocSearch(Args):
    category: Literal["operations", "legal", "tax"] | None = None
    query: str = ""
    limit: int = Field(15, ge=1, le=50)


@tool("advisory_doc_search", "Cerca i documenti del team advisory (procedure, KPI, report, analisi legali e fiscali) con lo stato di revisione.", DocSearch, "research")
async def advisory_doc_search(ctx: ToolContext, a: DocSearch) -> dict:
    rows = await ctx.db.fetch(
        """select id, number, category, kind, title, left(body, 1500) as excerpt, jurisdiction, points_to_verify, data_status,
                  review_status, reviewer_name, status, created_by_agent, created_at
           from public.advisory_documents
           where status <> 'archived' and (%(c)s::text is null or category = %(c)s)
             and (%(q)s = '' or title ilike %(like)s or body ilike %(like)s)
           order by created_at desc limit %(l)s""",
        {"c": a.category, "q": a.query, "like": f"%{a.query}%", "l": a.limit},
    )
    return {"results": rows, "note": "I documenti legali e fiscali non revisionati sono bozze, non pareri"}


class ScheduleProposal(Args):
    agent_id: str = Field(description="Agente che svolgerà l'attività ricorrente")
    title: str = Field(min_length=3, max_length=200)
    instructions: str = Field(min_length=20, max_length=8000)
    every_hours: int = Field(ge=1, le=2160, description="Ogni quante ore (24 = ogni giorno, 168 = ogni settimana)")
    reason: str = Field(min_length=10, description="Quale processo ripetitivo automatizza e perché conviene")


@tool("schedule_propose", "Propone un'attività ricorrente automatica per un agente. Resta disattivata finché il fondatore non la attiva.", ScheduleProposal, "coordination")
async def schedule_propose(ctx: ToolContext, a: ScheduleProposal) -> dict:
    if a.agent_id not in ctx.agents:
        raise ToolError("Agente sconosciuto")
    dup = await ctx.db.fetchone("select id from public.ai_schedules where agent_id = %s and lower(title) = lower(%s)", (a.agent_id, a.title))
    if dup:
        raise ToolError("Esiste già un'attività ricorrente con questo titolo per questo agente")
    row = await ctx.db.fetchone(
        """insert into public.ai_schedules (agent_id, title, instructions, every_hours, enabled, proposed_by_agent, reason)
           values (%s, %s, %s, %s, false, %s, %s) returning id""",
        (a.agent_id, a.title, a.instructions, a.every_hours, ctx.agent.id, a.reason),
        actor=ctx.actor,
    )
    ctx.note_created("ai_schedules", row["id"], a.title)
    return {"id": str(row["id"]), "enabled": False, "message": "Proposta registrata: la attiva il fondatore dal pannello (Agenti → Pianificazioni)"}


class Months(Args):
    months: int = Field(12, ge=1, le=36)


async def revenue_series(db, months: int) -> list[dict]:
    return await db.fetch(
        """with m as (select generate_series(date_trunc('month', now()) - make_interval(months => %(n)s - 1), date_trunc('month', now()), interval '1 month')::date as start)
           select to_char(m.start, 'YYYY-MM') as month,
             coalesce((select sum(o.total) from public.orders o left join public.deals d on d.id = o.deal_id
                        where o.status <> 'cancelled' and o.currency = 'EUR' and (d.id is null or d.model = 'trading')
                          and o.created_at >= m.start and o.created_at < m.start + interval '1 month'), 0) as resale_revenue,
             coalesce((select sum(c.amount) from public.commissions c where c.status in ('invoiced', 'paid') and c.currency = 'EUR'
                          and coalesce(c.paid_at, c.due_date, c.created_at::date) >= m.start
                          and coalesce(c.paid_at, c.due_date, c.created_at::date) < m.start + interval '1 month'), 0) as commission_revenue,
             coalesce((select sum(p.amount) from public.payments p where p.status = 'paid' and p.currency = 'EUR'
                          and p.paid_at >= m.start and p.paid_at < m.start + interval '1 month'), 0) as cash_in,
             coalesce((select sum(u.cost_usd) from public.ai_usage u where u.at >= m.start and u.at < m.start + interval '1 month'), 0) as ai_cost_usd
           from m order by m.start""",
        {"n": months},
    )


@tool("revenue_history", "Storico mensile reale: ricavi RESALE, commissioni BROKERAGE, incassi e costi AI (in euro).", Months, "calculation")
async def revenue_history(ctx: ToolContext, a: Months) -> dict:
    rows = await revenue_series(ctx.db, a.months)
    for r in rows:
        r["total_revenue"] = float(r["resale_revenue"]) + float(r["commission_revenue"])
    return {"months": rows, "basis": "actual", "data_status": "verified",
            "source": "ordini, commissioni, pagamenti e consumi AI registrati nel gestionale (solo importi in EUR)",
            "note": "Il gestionale non sostituisce la contabilità ufficiale"}


class Forecast(Args):
    months_ahead: int = Field(3, ge=1, le=12)


@tool("revenue_forecast", "Previsione dei ricavi (stima): media degli ultimi 3 mesi più pipeline ponderata per data di chiusura attesa.", Forecast, "calculation")
async def revenue_forecast(ctx: ToolContext, a: Forecast) -> dict:
    hist = await revenue_series(ctx.db, 4)
    complete = hist[:-1]  # esclude il mese in corso
    totals = [float(r["resale_revenue"]) + float(r["commission_revenue"]) for r in complete]
    baseline = sum(totals) / len(totals) if totals else 0.0
    rate = await ctx.db.fetchone(
        """select sum(commission_amount) / nullif(sum(deal_value), 0) * 100 as rate, count(*)::int as n
           from public.deals where model = 'brokerage' and deal_value > 0 and stage in ('agreed', 'ordered', 'delivered', 'closed_won')"""
    )
    commission_rate = float(rate["rate"]) if rate and rate["rate"] is not None else None
    pipe = await ctx.db.fetch(
        """select to_char(date_trunc('month', expected_close), 'YYYY-MM') as month, coalesce(model, 'n.d.') as model,
                  sum(estimated_value * coalesce(probability, 0) / 100.0) as weighted, count(*)::int as n
           from public.opportunities
           where stage not in ('won', 'lost') and currency = 'EUR' and expected_close >= date_trunc('month', now())
             and expected_close < date_trunc('month', now()) + make_interval(months => %s + 1)
           group by 1, 2""",
        (a.months_ahead,),
    )
    target_row = await ctx.db.fetchone("select value from public.ai_settings where key = 'monthly_revenue_target'")
    target = float((target_row or {}).get("value", {}).get("amount", 30000))
    months, notes = [], []
    today = date.today()
    for i in range(1, a.months_ahead + 1):
        y, m = today.year + (today.month - 1 + i) // 12, (today.month - 1 + i) % 12 + 1
        key = f"{y}-{m:02d}"
        resale = sum(float(p["weighted"]) for p in pipe if p["month"] == key and p["model"] == "trading")
        brok_gmv = sum(float(p["weighted"]) for p in pipe if p["month"] == key and p["model"] == "brokerage")
        brok = brok_gmv * commission_rate / 100 if commission_rate is not None else 0.0
        total = baseline + resale + brok
        months.append({"month": key, "baseline": round(baseline, 2), "pipeline_resale_weighted": round(resale, 2),
                       "pipeline_brokerage_gmv_weighted": round(brok_gmv, 2), "pipeline_brokerage_commission": round(brok, 2),
                       "total_estimate": round(total, 2), "gap_to_target": round(target - total, 2)})
    if commission_rate is None:
        notes.append("Nessuna trattativa BROKERAGE chiusa: senza un tasso di commissione storico la pipeline BROKERAGE non è stimata")
    if not totals or not any(totals):
        notes.append("Nessun ricavo registrato negli ultimi 3 mesi: la base storica è zero")
    notes.append("Possibile doppio conteggio tra base storica e pipeline: la previsione è indicativa")
    return {"basis": "estimate", "data_status": "estimated",
            "method": "media dei ricavi degli ultimi 3 mesi completi + opportunità aperte × probabilità, nel mese di chiusura attesa; "
                      "BROKERAGE: valore intermediato × tasso di commissione storico",
            "history": complete, "commission_rate_used": commission_rate, "months": months, "target_eur": target, "notes": notes}


@tool("profitability_analysis", "Redditività reale delle trattative per modello (RESALE / BROKERAGE) e per varietà di marmo.", Months, "calculation")
async def profitability_analysis(ctx: ToolContext, a: Months) -> dict:
    deals = await ctx.db.fetch(
        """select d.id, d.number, d.model, d.stage, d.currency, d.sale_amount, d.purchase_cost, d.logistics_cost, d.other_costs,
                  d.margin_amount, d.deal_value, d.commission_amount, d.quote_id
           from public.deals d
           where d.stage in ('agreed', 'ordered', 'delivered', 'closed_won') and d.created_at > now() - make_interval(months => %s)""",
        (a.months,),
    )
    lines = await ctx.db.fetch(
        """select qi.quote_id, coalesce(qi.marble_slug, 'n.d.') as slug, qi.quantity * qi.unit_price as value
           from public.quote_items qi where qi.quote_id = any(%s::uuid[])""",
        ([d["quote_id"] for d in deals if d["quote_id"]],),
    )
    by_model: dict[str, dict] = {}
    by_slug: dict[str, dict] = {}
    for d in deals:
        if d["currency"] != "EUR":
            continue
        m = by_model.setdefault(d["model"], {"deals": 0, "revenue": 0.0, "margin_known": 0.0, "revenue_with_costs": 0.0,
                                             "deals_without_costs": 0, "gmv_intermediated": 0.0})
        m["deals"] += 1
        if d["model"] == "trading":
            revenue = float(d["sale_amount"] or 0)
            known = d["purchase_cost"] is not None and d["sale_amount"] is not None
            margin = float(d["margin_amount"]) if known else None
        else:
            revenue = float(d["commission_amount"] or 0)
            m["gmv_intermediated"] += float(d["deal_value"] or 0)
            known, margin = True, revenue  # i costi diretti dell'intermediazione non sono registrati nella trattativa
        m["revenue"] += revenue
        if known and margin is not None:
            m["margin_known"] += margin
            m["revenue_with_costs"] += revenue
        else:
            m["deals_without_costs"] += 1
        mine = [l for l in lines if l["quote_id"] == d["quote_id"]]
        tot = sum(float(l["value"]) for l in mine)
        for l in mine or [{"slug": "senza preventivo", "value": 1}]:
            share = float(l["value"]) / tot if tot else 1.0
            s = by_slug.setdefault(f"{l['slug']}|{d['model']}", {"marble": l["slug"], "model": d["model"], "revenue": 0.0, "margin_known": 0.0})
            s["revenue"] += revenue * share
            if margin is not None and known:
                s["margin_known"] += margin * share
    for m in by_model.values():
        m["margin_rate_known"] = round(m["margin_known"] / m["revenue_with_costs"] * 100, 1) if m["revenue_with_costs"] else None
        for k in ("revenue", "margin_known", "revenue_with_costs", "gmv_intermediated"):
            m[k] = round(m[k], 2)
    slugs = sorted(by_slug.values(), key=lambda s: -s["revenue"])
    for s in slugs:
        s["revenue"], s["margin_known"] = round(s["revenue"], 2), round(s["margin_known"], 2)
    return {"window_months": a.months, "by_model": by_model, "by_marble": slugs, "basis": "actual", "data_status": "verified",
            "source": "trattative concordate o chiuse e righe dei preventivi collegati (EUR)",
            "notes": ["trading = RESALE: ricavo = vendita; brokerage: ricavo = sola commissione, il valore intermediato non è un ricavo",
                      "Margine solo dove i costi sono registrati; la ripartizione per varietà segue il valore delle righe del preventivo",
                      "Per BROKERAGE i costi diretti (viaggi, campioni) non sono nella trattativa: il margine coincide con la commissione"]}


@tool("sales_performance", "Performance commerciali reali: lead, opportunità vinte e perse, preventivi inviati e accettati, per modello.", Window, "analysis")
async def sales_performance(ctx: ToolContext, a: Window) -> dict:
    p = {"d": a.days}
    leads = await ctx.db.fetch(
        "select qualification, count(*)::int as n from public.leads where created_at > now() - make_interval(days => %(d)s) group by 1", p)
    opps = await ctx.db.fetch(
        """select coalesce(model, 'n.d.') as model, stage, count(*)::int as n, coalesce(sum(estimated_value), 0) as value
           from public.opportunities where created_at > now() - make_interval(days => %(d)s) group by 1, 2""", p)
    quotes = await ctx.db.fetch(
        """select model, status, count(*)::int as n, coalesce(sum(total), 0) as value, round(avg(total)::numeric, 2) as avg_value
           from public.quotes where created_at > now() - make_interval(days => %(d)s) group by 1, 2""", p)
    requests = await ctx.db.fetch(
        "select kind, count(*)::int as n from public.requests where created_at > now() - make_interval(days => %(d)s) group by 1", p)
    won = sum(o["n"] for o in opps if o["stage"] == "won")
    lost = sum(o["n"] for o in opps if o["stage"] == "lost")
    acc = sum(q["n"] for q in quotes if q["status"] == "accepted")
    closed = sum(q["n"] for q in quotes if q["status"] in ("accepted", "rejected", "expired"))
    return {"window_days": a.days, "leads_by_status": leads, "opportunities": opps, "quotes": quotes, "requests_by_kind": requests,
            "win_rate": _metric(won / (won + lost) * 100 if won + lost else None, "%", won + lost),
            "quote_acceptance_rate": _metric(acc / closed * 100 if closed else None, "%", closed),
            "basis": "actual", "source": "lead, opportunità, preventivi e richieste del gestionale",
            "note": "Il valore delle opportunità è una stima commerciale, non un ricavo"}


EU = {"AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
      "PL", "PT", "RO", "SK", "SI", "ES", "SE"}


class TaxSim(Args):
    model: Literal["resale", "brokerage"]
    amount: float = Field(gt=0, description="RESALE: prezzo di vendita imponibile; BROKERAGE: commissione fatturata")
    currency: str = "EUR"
    cost_amount: float | None = Field(None, ge=0, description="Costi diretti dell'operazione, per stimare le imposte sul margine")
    customer_country: str = Field("IT", description="Paese del cliente (RESALE) o di chi paga la commissione (BROKERAGE), ISO a due lettere")
    customer_type: Literal["business", "consumer"] = "business"
    customer_vat_valid_vies: bool | None = Field(None, description="Partita IVA UE verificata nel VIES (solo clienti UE)")
    goods_destination_country: str | None = Field(None, description="RESALE: Paese di arrivo della merce")
    goods_leave_eu: bool | None = Field(None, description="RESALE extra UE: la merce esce dall'UE con prova doganale (spedita dal venditore)")
    intermediated_goods_exported: bool | None = Field(None, description="BROKERAGE: la merce intermediata è esportata fuori dall'UE")
    incoterm: str | None = None

    @field_validator("customer_country", "goods_destination_country")
    @classmethod
    def iso(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip().upper()
        if not re.fullmatch(r"[A-Z]{2}", v):
            raise ValueError("usa il codice ISO a due lettere")
        return v


def vat_treatment(a: TaxSim, std_rate: float) -> dict:
    """Trattamento IVA indicativo secondo le regole generali italiane e UE. Ipotesi da verificare, mai un parere."""
    req, obligations, refs = [], [], []
    rate: float | None = std_rate
    code = "imponibile"
    if a.model == "resale":
        dest = a.goods_destination_country or a.customer_country
        if dest == "IT":
            refs.append("DPR 633/1972, art. 16 (aliquota ordinaria) e Tabella A (aliquote ridotte, normalmente non per il marmo)")
            desc = "Cessione interna: IVA italiana ad aliquota ordinaria"
        elif dest in EU:
            if a.customer_type == "consumer":
                code, rate = "vendita_a_distanza_ue", None
                desc = ("Vendita a distanza intracomunitaria a privato: oltre la soglia UE di 10.000 € si applica l'IVA del Paese di "
                        "destinazione (regime OSS); sotto soglia IVA italiana")
                refs.append("Direttiva 2006/112/CE, artt. 33 e 59-quater; regime OSS")
                req.append("Volume di vendite a distanza UE nell'anno e aliquota del Paese di destinazione")
            elif a.customer_vat_valid_vies is None:
                code, rate = "da_determinare", None
                desc = "Cessione intracomunitaria non imponibile SOLO se la partita IVA del cliente è valida nel VIES"
                req.append("Verifica della partita IVA del cliente nel VIES")
                refs.append("DL 331/1993, art. 41")
            elif a.customer_vat_valid_vies:
                code, rate = "non_imponibile_intra_ue", 0.0
                desc = "Cessione intracomunitaria di beni: non imponibile in Italia, l'IVA la assolve il cliente nel suo Paese"
                refs += ["DL 331/1993, art. 41", "Reg. di esecuzione (UE) 282/2011, art. 45-bis (prova del trasporto)"]
                obligations += ["Fattura con dicitura di non imponibilità e partita IVA del cliente", "Elenchi riepilogativi Intrastat",
                                "Prova del trasporto nell'altro Stato membro (documenti di trasporto firmati, CMR)"]
            else:
                desc = "Partita IVA del cliente non valida nel VIES: la cessione non può essere trattata come intracomunitaria"
                refs.append("DL 331/1993, art. 41 (requisiti)")
        else:
            if a.goods_leave_eu is None:
                code, rate = "da_determinare", None
                desc = "Esportazione non imponibile SOLO se la merce esce dall'UE spedita dal venditore, con prova doganale"
                req.append("Chi spedisce la merce e prova dell'uscita dall'UE (DAE / messaggio di uscita)")
                refs.append("DPR 633/1972, art. 8, c. 1, lett. a)")
            elif a.goods_leave_eu:
                code, rate = "non_imponibile_export", 0.0
                desc = "Esportazione: cessione non imponibile IVA"
                refs.append("DPR 633/1972, art. 8, c. 1, lett. a)")
                obligations += ["Dichiarazione doganale di esportazione e prova di uscita (visto uscire elettronico)",
                                "Fattura con dicitura di non imponibilità e riferimento all'art. 8"]
            else:
                desc = "La merce non esce dall'UE: la cessione resta imponibile in Italia"
                refs.append("DPR 633/1972, artt. 7-bis e 8 (requisiti)")
        if (a.incoterm or "").upper() == "DDP" and dest != "IT":
            obligations.append("Con DDP WHITE CARRARA paga dazi e IVA all'importazione nel Paese di arrivo: verificare obbligo di "
                               "registrazione o rappresentante fiscale locale")
    else:
        payer = a.customer_country
        if a.customer_type == "consumer":
            code, rate = "da_determinare", None
            desc = ("Intermediazione verso un privato: il luogo della prestazione segue l'operazione intermediata")
            refs.append("DPR 633/1972, art. 7-sexies, c. 1, lett. a)")
            req.append("Luogo in cui si considera effettuata la compravendita intermediata")
        elif payer == "IT":
            desc = "Commissione a un soggetto passivo italiano: IVA italiana ad aliquota ordinaria"
            refs.append("DPR 633/1972, art. 7-ter, c. 1, lett. a) e art. 16")
            if a.intermediated_goods_exported:
                code, rate = "possibile_non_imponibile_art9", 0.0
                desc = "Intermediazione relativa a beni esportati: possibile non imponibilità"
                refs.append("DPR 633/1972, art. 9, c. 1, n. 7)")
                req.append("Documentazione dell'esportazione dei beni intermediati")
        else:
            code, rate = "non_soggetta_art7ter", 0.0
            desc = "Servizio a un soggetto passivo stabilito all'estero: operazione non soggetta a IVA in Italia (non territoriale)"
            refs += ["DPR 633/1972, art. 7-ter, c. 1, lett. a)", "DPR 633/1972, art. 21, c. 6-bis"]
            if payer in EU:
                obligations += ["Fattura con dicitura «inversione contabile» e partita IVA del committente verificata nel VIES",
                                "Elenchi Intrastat dei servizi resi"]
                if a.customer_vat_valid_vies is None:
                    req.append("Verifica della partita IVA del committente nel VIES")
            else:
                obligations.append("Fattura con dicitura «operazione non soggetta» e prova dello status di impresa del committente")
    vat = round(a.amount * rate / 100, 2) if rate is not None else None
    return {"code": code, "description": desc, "rate": rate, "vat_amount": vat, "references_to_verify": refs,
            "obligations": obligations, "requires_data": req}


@tool("tax_simulate", "Simulazione fiscale di un'operazione RESALE o BROKERAGE: trattamento IVA indicativo, riferimenti da verificare, imposte stimate sul margine.", TaxSim, "calculation")
async def tax_simulate(ctx: ToolContext, a: TaxSim) -> dict:
    row = await ctx.db.fetchone("select value from public.ai_settings where key = 'tax_parameters'")
    params = (row or {}).get("value") or {}
    std = float(params.get("vat_standard_rate", 22))
    t = vat_treatment(a, std)
    out = {"basis": "simulation", "data_status": "assumed", "model": a.model, "currency": a.currency, "amount": a.amount,
           "vat": t, "total_invoice": round(a.amount + (t["vat_amount"] or 0), 2) if t["vat_amount"] is not None else None,
           "parameters": {k: params.get(k) for k in ("legal_form", "vat_standard_rate", "ires_rate", "irap_rate", "status", "note")}}
    if a.cost_amount is not None:
        margin = a.amount - a.cost_amount
        ires, irap = float(params.get("ires_rate", 24)), float(params.get("irap_rate", 3.9))
        out["income_taxes_estimate"] = {
            "margin": round(margin, 2),
            "ires": round(max(margin, 0) * ires / 100, 2), "irap": round(max(margin, 0) * irap / 100, 2),
            "net_after_taxes": round(margin - max(margin, 0) * (ires + irap) / 100, 2),
            "basis": "simulation",
            "note": "Stima grossolana sul margine della singola operazione: la base IRAP e il reddito d'impresa reali dipendono dal "
                    "bilancio complessivo, dai costi generali e dal regime fiscale",
        }
    out["verify"] = ["Testo vigente delle norme citate su fonti ufficiali (normattiva.it, agenziaentrate.gov.it, eur-lex.europa.eu)",
                     "Aliquote e regime fiscale dell'azienda con il commercialista"] + t["requires_data"]
    out["disclaimer"] = "Simulazione di un assistente AI, non consulenza fiscale: va verificata da un commercialista abilitato"
    return out
