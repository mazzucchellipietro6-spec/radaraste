// Token di breve durata per collegare il browser al flusso di eventi del servizio agenti (WebSocket).
import type { APIRoute } from 'astro';
import { canSeeAi, wsBase, wsToken } from '~/lib/server/company';
import { fail, json } from '~/lib/server/http';

export const prerender = false;

export const GET: APIRoute = async (ctx) => {
  const admin = ctx.locals.admin;
  if (!admin) return fail('unauthorized');
  if (!canSeeAi(admin.profile)) return fail('forbidden');
  const url = wsBase();
  const token = wsToken();
  if (!url || !token) return fail('not_configured');
  return json({ url: `${url}?token=${token}` });
};
