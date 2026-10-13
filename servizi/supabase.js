/* Supabase per gli abbonamenti, solo con fetch: GoTrue (/auth/v1) per riconoscere l'utente dal suo token e, con la
 * service role, per leggere l'email o cancellare l'utente; PostgREST (/rest/v1) per le tabelle abbonamenti,
 * dati_utente, profili ed eventi_stripe (schema in supabase/schema.sql). La service role scavalca la Row Level
 * Security: si usa SOLO qui, nelle funzioni, mai nel browser. */
import { ErroreApi, NON_CONFIGURATI, registra } from './risposte.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const eUuid = (x) => typeof x === 'string' && UUID.test(x);

function base(env) { return String(env.SUPABASE_URL || '').trim().replace(/\/+$/, ''); }

export function configurato(env) {
  return !!(env && /^https:\/\//.test(base(env)) && env.SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY);
}

export function controllaSupabase(env) {
  if (!configurato(env)) {
    registra('Supabase non configurato (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY)');
    throw new ErroreApi(503, NON_CONFIGURATI);
  }
}

// intestazioni con una chiave di Supabase: le chiavi nuove (sb_...) vanno solo in apikey, le vecchie (JWT) anche in Authorization
function conChiave(chiave, extra = {}) {
  const h = { apikey: chiave, ...extra };
  if (!/^sb_/.test(chiave) && !h.Authorization) h.Authorization = 'Bearer ' + chiave;
  return h;
}

async function chiama(env, metodo, percorso, { corpo, intestazioni, chiave } = {}) {
  controllaSupabase(env);
  try {
    return await fetch(base(env) + percorso, {
      method: metodo,
      headers: conChiave(chiave || env.SUPABASE_SERVICE_ROLE_KEY, { ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}), ...intestazioni }),
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(10000)
    });
  } catch (e) {
    registra('Supabase non raggiungibile:', metodo, percorso.split('?')[0], e && e.name);
    throw new ErroreApi(502, 'Il servizio degli account non risponde: riprova tra poco');
  }
}

async function falliscePerStato(r, metodo, percorso) {
  const j = await r.json().catch(() => ({}));
  registra('Supabase ha risposto', r.status, metodo, percorso.split('?')[0], (j && j.code) || '');
  throw new ErroreApi(502, 'Il servizio degli account non ha accettato la richiesta (' + r.status + ')');
}

// --- utente dal token ----------------------------------------------------------------------------------------------

export function tokenDa(request) {
  const h = request.headers.get('Authorization') || '';
  const m = /^Bearer\s+([A-Za-z0-9._~+/=-]{20,4096})$/.exec(h.trim());
  return m ? m[1] : null;
}

// verifica il token con GoTrue (/auth/v1/user): restituisce { id, email } o 401
export async function utenteDaRichiesta(request, env) {
  controllaSupabase(env);
  const token = tokenDa(request);
  if (!token) throw new ErroreApi(401, 'Accesso richiesto: entra nel tuo account');
  const r = await chiama(env, 'GET', '/auth/v1/user', { chiave: env.SUPABASE_ANON_KEY, intestazioni: { Authorization: 'Bearer ' + token } });
  if (r.status === 401 || r.status === 403) throw new ErroreApi(401, 'Accesso scaduto o non valido: entra di nuovo nel tuo account');
  if (!r.ok) await falliscePerStato(r, 'GET', '/auth/v1/user');
  const u = await r.json().catch(() => null);
  if (!u || !eUuid(u.id)) throw new ErroreApi(401, 'Accesso scaduto o non valido: entra di nuovo nel tuo account');
  return { id: u.id.toLowerCase(), email: typeof u.email === 'string' ? u.email : null };
}

// email di un utente (GoTrue admin, service role); null se l'utente non c'è più
export async function emailUtente(env, utente) {
  if (!eUuid(utente)) return null;
  const percorso = '/auth/v1/admin/users/' + utente;
  const r = await chiama(env, 'GET', percorso);
  if (r.status === 404) return null;
  if (!r.ok) await falliscePerStato(r, 'GET', percorso);
  const u = await r.json().catch(() => ({}));
  return (u && u.email) || (u && u.user && u.user.email) || null;
}

