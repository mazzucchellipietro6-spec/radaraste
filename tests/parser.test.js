const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/parser.js');
const GEO = require('../data/geo.js');

test('numeri in formato italiano', () => {
  assert.equal(P.numeroIt('120.000,00'), 120000);
  assert.equal(P.numeroIt('95.500'), 95500);
  assert.equal(P.numeroIt('1.234,5'), 1234.5);
});

test('analizza un avviso di vendita immobiliare', () => {
  const testo = `Appartamento al secondo piano con cantina
TRIBUNALE DI GENOVA - Tribunale di Genova, R.G.E. n. 412/2024
Immobile sito in Genova (GE), via Roma 10. L'immobile risulta occupato dal debitore.
Prezzo base: € 120.000,00 - Offerta minima: € 90.000,00
Vendita senza incanto il giorno 18/11/2026 ore 10:00
https://pvp.giustizia.it/pvp/it/detail_annuncio.page?idAnnuncio=123
https://example.it/perizia-412.pdf`;
  const r = P.analizza(testo, GEO);
  assert.equal(r.prezzoBase, 120000);
  assert.equal(r.offertaMinima, 90000);
  assert.equal(r.dataAsta, '2026-11-18');
  assert.equal(r.tribunale, 'Genova');
  assert.equal(r.rge, '412/2024');
  assert.equal(r.stato, 'occupato');
  assert.equal(r.categoria, 'immobile');
  assert.equal(r.provincia, 'GE');
  assert.equal(r.regione, 'Liguria');
  assert.equal(r.comune, 'Genova');
  assert.equal(r.fonte, 'Portale Vendite Pubbliche');
  assert.match(r.linkPerizia, /perizia/);
  assert.equal(r.titolo, 'Appartamento al secondo piano con cantina');
});

test('data scritta in lettere e veicolo', () => {
  const r = P.analizza('Autovettura Fiat Panda targata AB123CD, asta del 3 dicembre 2026, prezzo base euro 4.500', GEO);
  assert.equal(r.categoria, 'auto');
  assert.equal(r.dataAsta, '2026-12-03');
  assert.equal(r.prezzoBase, 4500);
});

test('provincia ricavata dal tribunale', () => {
  const r = P.analizza('Tribunale di Bologna. Villa libera. Prezzo base 300.000', GEO);
  assert.equal(r.provincia, 'BO');
  assert.equal(r.stato, 'libero');
});
