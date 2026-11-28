// Piani e abbonamenti (modalità test): configurazione, piano dallo stato di Stripe, blocchi e anteprima.
// Nessuna rete e nessuna chiave vera: solo valori finti evidenti.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CFG = require('../config/abbonamenti.js');
const P = require('../js/piani.js');

const ADESSO = '2026-10-13T12:00:00Z';
const GIORNO = 86400000;
const tra = (giorni) => new Date(Date.parse(ADESSO) + giorni * GIORNO).toISOString();
const SUPABASE_FINTO = { url: 'https://progetto-finto.supabase.co', chiaveAnonima: 'chiave-anonima-finta' };

// configurazione modificata per un test (globalThis.ABBONAMENTI ha la precedenza sul file)
function conConfig(modifiche, fn) {
  globalThis.ABBONAMENTI = Object.assign(structuredClone(CFG), modifiche);
  try { return fn(); } finally { delete globalThis.ABBONAMENTI; }
}
const attivi = (fn) => conConfig({ attivi: true, supabase: SUPABASE_FINTO }, fn);

// globali del browser finti (location, sessionStorage, Account)
function globale(nome, valore) {
  Object.defineProperty(globalThis, nome, { value: valore, configurable: true, writable: true });
}
function togli(nome) { try { delete globalThis[nome]; } catch { /* niente */ } }
function memoriaFinta() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}
function inAnteprima(fn) {
  const mem = memoriaFinta();
  globale('sessionStorage', mem);
  globale('location', { search: '?anteprima=abbonamenti', pathname: '/affari.html' });
  try { return fn(mem); } finally { togli('location'); togli('sessionStorage'); }
}
const ab = (piano, stato, extra) => ({ utente: { id: 'utente-finto', email: 'prova@example.com' }, abbonamento: Object.assign({ piano, periodo: 'mensile', stato, fineProva: null, finePeriodo: tra(20), cancellaAllaFine: false }, extra) });

test('configurazione: forma del contratto, spenta, in modalità test, senza chiavi', () => {
  assert.equal(CFG.attivi, false);
  assert.equal(CFG.modalita, 'test');
  assert.equal(CFG.valuta, 'EUR');
  assert.equal(CFG.ivaInclusa, true);
  assert.deepEqual(CFG.prova, { giorni: 14, piano: 'pro' });
  assert.deepEqual(CFG.piani.map((p) => p.id), ['gratis', 'base', 'pro']);
  assert.deepEqual(CFG.piani.map((p) => p.nome), ['Gratis', 'Base', 'Pro']);
  assert.deepEqual(CFG.piani.map((p) => p.prezzi), [{ mensile: 0, annuale: 0 }, { mensile: 9, annuale: 90 }, { mensile: 24, annuale: 240 }]);
  assert.deepEqual(CFG.piani.filter((p) => p.consigliato).map((p) => p.id), ['pro']);
  for (const p of CFG.piani) {
    assert.ok(typeof p.sottotitolo === 'string' && p.sottotitolo.length > 5, p.id);
    assert.ok(p.vantaggi.length >= 4, p.id);
    for (const v of p.vantaggi) assert.ok(typeof v === 'string' && v.trim().length > 5 && !/[<>]/.test(v), p.id + ': ' + v);
  }
  assert.deepEqual(CFG.funzioni, {
    'affari-tutti': 'base', 'selezione-personale': 'base', 'combinazioni-tutte': 'base', 'seguite-illimitate': 'base', 'report-pdf': 'base', 'avvisi': 'base',
    'stratega': 'pro', 'consulente-ai': 'pro', 'statistiche-avanzate': 'pro'
  });
  assert.deepEqual(Object.keys(CFG.nomiFunzioni).sort(), Object.keys(CFG.funzioni).sort());
  assert.deepEqual(CFG.limitiGratis, { affari: 3, combinazioni: 3, seguite: 10 });
  assert.deepEqual(CFG.supabase, { url: null, chiaveAnonima: null });
  assert.deepEqual(CFG.stripe, { chiavePubblicabile: null });
  assert.deepEqual(CFG.api, { checkout: '/api/stripe/checkout', portale: '/api/stripe/portale', cancellaAccount: '/api/account/cancella' });
  const testo = fs.readFileSync(path.join(__dirname, '..', 'config', 'abbonamenti.js'), 'utf8');
  assert.doesNotMatch(testo, /(sk|pk|rk)_(live|test)_[A-Za-z0-9]|whsec_|eyJ[A-Za-z0-9_-]{20,}|service_role\s*[:=]/, 'nessuna chiave nel file');
});

