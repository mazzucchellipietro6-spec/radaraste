// Nuovo incarico assegnato dal pannello a un agente (con l'identità dell'utente: regole RLS).
import type { APIRoute } from 'astro';
import { canSeeAi, createTask } from '~/lib/server/company';
import { fail, json, readBody } from '~/lib/server/http';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const admin = ctx.locals.admin;
  if (!admin) return fail('unauthorized');
  if (!canSeeAi(admin.profile)) return fail('forbidden');
  const b = await readBody(ctx.request);
  const agent_id = String(b.agent_id ?? '').trim();
  const title = String(b.title ?? '').trim().slice(0, 300);
  const instructions = String(b.instructions ?? '').trim().slice(0, 20000);
  if (!/^\d{2}-[a-z0-9-]+$/.test(agent_id) || title.length < 3 || instructions.length < 3) return fail('invalid', { message: 'Indica agente, titolo e istruzioni' });
  try {
    const docText = String(b.document ?? '').trim().slice(0, 60000);
    const docTitle = String(b.document_title ?? '').trim().slice(0, 200);
    const context = docText ? { documents: [{ title: docTitle || 'Documento', text: docText }] } : {};
    const id = await createTask(admin.user, { agent_id, title, instructions, priority: Number(b.priority ?? 5), context });
    return json({ ok: true, id }, 201);
  } catch (e) {
    return fail('invalid', { message: (e as Error).message });
  }
};
