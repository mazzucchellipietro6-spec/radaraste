// Azienda AI nel pannello: stato reale dei 25 agenti, KPI, eventi, incarichi, approvazioni e finanza.
// Lo stato viene dal database scritto dal servizio agenti (agents/): niente valori dimostrativi.
// Se il servizio non è acceso o non ha la chiave di Claude, tutti gli agenti risultano "non collegati".
import { createHmac } from 'node:crypto';
import type postgres from 'postgres';
import { asSystem, withUser } from './db';
import { env } from './env';
import type { CurrentUser, Profile } from './auth';

type Tx = postgres.TransactionSql;
type Row = Record<string, unknown>;

export const DEPARTMENTS: { id: string; label: string }[] = [
  { id: 'direzione', label: 'Direzione' },
  { id: 'advisory', label: 'Executive & Professional Advisory' },
  { id: 'vendite', label: 'Vendite' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'prodotto', label: 'Prodotto e fornitori' },
  { id: 'operazioni', label: 'Operazioni e logistica' },
];

export type AgentStatus = 'offline' | 'disabled' | 'working' | 'waiting' | 'queued' | 'completed' | 'failed' | 'blocked' | 'idle';

export const STATUS_LABEL: Record<AgentStatus, string> = {
  offline: 'Non collegato',
  disabled: 'Disattivato',
  working: 'Al lavoro',
  waiting: 'In attesa dei colleghi',
  queued: 'Incarichi in coda',
  completed: 'Ha completato',
  failed: 'Errore',
  blocked: 'Bloccato',
  idle: 'Disponibile',
};

export const ACTIVITY_LABEL: Record<string, string> = {
  research: 'Ricerca',
  analysis: 'Analisi',
  writing: 'Scrittura',
  calculation: 'Calcolo',
  coordination: 'Coordinamento',
  crm: 'CRM',
  review: 'Verifica',
  reporting: 'Rapporto',
};

export const KPI_LABEL: Record<string, string> = {
  tasks_completed_30d: 'Incarichi completati (30 gg)',
  success_rate: 'Tasso di successo',
  approvals_pending: 'Approvazioni in attesa',
  revenue_month: 'Ricavi del mese (€)',
  opportunities_open: 'Opportunità aperte',
  pipeline_value: 'Pipeline ponderata (€)',
  quotes_drafted_30d: 'Preventivi preparati (30 gg)',
  leads_created_30d: 'Lead trovati (30 gg)',
  leads_qualified_30d: 'Lead qualificati (30 gg)',
  market_analyses_30d: 'Analisi di mercato (30 gg)',
  followups_done_30d: 'Follow-up fatti (30 gg)',
  marketing_assets_30d: 'Materiali marketing (30 gg)',
  approvals_requested_30d: 'Approvazioni chieste (30 gg)',
  materials_to_recheck: 'Disponibilità da ricontrollare',
  purchase_orders_drafted_30d: 'Ordini fornitori preparati (30 gg)',
  certifications_expiring: 'Certificazioni in scadenza (60 gg)',
  pricing_sims_30d: 'Simulazioni di prezzo (30 gg)',
  shipments_in_transit: 'Spedizioni in viaggio',
  orders_open: 'Ordini aperti',
  improvements_proposed_30d: 'Miglioramenti proposti (30 gg)',
  overdue_followups: 'Follow-up scaduti',
  approvals_waiting_hours: 'Attesa media approvazioni (ore)',
  procedures_30d: 'Procedure scritte (30 gg)',
  kpis_defined: 'KPI definiti',
  schedules_proposed: 'Automazioni proposte',
  reports_30d: 'Report per il CEO (30 gg)',
  forecasts_30d: 'Previsioni (30 gg)',
  legal_docs_30d: 'Documenti legali (30 gg)',
  legal_reviews_pending: 'Da rivedere da un avvocato',
  tax_docs_30d: 'Analisi fiscali (30 gg)',
  tax_reviews_pending: 'Da rivedere da un commercialista',
};

