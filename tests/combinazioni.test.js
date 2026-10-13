const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../config/tariffe.js');
const C = require('../js/calcoli.js');
const K = require('../js/combinazioni.js');

// lotti di prova (dati finti, solo per il test)
const base = { categoria: 'immobile', tribunale: 'Catania', rge: '120', comune: 'Gravina di Catania', provincia: 'CT', dataAsta: '2026-12-01', linkAvviso: 'https://pvp.giustizia.it/x' };
const casa = { ...base, id: 'a1', numeroLotto: '2', titolo: 'Diritto di proprietà su di un appartamento in Gravina di Catania', prezzoBase: 97500, valore: 160000, valoreMin: 140000, affidabilita: 'media', costoTotale: 108000 };
const box = { ...base, id: 'a2', numeroLotto: '1', titolo: 'Diritto di proprietà su di un locale garage', prezzoBase: 27750, valore: 36000, valoreMin: 32000, affidabilita: 'media', costoTotale: 32000 };

test('ruolo del lotto dal testo dell\'avviso', () => {
  assert.equal(K.ruolo(casa), 'abitazione');
  assert.equal(K.ruolo(box), 'pertinenza');
  assert.equal(K.ruolo({ titolo: 'Appartamento con autorimessa al piano terra' }), 'abitazione');
  assert.equal(K.ruolo({ titolo: 'Terreni agricoli in contrada Garrisiella' }), 'terreno');
  assert.equal(K.ruolo({ titolo: 'Locale ad uso commerciale al piano terra' }), 'commerciale');
});

test('casa + box della stessa procedura: somme, sconto complessivo e risparmio fiscale come pertinenza della prima casa', () => {
  const r = K.trova([casa, box], { T, oggi: '2026-10-13' });
  assert.equal(r.trovate, 1);
  const c = r.combinazioni[0];
  assert.equal(c.tipo, 'casa-pertinenza');
  assert.deepEqual(c.lotti.map((l) => l.id), ['a2', 'a1']);   // in ordine di numero di lotto
  assert.equal(c.numeri.prezzoBase, 125250);
  assert.equal(c.numeri.valore, 196000);
  assert.equal(c.numeri.costoTotale, 140000);
  assert.equal(c.numeri.sconto, Math.round((1 - 140000 / 196000) * 1000) / 1000);
  assert.equal(c.affidabilita, 'media');
  // risparmio = imposte sul box senza agevolazioni − imposte come pertinenza della prima casa, al prezzo base
  const senza = C.imposteImmobile({ prezzo: 27750, regime: 'seconda-privato' }, T).totale;
  const con = C.imposteImmobile({ prezzo: 27750, regime: 'prima-privato' }, T).totale;
  assert.equal(c.numeri.risparmioPrimaCasa, Math.round(senza - con));
  assert.ok(c.risparmio.url && c.risparmio.fonte);
  assert.match(c.risparmio.condizioni, /una sola pertinenza per categoria/);
});

test('niente valore complessivo se un lotto non ha un valore affidabile; quote e occupati negli avvisi', () => {
  const r = K.trova([casa, { ...box, affidabilita: 'bassa', rischi: ['quota'], stato: 'occupato' }], { T, oggi: '2026-10-13' });
  const c = r.combinazioni[0];
  assert.equal(c.numeri.valore, undefined);
  assert.equal(c.affidabilita, 'bassa');
  assert.match(c.nota, /solo 1 lotti su 2/);
  assert.match(c.avvisi.join(' '), /quota di proprietà/);
  assert.match(c.avvisi.join(' '), /occupato/);
});

test('procedure diverse (altro comune, altra data, altro numero) non si uniscono; aste passate escluse; un lotto solo non basta', () => {
  const altri = [{ ...box, id: 'b1', comune: 'Catania' }, { ...box, id: 'b2', dataAsta: '2026-12-02' }, { ...box, id: 'b3', rge: '121' }];
  assert.equal(K.trova([casa, ...altri], { T, oggi: '2026-10-13' }).trovate, 0);
  assert.equal(K.trova([{ ...casa, dataAsta: '2026-10-01' }, { ...box, dataAsta: '2026-10-01' }], { T, oggi: '2026-10-13' }).trovate, 0);
});

test('due abitazioni → unità vicine; due pertinenze sole → nessuna combinazione', () => {
  const r = K.trova([casa, { ...casa, id: 'a3', numeroLotto: '3' }], { T, oggi: '2026-10-13' });
  assert.equal(r.combinazioni[0].tipo, 'unita-vicine');
  assert.equal(K.trova([box, { ...box, id: 'a4' }], { T, oggi: '2026-10-13' }).trovate, 0);
});
