// Registrazione cliente (e richiesta di accesso B2B). L'email di conferma è tradotta e parte dal nostro dominio.
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { authConfigured } from '~/lib/server/auth';
import { sendAuthLink } from '~/lib/server/auth-flow';
import { asSystem, dbConfigured } from '~/lib/server/db';
import { email as emailSchema, guard, optStr, saveRequest, str, validationErrors } from '~/lib/server/forms';
import { fail, json } from '~/lib/server/http';
import { sendEmail } from '~/lib/server/email';
import { simpleEmail } from '~/lib/server/emails';
import { getTranslator } from '~/i18n';

export const prerender = false;

const Schema = z.object({
  name: str(120).min(2),
  email: emailSchema,
  password: z.string().min(10).max(200),
  b2b: z.any().optional().transform((v) => v === '1' || v === 'yes' || v === true),
  company: optStr(160),
  vat: optStr(40),
  b2bType: optStr(40),
  website: optStr(200),
  country: optStr(80),
  b2bNotes: optStr(2000),
});

export const POST: APIRoute = async (ctx) => {
  if (!authConfigured() || !dbConfigured()) return fail('not_configured');
  // il campo trappola dei moduli si chiama "website": qui il sito web aziendale usa "companySite"
  const g = await guard(ctx, { bucket: 'register', max: 5, windowSeconds: 3600 });
  if (g instanceof Response) return g;
  const parsed = Schema.safeParse({ ...g.body, website: g.body.companySite });
  if (!parsed.success) return validationErrors(parsed.error);
  const d = parsed.data;
  if (d.b2b && (!d.company || !d.b2bType || !d.country)) return fail('invalid', { errors: { company: d.company ? '' : 'required', b2bType: d.b2bType ? '' : 'required', country: d.country ? '' : 'required' } });
  const tr = await getTranslator(g.lang);
  const res = await sendAuthLink({
    type: 'signup',
    email: d.email,
    password: d.password,
    lang: g.lang,
    name: d.name,
    next: d.b2b ? `/${g.lang}/account/b2b/` : `/${g.lang}/account/`,
    data: { full_name: d.name, lang: g.lang },
  });
  // Anche se l'indirizzo è già registrato rispondiamo allo stesso modo (nessuna informazione a chi tenta).
  if (res.ok && res.userId) {
    await asSystem(
      (tx) => tx`update public.profiles set full_name = ${d.name}, lang = ${g.lang}, privacy_accepted_at = now(),
        company = coalesce(${d.company}, company), vat_number = coalesce(${d.vat}, vat_number), country = coalesce(${d.country}, country),
        b2b_type = coalesce(${d.b2bType}, b2b_type), b2b_website = coalesce(${d.website}, b2b_website), b2b_notes = coalesce(${d.b2bNotes}, b2b_notes),
        b2b_status = case when ${d.b2b} then 'pending'::public.b2b_status else b2b_status end
        where id = ${res.userId}`,
    );
    if (d.b2b) {
      await saveRequest(ctx, {
        kind: 'b2b',
        name: d.name,
        email: d.email,
        company: d.company,
        country: d.country,
        lang: g.lang,
        message: d.b2bNotes,
        details: { type: d.b2bType, vat: d.vat, website: d.website, userId: res.userId },
        source: 'register',
      });
      const mail = await simpleEmail(g.lang, 'b2bReceived', { name: d.name });
      await sendEmail({ to: d.email, ...mail, template: 'b2b-received', lang: g.lang });
    }
  }
  return json({ ok: true, message: tr.t('account.register.sent') });
};
