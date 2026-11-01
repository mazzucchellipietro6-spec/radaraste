// Richiesta commerciale creata dal Marble Concierge (con il brief e le proposte del catalogo).
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { configuredForForms, done, email, guard, optStr, saveRequest, str, validationErrors } from '~/lib/server/forms';
import { requestReceivedEmail } from '~/lib/server/emails';
import { emailConfigured, sendEmail } from '~/lib/server/email';
import { fail } from '~/lib/server/http';
import { getTranslator } from '~/i18n';

export const prerender = false;

const slug = z.string().regex(/^[a-z0-9-]{1,80}$/);
const list = z.array(z.string().max(60)).max(20).default([]);
const Schema = z.object({
  name: str(120).min(2),
  email,
  phone: optStr(40),
  company: optStr(160),
  message: optStr(5000),
  brief: z.object({
    project: z.string().max(60).default(''),
    use: list,
    color: list,
    intensity: z.string().max(40).default(''),
    pattern: z.string().max(40).default(''),
    material: list,
    quantity: z.string().max(30).default(''),
    unit: z.string().max(10).default('m2'),
    finish: list,
    country: z.string().max(80).default(''),
    city: z.string().max(80).default(''),
    budget: z.string().max(60).default(''),
  }),
  proposals: z.array(slug).max(5).default([]),
});

export const POST: APIRoute = async (ctx) => {
  const g = await guard(ctx, { bucket: 'form-concierge', max: 6, windowSeconds: 600 });
  if (g instanceof Response) return g;
  if (!configuredForForms()) return fail('not_configured');
  const parsed = Schema.safeParse(g.body);
  if (!parsed.success) return validationErrors(parsed.error);
  const d = parsed.data;
  const tr = await getTranslator(g.lang);
  const b = d.brief;
  const v = (group: string, keys: string[]) => keys.map((k) => tr.t(`vocab.${group}.${k}`)).join(', ');
  const saved = await saveRequest(ctx, {
    kind: 'concierge',
    name: d.name,
    email: d.email,
    phone: d.phone,
    company: d.company,
    country: b.country || null,
    lang: g.lang,
    interest: 'marble',
    message: d.message,
    marbles: d.proposals,
    details: { brief: b, proposals: d.proposals },
    source: 'concierge',
  });
  if (!saved) return fail('not_configured');
  const mail = await requestReceivedEmail(g.lang, {
    name: d.name,
    reference: saved.reference,
    materials: true,
    rows: [
      [tr.t('emails.fields.project'), b.project ? tr.t(`vocab.projectType.${b.project}`) : ''],
      [tr.t('concierge.q.use'), v('application', b.use)],
      [tr.t('concierge.q.color'), v('baseColor', b.color)],
      [tr.t('emails.fields.finish'), v('finish', b.finish)],
      [tr.t('emails.fields.quantity'), b.quantity ? `${b.quantity} ${tr.t(`concierge.units.${b.unit}`)}` : ''],
      [tr.t('emails.fields.destinationShipping'), [b.city, b.country].filter(Boolean).join(', ')],
      [tr.t('emails.fields.budget'), b.budget],
      [tr.t('emails.fields.marbles'), d.proposals.join(', ')],
      [tr.t('emails.fields.message'), d.message],
    ],
  });
  await sendEmail({ to: d.email, ...mail, template: 'request-received', lang: g.lang, related: saved.id ? { type: 'request', id: saved.id } : undefined });
  return done(g, saved.reference, { message: tr.t(emailConfigured() ? 'concierge.success' : 'concierge.successNoEmail', { ref: saved.reference }) });
};
