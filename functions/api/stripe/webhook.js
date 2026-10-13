/* POST /api/stripe/webhook — eventi di Stripe (da registrare nel pannello di Stripe → Sviluppatori → Webhook).
 * Funzione di Cloudflare Pages, SPENTA finché il proprietario non imposta le variabili d'ambiente (senza → 503).
 * Passi: corpo grezzo → firma (400 se non valida) → evento già visto? (tabella eventi_stripe: risponde 200 senza
 * rifare nulla) → aggiorna la tabella abbonamenti → email (in sottofondo quando Cloudflare lo permette).
 * Eventi gestiti: checkout.session.completed, customer.subscription.created/updated/deleted/trial_will_end,
 * invoice.payment_failed. Gli altri rispondono 200 e vengono ignorati. Se l'elaborazione fallisce l'evento viene
 * dimenticato e la risposta è un errore: Stripe riprova da solo. */
import { ErroreApi, NON_CONFIGURATI, json, registra } from '../../../servizi/risposte.js';
import {
  COMMENTO_CANCELLAZIONE, IN_CORSO, chiamaStripe, controllaChiave, idCliente, pagamentiReali, pianoDaPrezzo,
  rigaDaAbbonamento, utenteDaMetadati, verificaFirma
} from '../../../servizi/stripe.js';
import {
  cercaAbbonamento, controllaSupabase, dimenticaEvento, eUuid, emailUtente, leggiAbbonamento, registraEvento, salvaAbbonamento
} from '../../../servizi/supabase.js';
import { inviaEmail } from '../../../servizi/email.js';

const MASSIMO = 1000000;   // byte del corpo

const idDi = (x) => (typeof x === 'string' ? x : (x && x.id) || null);

// abbonamento aggiornato letto da Stripe (gli eventi possono arrivare in disordine); null se non esiste più
const abbonamentoFresco = (env, id) => chiamaStripe(env, 'GET', '/subscriptions/' + encodeURIComponent(id), null, { mancanteNull: true });

// utente del sito per un abbonamento: metadati messi dal checkout, poi la tabella abbonamenti
async function utenteDi(env, sub) {
  const daMetadati = utenteDaMetadati(sub);
  if (daMetadati) return daMetadati;
  const riga = await cercaAbbonamento(env, { abbonamento: sub.id, cliente: idCliente(sub) });
  return riga ? riga.utente : null;
}

// destinatario: email dell'account (Supabase), altrimenti quella del cliente Stripe
async function destinatario(env, utente, cliente) {
  const a = utente ? await emailUtente(env, utente) : null;
  if (a || !cliente) return a;
  const c = await chiamaStripe(env, 'GET', '/customers/' + encodeURIComponent(cliente), null, { mancanteNull: true });
  return c && !c.deleted ? c.email || null : null;
}

// piano di un abbonamento per le email (senza errori se non si riconosce)
function pianoDi(env, sub) {
  const voce = sub && sub.items && sub.items.data && sub.items.data[0];
  const p = voce && pianoDaPrezzo(env, (voce.price || voce.plan || {}).id);
  return p ? p.piano : (sub && sub.metadata && sub.metadata.piano) || null;
}

// un evento di un abbonamento vecchio non deve sovrascrivere quello in corso dello stesso utente
function eVecchio(attuale, sub) {
  return !!(attuale && attuale.stripe_subscription && attuale.stripe_subscription !== sub.id && IN_CORSO.includes(attuale.stato) && !IN_CORSO.includes(sub.status));
}

