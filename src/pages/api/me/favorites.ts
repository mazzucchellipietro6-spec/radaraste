// Marmi preferiti dell'utente collegato (sincronizzati con "La mia selezione" del browser).
import type { APIRoute } from 'astro';
import { apiUser } from '~/lib/server/account';
import { withUser } from '~/lib/server/db';
import { fail, json } from '~/lib/server/http';

export const prerender = false;

export const GET: APIRoute = async (ctx) => {
  const user = await apiUser(ctx);
  if (user instanceof Response) return user;
  const rows = await withUser(user.claims, (tx) => tx<{ marble_slug: string }[]>`select marble_slug from public.favorites order by created_at`);
  return json({ items: rows.map((r) => r.marble_slug) });
};

export const PUT: APIRoute = async (ctx) => {
  const user = await apiUser(ctx);
  if (user instanceof Response) return user;
  const body = await ctx.request.json().catch(() => null);
  if (!Array.isArray(body) || body.length > 200) return fail('invalid');
  const slugs = Array.from(new Set(body.filter((s): s is string => typeof s === 'string' && /^[a-z0-9-]{1,80}$/.test(s))));
  await withUser(user.claims, async (tx) => {
    await tx`delete from public.favorites where user_id = ${user.id} and not (marble_slug = any(${slugs}))`;
    for (const s of slugs) await tx`insert into public.favorites (user_id, marble_slug) values (${user.id}, ${s}) on conflict do nothing`;
  });
  return json({ ok: true });
};