test('vantaggi: i limiti del piano Gratis tornano con i numeri e ciò che non esiste ancora è "(in arrivo)"', () => {
  const [gratis, base, pro] = CFG.piani;
  const g = gratis.vantaggi.join(' | ');
  assert.match(g, /primi 3 affari/);
  assert.match(g, /prime 3 combinazioni/);
  assert.match(g, /10 aste seguite/);
  assert.match(g, /regole del sito/);
  const inArrivo = (l, re) => assert.ok(l.some((v) => re.test(v) && /\(in arrivo\)$/.test(v)), re + ' deve essere "(in arrivo)"');
  const esiste = (l, re) => assert.ok(l.some((v) => re.test(v) && !/in arrivo/.test(v)), re + ' esiste già: niente "(in arrivo)"');
  inArrivo(base.vantaggi, /Avvisi/);
  inArrivo(pro.vantaggi, /Statistiche avanzate/);
  // ciò che c'è già non è segnato come in arrivo
  esiste(pro.vantaggi, /^Stratega d'asta/);
  esiste(base.vantaggi, /selezione personale/);
  assert.ok(pro.vantaggi.includes('14 giorni di prova gratuita al primo abbonamento'));
});

test('vantaggi: "(in arrivo)" segue quello che il sito fa davvero oggi', () => {
  const [, base, pro] = CFG.piani;
  const leggi = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const marca = (l, re) => { const v = l.find((x) => re.test(x)); assert.ok(v, re + ' manca'); return /\(in arrivo\)$/.test(v); };
  // il report PDF c'è già nella scheda dell'asta ("Stampa o salva in PDF", 19/10)
  assert.match(leggi('js/pages/scheda.js'), /Stampa o salva in PDF/);
  assert.equal(marca(base.vantaggi, /Report PDF/), false, 'Report PDF esiste già');
  // il consulente con AI è pronto ma spento finché config/consulente.js non ha il "ponte"
  const consulente = require('../config/consulente.js');
  assert.equal(marca(pro.vantaggi, /intelligenza artificiale/), consulente.ponte == null);
  // le pagine delle funzioni vendute come già disponibili esistono
  for (const f of ['affari.html', 'combinazioni.html', 'stratega.html', 'mie-aste.html', 'consulente.html', 'calcolatore.html', 'mutuo.html', 'confronta.html', 'guida.html', 'tariffe.html', 'mappa.html']) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', f)), f);
  }
});

test('spenti (configurazione di oggi): nessun blocco, nessun limite, nessuna anteprima', () => {
  assert.equal(P.attivo(), false);
  assert.equal(P.anteprima(), false);
  assert.equal(P.avvisoAnteprima(), '');
  for (const f of Object.keys(CFG.funzioni)) {
    assert.equal(P.puo(f), true, f);
    assert.equal(P.puo(f, null), true, f);
  }
  for (const l of ['affari', 'combinazioni', 'seguite']) assert.equal(P.limite(l, null), Infinity, l);
  assert.equal(P.stato(), null, 'senza window.Account nessuno stato');
});

test('attivi solo con gli account configurati: attivi:true senza Supabase non blocca nulla', () => {
  conConfig({ attivi: true }, () => {
    assert.equal(P.attivo(), false);
    assert.equal(P.puo('stratega', null), true);
    assert.equal(P.limite('affari', null), Infinity);
  });
  attivi(() => assert.equal(P.attivo(), true));
});

