// Controlli eseguiti a ogni richiesta dinamica: intestazioni di sicurezza e protezione del pannello /admin.
// (Le pagine statiche ricevono le stesse intestazioni dalla configurazione di Vercel/Netlify.)
import { defineMiddleware } from 'astro:middleware';
import { authConfigured, currentUser, loadProfile } from '~/lib/server/auth';
import { dbConfigured } from '~/lib/server/db';

const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(self), microphone=(), geolocation=(), payment=(self "https://checkout.stripe.com"), interest-cohort=()',
  'cross-origin-opener-policy': 'same-origin',
};

export const onRequest = defineMiddleware(async (ctx, next) => {
  const path = ctx.url.pathname;
  const isAdmin = path === '/admin' || path.startsWith('/admin/');
  const isAdminApi = path.startsWith('/api/admin/');

  if ((isAdmin || isAdminApi) && !ctx.isPrerendered) {
    const deny = (status: number, to: string) =>
      isAdminApi ? new Response(JSON.stringify({ ok: false, code: status === 401 ? 'unauthorized' : 'forbidden' }), { status, headers: { 'content-type': 'application/json' } }) : ctx.redirect(to, 303);
    if (!authConfigured() || !dbConfigured()) {
      if (isAdminApi) return deny(503, '/');
    } else {
      const user = await currentUser(ctx);
      if (!user) return deny(401, `/it/account/login/?next=${encodeURIComponent(path)}`);
      const profile = await loadProfile(user);
      if (!profile || (profile.role !== 'admin' && profile.role !== 'staff')) return deny(403, '/it/account/');
      const onMfaPage = path.startsWith('/admin/mfa') || path.startsWith('/api/admin/mfa');
      if (user.aal !== 'aal2' && !onMfaPage) return deny(403, '/admin/mfa/');
      ctx.locals.admin = { user, profile };
    }
  }

  const res = await next();
  if (!ctx.isPrerendered) {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!res.headers.has(k)) res.headers.set(k, v);
    if (import.meta.env.PROD) res.headers.set('strict-transport-security', 'max-age=63072000; includeSubDomains; preload');
    if (isAdmin || isAdminApi || path.includes('/account/')) {
      res.headers.set('cache-control', 'private, no-store');
      res.headers.set('x-robots-tag', 'noindex, nofollow');
    }
  }
  return res;
});
