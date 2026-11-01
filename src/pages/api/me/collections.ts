// Raccolte personali di marmi (sincronizzate con quelle del browser).
import type { APIRoute } from 'astro';
import { apiUser } from '~/lib/server/account';
import { withUser } from '~/lib/server/db';
import { fail, json } from '~/lib/server/http';

export const prerender = false;
const UUID = /^[0-9a-f-]{36}$/;

export const GET: APIRoute = async (ctx) => {
  const user = await apiUser(ctx);
  if (user instanceof Response) return user;
  const rows = await withUser(user.claims, (tx) => tx<{ id: string; name: string; items: string[]; updated_at: Date }[]>`select id, name, items, updated_at from public.collections order by created_at`);
  return json({ items: rows.map((r) => ({ id: r.id, name: r.name, items: r.items, updatedAt: r.updated_at })) });
};

export const PUT: APIRoute = async (ctx) => {
  const user = await apiUser(ctx);
  if (user instanceof Response) return user;
  const body = await ctx.request.json().catch(() => null);
  if (!Array.isArray(body) || body.length > 50) return fail('invalid');
  const list = body
    .filter((c) => c && typeof c.id === 'string' && UUID.test(c.id) && typeof c.name === 'string' && Array.isArray(c.items))
    .map((c) => ({ id: c.id as string, name: (c.name as string).trim().slice(0, 80) || '—', items: (c.items as unknown[]).filter((s): s is string => typeof s === 'string' && /^[a-z0-9-]{1,80}$/.test(s)).slice(0, 200) }));
  await withUser(user.claims, async (tx) => {
    const ids = list.map((c) => c.id);
    await tx`delete from public.collections where user_id = ${user.id} and not (id = any(${ids}::uuid[]))`;
    for (const c of list)
      await tx`insert into public.collections (id, user_id, name, items) values (${c.id}, ${user.id}, ${c.name}, ${c.items})
               on conflict (id) do update set name = excluded.name, items = excluded.items where public.collections.user_id = ${user.id}`;
  });
  return json({ ok: true });
};
