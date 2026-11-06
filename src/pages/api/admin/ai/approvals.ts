// Decisione del fondatore su una richiesta degli agenti. Solo amministratori con verifica in due
// passaggi (controllato anche dalle regole RLS); la decisione finisce nel registro delle modifiche.
import type { APIRoute } from 'astro';
import { decideApproval } from '~/lib/server/company';
import { fail, readBody } from '~/lib/server/http';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const admin = ctx.locals.admin;
  if (!admin) return fail('unauthorized');
  if (admin.profile.role !== 'admin') return fail('forbidden');
  const b = await readBody(ctx.request);
  const id = String(b.id ?? '');
  const decision = String(b.decision);
  const back = (q: string) => new Response(null, { status: 303, headers: { location: `/admin/approvals/?${q}` } });
  if (!/^[0-9a-f-]{36}$/.test(id) || !['approved', 'rejected'].includes(decision)) return back('error=invalid');
  const note = String(b.note ?? '').trim().slice(0, 2000);
  if (decision === 'rejected' && !note) return back('error=note');
  const done = await decideApproval(admin.user, id, decision as 'approved' | 'rejected', note);
  return back(done ? `ok=${decision}` : 'error=state');
};
