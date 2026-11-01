// Apertura dei link ricevuti via email (conferma registrazione, accesso, nuova password).
import type { APIRoute } from 'astro';
import { authConfigured, setAuthHint, supabaseFor } from '~/lib/server/auth';
import { promoteIfAdmin, safeNext } from '~/lib/server/auth-flow';

export const prerender = false;
const TYPES = ['signup', 'magiclink', 'recovery', 'invite', 'email_change', 'email'] as const;

export const GET: APIRoute = async (ctx) => {
  const url = new URL(ctx.request.url);
  const tokenHash = url.searchParams.get('token_hash') ?? '';
  const type = url.searchParams.get('type') as (typeof TYPES)[number];
  const next = safeNext(url.searchParams.get('next'), '/en/account/');
  const lang = next.split('/')[1] || 'en';
  if (!authConfigured() || !tokenHash || !TYPES.includes(type)) return ctx.redirect(`/${lang}/account/login/?error=expired`, 303);
  const sb = supabaseFor(ctx);
  const { data, error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: type === 'magiclink' ? 'magiclink' : type });
  if (error || !data.user) return ctx.redirect(`/${lang}/account/login/?error=expired`, 303);
  setAuthHint(ctx.cookies, true);
  await promoteIfAdmin(data.user.id, data.user.email ?? '');
  return ctx.redirect(next, 303);
};
