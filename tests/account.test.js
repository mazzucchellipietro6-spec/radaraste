// Account (js/account.js) e schema del database (supabase/schema.sql), in modalità test.
// Nessuna rete reale: fetch finto che fa fallire il test per ogni indirizzo non previsto. Solo valori finti evidenti.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CFG = require('../config/abbonamenti.js');

const SUPABASE = 'https://progetto-finto.supabase.co';
const ANONIMA = 'chiave-anonima-finta';
const UTENTE = '11111111-2222-4333-8444-555555555555';
const EMAIL = 'prova@example.com';
const SITO = 'https://radaraste.example';
const NON_CONFIGURATO = 'Account non ancora attivo: configurazione mancante (modalità test)';

// token JWT finto (firma finta: il browser non la verifica, lo fa GoTrue)
function jwt(dati) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return b({ alg: 'HS256', typ: 'JWT' }) + '.' + b(dati) + '.firma-finta';
}
const TOKEN = jwt({ sub: UTENTE, email: EMAIL, app_metadata: { provider: 'email' } });
const TOKEN2 = jwt({ sub: UTENTE, email: EMAIL, app_metadata: { provider: 'email' }, rinnovato: true });
const UTENTE_GOTRUE = { id: UTENTE, email: EMAIL, created_at: '2026-10-01T10:00:00Z', app_metadata: { provider: 'email' } };
const ora = () => Math.floor(Date.now() / 1000);

