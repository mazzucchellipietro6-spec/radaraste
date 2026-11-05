// Funzioni degli abbonamenti (Cloudflare Pages): Stripe, Supabase ed email con un fetch finto. Nessuna rete reale:
// ogni indirizzo che non è Stripe, Supabase o Resend finti fa fallire il test. Chiavi solo finte ed evidenti.
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// functions/ e servizi/ sono moduli ES (come li vuole Cloudflare) dentro un pacchetto "commonjs": qui li carichiamo
// come moduli ES senza toccare package.json
register('data:text/javascript,' + encodeURIComponent(`
import { readFile } from 'node:fs/promises';
export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && /\\/(functions|servizi)\\/[^?#]+\\.js$/.test(url)) {
    return { format: 'module', source: await readFile(new URL(url)), shortCircuit: true };
  }
  return nextLoad(url, context);
}`));

const R = await import('../servizi/risposte.js');
const S = await import('../servizi/stripe.js');
const SB = await import('../servizi/supabase.js');
const E = await import('../servizi/email.js');
const Checkout = await import('../functions/api/stripe/checkout.js');
const Portale = await import('../functions/api/stripe/portale.js');
const Webhook = await import('../functions/api/stripe/webhook.js');
const Cancella = await import('../functions/api/account/cancella.js');

// --- ambiente finto --------------------------------------------------------------------------------------------------

const SITO = 'https://radaraste.example';
const SEGRETO = 'whsec_test_finto';
const UTENTE = '11111111-2222-4333-8444-555555555555';
const ALTRO = '99999999-8888-4777-8666-555555555555';
const TOKEN = 'token.utente.finto.0123456789';
const ENV = Object.freeze({
  STRIPE_SECRET_KEY: 'sk_test_finto',
  STRIPE_WEBHOOK_SECRET: SEGRETO,
  STRIPE_PREZZO_BASE_MENSILE: 'price_base_m',
  STRIPE_PREZZO_BASE_ANNUALE: 'price_base_a',
  STRIPE_PREZZO_PRO_MENSILE: 'price_pro_m',
  STRIPE_PREZZO_PRO_ANNUALE: 'price_pro_a',
  SUPABASE_URL: 'https://progetto-finto.supabase.co',
  SUPABASE_ANON_KEY: 'anon_finta',
  SUPABASE_SERVICE_ROLE_KEY: 'service_role_finta',
  SITO_URL: SITO + '/'
});
const CON_EMAIL = Object.freeze({ ...ENV, RESEND_API_KEY: 're_finta_chiave_resend', EMAIL_MITTENTE: 'Radar Aste <avvisi@radaraste.example>' });
const SEGRETI = ['sk_test_finto', 'sk_live_finto', 'rk_live_finto', SEGRETO, 'anon_finta', 'service_role_finta', 're_finta_chiave_resend', TOKEN];

// tutto ciò che esce (risposte e registro) per il controllo finale "nessuna chiave negli output"
const uscite = [];
const registro = [];
console.log = (...a) => { registro.push(a.join(' ')); };

async function leggi(risposta) {
  const testo = await risposta.text();
  uscite.push(testo, JSON.stringify([...risposta.headers]));
  return { stato: risposta.status, corpo: testo ? JSON.parse(testo) : null, h: risposta.headers };
}

const nuovoAbb = (o = {}) => ({
  id: 'sub_test_1', object: 'subscription', customer: 'cus_test_1', status: 'trialing',
  metadata: { utente: UTENTE, piano: 'pro', periodo: 'mensile' },
  items: { data: [{ price: { id: 'price_pro_m', recurring: { interval: 'month' } }, current_period_end: 1793000000 }] },
  trial_end: 1792000000, cancel_at_period_end: false, cancel_at: null, ...o
});

// mondo finto: tabelle di Supabase, oggetti di Stripe, email di Resend; ogni chiamata viene registrata
function mondo() {
  const db = { abbonamenti: [], eventi_stripe: [], dati_utente: [{ utente: UTENTE, dati: {} }], profili: [{ id: UTENTE, email: 'mario@example.com' }] };
  const utenti = new Map([[UTENTE, { id: UTENTE, email: 'mario@example.com' }], [ALTRO, { id: ALTRO, email: 'anna@example.com' }]]);
  const token = new Map([[TOKEN, UTENTE]]);
  const stripe = { sessioni: [], portali: [], abbonamenti: new Map(), clienti: new Map([['cus_test_1', { id: 'cus_test_1', email: 'cliente@example.com' }]]), annullati: [], guasto: null };
  const chiamate = [], email = [];
  const risp = (stato, j) => new Response(j === undefined ? null : JSON.stringify(j), { status: stato, headers: { 'Content-Type': 'application/json' } });
  const filtra = (righe, q) => righe.filter((r) => [...q].every(([k, v]) => ['select', 'limit', 'on_conflict'].includes(k) || (v.startsWith('eq.') && String(r[k]) === v.slice(3))));

  globalThis.fetch = async (indirizzo, init = {}) => {
    const u = new URL(String(indirizzo));
    const metodo = init.method || 'GET';
    const h = new Headers(init.headers || {});
    const corpo = init.body == null ? '' : String(init.body);
    chiamate.push({ url: u.href, metodo, h, corpo });

    if (u.origin === 'https://api.stripe.com') {
      assert.equal(h.get('Authorization'), 'Bearer ' + (globalThis.chiaveAttesa || 'sk_test_finto'));
      if (metodo !== 'GET') assert.equal(h.get('Content-Type'), 'application/x-www-form-urlencoded');
      if (stripe.guasto) return risp(stripe.guasto, { error: { type: 'api_error', message: 'Errore con la chiave sk_test_finto' } });
      const p = u.pathname;
      if (metodo === 'POST' && p === '/v1/checkout/sessions') {
        const id = 'cs_test_' + (stripe.sessioni.length + 1);
        stripe.sessioni.push(new URLSearchParams(corpo));
        return risp(200, { id, url: 'https://checkout.stripe.com/c/pay/' + id });
      }
      if (metodo === 'POST' && p === '/v1/billing_portal/sessions') {
        stripe.portali.push(new URLSearchParams(corpo));
        return risp(200, { id: 'bps_test_1', url: 'https://billing.stripe.com/p/session/test_1' });
      }
      if (metodo === 'GET' && p === '/v1/subscriptions') {
        const cliente = u.searchParams.get('customer');
        return risp(200, { object: 'list', data: [...stripe.abbonamenti.values()].filter((s) => s.customer === cliente) });
      }
      if (metodo === 'GET' && p === '/v1/customers') {
        const indirizzo = u.searchParams.get('email');
        return risp(200, { object: 'list', data: [...stripe.clienti.values()].filter((c) => c.email === indirizzo) });
      }
      let m = /^\/v1\/subscriptions\/([^/]+)$/.exec(p);
      if (m) {
        const s = stripe.abbonamenti.get(decodeURIComponent(m[1]));
        if (!s) return risp(404, { error: { type: 'invalid_request_error', code: 'resource_missing', message: 'No such subscription (sk_test_finto)' } });
        if (metodo === 'DELETE') {
          s.status = 'canceled';
          stripe.annullati.push({ id: s.id, corpo: new URLSearchParams(corpo) });
        }
        return risp(200, s);
      }
      m = /^\/v1\/customers\/([^/]+)$/.exec(p);
      if (m) { const c = stripe.clienti.get(m[1]); return c ? risp(200, c) : risp(404, { error: { code: 'resource_missing' } }); }
      throw new Error('Stripe finto: chiamata non prevista ' + metodo + ' ' + p);
    }

    if (u.origin === 'https://progetto-finto.supabase.co') {
      const p = u.pathname;
      if (p === '/auth/v1/user') {
        assert.equal(h.get('apikey'), ENV.SUPABASE_ANON_KEY);
        const t = (h.get('Authorization') || '').replace(/^Bearer /, '');
        const id = token.get(t);
        return id && utenti.has(id) ? risp(200, { id, email: utenti.get(id).email, aud: 'authenticated' }) : risp(401, { msg: 'JWT non valido' });
      }
      let m = /^\/auth\/v1\/admin\/users\/([^/]+)$/.exec(p);
      if (m) {
        assert.equal(h.get('apikey'), globalThis.serviceAttesa || ENV.SUPABASE_SERVICE_ROLE_KEY);
        const id = m[1];
        if (!utenti.has(id)) return risp(404, { msg: 'User not found' });
        if (metodo === 'DELETE') { utenti.delete(id); return risp(200, {}); }
        return risp(200, utenti.get(id));
      }
      m = /^\/rest\/v1\/(\w+)$/.exec(p);
      if (m) {
        assert.equal(h.get('apikey'), ENV.SUPABASE_SERVICE_ROLE_KEY, 'le tabelle si toccano solo con la service role');
        const tabella = db[m[1]];
        assert.ok(tabella, 'tabella sconosciuta ' + m[1]);
        if (metodo === 'GET') return risp(200, filtra(tabella, u.searchParams));
        if (metodo === 'DELETE') { db[m[1]] = tabella.filter((r) => !filtra([r], u.searchParams).length); return risp(204); }
        if (metodo === 'POST') {
          const riga = JSON.parse(corpo);
          if (m[1] === 'eventi_stripe') {
            if (tabella.some((r) => r.id === riga.id)) return risp(409, { code: '23505', message: 'duplicate key' });
            tabella.push(riga);
            return risp(201);
          }
          if (m[1] === 'abbonamenti') {
            assert.equal(u.searchParams.get('on_conflict'), 'utente');
            assert.match(h.get('Prefer') || '', /resolution=merge-duplicates/);
            if (!utenti.has(riga.utente)) return risp(409, { code: '23503', message: 'foreign key violation' });
            const c = tabella.find((r) => r.utente === riga.utente);
            if (c) Object.assign(c, riga); else tabella.push({ cancella_alla_fine: false, ...riga });
            return risp(201);
          }
        }
      }
      throw new Error('Supabase finto: chiamata non prevista ' + metodo + ' ' + p);
    }

    if (u.href === 'https://api.resend.com/emails') {
      assert.equal(h.get('Authorization'), 'Bearer re_finta_chiave_resend');
      email.push(JSON.parse(corpo));
      return risp(200, { id: 'email_finta_' + email.length });
    }
    throw new Error('rete reale vietata nei test: ' + u.href);
  };
  return { db, utenti, stripe, chiamate, email, token };
}

