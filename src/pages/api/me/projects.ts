import type { APIRoute } from 'astro';
import { z } from 'zod';
import { apiUser, back } from '~/lib/server/account';
import { withUser } from '~/lib/server/db';
import { fail, readBody } from '~/lib/server/http';

export const prerender = false;
const Schema = z.object({
  action: z.enum(['create', 'update', 'delete']),
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(160).optional(),
  type: z.string().trim().max(40).optional(),
  location: z.string().trim().max(160).optional(),
  description: z.string().trim().max(5000).optional(),
  status: z.enum(['open', 'in_progress', 'on_hold', 'completed', 'archived']).optional(),
  marbles: z.string().max(1000).optional(),
});

export const POST: APIRoute = async (ctx) => {
  const user = await apiUser(ctx);
  if (user instanceof Response) return user;
  const parsed = Schema.safeParse(await readBody(ctx.request));
  if (!parsed.success) return fail('invalid');
  const d = parsed.data;
  const marbles = (d.marbles ?? '').split(',').map((s) => s.trim().toLowerCase()).filter((s) => /^[a-z0-9-]{1,80}$/.test(s)).slice(0, 50);
  await withUser(user.claims, async (tx) => {
    if (d.action === 'create' && d.name)
      await tx`insert into public.projects (user_id, name, type, location, description, status, marbles) values (${user.id}, ${d.name}, ${d.type ?? null}, ${d.location ?? null}, ${d.description ?? null}, ${d.status ?? 'open'}, ${marbles})`;
    else if (d.action === 'update' && d.id && d.name)
      await tx`update public.projects set name = ${d.name}, type = ${d.type ?? null}, location = ${d.location ?? null}, description = ${d.description ?? null}, status = ${d.status ?? 'open'}, marbles = ${marbles} where id = ${d.id}`;
    else if (d.action === 'delete' && d.id) await tx`delete from public.projects where id = ${d.id}`;
  });
  return back(ctx.request, '/en/account/projects/', 'ok=saved');
};