function memoriaFinta() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}
function globale(nome, valore) { Object.defineProperty(globalThis, nome, { value: valore, configurable: true, writable: true }); }
const GLOBALI = ['localStorage', 'sessionStorage', 'document', 'location', 'history', 'fetch'];
const originali = Object.fromEntries(GLOBALI.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
function ripristina() {
  for (const k of GLOBALI) { if (originali[k]) Object.defineProperty(globalThis, k, originali[k]); else delete globalThis[k]; }
  delete globalThis.ABBONAMENTI;
}

// risposte di base di Supabase (le singole prove ne aggiungono altre davanti)
const BASE = [
  ['GET', SUPABASE + '/rest/v1/abbonamenti?', { json: [] }],
  ['GET', SUPABASE + '/rest/v1/dati_utente?', { json: [] }],
  ['POST', SUPABASE + '/rest/v1/dati_utente?on_conflict=utente', { status: 201 }],
  ['POST', SUPABASE + '/auth/v1/logout', { status: 204 }]
];

/* Ambiente del browser finto e modulo caricato da capo.
 * opz: configurato (default sì), hash dell'indirizzo, rotte [metodo, inizio dell'indirizzo o RegExp, risposta | funzione] */
function ambiente(t, opz = {}) {
  const configurato = opz.configurato !== false;
  globalThis.ABBONAMENTI = Object.assign(structuredClone(CFG), configurato ? { supabase: { url: SUPABASE, chiaveAnonima: ANONIMA } } : {});
  const local = memoriaFinta(), sess = memoriaFinta();
  globale('localStorage', local);
  globale('sessionStorage', sess);
  const doc = new EventTarget();
  doc.visibilityState = 'visible';
  globale('document', doc);
  const eventi = [];
  doc.addEventListener('radaraste:account', (e) => eventi.push(e.detail.motivo));
  const loc = { origin: SITO, pathname: '/accedi.html', search: '?dopo=aste.html', hash: opz.hash || '', assegnato: null };
  loc.assign = (u) => { loc.assegnato = u; };
  globale('location', loc);
  const storia = { state: null, chiamate: [], replaceState(s, titolo, u) { storia.chiamate.push(u); loc.hash = ''; } };
  globale('history', storia);
  const chiamate = [], rotte = [...(opz.rotte || []), ...BASE];
  globale('fetch', async (url, init = {}) => {
    const req = { url: String(url), metodo: init.method || 'GET', intestazioni: init.headers || {}, corpo: init.body ? JSON.parse(init.body) : undefined };
    chiamate.push(req);
    for (const [metodo, schema, risposta] of rotte) {
      const va = schema instanceof RegExp ? schema.test(req.url) : req.url.startsWith(schema);
      if (metodo !== req.metodo || !va) continue;
      const r = typeof risposta === 'function' ? await risposta(req) : risposta;
      return new Response(r.json === undefined ? null : JSON.stringify(r.json), { status: r.status || 200 });
    }
    throw new Error('rete reale vietata nei test: ' + req.metodo + ' ' + req.url);
  });
  delete require.cache[require.resolve('../js/account.js')];
  const A = require('../js/account.js');
  t.after(ripristina);
  return { A, local, sess, doc, eventi, loc, storia, chiamate };
}
function conSessione(local, extra = {}) {
  local.setItem('radaraste.account', JSON.stringify(Object.assign({
    access_token: TOKEN, refresh_token: 'rinnovo-finto', expires_at: ora() + 3600,
    utente: { id: UTENTE, email: EMAIL, creato: '2026-10-01T10:00:00Z', provider: 'email' }
  }, extra)));
}
const leggi = (local, k) => JSON.parse(local.getItem(k));
const verso = (chiamate, inizio, metodo) => chiamate.filter((c) => c.url.startsWith(inizio) && (!metodo || c.metodo === metodo));
const attesa = () => new Promise((ok) => setImmediate(ok));

/* ---- Spento ---- */

test('non configurato: nessuna rete, nessun ascoltatore, ogni chiamata rifiuta con un errore chiaro', async (t) => {
  const { A, local, doc, chiamate } = ambiente(t, { configurato: false });
  assert.equal(A.configurato(), false);
  conSessione(local);                               // anche con una sessione rimasta da prima
  assert.equal(A.sessione(), null);
  assert.equal(A.utente(), null);
  assert.equal(A.statoCorrente(), null);
  const prove = [
    () => A.registrati(EMAIL, 'password-lunga'), () => A.accedi(EMAIL, 'password-lunga'), () => A.accediConGoogle('aste.html'),
    () => A.linkMagico(EMAIL, 'aste.html'), () => A.esci(), () => A.aggiorna(), () => A.abbonamento(), () => A.caricaDati(),
    () => A.salvaDati(), () => A.esportaDati(), () => A.cancellaAccount(), () => A.checkout('pro', 'mensile'), () => A.portale(),
    () => A.cambiaPassword('password-lunga')
  ];
  for (const p of prove) await assert.rejects(p(), { message: NON_CONFIGURATO, codice: 'non-configurato' });
  assert.equal(await A.avvia(), null);
  local.setItem('radaraste.v1.seguite', JSON.stringify([{ id: 'a1', note: 'x' }]));
  doc.dispatchEvent(new CustomEvent('radaraste:seguite'));
  assert.deepEqual(A.osserva(), []);
  assert.equal(A.pendenti(), false);
  assert.equal(local.getItem('radaraste.account.sync'), null, 'nessun registro scritto: il sito resta quello di sempre');
  assert.equal(chiamate.length, 0);
});

test('configurazione: indirizzo https obbligatorio (http solo in locale)', (t) => {
  const { A } = ambiente(t);
  assert.equal(A.configurato(), true);
  globalThis.ABBONAMENTI.supabase = { url: 'http://progetto-finto.supabase.co', chiaveAnonima: ANONIMA };
  assert.equal(A.configurato(), false);
  globalThis.ABBONAMENTI.supabase = { url: 'http://127.0.0.1:54321', chiaveAnonima: ANONIMA };
  assert.equal(A.configurato(), true);
  globalThis.ABBONAMENTI.supabase = { url: SUPABASE, chiaveAnonima: null };
  assert.equal(A.configurato(), false);
});

/* ---- Accesso e registrazione ---- */

test('accedi: POST a GoTrue con la chiave anonima, sessione salvata, evento e lettura dell\'abbonamento', async (t) => {
  const { A, local, eventi, chiamate } = ambiente(t, {
    rotte: [['POST', SUPABASE + '/auth/v1/token?grant_type=password', { json: { access_token: TOKEN, refresh_token: 'rinnovo-finto', expires_in: 3600, expires_at: ora() + 3600, token_type: 'bearer', user: UTENTE_GOTRUE } }],
      ['GET', SUPABASE + '/rest/v1/abbonamenti?', { json: [{ piano: 'pro', periodo: 'mensile', stato: 'trialing', fine_prova: '2026-11-01T00:00:00Z', fine_periodo: '2026-11-01T00:00:00Z', cancella_alla_fine: false, stripe_customer: 'cus_finto' }] }]]
  });
  const u = await A.accedi('  ' + EMAIL + ' ', 'segreta-lunga');
  assert.equal(u.id, UTENTE);
  assert.equal(u.email, EMAIL);
  const c = chiamate[0];
  assert.equal(c.url, SUPABASE + '/auth/v1/token?grant_type=password');
  assert.equal(c.metodo, 'POST');
  assert.equal(c.intestazioni.apikey, ANONIMA);
  assert.equal(c.intestazioni['Content-Type'], 'application/json');
  assert.deepEqual(c.corpo, { email: EMAIL, password: 'segreta-lunga' });
  const s = leggi(local, 'radaraste.account');
  assert.equal(s.access_token, TOKEN);
  assert.equal(s.refresh_token, 'rinnovo-finto');
  assert.ok(s.expires_at > ora());
  assert.equal(s.utente.id, UTENTE);
  assert.ok(eventi.includes('accesso'));
  await A.attendi();
  const ab = verso(chiamate, SUPABASE + '/rest/v1/abbonamenti?', 'GET');
  assert.equal(ab.length, 1);
  assert.equal(ab[0].intestazioni.Authorization, 'Bearer ' + TOKEN);
  assert.match(ab[0].url, new RegExp('utente=eq\\.' + UTENTE));
  const st = A.statoCorrente();
  assert.equal(st.utente.id, UTENTE);
  assert.deepEqual({ piano: st.abbonamento.piano, stato: st.abbonamento.stato, pagamenti: st.abbonamento.pagamenti }, { piano: 'pro', stato: 'trialing', pagamenti: true });
  assert.ok(!('stripe_customer' in st.abbonamento), 'l\'id del cliente Stripe non serve alla pagina');
  // dopo l'accesso i dati di questo browser vanno nell'account
  assert.equal(verso(chiamate, SUPABASE + '/rest/v1/dati_utente', 'GET').length, 1);
});

test('accedi: errori di GoTrue in italiano, nessuna sessione, controlli prima della rete', async (t) => {
  let risposta = { status: 400, json: { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' } };
  const { A, local, chiamate } = ambiente(t, { rotte: [['POST', SUPABASE + '/auth/v1/token?grant_type=password', () => risposta]] });
  await assert.rejects(A.accedi(EMAIL, 'sbagliata'), { message: 'Email o password non corretti.' });
  risposta = { status: 400, json: { error: 'invalid_grant', error_description: 'Invalid login credentials' } };   // formato vecchio
  await assert.rejects(A.accedi(EMAIL, 'sbagliata'), { message: 'Email o password non corretti.' });
  risposta = { status: 400, json: { error_code: 'email_not_confirmed', msg: 'Email not confirmed' } };
  await assert.rejects(A.accedi(EMAIL, 'giusta-lunga'), /confermare l'indirizzo email/);
  risposta = { status: 429, json: { msg: 'Too many requests' } };
  await assert.rejects(A.accedi(EMAIL, 'giusta-lunga'), /Troppi tentativi/);
  assert.equal(local.getItem('radaraste.account'), null);
  const prima = chiamate.length;
  await assert.rejects(A.accedi('non-una-email', 'x'), { message: 'Indirizzo email non valido.' });
  await assert.rejects(A.accedi(EMAIL, ''), /password/);
  assert.equal(chiamate.length, prima, 'nessuna richiesta con dati non validi');
});

test('registrati: POST /auth/v1/signup con ritorno ad accedi.html e consenso; con la conferma via email niente sessione', async (t) => {
  let risposta = { json: { id: UTENTE, email: 'nuovo@example.com', confirmation_sent_at: '2026-10-19T10:00:00Z' } };
  const { A, local, chiamate } = ambiente(t, { rotte: [['POST', SUPABASE + '/auth/v1/signup', () => risposta]] });
  const r = await A.registrati('nuovo@example.com', 'password-lunga', { consenso: true, dopo: 'aste.html' });
  assert.deepEqual(r, { accesso: false, confermaEmail: true, email: 'nuovo@example.com' });
  const c = chiamate[0];
  assert.equal(c.url, SUPABASE + '/auth/v1/signup?redirect_to=' + encodeURIComponent(SITO + '/accedi.html?dopo=aste.html'));
  assert.equal(c.intestazioni.apikey, ANONIMA);
  assert.equal(c.corpo.email, 'nuovo@example.com');
  assert.equal(c.corpo.password, 'password-lunga');
  assert.ok(!isNaN(Date.parse(c.corpo.data.consenso_termini)), 'data del consenso nei metadati');
  assert.equal(local.getItem('radaraste.account'), null);

  // conferma dell'email spenta nel progetto: si entra subito
  risposta = { json: { access_token: TOKEN, refresh_token: 'rinnovo-finto', expires_in: 3600, user: UTENTE_GOTRUE } };
  const r2 = await A.registrati(EMAIL, 'password-lunga', { consenso: true });
  assert.equal(r2.accesso, true);
  assert.equal(A.utente().id, UTENTE);
  await A.attendi();

  risposta = { status: 422, json: { error_code: 'user_already_exists', msg: 'User already registered' } };
  await assert.rejects(A.registrati(EMAIL, 'password-lunga'), /Esiste già un account/);
  const prima = chiamate.length;
  await assert.rejects(A.registrati(EMAIL, 'corta'), /almeno 8 caratteri/);
  assert.equal(chiamate.length, prima);
});

test('link via email e Google: indirizzi giusti, nessun account creato senza consenso, ritorno solo a pagine del sito', async (t) => {
  const { A, loc, chiamate } = ambiente(t, { rotte: [['POST', SUPABASE + '/auth/v1/otp', { json: {} }]] });
  assert.deepEqual(await A.linkMagico(EMAIL, 'scheda.html?id=a1'), { inviato: true, email: EMAIL });
  assert.equal(chiamate[0].url, SUPABASE + '/auth/v1/otp?redirect_to=' + encodeURIComponent(SITO + '/accedi.html?dopo=' + encodeURIComponent('scheda.html?id=a1')));
  assert.deepEqual(chiamate[0].corpo, { email: EMAIL, create_user: false });
  await A.linkMagico(EMAIL, null, { crea: true, consenso: true });
  assert.equal(chiamate[1].corpo.create_user, true);
  assert.ok(chiamate[1].corpo.data.consenso_termini);
  assert.equal(chiamate[1].url, SUPABASE + '/auth/v1/otp?redirect_to=' + encodeURIComponent(SITO + '/accedi.html'));

  const g = await A.accediConGoogle('mappa.html');
  assert.equal(loc.assegnato, SUPABASE + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(SITO + '/accedi.html?dopo=mappa.html'));
  assert.equal(g.url, loc.assegnato);
  assert.equal(chiamate.length, 2, 'Google: solo un cambio di pagina, nessuna richiesta');

  for (const p of ['https://altro.example/x.html', '//altro.example/x.html', 'javascript:alert(1)', 'accedi.html', '../segreto.html', 'aste.html"><script>', '']) {
    assert.equal(A.paginaSicura(p), 'account.html', p);
  }
  assert.equal(A.paginaSicura('scheda.html?id=a1'), 'scheda.html?id=a1');
  assert.equal(A.paginaSicura('prezzi.html#pro'), 'prezzi.html#pro');
});

/* ---- Rinnovo del token ---- */

test('rinnovo del token: prima della scadenza si rinnova una volta sola e la richiesta usa il token nuovo', async (t) => {
  const { A, local, chiamate } = ambiente(t, {
    rotte: [['POST', SUPABASE + '/auth/v1/token?grant_type=refresh_token', { json: { access_token: TOKEN2, refresh_token: 'rinnovo-nuovo', expires_in: 3600, user: UTENTE_GOTRUE } }]]
  });
  conSessione(local, { expires_at: ora() + 30, refresh_token: 'rinnovo-vecchio' });   // scade tra 30 secondi
  await Promise.all([A.abbonamento(), A.abbonamento(), A.aggiorna()]);
  const rinnovi = verso(chiamate, SUPABASE + '/auth/v1/token?grant_type=refresh_token');
  assert.equal(rinnovi.length, 1, 'un solo rinnovo anche con più richieste insieme');
  assert.deepEqual(rinnovi[0].corpo, { refresh_token: 'rinnovo-vecchio' });
  const ab = verso(chiamate, SUPABASE + '/rest/v1/abbonamenti?');
  assert.ok(ab.length >= 1);
  for (const c of ab) assert.equal(c.intestazioni.Authorization, 'Bearer ' + TOKEN2);
  const s = leggi(local, 'radaraste.account');
  assert.equal(s.access_token, TOKEN2);
  assert.equal(s.refresh_token, 'rinnovo-nuovo');
  assert.ok(s.expires_at > ora() + 3000);
  assert.equal(s.utente.id, UTENTE);
});

test('rinnovo: token rifiutato (401) → si rinnova e si riprova una volta; token di rinnovo scaduto → sessione chiusa', async (t) => {
  let rifiuta = true, rinnovo = { json: { access_token: TOKEN2, refresh_token: 'rinnovo-nuovo', expires_in: 3600 } };
  const { A, local, eventi, chiamate } = ambiente(t, {
    rotte: [['POST', SUPABASE + '/auth/v1/token?grant_type=refresh_token', () => rinnovo],
      ['GET', SUPABASE + '/rest/v1/abbonamenti?', (req) => (rifiuta && req.intestazioni.Authorization === 'Bearer ' + TOKEN ? { status: 401, json: { code: 'PGRST301' } } : { json: [] })]]
  });
  conSessione(local);
  const ab = await A.abbonamento();
  assert.equal(ab.piano, 'gratis');
  assert.deepEqual(verso(chiamate, SUPABASE + '/rest/v1/abbonamenti?').map((c) => c.intestazioni.Authorization), ['Bearer ' + TOKEN, 'Bearer ' + TOKEN2]);
  assert.equal(leggi(local, 'radaraste.account').utente.email, EMAIL, 'l\'utente resta anche se il rinnovo non lo riporta');

  rinnovo = { status: 400, json: { error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' } };
  await assert.rejects(A.aggiorna(), { codice: 'sessione-scaduta' });
  assert.equal(local.getItem('radaraste.account'), null);
  assert.equal(A.statoCorrente(), null);
  assert.ok(eventi.includes('scaduta'));
});

/* ---- Ritorno da email o Google ---- */

test('ritorno dal link o da Google: token letti dal frammento, verificati con GoTrue, indirizzo ripulito', async (t) => {
  const hash = '#access_token=' + TOKEN + '&expires_at=' + (ora() + 3600) + '&expires_in=3600&refresh_token=rinnovo-finto&token_type=bearer&type=magiclink';
  const { A, local, sess, storia, loc, eventi, chiamate } = ambiente(t, { hash, rotte: [['GET', SUPABASE + '/auth/v1/user', { json: UTENTE_GOTRUE }]] });
  const r = await A.avvia();
  assert.deepEqual(r, { tipo: 'magiclink', accesso: true });
  assert.deepEqual(A.ritorno(), r);
  assert.deepEqual(storia.chiamate, ['/accedi.html?dopo=aste.html'], 'i token non restano nell\'indirizzo');
  assert.equal(loc.hash, '');
  const u = chiamate.find((c) => c.url === SUPABASE + '/auth/v1/user');
  assert.equal(u.intestazioni.Authorization, 'Bearer ' + TOKEN);
  const s = leggi(local, 'radaraste.account');
  assert.equal(s.access_token, TOKEN);
  assert.equal(s.refresh_token, 'rinnovo-finto');
  assert.equal(s.utente.id, UTENTE);
  assert.equal(s.utente.creato, '2026-10-01T10:00:00Z');
  assert.ok(eventi.includes('accesso'));
  await A.attendi();
  assert.equal(sess.getItem('radaraste.account.caricati'), UTENTE, 'dati caricati una volta per sessione del browser');
});

test('ritorno con errore (link scaduto) o con token non validi: messaggio chiaro, nessuna sessione', async (t) => {
  const { A, local, storia, chiamate } = ambiente(t, { hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired' });
  const r = await A.avvia();
  assert.equal(r.errore, 'Il link è scaduto o è già stato usato: chiedine uno nuovo.');
  assert.equal(storia.chiamate.length, 1);
  assert.equal(local.getItem('radaraste.account'), null);
  assert.equal(chiamate.length, 0);
  // frammenti qualsiasi non toccano nulla
  assert.equal(A.leggiFrammento(''), null);
  assert.equal(A.leggiFrammento('#contenuto'), null);
  assert.equal(A.leggiFrammento('#access_token=solo-questo'), null);
  assert.deepEqual(A.leggiFrammento('#access_token=a.b.c&refresh_token=r&expires_in=60&type=signup'), { access_token: 'a.b.c', refresh_token: 'r', expires_at: null, expires_in: 60, tipo: 'signup' });
});

test('ritorno con un token che GoTrue rifiuta: niente accesso', async (t) => {
  const hash = '#access_token=' + TOKEN + '&expires_in=3600&refresh_token=rinnovo-finto&type=magiclink';
  const { A, local } = ambiente(t, { hash, rotte: [['GET', SUPABASE + '/auth/v1/user', { status: 401, json: { msg: 'invalid JWT' } }]] });
  const r = await A.avvia();
  assert.match(r.errore, /non è più valido/);
  assert.equal(local.getItem('radaraste.account'), null);
});

/* ---- Sincronizzazione dei dati ---- */

const T = (giorno) => '2026-10-' + String(giorno).padStart(2, '0') + 'T10:00:00.000Z';

test('unione dei dati: aste seguite unite per id con la nota più recente, nessuna voce locale persa', (t) => {
  const { A } = ambiente(t);
  const K = 'radaraste.v1.seguite';
  const locale = { [K]: { valore: [{ id: 'a', note: 'nota di qui', aggiunta: T(1) }, { id: 'b', note: 'solo qui', aggiunta: T(2) }], aggiornato: T(5), orari: { a: T(5) }, rimosse: {} } };
  const remoto = { [K]: { valore: [{ id: 'a', note: 'nota di là', aggiunta: T(1), copia: { titolo: 'Appartamento' } }, { id: 'c', note: 'solo di là', aggiunta: T(3) }], aggiornato: T(8), orari: { a: T(8) }, rimosse: {} } };
  let u = A.unisci(locale, remoto, T(19))[K];
  assert.deepEqual(u.valore.map((v) => v.id), ['a', 'b', 'c']);
  assert.equal(u.valore[0].note, 'nota di là', 'vince la nota modificata per ultima');
  assert.equal(u.orari.a, T(8));
  assert.equal(u.aggiornato, T(8));
  // al contrario: vince la nota di qui, ma i campi che mancano (la copia dell'asta) arrivano dall'altra versione
  remoto[K].orari.a = T(4);
  u = A.unisci(locale, remoto, T(19))[K];
  assert.equal(u.valore[0].note, 'nota di qui');
  assert.deepEqual(u.valore[0].copia, { titolo: 'Appartamento' });
  // a parità vince questo browser
  remoto[K].orari.a = T(5);
  assert.equal(A.unisci(locale, remoto, T(19))[K].valore[0].note, 'nota di qui');
  // stesse voci con le chiavi in un altro ordine (jsonb le riordina): nessun cambiamento
  const riordinate = { [K]: { valore: [{ aggiunta: T(2), note: 'solo qui', id: 'b' }], aggiornato: T(5) } };
  const v = A.unisci({ [K]: { valore: [{ id: 'b', note: 'solo qui', aggiunta: T(2) }], aggiornato: T(5) } }, riordinate, T(19))[K].valore;
  assert.equal(JSON.stringify(v), JSON.stringify([{ id: 'b', note: 'solo qui', aggiunta: T(2) }]));
});

test('unione dei dati: un\'asta tolta su un altro dispositivo sparisce solo se non è stata modificata dopo', (t) => {
  const { A } = ambiente(t);
  const K = 'radaraste.v1.seguite';
  const locale = (orari) => ({ [K]: { valore: [{ id: 'b', note: 'x', aggiunta: T(2) }, { id: 'd', aggiunta: T(2) }], aggiornato: T(5), orari, rimosse: {} } });
  const remoto = { [K]: { valore: [{ id: 'd', aggiunta: T(2) }], aggiornato: T(9), orari: {}, rimosse: { b: T(9) } } };
  let u = A.unisci(locale({}), remoto, T(19))[K];
  assert.deepEqual(u.valore.map((v) => v.id), ['d']);
  assert.equal(u.rimosse.b, T(9));
  u = A.unisci(locale({ b: T(12) }), remoto, T(19))[K];
  assert.deepEqual(u.valore.map((v) => v.id), ['b', 'd'], 'modificata qui dopo la rimozione: resta');
  // le rimozioni si dimenticano dopo 180 giorni
  u = A.unisci(locale({}), remoto, '2027-06-01T00:00:00Z')[K];
  assert.deepEqual(u.valore.map((v) => v.id), ['b', 'd']);
  assert.deepEqual(u.rimosse, {});
});

test('unione dei dati: preferenze, ricerche e Stratega → vince il dato più recente', (t) => {
  const { A } = ambiente(t);
  const P = 'radaraste.preferenze', R = 'radaraste.ricerche', S = 'radaraste.stratega';
  const u = A.unisci(
    { [P]: { valore: { zona: 'MI' }, aggiornato: T(3) }, [R]: { valore: [{ id: 'r1' }], aggiornato: null }, [S]: { valore: { capitale: 100000 }, aggiornato: T(9) } },
    { [P]: { valore: { zona: 'RM' }, aggiornato: T(7) }, [R]: { valore: [{ id: 'r2' }], aggiornato: T(1) }, 'radaraste.v1.aste': { valore: [{ id: 'm1', titolo: 'A mano', creata: T(2) }], aggiornato: T(2), orari: {}, rimosse: {} } },
    T(19));
  assert.deepEqual(u[P].valore, { zona: 'RM' });
  assert.deepEqual(u[R].valore, [{ id: 'r2' }], 'senza ora il dato di qui vale come il più vecchio');
  assert.deepEqual(u[S].valore, { capitale: 100000 }, 'solo qui: resta');
  assert.deepEqual(u['radaraste.v1.aste'].valore.map((a) => a.id), ['m1'], 'solo nell\'account: arriva');
  assert.deepEqual(A.unisci({ [P]: { valore: { zona: 'MI' }, aggiornato: T(5) } }, { [P]: { valore: { zona: 'RM' }, aggiornato: T(5) } }, T(19))[P].valore, { zona: 'MI' }, 'a parità vince questo browser');
});

test('caricaDati: unisce account e browser, aggiorna la pagina, salva l\'unione e conserva ciò che sostituisce', async (t) => {
  const K = 'radaraste.v1.seguite';
  const remota = {
    utente: UTENTE, aggiornato: T(10),
    dati: { versione: 1, aggiornato: T(10), chiavi: {
      [K]: { valore: [{ id: 'a', note: 'remota', aggiunta: T(1) }, { id: 'c', note: 'altrove', aggiunta: T(3) }], aggiornato: T(10), orari: { a: T(10) }, rimosse: {} },
      'radaraste.preferenze': { valore: { zona: 'RM' }, aggiornato: T(9) },
      'radaraste.futuro': { valore: 'chiave di una versione futura', aggiornato: T(9) }
    } }
  };
  const { A, local, doc, chiamate } = ambiente(t, { rotte: [['GET', SUPABASE + '/rest/v1/dati_utente?', { json: [remota] }]] });
  conSessione(local);
  local.setItem(K, JSON.stringify([{ id: 'a', note: 'locale', aggiunta: T(1) }, { id: 'b', note: 'solo qui', aggiunta: T(2) }]));
  local.setItem('radaraste.preferenze', JSON.stringify({ zona: 'MI' }));
  local.setItem('radaraste.stratega', JSON.stringify({ capitale: 150000 }));
  let seguiteAggiornate = 0;
  doc.addEventListener('radaraste:seguite', () => seguiteAggiornate++);

  const r = await A.caricaDati();
  assert.equal(r.caricato, true);
  assert.equal(r.salvato, true);
  const seguite = leggi(local, K);
  assert.deepEqual(seguite.map((s) => s.id), ['a', 'b', 'c']);
  assert.equal(seguite[0].note, 'remota');
  assert.equal(seguite[1].note, 'solo qui');
  assert.deepEqual(leggi(local, 'radaraste.preferenze'), { zona: 'RM' });
  assert.deepEqual(leggi(local, 'radaraste.stratega'), { capitale: 150000 });
  assert.equal(seguiteAggiornate, 1, 'le pagine si aggiornano come quando cambia il sito');
  // copia di sicurezza di quanto sostituito
  const prec = leggi(local, 'radaraste.account.precedenti');
  assert.equal(prec[K].valore[0].note, 'locale');
  assert.deepEqual(prec['radaraste.preferenze'].valore, { zona: 'MI' });
  // salvataggio dell'unione: upsert con il token dell'utente
  const post = verso(chiamate, SUPABASE + '/rest/v1/dati_utente?on_conflict=utente', 'POST');
  assert.equal(post.length, 1);
  assert.equal(post[0].intestazioni.Authorization, 'Bearer ' + TOKEN);
  assert.equal(post[0].intestazioni.apikey, ANONIMA);
  assert.match(post[0].intestazioni.Prefer, /resolution=merge-duplicates/);
  assert.equal(post[0].corpo.utente, UTENTE);
  const ch = post[0].corpo.dati.chiavi;
  assert.deepEqual(ch[K].valore.map((s) => s.id), ['a', 'b', 'c']);
  assert.deepEqual(ch['radaraste.stratega'].valore, { capitale: 150000 });
  assert.equal(ch['radaraste.futuro'].valore, 'chiave di una versione futura', 'le chiavi sconosciute restano');
  assert.equal(A.pendenti(), false);
  assert.ok(A.riepilogoDati().ultima);
  assert.equal(A.riepilogoDati().seguite, 3);

  // seconda volta, nulla di nuovo: nessun salvataggio
  const giaSalvato = { utente: UTENTE, aggiornato: T(19), dati: post[0].corpo.dati };
  globalThis.fetch = (orig => async (url, init) => (String(url).startsWith(SUPABASE + '/rest/v1/dati_utente?utente') ? new Response(JSON.stringify([giaSalvato]), { status: 200 }) : orig(url, init)))(globalThis.fetch);
  const r2 = await A.salvaDati();
  assert.equal(r2.salvato, false);
  assert.equal(verso(chiamate, SUPABASE + '/rest/v1/dati_utente?on_conflict=utente', 'POST').length, 1);
});

test('osserva: le modifiche e le aste tolte si annotano con l\'ora e poi si sincronizzano', async (t) => {
  const K = 'radaraste.v1.seguite';
  const { A, local, chiamate } = ambiente(t);
  conSessione(local);
  local.setItem(K, JSON.stringify([{ id: 'a', note: '' }, { id: 'b', note: '' }]));
  assert.deepEqual(A.osserva(T(1)), [], 'la prima volta solo una fotografia');
  local.setItem(K, JSON.stringify([{ id: 'a', note: 'cambiata' }]));
  assert.deepEqual(A.osserva(T(2)), [K]);
  const reg = leggi(local, 'radaraste.account.sync').chiavi[K];
  assert.equal(reg.orari.a, T(2));
  assert.equal(reg.rimosse.b, T(2));
  assert.equal(A.pendenti(), true);
  await A.salvaDati();
  const corpo = verso(chiamate, SUPABASE + '/rest/v1/dati_utente?on_conflict=utente', 'POST')[0].corpo;
  assert.deepEqual(corpo.dati.chiavi[K].valore, [{ id: 'a', note: 'cambiata' }]);
  assert.equal(corpo.dati.chiavi[K].rimosse.b, T(2), 'la rimozione arriva agli altri dispositivi');
  assert.equal(A.pendenti(), false);
});

test('salvataggio automatico: 2 secondi dopo una modifica delle aste seguite', async (t) => {
  const K = 'radaraste.v1.seguite';
  const { A, local, sess, doc, chiamate } = ambiente(t);
  conSessione(local);
  sess.setItem('radaraste.account.caricati', UTENTE);           // già caricati in questa sessione del browser
  local.setItem('radaraste.account.abbonamento', JSON.stringify({ utente: UTENTE, letto: new Date().toISOString(), dati: { piano: 'gratis' } }));
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await A.avvia();
  assert.equal(chiamate.length, 0);
  local.setItem(K, JSON.stringify([{ id: 'x1', note: 'nuova', aggiunta: new Date().toISOString() }]));
  doc.dispatchEvent(new CustomEvent('radaraste:seguite'));
  t.mock.timers.tick(1999);
  for (let i = 0; i < 5; i++) await attesa();
  assert.equal(chiamate.length, 0, 'si aspetta che le modifiche finiscano');
  // un'altra modifica fa ripartire l'attesa
  doc.dispatchEvent(new CustomEvent('radaraste:seguite'));
  t.mock.timers.tick(1999);
  for (let i = 0; i < 5; i++) await attesa();
  assert.equal(chiamate.length, 0);
  t.mock.timers.tick(1);
  for (let i = 0; i < 10; i++) await attesa();
  const post = verso(chiamate, SUPABASE + '/rest/v1/dati_utente?on_conflict=utente', 'POST');
  assert.equal(post.length, 1);
  assert.deepEqual(post[0].corpo.dati.chiavi[K].valore.map((s) => s.id), ['x1']);
});

test('salvataggio automatico: niente senza accesso', async (t) => {
  const { A, local, doc, chiamate } = ambiente(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await A.avvia();
  local.setItem('radaraste.v1.seguite', JSON.stringify([{ id: 'x1' }]));
  doc.dispatchEvent(new CustomEvent('radaraste:seguite'));
  t.mock.timers.tick(5000);
  for (let i = 0; i < 5; i++) await attesa();
  assert.equal(chiamate.length, 0);
  assert.equal(A.pendenti(), true, 'la modifica resta annotata per quando si accede');
});

/* ---- Dati personali, pagamenti, uscita ---- */

test('esportaDati: account, profilo, abbonamento, dati sincronizzati e del browser, senza token', async (t) => {
  const { A, local, chiamate } = ambiente(t, {
    rotte: [['GET', SUPABASE + '/rest/v1/profili?', { json: [{ id: UTENTE, email: EMAIL, creato: T(1) }] }],
      ['GET', SUPABASE + '/rest/v1/abbonamenti?', { json: [{ utente: UTENTE, piano: 'base', stato: 'active', periodo: 'annuale' }] }],
      ['GET', SUPABASE + '/rest/v1/dati_utente?', { json: [{ utente: UTENTE, dati: { versione: 1, chiavi: {} }, aggiornato: T(2) }] }]]
  });
  conSessione(local);
  local.setItem('radaraste.v1.seguite', JSON.stringify([{ id: 'a', note: 'mia nota' }]));
  const d = await A.esportaDati();
  assert.equal(d.app, 'Radar Aste Italia');
  assert.equal(d.modalita, 'test');
  assert.deepEqual(d.account, { id: UTENTE, email: EMAIL, creato: '2026-10-01T10:00:00Z', accessoCon: 'email' });
  assert.equal(d.profilo.email, EMAIL);
  assert.equal(d.abbonamento.piano, 'base');
  assert.equal(d.datiSincronizzati.dati.versione, 1);
  assert.deepEqual(d.datiDiQuestoBrowser['radaraste.v1.seguite'], [{ id: 'a', note: 'mia nota' }]);
  const testo = JSON.stringify(d);
  assert.ok(!testo.includes(TOKEN) && !testo.includes('rinnovo-finto'), 'nel file non finiscono i token');
  for (const c of chiamate) assert.equal(c.intestazioni.Authorization, 'Bearer ' + TOKEN);
  assert.equal(chiamate.length, 3);
});

test('checkout e portale: Bearer verso le funzioni del sito, scelta controllata, errori del server mostrati', async (t) => {
  let risposta = { json: { url: 'https://checkout.stripe.com/c/pay/cs_test_finto', prova: 14, modalita: 'test' } };
  const { A, local, chiamate } = ambiente(t, {
    rotte: [['POST', '/api/stripe/checkout', () => risposta], ['POST', '/api/stripe/portale', { json: { url: 'https://billing.stripe.com/p/session/test_finto' } }]]
  });
  await assert.rejects(A.checkout('pro', 'mensile'), { codice: 'non-autenticato' });
  conSessione(local);
  const d = await A.checkout('pro', 'annuale');
  assert.equal(d.url, 'https://checkout.stripe.com/c/pay/cs_test_finto');
  assert.equal(d.modalita, 'test');
  const c = chiamate[0];
  assert.equal(c.url, '/api/stripe/checkout');
  assert.equal(c.metodo, 'POST');
  assert.equal(c.intestazioni.Authorization, 'Bearer ' + TOKEN);
  assert.equal(c.intestazioni.apikey, undefined, 'alle funzioni del sito non serve la chiave di Supabase');
  assert.deepEqual(c.corpo, { piano: 'pro', periodo: 'annuale' });

  const prima = chiamate.length;
  await assert.rejects(A.checkout('gratis', 'mensile'), /Piano non valido/);
  await assert.rejects(A.checkout('pro', 'settimanale'), /Periodo non valido/);
  assert.equal(chiamate.length, prima);

  risposta = { status: 503, json: { errore: 'Abbonamenti non configurati (modalità test): il proprietario deve ancora collegare i servizi' } };
  await assert.rejects(A.checkout('base', 'mensile'), { message: /non configurati \(modalità test\)/, stato: 503 });
  risposta = { json: { url: 'http://non-sicuro.example' } };
  await assert.rejects(A.checkout('base', 'mensile'), /indirizzo valido/);

  const p = await A.portale();
  assert.equal(p.url, 'https://billing.stripe.com/p/session/test_finto');
  const cp = chiamate[chiamate.length - 1];
  assert.equal(cp.url, '/api/stripe/portale');
  assert.equal(cp.intestazioni.Authorization, 'Bearer ' + TOKEN);
});

test('cancellaAccount ed esci: sessione chiusa, i dati del sito restano nel browser', async (t) => {
  const { A, local, eventi, chiamate } = ambiente(t, {
    rotte: [['POST', '/api/account/cancella', { json: { cancellato: true, messaggio: 'Account cancellato: abbiamo eliminato i tuoi dati.' } }]]
  });
  conSessione(local);
  local.setItem('radaraste.v1.seguite', JSON.stringify([{ id: 'a' }]));
  A.osserva();
  const d = await A.cancellaAccount();
  assert.equal(d.cancellato, true);
  const c = chiamate.find((x) => x.url === '/api/account/cancella');
  assert.equal(c.intestazioni.Authorization, 'Bearer ' + TOKEN);
  assert.equal(A.sessione(), null);
  assert.equal(local.getItem('radaraste.account.sync'), null);
  assert.deepEqual(leggi(local, 'radaraste.v1.seguite'), [{ id: 'a' }]);
  assert.ok(eventi.includes('cancellato'));

  conSessione(local);
  assert.equal(await A.esci(), true);
  const out = chiamate.find((x) => x.url.startsWith(SUPABASE + '/auth/v1/logout'));
  assert.equal(out.url, SUPABASE + '/auth/v1/logout?scope=local');
  assert.equal(out.intestazioni.Authorization, 'Bearer ' + TOKEN);
  assert.equal(local.getItem('radaraste.account'), null);
  assert.ok(eventi.includes('uscita'));
  assert.deepEqual(leggi(local, 'radaraste.v1.seguite'), [{ id: 'a' }]);
  assert.equal(await A.esci(), false, 'già fuori');
});

test('js/piani.js legge lo stato dell\'account da Account.statoCorrente()', (t) => {
  const { A, local } = ambiente(t);
  conSessione(local);
  local.setItem('radaraste.account.abbonamento', JSON.stringify({ utente: UTENTE, letto: new Date().toISOString(), dati: { piano: 'pro', stato: 'active', finePeriodo: '2099-01-01T00:00:00Z' } }));
  globalThis.Account = A;
  t.after(() => { delete globalThis.Account; });
  delete require.cache[require.resolve('../js/piani.js')];
  const P = require('../js/piani.js');
  assert.equal(P.stato().utente.id, UTENTE);
  assert.equal(P.piano(), 'pro');
  // abbonamento letto per un altro utente: non vale
  local.setItem('radaraste.account.abbonamento', JSON.stringify({ utente: 'altro', dati: { piano: 'pro', stato: 'active' } }));
  assert.equal(P.piano(), 'gratis');
});

test('nessun segreto in js/account.js: solo la chiave anonima pubblica dalla configurazione', () => {
  const t = fs.readFileSync(path.join(__dirname, '..', 'js', 'account.js'), 'utf8');
  assert.doesNotMatch(t, /service_role|SERVICE_ROLE|sk_(live|test)_|whsec_|eyJ[A-Za-z0-9_-]{10,}/);
  assert.doesNotMatch(t, /https:\/\/[a-z0-9-]+\.supabase\.co/, 'nessun progetto Supabase scritto nel codice');
});

/* ---- Schema del database ---- */

test('supabase/schema.sql: RLS su tutte le tabelle, abbonamenti ed eventi_stripe non scrivibili dal browser', () => {
  const grezzo = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
  const sql = grezzo.split('\n').map((r) => r.replace(/--.*$/, '')).join('\n');
  const TABELLE = ['profili', 'abbonamenti', 'dati_utente', 'eventi_stripe'];
  for (const n of TABELLE) {
    assert.match(sql, new RegExp('create table if not exists public\\.' + n + '\\s*\\(', 'i'), n + ': tabella');
    assert.match(sql, new RegExp('alter table public\\.' + n + ' enable row level security', 'i'), n + ': RLS attiva');
  }
  // policy: tutte con il comando esplicito e precedute da "drop policy if exists" (idempotenza)
  const policy = [...sql.matchAll(/create policy\s+"([^"]+)"\s+on\s+(?:public\.)?(\w+)\s+(?:as\s+\w+\s+)?for\s+(\w+)/gi)].map((m) => ({ nome: m[1], tabella: m[2], comando: m[3].toLowerCase() }));
  assert.equal(policy.length, (sql.match(/create policy/gi) || []).length, 'ogni policy dichiara il comando');
  for (const p of policy) assert.ok(sql.includes('drop policy if exists "' + p.nome + '" on public.' + p.tabella), p.nome + ': drop prima di create');
  const di = (t) => policy.filter((p) => p.tabella === t).map((p) => p.comando).sort();
  assert.deepEqual(di('abbonamenti'), ['select'], 'abbonamenti: solo lettura');
  assert.deepEqual(di('eventi_stripe'), [], 'eventi_stripe: nessuna policy (solo service role)');
  assert.deepEqual(di('profili'), ['select']);
  assert.deepEqual(di('dati_utente'), ['insert', 'select', 'update']);
  for (const p of policy) assert.match(sql, new RegExp('create policy "' + p.nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^;]*auth\\.uid\\(\\)', 'i'), p.nome + ': legata all\'utente');
  // nessun permesso di scrittura concesso dal browser su abbonamenti ed eventi_stripe
  assert.doesNotMatch(sql, /grant[^;]*\b(insert|update|delete|all)\b[^;]*on\s+(table\s+)?public\.(abbonamenti|eventi_stripe)\b/i);
  assert.doesNotMatch(sql, /grant[^;]*on\s+(table\s+)?public\.eventi_stripe\b/i);
  // idempotenza e registrazione
  assert.doesNotMatch(sql, /create table (?!if not exists)/i);
  assert.doesNotMatch(sql, /create trigger(?![^;]*)/i);
  for (const tr of sql.matchAll(/create trigger\s+(\w+)\s+[^;]*?on\s+([\w.]+)/gi)) assert.ok(sql.includes('drop trigger if exists ' + tr[1] + ' on ' + tr[2]), tr[1]);
  assert.match(sql, /after insert on auth\.users/i);
  assert.match(sql, /insert into public\.abbonamenti \(utente, piano\) values \(new\.id, 'gratis'\)/i);
  assert.match(sql, /check \(piano in \('gratis', 'base', 'pro'\)\)/i);
  assert.match(sql, /security definer\s+set search_path = ''/i);
});