test('anteprima: ?anteprima=abbonamenti la accende e la ricorda nella sessione, ?anteprima=no la spegne', () => {
  inAnteprima((mem) => {
    assert.equal(P.anteprima(), true);
    assert.equal(mem.getItem('radaraste.anteprima-abbonamenti'), '1');
    assert.equal(P.attivo(), true, 'in anteprima i blocchi si vedono anche con attivi:false');
    assert.equal(P.puo('stratega', null), false);
    assert.equal(P.limite('affari', null), 3);
    const avviso = P.avvisoAnteprima();
    assert.match(avviso, /class="avviso-anteprima"/);
    assert.ok(avviso.includes('Anteprima abbonamenti – modalità test: nessun pagamento reale'));
    assert.match(avviso, /href="\?anteprima=no"/);
    // pagina successiva senza il parametro: resta accesa
    globalThis.location.search = '';
    assert.equal(P.anteprima(), true);
    // il link di uscita conserva gli altri parametri
    globalThis.location.search = '?id=pvp-1';
    assert.match(P.avvisoAnteprima(), /href="\?id=pvp-1&amp;anteprima=no"/);
    globalThis.location.search = '?anteprima=no';
    assert.equal(P.anteprima(), false);
    assert.equal(mem.getItem('radaraste.anteprima-abbonamenti'), null);
    globalThis.location.search = '';
    assert.equal(P.anteprima(), false);
    assert.equal(P.avvisoAnteprima(), '');
    assert.equal(P.attivo(), false);
  });
});

test('anteprima: memoria del browser bloccata o assente non rompe nulla', () => {
  const rotta = { getItem() { throw new Error('bloccata'); }, setItem() { throw new Error('bloccata'); }, removeItem() { throw new Error('bloccata'); } };
  globale('sessionStorage', rotta);
  globale('location', { search: '?anteprima=abbonamenti' });
  try {
    assert.equal(P.anteprima(), true, 'vale almeno per la pagina con il parametro');
    globalThis.location.search = '';
    assert.equal(P.anteprima(), false);
  } finally { togli('location'); togli('sessionStorage'); }
  globale('location', { search: '?anteprima=abbonamenti' });
  try { assert.equal(P.anteprima(), true); } finally { togli('location'); }
});

