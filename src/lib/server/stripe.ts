// Pagamenti con Stripe Checkout (carte, Apple Pay, Google Pay e gli altri metodi attivati nel pannello Stripe).
// Il link di pagamento viene creato SOLO dallo staff per servizi già confermati e autorizzati.
import Stripe from 'stripe';
import { env } from './env';
import { siteUrl } from './site-url';
import { asSystem } from './db';

let client: Stripe | null = null;
export const stripeConfigured = () => !!env('STRIPE_SECRET_KEY');
export function stripe() {
  if (!client) client = new Stripe(env('STRIPE_SECRET_KEY')!, { maxNetworkRetries: 2 });
  return client;
}

// Lingue della pagina di pagamento supportate da Stripe; le altre usano la lingua del browser.
const STRIPE_LOCALES = new Set(['bg', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 'fi', 'fil', 'fr', 'hr', 'hu', 'id', 'it', 'ja', 'ko', 'lt', 'lv', 'ms', 'mt', 'nb', 'nl', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sv', 'th', 'tr', 'vi', 'zh']);
const stripeLocale = (lang: string) => (STRIPE_LOCALES.has(lang) ? lang : lang === 'zh-tw' ? 'zh-TW' : 'auto') as Stripe.Checkout.SessionCreateParams.Locale;

export async function createPaymentLink(o: {
  kind: 'booking' | 'quote' | 'order';
  refId: string;
  reference: string;
  description: string;
  amount: number;
  currency: string;
  email: string;
  lang: string;
  createdBy: string;
}) {
  if (!stripeConfigured()) throw new Error('Stripe non configurato: imposta STRIPE_SECRET_KEY');
  if (!(o.amount > 0)) throw new Error('Importo non valido');
  const payment = await asSystem(
    (tx) => tx<{ id: string }[]>`insert into public.payments (kind, ref_id, description, amount, currency, created_by)
      values (${o.kind}, ${o.refId}, ${o.description}, ${o.amount}, ${o.currency}, ${o.createdBy}) returning id`,
  );
  const paymentId = payment[0].id;
  const base = siteUrl();
  const session = await stripe().checkout.sessions.create({
    mode: 'payment',
    customer_email: o.email,
    locale: stripeLocale(o.lang),
    client_reference_id: paymentId,
    line_items: [
      {
        quantity: 1,
        price_data: { currency: o.currency.toLowerCase(), unit_amount: Math.round(o.amount * 100), product_data: { name: o.description.slice(0, 250), description: o.reference } },
      },
    ],
    metadata: { payment_id: paymentId, kind: o.kind, ref_id: o.refId, reference: o.reference },
    payment_intent_data: { metadata: { payment_id: paymentId, reference: o.reference } },
    success_url: `${base}/${o.lang}/account/${o.kind === 'booking' ? 'bookings' : 'quotes'}/?paid=1`,
    cancel_url: `${base}/${o.lang}/account/${o.kind === 'booking' ? 'bookings' : 'quotes'}/`,
    expires_at: Math.floor(Date.now() / 1000) + 23 * 3600,
  });
  await asSystem((tx) => tx`update public.payments set stripe_session_id = ${session.id}, url = ${session.url} where id = ${paymentId}`);
  return { paymentId, url: session.url! };
}
