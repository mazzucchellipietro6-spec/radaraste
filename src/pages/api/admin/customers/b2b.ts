import type { APIRoute } from 'astro';
import { canAccess, resource } from '~/lib/server/admin/resources';
import { withUser } from '~/lib/server/db';
import { readBody } from '~/lib/server/http';
import { sendEmail } from '~/lib/server/email';
import { simpleEmail } from '~/lib/server/emails';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const admin = ctx.locals.admin!;
  if (!canAccess(resource('customers')!, admin.profile)) return new Response('Non autorizzato', { status: 403 });
  const b = await readBody(ctx.request);
  const id = String(b.id ?? '');
  const decision = b.decision === 'approved' ? 'approved' : 'rejected';
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response(null, { status: 303, headers: { location: '/admin/customers/' } });
  const p = await withUser(admin.user.claims, async (tx) => (await tx<{ email: string; full_name: string | null; lang: string; role: string }[]>`
    update public.profiles set b2b_status = ${decision}, b2b_reviewed_at = now(), b2b_reviewed_by = ${admin.user.id} where id = ${id} returning email, full_name, lang, role`)[0]);
  if (p) {
    if (decision === 'approved' && p.role === 'customer' && admin.profile.role === 'admin')
      await withUser(admin.user.claims, (tx) => tx`update public.profiles set role = 'professional' where id = ${id}`);
    const mail = await simpleEmail(p.lang, decision === 'approved' ? 'b2bApproved' : 'b2bRejected', { name: p.full_name, cta: decision === 'approved' });
    await sendEmail({ to: p.email, ...mail, template: `b2b-${decision}`, lang: p.lang, related: { type: 'profile', id } });
  }
  return new Response(null, { status: 303, headers: { location: `/admin/customers/${id}/?ok=${decision === 'approved' ? 'Account%20B2B%20approvato' : 'Richiesta%20rifiutata'}` } });
};
