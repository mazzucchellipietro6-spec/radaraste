import type { APIRoute } from 'astro';
import { supabaseFor } from '~/lib/server/auth';
import { readBody } from '~/lib/server/http';
import { rateLimit } from '~/lib/server/rate-limit';
import { clientIp } from '~/lib/server/http';
import { maskEmail, securityEvent } from '~/lib/server/security';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const admin = ctx.locals.admin;
  if (!admin) return new Response(null, { status: 303, headers: { location: '/it/account/login/?next=/admin/' } });
  const b = await readBody(ctx.request);
  const code = String(b.code ?? '').replace(/\D/g, '');
  const factorId = String(b.factorId ?? '');
  if (!(await rateLimit(`mfa:${admin.user.id}`, 8, 900)) || code.length !== 6 || !factorId) return new Response(null, { status: 303, headers: { location: '/admin/mfa/?error=1' } });
  const { error } = await supabaseFor(ctx).auth.mfa.challengeAndVerify({ factorId, code });
  if (error)
    await securityEvent({ kind: 'mfa_failed', severity: 'medium', message: 'Codice di verifica in due passaggi errato', actor: maskEmail(admin.user.email),
      userId: admin.user.id, ip: clientIp(ctx.request, ctx.clientAddress), path: '/api/admin/mfa/verify' });
  return new Response(null, { status: 303, headers: { location: error ? '/admin/mfa/?error=1' : '/admin/' } });
};
