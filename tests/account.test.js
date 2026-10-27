// Account (js/account.js) e schema del database (supabase/schema.sql), in modalità test.
// Nessuna rete reale: fetch finto che fa fallire il test per ogni indirizzo non previsto. Solo valori finti evidenti.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const CFG = require('../config/abbonamenti.js');

const SUPABASE = 'https://progetto-finto.supabase.co';
const ANONIMA = 'chiave-anonima-finta';
const UTENTE = '11111111-2222-4333-8444-555555555555';
const EMAIL = 'prova@example.com';
const SITO = 'https://radaraste.example';
const NON_CONFIGURATO = 'Account non ancora attivo: configurazione mancante (modalità test)';
// impronta PKCE (S256) di un verificatore, come la calcola GoTrue
const sfida = (v) => createHash('sha256').update(v).digest('base64url');

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
  const loc = { origin: SITO, pathname: '/accedi.html', search: opz.search == null ? '?dopo=aste.html' : opz.search, hash: opz.hash || '', assegnato: null };
  loc.assign = (u) => { loc.assegnato = u; };
  globale('location', loc);
  const storia = { state: null, chiamate: [], replaceState(s, titolo, u) { storia.chiamate.push(u); const i = u.indexOf('#'), q = u.indexOf('?'); loc.hash = i >= 0 ? u.slice(i) : ''; loc.search = q >= 0 ? u.slice(q, i >= 0 ? i : undefined) : ''; } };
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
  // PKCE: a GoTrue va solo l'impronta; il verificatore resta in questo browser per il ritorno dall'email
  const attesa = leggi(local, 'radaraste.account').attesa;
  assert.equal(attesa.tipo, 'signup');
  assert.match(attesa.verificatore, /^[A-Za-z0-9_-]{43,128}$/);
  assert.equal(c.corpo.code_challenge_method, 's256');
  assert.equal(c.corpo.code_challenge, sfida(attesa.verificatore));
  assert.ok(!JSON.stringify(c).includes(attesa.verificatore), 'il verificatore non esce dal browser');
  assert.equal(A.sessione(), null, 'nessuna sessione prima della conferma');

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
  const { A, local, loc, chiamate } = ambiente(t, { rotte: [['POST', SUPABASE + '/auth/v1/otp', { json: {} }]] });
  const verificatore = () => leggi(local, 'radaraste.account').attesa.verificatore;
  assert.deepEqual(await A.linkMagico(EMAIL, 'scheda.html?id=a1'), { inviato: true, email: EMAIL });
  assert.equal(chiamate[0].url, SUPABASE + '/auth/v1/otp?redirect_to=' + encodeURIComponent(SITO + '/accedi.html?dopo=' + encodeURIComponent('scheda.html?id=a1')));
  assert.deepEqual(chiamate[0].corpo, { email: EMAIL, create_user: false, code_challenge: sfida(verificatore()), code_challenge_method: 's256' });
  assert.equal(leggi(local, 'radaraste.account').attesa.tipo, 'magiclink');
  const primo = verificatore();
  await A.linkMagico(EMAIL, null, { crea: true, consenso: true });
  assert.equal(chiamate[1].corpo.create_user, true);
  assert.ok(chiamate[1].corpo.data.consenso_termini);
  assert.equal(chiamate[1].url, SUPABASE + '/auth/v1/otp?redirect_to=' + encodeURIComponent(SITO + '/accedi.html'));
  assert.notEqual(verificatore(), primo, 'un verificatore nuovo a ogni richiesta');
  assert.equal(chiamate[1].corpo.code_challenge, sfida(verificatore()));

  const g = await A.accediConGoogle('mappa.html');
  assert.equal(loc.assegnato, SUPABASE + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(SITO + '/accedi.html?dopo=mappa.html') +
    '&code_challenge=' + sfida(verificatore()) + '&code_challenge_method=s256');
  assert.equal(leggi(local, 'radaraste.account').attesa.tipo, 'oauth');
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

/* ---- Ritorno da email o Google (PKCE) ---- */

const SESSIONE_GOTRUE = { access_token: TOKEN, refresh_token: 'rinnovo-finto', expires_in: 3600, token_type: 'bearer', user: UTENTE_GOTRUE };

test('ritorno dal link o da Google: il codice si scambia solo con il verificatore di questo browser, indirizzo ripulito', async (t) => {
  let verificatore = null;
  const { A, local, sess, storia, loc, eventi, chiamate } = ambiente(t, {
    rotte: [['POST', SUPABASE + '/auth/v1/otp', { json: {} }],
      ['POST', SUPABASE + '/auth/v1/token?grant_type=pkce', (req) => (req.corpo.auth_code === 'codice-finto' && req.corpo.code_verifier === verificatore ? { json: SESSIONE_GOTRUE } : { status: 400, json: { error_code: 'bad_code_verifier' } })]]
  });
  await A.linkMagico(EMAIL, 'aste.html');
  verificatore = leggi(local, 'radaraste.account').attesa.verificatore;
  // GoTrue riporta su accedi.html con ?code=... dopo i parametri di redirect_to
  loc.search = '?dopo=aste.html&code=codice-finto';
  const r = await A.avvia();
  assert.deepEqual(r, { tipo: 'magiclink', accesso: true });
  assert.deepEqual(A.ritorno(), r);
  assert.deepEqual(storia.chiamate, ['/accedi.html?dopo=aste.html'], 'il codice non resta nell\'indirizzo né nella cronologia');
  const scambio = chiamate.find((c) => c.url === SUPABASE + '/auth/v1/token?grant_type=pkce');
  assert.deepEqual(scambio.corpo, { auth_code: 'codice-finto', code_verifier: verificatore });
  assert.equal(scambio.intestazioni.apikey, ANONIMA);
  const s = leggi(local, 'radaraste.account');
  assert.equal(s.access_token, TOKEN);
  assert.equal(s.refresh_token, 'rinnovo-finto');
  assert.equal(s.utente.id, UTENTE);
  assert.equal(s.utente.creato, '2026-10-01T10:00:00Z');
  assert.equal(s.attesa, undefined, 'verificatore usato una volta sola');
  assert.ok(eventi.includes('accesso'));
  await A.attendi();
  assert.equal(sess.getItem('radaraste.account.caricati'), UTENTE, 'dati caricati una volta per sessione del browser');
});

