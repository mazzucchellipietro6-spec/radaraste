// Richiesta di accesso B2B da parte di un cliente già registrato.
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { apiUser, back } from '~/lib/server/account';
import { asSystem } from '~/lib/server/db';
import { saveRequest } from '~/lib/server/forms';
import { fail, readBody } from '~/lib/server/http';
import { sendEmail } from '~/lib/server/email';
import { simpleEmail } from '~/lib/server/emails';
import { LANGS } from '~/i18n';

export const prerender = false;
const s = (n: number) => z.string().trim().min(1).max(n);
const Schema = z.object({
  company: s(160),
  b2bType: s(40),
  country: s(80),
  vat: z.string().trim().max(40).optional(),
  companySite: z.string().trim().max(200).optional(),
  b2bNotes: z.string().trim().max(2000).optional(),
  lang: z.string().refine((l) => LANGS.includes(l)),
});

export const POST: APIRoute = async (ctx) => {
  const user = await apiUser(ctx);
  if (user instanceof Response) return user;
  const parsed = Schema.safeParse(await readBody(ctx.request));
  if (!parsed.success) return fail('invalid');
  const d = parsed.data;
  const prof = await asSystem((tx) => tx<{ b2b_status: string; full_name: string | null }[]>`select b2b_status, full_name from public.profiles where id = ${user.id}`);
  if (prof[0]?.b2b_status === 'approved' || prof[0]?.b2b_status === 'pending') return back(ctx.request, `/${d.lang}/account/b2b/`, 'ok=applied');
  await asSystem((tx) => tx`update public.profiles set company = ${d.company}, b2b_type = ${d.b2bType}, country = ${d.country}, vat_number = ${d.vat ?? null},
    b2b_website = ${d.companySite ?? null}, b2b_notes = ${d.b2bNotes ?? null}, b2b_status = 'pending' where id = ${user.id}`);
  await saveRequest(ctx, { kind: 'b2b', name: prof[0]?.full_name ?? null, email: user.email, company: d.company, country: d.country, lang: d.lang, message: d.b2bNotes ?? null, details: { type: d.b2bType, vat: d.vat, website: d.companySite, userId: user.id }, source: 'account' });
  const mail = await simpleEmail(d.lang, 'b2bReceived', { name: prof[0]?.full_name });
  await sendEmail({ to: user.email, ...mail, template: 'b2b-received', lang: d.lang });
  return back(ctx.request, `/${d.lang}/account/b2b/`, 'ok=applied');
};
