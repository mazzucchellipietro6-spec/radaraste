// Cancellazione dell'account (GDPR). Le richieste e i documenti con obblighi di conservazione restano, scollegati dall'account.
import type { APIRoute } from 'astro';
import { apiUser } from '~/lib/server/account';
import { setAuthHint, supabaseAdmin, supabaseFor } from '~/lib/server/auth';
import { asSystem } from '~/lib/server/db';
import { fail, readBody } from '~/lib/server/http';
import { LANGS } from '~/i18n';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const user = await apiUser(ctx);
  if (user instanceof Response) return user;
  const body = await readBody(ctx.request);
  const lang = typeof body.lang === 'string' && LANGS.includes(body.lang) ? body.lang : 'en';
  if (String(body.confirm ?? '').trim().toLowerCase() !== user.email.toLowerCase()) return new Response(null, { status: 303, headers: { location: `/${lang}/account/profile/?error=confirm` } });
  const role = await asSystem((tx) => tx<{ role: string }[]>`select role from public.profiles where id = ${user.id}`);
  if (role[0]?.role === 'admin' || role[0]?.role === 'staff') return fail('forbidden');
  await asSystem(async (tx) => {
    await tx`select set_config('app.actor', ${`gdpr-delete:${user.email}`}, true)`;
    await tx`update public.requests set user_id = null where user_id = ${user.id}`;
    await tx`update public.bookings set user_id = null where user_id = ${user.id}`;
  });
  const { error } = await supabaseAdmin().auth.admin.deleteUser(user.id);
  if (error) return fail('server_error');
  await supabaseFor(ctx).auth.signOut().catch(() => {});
  setAuthHint(ctx.cookies, false);
  return new Response(null, { status: 303, headers: { location: `/${lang}/?account=deleted` } });
};
