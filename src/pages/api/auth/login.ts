import type { APIRoute } from 'astro';
import { authConfigured, setAuthHint, supabaseFor } from '~/lib/server/auth';
import { promoteIfAdmin, safeNext } from '~/lib/server/auth-flow';
import { clientIp, fail, json, readBody } from '~/lib/server/http';
import { rateLimit } from '~/lib/server/rate-limit';
import { maskEmail, securityEvent } from '~/lib/server/security';
import { LANGS } from '~/i18n';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  if (!authConfigured()) return fail('not_configured');
  const body = await readBody(ctx.request);
  const lang = typeof body.lang === 'string' && LANGS.includes(body.lang) ? body.lang : 'en';
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const wantsJson = (ctx.request.headers.get('accept') ?? '').includes('application/json');
  const back = (code: string) =>
    wantsJson ? fail(code === 'rate_limited' ? 'rate_limited' : 'unauthorized', { reason: code }) : new Response(null, { status: 303, headers: { location: `/${lang}/account/login/?error=${code}` } });
  const ip = clientIp(ctx.request, ctx.clientAddress);
  if (!(await rateLimit(`login:${ip}`, 10, 900)) || !(await rateLimit(`login:${email}`, 8, 900))) {
    await securityEvent({ kind: 'rate_limited', severity: 'medium', message: 'Troppi tentativi di accesso', actor: maskEmail(email), ip, path: '/api/auth/login' });
    return back('rate_limited');
  }
  if (!email || !password) return back('invalid');
  const sb = supabaseFor(ctx);
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (!/confirm/i.test(error?.message ?? '')) await securityEvent({ kind: 'login_failed', severity: 'low', message: 'Accesso non riuscito', actor: maskEmail(email), ip, path: '/api/auth/login' });
    return back(/confirm/i.test(error?.message ?? '') ? 'unconfirmed' : 'invalid');
  }
  setAuthHint(ctx.cookies, true);
  await promoteIfAdmin(data.user.id, email);
  const to = safeNext(body.next, `/${lang}/account/`);
  return wantsJson ? json({ ok: true, redirect: to }) : new Response(null, { status: 303, headers: { location: to } });
};
