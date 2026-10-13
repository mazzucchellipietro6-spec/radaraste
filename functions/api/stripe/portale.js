/* POST /api/stripe/portale — apre il portale clienti di Stripe (metodo di pagamento, fatture, cambio piano, disdetta).
 * Funzione di Cloudflare Pages, SPENTA finché il proprietario non imposta le variabili d'ambiente (senza → 503).
 * Richiesta: Authorization: Bearer <token di Supabase>. Risposta: { url }.
 * Il portale va attivato una volta nel pannello di Stripe (Impostazioni → Billing → Portale clienti). */
import { ErroreApi, NON_CONFIGURATI, gestisci, preflight, sito } from '../../../servizi/risposte.js';
import { chiamaStripe, controllaChiave } from '../../../servizi/stripe.js';
import { controllaSupabase, leggiAbbonamento, utenteDaRichiesta } from '../../../servizi/supabase.js';

export const onRequestOptions = ({ request, env }) => preflight(request, env);

export const onRequestPost = ({ request, env }) => gestisci(request, env, async () => {
  const { reale } = controllaChiave(env);
  controllaSupabase(env);
  const indirizzo = sito(env);
  if (!indirizzo) throw new ErroreApi(503, NON_CONFIGURATI);
  const utente = await utenteDaRichiesta(request, env);
  const riga = await leggiAbbonamento(env, utente.id);
  if (!riga || !riga.stripe_customer) {
    throw new ErroreApi(404, 'Nessun abbonamento da gestire: scegli un piano nella pagina Prezzi');
  }
  const sessione = await chiamaStripe(env, 'POST', '/billing_portal/sessions', {
    customer: riga.stripe_customer,
    return_url: indirizzo + '/account.html',
    locale: 'it'
  });
  if (!sessione || typeof sessione.url !== 'string' || !/^https:\/\//.test(sessione.url)) {
    throw new ErroreApi(502, 'Il servizio di pagamento non ha restituito il portale');
  }
  return { url: sessione.url, modalita: reale ? 'reale' : 'test' };
});
