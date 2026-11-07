// Controlli comuni dei moduli pubblici: antispam, limiti di frequenza, consenso privacy, validazione.
import { securityEvent } from './security';
import type { APIContext } from 'astro';
import { z } from 'zod';
import { LANGS } from '~/i18n';
import { asSystem, dbConfigured } from './db';
import { emailConfigured, notifyAddress, sendEmail } from './email';
import { staffEmail } from './emails';
import { clientIp, fail, json, readBody } from './http';
import { rateLimit } from './rate-limit';
import { looksLikeBot, verifyTurnstile } from './turnstile';
import { currentUser } from './auth';

export const str = (max: number) => z.string().trim().max(max);
export const optStr = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));
export const email = z.string().trim().toLowerCase().max(254).email();

type Guarded = { body: Record<string, unknown>; ip: string; lang: string; wantsJson: boolean };

/** Esegue tutti i controlli; restituisce una Response in caso di blocco. */
export async function guard(ctx: APIContext, opts: { bucket: string; max: number; windowSeconds: number }): Promise<Guarded | Response> {
  const { request, clientAddress } = ctx;
  const ip = clientIp(request, clientAddress);
  const body = await readBody(request);
  const wantsJson = (request.headers.get('accept') ?? '').includes('application/json');
  const lang = typeof body.lang === 'string' && LANGS.includes(body.lang) ? body.lang : 'en';
  if (looksLikeBot(body)) return fail('spam');
  if (!(await rateLimit(`${opts.bucket}:${ip}`, opts.max, opts.windowSeconds))) {
    await securityEvent({ kind: 'rate_limited', severity: 'low', message: `Limite di frequenza superato (${opts.bucket})`, ip, path: new URL(request.url).pathname });
    return fail('rate_limited');
  }
  if (!(await verifyTurnstile(body['cf-turnstile-response'], ip))) return fail('spam');
  if (body.privacy !== 'yes' && body.privacy !== true && body.privacy !== 'on') return fail('invalid', { errors: { privacy: 'privacy' } });
  return { body, ip, lang, wantsJson };
}

/** Errori di validazione nel formato atteso dal browser: { campo: "required" | "email" | "invalid" }. */
export function validationErrors(err: z.ZodError) {
  const errors: Record<string, string> = {};
  for (const issue of err.issues) {
    const field = String(issue.path[0] ?? 'form');
    if (errors[field]) continue;
    errors[field] = field === 'email' ? 'email' : issue.code === 'too_small' || issue.code === 'invalid_type' ? 'required' : 'invalid';
  }
  return fail('invalid', { errors });
}

/** Risposta finale: JSON per il browser con JavaScript, pagina di conferma altrimenti. */
export function done(g: Guarded, reference: string, extra: Record<string, unknown> = {}) {
  if (g.wantsJson) return json({ ok: true, reference, ...extra });
  return new Response(null, { status: 303, headers: { location: `/${g.lang}/sent/?ref=${encodeURIComponent(reference)}` } });
}

export interface NewRequest {
  kind: 'quote' | 'concierge' | 'matching' | 'contact' | 'b2b' | 'tech_sheet' | 'custom_trip' | 'trade';
  name: string | null;
  email: string;
  phone?: string | null;
  company?: string | null;
  country?: string | null;
  lang: string;
  interest?: string | null;
  message?: string | null;
  marbles?: string[];
  details?: Record<string, unknown>;
  source?: string | null;
}

/** Salva una richiesta commerciale nel CRM e avvisa lo staff. */
export async function saveRequest(ctx: APIContext, r: NewRequest): Promise<{ id: string | null; reference: string } | null> {
  const user = await currentUser(ctx).catch(() => null);
  let saved: { id: string | null; reference: string } | null = null;
  if (dbConfigured()) {
    const rows = await asSystem(
      (tx) => tx<{ id: string; reference: string }[]>`
        insert into public.requests (kind, user_id, name, email, phone, company, country, lang, interest, message, marbles, details, source, privacy_consent_at)
        values (${r.kind}, ${user?.id ?? null}, ${r.name}, ${r.email}, ${r.phone ?? null}, ${r.company ?? null}, ${r.country ?? null}, ${r.lang},
                ${r.interest ?? null}, ${r.message ?? null}, ${r.marbles ?? []}, ${tx.json((r.details ?? {}) as never)}, ${r.source ?? null}, now())
        returning id, reference`,
    );
    saved = rows[0];
  } else if (emailConfigured()) {
    // senza database la richiesta arriva comunque per email allo staff
    saved = { id: null, reference: `WC-R-${Date.now().toString(36).toUpperCase()}` };
  }
  if (!saved) return null;
  const to = notifyAddress();
  if (to) {
    const mail = await staffEmail(`Nuova richiesta ${saved.reference} (${r.kind})`, [
      ['Nome', r.name],
      ['Email', r.email],
      ['Telefono', r.phone],
      ['Azienda', r.company],
      ['Paese', r.country],
      ['Lingua', r.lang],
      ['Interesse', r.interest],
      ['Marmi', r.marbles?.join(', ')],
      ['Messaggio', r.message],
      ['Dettagli', r.details && Object.keys(r.details).length ? JSON.stringify(r.details, null, 1) : null],
    ], saved.id ? `/admin/requests/${saved.id}/` : '/admin/');
    await sendEmail({ to, ...mail, template: 'staff-request', lang: 'it', replyTo: r.email, related: saved.id ? { type: 'request', id: saved.id } : undefined });
  }
  return saved;
}

export const configuredForForms = () => dbConfigured() || emailConfigured();
