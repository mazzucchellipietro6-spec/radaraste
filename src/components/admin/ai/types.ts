// Tipi e formattazione condivisi dalla sede 3D e dalla control room.
export type AgentStatus = 'offline' | 'disabled' | 'working' | 'waiting' | 'queued' | 'completed' | 'failed' | 'blocked' | 'idle';

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

export interface CompanyState {
  generatedAt: string;
  runtime: { online: boolean; llmConfigured: boolean; workers: number; lastSeen: string | null; version: string | null };
  agents: AgentView[];
  events: EventRow[];
  queue: Record<string, number>;
  costs: { today: number; month: number; dailyCap: number };
  approvalsPending: number;
  finance: { resale: number; commissions: number; gmv: number; cashIn: number; total: number; target: number; gap: number } | null;
  departments: { id: string; label: string }[];
  wsUrl: string | null;
}

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

export const STATUS_COLOR: Record<AgentStatus, string> = {
  offline: '#8f8a80',
  disabled: '#b9b3a8',
  working: '#c9ac80',
  waiting: '#d9a441',
  queued: '#5b7fa6',
  completed: '#3f8f5f',
  failed: '#b5463c',
  blocked: '#b5463c',
  idle: '#9fb3a0',
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

export const EVENT_LABEL: Record<string, string> = {
  started: 'Inizia',
  llm: 'Ragiona',
  tool: 'Strumento',
  tool_error: 'Errore strumento',
  unauthorized_tool: 'Strumento non autorizzato',
  delegated: 'Delega',
  waiting: 'In attesa',
  resumed: 'Riprende',
  completed: 'Completato',
  failed: 'Fallito',
  blocked: 'Bloccato',
  retry: 'Nuovo tentativo',
  recovered: 'Ripreso',
  cancelled: 'Annullato',
  approval_requested: 'Chiede approvazione',
  refusal: 'Rifiuto del modello',
  error: 'Errore',
};

export const TASK_STATUS: Record<string, string> = {
  queued: 'In coda',
  running: 'In corso',
  waiting: 'In attesa dei colleghi',
  completed: 'Completato',
  failed: 'Fallito',
  cancelled: 'Annullato',
  blocked: 'Bloccato',
};

export const DATA_STATUS: Record<string, string> = { verified: 'verificato', estimated: 'stimato', assumed: 'ipotesi', unknown: 'sconosciuto' };

export const eur = (n: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
export const usd = (n: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);
export const when = (s: string | null | undefined) => (s ? new Date(s).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
export const since = (s: string | null | undefined) => {
  if (!s) return '';
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  if (m < 1) return 'ora';
  if (m < 60) return `${m} min fa`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h fa` : `${Math.round(h / 24)} g fa`;
};

export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: 'same-origin', ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { message?: string }).message ?? `Errore ${r.status}`);
  return data as T;
}
