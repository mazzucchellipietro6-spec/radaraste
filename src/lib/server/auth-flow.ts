// Passaggi comuni di accesso e registrazione: link di conferma firmati da Supabase ma inviati
// con le nostre email tradotte, redirect sicuri, promozione degli amministratori.
import type { AstroCookies } from 'astro';
import { asSystem, dbConfigured } from './db';
import { adminEmails, supabaseAdmin } from './auth';
import { siteUrl } from './site-url';
import { sendEmail } from './email';
import { authEmail } from './emails';

/** Solo percorsi interni (mai redirect verso altri siti). */
export function safeNext(next: unknown, fallback: string) {
  const n = typeof next === 'string' ? next : '';
  return n.startsWith('/') && !n.startsWith('//') && !n.includes('\\') ? n : fallback;
}

export async function profileExists(email: string) {
  if (!dbConfigured()) return true;
  const rows = await asSystem((tx) => tx`select 1 from public.profiles where email = ${email} limit 1`);
  return rows.length > 0;
}

type LinkType = 'signup' | 'magiclink' | 'recovery';

/** Crea il link di Supabase e lo invia con la nostra email nella lingua del cliente. */
export async function sendAuthLink(o: { type: LinkType; email: string; password?: string; lang: string; next: string; name?: string | null; data?: Record<string, unknown> }) {
  const admin = supabaseAdmin();
  const params =
    o.type === 'signup'
      ? { type: 'signup' as const, email: o.email, password: o.password!, options: { data: o.data ?? {} } }
      : { type: o.type, email: o.email };
  const { data, error } = await admin.auth.admin.generateLink(params as never);
  if (error || !data?.properties?.hashed_token) return { ok: false as const, error: error?.message ?? 'link', userId: null };
  const url = `${siteUrl()}/auth/confirm/?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=${encodeURIComponent(data.properties.verification_type)}&next=${encodeURIComponent(o.next)}`;
  const kind = o.type === 'signup' ? 'authConfirm' : o.type === 'magiclink' ? 'authMagic' : 'authReset';
  const mail = await authEmail(o.lang, kind, url, o.name);
  await sendEmail({ to: o.email, ...mail, template: kind, lang: o.lang });
  return { ok: true as const, userId: data.user?.id ?? null };
}

/** Gli indirizzi in ADMIN_EMAILS diventano amministratori al primo accesso (servirà comunque la verifica in due passaggi). */
export async function promoteIfAdmin(userId: string, email: string) {
  if (!dbConfigured() || !adminEmails().includes(email.toLowerCase())) return;
  await asSystem(
    (tx) => tx`update public.profiles set role = 'admin' where id = ${userId} and role <> 'admin'`,
  );
}

export function redirect(to: string, cookies?: AstroCookies) {
  void cookies;
  return new Response(null, { status: 303, headers: { location: to } });
}
