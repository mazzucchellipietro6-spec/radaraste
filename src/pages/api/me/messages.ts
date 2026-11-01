import type { APIRoute } from 'astro';
import { apiUser, back } from '~/lib/server/account';
import { withUser } from '~/lib/server/db';
import { fail, readBody } from '~/lib/server/http';
import { rateLimit } from '~/lib/server/rate-limit';
import { notifyAddress, sendEmail } from '~/lib/server/email';
import { staffEmail } from '~/lib/server/emails';

export const prerender = false;

export const POST: APIRoute = async (ctx) => {
  const user = await apiUser(ctx);
  if (user instanceof Response) return user;
  if (!(await rateLimit(`msg:${user.id}`, 20, 3600))) return fail('rate_limited');
  const body = await readBody(ctx.request);
  const text = String(body.body ?? '').trim().slice(0, 8000);
  if (!text) return fail('invalid');
  await withUser(user.claims, (tx) => tx`insert into public.messages (customer_id, thread_type, sender, sender_id, body) values (${user.id}, 'general', 'customer', ${user.id}, ${text})`);
  const to = notifyAddress();
  if (to) {
    const mail = await staffEmail('Nuovo messaggio da un cliente', [['Cliente', user.email], ['Messaggio', text]], `/admin/customers/${user.id}/`);
    await sendEmail({ to, ...mail, template: 'staff-message', lang: 'it', replyTo: user.email });
  }
  return back(ctx.request, '/en/account/messages/', 'ok=sent');
};