const FINANCE_KPIS = new Set(['revenue_month', 'pipeline_value']);

export function canSeeAi(p: Profile) {
  return p.role === 'admin' || p.permissions.includes('ai');
}
export function canSeeFinance(p: Profile) {
  return p.role === 'admin' || p.permissions.includes('trade');
}
const num = (x: unknown) => (x === null || x === undefined ? null : Number(x));

/** Valori dei KPI: un'unica query che calcola tutte le misure, per agente e globali. */
async function kpiValues(tx: Tx): Promise<{ global: Record<string, number | null>; byAgent: Record<string, Record<string, number | null>> }> {
  const g = (
    await tx<Row[]>`select
      (select count(*) from public.approvals where status = 'pending') as approvals_pending,
      (select count(*) from public.opportunities where stage not in ('won', 'lost')) as opportunities_open,
      (select coalesce(sum(estimated_value * coalesce(probability, 0) / 100.0), 0) from public.opportunities where stage not in ('won', 'lost') and currency = 'EUR') as pipeline_value,
      (select count(*) from public.leads where qualification = 'qualified' and updated_at > now() - interval '30 days') as leads_qualified_30d,
      (select count(*) from public.crm_activities where status = 'done' and done_at > now() - interval '30 days') as followups_done_30d,
      (select count(*) from public.crm_activities where status = 'open' and due_at < now()) as overdue_followups,
      (select count(*) from public.materials where active and recheck_at < now()) as materials_to_recheck,
      (select count(*) from public.supplier_certifications where valid_until < current_date + 60) as certifications_expiring,
      (select count(*) from public.shipments where status = 'in_transit') as shipments_in_transit,
      (select count(*) from public.orders where status not in ('delivered', 'cancelled')) as orders_open,
      (select round(avg(extract(epoch from (now() - created_at)) / 3600)::numeric, 1) from public.approvals where status = 'pending') as approvals_waiting_hours,
      (select count(*) from public.advisory_documents where category = 'legal' and review_status in ('required', 'in_review', 'changes_requested')) as legal_reviews_pending,
      (select count(*) from public.advisory_documents where category = 'tax' and review_status in ('required', 'in_review', 'changes_requested')) as tax_reviews_pending`
  )[0];
  const per = await tx<Row[]>`
    select a.id,
      (select count(*) from public.ai_tasks t where t.agent_id = a.id and t.status = 'completed' and t.finished_at > now() - interval '30 days') as tasks_completed_30d,
      (select round(100.0 * count(*) filter (where t.status = 'completed') / nullif(count(*), 0), 1) from public.ai_tasks t
         where t.agent_id = a.id and t.status in ('completed', 'failed', 'blocked') and t.finished_at > now() - interval '30 days') as success_rate,
      (select count(*) from public.quote_versions q where q.created_by_agent = a.id and q.created_at > now() - interval '30 days') as quotes_drafted_30d,
      (select count(*) from public.leads l where l.created_by_agent = a.id and l.created_at > now() - interval '30 days') as leads_created_30d,
      (select count(*) from public.market_analyses m where m.created_by_agent = a.id and m.created_at > now() - interval '30 days') as market_analyses_30d,
      (select count(*) from public.marketing_assets m where m.created_by_agent = a.id and m.created_at > now() - interval '30 days') as marketing_assets_30d,
      (select count(*) from public.approvals p where p.requested_by_agent = a.id and p.created_at > now() - interval '30 days') as approvals_requested_30d,
      (select count(*) from public.purchase_orders p where p.created_by_agent = a.id and p.created_at > now() - interval '30 days') as purchase_orders_drafted_30d,
      (select count(*) from public.pricing_simulations p where p.created_by_agent = a.id and p.created_at > now() - interval '30 days') as pricing_sims_30d,
      (select count(*) from public.advisory_documents d where d.created_by_agent = a.id and d.kind = 'improvement_proposal' and d.created_at > now() - interval '30 days') as improvements_proposed_30d,
      (select count(*) from public.advisory_documents d where d.created_by_agent = a.id and d.kind = 'procedure' and d.created_at > now() - interval '30 days') as procedures_30d,
      (select count(*) from public.advisory_documents d where d.created_by_agent = a.id and d.kind = 'kpi_definition') as kpis_defined,
      (select count(*) from public.ai_schedules s where s.proposed_by_agent = a.id) as schedules_proposed,
      (select count(*) from public.advisory_documents d where d.created_by_agent = a.id and d.kind = 'business_report' and d.created_at > now() - interval '30 days') as reports_30d,
      (select count(*) from public.advisory_documents d where d.created_by_agent = a.id and d.kind = 'forecast' and d.created_at > now() - interval '30 days') as forecasts_30d,
      (select count(*) from public.advisory_documents d where d.created_by_agent = a.id and d.category = 'legal' and d.created_at > now() - interval '30 days') as legal_docs_30d,
      (select count(*) from public.advisory_documents d where d.created_by_agent = a.id and d.category = 'tax' and d.created_at > now() - interval '30 days') as tax_docs_30d
    from public.ai_agents a`;
  const global: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(g ?? {})) global[k] = num(v);
  const byAgent: Record<string, Record<string, number | null>> = {};
  for (const r of per) {
    const o: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(r)) if (k !== 'id') o[k] = num(v);
    byAgent[String(r.id)] = o;
  }
  return { global, byAgent };
}

