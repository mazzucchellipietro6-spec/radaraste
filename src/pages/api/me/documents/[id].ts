// Scaricamento di un documento: la RLS decide se il cliente può vederlo; il file privato si apre con un link firmato di 60 secondi.
import type { APIRoute } from 'astro';
import { apiUser } from '~/lib/server/account';
import { supabaseAdmin } from '~/lib/server/auth';
import { withUser } from '~/lib/server/db';
import { fail } from '~/lib/server/http';

export const prerender = false;

export const GET: APIRoute = async (ctx) => {
  const user = await apiUser(ctx);
  if (user instanceof Response) return user;
  const id = ctx.params.id ?? '';
  if (!/^[0-9a-f-]{36}$/.test(id)) return fail('not_found');
  const rows = await withUser(user.claims, (tx) => tx<{ storage_path: string; title: string }[]>`select storage_path, title from public.documents where id = ${id}`);
  if (!rows[0]) return fail('not_found');
  const { data, error } = await supabaseAdmin().storage.from('documents').createSignedUrl(rows[0].storage_path, 60, { download: rows[0].title });
  if (error || !data) return fail('not_found');
  return new Response(null, { status: 302, headers: { location: data.signedUrl, 'cache-control': 'no-store' } });
};
