// Scheda di un agente (memoria, storico, note ricevute, consumi) e impostazioni modificabili
// dall'amministratore: attivo, modello, livello di ragionamento, budget mensile, limite giornaliero.
import type { APIRoute } from 'astro';
import { agentDetail, canSeeAi, updateAgent } from '~/lib/server/company';
import { fail, json, readBody } from '~/lib/server/http';

export const prerender = false;

export const GET: APIRoute = async (ctx) => {
  const admin = ctx.locals.admin;
  if (!admin) return fail('unauthorized');
  if (!canSeeAi(admin.profile)) return fail('forbidden');
  const d = await agentDetail(admin.user, String(ctx.params.id));
  return d ? json(d) : fail('not_found');
};

export const POST: APIRoute = async (ctx) => {
  const admin = ctx.locals.admin;
  if (!admin) return fail('unauthorized');
  if (admin.profile.role !== 'admin') return fail('forbidden');
  const b = await readBody(ctx.request);
  const num = (x: unknown) => (x === undefined || x === null || x === '' ? undefined : Number(x));
  const done = await updateAgent(admin.user, String(ctx.params.id), {
    enabled: b.enabled === undefined ? undefined : b.enabled === true || b.enabled === 'true',
    model: b.model ? String(b.model) : undefined,
    effort: b.effort ? String(b.effort) : undefined,
    monthly_budget_usd: num(b.monthly_budget_usd),
    daily_task_limit: num(b.daily_task_limit),
  });
  return done ? json({ ok: true }) : fail('not_found');
};