export async function financeMonth(tx: Tx) {
  const r = (
    await tx<Row[]>`select
      coalesce((select sum(o.total) from public.orders o left join public.deals d on d.id = o.deal_id
                 where o.status <> 'cancelled' and o.currency = 'EUR' and (d.id is null or d.model = 'trading')
                   and o.created_at >= date_trunc('month', now())), 0) as resale,
      coalesce((select sum(amount) from public.commissions where status in ('invoiced', 'paid') and currency = 'EUR'
                   and coalesce(paid_at, due_date, created_at::date) >= date_trunc('month', now())::date), 0) as commissions,
      coalesce((select sum(deal_value) from public.deals where model = 'brokerage' and currency = 'EUR'
                   and stage in ('agreed', 'ordered', 'delivered', 'closed_won') and updated_at >= date_trunc('month', now())), 0) as gmv,
      coalesce((select sum(amount) from public.payments where status = 'paid' and currency = 'EUR' and paid_at >= date_trunc('month', now())), 0) as cash_in,
      (select value from public.ai_settings where key = 'monthly_revenue_target') as target`
  )[0];
  const resale = Number(r.resale);
  const commissions = Number(r.commissions);
  const target = Number((r.target as { amount?: number } | null)?.amount ?? 30000);
  const total = resale + commissions;
  return { resale, commissions, gmv: Number(r.gmv), cashIn: Number(r.cash_in), total, target, gap: Math.round((target - total) * 100) / 100 };
}

export interface CompanyState {
  generatedAt: string;
  runtime: { online: boolean; llmConfigured: boolean; workers: number; lastSeen: string | null; version: string | null };
  agents: AgentView[];
  events: EventRow[];
  queue: Record<string, number>;
  costs: { today: number; month: number; dailyCap: number };
  approvalsPending: number;
  finance: Awaited<ReturnType<typeof financeMonth>> | null;
  departments: typeof DEPARTMENTS;
  wsUrl: string | null;
}

export interface EventRow {
  id: number;
  task_id: string | null;
  agent_id: string | null;
  kind: string;
  activity: string | null;
  message: string | null;
  at: string;
  task_title: string | null;
}

const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d ? new Date(String(d)).toISOString() : null);

export interface AgentView {
  id: string;
  name: string;
  department: string;
  team: string | null;
  title: string;
  enabled: boolean;
  model: string;
  effort: string;
  monthlyBudget: number;
  dailyLimit: number;
  objectives: string[];
  kpis: { key: string; label: string; value: number | null }[];
  status: AgentStatus;
  activity: string | null;
  currentTask: { id: string; title: string; startedAt: string } | null;
  queued: number;
  waiting: number;
  costMonth: number;
  last: { id: string; title: string; status: string; finishedAt: string | null; summary: string | null } | null;
}

