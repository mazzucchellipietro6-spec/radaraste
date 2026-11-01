// Righe del preventivo e loro costi interni (fornitore, costo, provvigione: solo staff "trade").
import type { APIRoute } from 'astro';
import { canAccess, resource } from '~/lib/server/admin/resources';
import { withUser } from '~/lib/server/db';
import { readBody } from '~/lib/server/http';

export const prerender = false;
const num = (v: unknown) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return String(v ?? '').trim() !== '' && Number.isFinite(n) ? n : null;
};
const uuid = (v: unknown) => (/^[0-9a-f-]{36}$/.test(String(v ?? '')) ? String(v) : null);
const txt = (v: unknown, n = 500) => String(v ?? '').trim().slice(0, n) || null;

export const POST: APIRoute = async (ctx) => {
  const admin = ctx.locals.admin!;
  if (!canAccess(resource('quotes')!, admin.profile)) return new Response('Non autorizzato', { status: 403 });
  const trade = admin.profile.role === 'admin' || admin.profile.permissions.includes('trade');
  const b = await readBody(ctx.request);
  const quoteId = uuid(b.quote_id);
  if (!quoteId) return new Response(null, { status: 303, headers: { location: '/admin/quotes/' } });
  const go = (q = 'ok=1') => new Response(null, { status: 303, headers: { location: `/admin/quotes/${quoteId}/?${q}` } });
  try {
    await withUser(admin.user.claims, async (tx) => {
      const itemId = uuid(b.item_id);
      if (b.action === 'delete' && itemId) {
        await tx`delete from public.quote_items where id = ${itemId} and quote_id = ${quoteId}`;
        return;
      }
      const data = {
        marble_slug: txt(b.marble_slug, 80),
        description: txt(b.description, 1000) ?? '—',
        finish: txt(b.finish, 80),
        thickness: txt(b.thickness, 40),
        quantity: num(b.quantity) ?? 1,
        unit: txt(b.unit, 20) ?? 'm2',
        unit_price: num(b.unit_price) ?? 0,
      };
      let id = itemId;
      if (b.action === 'create') {
        const pos = (await tx<{ n: number }[]>`select coalesce(max(position), 0)::int + 1 as n from public.quote_items where quote_id = ${quoteId}`)[0].n;
        id = (await tx<{ id: string }[]>`insert into public.quote_items ${tx({ ...data, quote_id: quoteId, position: pos })} returning id`)[0].id;
      } else if (id) {
        const { marble_slug, ...rest } = data;
        void marble_slug;
        await tx`update public.quote_items set ${tx(rest)} where id = ${id} and quote_id = ${quoteId}`;
      }
      if (trade && id) {
        await tx`insert into public.quote_item_costs (quote_item_id, supplier_id, material_id, unit_cost, commission_percent)
          values (${id}, ${uuid(b.supplier_id)}, ${uuid(b.material_id)}, ${num(b.unit_cost)}, ${num(b.commission_percent)})
          on conflict (quote_item_id) do update set supplier_id = excluded.supplier_id, material_id = coalesce(excluded.material_id, public.quote_item_costs.material_id),
            unit_cost = excluded.unit_cost, commission_percent = excluded.commission_percent`;
      }
    });
  } catch (err) {
    return go(`error=${encodeURIComponent((err as Error).message.slice(0, 200))}`);
  }
  return go();
};
