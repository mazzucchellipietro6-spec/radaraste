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
  const text = String(b.body ?? '').trim().slice(0, 8000);
  if (!/^[0-9a-f-]{36}$/.test(id) || !text) return new Response(null, { status: 303, headers: { location: `/admin/customers/${id}/` } });
  const p = await withUser(admin.user.claims, async (tx) => {
    await tx`insert into public.messages (customer_id, sender, sender_id, body) values (${id}, 'staff', ${admin.user.id}, ${text})`;
    return (await tx<{ email: string; full_name: string | null; lang: string }[]>`select email, full_name, lang from public.profiles where id = ${id}`)[0];
  });
  if (p) {
    const mail = await simpleEmail(p.lang, 'newMessage', { name: p.full_name, cta: true });
    await sendEmail({ to: p.email, ...mail, template: 'new-message', lang: p.lang, related: { type: 'profile', id } });
  }
  return new Response(null, { status: 303, headers: { location: `/admin/customers/${id}/?ok=Messaggio%20inviato` } });
};