export async function companyState(user: CurrentUser, profile: Profile): Promise<CompanyState> {
  const finance = canSeeFinance(profile);
  return asSystem(async (tx) => {
    const rt = await tx<Row[]>`select id, last_seen, version, info from public.ai_runtime where last_seen > now() - interval '45 seconds' order by last_seen desc`;
    const llm = rt.some((r) => (r.info as { llm_configured?: boolean })?.llm_configured);
    const online = rt.length > 0;
    const rows = await tx<Row[]>`
      select a.*,
        (select json_build_object('id', t.id, 'title', t.title, 'activity', t.activity, 'started_at', t.started_at)
           from public.ai_tasks t where t.agent_id = a.id and t.status = 'running' order by t.started_at desc limit 1) as running,
        (select count(*) from public.ai_tasks t where t.agent_id = a.id and t.status = 'queued')::int as queued,
        (select count(*) from public.ai_tasks t where t.agent_id = a.id and t.status = 'waiting')::int as waiting,
        (select json_build_object('id', t.id, 'title', t.title, 'status', t.status, 'finished_at', t.finished_at, 'summary', t.result_summary)
           from public.ai_tasks t where t.agent_id = a.id and t.status in ('completed', 'failed', 'blocked') order by t.finished_at desc nulls last limit 1) as last,
        (select coalesce(sum(u.cost_usd), 0) from public.ai_usage u where u.agent_id = a.id and u.at >= date_trunc('month', now())) as cost_month
      from public.ai_agents a order by a.id`;
    const kpi = await kpiValues(tx);
    const fin = finance ? await financeMonth(tx) : null;
    const agents: AgentView[] = rows.map((a) => {
      const running = a.running as { id: string; title: string; activity: string | null; started_at: string } | null;
      const last = a.last as { id: string; title: string; status: string; finished_at: string | null; summary: string | null } | null;
      let status: AgentStatus;
      if (!a.enabled || a.autonomy === 'disabled') status = 'disabled';
      else if (!online || !llm) status = 'offline';
      else if (running) status = 'working';
      else if (Number(a.waiting) > 0) status = 'waiting';
      else if (Number(a.queued) > 0) status = 'queued';
      else if (last && last.finished_at && Date.now() - new Date(last.finished_at).getTime() < 15 * 60_000)
        status = last.status === 'completed' ? 'completed' : last.status === 'failed' ? 'failed' : 'blocked';
      else status = 'idle';
      const keys = ((a.kpis as string[]) ?? []).filter((k) => finance || !FINANCE_KPIS.has(k));
      const values: Record<string, number | null> = { ...kpi.global, ...(kpi.byAgent[String(a.id)] ?? {}), ...(fin ? { revenue_month: fin.total } : {}) };
      return {
        id: String(a.id),
        name: String(a.name),
        department: String(a.department),
        team: (a.team as string) ?? null,
        title: String(a.title),
        enabled: !!a.enabled && a.autonomy !== 'disabled',
        model: String(a.model),
        effort: String(a.effort),
        monthlyBudget: Number(a.monthly_budget_usd),
        dailyLimit: Number(a.daily_task_limit),
        objectives: (a.objectives as string[]) ?? [],
        kpis: keys.map((k) => ({ key: k, label: KPI_LABEL[k] ?? k, value: values[k] ?? null })),
        status,
        activity: running?.activity ?? null,
        currentTask: running ? { id: running.id, title: running.title, startedAt: iso(running.started_at)! } : null,
        queued: Number(a.queued),
        waiting: Number(a.waiting),
        costMonth: Number(a.cost_month),
        last: last ? { id: last.id, title: last.title, status: last.status, finishedAt: last.finished_at, summary: last.summary } : null,
      };
    });
    const eventRows = await tx<Row[]>`
      select e.id, e.task_id, e.agent_id, e.kind, e.activity, left(e.message, 400) as message, e.at, t.title as task_title
      from public.ai_task_events e left join public.ai_tasks t on t.id = e.task_id
      where e.kind not in ('llm', 'tool') or e.at > now() - interval '10 minutes'
      order by e.id desc limit 60`;
    const events: EventRow[] = eventRows.map((e) => ({
      id: Number(e.id),
      task_id: (e.task_id as string) ?? null,
      agent_id: (e.agent_id as string) ?? null,
      kind: String(e.kind),
      activity: (e.activity as string) ?? null,
      message: (e.message as string) ?? null,
      at: iso(e.at)!,
      task_title: (e.task_title as string) ?? null,
    }));
    const queueRows = await tx<Row[]>`select status, count(*)::int as n from public.ai_tasks where status in ('queued', 'running', 'waiting', 'blocked', 'failed') group by status`;
    const costs = (
      await tx<Row[]>`select coalesce(sum(cost_usd) filter (where at >= date_trunc('day', now())), 0) as today,
                             coalesce(sum(cost_usd) filter (where at >= date_trunc('month', now())), 0) as month,
                             (select value from public.ai_settings where key = 'daily_budget_usd') as cap
                      from public.ai_usage where at >= date_trunc('month', now())`
    )[0];
    const pending = await tx<{ n: number }[]>`select count(*)::int as n from public.approvals where status = 'pending'`;
    return {
      generatedAt: new Date().toISOString(),
      runtime: { online, llmConfigured: llm, workers: rt.length, lastSeen: rt[0] ? iso(rt[0].last_seen) : null, version: rt[0] ? String(rt[0].version ?? '') : null },
      agents,
      events,
      queue: Object.fromEntries(queueRows.map((q) => [String(q.status), Number(q.n)])),
      costs: { today: Number(costs?.today ?? 0), month: Number(costs?.month ?? 0), dailyCap: Number((costs?.cap as { amount?: number } | null)?.amount ?? 25) },
      approvalsPending: pending[0]?.n ?? 0,
      finance: fin,
      departments: DEPARTMENTS,
      wsUrl: wsBase(),
    };
  });
}

