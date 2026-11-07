// Collegamento al database PostgreSQL di Supabase.
// Le operazioni dei visitatori passano da withUser(): stesso ruolo e stesse regole RLS di Supabase.
// Le operazioni di sistema (webhook, email, moduli pubblici già validati) usano asSystem().
import postgres from 'postgres';
import { env } from './env';

type Sql = postgres.Sql<Record<string, never>>;
let client: Sql | null = null;

export function dbConfigured() {
  return !!env('DATABASE_URL');
}

export function sql(): Sql {
  if (!client) {
    const url = env('DATABASE_URL');
    if (!url) throw new DbNotConfigured();
    client = postgres(url, {
      // il pooler di Supabase (porta 6543, modalità transaction) non supporta i prepared statement
      prepare: false,
      max: Number(env('DATABASE_POOL_MAX') ?? 3),
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: url.includes('localhost') || url.includes('127.0.0.1') ? false : 'require',
      transform: { undefined: null },
    }) as Sql;
  }
  return client;
}

export class DbNotConfigured extends Error {
  constructor() {
    super('Database non configurato: imposta DATABASE_URL nel file .env (vedi README).');
    this.name = 'DbNotConfigured';
  }
}

export interface Claims {
  sub: string;
  email?: string;
  role?: string;
  aal?: string;
  [k: string]: unknown;
}

/** Esegue `fn` come l'utente indicato: valgono le regole RLS (come nelle API di Supabase). */
export async function withUser<T>(claims: Claims | null, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return sql().begin(async (tx) => {
    const role = claims ? 'authenticated' : 'anon';
    await tx`select set_config('request.jwt.claims', ${JSON.stringify(claims ?? { role: 'anon' })}, true)`;
    await tx`select set_config('request.jwt.claim.sub', ${claims?.sub ?? ''}, true)`;
    await tx.unsafe(`set local role ${role}`);
    return fn(tx);
  }) as Promise<T>;
}

/** Operazioni di sistema (proprietario delle tabelle, senza RLS). Da usare solo dopo i controlli lato server. */
export async function asSystem<T>(fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return sql().begin(async (tx) => {
    await tx`select set_config('app.actor', 'system', true)`;
    return fn(tx);
  }) as Promise<T>;
}
