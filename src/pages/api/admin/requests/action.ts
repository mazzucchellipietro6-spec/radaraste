import type { APIRoute } from 'astro';
import { canAccess, resource } from '~/lib/server/admin/resources';
import { withUser } from '~/lib/server/db';
import { readBody } from '~/lib/server/http';
import { marbles } from '~/lib/site';

export const prerender = false;
type R = { id: string; reference: string; user_id: string | null; name: string | null; email: string | null; company: string | null; marbles: string[]; kind: string };

export const POST: APIRoute = async (ctx) => {
  const admin = ctx.locals.admin!;
  if (!canAccess(resource('requests')!, admin.profile)) return new Response('Non autorizzato', { status: 403 });
  const b = await readBody(ctx.request);
  const id = String(b.id ?? '');
  const go = (to: string) => new Response(null, { status: 303, headers: { location: to } });
  if (!/^[0-9a-f-]{36}$/.test(id)) return go('/admin/requests/');
  const req = await withUser(admin.user.claims, async (tx) => (await tx<R[]>`select id, reference, user_id, name, email, company, marbles, kind from public.requests where id = ${id}`)[0]);
  if (!req) return go('/admin/requests/');
  try {
    if (b.action === 'note') {
      const text = String(b.body ?? '').trim().slice(0, 4000);
      if (text) await withUser(admin.user.claims, (tx) => tx`insert into public.internal_notes (entity, entity_id, body, created_by) values ('request', ${id}, ${text}, ${admin.user.id})`);
      return go(`/admin/requests/${id}/?ok=1`);
    }
    if (b.action === 'quote_trading' || b.action === 'quote_brokerage') {
      const names = new Map((await marbles()).map((m) => [m.id, m.data.name]));
      const quoteId = await withUser(admin.user.claims, async (tx) => {
        const q = (await tx<{ id: string }[]>`insert into public.quotes (request_id, customer_id, customer_name, customer_email, customer_company, model, created_by)
          values (${id}, ${req.user_id}, ${req.name}, ${req.email}, ${req.company}, ${b.action === 'quote_brokerage' ? 'brokerage' : 'trading'}, ${admin.user.id}) returning id`)[0];
        let pos = 1;
        for (const slug of req.marbles) await tx`insert into public.quote_items (quote_id, position, marble_slug, description, quantity, unit_price) values (${q.id}, ${pos++}, ${slug}, ${names.get(slug) ?? slug}, 1, 0)`;
        await tx`update public.requests set status = 'in_progress' where id = ${id} and status = 'new'`;
        return q.id;
      });
      return go(`/admin/quotes/${quoteId}/?ok=1`);
    }
    if (b.action === 'deal') {
      const deal = await withUser(admin.user.claims, async (tx) => (await tx<{ id: string }[]>`insert into public.deals (model, title, request_id, customer_id, customer_name, stage, owner_id)
        values ('trading', ${`Richiesta ${req.reference}`}, ${id}, ${req.user_id}, ${req.name ?? req.company}, 'lead', ${admin.user.id}) returning id`)[0]);
      return go(`/admin/trading/${deal.id}/?ok=1`);
    }
  } catch (err) {
    return go(`/admin/requests/${id}/?error=${encodeURIComponent((err as Error).message.slice(0, 200))}`);
  }
  return go(`/admin/requests/${id}/`);
};
