/* Risposte delle funzioni degli abbonamenti (Cloudflare Pages): JSON, CORS limitato al sito, errori chiari.
 * Regola: un errore non riporta MAI chiavi, intestazioni o messaggi dei servizi esterni; i dettagli tecnici vanno
 * solo nel registro della funzione, ripuliti da tutto ciò che somiglia a una chiave. */

// errore "previsto": stato HTTP e messaggio in italiano che si può mostrare all'utente
export class ErroreApi extends Error {
  constructor(stato, messaggio) { super(messaggio); this.name = 'ErroreApi'; this.stato = stato; }
}

export const NON_CONFIGURATI = 'Abbonamenti non configurati (modalità test): il proprietario deve ancora collegare i servizi';

// toglie dal testo tutto ciò che somiglia a una chiave o a un token (per il registro)
export function pulisci(testo) {
  return String(testo == null ? '' : testo)
    .replace(/\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]+/g, '$1_$2_***')
    .replace(/\bwhsec_[A-Za-z0-9_]+/g, 'whsec_***')
    .replace(/\bre_[A-Za-z0-9_]{8,}/g, 're_***')
    .replace(/\bsb_(secret|publishable)_[A-Za-z0-9_-]+/g, 'sb_$1_***')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '[token]')
    .replace(/Bearer\s+\S+/gi, 'Bearer ***')
    .slice(0, 500);
}

// registro della funzione (console di Cloudflare), sempre ripulito
export function registra(...parti) { console.log('[abbonamenti]', ...parti.map(pulisci)); }

// indirizzo del sito senza barra finale; null se manca o non è un indirizzo valido
export function sito(env) {
  const s = String((env && env.SITO_URL) || '').trim().replace(/\/+$/, '');
  if (!s) return null;
  try {
    const u = new URL(s);
    const locale = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol !== 'https:' && !(locale && u.protocol === 'http:')) return null;
    return u.origin + u.pathname.replace(/\/+$/, '');
  } catch { return null; }
}

function origineSito(env) { const s = sito(env); return s ? new URL(s).origin : null; }

// l'origine della richiesta è ammessa se è il sito (SITO_URL) o la stessa origine della funzione (anteprime di Cloudflare)
export function origineAmmessa(request, env) {
  const o = request.headers.get('Origin');
  if (!o) return true;                       // richiesta non da browser (es. strumenti a riga di comando): decide il token
  if (o === origineSito(env)) return true;
  try { return o === new URL(request.url).origin; } catch { return false; }
}

function intestazioniCors(request, env) {
  const o = request && request.headers.get('Origin');
  const h = { Vary: 'Origin' };
  if (o && origineAmmessa(request, env)) {
    h['Access-Control-Allow-Origin'] = o;
    h['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    h['Access-Control-Max-Age'] = '600';
  }
  return h;
}

// risposta JSON; con la richiesta aggiunge il CORS per il sito
export function json(stato, corpo, request, env) {
  return new Response(JSON.stringify(corpo), {
    status: stato,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(request ? intestazioniCors(request, env) : {})
    }
  });
}

export function errore(stato, messaggio, request, env) { return json(stato, { errore: messaggio }, request, env); }

// risposta alla preflight del browser (metodo OPTIONS)
export function preflight(request, env) {
  if (!origineAmmessa(request, env)) return errore(403, 'Origine non autorizzata', request, env);
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store', ...intestazioniCors(request, env) } });
}

// corpo JSON della richiesta, con un tetto alle dimensioni
export async function leggiJson(request, massimo = 10000) {
  let testo;
  try { testo = await request.text(); } catch { throw new ErroreApi(400, 'Richiesta non valida'); }
  if (testo.length > massimo) throw new ErroreApi(413, 'Richiesta troppo grande');
  if (!testo.trim()) return {};
  try {
    const dati = JSON.parse(testo);
    if (!dati || typeof dati !== 'object' || Array.isArray(dati)) throw new Error('non è un oggetto');
    return dati;
  } catch { throw new ErroreApi(400, 'Richiesta non valida: serve un oggetto JSON'); }
}

// esegue il lavoro di una funzione del sito: controlla l'origine e trasforma ogni errore in una risposta pulita
export async function gestisci(request, env, lavoro) {
  if (!origineAmmessa(request, env)) return errore(403, 'Origine non autorizzata', request, env);
  try {
    const corpo = await lavoro();
    return json(200, corpo, request, env);
  } catch (e) {
    if (e instanceof ErroreApi) return errore(e.stato, e.message, request, env);
    registra('errore imprevisto:', e && e.name, e && e.message);
    return errore(500, 'Errore interno: riprova tra qualche minuto', request, env);
  }
}
