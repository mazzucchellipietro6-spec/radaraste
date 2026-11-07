import type { APIRoute } from 'astro';
import { z } from 'zod';
import { apiUser, back } from '~/lib/server/account';
import { withUser } from '~/lib/server/db';
import { fail, readBody } from '~/lib/server/http';
import { LANGS } from '~/i18n';

export const prerender = false;
const opt = (n: number) => z.string().trim().max(n).optional().transform((v) => (v ? v : null));
const Schema = z.object({
  full_name: opt(120),
  phone: opt(40),
  company: opt(160),
  vat_number: opt(40),
  country: opt(80),
  city: opt(80),
  nationality: opt(80),
  lang: z.string().refine((l) => LANGS.includes(l)),
  marketing_opt_in: z.any().optional().transform((v) => v === 'on' || v === 'yes' || v === true),
});

export const POST: APIRoute = async (ctx) => {
  const user = await apiUser(ctx);
  if (user instanceof Response) return user;
  const parsed = Schema.safeParse(await readBody(ctx.request));
  if (!parsed.success) return fail('invalid');
  const d = parsed.data;
  await withUser(user.claims, (tx) => tx`update public.profiles set full_name = ${d.full_name}, phone = ${d.phone}, company = ${d.company}, vat_number = ${d.vat_number},
    country = ${d.country}, city = ${d.city}, nationality = ${d.nationality}, lang = ${d.lang}, marketing_opt_in = ${d.marketing_opt_in} where id = ${user.id}`);
  return back(ctx.request, `/${d.lang}/account/profile/`, 'ok=saved');
};