test('piano dallo stato di Stripe', () => {
  const casi = [
    ['active, periodo in corso', ab('base', 'active'), 'base'],
    ['active pro', ab('pro', 'active'), 'pro'],
    ['active con disdetta alla fine del periodo', ab('pro', 'active', { cancellaAllaFine: true }), 'pro'],
    ['active scaduto (fine periodo passata)', ab('base', 'active', { finePeriodo: tra(-1) }), 'gratis'],
    ['active senza data di fine', ab('base', 'active', { finePeriodo: null }), 'base'],
    ['trialing in prova', ab('pro', 'trialing', { fineProva: tra(5), finePeriodo: tra(5) }), 'pro'],
    ['trialing con prova finita', ab('pro', 'trialing', { fineProva: tra(-1), finePeriodo: tra(10) }), 'gratis'],
    ['trialing senza fine prova: vale la fine del periodo', ab('pro', 'trialing', { fineProva: null, finePeriodo: tra(3) }), 'pro'],
    // past_due come lo scrive Stripe: al rinnovo finePeriodo passa subito alla fine del periodo NON pagato
    ['past_due mensile, rinnovo fallito 6 giorni fa', ab('base', 'past_due', { finePeriodo: tra(28 - 6) }), 'base'],
    ['past_due mensile, a 7 giorni esatti', ab('pro', 'past_due', { finePeriodo: tra(28 - 7) }), 'pro'],
    ['past_due mensile, oltre 7 giorni', ab('base', 'past_due', { finePeriodo: tra(28 - 8) }), 'gratis'],
    ['past_due mensile, rinnovo fallito 20 giorni fa', ab('pro', 'past_due', { finePeriodo: tra(10) }), 'gratis'],
    ['past_due annuale, rinnovo fallito 3 giorni fa', ab('pro', 'past_due', { periodo: 'annuale', finePeriodo: tra(365 - 3) }), 'pro'],
    ['past_due annuale, rinnovo fallito 200 giorni fa', ab('pro', 'past_due', { periodo: 'annuale', finePeriodo: tra(165) }), 'gratis'],
    ['past_due senza periodo: come il mensile', ab('base', 'past_due', { periodo: null, finePeriodo: tra(25) }), 'base'],
    ['past_due con la fine periodo già passata (dati vecchi)', ab('base', 'past_due', { finePeriodo: tra(-6) }), 'gratis'],
    ['past_due senza data', ab('base', 'past_due', { finePeriodo: null }), 'gratis'],
    ['canceled', ab('pro', 'canceled'), 'gratis'],
    ['incomplete', ab('pro', 'incomplete'), 'gratis'],
    ['incomplete_expired', ab('pro', 'incomplete_expired'), 'gratis'],
    ['unpaid', ab('base', 'unpaid'), 'gratis'],
    ['paused', ab('base', 'paused'), 'gratis'],
    ['piano gratis', ab('gratis', 'active'), 'gratis'],
    ['piano sconosciuto', ab('platino', 'active'), 'gratis'],
    ['senza abbonamento', { utente: { id: 'x' }, abbonamento: null }, 'gratis'],
    ['nessun account', null, 'gratis']
  ];
  for (const [nome, stato, atteso] of casi) assert.equal(P.piano(stato, ADESSO), atteso, nome);
  // date come numeri (secondi Unix di Stripe) o Date; piano scritto con la maiuscola
  assert.equal(P.piano(ab('Pro', 'active', { finePeriodo: Math.floor(Date.parse(tra(2)) / 1000) }), ADESSO), 'pro');
  assert.equal(P.piano(ab('base', 'active', { finePeriodo: new Date(tra(-2)) }), new Date(ADESSO)), 'gratis');
  // l'abbonamento si può passare anche da solo
  assert.equal(P.piano(ab('pro', 'active').abbonamento, ADESSO), 'pro');
  // senza "adesso" vale l'ora attuale
  assert.equal(P.piano({ abbonamento: { piano: 'base', stato: 'active', finePeriodo: new Date(Date.now() + GIORNO).toISOString() } }), 'base');
  // valori strani: mai un piano a pagamento per sbaglio
  for (const strano of ['pro', 42, [], { piano: ['pro'], stato: 'active' }, { piano: { toString: () => 'pro' }, stato: 'active' }, { piano: 'pro', stato: 'ACTIVE' }, { piano: 'pro' }]) {
    assert.equal(P.piano(strano, ADESSO), 'gratis', JSON.stringify(strano));
  }
});

test('past_due: mai meno di 7 giorni dalla fine del periodo pagato, anche con i mesi di 31 giorni', () => {
  // rinnovo del 1/10 fallito: Stripe scrive come fine il 1/11 (31 giorni dopo)
  const sub = { piano: 'pro', periodo: 'mensile', stato: 'past_due', finePeriodo: '2026-11-01T00:00:00Z' };
  assert.equal(P.piano(sub, '2026-10-08T00:00:00Z'), 'pro', '7 giorni dopo il rinnovo fallito');
  assert.equal(P.piano(sub, '2026-10-11T00:00:00Z'), 'pro');
  assert.equal(P.piano(sub, '2026-10-11T00:00:01Z'), 'gratis');
  // la data da scrivere all'utente ("resta attivo fino al…") è la stessa usata da piano()
  assert.equal(P.fineRitardo(sub), '2026-10-11T00:00:00.000Z');
  assert.equal(P.fineRitardo({ utente: {}, abbonamento: sub }), '2026-10-11T00:00:00.000Z');
  assert.equal(P.fineRitardo(Object.assign({}, sub, { periodo: 'annuale', finePeriodo: '2027-10-01T00:00:00Z' })), '2026-10-08T00:00:00.000Z');
  assert.equal(P.fineRitardo(Object.assign({}, sub, { finePeriodo: null })), null);
  assert.equal(P.fineRitardo(null), null);
});

