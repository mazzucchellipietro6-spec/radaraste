// Esportazione CSV (apribile con Excel) di qualsiasi sezione, con gli stessi filtri dell'elenco. Registrata nel log.
import type { APIRoute } from 'astro';
import { canAccess, resource } from '~/lib/server/admin/resources';
import { listRows, resolveOptions, toCsv } from '~/lib/server/admin/data';
import { asSystem } from '~/lib/server/db';

export const prerender = false;

export const GET: APIRoute = async (ctx) => {
  const admin = ctx.locals.admin!;
  const r = resource(ctx.params.resource ?? '');
  if (!r || !canAccess(r, admin.profile)) return new Response('Non autorizzato', { status: 403 });
  const sp = new URL(ctx.request.url).searchParams;
  const filters = Object.fromEntries((r.filters ?? []).map((f) => [f, sp.get(f) ?? '']));
  const { rows } = await listRows(admin.user, r, { q: sp.get('q') ?? '', filters, all: true });
  const csv = toCsv(r, rows, await resolveOptions(admin.user, r));
  await asSystem((tx) => tx`insert into public.audit_log (actor_id, actor, action, table_name, changes) values (${admin.user.id}, ${admin.user.email}, 'export', ${r.table}, ${tx.json({ rows: rows.length, filters, q: sp.get('q') ?? '' })})`);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="white-carrara-${r.key}-${date}.csv"`, 'cache-control': 'no-store' },
  });
};
