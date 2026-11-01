// Prezzi riservati di un marmo: solo per professionisti approvati (controllo RLS nel database).
import type { APIRoute } from 'astro';
import { authConfigured, currentUser } from '~/lib/server/auth';
import { dbConfigured, withUser } from '~/lib/server/db';
import { json } from '~/lib/server/http';

export const prerender = false;

export const GET: APIRoute = async (ctx) => {
  const marble = new URL(ctx.request.url).searchParams.get('marble') ?? '';
  if (!authConfigured() || !dbConfigured() || !/^[a-z0-9-]{1,80}$/.test(marble)) return json({ approved: false, prices: [] });
  const user = await currentUser(ctx);
  if (!user) return json({ approved: false, prices: [] });
  const out = await withUser(user.claims, async (tx) => {
    const ok = (await tx<{ ok: boolean }[]>`select public.is_b2b() as ok`)[0]?.ok;
    if (!ok) return { approved: false, prices: [] };
    const prices = await tx<{ finish: string | null; thickness: string | null; price: string; unit: string; currency: string; valid_until: Date | null; note: string | null }[]>`
      select finish, thickness, price, unit, currency, valid_until, note from public.b2b_prices where marble_slug = ${marble} and active
      and (valid_until is null or valid_until >= current_date) order by finish nulls first, thickness`;
    return {
      approved: true,
      prices: prices.map((p) => ({ finish: p.finish, thickness: p.thickness, price: Number(p.price), unit: p.unit, currency: p.currency, validUntil: p.valid_until, note: p.note })),
    };
  });
  return json(out);
};