// cancella l'utente da auth.users (GDPR art. 17); già assente = va bene
export async function cancellaUtente(env, utente) {
  if (!eUuid(utente)) throw new ErroreApi(400, 'Utente non valido');
  const percorso = '/auth/v1/admin/users/' + utente;
  const r = await chiama(env, 'DELETE', percorso);
  if (!r.ok && r.status !== 404) await falliscePerStato(r, 'DELETE', percorso);
}

// --- tabelle (PostgREST) -------------------------------------------------------------------------------------------

async function leggiUna(env, tabella, colonna, valore) {
  const percorso = '/rest/v1/' + tabella + '?' + colonna + '=eq.' + encodeURIComponent(valore) + '&select=*&limit=1';
  const r = await chiama(env, 'GET', percorso);
  if (!r.ok) await falliscePerStato(r, 'GET', percorso);
  const righe = await r.json().catch(() => []);
  return Array.isArray(righe) && righe.length ? righe[0] : null;
}

export async function leggiAbbonamento(env, utente) {
  if (!eUuid(utente)) return null;
  return leggiUna(env, 'abbonamenti', 'utente', utente);
}

// riga dell'abbonamento cercata per abbonamento Stripe o, in mancanza, per cliente Stripe
export async function cercaAbbonamento(env, { abbonamento, cliente }) {
  if (abbonamento) { const r = await leggiUna(env, 'abbonamenti', 'stripe_subscription', abbonamento); if (r) return r; }
  if (cliente) return leggiUna(env, 'abbonamenti', 'stripe_customer', cliente);
  return null;
}

/* inserisce o aggiorna (upsert su utente) solo le colonne passate. Restituisce false se l'utente non esiste più
 * (account cancellato: chiave esterna verso auth.users), così un evento tardivo di Stripe non resta in errore. */
export async function salvaAbbonamento(env, riga) {
  if (!eUuid(riga.utente)) throw new ErroreApi(400, 'Utente non valido');
  const percorso = '/rest/v1/abbonamenti?on_conflict=utente';
  const r = await chiama(env, 'POST', percorso, { corpo: riga, intestazioni: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
  if (r.ok) return true;
  const j = await r.clone().json().catch(() => ({}));
  if (r.status === 409 && j && j.code === '23503') { registra('abbonamento non salvato: utente non più esistente'); return false; }
  await falliscePerStato(r, 'POST', percorso);
}

// idempotenza dei webhook: true se l'evento è nuovo, false se era già arrivato (chiave primaria = id dell'evento)
export async function registraEvento(env, evento) {
  const percorso = '/rest/v1/eventi_stripe';
  const r = await chiama(env, 'POST', percorso, {
    corpo: { id: String(evento.id), tipo: String(evento.type || ''), ricevuto: new Date().toISOString() },
    intestazioni: { Prefer: 'return=minimal' }
  });
  if (r.ok) return true;
  if (r.status === 409) return false;
  await falliscePerStato(r, 'POST', percorso);
}

// toglie l'evento dalla tabella quando l'elaborazione fallisce, così Stripe può riprovare
export async function dimenticaEvento(env, id) {
  const percorso = '/rest/v1/eventi_stripe?id=eq.' + encodeURIComponent(String(id));
  const r = await chiama(env, 'DELETE', percorso);
  if (!r.ok) await falliscePerStato(r, 'DELETE', percorso);
}

// cancella le righe dell'utente in tutte le tabelle (prima dell'utente stesso)
export async function cancellaRighe(env, utente) {
  if (!eUuid(utente)) throw new ErroreApi(400, 'Utente non valido');
  for (const [tabella, colonna] of [['dati_utente', 'utente'], ['abbonamenti', 'utente'], ['profili', 'id']]) {
    const percorso = '/rest/v1/' + tabella + '?' + colonna + '=eq.' + utente;
    const r = await chiama(env, 'DELETE', percorso, { intestazioni: { Prefer: 'return=minimal' } });
    if (!r.ok) await falliscePerStato(r, 'DELETE', percorso);
  }
}
