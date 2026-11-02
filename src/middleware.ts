// Controlli eseguiti a ogni richiesta dinamica: intestazioni di sicurezza e protezione del pannello /admin.
// (Le pagine statiche ricevono le stesse intestazioni dalla configurazione di Vercel/Netlify.)
import { defineMiddleware } from 'astro:middleware';
import { authConfigured, currentUser, loadProfile } from '~/lib/server/auth';
import { dbConfigured } from '~/lib/server/db';

import { SECURITY_HEADERS } from '~/lib/security-headers.mjs';

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
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
      if (k === 'strict-transport-security' && !import.meta.env.PROD) continue;
      // in sviluppo Vite usa script e connessioni che la CSP bloccherebbe
      if (k === 'content-security-policy' && !import.meta.env.PROD) continue;
      if (!res.headers.has(k)) res.headers.set(k, v);
    }
    if (isAdmin || isAdminApi || path.includes('/account/')) {
      res.headers.set('cache-control', 'private, no-store');
      res.headers.set('x-robots-tag', 'noindex, nofollow');
    }
  }
  return res;
});
