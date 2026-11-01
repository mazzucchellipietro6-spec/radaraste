import type { APIRoute } from 'astro';
import { withUser } from '~/lib/server/db';
import { readBody } from '~/lib/server/http';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const admin = ctx.locals.admin!;
  const b = await readBody(ctx.request);
  const dealId = String(b.deal_id ?? '');
  const kind = ['note', 'call', 'email', 'offer', 'counter_offer', 'meeting'].includes(String(b.kind)) ? String(b.kind) : 'note';
  const text = String(b.body ?? '').trim().slice(0, 4000);
  const amount = b.amount ? Number(String(b.amount).replace(',', '.')) : null;
  if (!/^[0-9a-f-]{36}$/.test(dealId) || !text) return new Response(null, { status: 303, headers: { location: '/admin/' } });
  const model = await withUser(admin.user.claims, async (tx) => {
    await tx`insert into public.deal_events (deal_id, kind, body, amount, created_by) values (${dealId}, ${kind}, ${text}, ${Number.isFinite(amount) ? amount : null}, ${admin.user.id})`;
    return (await tx<{ model: string }[]>`select model from public.deals where id = ${dealId}`)[0]?.model ?? 'trading';
  });
  return new Response(null, { status: 303, headers: { location: `/admin/${model}/${dealId}/?ok=1` } });
};
