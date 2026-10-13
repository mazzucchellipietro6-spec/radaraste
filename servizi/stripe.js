/* Stripe per gli abbonamenti: chiamate all'API (corpo form con chiavi annidate), controllo della chiave, firma del
 * webhook, prezzi e piani. MODALITÀ TEST: di predefinito si accettano solo chiavi segrete di test (sk_test_); le chiavi
 * reali (sk_live_/rk_live_) passano solo se il proprietario imposta a mano PAGAMENTI_REALI=si.
 * Le chiavi stanno SOLO nelle variabili d'ambiente di Cloudflare, mai nel codice. */
import { ErroreApi, NON_CONFIGURATI, registra } from './risposte.js';

export const API_STRIPE = 'https://api.stripe.com/v1';
export const GIORNI_PROVA = 14;             // come config/abbonamenti.js → prova.giorni
export const TOLLERANZA_FIRMA = 300;        // secondi
export const PIANI_A_PAGAMENTO = ['base', 'pro'];
export const PERIODI = ['mensile', 'annuale'];
// stati di un abbonamento Stripe; quelli finali riportano l'utente al piano gratis
export const STATI = ['incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused'];
export const STATI_FINALI = ['canceled', 'incomplete_expired'];
// motivo scritto sugli abbonamenti annullati per la cancellazione dell'account (il webhook non manda la seconda email)
export const COMMENTO_CANCELLAZIONE = 'Account cancellato dal cliente (GDPR art. 17)';

export function pagamentiReali(env) { return !!env && env.PAGAMENTI_REALI === 'si'; }

// controlla STRIPE_SECRET_KEY: mancante → 503; reale senza PAGAMENTI_REALI=si → 503; pubblicabile o sconosciuta → 503
export function controllaChiave(env) {
  const chiave = String((env && env.STRIPE_SECRET_KEY) || '').trim();
  if (!chiave) throw new ErroreApi(503, NON_CONFIGURATI);
  const reale = /^(sk|rk|pk)_live_/.test(chiave);
  if (reale && !pagamentiReali(env)) {
    registra('chiave Stripe reale rifiutata: PAGAMENTI_REALI non è impostata a "si"');
    throw new ErroreApi(503, 'Pagamenti reali non abilitati: il sito è in modalità test');
  }
  const ammessa = /^sk_test_/.test(chiave) || (pagamentiReali(env) && /^(sk|rk)_live_/.test(chiave));
  if (!ammessa) {
    registra('chiave Stripe non utilizzabile: serve una chiave segreta (sk_test_ in modalità test)');
    throw new ErroreApi(503, NON_CONFIGURATI);
  }
  return { chiave, reale };
}

// { a: { b: 1 }, l: [{ p: 'x' }] } → "a[b]=1&l[0][p]=x" (valori null o undefined esclusi)
export function codificaForm(dati, prefisso) {
  const coppie = [];
  const aggiungi = (chiave, valore) => {
    if (valore === undefined || valore === null) return;
    if (Array.isArray(valore)) { valore.forEach((v, i) => aggiungi(chiave + '[' + i + ']', v)); return; }
    if (typeof valore === 'object') {
      for (const k of Object.keys(valore)) aggiungi(chiave + '[' + encodeURIComponent(k) + ']', valore[k]);
      return;
    }
    coppie.push(chiave + '=' + encodeURIComponent(String(valore)));
  };
  if (prefisso) aggiungi(prefisso, dati);
  else for (const k of Object.keys(dati || {})) aggiungi(encodeURIComponent(k), dati[k]);
  return coppie.join('&');
}