export async function agentDetail(user: CurrentUser, id: string) {
  return withUser(user.claims, async (tx) => {
    const agent = (await tx<Row[]>`select * from public.ai_agents where id = ${id}`)[0];
    if (!agent) return null;
    const tasks = await tx<Row[]>`select id, title, status, phase, parent_id, created_by_agent, result_summary, error, cost_usd, created_at, started_at, finished_at
                                  from public.ai_tasks where agent_id = ${id} order by created_at desc limit 30`;
    const memory = await tx<Row[]>`select id, topic, content, data_status, source, created_at from public.ai_memory where agent_id = ${id} order by created_at desc limit 20`;
    const shared = await tx<Row[]>`select id, topic, content, data_status, source, created_at from public.ai_memory where agent_id is null order by created_at desc limit 10`;
    const notes = await tx<Row[]>`select from_agent, subject, body, read_at, created_at from public.ai_messages where to_agent = ${id} order by created_at desc limit 15`;
    const usage = (await tx<Row[]>`select coalesce(sum(cost_usd), 0) as usd, coalesce(sum(input_tokens + cache_read_tokens + cache_write_tokens), 0) as input,
                                          coalesce(sum(output_tokens), 0) as output, count(*)::int as calls
                                   from public.ai_usage where agent_id = ${id} and at >= date_trunc('month', now())`)[0];
    return { agent, tasks, memory, shared, notes, usage };
  });
}

export async function taskDetail(user: CurrentUser, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  return withUser(user.claims, async (tx) => {
    const task = (await tx<Row[]>`select * from public.ai_tasks where id = ${id}`)[0];
    if (!task) return null;
    const events = await tx<Row[]>`select id::int as id, kind, activity, message, data, at from public.ai_task_events where task_id = ${id} order by id limit 400`;
    const children = await tx<Row[]>`select id, agent_id, title, status, phase, result_summary, error, cost_usd, started_at, finished_at
                                     from public.ai_tasks where parent_id = ${id} order by created_at`;
    const approvals = await tx<Row[]>`select id, number, kind, title, status, amount, currency from public.approvals where task_id = ${id}`;
    return { task, events, children, approvals };
  });
}

