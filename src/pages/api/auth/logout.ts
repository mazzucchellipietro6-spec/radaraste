import type { APIRoute } from 'astro';
import { authConfigured, setAuthHint, supabaseFor } from '~/lib/server/auth';
import { readBody } from '~/lib/server/http';
import { LANGS } from '~/i18n';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const body = await readBody(ctx.request);
  const lang = typeof body.lang === 'string' && LANGS.includes(body.lang) ? body.lang : 'en';
  if (authConfigured()) await supabaseFor(ctx).auth.signOut().catch(() => {});
  setAuthHint(ctx.cookies, false);
  return new Response(null, { status: 303, headers: { location: `/${lang}/` } });
};