const richiesta = (percorso, { metodo = 'POST', corpo, token = TOKEN, origine = SITO } = {}) => new Request(SITO + percorso, {
  method: metodo,
  headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(origine ? { Origin: origine } : {}), 'Content-Type': 'application/json' },
  body: corpo === undefined ? undefined : typeof corpo === 'string' ? corpo : JSON.stringify(corpo)
});
const checkout = (corpo, opz = {}, env = ENV) => Checkout.onRequestPost({ request: richiesta('/api/stripe/checkout', { corpo, ...opz }), env }).then(leggi);
const portale = (env = ENV, opz = {}) => Portale.onRequestPost({ request: richiesta('/api/stripe/portale', opz), env }).then(leggi);
const cancella = (env = ENV, opz = {}) => Cancella.onRequestPost({ request: richiesta('/api/account/cancella', opz), env }).then(leggi);

let numeroEvento = 0;
const evento = (tipo, oggetto, o = {}) => ({ id: 'evt_test_' + (++numeroEvento), object: 'event', type: tipo, livemode: false, created: 1791000000, data: { object: oggetto }, ...o });
async function webhook(ev, { env = ENV, intestazione, t, corpo } = {}) {
  const grezzo = corpo ?? JSON.stringify(ev);
  const firma = intestazione ?? await S.firma(JSON.stringify(ev), SEGRETO, t);
  const request = new Request(SITO + '/api/stripe/webhook', { method: 'POST', headers: { 'Stripe-Signature': firma, 'Content-Type': 'application/json' }, body: grezzo });
  return leggi(await Webhook.onRequestPost({ request, env }));
}
const stripeChiamate = (m) => m.chiamate.filter((c) => c.url.startsWith('https://api.stripe.com'));

// --- Stripe: corpo form, chiave, firma ------------------------------------------------------------------------------

test('corpo form di Stripe con chiavi annidate, liste e valori codificati', () => {
  const s = S.codificaForm({
    mode: 'subscription', line_items: [{ price: 'price_x', quantity: 1 }], metadata: { utente: 'u-1', piano: 'pro' },
    subscription_data: { trial_period_days: undefined, metadata: { utente: 'u-1' } }, customer: null,
    success_url: 'https://sito.example/account.html?pagamento=ok', allow_promotion_codes: true
  });
  assert.equal(s, 'mode=subscription&line_items[0][price]=price_x&line_items[0][quantity]=1&metadata[utente]=u-1&metadata[piano]=pro' +
    '&subscription_data[metadata][utente]=u-1&success_url=https%3A%2F%2Fsito.example%2Faccount.html%3Fpagamento%3Dok&allow_promotion_codes=true');
  assert.equal(S.codificaForm({}), '');
  assert.equal(new URLSearchParams(s).get('line_items[0][price]'), 'price_x');
});

test('chiave Stripe: mancante 503, reale rifiutata senza PAGAMENTI_REALI=si, solo sk_test_ di predefinito', () => {
  const prova = (env) => { try { return S.controllaChiave(env); } catch (e) { return e; } };
  const e1 = prova({});
  assert.ok(e1 instanceof R.ErroreApi); assert.equal(e1.stato, 503); assert.match(e1.message, /Abbonamenti non configurati/);
  for (const k of ['sk_live_finto', 'rk_live_finto', 'pk_live_finto']) {
    const e = prova({ STRIPE_SECRET_KEY: k });
    assert.equal(e.stato, 503, k); assert.match(e.message, /Pagamenti reali non abilitati/); assert.ok(!e.message.includes(k));
    assert.equal(prova({ STRIPE_SECRET_KEY: k, PAGAMENTI_REALI: 'SI' }).stato, 503, 'solo "si" esatto');
    assert.equal(prova({ STRIPE_SECRET_KEY: k, PAGAMENTI_REALI: 'true' }).stato, 503);
  }
  for (const k of ['pk_test_finto', 'rk_test_finto', 'chiave_a_caso']) assert.equal(prova({ STRIPE_SECRET_KEY: k }).stato, 503, k);
  assert.deepEqual(prova({ STRIPE_SECRET_KEY: 'sk_test_finto' }), { chiave: 'sk_test_finto', reale: false });
  assert.deepEqual(prova({ STRIPE_SECRET_KEY: 'sk_live_finto', PAGAMENTI_REALI: 'si' }), { chiave: 'sk_live_finto', reale: true });
  assert.equal(prova({ STRIPE_SECRET_KEY: 'pk_live_finto', PAGAMENTI_REALI: 'si' }).stato, 503, 'la chiave pubblicabile non è mai una chiave segreta');
  assert.ok(registro.some((r) => /chiave Stripe reale rifiutata/.test(r)));
});

