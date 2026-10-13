const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/riepilogo.js');

const OGGI = '2026-10-13';
const a = (id, o) => ({ id, titolo: 'Asta ' + id, categoria: 'immobile', regione: 'Liguria', dataAsta: '2026-11-20', prezzoBase: 100000, pubblicata: '2026-09-01', vista: '2026-09-01', ...o });

const aste = [
  a('p1', { punteggio: 80, punteggioCompleto: true, sconto: 0.45, affidabilita: 'alta', valore: 200000, lat: 44.4, lng: 8.9, superficieMq: 90, tentativo: 3, rischi: [], nFoto: 5 }),
  a('p2', { punteggio: 90, punteggioCompleto: false, sconto: 0.6, affidabilita: 'bassa' }),              // non completo: fuori dai migliori e dalla media
  a('p3', { punteggio: 70, punteggioCompleto: true, sconto: 0.25, affidabilita: 'media', regione: 'Lazio', tentativo: 2, pubblicata: '2026-10-12' }),
  a('p4', { punteggio: 95, punteggioCompleto: true, sconto: 0.5, affidabilita: 'alta', dataAsta: '2026-10-01' }), // passata
  a('p5', { prezzoBase: null, dataRibasso: '2026-10-12', prezzoPrecedente: 120000, sconto: 0.1, affidabilita: 'media', regione: 'Lazio' }),
  a('p6', { tentativo: 4, pubblicata: '2026-09-01' })                                                      // ribasso vecchio: no
];

test('migliori: solo aste future con punteggio completo, ordinate per punteggio, con i campi per le schede', () => {
  const r = R.calcola(aste, OGGI);
  assert.deepEqual(r.migliori.lista.map((x) => x.id), ['p1', 'p3']);
  assert.equal(r.migliori.totale, 2);
  const m = r.migliori.lista[0];
  for (const c of ['valore', 'affidabilita', 'sconto', 'punteggio', 'superficieMq', 'tentativo', 'nFoto', 'lat', 'lng', 'regione']) assert.ok(c in m, c);
  assert.deepEqual(m.rischi, []);
});

test('sconto medio solo su affidabilità media o alta, con il campione', () => {
  const r = R.calcola(aste, OGGI);
  assert.equal(r.sconto.campione, 3); // p1, p3, p5 (p2 bassa, p4 passata)
  assert.equal(r.sconto.medio, Math.round((0.45 + 0.25 + 0.1) / 3 * 1000) / 1000);
  assert.equal(R.calcola([a('x', {})], OGGI).sconto, null);
});

test('per regione: numero di aste, sconto medio, campione e migliore', () => {
  const r = R.calcola(aste, OGGI);
  assert.deepEqual(r.perRegione.Liguria, { n: 3, scontoMedio: 0.45, campione: 1, migliore: { id: 'p1', titolo: 'Asta p1', punteggio: 80 } });
  assert.deepEqual(r.perRegione.Lazio, { n: 2, scontoMedio: 0.175, campione: 2, migliore: { id: 'p3', titolo: 'Asta p3', punteggio: 70 } });
});

test('valore totale e ribassi recenti (48 ore), i più scontati prima', () => {
  const r = R.calcola(aste, OGGI);
  assert.equal(r.attive, 5);
  assert.equal(r.valoreTotale, 400000); // p5 senza prezzo base
  assert.deepEqual(r.ribassi.lista.map((x) => x.id), ['p3', 'p5']);
  assert.equal(r.ribassi.dal, '2026-10-11');
  assert.equal(r.ribassi.lista[1].prezzoPrecedente, 120000);
});