// chiamata all'API di Stripe; un errore non riporta mai il messaggio di Stripe (resta solo nel registro, ripulito)
export async function chiamaStripe(env, metodo, percorso, parametri, opzioni = {}) {
  const { chiave } = controllaChiave(env);
  const corpo = parametri ? codificaForm(parametri) : '';
  const conCorpo = metodo !== 'GET';
  const indirizzo = API_STRIPE + percorso + (!conCorpo && corpo ? '?' + corpo : '');
  const intestazioni = { Authorization: 'Bearer ' + chiave };
  if (conCorpo) intestazioni['Content-Type'] = 'application/x-www-form-urlencoded';
  if (opzioni.idempotenza) intestazioni['Idempotency-Key'] = opzioni.idempotenza;
  let r;
  try {
    r = await fetch(indirizzo, { method: metodo, headers: intestazioni, body: conCorpo ? corpo : undefined, signal: AbortSignal.timeout(15000) });
  } catch (e) {
    registra('Stripe non raggiungibile:', metodo, percorso, e && e.name);
    throw new ErroreApi(502, 'Il servizio di pagamento non risponde: riprova tra poco');
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = (j && j.error) || {};
    registra('Stripe ha risposto', r.status, metodo, percorso, err.type || '', err.code || '');
    if (r.status === 401 || r.status === 403) throw new ErroreApi(503, NON_CONFIGURATI);
    if (r.status === 404 && opzioni.mancanteNull) return null;
    throw new ErroreApi(502, 'Il servizio di pagamento non ha accettato la richiesta (' + r.status + ')');
  }
  return j;
}

// --- firma del webhook ---------------------------------------------------------------------------------------------

const testo = new TextEncoder();