test('firma del webhook: valida, più v1, segreto sbagliato, corpo manomesso, scaduta, malformata', async () => {
  const corpo = '{"id":"evt_1","type":"prova"}';
  const adesso = 1791000000;
  const buona = await S.firma(corpo, SEGRETO, adesso);
  assert.match(buona, /^t=1791000000,v1=[0-9a-f]{64}$/);
  assert.deepEqual(await S.verificaFirma(corpo, buona, SEGRETO, { adesso }), { valida: true, t: adesso });
  // più firme v1 (rotazione del segreto): basta che una corrisponda; v0 ignorata
  const altra = (await S.firma(corpo, 'whsec_test_vecchio', adesso)).split(',')[1];
  const multipla = 't=' + adesso + ',' + altra + ',v0=' + 'a'.repeat(64) + ',' + buona.split(',')[1];
  assert.equal((await S.verificaFirma(corpo, multipla, SEGRETO, { adesso })).valida, true);
  assert.equal((await S.verificaFirma(corpo, buona, 'whsec_test_sbagliato', { adesso })).valida, false);
  const manomesso = await S.verificaFirma(corpo.replace('prova', 'prova2'), buona, SEGRETO, { adesso });
  assert.deepEqual(manomesso, { valida: false, motivo: 'firma non corrispondente' });
  // la data è dentro la firma: cambiarla la rende non valida
  assert.equal((await S.verificaFirma(corpo, buona.replace('t=1791000000', 't=1791000100'), SEGRETO, { adesso })).valida, false);
  // tolleranza di 300 secondi, nei due sensi
  assert.equal((await S.verificaFirma(corpo, buona, SEGRETO, { adesso: adesso + 300 })).valida, true);
  assert.deepEqual(await S.verificaFirma(corpo, buona, SEGRETO, { adesso: adesso + 301 }), { valida: false, motivo: 'firma scaduta' });
  assert.equal((await S.verificaFirma(corpo, buona, SEGRETO, { adesso: adesso - 301 })).valida, false);
  for (const brutta of ['', null, 'v1=' + 'a'.repeat(64), 't=abc,v1=' + 'a'.repeat(64), 't=1791000000', 't=1791000000,v0=' + 'a'.repeat(64), 't=1791000000,v1=zz']) {
    assert.equal((await S.verificaFirma(corpo, brutta, SEGRETO, { adesso })).valida, false, String(brutta));
  }
  await assert.rejects(S.verificaFirma(corpo, buona, ''), (e) => e.stato === 503);
  assert.equal(S.ugualeCostante('abc', 'abc'), true);
  assert.equal(S.ugualeCostante('abc', 'abd'), false);
  assert.equal(S.ugualeCostante('abc', 'abcd'), false);
});

test('prezzi: piano e periodo dalle variabili d\'ambiente, prezzo mancante 503', () => {
  assert.equal(S.idPrezzo(ENV, 'pro', 'annuale'), 'price_pro_a');
  assert.deepEqual(S.pianoDaPrezzo(ENV, 'price_base_m'), { piano: 'base', periodo: 'mensile' });
  assert.equal(S.pianoDaPrezzo(ENV, 'price_altro'), null);
  assert.throws(() => S.idPrezzo({ ...ENV, STRIPE_PREZZO_PRO_ANNUALE: '' }, 'pro', 'annuale'), (e) => e.stato === 503);
  assert.throws(() => S.idPrezzo(ENV, 'gratis', 'mensile'), (e) => e.stato === 503);
});

test('mappatura degli stati: abbonamento Stripe → riga della tabella abbonamenti', () => {
  const r = S.rigaDaAbbonamento(ENV, nuovoAbb());
  assert.equal(r.piano, 'pro'); assert.equal(r.periodo, 'mensile'); assert.equal(r.stato, 'trialing');
  assert.equal(r.stripe_customer, 'cus_test_1'); assert.equal(r.stripe_subscription, 'sub_test_1');
  assert.equal(r.fine_prova, new Date(1792000000 * 1000).toISOString());
  assert.equal(r.fine_periodo, new Date(1793000000 * 1000).toISOString(), 'fine periodo dalla voce (API recenti)');
  assert.equal(r.cancella_alla_fine, false);
  assert.ok(!('utente' in r));
  // API più vecchie: fine periodo sull'abbonamento
  assert.equal(S.rigaDaAbbonamento(ENV, nuovoAbb({ current_period_end: 1794000000 })).fine_periodo, new Date(1794000000 * 1000).toISOString());
  for (const stato of ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']) assert.equal(S.rigaDaAbbonamento(ENV, nuovoAbb({ status: stato })).piano, 'pro', stato);
  for (const stato of ['canceled', 'incomplete_expired']) {
    const f = S.rigaDaAbbonamento(ENV, nuovoAbb({ status: stato }));
    assert.equal(f.piano, 'gratis', stato); assert.equal(f.stato, stato);
  }
  assert.equal(S.rigaDaAbbonamento(ENV, nuovoAbb({ status: 'stato_nuovo' })).stato, 'incomplete', 'stato sconosciuto: nessun accesso');
  assert.equal(S.rigaDaAbbonamento(ENV, nuovoAbb({ cancel_at_period_end: true })).cancella_alla_fine, true);
  assert.equal(S.rigaDaAbbonamento(ENV, nuovoAbb({ cancel_at: 1795000000 })).cancella_alla_fine, true);
  assert.equal(S.rigaDaAbbonamento(ENV, nuovoAbb({ trial_end: null })).fine_prova, null);
  // prezzo base annuale riconosciuto dalle variabili, anche se i metadati dicono altro
  const base = S.rigaDaAbbonamento(ENV, nuovoAbb({ status: 'active', items: { data: [{ price: { id: 'price_base_a', recurring: { interval: 'year' } } }] } }));
  assert.equal(base.piano, 'base'); assert.equal(base.periodo, 'annuale');
  // prezzo sconosciuto: si usano i metadati del checkout e l'intervallo
  const meta = S.rigaDaAbbonamento(ENV, nuovoAbb({ status: 'active', metadata: { utente: UTENTE, piano: 'base' }, items: { data: [{ price: { id: 'price_vecchio', recurring: { interval: 'year' } } }] } }));
  assert.equal(meta.piano, 'base'); assert.equal(meta.periodo, 'annuale');
  // prezzo sconosciuto e nessun metadato: errore (Stripe riprova, il proprietario lo vede), mai un piano inventato
  assert.throws(() => S.rigaDaAbbonamento(ENV, nuovoAbb({ status: 'active', metadata: {}, items: { data: [{ price: { id: 'price_x' } }] } })), (e) => e.stato === 500);
  assert.equal(S.utenteDaMetadati({ metadata: { utente: 'non-un-uuid' } }), null);
  assert.equal(S.haGiaAvuto(null), false);
  assert.equal(S.haGiaAvuto({ utente: UTENTE, stato: 'canceled', piano: 'gratis' }), true);
  assert.equal(S.haGiaAvuto({ utente: UTENTE, piano: 'gratis', stato: null, cancella_alla_fine: false }), false, 'riga creata alla registrazione');
});

// --- risposte, CORS -------------------------------------------------------------------------------------------------

test('risposte: JSON senza cache, CORS solo per il sito, preflight, registro ripulito', async () => {
  const pre = await Checkout.onRequestOptions({ request: richiesta('/api/stripe/checkout', { metodo: 'OPTIONS', token: null }), env: ENV });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), SITO);
  assert.match(pre.headers.get('Access-Control-Allow-Headers'), /Authorization/);
  const cattiva = await leggi(await Portale.onRequestOptions({ request: richiesta('/api/stripe/portale', { metodo: 'OPTIONS', origine: 'https://malintenzionato.example' }), env: ENV }));
  assert.equal(cattiva.stato, 403);
  assert.equal(cattiva.h.get('Access-Control-Allow-Origin'), null);
  assert.equal(R.sito({ SITO_URL: 'https://radaraste.example/' }), 'https://radaraste.example');
  assert.equal(R.sito({ SITO_URL: 'http://radaraste.example' }), null, 'solo https (o localhost)');
  assert.equal(R.sito({ SITO_URL: 'http://localhost:8788' }), 'http://localhost:8788');
  assert.equal(R.sito({}), null);
  const pulito = R.pulisci('chiavi sk_test_abc123 sk_live_x whsec_abc re_abcdefghij sb_secret_xyz eyJhbGciOi.eyJzdWIiOi.firma Bearer qualcosa');
  for (const s of ['sk_test_abc123', 'sk_live_x', 'whsec_abc', 're_abcdefghij', 'sb_secret_xyz', 'eyJhbGciOi', 'qualcosa']) assert.ok(!pulito.includes(s), s);
});

// --- checkout -------------------------------------------------------------------------------------------------------

