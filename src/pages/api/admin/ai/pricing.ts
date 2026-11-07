// Salva una simulazione di prezzo fatta nel pannello (stesso motore del servizio agenti).
import type { APIRoute } from 'astro';
import { withUser } from '~/lib/server/db';
import { fail, json, readBody } from '~/lib/server/http';
import { PricingError, simulate, type Inputs } from '~/lib/pricing';

import { rateLimit } from '~/lib/server/rate-limit';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const admin = ctx.locals.admin;
  if (!admin) return fail('unauthorized');
  const p = admin.profile;
  if (p.role !== 'admin' && !p.permissions.includes('trade')) return fail('forbidden');
  if (!(await rateLimit(`ai-pricing:${admin.user.id}`, 120, 3600))) return fail('rate_limited');
  const b = await readBody(ctx.request);
  const model = String(b.model);
  const inputs = (b.inputs && typeof b.inputs === 'object' ? b.inputs : {}) as Inputs;
  let outputs;
  try {
    outputs = simulate(model, inputs); // ricalcolato sul server: non si salvano risultati inviati dal browser
  } catch (e) {
    return fail('invalid', { message: e instanceof PricingError ? e.message : 'Dati non validi' });
  }
  const title = String(b.title ?? '').trim().slice(0, 200) || `Simulazione ${model} del ${new Date().toLocaleDateString('it-IT')}`;
  const id = await withUser(admin.user.claims, async (tx) => {
    const r = await tx<{ id: string }[]>`insert into public.pricing_simulations (title, model, currency, inputs, outputs, created_by)
      values (${title}, ${model}, ${String(inputs.currency ?? 'EUR')}, ${tx.json(inputs as never)}, ${tx.json(outputs as never)}, ${admin.user.id}) returning id`;
    return r[0].id;
  });
  return json({ ok: true, id, outputs });
};