export async function createTask(user: CurrentUser, b: { agent_id: string; title: string; instructions: string; priority?: number; context?: unknown }) {
  return withUser(user.claims, async (tx) => {
    const agent = (await tx<Row[]>`select id from public.ai_agents where id = ${b.agent_id}`)[0];
    if (!agent) throw new Error('Agente sconosciuto');
    const prio = Math.min(9, Math.max(1, Number(b.priority ?? 5) || 5));
    const row = (
      await tx<Row[]>`insert into public.ai_tasks (agent_id, title, instructions, priority, context, created_by)
                      values (${b.agent_id}, ${b.title}, ${b.instructions}, ${prio}, ${tx.json((b.context ?? {}) as postgres.JSONValue)}, ${user.id})
                      returning id`
    )[0];
    return String(row.id);
  });
}

export async function taskAction(user: CurrentUser, id: string, action: 'cancel' | 'retry' | 'priority', priority?: number) {
  return withUser(user.claims, async (tx) => {
    if (action === 'cancel') return (await tx`update public.ai_tasks set status = 'cancelled' where id = ${id} and status in ('queued', 'running', 'waiting', 'blocked') returning id`).length > 0;
    if (action === 'retry') return (await tx`update public.ai_tasks set status = 'queued' where id = ${id} and status in ('failed', 'blocked') returning id`).length > 0;
    const p = Math.min(9, Math.max(1, Number(priority) || 5));
    return (await tx`update public.ai_tasks set priority = ${p} where id = ${id} returning id`).length > 0;
  });
}

export async function decideApproval(user: CurrentUser, id: string, decision: 'approved' | 'rejected', note: string) {
  return withUser(user.claims, async (tx) => {
    const r = await tx`update public.approvals set status = ${decision}, decided_by = ${user.id}, decided_at = now(), decision_note = ${note || null}
                       where id = ${id} and status = 'pending' returning id`;
    return r.length > 0;
  });
}

export async function updateAgent(user: CurrentUser, id: string, b: { enabled?: boolean; model?: string; effort?: string; monthly_budget_usd?: number; daily_task_limit?: number }) {
  const effort = ['low', 'medium', 'high', 'xhigh', 'max'].includes(String(b.effort)) ? String(b.effort) : null;
  const model = b.model && /^claude-[a-z0-9.-]{3,60}$/.test(b.model) ? b.model : null;
  return withUser(user.claims, async (tx) => {
    const r = await tx`update public.ai_agents set
        enabled = coalesce(${b.enabled ?? null}, enabled), model = coalesce(${model}, model), effort = coalesce(${effort}, effort),
        monthly_budget_usd = coalesce(${Number.isFinite(b.monthly_budget_usd) ? b.monthly_budget_usd! : null}, monthly_budget_usd),
        daily_task_limit = coalesce(${Number.isFinite(b.daily_task_limit) ? Math.round(b.daily_task_limit!) : null}, daily_task_limit)
      where id = ${id} returning id`;
    return r.length > 0;
  });
}

/** Indirizzo WebSocket del servizio agenti, se pubblicato (AGENTS_PUBLIC_URL) e protetto (AGENTS_WS_SECRET). */
export function wsBase(): string | null {
  const base = env('AGENTS_PUBLIC_URL');
  if (!base || !env('AGENTS_WS_SECRET')) return null;
  return base.replace(/\/$/, '').replace(/^http/, 'ws') + '/ws/events';
}

/** Token di breve durata per il WebSocket: stesso formato verificato dal servizio (exp.firma HMAC-SHA256). */
export function wsToken(ttl = 600): string | null {
  const secret = env('AGENTS_WS_SECRET');
  if (!secret) return null;
  const exp = String(Math.floor(Date.now() / 1000) + ttl);
  return `${exp}.${createHmac('sha256', secret).update(exp).digest('hex')}`;
}