test('checkout: senza configurazione 503 e nessuna chiamata di rete', async () => {
  const m = mondo();
  for (const env of [{}, { ...ENV, STRIPE_SECRET_KEY: '' }, { ...ENV, SUPABASE_SERVICE_ROLE_KEY: '' }, { ...ENV, SITO_URL: '' }, { ...ENV, STRIPE_PREZZO_PRO_MENSILE: '' }]) {
    const r = await checkout({ piano: 'pro', periodo: 'mensile' }, {}, env);
    assert.equal(r.stato, 503);
    assert.match(r.corpo.errore, /Abbonamenti non configurati/);
  }
  assert.equal(stripeChiamate(m).length, 0);
  m.chiamate.length = 0;
  const reale = await checkout({ piano: 'pro', periodo: 'mensile' }, {}, { ...ENV, STRIPE_SECRET_KEY: 'sk_live_finto' });
  assert.equal(reale.stato, 503);
  assert.match(reale.corpo.errore, /Pagamenti reali non abilitati/);
  assert.equal(m.chiamate.length, 0, 'con la chiave reale non parte nessuna chiamata');
});

test('checkout: accesso, origine e input validati', async () => {
  const m = mondo();
  assert.equal((await checkout({ piano: 'pro', periodo: 'mensile' }, { token: null })).stato, 401);
  const scaduto = await checkout({ piano: 'pro', periodo: 'mensile' }, { token: 'token.scaduto.0123456789abc' });
  assert.equal(scaduto.stato, 401); assert.match(scaduto.corpo.errore, /entra di nuovo/);
  const origine = await checkout({ piano: 'pro', periodo: 'mensile' }, { origine: 'https://malintenzionato.example' });
  assert.equal(origine.stato, 403);
  const n = m.chiamate.length;
  for (const [corpo, testo] of [['{non json', /Richiesta non valida/], ['[1,2]', /Richiesta non valida/], [{ piano: 'gratis', periodo: 'mensile' }, /Piano non valido/],
    [{ piano: 'oro', periodo: 'mensile' }, /Piano non valido/], [{ piano: 'pro', periodo: 'settimanale' }, /Periodo non valido/], [{}, /Piano non valido/],
    [{ piano: 'base', periodo: 'annuale', extra: 'x'.repeat(20000) }, /troppo grande/]]) {
    const r = await checkout(corpo);
    assert.ok([400, 413].includes(r.stato), JSON.stringify(r.corpo));
    assert.match(r.corpo.errore, testo);
  }
  assert.equal(stripeChiamate(m).length, 0, 'nessuna sessione con input non valido');
  assert.ok(m.chiamate.length > n, 'il token viene verificato con Supabase');
});

test('checkout Pro la prima volta: sessione completa con 14 giorni di prova', async () => {
  const m = mondo();
  const r = await checkout({ piano: 'pro', periodo: 'mensile' });
  assert.equal(r.stato, 200);
  assert.deepEqual(r.corpo, { url: 'https://checkout.stripe.com/c/pay/cs_test_1', prova: 14, modalita: 'test' });
  assert.equal(r.h.get('Access-Control-Allow-Origin'), SITO);
  const p = m.stripe.sessioni[0];
  assert.equal(p.get('mode'), 'subscription');
  assert.equal(p.get('line_items[0][price]'), 'price_pro_m');
  assert.equal(p.get('line_items[0][quantity]'), '1');
  assert.equal(p.get('client_reference_id'), UTENTE);
  assert.equal(p.get('customer_email'), 'mario@example.com');
  assert.equal(p.get('customer'), null);
  assert.equal(p.get('success_url'), SITO + '/account.html?pagamento=ok');
  assert.equal(p.get('cancel_url'), SITO + '/prezzi.html?pagamento=annullato');
  assert.equal(p.get('metadata[utente]'), UTENTE);
  assert.equal(p.get('metadata[piano]'), 'pro');
  assert.equal(p.get('subscription_data[metadata][utente]'), UTENTE);
  assert.equal(p.get('subscription_data[trial_period_days]'), '14');
  assert.equal(p.get('allow_promotion_codes'), 'true');
  assert.equal(p.get('locale'), 'it');
});

test('prova di 14 giorni solo per Pro e solo per chi non ha mai avuto un abbonamento', async () => {
  const m = mondo();
  await checkout({ piano: 'base', periodo: 'mensile' });
  assert.equal(m.stripe.sessioni[0].get('subscription_data[trial_period_days]'), null, 'Base: niente prova');
  assert.equal(m.stripe.sessioni[0].get('line_items[0][price]'), 'price_base_m');
  // ha già avuto un abbonamento (disdetto): niente prova, si riusa il cliente Stripe
  m.db.abbonamenti.push({ utente: UTENTE, stripe_customer: 'cus_test_1', stripe_subscription: 'sub_vecchio', piano: 'gratis', stato: 'canceled' });
  const r = await checkout({ piano: 'pro', periodo: 'annuale' });
  assert.equal(r.stato, 200); assert.equal(r.corpo.prova, 0);
  const p = m.stripe.sessioni[1];
  assert.equal(p.get('subscription_data[trial_period_days]'), null);
  assert.equal(p.get('line_items[0][price]'), 'price_pro_a');
  assert.equal(p.get('customer'), 'cus_test_1');
  assert.equal(p.get('customer_email'), null);
  // abbonamento ancora in corso: niente secondo checkout
  Object.assign(m.db.abbonamenti[0], { stato: 'active', piano: 'base' });
  const doppio = await checkout({ piano: 'pro', periodo: 'mensile' });
  assert.equal(doppio.stato, 409);
  assert.equal(m.stripe.sessioni.length, 2);
});

test('checkout con il webhook ancora in viaggio: niente secondo abbonamento né seconda prova', async () => {
  const m = mondo();
  // pagato pochi secondi fa: la tabella dice ancora "gratis", su Stripe l'abbonamento c'è già
  m.db.abbonamenti.push({ utente: UTENTE, piano: 'gratis', stato: null });
  m.stripe.clienti.set('cus_test_7', { id: 'cus_test_7', email: 'mario@example.com' });
  m.stripe.abbonamenti.set('sub_test_7', nuovoAbb({ id: 'sub_test_7', customer: 'cus_test_7', status: 'trialing' }));
  const doppio = await checkout({ piano: 'pro', periodo: 'mensile' });
  assert.equal(doppio.stato, 409);
  assert.equal(m.stripe.sessioni.length, 0, 'nessun secondo addebito');
  // finito (ma la tabella non lo sa): checkout permesso, senza prova, con lo stesso cliente Stripe
  m.stripe.abbonamenti.get('sub_test_7').status = 'canceled';
  const r = await checkout({ piano: 'pro', periodo: 'mensile' });
  assert.equal(r.stato, 200);
  assert.equal(r.corpo.prova, 0);
  assert.equal(m.stripe.sessioni[0].get('customer'), 'cus_test_7');
  assert.equal(m.stripe.sessioni[0].get('customer_email'), null);
  assert.equal(m.stripe.sessioni[0].get('subscription_data[trial_period_days]'), null);
  // abbonamento di un ALTRO utente su un cliente con la stessa email: non blocca e non toglie la prova
  const m2 = mondo();
  m2.stripe.clienti.set('cus_test_8', { id: 'cus_test_8', email: 'mario@example.com' });
  m2.stripe.abbonamenti.set('sub_test_8', nuovoAbb({ id: 'sub_test_8', customer: 'cus_test_8', status: 'active', metadata: { utente: ALTRO, piano: 'pro' } }));
  const r2 = await checkout({ piano: 'pro', periodo: 'mensile' });
  assert.equal(r2.stato, 200);
  assert.equal(r2.corpo.prova, 14);
  assert.equal(m2.stripe.sessioni[0].get('customer'), null);
});

test('checkout: errore di Stripe riportato senza il suo messaggio', async () => {
  const m = mondo();
  m.stripe.guasto = 400;
  const r = await checkout({ piano: 'pro', periodo: 'mensile' });
  assert.equal(r.stato, 502);
  assert.match(r.corpo.errore, /servizio di pagamento/);
  assert.ok(!JSON.stringify(r.corpo).includes('Errore con la chiave'));
  m.stripe.guasto = 401;
  assert.equal((await checkout({ piano: 'pro', periodo: 'mensile' })).stato, 503, 'chiave rifiutata da Stripe: non configurati');
});