test('stato e piano dell\'account corrente da window.Account', () => {
  // fine periodo rispetto a oggi: le chiamate senza "adesso" usano l'ora vera (niente test che scadono)
  const pro = ab('pro', 'active', { finePeriodo: new Date(Date.now() + 20 * GIORNO).toISOString() });
  globale('Account', { statoCorrente: () => pro });
  try {
    assert.equal(P.stato().utente.id, 'utente-finto');
    assert.equal(P.piano(undefined, ADESSO), 'pro');
    attivi(() => {
      assert.equal(P.puo('stratega', undefined, ADESSO), true);
      assert.equal(P.puo('stratega'), true);
      assert.equal(P.limite('affari'), Infinity);
      assert.doesNotMatch(P.blocco({ funzione: 'stratega' }), /accedi\.html/, 'chi ha già un account non vede "Accedi"');
    });
  } finally { togli('Account'); }
  globale('Account', { statoCorrente() { throw new Error('cache rotta'); } });
  try { assert.equal(P.stato(), null); assert.equal(P.piano(), 'gratis'); } finally { togli('Account'); }
  globale('Account', {});
  try { assert.equal(P.stato(), null); } finally { togli('Account'); }
});

test('puo e limite con gli abbonamenti attivi', () => {
  attivi(() => {
    const gratis = null, base = ab('base', 'active'), pro = ab('pro', 'trialing', { fineProva: tra(3) });
    for (const f of ['affari-tutti', 'selezione-personale', 'combinazioni-tutte', 'seguite-illimitate', 'report-pdf', 'avvisi']) {
      assert.equal(P.puo(f, gratis, ADESSO), false, f);
      assert.equal(P.puo(f, base, ADESSO), true, f);
      assert.equal(P.puo(f, pro, ADESSO), true, f);
    }
    for (const f of ['stratega', 'consulente-ai', 'statistiche-avanzate']) {
      assert.equal(P.puo(f, gratis, ADESSO), false, f);
      assert.equal(P.puo(f, base, ADESSO), false, f);
      assert.equal(P.puo(f, pro, ADESSO), true, f);
    }
    // funzioni non elencate: libere per tutti
    assert.equal(P.puo('calcolatore', gratis, ADESSO), true);
    // abbonamento scaduto = gratis
    assert.equal(P.puo('stratega', ab('pro', 'canceled'), ADESSO), false);
    assert.equal(P.limite('affari', gratis, ADESSO), 3);
    assert.equal(P.limite('combinazioni', gratis, ADESSO), 3);
    assert.equal(P.limite('seguite', gratis, ADESSO), 10);
    assert.equal(P.limite('sconosciuto', gratis, ADESSO), Infinity);
    assert.equal(P.limite('affari', base, ADESSO), Infinity);
    assert.equal(P.limite('seguite', pro, ADESSO), Infinity);
    assert.equal(P.limite('seguite', ab('base', 'past_due', { finePeriodo: tra(-30) }), ADESSO), 10);
  });
  assert.equal(P.pianoMinimo('stratega'), 'pro');
  assert.equal(P.pianoMinimo('avvisi'), 'base');
  assert.equal(P.pianoMinimo('mappa'), 'gratis');
});

test('prezzi in italiano e risparmio con l\'annuale', () => {
  assert.equal(P.prezzo('pro', 'mensile'), '24 € al mese');
  assert.equal(P.prezzo('pro', 'annuale'), '240 € all\'anno');
  assert.equal(P.prezzo('base'), '9 € al mese');
  assert.equal(P.prezzo('base', 'annuale'), '90 € all\'anno');
  assert.equal(P.prezzo('gratis', 'mensile'), 'Gratis');
  assert.equal(P.prezzo('platino', 'mensile'), '');
  assert.equal(P.risparmioAnnuale('base'), 18);
  assert.equal(P.risparmioAnnuale('pro'), 48);
  assert.equal(P.risparmioAnnuale('gratis'), 0);
  assert.equal(P.risparmioAnnuale('platino'), 0);
  conConfig({ piani: [{ id: 'gratis', nome: 'Gratis', prezzi: { mensile: 0, annuale: 0 } }, { id: 'base', nome: 'Base', prezzi: { mensile: 9.5, annuale: 1200 } }] }, () => {
    assert.equal(P.prezzo('base', 'mensile'), '9,50 € al mese');
    assert.equal(P.prezzo('base', 'annuale'), '1.200 € all\'anno');
    assert.equal(P.risparmioAnnuale('base'), 0, 'mai un risparmio negativo');
  });
});