async function hmacHex(segreto, messaggio) {
  const chiave = await crypto.subtle.importKey('raw', testo.encode(segreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const firma = new Uint8Array(await crypto.subtle.sign('HMAC', chiave, testo.encode(messaggio)));
  return Array.from(firma, (b) => b.toString(16).padStart(2, '0')).join('');
}

// confronto a tempo costante (il tempo non dipende da dove le stringhe differiscono)
export function ugualeCostante(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;   // la lunghezza non è un segreto (sempre 64 cifre esadecimali)
  let diversi = 0;
  for (let i = 0; i < a.length; i++) diversi |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diversi === 0;
}

// intestazione Stripe-Signature "t=...,v1=...,v1=..." → { t, v1: [...] }
export function leggiFirma(intestazione) {
  const esito = { t: null, v1: [] };
  for (const parte of String(intestazione || '').split(',')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    const k = parte.slice(0, i).trim(), v = parte.slice(i + 1).trim();
    if (k === 't' && /^\d{1,12}$/.test(v)) esito.t = Number(v);
    else if (k === 'v1' && /^[0-9a-f]{64}$/i.test(v)) esito.v1.push(v.toLowerCase());
  }
  return esito;
}

// verifica: HMAC-SHA256 di "<t>.<corpo grezzo>" con il segreto, almeno una v1 uguale, t entro la tolleranza
export async function verificaFirma(corpoGrezzo, intestazione, segreto, opzioni = {}) {
  if (!segreto) throw new ErroreApi(503, NON_CONFIGURATI);
  const tolleranza = opzioni.tolleranza ?? TOLLERANZA_FIRMA;
  const adesso = opzioni.adesso ?? Math.floor(Date.now() / 1000);
  const { t, v1 } = leggiFirma(intestazione);
  if (t === null || !v1.length) return { valida: false, motivo: 'firma assente o malformata' };
  const attesa = await hmacHex(segreto, t + '.' + corpoGrezzo);
  let trovata = false;
  for (const v of v1) if (ugualeCostante(v, attesa)) trovata = true;     // nessuna uscita anticipata
  if (!trovata) return { valida: false, motivo: 'firma non corrispondente' };
  if (Math.abs(adesso - t) > tolleranza) return { valida: false, motivo: 'firma scaduta' };
  return { valida: true, t };
}

// firma un corpo come fa Stripe (serve ai test e alle prove in locale)
export async function firma(corpoGrezzo, segreto, t = Math.floor(Date.now() / 1000)) {
  return 't=' + t + ',v1=' + await hmacHex(segreto, t + '.' + corpoGrezzo);
}

// --- prezzi e piani ------------------------------------------------------------------------------------------------

const VARIABILI_PREZZO = {
  base: { mensile: 'STRIPE_PREZZO_BASE_MENSILE', annuale: 'STRIPE_PREZZO_BASE_ANNUALE' },
  pro: { mensile: 'STRIPE_PREZZO_PRO_MENSILE', annuale: 'STRIPE_PREZZO_PRO_ANNUALE' }
};

// id del prezzo Stripe (price_...) per piano e periodo; manca → 503
export function idPrezzo(env, piano, periodo) {
  const nome = VARIABILI_PREZZO[piano] && VARIABILI_PREZZO[piano][periodo];
  const id = nome && String(env[nome] || '').trim();
  if (!id) {
    registra('prezzo non configurato:', nome || piano + '/' + periodo);
    throw new ErroreApi(503, NON_CONFIGURATI);
  }
  return id;
}

// id del prezzo → { piano, periodo } secondo le variabili d'ambiente (null se non è uno dei nostri)
export function pianoDaPrezzo(env, id) {
  if (!id) return null;
  for (const piano of Object.keys(VARIABILI_PREZZO)) {
    for (const periodo of Object.keys(VARIABILI_PREZZO[piano])) {
      if (String(env[VARIABILI_PREZZO[piano][periodo]] || '').trim() === id) return { piano, periodo };
    }
  }
  return null;
}

// stati in cui l'utente ha già un abbonamento in corso: si cambia dal portale, non con un secondo checkout
export const IN_CORSO = ['active', 'trialing', 'past_due', 'unpaid', 'paused'];

// scelta del checkout { piano, periodo } controllata; altrimenti 400
export function validaScelta(corpo) {
  const piano = corpo && corpo.piano, periodo = corpo && corpo.periodo;
  if (!PIANI_A_PAGAMENTO.includes(piano)) throw new ErroreApi(400, 'Piano non valido: scegli Base o Pro');
  if (!PERIODI.includes(periodo)) throw new ErroreApi(400, 'Periodo non valido: scegli mensile o annuale');
  return { piano, periodo };
}

// la prova spetta solo a chi non ha mai avuto un abbonamento: nessun abbonamento Stripe, nessuna prova, nessuno stato
// di Stripe nella tabella (una riga "gratis" creata alla registrazione non conta)
export function haGiaAvuto(riga) {
  return !!(riga && (riga.stripe_subscription || riga.fine_prova || STATI.includes(riga.stato)));
}

const iso = (secondi) => (typeof secondi === 'number' && secondi > 0 ? new Date(secondi * 1000).toISOString() : null);
const PERIODO_STRIPE = { month: 'mensile', year: 'annuale' };

// utente del sito scritto nei metadati dal checkout (solo un uuid valido)
export function utenteDaMetadati(oggetto) {
  const u = oggetto && oggetto.metadata && oggetto.metadata.utente;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(u || '') ? u.toLowerCase() : null;
}

export function idCliente(oggetto) {
  const c = oggetto && oggetto.customer;
  return typeof c === 'string' ? c : (c && c.id) || null;
}

/* abbonamento Stripe → riga della tabella abbonamenti (senza la colonna utente).
 * Il piano viene dal prezzo (variabili d'ambiente), poi dai metadati del checkout; se non si riconosce → errore,
 * così Stripe riprova e il proprietario vede il problema. Stati finali → piano gratis. */
export function rigaDaAbbonamento(env, sub) {
  const voce = (sub.items && sub.items.data && sub.items.data[0]) || {};
  const prezzo = voce.price || voce.plan || {};
  let scelta = pianoDaPrezzo(env, prezzo.id);
  if (!scelta) {
    const meta = sub.metadata || {};
    const intervallo = prezzo.recurring ? prezzo.recurring.interval : prezzo.interval;
    const periodo = PERIODI.includes(meta.periodo) ? meta.periodo : PERIODO_STRIPE[intervallo];
    if (PIANI_A_PAGAMENTO.includes(meta.piano) && periodo) scelta = { piano: meta.piano, periodo };
  }
  const stato = STATI.includes(sub.status) ? sub.status : 'incomplete';
  if (!scelta && !STATI_FINALI.includes(stato)) {
    registra('prezzo non riconosciuto nell\'abbonamento', sub.id, prezzo.id || '');
    throw new ErroreApi(500, 'Prezzo non riconosciuto');
  }
  return {
    stripe_customer: idCliente(sub),
    stripe_subscription: sub.id || null,
    piano: STATI_FINALI.includes(stato) ? 'gratis' : scelta.piano,
    periodo: scelta ? scelta.periodo : null,
    stato,
    fine_prova: iso(sub.trial_end),
    // nelle versioni recenti dell'API la fine del periodo sta sulle voci dell'abbonamento
    fine_periodo: iso(sub.current_period_end ?? voce.current_period_end),
    cancella_alla_fine: !!(sub.cancel_at_period_end || sub.cancel_at),
    aggiornato: new Date().toISOString()
  };
}