// --- portale --------------------------------------------------------------------------------------------------------

test('portale clienti: 404 chiaro senza cliente Stripe, altrimenti sessione con ritorno all\'account', async () => {
  const m = mondo();
  const nessuno = await portale();
  assert.equal(nessuno.stato, 404);
  assert.match(nessuno.corpo.errore, /Nessun abbonamento da gestire/);
  m.db.abbonamenti.push({ utente: UTENTE, stripe_customer: 'cus_test_1', stripe_subscription: 'sub_test_1', piano: 'pro', stato: 'active' });
  const r = await portale();
  assert.equal(r.stato, 200);
  assert.equal(r.corpo.url, 'https://billing.stripe.com/p/session/test_1');
  assert.equal(m.stripe.portali[0].get('customer'), 'cus_test_1');
  assert.equal(m.stripe.portali[0].get('return_url'), SITO + '/account.html');
  assert.equal((await portale({ ...ENV, STRIPE_SECRET_KEY: undefined })).stato, 503);
  assert.equal((await portale(ENV, { token: null })).stato, 401);
});

// --- webhook --------------------------------------------------------------------------------------------------------

test('webhook: firma non valida, scaduta o manomessa → 400 senza toccare nulla', async () => {
  const m = mondo();
  const ev = evento('customer.subscription.updated', nuovoAbb());
  assert.equal((await webhook(ev, { intestazione: 't=1,v1=' + 'a'.repeat(64) })).stato, 400);
  assert.equal((await webhook(ev, { intestazione: '' })).stato, 400);
  assert.equal((await webhook(ev, { t: Math.floor(Date.now() / 1000) - 400 })).stato, 400, 'scaduta');
  const manomesso = await webhook(ev, { corpo: JSON.stringify({ ...ev, data: { object: nuovoAbb({ status: 'active', metadata: { utente: ALTRO, piano: 'pro' } }) } }) });
  assert.equal(manomesso.stato, 400);
  assert.equal(manomesso.corpo.errore, 'Firma non valida');
  assert.equal(m.chiamate.length, 0);
  assert.equal((await webhook(ev, { env: { ...ENV, STRIPE_WEBHOOK_SECRET: '' } })).stato, 503);
  assert.equal((await webhook(ev, { env: { ...ENV, STRIPE_SECRET_KEY: 'sk_live_finto' } })).stato, 503);
  const reale = await webhook(evento('customer.subscription.updated', nuovoAbb(), { livemode: true }));
  assert.equal(reale.stato, 400, 'evento reale con il sito in modalità test');
  assert.equal(m.chiamate.length, 0);
});

test('webhook: eventi sconosciuti → 200 ignorato, senza scritture', async () => {
  const m = mondo();
  const r = await webhook(evento('customer.created', { id: 'cus_test_9' }));
  assert.equal(r.stato, 200);
  assert.deepEqual(r.corpo, { ricevuto: true, ignorato: true });
  assert.equal(m.chiamate.length, 0);
  // nomi ereditati dagli oggetti JavaScript: ignorati come gli altri, non eseguiti
  for (const tipo of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    assert.deepEqual((await webhook(evento(tipo, {}))).corpo, { ricevuto: true, ignorato: true }, tipo);
  }
  assert.equal(m.chiamate.length, 0);
});

test('webhook checkout.session.completed: collega cliente e abbonamento all\'utente; email solo se configurata', async () => {
  const m = mondo();
  m.stripe.abbonamenti.set('sub_test_1', nuovoAbb());
  const sessione = { id: 'cs_test_1', object: 'checkout.session', mode: 'subscription', client_reference_id: UTENTE, customer: 'cus_test_1', subscription: 'sub_test_1', customer_details: { email: 'mario@example.com' }, metadata: { utente: UTENTE, piano: 'pro' } };
  const r = await webhook(evento('checkout.session.completed', sessione));
  assert.equal(r.stato, 200); assert.deepEqual(r.corpo, { ricevuto: true });
  const riga = m.db.abbonamenti[0];
  assert.equal(riga.utente, UTENTE);
  assert.equal(riga.stripe_customer, 'cus_test_1');
  assert.equal(riga.stripe_subscription, 'sub_test_1');
  assert.equal(riga.piano, 'pro'); assert.equal(riga.periodo, 'mensile'); assert.equal(riga.stato, 'trialing');
  assert.equal(riga.fine_prova, new Date(1792000000 * 1000).toISOString());
  assert.equal(m.db.eventi_stripe.length, 1);
  assert.equal(m.db.eventi_stripe[0].tipo, 'checkout.session.completed');
  assert.equal(m.email.length, 0, 'senza RESEND_API_KEY ed EMAIL_MITTENTE nessuna email');
  assert.ok(registro.some((x) => /email "benvenuto" a m\*\*\*@example\.com non inviata/.test(x)), 'registrata, con l\'indirizzo mascherato');

  // con Resend configurato: email di benvenuto con la data di fine prova
  const m2 = mondo();
  m2.stripe.abbonamenti.set('sub_test_1', nuovoAbb());
  assert.equal((await webhook(evento('checkout.session.completed', sessione), { env: CON_EMAIL })).stato, 200);
  assert.equal(m2.email.length, 1);
  const em = m2.email[0];
  assert.deepEqual(em.to, ['mario@example.com']);
  assert.equal(em.from, CON_EMAIL.EMAIL_MITTENTE);
  assert.match(em.subject, /Benvenuto in Radar Aste Italia Pro/);
  assert.match(em.text, /prova gratuita dura fino al \d{1,2} \w+ 2026/);
  assert.match(em.text, /Modalità test: nessun pagamento reale/);
  assert.match(em.html, /href="https:\/\/radaraste\.example\/account\.html"/);
  // sessione di un pagamento singolo (non abbonamento): ignorata
  const m3 = mondo();
  assert.equal((await webhook(evento('checkout.session.completed', { ...sessione, mode: 'payment' }))).stato, 200);
  assert.equal(m3.db.abbonamenti.length, 0);
});

test('webhook: idempotenza con eventi_stripe (lo stesso evento due volte si elabora una volta)', async () => {
  const m = mondo();
  m.stripe.abbonamenti.set('sub_test_1', nuovoAbb({ status: 'active' }));
  const ev = evento('customer.subscription.created', nuovoAbb());
  assert.deepEqual((await webhook(ev)).corpo, { ricevuto: true });
  const scritture = () => m.chiamate.filter((c) => c.metodo === 'POST' && c.url.includes('/rest/v1/abbonamenti')).length;
  assert.equal(scritture(), 1);
  const di_nuovo = await webhook(ev);
  assert.equal(di_nuovo.stato, 200);
  assert.deepEqual(di_nuovo.corpo, { ricevuto: true, duplicato: true });
  assert.equal(scritture(), 1, 'nessuna seconda scrittura');
  assert.equal(m.db.eventi_stripe.length, 1);
});

test('webhook: se l\'elaborazione fallisce l\'evento viene dimenticato e Stripe può riprovare', async () => {
  const m = mondo();
  m.stripe.abbonamenti.set('sub_test_1', nuovoAbb({ status: 'active' }));
  const ev = evento('customer.subscription.updated', nuovoAbb());
  m.stripe.guasto = 500;
  const r = await webhook(ev);
  assert.equal(r.stato, 502);
  assert.equal(m.db.eventi_stripe.length, 0, 'evento dimenticato');
  assert.equal(m.db.abbonamenti.length, 0);
  m.stripe.guasto = null;
  assert.deepEqual((await webhook(ev)).corpo, { ricevuto: true });
  assert.equal(m.db.abbonamenti[0].stato, 'active');
});

