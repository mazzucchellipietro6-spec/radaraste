// Richiesta di preventivo / contatto (home, pagina preventivo, schede marmo, contatti).
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { configuredForForms, done, email, guard, optStr, saveRequest, str, validationErrors } from '~/lib/server/forms';
import { requestReceivedEmail } from '~/lib/server/emails';
import { emailConfigured, sendEmail } from '~/lib/server/email';
import { fail } from '~/lib/server/http';
import { getTranslator } from '~/i18n';

export const prerender = false;

const Schema = z.object({
  name: str(120).min(2),
  email,
  phone: optStr(40),
  company: optStr(160),
  country: optStr(80),
  interest: z.enum(['marble', 'experience', 'tour', 'trade', 'other']).default('other'),
  message: str(5000).min(5),
  marbles: z.preprocess((v) => (typeof v === 'string' ? v.split(',') : v), z.array(z.string().regex(/^[a-z0-9-]{1,80}$/)).max(30)).optional(),
  source: optStr(40),
  doc: optStr(5),
});

export const POST: APIRoute = async (ctx) => {
  const g = await guard(ctx, { bucket: 'form-quote', max: 6, windowSeconds: 600 });
  if (g instanceof Response) return g;
  if (!configuredForForms()) return fail('not_configured');
  const parsed = Schema.safeParse(g.body);
  if (!parsed.success) return validationErrors(parsed.error);
  const d = parsed.data;
  const kind = d.source === 'contact' ? 'contact' : d.doc ? 'tech_sheet' : d.interest === 'trade' ? 'trade' : 'quote';
  const saved = await saveRequest(ctx, {
    kind,
    name: d.name,
    email: d.email,
    phone: d.phone,
    company: d.company,
    country: d.country,
    lang: g.lang,
    interest: d.interest,
    message: d.message,
    marbles: d.marbles ?? [],
    source: d.source,
  });
  if (!saved) return fail('not_configured');
  const tr = await getTranslator(g.lang);
  const mail = await requestReceivedEmail(g.lang, {
    name: d.name,
    reference: saved.reference,
    materials: d.interest === 'marble' || d.interest === 'trade' || !!d.marbles?.length,
    rows: [
      [tr.t('emails.fields.interest'), tr.t(`forms.interestOptions.${d.interest}`)],
      [tr.t('emails.fields.marbles'), d.marbles?.join(', ')],
      [tr.t('emails.fields.message'), d.message],
    ],
  });
  await sendEmail({ to: d.email, ...mail, template: 'request-received', lang: g.lang, related: saved.id ? { type: 'request', id: saved.id } : undefined });
  return done(g, saved.reference, emailConfigured() ? {} : { message: tr.t('forms.successNoEmail', { ref: saved.reference }) });
};
