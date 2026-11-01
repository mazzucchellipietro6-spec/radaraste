// Salvataggio, disattivazione ed eliminazione per tutte le sezioni del pannello.
import type { APIRoute } from 'astro';
import { canAccess, resource } from '~/lib/server/admin/resources';
import { removeRow, saveRow } from '~/lib/server/admin/data';
import { readBody } from '~/lib/server/http';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const admin = ctx.locals.admin!;
  const body = await readBody(ctx.request);
  const r = resource(String(body._resource ?? ''));
  const back = String(body._back ?? '/admin/');
  const safeBack = back.startsWith('/admin/') ? back : '/admin/';
  const go = (to: string) => new Response(null, { status: 303, headers: { location: to } });
  if (!r || !canAccess(r, admin.profile)) return go('/admin/');
  const id = String(body._id ?? '') || null;
  try {
    if (body._action === 'remove' && id) {
      await removeRow(admin.user, r, id);
      return go(`/admin/${r.key}/?ok=1`);
    }
    const saved = await saveRow(admin.user, admin.profile, r, id, body);
    return go(`/admin/${r.key}/${saved}/?ok=1`);
  } catch (err) {
    const msg = (err as Error).message.slice(0, 200);
    console.warn('[admin/save]', r.key, msg);
    return go(`${id ? safeBack : `/admin/${r.key}/new/`}?error=${encodeURIComponent(msg)}`);
  }
};