test('webhook customer.subscription.updated: stato aggiornato letto da Stripe (eventi in disordine)', async () => {
  const m = mondo();
  m.db.abbonamenti.push({ utente: UTENTE, stripe_customer: 'cus_test_1', stripe_subscription: 'sub_test_1', piano: 'pro', periodo: 'mensile', stato: 'trialing' });
  // su Stripe ora è Base annuale, attivo, con disdetta a fine periodo; l'evento (vecchio) dice ancora "trialing"
  m.stripe.abbonamenti.set('sub_test_1', nuovoAbb({ status: 'active', cancel_at_period_end: true, trial_end: null, metadata: {}, items: { data: [{ price: { id: 'price_base_a', recurring: { interval: 'year' } }, current_period_end: 1800000000 }] } }));
  const r = await webhook(evento('customer.subscription.updated', nuovoAbb({ metadata: {} })));
  assert.equal(r.stato, 200);
  const riga = m.db.abbonamenti[0];
  assert.deepEqual({ piano: riga.piano, periodo: riga.periodo, stato: riga.stato, cancella_alla_fine: riga.cancella_alla_fine, fine_prova: riga.fine_prova },
    { piano: 'base', periodo: 'annuale', stato: 'active', cancella_alla_fine: true, fine_prova: null });
  assert.equal(riga.fine_periodo, new Date(1800000000 * 1000).toISOString());
  assert.equal(m.db.abbonamenti.length, 1, 'utente trovato dalla tabella (senza metadati)');
  // un evento di un abbonamento precedente non sovrascrive quello in corso
  m.stripe.abbonamenti.set('sub_vecchio', nuovoAbb({ id: 'sub_vecchio', status: 'canceled' }));
  await webhook(evento('customer.subscription.updated', nuovoAbb({ id: 'sub_vecchio', status: 'canceled' })));
  assert.equal(m.db.abbonamenti[0].stato, 'active');
  assert.equal(m.db.abbonamenti[0].stripe_subscription, 'sub_test_1');
  // abbonamento di nessun utente del sito: ignorato senza errori
  const ignoto = await webhook(evento('customer.subscription.created', nuovoAbb({ id: 'sub_altro', customer: 'cus_altro', metadata: {} })));
  assert.equal(ignoto.stato, 200);
});

test('webhook customer.subscription.deleted: piano gratis, stato canceled, email di disdetta', async () => {
  const m = mondo();
  m.db.abbonamenti.push({ utente: UTENTE, stripe_customer: 'cus_test_1', stripe_subscription: 'sub_test_1', piano: 'pro', periodo: 'mensile', stato: 'active', cancella_alla_fine: true });
  const r = await webhook(evento('customer.subscription.deleted', nuovoAbb({ status: 'canceled' })), { env: CON_EMAIL });
  assert.equal(r.stato, 200);
  assert.equal(m.db.abbonamenti[0].piano, 'gratis');
  assert.equal(m.db.abbonamenti[0].stato, 'canceled');
  assert.equal(m.db.abbonamenti[0].cancella_alla_fine, false);
  assert.equal(m.email.length, 1);
  assert.deepEqual(m.email[0].to, ['mario@example.com'], 'email dell\'account (Supabase)');
  assert.match(m.email[0].subject, /abbonamento è terminato/);
  assert.match(m.email[0].text, /abbonamento Pro/);
  // annullato per la cancellazione dell'account: nessuna seconda email
  const m2 = mondo();
  await webhook(evento('customer.subscription.deleted', nuovoAbb({ status: 'canceled', cancellation_details: { comment: S.COMMENTO_CANCELLAZIONE } })), { env: CON_EMAIL });
  assert.equal(m2.email.length, 0);
  // evento tardivo per un utente già cancellato: 200, nessuna email
  const m3 = mondo();
  m3.utenti.delete(UTENTE);
  const tardivo = await webhook(evento('customer.subscription.deleted', nuovoAbb({ status: 'canceled' })), { env: CON_EMAIL });
  assert.equal(tardivo.stato, 200);
  assert.equal(m3.email.length, 0);
});

test('webhook: prova in scadenza e pagamento non riuscito mandano l\'email giusta', async () => {
  const m = mondo();
  m.db.abbonamenti.push({ utente: UTENTE, stripe_customer: 'cus_test_1', stripe_subscription: 'sub_test_1', piano: 'pro', stato: 'trialing' });
  assert.equal((await webhook(evento('customer.subscription.trial_will_end', nuovoAbb()), { env: CON_EMAIL })).stato, 200);
  assert.equal(m.email.length, 1);
  assert.match(m.email[0].subject, /prova gratuita sta per finire/);
  assert.match(m.email[0].text, /finisce il \d{1,2} \w+ 2026/);
  const fattura = { id: 'in_test_1', object: 'invoice', customer: 'cus_test_1', customer_email: 'cliente@example.com', hosted_invoice_url: 'https://invoice.stripe.com/i/finta', parent: { subscription_details: { subscription: 'sub_test_1' } } };
  assert.equal((await webhook(evento('invoice.payment_failed', fattura), { env: CON_EMAIL })).stato, 200);
  assert.equal(m.email.length, 2);
  assert.deepEqual(m.email[1].to, ['mario@example.com'], 'email dell\'account, non quella scritta sulla fattura');
  assert.match(m.email[1].subject, /Pagamento non riuscito/);
  assert.match(m.email[1].text, /https:\/\/invoice\.stripe\.com\/i\/finta/);
  assert.match(m.email[1].text, /abbonamento Pro/);
  assert.equal(m.db.abbonamenti[0].stato, 'trialing', 'lo stato arriva con customer.subscription.updated');
});

// --- email ----------------------------------------------------------------------------------------------------------

test('email: modelli in italiano, HTML con i testi protetti, nessun invio senza chiavi', async () => {
  for (const nome of Object.keys(E.MODELLI)) {
    const e = E.componi(nome, { sito: SITO, piano: 'base', fineProva: '2026-10-27T10:00:00Z' });
    assert.ok(e.oggetto.length > 10, nome);
    assert.ok(e.testo.includes('Radar Aste Italia'), nome);
    assert.match(e.html, /^<!doctype html><html lang="it">/, nome);
    assert.doesNotMatch(e.testo + e.html, /\bundefined\b|\bnull\b|\bNaN\b/, nome);
  }
  assert.deepEqual(Object.keys(E.MODELLI), ['benvenuto', 'provaInScadenza', 'pagamentoNonRiuscito', 'abbonamentoDisdetto', 'accountCancellato']);
  assert.match(E.componi('provaInScadenza', { fineProva: '2026-10-27T10:00:00Z' }).testo, /27 ottobre 2026/);
  const html = E.componi('pagamentoNonRiuscito', { sito: SITO, linkFattura: 'https://x.example/?a=<script>' }).html;
  assert.ok(!html.includes('<script>'));
  assert.equal(E.dataItaliana('non una data'), null);
  assert.throws(() => E.componi('sconosciuto'), /Modello di email sconosciuto/);

  const m = mondo();
  for (const env of [ENV, { ...ENV, RESEND_API_KEY: 're_finta_chiave_resend' }, { ...ENV, EMAIL_MITTENTE: 'avvisi@radaraste.example' }]) {
    assert.deepEqual(await E.inviaEmail(env, { a: 'mario@example.com', modello: 'benvenuto' }), { inviata: false, motivo: 'non configurata' });
  }
  assert.equal(m.chiamate.length, 0, 'nessuna chiamata a Resend senza le due variabili');
  assert.deepEqual(await E.inviaEmail(CON_EMAIL, { a: 'non-una-email', modello: 'benvenuto' }), { inviata: false, motivo: 'destinatario' });
  assert.deepEqual(await E.inviaEmail(CON_EMAIL, { a: 'mario@example.com', modello: 'nessuno' }), { inviata: false, motivo: 'modello' });
  assert.deepEqual(await E.inviaEmail(CON_EMAIL, { a: 'mario@example.com', modello: 'accountCancellato' }), { inviata: true });
  assert.equal(m.email[0].subject, 'Il tuo account è stato cancellato');
  // Resend giù: nessun errore lanciato
  globalThis.fetch = async () => { throw new TypeError('rete giù'); };
  assert.deepEqual(await E.inviaEmail(CON_EMAIL, { a: 'mario@example.com', modello: 'benvenuto' }), { inviata: false, motivo: 'rete' });
  globalThis.fetch = async () => new Response('{}', { status: 500 });
  assert.deepEqual(await E.inviaEmail(CON_EMAIL, { a: 'mario@example.com', modello: 'benvenuto' }), { inviata: false, motivo: 'servizio' });
});

