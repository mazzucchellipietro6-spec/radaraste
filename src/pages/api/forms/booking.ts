// Richiesta di prenotazione di un'esperienza a Carrara o di un tour in Italia.
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { configuredForForms, done, email, guard, optStr, str, validationErrors } from '~/lib/server/forms';
import { saveBooking } from '~/lib/server/bookings';
import { emailConfigured } from '~/lib/server/email';
import { fail } from '~/lib/server/http';
import { getTranslator } from '~/i18n';
import { destinations, experiences } from '~/lib/site';

export const prerender = false;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const future = (d: string) => d >= new Date().toISOString().slice(0, 10);

const Schema = z.object({
  item: z.string().regex(/^(experience|destination):[a-z0-9-]{1,80}$/),
  firstName: str(80).min(1),
  lastName: str(80).min(1),
  email,
  phone: str(40).min(5),
  nationality: str(80).min(2),
  date: isoDate.refine(future),
  altDate: z.union([isoDate.refine(future), z.literal('')]).optional().transform((v) => v || null),
  participants: z.coerce.number().int().min(1).max(500),
  guideLanguage: str(20).min(2),
  transfer: z.any().optional().transform((v) => v === 'yes' || v === true || v === 'on'),
  transferDetails: optStr(500),
  notes: optStr(5000),
});

export const POST: APIRoute = async (ctx) => {
  const g = await guard(ctx, { bucket: 'form-booking', max: 6, windowSeconds: 600 });
  if (g instanceof Response) return g;
  if (!configuredForForms()) return fail('not_configured');
  const parsed = Schema.safeParse(g.body);
  if (!parsed.success) return validationErrors(parsed.error);
  const d = parsed.data;
  const [kind, slug] = d.item.split(':') as ['experience' | 'destination', string];
  const tr = await getTranslator(g.lang);
  let titleIt = '';
  let titleLocal = '';
  if (kind === 'experience') {
    const e = (await experiences()).find((x) => x.id === slug);
    if (!e) return fail('invalid', { errors: { item: 'invalid' } });
    titleIt = e.data.title;
    titleLocal = tr.localize('experiences', slug, e.data).title;
  } else {
    const x = (await destinations()).find((y) => y.id === slug);
    if (!x) return fail('invalid', { errors: { item: 'invalid' } });
    titleIt = x.data.name;
    titleLocal = tr.localize('destinations', slug, x.data).name;
  }
  const langName = new Intl.DisplayNames([tr.info.intl], { type: 'language' });
  const saved = await saveBooking(
    ctx,
    {
      kind,
      itemSlug: slug,
      itemTitle: titleIt,
      firstName: d.firstName,
      lastName: d.lastName,
      email: d.email,
      phone: d.phone,
      nationality: d.nationality,
      lang: g.lang,
      preferredDate: d.date,
      alternativeDate: d.altDate,
      participants: d.participants,
      guideLanguage: d.guideLanguage,
      transfer: d.transfer,
      transferDetails: d.transfer ? d.transferDetails : null,
      notes: d.notes,
    },
    [
      [kind === 'experience' ? tr.t('emails.fields.experience') : tr.t('emails.fields.destination'), titleLocal],
      [tr.t('emails.fields.date'), tr.fmt.date(d.date)],
      [tr.t('emails.fields.altDate'), d.altDate ? tr.fmt.date(d.altDate) : null],
      [tr.t('emails.fields.participants'), d.participants],
      [tr.t('emails.fields.language'), langName.of(d.guideLanguage === 'zh' ? 'zh-Hans' : d.guideLanguage) ?? d.guideLanguage],
      [tr.t('emails.fields.transfer'), d.transfer ? `${tr.t('common.yes')}${d.transferDetails ? ` — ${d.transferDetails}` : ''}` : tr.t('common.no')],
      [tr.t('emails.fields.notes'), d.notes],
    ],
  );
  return done(g, saved.reference, { message: tr.t(emailConfigured() ? 'booking.success' : 'booking.successNoEmail', { ref: saved.reference }) });
};
