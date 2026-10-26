const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../config/tariffe.js');
const C = require('../js/calcoli.js');
const M = require('../js/mutuo.js');
const K = require('../js/consulente.js');

// aste di prova (dati finti, solo per il test)
const base = { categoria: 'immobile', tipo: 'Immobile residenziale', fonte: 'Portale Vendite Pubbliche', linkAvviso: 'https://pvp.giustizia.it/x', tribunale: 'Bari' };
const ASTE = [
  { ...base, id: 'pvp-4600001', titolo: 'Appartamento al piano primo', comune: 'Bari', provincia: 'BA', regione: 'Puglia', prezzoBase: 90000, dataAsta: '2026-11-20', stato: 'libero', valore: 150000, valoreMin: 130000, valoreMax: 170000, fonteValore: 'omi', affidabilita: 'media', sconto: 0.35, costoTotale: 99000, offertaMax: 98000, punteggio: 80, punteggioCompleto: true },
  { ...base, id: 'pvp-4600002', titolo: 'Appartamento con cantina', comune: 'Bari', provincia: 'BA', regione: 'Puglia', prezzoBase: 120000, dataAsta: '2026-11-25', stato: 'libero', valore: 300000, fonteValore: 'prima-asta', affidabilita: 'bassa', sconto: 0.5, costoTotale: 130000, punteggio: 54, punteggioCompleto: false },
  { ...base, id: 'pvp-4600003', titolo: 'Appartamento al piano terra', comune: 'Bari', provincia: 'BA', regione: 'Puglia', prezzoBase: 80000, dataAsta: '2026-10-01', stato: 'libero', punteggio: 90 },
  { ...base, id: 'pvp-4600004', titolo: 'Box auto', comune: 'Lecce', provincia: 'LE', regione: 'Puglia', prezzoBase: 15000, dataAsta: '2026-12-01', stato: 'nd' },
  { ...base, id: 'pvp-4600005', titolo: 'Villa con giardino', comune: 'Milano', provincia: 'MI', regione: 'Lombardia', prezzoBase: 400000, dataAsta: '2026-11-10', stato: 'occupato', punteggio: 60, affidabilita: 'alta', valore: 600000, sconto: 0.3 }
];
const ctx = { aste: ASTE, T, oggi: '2026-10-13', affari: null };
const testi = (r) => r.blocchi.filter((b) => b.tipo === 'testo').map((b) => b.testo).join(' ');
const blocco = (r, tipo) => r.blocchi.find((b) => b.tipo === tipo);

test('importi in italiano: 150 mila, 150.000, 150k, 1,2 milioni, tra 50 e 80 mila', () => {
  const n = K._interni.numeri;
  assert.deepEqual(n('150 mila').map((x) => x.v), [150000]);
  assert.deepEqual(n('150.000 euro').map((x) => x.v), [150000]);
  assert.deepEqual(n('150k').map((x) => x.v), [150000]);
  assert.deepEqual(n('1,2 milioni').map((x) => x.v), [1200000]);
  const c = K.capisci('ville tra 50 e 80 mila', ctx);
  assert.equal(c.parametri.prezzoMin, 50000);
  assert.equal(c.parametri.prezzoMax, 80000);
});

test('ricerca: luogo, tipo, prezzo e "solo liberi" capiti; aste passate escluse; affidabilità bassa dopo media/alta', () => {
  const r = K.rispondi('Appartamenti a Bari sotto 150.000 €, solo liberi', ctx);
  assert.equal(r.intento, 'cerca');
  assert.match(testi(r), /Ho capito: appartamenti a Bari \(BA\), sotto 150\.000 €, solo liberi/);
  const a = blocco(r, 'aste');
  assert.deepEqual(a.ids, ['pvp-4600001', 'pvp-4600002']);   // pvp-3 è passata; pvp-2 (bassa) dopo pvp-1 anche se ha più sconto
  assert.equal(a.totale, 2);
  assert.equal(a.filtri.comune, 'Bari');
  assert.ok(blocco(r, 'fonti'), 'ogni risposta con numeri ha le fonti');
});

test('seguiti: "e a Lecce?" cambia solo il luogo; una domanda completa riparte da zero', () => {
  const r1 = K.rispondi('Appartamenti a Bari sotto 150.000 €, solo liberi', ctx);
  const r2 = K.rispondi('e a Lecce?', ctx, r1.memoria);
  assert.equal(r2.parametri ? r2.parametri.comune : K.capisci('e a Lecce?', ctx, r1.memoria).parametri.comune, 'Lecce');
  const c2 = K.capisci('e a Lecce?', ctx, r1.memoria);
  assert.equal(c2.seguito, true);
  assert.equal(c2.parametri.prezzoMax, 150000);
  const c3 = K.capisci('Buoni affari in Lombardia entro novembre', ctx, r1.memoria);
  assert.equal(c3.parametri.regione, 'Lombardia');
  assert.equal(c3.parametri.prezzoMax, undefined, 'niente filtri ereditati da un\'altra domanda');
  assert.equal(c3.parametri.soloLibere, undefined);
});

test('costi: stesso totale del calcolatore (js/calcoli.js), prima e seconda casa, con fonti delle aliquote', () => {
  const r = K.rispondi('Quanto costa in totale un\'asta da 100.000 € come prima casa?', ctx);
  assert.equal(r.intento, 'costi');
  const c = blocco(r, 'conti');
  const atteso = C.costoImmobile({ prezzoBase: 100000, offerta: 100000, regime: 'prima-privato', speseProcedura: 1500 }, T).totale;
  assert.equal(c.totale[1], Math.round(atteso));
  const f = blocco(r, 'fonti');
  assert.ok(f.voci.some((v) => /Agenzia delle Entrate/.test(v.nome) && /^https:/.test(v.url || '')));
  const r2 = K.rispondi('e se fosse seconda casa?', ctx, r.memoria);
  const atteso2 = C.costoImmobile({ prezzoBase: 100000, offerta: 100000, regime: 'seconda-privato', speseProcedura: 1500 }, T).totale;
  assert.equal(blocco(r2, 'conti').totale[1], Math.round(atteso2));
});