test('giorni di prova rimasti', () => {
  // giorni di calendario nel fuso di chi guarda: la fine della prova è a mezzogiorno del 27/10 nel fuso del test
  const inProva = { piano: 'pro', stato: 'trialing', fineProva: new Date(2026, 9, 27, 12).toISOString() };
  assert.equal(P.giorniProva(inProva, '2026-10-13'), 14);
  assert.equal(P.giorniProva(inProva, '2026-10-26'), 1);
  assert.equal(P.giorniProva(inProva, '2026-10-27'), 0);
  assert.equal(P.giorniProva(inProva, '2026-11-02'), 0);
  // con un istante: giorni da 24 ore, per eccesso
  const utc = { piano: 'pro', stato: 'trialing', fineProva: '2026-10-27T12:00:00Z' };
  assert.equal(P.giorniProva(utc, '2026-10-26T12:00:00Z'), 1);
  assert.equal(P.giorniProva(utc, '2026-10-26T13:00:00Z'), 1, 'giorno iniziato conta');
  assert.equal(P.giorniProva(utc, '2026-10-27T12:00:01Z'), 0);
  assert.equal(P.giorniProva({ utente: {}, abbonamento: inProva }, '2026-10-20'), 7, 'anche dallo stato completo');
  assert.equal(P.giorniProva(Object.assign({}, inProva, { stato: 'active' }), '2026-10-13'), 0, 'già pagato: niente prova');
  assert.equal(P.giorniProva(Object.assign({}, inProva, { stato: 'canceled' }), '2026-10-13'), 0);
  assert.equal(P.giorniProva({ piano: 'pro', fineProva: inProva.fineProva }, '2026-10-13'), 0, 'senza stato non è una prova');
  assert.equal(P.giorniProva({ piano: 'pro', stato: 'trialing', fineProva: null }, '2026-10-13'), 0);
  assert.equal(P.giorniProva({ utente: {}, abbonamento: null }, '2026-10-13'), 0);
  assert.equal(P.giorniProva(null, '2026-10-13'), 0);
  assert.ok(P.giorniProva({ piano: 'pro', stato: 'trialing', fineProva: new Date(Date.now() + 3 * GIORNO).toISOString() }) >= 2);
});

test('giorni di prova: il giorno di fine è quello del calendario di chi guarda (fusi orari)', () => {
  // la prova finisce alle 23:30 UTC del 27/10: a Roma è già il 28, a Los Angeles è ancora il 27
  const sub = { piano: 'pro', stato: 'trialing', fineProva: '2026-10-27T23:30:00Z' };
  const prima = process.env.TZ;
  const conFuso = (tz, fn) => { process.env.TZ = tz; try { return fn(); } finally { if (prima === undefined) delete process.env.TZ; else process.env.TZ = prima; } };
  conFuso('Europe/Rome', () => assert.equal(P.giorniProva(sub, '2026-10-26'), 2));
  conFuso('America/Los_Angeles', () => assert.equal(P.giorniProva(sub, '2026-10-26'), 1));
  conFuso('Pacific/Auckland', () => assert.equal(P.giorniProva(sub, '2026-10-26'), 2));
  // cambio dell'ora (25/10 in Italia): i giorni restano interi
  conFuso('Europe/Rome', () => assert.equal(P.giorniProva({ stato: 'trialing', fineProva: '2026-10-27T10:00:00Z' }, '2026-10-24'), 3));
});

