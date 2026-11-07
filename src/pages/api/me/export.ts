// Diritto di accesso e portabilità (GDPR): tutti i dati dell'account in un file JSON.
import type { APIRoute } from 'astro';
import { apiUser } from '~/lib/server/account';
import { withUser } from '~/lib/server/db';

export const prerender = false;

export const GET: APIRoute = async (ctx) => {
  const user = await apiUser(ctx);
  if (user instanceof Response) return user;
  const data = await withUser(user.claims, async (tx) => ({
    profile: (await tx`select * from public.profiles where id = ${user.id}`)[0],
    favorites: await tx`select marble_slug, created_at from public.favorites`,
    collections: await tx`select name, items, created_at from public.collections`,
    projects: await tx`select name, type, location, description, status, marbles, created_at from public.projects`,
    requests: await tx`select reference, kind, status, message, marbles, details, created_at from public.requests`,
    quotes: await tx`select number, status, total, currency, valid_until, created_at from public.quotes`,
    bookings: await tx`select reference, kind, item_title, preferred_date, participants, status, created_at from public.bookings`,
    messages: await tx`select sender, body, created_at from public.messages order by created_at`,
  }));
  return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="white-carrara-dati.json"', 'cache-control': 'no-store' },
  });
};
