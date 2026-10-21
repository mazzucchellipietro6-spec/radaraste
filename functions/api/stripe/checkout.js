/* POST /api/stripe/checkout — crea la pagina di pagamento di Stripe (Checkout Session) per abbonarsi.
 * Funzione di Cloudflare Pages, SPENTA finché il proprietario non imposta le variabili d'ambiente (senza → 503).
 * Richiesta: Authorization: Bearer <token di Supabase>, corpo { piano: 'base'|'pro', periodo: 'mensile'|'annuale' }.
 * Risposta: { url } (indirizzo della pagina di Stripe) e modalita ('test' o 'reale').
 * Prova gratuita di 14 giorni solo per Pro e solo per chi non ha mai avuto un abbonamento.
 * Un abbonamento in corso si cerca nella tabella E su Stripe: il webhook può arrivare qualche secondo dopo il ritorno
 * dal pagamento, e chi in quei secondi vede ancora "Gratis" non deve poter pagare (e avere la prova) due volte. */
import { ErroreApi, NON_CONFIGURATI, gestisci, leggiJson, preflight, sito } from '../../../servizi/risposte.js';
import {
  GIORNI_PROVA, IN_CORSO, abbonamentiDellUtente, chiamaStripe, controllaChiave, haGiaAvuto, idCliente, idPrezzo, validaScelta
} from '../../../servizi/stripe.js';
import { controllaSupabase, leggiAbbonamento, utenteDaRichiesta } from '../../../servizi/supabase.js';

export const onRequestOptions = ({ request, env }) => preflight(request, env);

export const onRequestPost = ({ request, env }) => gestisci(request, env, async () => {
  const { reale } = controllaChiave(env);
  controllaSupabase(env);
  const indirizzo = sito(env);
  if (!indirizzo) throw new ErroreApi(503, NON_CONFIGURATI);
  const utente = await utenteDaRichiesta(request, env);
  const { piano, periodo } = validaScelta(await leggiJson(request));
  const prezzo = idPrezzo(env, piano, periodo);

  const precedente = await leggiAbbonamento(env, utente.id);
  const suStripe = await abbonamentiDellUtente(env, utente, precedente);
  if ((precedente && precedente.stripe_subscription && IN_CORSO.includes(precedente.stato)) || suStripe.some((s) => IN_CORSO.includes(s.status))) {
    throw new ErroreApi(409, 'Hai già un abbonamento attivo: per cambiarlo usa "Gestisci abbonamento" nella pagina del tuo account');
  }
  const prova = piano === 'pro' && !haGiaAvuto(precedente) && !suStripe.length;
  // stesso cliente Stripe di prima (dalla tabella o da un abbonamento passato di questo utente): fatture tutte insieme
  const cliente = (precedente && precedente.stripe_customer) || suStripe.map(idCliente).find(Boolean) || null;
  const meta = { utente: utente.id, piano, periodo };

  const sessione = await chiamaStripe(env, 'POST', '/checkout/sessions', {
    mode: 'subscription',
    line_items: [{ price: prezzo, quantity: 1 }],
    client_reference_id: utente.id,
    customer: cliente || undefined,
    customer_email: cliente ? undefined : utente.email || undefined,
    success_url: indirizzo + '/account.html?pagamento=ok',
    cancel_url: indirizzo + '/prezzi.html?pagamento=annullato',
    metadata: meta,
    subscription_data: { metadata: meta, trial_period_days: prova ? GIORNI_PROVA : undefined },
    allow_promotion_codes: true,
    locale: 'it'
  });
  if (!sessione || typeof sessione.url !== 'string' || !/^https:\/\//.test(sessione.url)) {
    throw new ErroreApi(502, 'Il servizio di pagamento non ha restituito la pagina di pagamento');
  }
  return { url: sessione.url, prova: prova ? GIORNI_PROVA : 0, modalita: reale ? 'reale' : 'test' };
});
