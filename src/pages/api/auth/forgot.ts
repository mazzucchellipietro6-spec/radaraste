import type { APIRoute } from 'astro';
import { authConfigured } from '~/lib/server/auth';
import { profileExists, sendAuthLink } from '~/lib/server/auth-flow';
import { clientIp, fail, readBody } from '~/lib/server/http';
import { rateLimit } from '~/lib/server/rate-limit';
import { LANGS } from '~/i18n';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  if (!authConfigured()) return fail('not_configured');
  const body = await readBody(ctx.request);
  const lang = typeof body.lang === 'string' && LANGS.includes(body.lang) ? body.lang : 'en';
  const email = String(body.email ?? '').trim().toLowerCase();
  const ip = clientIp(ctx.request, ctx.clientAddress);
  const done = new Response(null, { status: 303, headers: { location: `/${lang}/account/forgot/?sent=1` } });
  if (!(await rateLimit(`forgot:${ip}`, 5, 900)) || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return done;
  if (await profileExists(email)) {
    await sendAuthLink({ type: 'recovery', email, lang, next: `/${lang}/account/reset/` }).catch((e) => console.error('[auth/forgot]', e));
  }
  return done;
};