const GESTORI = {
  // pagamento concluso: collega cliente e abbonamento all'utente, poi email di benvenuto
  async 'checkout.session.completed'(env, sessione, email) {
    if (sessione.mode !== 'subscription') return;
    const utente = eUuid(sessione.client_reference_id) ? sessione.client_reference_id.toLowerCase() : utenteDaMetadati(sessione);
    if (!utente) { registra('checkout completato senza utente del sito: ignorato', sessione.id); return; }
    const idAbb = idDi(sessione.subscription);
    const sub = idAbb ? await abbonamentoFresco(env, idAbb) : null;
    const riga = sub
      ? { ...rigaDaAbbonamento(env, sub), utente }
      : { utente, stripe_customer: idCliente(sessione), stripe_subscription: idAbb, aggiornato: new Date().toISOString() };
    if (!(await salvaAbbonamento(env, riga))) return;
    const a = (sessione.customer_details && sessione.customer_details.email) || sessione.customer_email || await destinatario(env, utente, riga.stripe_customer);
    email.push({ a, modello: 'benvenuto', dati: { piano: riga.piano || (sessione.metadata && sessione.metadata.piano), fineProva: riga.fine_prova } });
  },

  // nuovo abbonamento o cambio (piano, periodo, stato, prova, fine periodo, disdetta programmata)
  async 'customer.subscription.created'(env, sub) {
    const fresco = (sub.id && await abbonamentoFresco(env, sub.id)) || sub;
    const utente = await utenteDi(env, fresco);
    if (!utente) { registra('abbonamento senza utente del sito: ignorato', fresco.id); return; }
    if (eVecchio(await leggiAbbonamento(env, utente), fresco)) { registra('evento di un abbonamento precedente: ignorato', fresco.id); return; }
    await salvaAbbonamento(env, { ...rigaDaAbbonamento(env, fresco), utente });
  },

  // abbonamento finito: piano gratis, stato canceled, email (non per la cancellazione dell'account: ha già la sua)
  async 'customer.subscription.deleted'(env, sub, email) {
    const utente = await utenteDi(env, sub);
    if (!utente) { registra('fine di un abbonamento senza utente del sito: ignorata', sub.id); return; }
    const attuale = await leggiAbbonamento(env, utente);
    if (eVecchio(attuale, { ...sub, status: 'canceled' })) { registra('fine di un abbonamento precedente: ignorata', sub.id); return; }
    const riga = { ...rigaDaAbbonamento(env, { ...sub, status: 'canceled' }), utente, piano: 'gratis', stato: 'canceled', cancella_alla_fine: false };
    if (!(await salvaAbbonamento(env, riga))) return;          // utente già cancellato
    const commento = sub.cancellation_details && sub.cancellation_details.comment;
    if (commento === COMMENTO_CANCELLAZIONE) return;
    email.push({ a: await destinatario(env, utente, idCliente(sub)), modello: 'abbonamentoDisdetto', dati: { piano: pianoDi(env, sub) || (attuale && attuale.piano) } });
  },

  // Stripe avvisa 3 giorni prima della fine della prova
  async 'customer.subscription.trial_will_end'(env, sub, email) {
    const utente = await utenteDi(env, sub);
    const fine = typeof sub.trial_end === 'number' ? new Date(sub.trial_end * 1000).toISOString() : null;
    email.push({ a: await destinatario(env, utente, idCliente(sub)), modello: 'provaInScadenza', dati: { piano: pianoDi(env, sub), fineProva: fine } });
  },

  // pagamento rifiutato: lo stato (past_due) arriva con customer.subscription.updated; qui solo l'email
  async 'invoice.payment_failed'(env, fattura, email) {
    const idAbb = idDi(fattura.subscription) ||
      idDi(fattura.parent && fattura.parent.subscription_details && fattura.parent.subscription_details.subscription);
    const riga = await cercaAbbonamento(env, { abbonamento: idAbb, cliente: idCliente(fattura) });
    const a = fattura.customer_email || await destinatario(env, riga && riga.utente, idCliente(fattura));
    const link = typeof fattura.hosted_invoice_url === 'string' && /^https:\/\//.test(fattura.hosted_invoice_url) ? fattura.hosted_invoice_url : null;
    email.push({ a, modello: 'pagamentoNonRiuscito', dati: { piano: riga && riga.piano, linkFattura: link } });
  }
};
GESTORI['customer.subscription.updated'] = GESTORI['customer.subscription.created'];

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    if (!env.STRIPE_WEBHOOK_SECRET) throw new ErroreApi(503, NON_CONFIGURATI);
    controllaChiave(env);
    controllaSupabase(env);
    const grezzo = await request.text();
    if (grezzo.length > MASSIMO) return json(413, { errore: 'Evento troppo grande' });
    const esito = await verificaFirma(grezzo, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET);
    if (!esito.valida) { registra('webhook rifiutato:', esito.motivo); return json(400, { errore: 'Firma non valida' }); }

    let evento;
    try { evento = JSON.parse(grezzo); } catch { return json(400, { errore: 'Evento non valido' }); }
    if (!evento || typeof evento.id !== 'string' || typeof evento.type !== 'string') return json(400, { errore: 'Evento non valido' });
    if (evento.livemode === true && !pagamentiReali(env)) {
      registra('evento reale rifiutato: PAGAMENTI_REALI non è impostata a "si"', evento.type);
      return json(400, { errore: 'Pagamenti reali non abilitati: il sito è in modalità test' });
    }
    const gestore = GESTORI[evento.type];
    if (!gestore) return json(200, { ricevuto: true, ignorato: true });
    if (!(await registraEvento(env, evento))) return json(200, { ricevuto: true, duplicato: true });

    const email = [];
    try {
      await gestore(env, (evento.data && evento.data.object) || {}, email);
    } catch (e) {
      await dimenticaEvento(env, evento.id).catch(() => registra('evento non dimenticato:', evento.id));
      throw e;
    }
    // le email partono dopo la risposta quando Cloudflare lo permette: la risposta a Stripe resta veloce
    const invio = Promise.all(email.map((m) => inviaEmail(env, m)));
    if (typeof context.waitUntil === 'function') context.waitUntil(invio); else await invio;
    return json(200, { ricevuto: true });
  } catch (e) {
    if (e instanceof ErroreApi) return json(e.stato, { errore: e.message });
    registra('errore imprevisto nel webhook:', e && e.name, e && e.message);
    return json(500, { errore: 'Evento non elaborato: Stripe riproverà' });
  }
}