// --- cancellazione dell'account -------------------------------------------------------------------------------------

test('cancellazione dell\'account: annulla gli abbonamenti attivi, cancella righe e utente, email di conferma', async () => {
  const m = mondo();
  m.db.abbonamenti.push({ utente: UTENTE, stripe_customer: 'cus_test_1', stripe_subscription: 'sub_test_1', piano: 'pro', stato: 'active' });
  m.stripe.abbonamenti.set('sub_test_1', nuovoAbb({ status: 'active' }));
  m.stripe.abbonamenti.set('sub_test_2', nuovoAbb({ id: 'sub_test_2', status: 'past_due' }));
  m.stripe.abbonamenti.set('sub_test_0', nuovoAbb({ id: 'sub_test_0', status: 'canceled' }));
  m.db.abbonamenti.push({ utente: ALTRO, piano: 'base', stato: 'active' });
  const r = await cancella(CON_EMAIL);
  assert.equal(r.stato, 200);
  assert.equal(r.corpo.cancellato, true);
  assert.equal(r.corpo.abbonamentiAnnullati, 2);
  assert.equal(r.corpo.emailInviata, true);
  assert.match(r.corpo.messaggio, /Account cancellato/);
  assert.deepEqual(m.stripe.annullati.map((a) => a.id), ['sub_test_1', 'sub_test_2']);
  assert.equal(m.stripe.annullati[0].corpo.get('cancellation_details[comment]'), S.COMMENTO_CANCELLAZIONE);
  assert.equal(m.db.dati_utente.length, 0);
  assert.equal(m.db.profili.length, 0);
  assert.deepEqual(m.db.abbonamenti.map((x) => x.utente), [ALTRO], 'le righe degli altri restano');
  assert.equal(m.utenti.has(UTENTE), false);
  assert.equal(m.utenti.has(ALTRO), true);
  assert.equal(m.email.length, 1);
  assert.deepEqual(m.email[0].to, ['mario@example.com']);
  // ordine: prima Stripe, poi le righe, poi l'utente
  const ordine = m.chiamate.map((c) => c.metodo + ' ' + new URL(c.url).pathname).filter((x) => /^DELETE/.test(x));
  assert.deepEqual(ordine, ['DELETE /v1/subscriptions/sub_test_1', 'DELETE /v1/subscriptions/sub_test_2', 'DELETE /rest/v1/dati_utente',
    'DELETE /rest/v1/abbonamenti', 'DELETE /rest/v1/profili', 'DELETE /auth/v1/admin/users/' + UTENTE]);
});

test('cancellazione dell\'account: senza Stripe se non c\'è mai stato un abbonamento; se Stripe non risponde l\'account resta', async () => {
  const m = mondo();
  const r = await cancella({ ...ENV, STRIPE_SECRET_KEY: undefined });
  assert.equal(r.stato, 200, 'gli account possono esistere anche prima dei pagamenti');
  assert.equal(r.corpo.abbonamentiAnnullati, 0);
  assert.equal(r.corpo.emailInviata, false);
  assert.equal(stripeChiamate(m).length, 0);
  assert.equal(m.utenti.has(UTENTE), false);

  const m2 = mondo();
  m2.db.abbonamenti.push({ utente: UTENTE, stripe_customer: 'cus_test_1', stripe_subscription: 'sub_test_1', piano: 'pro', stato: 'active' });
  m2.stripe.guasto = 500;
  const errore = await cancella();
  assert.equal(errore.stato, 502);
  assert.equal(m2.utenti.has(UTENTE), true, 'nessuna cancellazione con un abbonamento che potrebbe continuare');
  assert.equal(m2.db.dati_utente.length, 1);
  assert.equal((await cancella({ ...ENV, SUPABASE_URL: '' })).stato, 503);
  assert.equal((await cancella(ENV, { token: null })).stato, 401);
  assert.equal((await cancella(ENV, { origine: 'https://malintenzionato.example' })).stato, 403);
});

