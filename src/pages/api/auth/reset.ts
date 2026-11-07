import type { APIRoute } from 'astro';
import { authConfigured, currentUser, supabaseFor } from '~/lib/server/auth';
import { fail, readBody } from '~/lib/server/http';
import { LANGS } from '~/i18n';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  if (!authConfigured()) return fail('not_configured');
  const body = await readBody(ctx.request);
  const lang = typeof body.lang === 'string' && LANGS.includes(body.lang) ? body.lang : 'en';
  const password = String(body.password ?? '');
  if (!(await currentUser(ctx))) return new Response(null, { status: 303, headers: { location: `/${lang}/account/reset/?error=expired` } });
  if (password.length < 10 || password.length > 200) return new Response(null, { status: 303, headers: { location: `/${lang}/account/reset/?error=weak` } });
  const { error } = await supabaseFor(ctx).auth.updateUser({ password });
  if (error) return new Response(null, { status: 303, headers: { location: `/${lang}/account/reset/?error=expired` } });
  return new Response(null, { status: 303, headers: { location: `/${lang}/account/?ok=password` } });
};
