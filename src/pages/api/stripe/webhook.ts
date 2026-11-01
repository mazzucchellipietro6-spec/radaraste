// Notifiche di Stripe: aggiornano pagamenti, prenotazioni e preventivi. La firma viene sempre verificata.
import type { APIRoute } from 'astro';
import type Stripe from 'stripe';
import { stripe, stripeConfigured } from '~/lib/server/stripe';
import { env } from '~/lib/server/env';
import { asSystem } from '~/lib/server/db';
import { notifyAddress, sendEmail } from '~/lib/server/email';
import { bookingStatusEmail, staffEmail } from '~/lib/server/emails';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const secret = env('STRIPE_WEBHOOK_SECRET');
  if (!stripeConfigured() || !secret) return new Response('Stripe non configurato', { status: 503 });
  const sig = request.headers.get('stripe-signature') ?? '';
  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(await request.text(), sig, secret);
  } catch {
    return new Response('Firma non valida', { status: 400 });
  }
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const s = event.data.object as Stripe.Checkout.Session;
    if (s.payment_status !== 'paid') return new Response('ok');
    const paymentId = s.metadata?.payment_id;
    if (!paymentId) return new Response('ok');
    const info = await asSystem(async (tx) => {
      await tx`select set_config('app.actor', 'stripe', true)`;
      const p = (await tx<{ kind: string; ref_id: string; amount: string; status: string }[]>`
        update public.payments set status = 'paid', paid_at = now(), stripe_payment_intent = ${String(s.payment_intent ?? '')}
        where id = ${paymentId} and status <> 'paid' returning kind, ref_id, amount, status`)[0];
      if (!p) return null; // già registrato: Stripe può reinviare lo stesso evento
      if (p.kind === 'booking') {
        const b = (await tx<{ reference: string; first_name: string; last_name: string; email: string; lang: string | null; item_title: string | null }[]>`
          update public.bookings set status = 'paid', paid_at = now() where id = ${p.ref_id} returning reference, first_name, last_name, email, lang, item_title`)[0];
        return { kind: 'booking', amount: p.amount, b };
      }
      if (p.kind === 'order') await tx`update public.orders set paid_amount = paid_amount + ${p.amount}, payment_status = case when paid_amount + ${p.amount} >= coalesce(total, 0) then 'paid' else 'partial' end where id = ${p.ref_id}`;
      return { kind: p.kind, amount: p.amount, b: null };
    });
    if (info?.b) {
      const mail = await bookingStatusEmail(info.b.lang ?? 'en', 'paymentReceived', { name: `${info.b.first_name} ${info.b.last_name}`, reference: info.b.reference, rows: [] });
      await sendEmail({ to: info.b.email, ...mail, template: 'payment-received', lang: info.b.lang ?? 'en' });
    }
    const to = notifyAddress();
    if (to && info) {
      const m = await staffEmail(`Pagamento ricevuto (${info.kind})`, [['Importo', info.amount], ['Riferimento', info.b?.reference ?? s.metadata?.reference ?? '']], '/admin/payments/');
      await sendEmail({ to, ...m, template: 'staff-payment', lang: 'it' });
    }
  } else if (event.type === 'checkout.session.expired') {
    const s = event.data.object as Stripe.Checkout.Session;
    if (s.metadata?.payment_id) await asSystem((tx) => tx`update public.payments set status = 'expired' where id = ${s.metadata!.payment_id} and status = 'pending'`);
  }
  return new Response('ok');
};