test('blocco: riquadro accessibile con il pulsante verso il piano giusto', () => {
  const h = P.blocco({ funzione: 'stratega' });
  assert.match(h, /^<section class="blocco-piano" aria-labelledby="(blocco-piano-\d+)"/);
  const id = h.match(/aria-labelledby="([^"]+)"/)[1];
  assert.match(h, new RegExp('<h2 class="blocco-piano-titolo" id="' + id + '">'));
  assert.match(h, /class="blocco-piano-testo"/);
  assert.match(h, /<a class="btn" href="prezzi\.html#pro">Sblocca con Pro<\/a>/);
  assert.match(h, /stratega d&#39;asta/, 'dice cosa si sblocca');
  assert.match(h, /24 € al mese oppure 240 € all&#39;anno \(risparmi 48 €\), IVA inclusa/);
  assert.match(h, /Al primo abbonamento puoi provarlo gratis per 14 giorni/);
  assert.match(h, /href="accedi\.html"/);
  assert.match(h, /<\/section>$/);
  // id diversi per due riquadri nella stessa pagina
  assert.notEqual(P.blocco({ funzione: 'stratega' }).match(/id="([^"]+)"/)[1], id);

  const b = P.blocco({ funzione: 'affari-tutti', livello: 3 });
  assert.match(b, /href="prezzi\.html#base">Sblocca con Base</);
  assert.match(b, /<h3 class="blocco-piano-titolo"/);
  assert.match(b, /tutti gli affari di oggi/);
  assert.match(b, /Al primo abbonamento puoi provare gratis per 14 giorni il piano Pro, che comprende anche questa funzione/);
  // funzione sconosciuta: il primo piano a pagamento, mai "Sblocca con Gratis"
  const x = P.blocco({ funzione: 'inesistente' });
  assert.match(x, /prezzi\.html#base/);
  assert.doesNotMatch(x, /Sblocca con Gratis/);
  assert.match(P.blocco({ funzione: 'avvisi', titolo: 'Avvisi ogni mattina', testo: 'Ricevi le nuove aste.' }), /Avvisi ogni mattina<\/span><\/h2><p class="blocco-piano-testo">Ricevi le nuove aste\.<\/p>/);
});

test('blocco: la prova gratuita non è promessa a chi ha già avuto un abbonamento', () => {
  const PROVA = /prova|provar/i;
  const conStato = (s, fn) => { globale('Account', { statoCorrente: () => s }); try { return fn(); } finally { togli('Account'); } };
  const utente = { id: 'utente-finto', email: 'prova@example.com' };
  // registrato da poco, nessun abbonamento (riga "gratis" con stato null): la prova vale
  conStato({ utente, abbonamento: { piano: 'gratis', periodo: null, stato: null, fineProva: null, finePeriodo: null } },
    () => assert.match(P.blocco({ funzione: 'stratega' }), /Al primo abbonamento puoi provarlo gratis per 14 giorni/));
  // abbonamento non ancora letto: non sappiamo, vale la frase con la condizione
  conStato({ utente, abbonamento: null }, () => assert.match(P.blocco({ funzione: 'stratega' }), /Al primo abbonamento/));
  // abbonato Base che guarda lo Stratega: cambia piano dal portale, senza prova
  conStato({ utente, abbonamento: { piano: 'base', periodo: 'mensile', stato: 'active', fineProva: null, finePeriodo: tra(20) } }, () => {
    const h = P.blocco({ funzione: 'stratega' });
    assert.doesNotMatch(h, PROVA);
    assert.match(h, /href="prezzi\.html#pro">Sblocca con Pro/);
  });
  // ex abbonato (disdetto) o con la prova già usata
  conStato({ utente, abbonamento: { piano: 'gratis', periodo: 'mensile', stato: 'canceled', fineProva: null, finePeriodo: tra(-30) } },
    () => assert.doesNotMatch(P.blocco({ funzione: 'stratega' }), PROVA));
  conStato({ utente, abbonamento: { piano: 'gratis', periodo: null, stato: null, fineProva: tra(-40), finePeriodo: null } },
    () => assert.doesNotMatch(P.blocco({ funzione: 'affari-tutti' }), PROVA));
  // la stessa regola è disponibile per le pagine (come haGiaAvuto in servizi/stripe.js)
  assert.equal(P.provaGiaUsata(null), false);
  assert.equal(P.provaGiaUsata({ utente, abbonamento: null }), false);
  assert.equal(P.provaGiaUsata({ utente, abbonamento: { piano: 'gratis', stato: null, fineProva: null } }), false);
  assert.equal(P.provaGiaUsata({ utente, abbonamento: { piano: 'gratis', stato: 'canceled' } }), true);
  assert.equal(P.provaGiaUsata({ piano: 'gratis', stato: 'incomplete_expired' }), true);
  assert.equal(P.provaGiaUsata({ piano: 'gratis', stato: null, fineProva: tra(-1) }), true);
  // prezzo e IVA restano
  conStato({ utente, abbonamento: { piano: 'pro', stato: 'unpaid', fineProva: null, finePeriodo: tra(-3) } },
    () => assert.match(P.blocco({ funzione: 'stratega' }), /24 € al mese oppure 240 € all&#39;anno/));
});

test('blocco: con un pagamento non riuscito indica il proprio account, non un nuovo abbonamento', () => {
  const conStato = (s, fn) => { globale('Account', { statoCorrente: () => s }); try { return fn(); } finally { togli('Account'); } };
  const utente = { id: 'utente-finto' };
  for (const stato of ['past_due', 'unpaid', 'paused', 'incomplete']) {
    conStato({ utente, abbonamento: { piano: 'pro', periodo: 'mensile', stato, fineProva: null, finePeriodo: tra(-40) } }, () => {
      const h = P.blocco({ funzione: 'stratega' });
      assert.match(h, /pagamento del tuo abbonamento non è riuscito: <a href="account\.html">aggiorna il metodo di pagamento<\/a>/, stato);
      assert.doesNotMatch(h, /accedi\.html/, stato);
    });
  }
  for (const s of [{ utente, abbonamento: { piano: 'gratis', stato: 'canceled' } }, { utente, abbonamento: { piano: 'base', stato: 'active', finePeriodo: tra(20) } }, { utente, abbonamento: null }]) {
    conStato(s, () => assert.doesNotMatch(P.blocco({ funzione: 'stratega' }), /account\.html|accedi\.html/, JSON.stringify(s)));
  }
});

test('nomi come "constructor" o "toString" non sono funzioni né limiti della configurazione', () => {
  for (const k of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    assert.equal(P.pianoMinimo(k), 'gratis', k);
    const h = P.blocco({ funzione: k });
    assert.doesNotMatch(h, /function|native code|\[object/, k);
    assert.match(h, /Questa funzione fa parte del piano Base\./, k);
  }
  attivi(() => {
    assert.equal(P.puo('constructor', null, ADESSO), true);
    assert.equal(P.limite('constructor', null, ADESSO), Infinity);
    assert.equal(P.limite('__proto__', null, ADESSO), Infinity);
  });
});

test('blocco: nessun HTML iniettabile dai parametri', () => {
  const male = '<img src=x onerror="alert(1)">';
  const h = P.blocco({ funzione: '"><script>alert(1)</script>', titolo: male, testo: male + ' & "virgolette"' });
  assert.doesNotMatch(h, /<script|<img|onerror="/);
  assert.match(h, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(h, /&amp; &quot;virgolette&quot;/);
  assert.match(h, /data-funzione="&quot;&gt;&lt;script&gt;/);
  // anche i nomi presi dalla configurazione sono protetti
  conConfig({ nomiFunzioni: { stratega: '<b>Stratega</b>' }, piani: CFG.piani.map((p) => (p.id === 'pro' ? Object.assign({}, p, { nome: 'Pro <i>' }) : p)) }, () => {
    const c = P.blocco({ funzione: 'stratega' });
    assert.doesNotMatch(c, /<b>|<i>/);
    assert.match(c, /Sblocca con Pro &lt;i&gt;/);
  });
});
