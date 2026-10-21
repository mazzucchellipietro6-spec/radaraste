/* POST /api/account/cancella — cancella l'account dell'utente (diritto alla cancellazione, art. 17 del GDPR).
 * Funzione di Cloudflare Pages, SPENTA finché il proprietario non configura Supabase (senza → 503).
 * Richiesta: Authorization: Bearer <token di Supabase>. Passi, in quest'ordine:
 *   1. annulla subito gli abbonamenti Stripe ancora attivi dell'utente (se Stripe non risponde ci si ferma: niente
 *      account cancellato con un abbonamento che continua ad addebitare);
 *   2. cancella le righe in dati_utente, abbonamenti e profili, poi l'utente da auth.users;
 *   3. email di conferma.
 * Il cliente Stripe non viene cancellato: fatture e pagamenti restano presso Stripe per gli obblighi fiscali. */
import { gestisci, preflight } from '../../../servizi/risposte.js';
import { COMMENTO_CANCELLAZIONE, STATI_FINALI, abbonamentiDellUtente, chiamaStripe } from '../../../servizi/stripe.js';
import { cancellaRighe, cancellaUtente, controllaSupabase, leggiAbbonamento, utenteDaRichiesta } from '../../../servizi/supabase.js';
import { inviaEmail } from '../../../servizi/email.js';

const annulla = (env, id) => chiamaStripe(env, 'DELETE', '/subscriptions/' + encodeURIComponent(id), { cancellation_details: { comment: COMMENTO_CANCELLAZIONE } });

export const onRequestOptions = ({ request, env }) => preflight(request, env);

export const onRequestPost = ({ request, env }) => gestisci(request, env, async () => {
  controllaSupabase(env);
  const utente = await utenteDaRichiesta(request, env);
  const riga = await leggiAbbonamento(env, utente.id);

  // 1. abbonamenti Stripe ancora vivi, anche quelli che la tabella non conosce ancora (webhook in ritardo)
  let annullati = 0;
  for (const s of await abbonamentiDellUtente(env, utente, riga)) {
    if (STATI_FINALI.includes(s.status)) continue;
    await annulla(env, s.id);
    annullati++;
  }

  // 2. dati e utente
  await cancellaRighe(env, utente.id);
  await cancellaUtente(env, utente.id);

  // 3. conferma (se l'email non parte l'account resta comunque cancellato)
  const email = await inviaEmail(env, { a: utente.email, modello: 'accountCancellato' });

  return {
    cancellato: true,
    abbonamentiAnnullati: annullati,
    emailInviata: email.inviata,
    messaggio: 'Account cancellato: abbiamo eliminato i tuoi dati' + (annullati ? ' e annullato l\'abbonamento' : '') +
      '. I dati salvati in questo browser restano sul dispositivo finché non li cancelli tu.'
  };
});
