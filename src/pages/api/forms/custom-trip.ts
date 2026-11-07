// Richiesta di viaggio su misura in più città (registrata come prenotazione di tipo "custom_trip").
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { configuredForForms, done, email, guard, optStr, str, validationErrors } from '~/lib/server/forms';
import { saveBooking } from '~/lib/server/bookings';
import { emailConfigured } from '~/lib/server/email';
import { fail } from '~/lib/server/http';
import { getTranslator } from '~/i18n';
import { destinations } from '~/lib/site';

export const prerender = false;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const today = () => new Date().toISOString().slice(0, 10);

const Schema = z
  .object({
    destinations: z.preprocess((v) => (Array.isArray(v) ? v : v ? [v] : []), z.array(z.string().regex(/^[a-z0-9-]{1,80}$/)).min(1).max(30)),
    start: isoDate.refine((d) => d >= today()),
    end: isoDate,
    participants: z.coerce.number().int().min(1).max(500),
    pace: z.enum(['relaxed', 'balanced', 'intense']),
    guideLanguage: str(20).min(2),
    interests: optStr(500),
    budget: optStr(80),
    firstName: str(80).min(1),
    lastName: str(80).min(1),
    email,
    phone: str(40).min(5),
    nationality: str(80).min(2),
    transfer: z.any().optional().transform((v) => v === 'yes' || v === true || v === 'on'),
    notes: optStr(5000),
  })
  .refine((d) => d.end >= d.start, { path: ['end'] });

export const POST: APIRoute = async (ctx) => {
  const g = await guard(ctx, { bucket: 'form-trip', max: 5, windowSeconds: 600 });
  if (g instanceof Response) return g;
  if (!configuredForForms()) return fail('not_configured');
  const parsed = Schema.safeParse(g.body);
  if (!parsed.success) return validationErrors(parsed.error);
  const d = parsed.data;
  const all = await destinations();
  const chosen = all.filter((x) => d.destinations.includes(x.id));
  if (!chosen.length) return fail('invalid', { errors: { destinations: 'required' } });
  const tr = await getTranslator(g.lang);
  const localNames = chosen.map((x) => tr.localize('destinations', x.id, x.data).name);
  const saved = await saveBooking(
    ctx,
    {
      kind: 'custom_trip',
      itemSlug: null,
      itemTitle: `Viaggio su misura: ${chosen.map((x) => x.data.name).join(', ')}`,
      firstName: d.firstName,
      lastName: d.lastName,
      email: d.email,
      phone: d.phone,
      nationality: d.nationality,
      lang: g.lang,
      preferredDate: d.start,
      alternativeDate: null,
      participants: d.participants,
      guideLanguage: d.guideLanguage,
      transfer: d.transfer,
      transferDetails: null,
      notes: d.notes,
      details: { destinations: d.destinations, end: d.end, pace: d.pace, interests: d.interests, budget: d.budget },
    },
    [
      [tr.t('customTrip.destinations'), localNames.join(', ')],
      [tr.t('customTrip.start'), tr.fmt.date(d.start)],
      [tr.t('customTrip.end'), tr.fmt.date(d.end)],
      [tr.t('emails.fields.participants'), d.participants],
      [tr.t('customTrip.pace'), tr.t(`customTrip.paceOptions.${d.pace}`)],
      [tr.t('customTrip.interests'), d.interests],
      [tr.t('emails.fields.budget'), d.budget],
      [tr.t('emails.fields.notes'), d.notes],
    ],
  );
  return done(g, saved.reference, { message: tr.t(emailConfigured() ? 'booking.success' : 'booking.successNoEmail', { ref: saved.reference }) });
};
