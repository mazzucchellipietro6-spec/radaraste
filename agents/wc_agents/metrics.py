"""Misure dell'azienda per l'AI CEO e per il report giornaliero (calcolate dal database, non stimate)."""

from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

from .db import Database, jsonb
from .tools.business import finance_report

ROME = ZoneInfo("Europe/Rome")


def today_rome() -> date:
    return datetime.now(ROME).date()


async def company_metrics(db: Database) -> dict:
    tasks = await db.fetchone(
        """select count(*) filter (where created_at > now() - interval '24 hours')::int as created_24h,
                  count(*) filter (where status = 'completed' and finished_at > now() - interval '24 hours')::int as completed_24h,
                  count(*) filter (where status = 'failed' and finished_at > now() - interval '24 hours')::int as failed_24h,
                  count(*) filter (where status = 'blocked' and finished_at > now() - interval '24 hours')::int as blocked_24h,
                  count(*) filter (where status = 'running')::int as running,
                  count(*) filter (where status = 'queued')::int as queued,
                  count(*) filter (where status = 'waiting')::int as waiting
           from public.ai_tasks"""
    )
    agents = await db.fetchone(
        "select count(*)::int as total, count(*) filter (where enabled and autonomy <> 'disabled')::int as enabled from public.ai_agents")
    overdue = await db.fetchone(
        """select
             (select count(*) from public.approvals where status = 'pending' and created_at < now() - interval '48 hours')::int as approvals_over_48h,
             (select count(*) from public.crm_activities where status = 'open' and due_at < now())::int as followups_overdue,
             (select count(*) from public.ai_tasks where status = 'queued' and created_at < now() - interval '24 hours')::int as tasks_queued_over_24h,
             (select count(*) from public.bookings where status in ('requested', 'checking') and created_at < now() - interval '24 hours')::int as bookings_unanswered_24h,
             (select count(*) from public.requests where status = 'new' and created_at < now() - interval '24 hours')::int as requests_unanswered_24h,
             (select count(*) from public.quotes where status = 'sent' and valid_until between current_date and current_date + 3)::int as quotes_expiring_3d,
             (select count(*) from public.supplier_offers where status in ('received', 'analyzed') and valid_until between current_date and current_date + 7)::int as offers_expiring_7d,
             (select count(*) from public.materials where active and recheck_at < now())::int as materials_to_recheck"""
    )
    bookings = await db.fetchone(
        """select count(*) filter (where b.status in ('confirmed', 'awaiting_payment', 'paid', 'completed'))::int as confirmed,
                  coalesce(sum(b.price) filter (where b.status in ('confirmed', 'awaiting_payment', 'paid', 'completed')), 0) as revenue,
                  coalesce(sum(bi.partner_cost) filter (where b.status in ('confirmed', 'awaiting_payment', 'paid', 'completed')), 0) as partner_cost,
                  count(*) filter (where b.status in ('requested', 'checking'))::int as to_confirm
           from public.bookings b left join public.booking_internal bi on bi.booking_id = b.id
           where b.created_at >= date_trunc('month', now())"""
    )
    campaigns = await db.fetchone(
        """select count(*) filter (where status = 'pending_approval')::int as pending,
                  count(*) filter (where status in ('approved', 'active'))::int as running,
                  coalesce(sum(budget_total) filter (where status in ('approved', 'active')), 0) as budget_committed
           from public.campaigns"""
    )
    ai = await db.fetchone(
        """select coalesce(sum(cost_usd) filter (where at >= date_trunc('day', now())), 0) as today,
                  coalesce(sum(cost_usd), 0) as month from public.ai_usage where at >= date_trunc('month', now())""")
    top = await db.fetch(
        """select agent_id, round(sum(cost_usd)::numeric, 4) as usd from public.ai_usage where at >= date_trunc('month', now())
           group by agent_id order by usd desc limit 5""")
    security = await db.fetch(
        "select severity, count(*)::int as n from public.security_events where not resolved group by severity")
    alerts = await db.fetchone("select count(*)::int as n from public.owner_alerts where status = 'open'")
    approvals = await db.fetch(
        """select number, kind, title, amount, currency, risk_level, created_at from public.approvals
           where status = 'pending' order by created_at limit 10""")
    fin = await finance_report(db)
    rev = float(bookings["revenue"]) if bookings else 0.0
    cost = float(bookings["partner_cost"]) if bookings else 0.0
    return {
        "generated_at": datetime.now(ROME).isoformat(timespec="seconds"),
        "data_status": "verified",
        "source": "database del gestionale",
        "agents": agents, "tasks": tasks, "overdue": overdue,
        "approvals_pending": approvals,
        "finance_month": {"resale_revenue_eur": fin["resale"]["revenue_eur"], "commission_revenue_eur": fin["brokerage"]["commission_revenue_eur"],
                          "resale_margin_known_eur": fin["resale"]["gross_margin_known_eur"], "target_eur": fin["target"]["amount_eur"],
                          "gap_eur": fin["target"]["gap_eur"]},
        "tours_month": {"bookings_confirmed": bookings["confirmed"] if bookings else 0, "revenue_eur": rev, "partner_cost_eur": cost,
                        "margin_eur": round(rev - cost, 2), "to_confirm": bookings["to_confirm"] if bookings else 0},
        "campaigns": campaigns,
        "ai_costs_usd": {"today": float(ai["today"]) if ai else 0.0, "month": float(ai["month"]) if ai else 0.0, "top_agents": top},
        "security_open": {r["severity"]: r["n"] for r in security},
        "owner_alerts_open": alerts["n"] if alerts else 0,
    }


async def daily_snapshot(db: Database) -> dict:
    """Misure del giorno nel report giornaliero, con l'ancoraggio del registro delle modifiche."""
    metrics = await company_metrics(db)
    anchor = await db.fetchone("select ok, checked, last_seq, last_hash from public.audit_verify()")
    if anchor and not anchor["ok"]:
        await db.execute(
            """insert into public.security_events (kind, severity, source, message, details)
               values ('audit_chain_broken', 'critical', 'agents', 'La catena del registro delle modifiche risulta alterata', %s)""",
            (jsonb(anchor),),
        )
    await db.execute(
        """insert into public.daily_reports (report_date, metrics, audit_anchor) values (%s, %s, %s)
           on conflict (report_date) do update set metrics = excluded.metrics, audit_anchor = excluded.audit_anchor""",
        (today_rome(), jsonb(metrics), jsonb(anchor or {})),
    )
    return metrics
