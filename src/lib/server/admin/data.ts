// Lettura e scrittura generica per le sezioni del pannello. Ogni operazione gira con l'identità
// dell'amministratore (withUser): valgono le regole RLS e il registro delle modifiche sa chi è stato.
import type postgres from 'postgres';
import { withUser } from '../db';
import type { CurrentUser, Profile } from '../auth';
import { marbles } from '~/lib/site';
import { resource, type FieldDef, type ResourceDef } from './resources';

type Tx = postgres.TransactionSql;
type Row = Record<string, unknown>;
export const PAGE_SIZE = 50;

function fixedWhere(tx: Tx, r: ResourceDef) {
  return Object.entries(r.fixed ?? {}).reduce((acc, [k, v]) => tx`${acc} and ${tx(k)} = ${v}`, tx`true`);
}

function searchWhere(tx: Tx, r: ResourceDef, q: string) {
  if (!q.trim() || !r.search.length) return tx``;
  const pat = `%${q.trim().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const ors = r.search.map((c) => tx`${tx(c)}::text ilike ${pat}`).reduce((acc, f) => tx`${acc} or ${f}`);
  return tx`and (${ors})`;
}

function filterWhere(tx: Tx, r: ResourceDef, filters: Record<string, string>) {
  let out = tx``;
  for (const name of r.filters ?? []) {
    const v = filters[name];
    if (!v) continue;
    const f = r.fields.find((x) => x.name === name);
    if (name === 'active' || f?.type === 'bool') out = tx`${out} and ${tx(name)} = ${v === 'true'}`;
    else if (!f?.options || f.options.some(([o]) => o === v)) out = tx`${out} and ${tx(name)} = ${v}`;
  }
  return out;
}

export async function listRows(user: CurrentUser, r: ResourceDef, o: { q?: string; filters?: Record<string, string>; page?: number; all?: boolean; where?: Record<string, string> }) {
  const page = Math.max(1, o.page ?? 1);
  return withUser(user.claims, async (tx) => {
    let extra = tx``;
    for (const [k, v] of Object.entries(o.where ?? {})) extra = tx`${extra} and ${tx(k)} = ${v}`;
    const base = tx`from ${tx(r.table)} where ${fixedWhere(tx, r)} ${searchWhere(tx, r, o.q ?? '')} ${filterWhere(tx, r, o.filters ?? {})} ${extra}`;
    const total = Number((await tx<{ n: number }[]>`select count(*)::int as n ${base}`)[0]?.n ?? 0);
    const limit = o.all ? 10000 : PAGE_SIZE;
    const rows = await tx<Row[]>`select * ${base} order by ${tx.unsafe(r.order)} limit ${limit} offset ${o.all ? 0 : (page - 1) * PAGE_SIZE}`;
    return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
  });
}

export async function getRow(user: CurrentUser, r: ResourceDef, id: string): Promise<Row | null> {
  if (!/^[0-9a-f-]{36}$/.test(id) && r.table !== 'audit_log') return null;
  return withUser(user.claims, async (tx) => (await tx<Row[]>`select * from ${tx(r.table)} where id = ${id} and ${fixedWhere(tx, r)}`)[0] ?? null);
}

/** Valori di un campo dal modulo, già convertiti e validati. */
export function parseField(f: FieldDef, raw: unknown): unknown {
  const s = typeof raw === 'string' ? raw.trim() : Array.isArray(raw) ? String(raw[0] ?? '').trim() : '';
  switch (f.type) {
    case 'bool':
      return raw === 'on' || raw === 'true' || raw === true;
    case 'number':
    case 'money':
    case 'percent': {
      if (!s) return null;
      const n = Number(s.replace(',', '.'));
      if (!Number.isFinite(n)) throw new Error(`${f.label}: numero non valido`);
      return n;
    }
    case 'date':
      if (!s) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`${f.label}: data non valida`);
      return s;
    case 'datetime':
      return s || null;
    case 'tags':
      return s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 100);
    case 'ref':
      if (!s) return null;
      if (!/^[0-9a-f-]{36}$/.test(s)) throw new Error(`${f.label}: valore non valido`);
      return s;
    case 'select':
      if (!s) return null;
      if (f.options?.length && !f.options.some(([v]) => v === s)) throw new Error(`${f.label}: valore non ammesso`);
      return s;
    case 'email':
      if (!s) return null;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) throw new Error(`${f.label}: email non valida`);
      return s.toLowerCase();
    default:
      return s ? s.slice(0, f.type === 'textarea' ? 20000 : 1000) : null;
  }
}

export function editableFields(r: ResourceDef, profile: Profile) {
  return r.fields.filter((f) => !f.readonly && f.type !== 'json' && (!f.adminOnly || profile.role === 'admin'));
}

export async function saveRow(user: CurrentUser, profile: Profile, r: ResourceDef, id: string | null, body: Record<string, unknown>) {
  if (r.readonly) throw new Error('Sezione in sola lettura');
  const fields = editableFields(r, profile);
  const data: Row = {};
  for (const f of fields) {
    const v = parseField(f, body[f.name]);
    if (f.required && (v === null || v === '')) throw new Error(`${f.label}: campo obbligatorio`);
    data[f.name] = v;
  }
  Object.assign(data, r.fixed ?? {});
  const cols = Object.keys(data);
  return withUser(user.claims, async (tx) => {
    if (id) {
      const res = await tx<{ id: string }[]>`update ${tx(r.table)} set ${tx(data, cols)} where id = ${id} and ${fixedWhere(tx, r)} returning id`;
      if (!res[0]) throw new Error('Elemento non trovato o non modificabile');
      return res[0].id;
    }
    if (r.create === false) throw new Error('Creazione non prevista per questa sezione');
    const res = await tx<{ id: string }[]>`insert into ${tx(r.table)} ${tx(data, cols)} returning id`;
    return res[0].id;
  });
}

export async function removeRow(user: CurrentUser, r: ResourceDef, id: string) {
  if (!r.remove) throw new Error('Eliminazione non prevista per questa sezione');
  await withUser(user.claims, async (tx) => {
    if (r.remove === 'deactivate') await tx`update ${tx(r.table)} set active = false where id = ${id}`;
    else await tx`delete from ${tx(r.table)} where id = ${id} and ${fixedWhere(tx, r)}`;
  });
}

/** Opzioni per i campi che puntano ad altre sezioni (id -> etichetta). */
export async function refOptions(user: CurrentUser, key: string): Promise<[string, string][]> {
  return withUser(user.claims, async (tx) => {
    if (key === 'staff') {
      const rows = await tx<{ id: string; email: string; full_name: string | null }[]>`select id, email, full_name from public.profiles where role in ('staff', 'admin') order by email`;
      return rows.map((x) => [x.id, x.full_name ? `${x.full_name} (${x.email})` : x.email] as [string, string]);
    }
    if (key === 'customers') {
      const rows = await tx<{ id: string; email: string; full_name: string | null; company: string | null }[]>`select id, email, full_name, company from public.profiles order by email limit 2000`;
      return rows.map((x) => [x.id, [x.full_name, x.company, x.email].filter(Boolean).join(' · ')] as [string, string]);
    }
    const r = resource(key);
    if (!r) return [];
    const rows = await tx<Row[]>`select id, ${tx(r.title)} as label ${r.table === 'deals' ? tx`, number` : r.table === 'requests' ? tx`, name` : tx``} from ${tx(r.table)} where ${fixedWhere(tx, r)} order by ${tx.unsafe(r.order)} limit 1000`;
    return rows.map((x) => [String(x.id), [x.number, x.label, x.name].filter(Boolean).join(' · ') || String(x.id).slice(0, 8)] as [string, string]);
  }).catch(() => []);
}

export async function marbleOptions(): Promise<[string, string][]> {
  return (await marbles()).map((m) => [m.id, m.data.name]);
}

/** Opzioni complete di una sezione (riferimenti e marmi) per moduli ed elenchi. */
export async function resolveOptions(user: CurrentUser, r: ResourceDef) {
  const out: Record<string, [string, string][]> = {};
  for (const f of r.fields) {
    if (f.type === 'ref' && f.ref) out[f.name] = await refOptions(user, f.ref);
    if (f.name === 'marble_slug') out[f.name] = await marbleOptions();
  }
  return out;
}

export function displayValue(f: FieldDef, v: unknown, opts?: [string, string][]): string {
  if (v === null || v === undefined || v === '') return '';
  if (f.type === 'bool') return v ? 'Sì' : 'No';
  if (f.type === 'money') return new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v));
  if (f.type === 'percent') return `${Number(v)}%`;
  if (f.type === 'date') return new Date(v as string).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' });
  if (f.type === 'datetime') return new Date(v as string).toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'short', timeStyle: 'short' });
  if (f.type === 'tags') return (v as string[]).join(', ');
  if (f.type === 'json') return JSON.stringify(v, null, 2);
  const list = opts ?? f.options;
  if (list) return list.find(([k]) => k === String(v))?.[1] ?? String(v);
  return String(v);
}

export function toCsv(r: ResourceDef, rows: Row[], options: Record<string, [string, string][]>) {
  const fields = r.fields;
  const esc = (s: string) => (/[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const head = ['id', ...fields.map((f) => f.label)].map(esc).join(';');
  const lines = rows.map((row) => [String(row.id ?? ''), ...fields.map((f) => displayValue(f, row[f.name], options[f.name]))].map(esc).join(';'));
  // BOM e punto e virgola: si apre correttamente in Excel con impostazioni italiane
  return `﻿${head}\r\n${lines.join('\r\n')}\r\n`;
}