test('Supabase: chiavi nuove (sb_secret_) solo in apikey, vecchie (JWT) anche in Authorization', async () => {
  const m = mondo();
  await SB.emailUtente(ENV, UTENTE);
  assert.equal(m.chiamate[0].h.get('Authorization'), 'Bearer service_role_finta');
  globalThis.serviceAttesa = 'sb_secret_finta';
  try {
    assert.equal(await SB.emailUtente({ ...ENV, SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_finta' }, UTENTE), 'mario@example.com');
    assert.equal(m.chiamate[1].h.get('Authorization'), null);
  } finally { delete globalThis.serviceAttesa; }
  assert.equal(await SB.emailUtente(ENV, 'non-uuid'), null);
  assert.equal(m.chiamate.length, 2, 'un id non valido non arriva a Supabase');
});

// --- prove "cattive" della revisione -----------------------------------------------------------------------------------

test('nessun utente agisce su un altro: utente, cliente, email o indirizzi nel corpo vengono ignorati', async () => {
  const m = mondo();
  m.db.abbonamenti.push({ utente: ALTRO, stripe_customer: 'cus_altro', stripe_subscription: 'sub_altro', piano: 'pro', stato: 'active' });
  const r = await checkout({ piano: 'base', periodo: 'mensile', utente: ALTRO, customer: 'cus_altro', client_reference_id: ALTRO, email: 'anna@example.com', success_url: 'https://malintenzionato.example/' });
  assert.equal(r.stato, 200);
  const p = m.stripe.sessioni[0];
  assert.equal(p.get('client_reference_id'), UTENTE);
  assert.equal(p.get('metadata[utente]'), UTENTE);
  assert.equal(p.get('subscription_data[metadata][utente]'), UTENTE);
  assert.equal(p.get('customer'), null);
  assert.equal(p.get('customer_email'), 'mario@example.com');
  assert.equal(p.get('success_url'), SITO + '/account.html?pagamento=ok');
  // portale: il cliente Stripe viene solo dalla riga dell'utente del token
  const pr = await portale(ENV, { corpo: { customer: 'cus_altro', utente: ALTRO } });
  assert.equal(pr.stato, 404);
  assert.equal(m.stripe.portali.length, 0);
  // cancellazione: solo l'utente del token, qualunque cosa dica il corpo
  const c = await cancella(ENV, { corpo: { utente: ALTRO } });
  assert.equal(c.stato, 200);
  assert.equal(m.utenti.has(UTENTE), false);
  assert.equal(m.utenti.has(ALTRO), true);
  assert.deepEqual(m.stripe.annullati, [], 'l\'abbonamento dell\'altro resta');
  assert.deepEqual(m.db.abbonamenti.map((x) => x.utente), [ALTRO]);
});

test('cancellazione dell\'account: annulla anche l\'abbonamento il cui webhook non è ancora arrivato', async () => {
  const m = mondo();
  // riga creata alla registrazione: nella tabella nessuna traccia di Stripe (webhook in ritardo o non configurato)
  m.db.abbonamenti.push({ utente: UTENTE, piano: 'gratis', stato: null });
  m.stripe.clienti.set('cus_test_7', { id: 'cus_test_7', email: 'mario@example.com' });
  m.stripe.abbonamenti.set('sub_test_7', nuovoAbb({ id: 'sub_test_7', customer: 'cus_test_7', status: 'trialing' }));
  // stesso cliente: abbonamento di un altro utente e uno senza metadati del nostro checkout → non si toccano
  m.stripe.abbonamenti.set('sub_test_8', nuovoAbb({ id: 'sub_test_8', customer: 'cus_test_7', status: 'active', metadata: { utente: ALTRO, piano: 'base' } }));
  m.stripe.abbonamenti.set('sub_test_9', nuovoAbb({ id: 'sub_test_9', customer: 'cus_test_7', status: 'active', metadata: {} }));
  const r = await cancella();
  assert.equal(r.stato, 200);
  assert.equal(r.corpo.abbonamentiAnnullati, 1);
  assert.deepEqual(m.stripe.annullati.map((a) => a.id), ['sub_test_7']);
  assert.equal(m.stripe.annullati[0].corpo.get('cancellation_details[comment]'), S.COMMENTO_CANCELLAZIONE);
  assert.equal(m.utenti.has(UTENTE), false);
  const ricerca = stripeChiamate(m).find((c) => new URL(c.url).pathname === '/v1/customers');
  assert.equal(new URL(ricerca.url).searchParams.get('email'), 'mario@example.com');

  // Stripe configurato ma giù: l'account resta, si riprova (mai un abbonamento che addebita un account cancellato)
  const m2 = mondo();
  m2.stripe.guasto = 500;
  assert.equal((await cancella()).stato, 502);
  assert.equal(m2.utenti.has(UTENTE), true);
  assert.equal(m2.db.dati_utente.length, 1);

  // chiave reale senza PAGAMENTI_REALI e nessuna traccia di Stripe: nessun checkout era possibile, si cancella lo stesso
  const m3 = mondo();
  const reale = await cancella({ ...ENV, STRIPE_SECRET_KEY: 'sk_live_finto' });
  assert.equal(reale.stato, 200);
  assert.equal(stripeChiamate(m3).length, 0);
  assert.equal(m3.utenti.has(UTENTE), false);
});

test('webhook checkout.session.completed: utente solo dai metadati del nostro checkout, benvenuto solo se partito', async () => {
  const m = mondo();
  m.stripe.abbonamenti.set('sub_test_1', nuovoAbb({ status: 'active' }));
  const base = { id: 'cs_test_9', object: 'checkout.session', mode: 'subscription', customer: 'cus_test_1', subscription: 'sub_test_1' };
  // link di pagamento con client_reference_id scritto a mano nell'indirizzo, metadati assenti o diversi → ignorato
  for (const s of [{ ...base, client_reference_id: ALTRO }, { ...base, client_reference_id: ALTRO, metadata: { utente: UTENTE } },
    { ...base, client_reference_id: 'non-uuid', metadata: { utente: UTENTE } }, { ...base, metadata: { utente: 'non-uuid' } }]) {
    const r = await webhook(evento('checkout.session.completed', s), { env: CON_EMAIL });
    assert.equal(r.stato, 200);
  }
  assert.equal(m.db.abbonamenti.length, 0, 'nessun abbonamento attaccato all\'account di un altro');
  assert.equal(m.email.length, 0);
  assert.ok(registro.some((x) => /metadati assenti o diversi/.test(x)));
  // metadati del nostro checkout (con o senza client_reference_id uguale): valido
  assert.equal((await webhook(evento('checkout.session.completed', { ...base, metadata: { utente: UTENTE } }))).stato, 200);
  assert.equal(m.db.abbonamenti[0].utente, UTENTE);
  // pagamento non andato (incomplete): la riga si scrive, ma niente "il tuo abbonamento è attivo"
  const m2 = mondo();
  m2.stripe.abbonamenti.set('sub_test_1', nuovoAbb({ status: 'incomplete', trial_end: null }));
  await webhook(evento('checkout.session.completed', { ...base, client_reference_id: UTENTE.toUpperCase(), metadata: { utente: UTENTE } }), { env: CON_EMAIL });
  assert.equal(m2.db.abbonamenti[0].stato, 'incomplete');
  assert.equal(m2.email.length, 0);
});

test('webhook: email solo agli account del sito e mai fuorvianti; evento tardivo di un account cancellato segnalato', async () => {
  const m = mondo();
  // prova già disdetta: niente "il primo pagamento parte alla fine della prova"
  m.db.abbonamenti.push({ utente: UTENTE, stripe_customer: 'cus_test_1', stripe_subscription: 'sub_test_1', piano: 'pro', stato: 'trialing', cancella_alla_fine: true });
  assert.equal((await webhook(evento('customer.subscription.trial_will_end', nuovoAbb({ cancel_at_period_end: true })), { env: CON_EMAIL })).stato, 200);
  assert.equal(m.email.length, 0);
  // cliente che non è un nostro utente (altro sito sullo stesso account Stripe, o account già cancellato)
  const ignoto = '12345678-1234-4234-8234-123456789abc';
  m.stripe.clienti.set('cus_estraneo', { id: 'cus_estraneo', email: 'sconosciuto@example.com' });
  const estraneo = nuovoAbb({ id: 'sub_estraneo', customer: 'cus_estraneo', status: 'active', metadata: { utente: ignoto, piano: 'pro' } });
  assert.equal((await webhook(evento('customer.subscription.trial_will_end', { ...estraneo, status: 'trialing' }), { env: CON_EMAIL })).stato, 200);
  const fattura = { id: 'in_estranea', object: 'invoice', customer: 'cus_estraneo', customer_email: 'sconosciuto@example.com', hosted_invoice_url: 'https://invoice.stripe.com/i/x', parent: { subscription_details: { subscription: 'sub_estraneo' } } };
  assert.equal((await webhook(evento('invoice.payment_failed', fattura), { env: CON_EMAIL })).stato, 200);
  assert.equal(m.email.length, 0, 'nessuna email a chi non ha un account');
  assert.equal(stripeChiamate(m).length, 0, 'nessuna ricerca dell\'indirizzo presso Stripe');
  // evento tardivo per un account che non esiste più: 200, nessuna scrittura, avviso con l'abbonamento da controllare
  m.stripe.abbonamenti.set('sub_estraneo', estraneo);
  assert.equal((await webhook(evento('customer.subscription.updated', estraneo))).stato, 200);
  assert.ok(!m.db.abbonamenti.some((x) => x.utente === ignoto));
  assert.ok(registro.some((x) => /ATTENZIONE: abbonamento sub_estraneo ancora attivo/.test(x)));
  assert.equal(stripeChiamate(m).filter((c) => c.metodo !== 'GET').length, 0, 'il webhook non annulla nulla da solo');
});

test('webhook: firma sul corpo grezzo, firma riusata o di un altro endpoint rifiutata, segreto con spazi accettato', async () => {
  const m = mondo();
  m.stripe.abbonamenti.set('sub_test_1', nuovoAbb({ status: 'active' }));
  const ev = evento('customer.subscription.updated', nuovoAbb());
  assert.equal((await webhook(ev, { corpo: JSON.stringify(ev, null, 2) })).stato, 400, 'stesso JSON riformattato');
  const intestazione = await S.firma(JSON.stringify(ev), SEGRETO);
  assert.equal((await webhook(evento('customer.subscription.deleted', nuovoAbb()), { intestazione })).stato, 400, 'firma riusata su un altro evento');
  assert.equal((await webhook(ev, { intestazione: await S.firma(JSON.stringify(ev), 'whsec_test_altro') })).stato, 400);
  assert.equal((await webhook(ev, { intestazione: intestazione + ',v1=' + 'f'.repeat(64) })).stato, 200, 'una v1 valida tra più firme basta');
  assert.equal(m.chiamate.filter((c) => c.metodo !== 'GET').length > 0, true);
  const n = m.db.eventi_stripe.length;
  const ev2 = evento('customer.subscription.updated', nuovoAbb());
  assert.equal((await webhook(ev2, { env: { ...ENV, STRIPE_WEBHOOK_SECRET: '  ' + SEGRETO + '\n' } })).stato, 200, 'segreto incollato con spazi o a capo');
  assert.equal(m.db.eventi_stripe.length, n + 1);
});

test('nessuna chiave né token negli output (risposte, intestazioni, registro)', () => {
  assert.ok(uscite.length > 40, 'il controllo ha visto le risposte dei test');
  const tutto = uscite.join('\n') + '\n' + registro.join('\n');
  for (const s of SEGRETI) assert.ok(!tutto.includes(s), 'trovato ' + s.slice(0, 6) + '…');
  assert.ok(registro.length > 5);
  // indirizzi email solo mascherati nel registro
  for (const a of ['mario@example.com', 'anna@example.com', 'cliente@example.com', 'sconosciuto@example.com']) assert.ok(!registro.join('\n').includes(a), a);
});
