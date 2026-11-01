// Azioni sul preventivo: invio al cliente, link di pagamento dell'acconto, trattativa, ordine.
import type { APIRoute } from 'astro';
import { canAccess, resource } from '~/lib/server/admin/resources';
import { withUser } from '~/lib/server/db';
import { readBody } from '~/lib/server/http';
import { createPaymentLink } from '~/lib/server/stripe';
import { sendEmail } from '~/lib/server/email';
import { simpleEmail } from '~/lib/server/emails';
import { getTranslator } from '~/i18n';

export const prerender = false;
type Q = { id: string; number: string; model: string; status: string; customer_id: string | null; customer_name: string | null; customer_email: string | null; currency: string; total: string; valid_until: Date | null; deposit_percent: string | null; request_id: string | null; lang: string | null; account_email: string | null };

export const POST: APIRoute = async (ctx) => {
  const admin = ctx.locals.admin!;
  if (!canAccess(resource('quotes')!, admin.profile)) return new Response('Non autorizzato', { status: 403 });
  const b = await readBody(ctx.request);
  const id = String(b.id ?? '');
  const go = (q: string, to = `/admin/quotes/${id}/`) => new Response(null, { status: 303, headers: { location: `${to}?${q}` } });
  if (!/^[0-9a-f-]{36}$/.test(id)) return go('error=ID', '/admin/quotes/');
  const q = await withUser(admin.user.claims, async (tx) => (await tx<Q[]>`select q.*, coalesce(p.lang, r.lang) as lang, p.email as account_email from public.quotes q
    left join public.profiles p on p.id = q.customer_id left join public.requests r on r.id = q.request_id where q.id = ${id}`)[0]);
  if (!q) return go('error=Preventivo%20non%20trovato', '/admin/quotes/');
  const to = q.account_email ?? q.customer_email;
  const lang = q.lang ?? 'en';
  try {
    if (b.action === 'send') {
      if (!to) return go('error=Manca%20l%27email%20del%20cliente');
      await withUser(admin.user.claims, (tx) => tx`update public.quotes set status = 'sent', sent_at = now() where id = ${id}`);
      if (q.request_id) await withUser(admin.user.claims, (tx) => tx`update public.requests set status = 'quoted' where id = ${q.request_id} and status in ('new', 'in_progress')`);
      const tr = await getTranslator(lang);
      const mail = await simpleEmail(lang, 'quoteSent', {
        name: q.customer_name,
        vars: { number: q.number },
        extra: [q.valid_until ? tr.t('emails.quoteSent.validUntil', { date: tr.fmt.date(q.valid_until) }) : '', `${tr.t('account.quotes.total')}: ${new Intl.NumberFormat(tr.info.intl, { style: 'currency', currency: q.currency }).format(Number(q.total))}`].filter(Boolean).join(' '),
        cta: true,
      });
      await sendEmail({ to, ...mail, template: 'quote-sent', lang, related: { type: 'quote', id } });
      return go('ok=Preventivo%20inviato');
    }
    if (b.action === 'deposit') {
      if (!to) return go('error=Manca%20l%27email%20del%20cliente');
      const amount = Math.round(Number(q.total) * Number(q.deposit_percent ?? 0)) / 100;
      const link = await createPaymentLink({ kind: 'quote', refId: id, reference: q.number, description: `Acconto preventivo ${q.number}`, amount, currency: q.currency, email: to, lang, createdBy: admin.user.id });
      return go(`ok=${encodeURIComponent(`Link di pagamento creato: ${link.url}`)}`);
    }
    if (b.action === 'deal') {
      const deal = await withUser(admin.user.claims, async (tx) => (await tx<{ id: string }[]>`insert into public.deals (model, title, quote_id, request_id, customer_id, customer_name, sale_amount, deal_value, currency, stage, owner_id)
        values (${q.model}, ${`Preventivo ${q.number}`}, ${id}, ${q.request_id}, ${q.customer_id}, ${q.customer_name}, ${q.model === 'trading' ? q.total : null}, ${q.model === 'brokerage' ? q.total : null}, ${q.currency}, 'negotiation', ${admin.user.id}) returning id`)[0]);
      return go('ok=1', `/admin/${q.model}/${deal.id}/`);
    }
    if (b.action === 'order') {
      const order = await withUser(admin.user.claims, async (tx) => (await tx<{ id: string }[]>`insert into public.orders (quote_id, customer_id, customer_name, total, currency) values (${id}, ${q.customer_id}, ${q.customer_name}, ${q.total}, ${q.currency}) returning id`)[0]);
      return go('ok=1', `/admin/orders/${order.id}/`);
    }
  } catch (err) {
    return go(`error=${encodeURIComponent((err as Error).message.slice(0, 200))}`);
  }
  return go('error=Azione%20sconosciuta');
};
