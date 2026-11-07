// Eventi di sicurezza visibili al proprietario nella Control Room (tabella security_events).
// Gli indirizzi IP non si salvano in chiaro: solo un'impronta (hash con sale), sufficiente a riconoscere
// tentativi ripetuti dalla stessa origine senza conservare il dato personale (GDPR, minimizzazione).
import { createHash } from 'node:crypto';
import { asSystem, dbConfigured } from './db';
import { env } from './env';

export type SecurityKind = 'login_failed' | 'mfa_failed' | 'rate_limited' | 'access_denied' | 'kill_switch' | 'agent_paused'
  | 'config_change' | 'approval_decision' | 'audit_chain_broken' | 'other';
export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export function ipHash(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const salt = env('SECURITY_HASH_SALT') ?? env('SUPABASE_SERVICE_ROLE_KEY')?.slice(-16) ?? 'white-carrara';
  return createHash('sha256').update(`${salt}|${ip}`).digest('hex').slice(0, 24);
}

/** a***@dominio.it: abbastanza per riconoscere l'account, non per esporre l'indirizzo intero. */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email || !email.includes('@')) return null;
  const [u, d] = email.split('@');
  return `${u.slice(0, 1)}***@${d}`;
}

export async function securityEvent(e: {
  kind: SecurityKind;
  severity: Severity;
  message: string;
  actor?: string | null;
  userId?: string | null;
  ip?: string | null;
  path?: string | null;
  details?: Record<string, unknown>;
}) {
  if (!dbConfigured()) return;
  try {
    await asSystem((tx) => tx`insert into public.security_events (kind, severity, source, actor, user_id, ip_hash, path, message, details)
      values (${e.kind}, ${e.severity}, 'site', ${e.actor ?? null}, ${e.userId ?? null}, ${ipHash(e.ip)}, ${e.path ?? null},
              ${e.message.slice(0, 1000)}, ${tx.json((e.details ?? {}) as never)})`);
  } catch (err) {
    console.warn('[security] evento non registrato:', (err as Error).message);
  }
}
