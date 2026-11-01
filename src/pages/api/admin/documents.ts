// Caricamento ed eliminazione dei documenti privati (Supabase Storage, bucket "documents").
import type { APIRoute } from 'astro';
import { supabaseAdmin } from '~/lib/server/auth';
import { withUser } from '~/lib/server/db';

export const prerender = false;
const TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const MAX = 20 * 1024 * 1024;

export const POST: APIRoute = async (ctx) => {
  const admin = ctx.locals.admin!;
  const p = admin.profile;
  const go = (q: string) => new Response(null, { status: 303, headers: { location: `/admin/documents/?${q}` } });
  if (!(p.role === 'admin' || p.permissions.includes('customers') || p.permissions.includes('trade'))) return go('error=Permesso%20mancante');
  const fd = await ctx.request.formData();
  const del = String(fd.get('delete') ?? '');
  try {
    if (/^[0-9a-f-]{36}$/.test(del)) {
      const path = await withUser(admin.user.claims, async (tx) => (await tx<{ storage_path: string }[]>`delete from public.documents where id = ${del} returning storage_path`)[0]?.storage_path);
      if (path) await supabaseAdmin().storage.from('documents').remove([path]);
      return go('ok=1');
    }
    const file = fd.get('file');
    const title = String(fd.get('title') ?? '').trim().slice(0, 200);
    const scope = ['customer', 'b2b', 'internal'].includes(String(fd.get('scope'))) ? String(fd.get('scope')) : 'internal';
    const owner = /^[0-9a-f-]{36}$/.test(String(fd.get('owner_id') ?? '')) ? String(fd.get('owner_id')) : null;
    if (!(file instanceof File) || !title) return go('error=Titolo%20e%20file%20obbligatori');
    if (!TYPES.has(file.type) || file.size > MAX) return go('error=Formato%20o%20dimensione%20non%20ammessi');
    if (scope === 'customer' && !owner) return go('error=Scegli%20il%20cliente');
    const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-80);
    const path = `${scope}/${crypto.randomUUID()}-${safe}`;
    const { error } = await supabaseAdmin().storage.from('documents').upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
    if (error) return go(`error=${encodeURIComponent(error.message)}`);
    await withUser(admin.user.claims, (tx) => tx`insert into public.documents (scope, owner_id, title, description, storage_path, mime, size_bytes, marble_slug, created_by)
      values (${scope}, ${owner}, ${title}, ${String(fd.get('description') ?? '').slice(0, 500) || null}, ${path}, ${file.type}, ${file.size}, ${String(fd.get('marble_slug') ?? '') || null}, ${admin.user.id})`);
    return go('ok=1');
  } catch (err) {
    return go(`error=${encodeURIComponent((err as Error).message.slice(0, 200))}`);
  }
};
