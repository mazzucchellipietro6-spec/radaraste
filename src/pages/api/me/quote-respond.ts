import type { APIRoute } from 'astro';
import { apiUser, back } from '~/lib/server/account';
import { withUser } from '~/lib/server/db';
import { fail, readBody } from '~/lib/server/http';
import { notifyAddress, sendEmail } from '~/lib/server/email';
import { staffEmail } from '~/lib/server/emails';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const user = await apiUser(ctx);
  if (user instanceof Response) return user;
  const body = await readBody(ctx.request);
  const id = String(body.id ?? '');
  if (!/^[0-9a-f-]{36}$/.test(id)) return fail('invalid');
  const accept = body.decision === 'accept';
  try {
    await withUser(user.claims, (tx) => tx`select public.customer_respond_quote(${id}::uuid, ${accept})`);
  } catch {
    return fail('invalid');
  }
  const to = notifyAddress();
  if (to) {
    const mail = await staffEmail(`Preventivo ${accept ? 'ACCETTATO' : 'rifiutato'} dal cliente`, [['Cliente', user.email]], `/admin/quotes/${id}/`);
    await sendEmail({ to, ...mail, template: 'staff-quote-response', lang: 'it' });
  }
  return back(ctx.request, '/en/account/quotes/', accept ? 'ok=accepted' : 'ok=rejected');
};