test('ritorno dalla conferma della registrazione: tipo "signup", evento "registrazione"', async (t) => {
  const { A, local, loc, eventi } = ambiente(t, {
    rotte: [['POST', SUPABASE + '/auth/v1/signup', { json: { id: UTENTE, email: EMAIL } }], ['POST', SUPABASE + '/auth/v1/token?grant_type=pkce', { json: SESSIONE_GOTRUE }]]
  });
  await A.registrati(EMAIL, 'password-lunga', { consenso: true });
  assert.ok(leggi(local, 'radaraste.account').attesa);
  loc.search = '?code=codice-finto';
  assert.deepEqual(await A.avvia(), { tipo: 'signup', accesso: true });
  assert.ok(eventi.includes('registrazione'));
  await A.attendi();
});

test('sicurezza: token nell\'indirizzo (link di un altro, flusso vecchio) → nessun accesso, nessuna rete, indirizzo ripulito', async (t) => {
  // chi manda questo link vorrebbe farti entrare nel SUO account per ricevere i dati che hai in questo browser
  const hash = '#access_token=' + TOKEN + '&expires_in=3600&refresh_token=rinnovo-di-un-altro&token_type=bearer&type=magiclink';
  const { A, local, storia, chiamate } = ambiente(t, { hash });
  local.setItem('radaraste.v1.seguite', JSON.stringify([{ id: 'a', note: 'nota privata' }]));
  const r = await A.avvia();
  assert.match(r.errore, /link di accesso non è valido/);
  assert.equal(A.sessione(), null);
  assert.equal(local.getItem('radaraste.account'), null);
  assert.deepEqual(storia.chiamate, ['/accedi.html?dopo=aste.html'], 'i token non restano nell\'indirizzo');
  assert.equal(chiamate.length, 0, 'nessuna richiesta: né verifica del token né invio dei dati');
});