test('mutuo: rata calcolata con js/mutuo.js; senza tasso o durata la chiede invece di inventarla', () => {
  const r = K.rispondi('Rata per 120.000 € in 25 anni al 3,5%', ctx);
  assert.equal(r.intento, 'mutuo');
  assert.equal(Math.round(blocco(r, 'conti').totale[1]), Math.round(M.rata(120000, 0.035, 25)));
  const s = K.rispondi('rata per 100 mila', ctx);
  assert.match(testi(s), /mi servono il tasso annuo e la durata/);
  assert.equal(blocco(s, 'conti'), undefined, 'nessun numero inventato');
  const s2 = K.rispondi('al 3% in 20 anni', ctx, s.memoria);
  assert.equal(Math.round(blocco(s2, 'conti').totale[1]), Math.round(M.rata(100000, 0.03, 20)));
});

test('rendimento lordo dell\'affitto', () => {
  const r = K.rispondi('affitto 600 € al mese su 100.000 €', ctx);
  assert.equal(r.intento, 'rendimento');
  assert.match(testi(r), /7,2%/);
});

test('spiega un\'asta: numeri con fonte; senza valore lo dice', () => {
  const r = K.rispondi('spiegami l\'asta pvp-4600001', ctx);
  assert.equal(r.intento, 'spiega');
  assert.ok(blocco(r, 'conti'));
  assert.ok(blocco(r, 'fonti'));
  const v = K.rispondi('spiegami l\'asta pvp-4600004', ctx);
  assert.match(JSON.stringify(v.blocchi), /non (è )?(ancora )?(disponibile|stimat)/i);
});

test('guida: ogni voce ha testo e almeno una fonte https; la cauzione cita l\'art. 571 c.p.c.', () => {
  assert.ok(K.GUIDA.length >= 10);
  for (const g of K.GUIDA) {
    assert.ok(g.id && g.titolo && g.testo.length > 40, g.id);
    assert.ok(g.fonti.length && g.fonti.every((f) => /^https:\/\//.test(f.url)), g.id + ': fonti');
  }
  const r = K.rispondi('Come funziona la cauzione?', ctx);
  assert.equal(r.intento, 'guida');
  assert.ok(blocco(r, 'fonti').voci.some((v) => /571/.test(v.nome)));
});

test('saluto, aiuto e domande non capite: suggerimenti che funzionano', () => {
  for (const q of ['ciao', 'aiuto', 'qual è il senso della vita']) {
    const r = K.rispondi(q, ctx);
    assert.ok(blocco(r, 'suggerimenti'), q);
  }
  for (const q of K.ESEMPI) assert.notEqual(K.rispondi(q, ctx).intento, 'non-capito', q);
});

test('fonti: una fonte ferma dice il giorno dell\'ultima raccolta riuscita, non quello del file (raccolta del 22/10, Portale in errore)', () => {
  // stato delle fonti scritto in data/aste.js dalla raccolta del 22/10/2026: il Portale non rispondeva, restano le aste del 13/10
  const raccolta = { aggiornato: '2026-10-22T06:20:24.194Z', fonti: [
    { nome: 'Portale Vendite Pubbliche', stato: 'errore', aste: 20215, ultimaRaccolta: '2026-10-13T14:45:37.203Z', controllo: '2026-10-22' },
    { nome: 'Agenzia del Demanio', stato: 'attiva', aste: 3, ultimaRaccolta: '2026-10-22T06:20:04.369Z', controllo: '2026-10-22' }] };
  const dem = { ...base, id: 'dem-x', fonte: 'Agenzia del Demanio', titolo: 'Appartamento del Demanio', comune: 'Bari', provincia: 'BA', regione: 'Puglia', dataAsta: '2026-11-30' };
  const voce = (r, re) => blocco(r, 'fonti').voci.find((v) => re.test(v.nome));
  const r = K.rispondi('appartamenti a Bari', { ...ctx, aste: ASTE.concat([dem]), oggi: '2026-10-22', raccolta });
  const pvp = voce(r, /Portale delle Vendite Pubbliche/);
  assert.equal(pvp.data, '2026-10-13');
  assert.match(pvp.nome, /oggi nessun aggiornamento, aste dell'ultima raccolta riuscita/);
  assert.deepEqual(voce(r, /Demanio/), { nome: 'Agenzia del Demanio – Gare e aste', url: 'https://www.agenziademanio.it/it/gare-aste/', data: '2026-10-22' });
  // letto giorni dopo: si dice il giorno della raccolta, non "oggi"
  const dopo = voce(K.rispondi('appartamenti a Bari', { ...ctx, oggi: '2026-10-26', raccolta }), /Portale/);
  assert.match(dopo.nome, /il 22\/10\/2026 nessun aggiornamento/);
  // fonte aggiornata: la data della raccolta, come prima
  const ok = { ...raccolta, fonti: [{ ...raccolta.fonti[0], stato: 'attiva', ultimaRaccolta: '2026-10-22T06:19:00.000Z' }] };
  assert.deepEqual(voce(K.rispondi('appartamenti a Bari', { ...ctx, oggi: '2026-10-22', raccolta: ok }), /Portale/),
    { nome: 'Portale delle Vendite Pubbliche (Ministero della Giustizia)', url: 'https://pvp.giustizia.it/pvp/', data: '2026-10-22' });
});
