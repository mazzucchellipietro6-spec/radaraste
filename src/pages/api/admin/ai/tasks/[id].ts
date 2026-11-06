// Dettaglio di un incarico (eventi, figli, approvazioni) e azioni consentite dal pannello:
// annullare, rimettere in coda un incarico fallito o bloccato, cambiare la priorità.
import type { APIRoute } from 'astro';
import { canSeeAi, taskAction, taskDetail } from '~/lib/server/company';
import { fail, json, readBody } from '~/lib/server/http';

export const prerender = false;

export const GET: APIRoute = async (ctx) => {
  const admin = ctx.locals.admin;
  if (!admin) return fail('unauthorized');
  if (!canSeeAi(admin.profile)) return fail('forbidden');
  const d = await taskDetail(admin.user, String(ctx.params.id));
  return d ? json(d) : fail('not_found');
};

export const POST: APIRoute = async (ctx) => {
  const admin = ctx.locals.admin;
  if (!admin) return fail('unauthorized');
  if (!canSeeAi(admin.profile)) return fail('forbidden');
  const id = String(ctx.params.id);
  if (!/^[0-9a-f-]{36}$/.test(id)) return fail('not_found');
  const b = await readBody(ctx.request);
  const action = String(b.action);
  if (!['cancel', 'retry', 'priority'].includes(action)) return fail('invalid');
  try {
    const done = await taskAction(admin.user, id, action as 'cancel' | 'retry' | 'priority', Number(b.priority));
    return done ? json({ ok: true }) : fail('invalid', { message: 'Azione non consentita per lo stato attuale' });
  } catch (e) {
    return fail('invalid', { message: (e as Error).message });
  }
};