test('sicurezza: codice senza verificatore (link aperto altrove) o con il verificatore sbagliato → nessun accesso', async (t) => {
  let n = 0;
  const { A, local, loc, storia, chiamate } = ambiente(t, {
    search: '?dopo=aste.html&code=codice-di-un-altro',
    rotte: [['POST', SUPABASE + '/auth/v1/otp', { json: {} }], ['POST', SUPABASE + '/auth/v1/token?grant_type=pkce', () => (n++, { status: 400, json: { error_code: 'bad_code_verifier', msg: 'code challenge does not match' } })]]
  });
  // nessun accesso chiesto da questo browser: il codice da solo non basta e non parte nessuna richiesta
  let r = await A.avvia();
  assert.match(r.errore, /stesso browser in cui l'hai chiesto/);
  assert.match(r.errore, /email è già confermata/);
  assert.equal(chiamate.length, 0);
  assert.deepEqual(storia.chiamate, ['/accedi.html?dopo=aste.html']);

  // verificatore di una richiesta di questo browser, ma codice di un altro: GoTrue rifiuta lo scambio
  delete require.cache[require.resolve('../js/account.js')];
  const A2 = require('../js/account.js');
  await A2.linkMagico(EMAIL);
  loc.search = '?code=codice-di-un-altro';
  r = await A2.avvia();
  assert.equal(n, 1);
  assert.match(r.errore, /stesso browser/);
  assert.equal(A2.sessione(), null);
  assert.ok(leggi(local, 'radaraste.account').attesa, 'la richiesta vera di questo browser resta valida');

  // verificatore più vecchio di 24 ore: non vale più
  const s = leggi(local, 'radaraste.account');
  s.attesa.chiesto = new Date(Date.now() - 25 * 3600000).toISOString();
  local.setItem('radaraste.account', JSON.stringify(s));
  delete require.cache[require.resolve('../js/account.js')];
  const A3 = require('../js/account.js');
  loc.search = '?code=codice-finto';
  r = await A3.avvia();
  assert.match(r.errore, /stesso browser/);
  assert.equal(n, 1, 'nessuno scambio con un verificatore scaduto');
  assert.equal(local.getItem('radaraste.account'), null);
});

test('ritorno con errore (link scaduto) nell\'indirizzo o nel frammento: messaggio chiaro, nessuna sessione, indirizzo ripulito', async (t) => {
  const { A, local, storia, chiamate } = ambiente(t, { search: '?dopo=aste.html&error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired' });
  const r = await A.avvia();
  assert.equal(r.errore, 'Il link è scaduto o è già stato usato: chiedine uno nuovo.');
  assert.deepEqual(storia.chiamate, ['/accedi.html?dopo=aste.html']);
  assert.equal(local.getItem('radaraste.account'), null);
  assert.equal(chiamate.length, 0);
  assert.deepEqual(A.leggiRitorno('', '#error=access_denied&error_code=otp_expired'), { errore: 'otp_expired', descrizione: '' });
  // parametri qualsiasi non toccano nulla
  assert.equal(A.leggiRitorno('', ''), null);
  assert.equal(A.leggiRitorno('?dopo=aste.html', '#contenuto'), null);
  assert.deepEqual(A.leggiRitorno('?code=abc&dopo=x.html', ''), { codice: 'abc' });
  assert.deepEqual(A.leggiRitorno('', '#access_token=a.b.c&refresh_token=r'), { implicito: true });
  assert.equal(A.leggiRitorno('?__proto__=x', '#constructor=y'), null);
});

test('non configurato: un codice o dei token nell\'indirizzo si tolgono comunque, senza rete', async (t) => {
  const { A, storia, chiamate } = ambiente(t, { configurato: false, search: '?dopo=aste.html&code=codice-finto&anteprima=abbonamenti', hash: '#access_token=' + TOKEN + '&refresh_token=r' });
  assert.equal(await A.avvia(), null);
  assert.deepEqual(storia.chiamate, ['/accedi.html?dopo=aste.html&anteprima=abbonamenti']);
  assert.equal(chiamate.length, 0);
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
  const B = { id: 'b', note: 'x', aggiunta: T(2) };
  const locale = (orari, b = B) => ({ [K]: { valore: [b, { id: 'd', aggiunta: T(2) }], aggiornato: T(5), orari, rimosse: {} } });
  // registro di oggi: ora e impronta della versione tolta
  const remoto = { [K]: { valore: [{ id: 'd', aggiunta: T(2) }], aggiornato: T(9), orari: {}, rimosse: { b: { t: T(9), f: A.impronta(B) } } } };
  let u = A.unisci(locale({}), remoto, T(19))[K];
  assert.deepEqual(u.valore.map((v) => v.id), ['d']);
  assert.deepEqual(u.rimosse.b, { t: T(9), f: A.impronta(B) });
  u = A.unisci(locale({ b: T(12) }, { ...B, note: 'scritta qui' }), remoto, T(19))[K];
  assert.deepEqual(u.valore.map((v) => v.id), ['b', 'd'], 'modificata qui: resta');
  assert.deepEqual(u.rimosse, {}, 'ripresa: la rimozione si dimentica');
  // le rimozioni si dimenticano dopo 180 giorni
  u = A.unisci(locale({}), remoto, '2027-06-01T00:00:00Z')[K];
  assert.deepEqual(u.valore.map((v) => v.id), ['b', 'd']);
  assert.deepEqual(u.rimosse, {});
  // registri di prima (solo l'ora): tolta dopo l'ultima modifica → sparisce
  const vecchio = { [K]: { ...remoto[K], rimosse: { b: T(9) } } };
  assert.deepEqual(A.unisci(locale({}), vecchio, T(19))[K].valore.map((v) => v.id), ['d']);
  assert.deepEqual(A.unisci(locale({ b: T(12) }), vecchio, T(19))[K].valore.map((v) => v.id), ['b', 'd']);
});

test('orologi diversi: le aste tolte si confrontano per versione, non per ora (nessuna asta persa, nessuna che torna)', (t) => {
  const { A } = ambiente(t);
  const K = 'radaraste.v1.seguite';
  const B = { id: 'b', note: '', stato: 'da-valutare', aggiunta: T(2) };
  // 1. il telefono ha l'orologio un anno avanti e toglie b; qui (orologio giusto) b era stata seguita di nuovo, con una
  //    nota, dopo: con il confronto delle ore sparirebbe, con quello delle versioni resta
  const ripresa = { id: 'b', note: 'la rivoglio', stato: 'da-valutare', aggiunta: T(15) };
  let u = A.unisci({ [K]: { valore: [ripresa], aggiornato: T(15), orari: { b: T(15) }, rimosse: {} } },
    { [K]: { valore: [], aggiornato: '2027-10-10T10:00:00.000Z', orari: {}, rimosse: { b: { t: '2027-10-10T10:00:00.000Z', f: A.impronta(B) } } } }, T(19))[K];
  assert.deepEqual(u.valore, [ripresa]);
  assert.deepEqual(u.rimosse, {});
  // 2. una nota scritta su un altro dispositivo PRIMA (in ore) della rimozione, ma che chi ha tolto l'asta non aveva visto: resta
  const modificata = { ...B, note: 'nota importante' };
  u = A.unisci({ [K]: { valore: [], aggiornato: T(9), orari: {}, rimosse: { b: { t: T(9), f: A.impronta(B) } } } },
    { [K]: { valore: [modificata], aggiornato: T(8), orari: { b: T(8) }, rimosse: {} } }, T(19))[K];
  assert.deepEqual(u.valore, [modificata]);
  // 3. il dispositivo che toglie ha l'orologio indietro (ora della rimozione prima dell'ultima modifica): la versione è
  //    quella tolta, quindi sparisce lo stesso (con il confronto delle ore resterebbe per sempre)
  u = A.unisci({ [K]: { valore: [B], aggiornato: T(10), orari: { b: T(10) }, rimosse: {} } },
    { [K]: { valore: [], aggiornato: T(1), orari: {}, rimosse: { b: { t: T(1), f: A.impronta(B) } } } }, T(19))[K];
  assert.deepEqual(u.valore, []);
  // 4. la stessa versione con le chiavi in un altro ordine (jsonb le riordina) è la stessa versione
  const riordinata = { aggiunta: T(2), stato: 'da-valutare', note: '', id: 'b' };
  assert.equal(A.impronta(riordinata), A.impronta(B));
});

test('versioni che perdono: restano tra le copie di sicurezza, da tutte e due le parti', (t) => {
  const { A } = ambiente(t);
  const K = 'radaraste.v1.seguite', P = 'radaraste.preferenze';
  const perse = [];
  const u = A.unisci(
    { [K]: { valore: [{ id: 'a', note: 'di qui', aggiunta: T(1) }, { id: 'c', note: 'uguale', aggiunta: T(1) }], aggiornato: T(5), orari: { a: T(5) }, rimosse: {} }, [P]: { valore: { zona: 'MI' }, aggiornato: T(9) } },
    { [K]: { valore: [{ id: 'a', note: 'di là', aggiunta: T(1) }, { id: 'c', note: 'uguale', aggiunta: T(1) }], aggiornato: T(6), orari: { a: T(6) }, rimosse: {} }, [P]: { valore: { zona: 'RM' }, aggiornato: T(3) } },
    T(19), perse);
  assert.equal(u[K].valore[0].note, 'di là');
  assert.deepEqual(u[P].valore, { zona: 'MI' });
  assert.deepEqual(perse, [
    { chiave: K, id: 'a', valore: { id: 'a', note: 'di qui', aggiunta: T(1) }, da: 'browser' },
    { chiave: P, id: null, valore: { zona: 'RM' }, da: 'account' }
  ]);
  // una versione con meno campi, tutti uguali, non è persa
  const perse2 = [];
  A.unisci({ [K]: { valore: [{ id: 'a', note: 'n', aggiunta: T(1), copia: { titolo: 'Casa' } }], orari: { a: T(5) } } }, { [K]: { valore: [{ id: 'a', note: 'n', aggiunta: T(1) }], orari: { a: T(2) } } }, T(19), perse2);
  assert.deepEqual(perse2, []);
});

test('sicurezza: un id "__proto__" (file importato) non cambia i prototipi e l\'asta non si perde', (t) => {
  const { A, local } = ambiente(t);
  const K = 'radaraste.v1.seguite';
  const u = A.unisci(
    { [K]: { valore: JSON.parse('[{"id":"__proto__","note":"qui","aggiunta":"' + T(1) + '"}]'), orari: JSON.parse('{"__proto__":"' + T(2) + '"}'), rimosse: {} } },
    { [K]: { valore: JSON.parse('[{"id":"__proto__","note":"là","aggiunta":"' + T(1) + '"}]'), orari: JSON.parse('{"__proto__":"' + T(3) + '"}'), rimosse: {} } }, T(19))[K];
  assert.equal(({}).v, undefined, 'Object.prototype non toccato');
  assert.equal(({}).t, undefined);
  assert.equal(u.valore.length, 1);
  assert.equal(u.valore[0].note, 'là');
  assert.equal(JSON.parse(JSON.stringify(u.orari)).__proto__, T(3));
  // osserva: un'asta "__proto__" tolta finisce nel registro come le altre
  conSessione(local);
  local.setItem(K, '[{"id":"__proto__","note":""},{"id":"x"}]');
  A.osserva(T(4));
  local.setItem(K, '[{"id":"x"}]');
  A.osserva(T(5));
  const reg = JSON.parse(local.getItem('radaraste.account.sync')).chiavi[K];
  assert.deepEqual(Object.keys(reg.rimosse), ['__proto__']);
  assert.equal(reg.rimosse.__proto__.t, T(5));
  assert.equal(Object.getPrototypeOf(reg.rimosse), Object.prototype);
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
  assert.equal(prec.versione, 2);
  const voce = (chiave, id) => prec.voci.find((x) => x.chiave === chiave && x.id === id);
  assert.deepEqual(voce(K, 'a').valore, { id: 'a', note: 'locale', aggiunta: T(1) });
  assert.equal(voce(K, 'a').da, 'browser');
  assert.equal(voce(K, 'a').utente, UTENTE);
  assert.deepEqual(voce('radaraste.preferenze', null).valore, { zona: 'MI' });
  assert.equal(prec.voci.length, 2, 'solo ciò che è stato sostituito, non tutta la lista');
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
  assert.deepEqual(reg.rimosse.b, { t: T(2), f: A.impronta({ id: 'b', note: '' }) }, 'ora e versione tolta');
  assert.equal(A.pendenti(), true);
  await A.salvaDati();
  const corpo = verso(chiamate, SUPABASE + '/rest/v1/dati_utente?on_conflict=utente', 'POST')[0].corpo;
  assert.deepEqual(corpo.dati.chiavi[K].valore, [{ id: 'a', note: 'cambiata' }]);
  assert.deepEqual(corpo.dati.chiavi[K].rimosse.b, { t: T(2), f: A.impronta({ id: 'b', note: '' }) }, 'la rimozione arriva agli altri dispositivi');
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

test('privacy: i dati di un altro account in questo browser non entrano in un nuovo account senza conferma', async (t) => {
  const K = 'radaraste.v1.seguite';
  const ALTRO = '99999999-8888-4777-8666-555555555555';
  let remota = [];
  const { A, local, chiamate } = ambiente(t, { rotte: [['GET', SUPABASE + '/rest/v1/dati_utente?', () => ({ json: remota })]] });
  conSessione(local);
  local.setItem(K, JSON.stringify([{ id: 'a', note: 'nota di Anna' }, { id: 'b', note: '' }]));
  A.osserva(T(1));
  local.setItem(K, JSON.stringify([{ id: 'a', note: 'nota di Anna' }]));          // l'utente di prima toglie l'asta b
  A.osserva(T(2));
  await A.salvaDati();
  assert.ok(A.riepilogoDati().ultima);
  assert.equal(A.pendenti(), false);
  assert.equal(A.riepilogoDati().daConfermare, false);

  // entra un altro account (un'altra persona sullo stesso computer): niente rete e niente unione da soli
  conSessione(local, { utente: { id: ALTRO, email: 'altro@example.com' } });
  remota = [{ utente: ALTRO, aggiornato: T(1), dati: { versione: 1, chiavi: { [K]: { valore: [{ id: 'b', note: 'mia', aggiunta: T(1) }], aggiornato: T(1), orari: {}, rimosse: {} } } } }];
  const prima = chiamate.length;
  const r0 = await A.caricaDati();
  assert.equal(r0.daConfermare, true);
  assert.equal((await A.salvaDati()).daConfermare, true, 'neanche il salvataggio automatico');
  assert.equal(chiamate.length, prima, 'nessuna richiesta: la nota di Anna non va nell\'account dell\'altro');
  const rg = A.riepilogoDati();
  assert.equal(rg.daConfermare, true);
  assert.equal(rg.ultima, null, 'la data era dell\'altro account');
  assert.deepEqual(leggi(local, K), [{ id: 'a', note: 'nota di Anna' }], 'questo browser non cambia');
  // né nel file "Scarica i miei dati" dell'altro account
  globalThis.fetch = (orig => async (url, init) => (/\/rest\/v1\/(profili|abbonamenti)\?/.test(String(url)) ? new Response('[]', { status: 200 }) : orig(url, init)))(globalThis.fetch);
  const file = await A.esportaDati();
  assert.equal(file.datiDiQuestoBrowser, null);
  assert.match(file.notaBrowser, /collegati a un altro account/);
  assert.ok(!JSON.stringify(file).includes('nota di Anna'));

  // con la conferma si uniscono: si riparte senza le aste tolte dall'account di prima
  const r = await A.caricaDati({ unisci: true });
  assert.equal(r.salvato, true, 'i dati di questo browser vanno anche nel nuovo account');
  assert.deepEqual(leggi(local, K).map((s) => s.id), ['a', 'b'], 'l\'asta tolta dall\'altro account resta in questo');
  const post = verso(chiamate, SUPABASE + '/rest/v1/dati_utente?on_conflict=utente', 'POST');
  const ultimo = post[post.length - 1].corpo;
  assert.equal(ultimo.utente, ALTRO);
  assert.deepEqual(ultimo.dati.chiavi[K].rimosse, {});
  assert.equal(leggi(local, 'radaraste.account.sync').utente, ALTRO);
  assert.equal(A.riepilogoDati().daConfermare, false);
  assert.equal((await A.salvaDati()).daConfermare, undefined, 'da qui in poi si sincronizza da solo');

  // un browser collegato a un altro account ma senza dati: nessun rischio, nessuna domanda
  for (const k of A.CHIAVI) local.removeItem(k);
  conSessione(local, { utente: { id: UTENTE, email: EMAIL } });
  assert.equal(A.riepilogoDati().daConfermare, false);
  assert.notEqual((await A.caricaDati()).daConfermare, true);
});

test('le copie di sicurezza non si sovrascrivono a ogni sincronizzazione (le ultime 100) e vanno solo nel file del loro account', async (t) => {
  const K = 'radaraste.v1.seguite';
  let remota = [];
  const { A, local } = ambiente(t, {
    rotte: [['GET', SUPABASE + '/rest/v1/dati_utente?', () => ({ json: remota })],
      ['GET', SUPABASE + '/rest/v1/profili?', { json: [] }], ['GET', SUPABASE + '/rest/v1/abbonamenti?', { json: [] }]]
  });
  conSessione(local);
  const daAltrove = (note, giorno) => [{ utente: UTENTE, aggiornato: T(giorno), dati: { versione: 1, chiavi: { [K]: { valore: [{ id: 'a', note, aggiunta: T(1) }], aggiornato: T(giorno), orari: { a: T(giorno) }, rimosse: {} } } } }];
  // due sincronizzazioni, ognuna sostituisce la nota scritta qui: tutte e due restano
  local.setItem(K, JSON.stringify([{ id: 'a', note: 'prima nota di qui', aggiunta: T(1) }]));
  remota = daAltrove('dal telefono', 3);
  await A.caricaDati();
  local.setItem(K, JSON.stringify([{ id: 'a', note: 'seconda nota di qui', aggiunta: T(1) }]));
  A.osserva(T(4));
  remota = daAltrove('dal tablet', 5);
  await A.caricaDati();
  assert.equal(leggi(local, K)[0].note, 'dal tablet');
  const note = leggi(local, 'radaraste.account.precedenti').voci.map((x) => x.valore.note);
  assert.ok(note.includes('prima nota di qui') && note.includes('seconda nota di qui'), JSON.stringify(note));

  // una copia di un altro account usato in questo browser non finisce nel file di questo
  const p = leggi(local, 'radaraste.account.precedenti');
  p.voci.push({ chiave: K, id: 'z', valore: { id: 'z', note: 'di un\'altra persona' }, da: 'browser', sostituito: T(2), utente: '99999999-8888-4777-8666-555555555555' });
  local.setItem('radaraste.account.precedenti', JSON.stringify(p));
  const d = await A.esportaDati();
  assert.ok(d.copieDiSicurezza.length >= 2);
  assert.ok(d.copieDiSicurezza.every((x) => x.utente === UTENTE));
  assert.ok(!JSON.stringify(d).includes('di un\'altra persona'));

  // tetto: 120 note sostituite in una volta → restano le ultime 100
  const molte = Array.from({ length: 120 }, (_, i) => ({ id: 'm' + i, note: 'qui ' + i, aggiunta: T(1) }));
  local.setItem(K, JSON.stringify(molte));
  A.osserva(T(6));
  remota = [{ utente: UTENTE, aggiornato: T(7), dati: { versione: 1, chiavi: { [K]: { valore: molte.map((v) => ({ ...v, note: 'là ' + v.id })), aggiornato: T(7), orari: Object.fromEntries(molte.map((v) => [v.id, T(7)])), rimosse: {} } } } }];
  await A.caricaDati();
  const voci = leggi(local, 'radaraste.account.precedenti').voci;
  assert.equal(voci.length, A.MAX_COPIE);
  assert.equal(voci[voci.length - 1].valore.note, 'qui 119');
});

test('memoria piena: se le copie di sicurezza non si salvano, la sincronizzazione non cambia nulla', async (t) => {
  const K = 'radaraste.v1.seguite';
  const remota = [{ utente: UTENTE, aggiornato: T(5), dati: { versione: 1, chiavi: { [K]: { valore: [{ id: 'a', note: 'di là', aggiunta: T(1) }], aggiornato: T(5), orari: { a: T(5) }, rimosse: {} } } } }];
  const { A, local, chiamate } = ambiente(t, { rotte: [['GET', SUPABASE + '/rest/v1/dati_utente?', { json: remota }]] });
  conSessione(local);
  local.setItem(K, JSON.stringify([{ id: 'a', note: 'di qui', aggiunta: T(1) }]));
  const scrivi = local.setItem;
  local.setItem = (k, v) => { if (k === 'radaraste.account.precedenti') throw new Error('QuotaExceededError'); return scrivi(k, v); };
  await assert.rejects(A.caricaDati(), { codice: 'memoria', message: /memoria del browser è piena/ });
  assert.deepEqual(leggi(local, K), [{ id: 'a', note: 'di qui', aggiunta: T(1) }], 'la nota di qui resta');
  assert.equal(verso(chiamate, SUPABASE + '/rest/v1/dati_utente?on_conflict=utente', 'POST').length, 0, 'e non viene sovrascritta nell\'account');
});

test('dati troppo grandi per l\'account (vincolo dello schema): errore chiaro, i dati restano nel browser', async (t) => {
  const K = 'radaraste.v1.seguite';
  const { A, local } = ambiente(t, {
    rotte: [['POST', SUPABASE + '/rest/v1/dati_utente?on_conflict=utente', { status: 400, json: { code: '23514', message: 'new row for relation "dati_utente" violates check constraint "dati_utente_dimensione"' } }]]
  });
  conSessione(local);
  local.setItem(K, JSON.stringify([{ id: 'a', note: 'tanta roba' }]));
  await assert.rejects(A.salvaDati(), { codice: 'troppi-dati', message: /Troppi dati/ });
  assert.deepEqual(leggi(local, K), [{ id: 'a', note: 'tanta roba' }]);
  assert.equal(A.pendenti(), true, 'si riprova alla prossima modifica');
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
  assert.deepEqual(leggi(local, 'radaraste.v1.seguite'), [{ id: 'a' }]);
  assert.ok(eventi.includes('cancellato'));
  // i dati rimasti in questo browser restano legati all'account cancellato: un altro account non li prende da solo
  const reg = leggi(local, 'radaraste.account.sync');
  assert.equal(reg.utente, UTENTE);
  assert.equal(reg.ultima, undefined);
  assert.deepEqual(reg.sincronizzate, {});
  conSessione(local, { utente: { id: '99999999-8888-4777-8666-555555555555', email: 'altro@example.com' } });
  assert.equal(A.riepilogoDati().daConfermare, true);

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

test('uscita durante un rinnovo del token: la sessione non torna (nessun token salvato dopo l\'uscita)', async (t) => {
  let rilascia;
  const fermo = new Promise((ok) => { rilascia = ok; });
  const { A, local, chiamate } = ambiente(t, {
    rotte: [['POST', SUPABASE + '/auth/v1/token?grant_type=refresh_token', async () => { await fermo; return { json: { access_token: TOKEN2, refresh_token: 'rinnovo-nuovo', expires_in: 3600, user: UTENTE_GOTRUE } }; }]]
  });
  conSessione(local);
  const rinnovo = A.aggiorna();               // per esempio il rinnovo programmato, partito un attimo prima
  assert.equal(await A.esci(), true);
  assert.equal(local.getItem('radaraste.account'), null);
  rilascia();
  await assert.rejects(rinnovo, { codice: 'non-autenticato' });
  assert.equal(local.getItem('radaraste.account'), null, 'il token rinnovato non riapre la sessione');
  assert.equal(A.sessione(), null);
  assert.equal(verso(chiamate, SUPABASE + '/auth/v1/logout').length, 1);
});

test('uscita con il token scaduto: prima si rinnova, poi la sessione si chiude anche sul servizio', async (t) => {
  let logout401 = false;
  const { A, local, chiamate } = ambiente(t, {
    rotte: [['POST', SUPABASE + '/auth/v1/token?grant_type=refresh_token', { json: { access_token: TOKEN2, refresh_token: 'rinnovo-nuovo', expires_in: 3600, user: UTENTE_GOTRUE } }],
      ['POST', SUPABASE + '/auth/v1/logout', (req) => (logout401 && req.intestazioni.Authorization === 'Bearer ' + TOKEN ? { status: 401, json: { msg: 'invalid JWT' } } : { status: 204 })]]
  });
  conSessione(local, { expires_at: ora() - 10 });
  assert.equal(await A.esci(), true);
  const out = verso(chiamate, SUPABASE + '/auth/v1/logout');
  assert.equal(out.length, 1);
  assert.equal(out[0].intestazioni.Authorization, 'Bearer ' + TOKEN2, 'con il token rinnovato: il token di rinnovo viene revocato');
  assert.equal(local.getItem('radaraste.account'), null);

  // token che sembra valido ma il servizio rifiuta (401): si rinnova e si riprova
  logout401 = true;
  conSessione(local);
  assert.equal(await A.esci(), true);
  assert.deepEqual(verso(chiamate, SUPABASE + '/auth/v1/logout').slice(1).map((c) => c.intestazioni.Authorization), ['Bearer ' + TOKEN, 'Bearer ' + TOKEN2]);
  assert.equal(local.getItem('radaraste.account'), null);
});

test('orologio del dispositivo avanti: la scadenza si conta da expires_in, nessun rinnovo a ripetizione', async (t) => {
  const { A, local, chiamate } = ambiente(t, {
    // il servizio ha l'orologio due ore indietro rispetto al dispositivo: il suo expires_at sembra già passato
    rotte: [['POST', SUPABASE + '/auth/v1/token?grant_type=password', () => ({ json: { access_token: TOKEN, refresh_token: 'rinnovo-finto', expires_in: 3600, expires_at: ora() - 3600, user: UTENTE_GOTRUE } })],
      ['POST', SUPABASE + '/auth/v1/token?grant_type=refresh_token', () => ({ json: { access_token: TOKEN2, refresh_token: 'rinnovo-nuovo', expires_at: ora() - 3600, user: UTENTE_GOTRUE } })]]
  });
  await A.accedi(EMAIL, 'password-lunga');
  await A.attendi();
  const s = leggi(local, 'radaraste.account');
  assert.ok(Math.abs(s.expires_at - (ora() + 3600)) <= 2, 'un\'ora dal nostro orologio');
  await A.abbonamento();
  await A.abbonamento();
  assert.equal(verso(chiamate, SUPABASE + '/auth/v1/token?grant_type=refresh_token').length, 0, 'nessun rinnovo inutile');
  // senza expires_in e con un expires_at assurdo: un'ora (se scade prima il servizio risponde 401 e si rinnova)
  await A.aggiorna();
  assert.ok(Math.abs(leggi(local, 'radaraste.account').expires_at - (ora() + 3600)) <= 2);
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
  // ogni funzione: search_path fisso; quelle SECURITY DEFINER non eseguibili da chi usa il sito
  const funzioni = [...sql.matchAll(/create or replace function\s+(public\.\w+)\(\)([\s\S]*?)as \$\$/gi)];
  assert.ok(funzioni.length >= 3);
  for (const [, nome, corpo] of funzioni) {
    assert.match(corpo, /set search_path = ''/i, nome + ': search_path fisso');
    if (/security definer/i.test(corpo)) {
      assert.match(sql, new RegExp('revoke execute on function ' + nome.replace('.', '\\.') + '\\(\\) from public, anon, authenticated;', 'i'), nome + ': non eseguibile dal browser');
    }
  }
  // nessuna policy aperta a tutti, nessun permesso ai visitatori senza accesso
  assert.doesNotMatch(sql, /using\s*\(\s*true\s*\)|with check\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(sql, /\bto\s+anon\b|\bto\s+public\b/i);
  assert.doesNotMatch(sql, /grant[^;]*\bdelete\b/i, 'il browser non cancella righe: lo fa la funzione del sito');
  for (const n of TABELLE) assert.match(sql, new RegExp('revoke all on table public\\.' + n + ' from public, anon, authenticated;', 'i'), n);
});

/* ---- Pagine accedi.html e account.html ---- */

const pagina = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('pagine dell\'account: struttura comune, id unici, riferimenti aria esistenti, ogni campo con la sua etichetta', () => {
  for (const f of ['accedi.html', 'account.html']) {
    const h = pagina(f);
    assert.match(h, /^<!doctype html>\n<html lang="it">/, f);
    assert.match(h, /<title>[^<]{3,} – Radar Aste Italia<\/title>/, f);
    assert.ok(h.includes('<meta name="robots" content="noindex">'), f);
    assert.match(h, /<a class="salta" href="#contenuto">Salta al contenuto<\/a>/, f);
    assert.equal(h.match(/<main\b/g).length, 1, f);
    assert.equal(h.match(/<h1\b/g).length, 1, f);
    const id = [...h.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(id).size, id.length, f + ': id doppi');
    for (const [, rif] of h.matchAll(/aria-(?:labelledby|describedby)="([^"]+)"/g)) for (const r of rif.split(/\s+/)) assert.ok(id.includes(r), f + ': ' + r + ' non esiste');
    // ogni campo sta dentro la sua etichetta
    assert.doesNotMatch(h.replace(/<label\b[\s\S]*?<\/label>/g, ''), /<input\b/, f + ': campo senza etichetta');
    // messaggi letti dal lettore di schermo: zona di stato e zona di avviso sempre presenti (non nascoste)
    const p = f === 'accedi.html' ? 'acc' : 'ac';
    assert.ok(h.includes('<p class="sr-only" id="' + p + 'Annuncio" role="status" aria-live="polite" aria-atomic="true"></p>'), f);
    assert.ok(h.includes('<p class="sr-only" id="' + p + 'Avviso" role="alert" aria-atomic="true"></p>'), f);
    assert.match(h, new RegExp('<div class="callout acc-msg" id="' + p + 'Msg" tabindex="-1" hidden></div>'), f);
    // collegamenti a condizioni, privacy e cookie
    for (const l of ['termini.html', 'privacy.html', 'cookie.html']) assert.ok(h.includes('href="' + l + '"'), f + ': ' + l);
    assert.doesNotMatch(h, /Termini del servizio/, f + ': la pagina si chiama "Condizioni d\'uso e di abbonamento"');
    const ordine = ['js/ui.js', 'config/abbonamenti.js', 'js/account.js', 'js/piani.js', 'js/pages/' + f.replace('.html', '.js')].map((s) => h.indexOf('<script src="' + s + '"></script>'));
    for (const o of ordine) assert.ok(o > 0, f + ': script mancante');
    assert.deepEqual([...ordine].sort((a, b) => a - b), ordine, f + ': ordine degli script');
  }
});

test('accedi.html: moduli disattivati finché gli account non sono configurati, consenso non preselezionato', () => {
  const h = pagina('accedi.html');
  // senza JavaScript o senza configurazione non si può inviare nulla (e mai la password nell'indirizzo)
  for (const [id, h2] of [['fAccedi', 'h-accedi'], ['fRegistra', 'h-registra']]) {
    assert.match(h, new RegExp('<form id="' + id + '" class="acc-form" method="post" novalidate>\\s*<fieldset class="acc-campi" aria-labelledby="' + h2 + '" disabled>'), id);
  }
  assert.match(h, /<button class="btn ghost" type="button" id="accGoogle" aria-describedby="accNotaGoogle" disabled>/);
  assert.match(h, /<button class="btn ghost" type="button" id="accLink" aria-describedby="accNotaLink" disabled>/);
  assert.ok(h.includes('<strong>Account non ancora attivo (modalità test).</strong>'));
  // consenso: casella vuota e obbligatoria, con i collegamenti nella sua etichetta
  const casella = h.match(/<input type="checkbox" name="consenso"[^>]*>/)[0];
  assert.doesNotMatch(casella, /checked/);
  assert.match(casella, /required/);
  const etichetta = h.match(/<label class="check acc-consenso">([\s\S]*?)<\/label>/)[1];
  assert.ok(etichetta.includes('<a href="termini.html">Condizioni d\'uso e di abbonamento</a>') && etichetta.includes('<a href="privacy.html">Informativa sulla privacy</a>'));
  // i link di accesso vanno aperti nello stesso browser (PKCE)
  assert.match(h, /Aprilo in questo stesso browser/);
  // lo script accende i moduli solo con gli account configurati
  const js = pagina('js/pages/accedi.js');
  assert.match(js, /if \(!A \|\| !A\.configurato\(\)\) \{ \$\('#accSpento'\)\.hidden = false; accendi\(false\); return; \}\s*accendi\(true\);/);
  // errori di un campo: sotto il campo, come sua descrizione, con aria-invalid (in entrambe le pagine)
  for (const [f, p] of [['js/pages/accedi.js', 'acc'], ['js/pages/account.js', 'ac']]) {
    const s = pagina(f);
    assert.ok(s.includes("campo.setAttribute('aria-invalid', 'true');"), f);
    assert.ok(s.includes("e.id = '" + p + "ErroreCampo'") && s.includes("('" + p + "ErroreCampo ' +"), f);
    assert.ok(s.includes("el = $(errore ? '#" + p + "Avviso' : '#" + p + "Annuncio')"), f);
  }
});

test('account.html: dati di un altro account da confermare, uscita e cancellazione spiegate', () => {
  const h = pagina('account.html');
  assert.match(h, /<div class="callout warn acc-collega" id="acCollega" hidden>[\s\S]*?<button class="btn small" type="button" id="acUnisci">Unisci i dati di questo browser al mio account<\/button>/);
  assert.match(h, /<button class="btn danger" type="button" id="acCancella" aria-describedby="acCancellaNota">/);
  assert.match(h, /<button class="btn quiet" type="button" id="acEsci" aria-describedby="acEsciNota">/);
  assert.match(h, /id="acEsciNota">Uscendo, le aste seguite, le note e le preferenze restano salvate in questo browser/);
  assert.match(h, /le versioni sostituite \(le ultime 100\)/);
});

test('pagina dell\'account: con un pagamento non riuscito la data è quella di js/piani.js, testi protetti', () => {
  delete require.cache[require.resolve('../js/pages/account.js')];
  const Pagina = require('../js/pages/account.js');
  const P = require('../js/piani.js');
  const GIORNO = 86400000, adesso = new Date().toISOString();
  const giorno = (iso) => new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
  // Stripe ha già spostato finePeriodo alla fine del mese NON pagato: il piano resta fino a 7 giorni dopo la fine del
  // periodo pagato (finePeriodo - 28 + 7 giorni), non fino a finePeriodo + 7 giorni
  const ab = { piano: 'base', periodo: 'mensile', stato: 'past_due', finePeriodo: new Date(Date.now() + 25 * GIORNO).toISOString() };
  const giusta = P.fineRitardo(ab), sbagliata = new Date(Date.parse(ab.finePeriodo) + 7 * GIORNO).toISOString();
  assert.equal(P.piano({ abbonamento: ab }, adesso), 'base');
  const h = Pagina.descrivi(ab, adesso);
  assert.ok(h.includes('il piano Base resta attivo fino al ' + giorno(giusta) + ', poi torni al piano Gratis'), h);
  assert.ok(!h.includes(giorno(sbagliata)));
  // tolleranza finita: lo dice
  const scaduto = { ...ab, finePeriodo: new Date(Date.now() + 10 * GIORNO).toISOString() };
  assert.equal(P.piano({ abbonamento: scaduto }, adesso), 'gratis');
  assert.match(Pagina.descrivi(scaduto, adesso), /nel frattempo usi il piano Gratis/);
  // nessun HTML dai dati salvati nel browser
  assert.doesNotMatch(Pagina.descrivi({ piano: '<img src=x onerror=alert(1)>', stato: 'active', periodo: 'mensile' }, adesso), /<img/);
  assert.match(Pagina.descrivi({ piano: 'gratis', stato: null }, adesso), /Usi il piano Gratis/);
});
