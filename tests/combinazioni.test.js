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

// casi reali del 22/10/2026 (titoli dei lotti sul PVP): lotti scambiati per pertinenze della prima casa
test('ruolo: uffici, D/8, laboratori e interi edifici non sono pertinenze; "unità a destinazione abitativa" è un\'abitazione', () => {
  assert.equal(K.ruolo({ titolo: 'Ufficio e cantina' }), 'commerciale');                                     // pvp-4611293
  assert.equal(K.ruolo({ titolo: 'Immobile a destinazione catastale D/8, costituito da autorimessa/officina al piano terreno, con soprastante…' }), 'commerciale'); // pvp-4620916
  assert.equal(K.ruolo({ titolo: '(A1+A2+A3+A4)A1 Laboratorio di panificazione A2 DepositoA3 Posto auto coperto da tettoia A4 Terreno' }), 'commerciale'); // pvp-4617711
  assert.notEqual(K.ruolo({ titolo: 'Intero edificio da cielo a terra compresa porzione di pertinenza dell’autorimessa al piano interrato…' }), 'pertinenza'); // pvp-4605394
  assert.notEqual(K.ruolo({ titolo: 'Piena proprietà di quattro fabbricati civili, un\'autorimessa, un deposito (silos) e un complesso di immobili…' }), 'pertinenza'); // pvp-4621985
  assert.equal(K.ruolo({ titolo: 'Piena proprietà di unità immobiliare a destinazione abitativa al rustico avanzato con adiacente soffitta al…' }), 'abitazione'); // pvp-4619357
  // pertinenze vere restano tali, anche dentro un complesso
  assert.equal(K.ruolo({ titolo: 'Posto auto scoperto posto nella corte interna di più ampio complesso immobiliare ubicato in Comune di…' }), 'pertinenza'); // pvp-4608725
  assert.equal(K.ruolo({ titolo: 'Box singolo sito al piano S1 con altezza interna 2,60 mt.' }), 'pertinenza'); // pvp-4624124
  // "piano terreno" non è un terreno
  assert.equal(K.ruolo({ titolo: 'Locale commerciale al piano terreno con annessi locali di servizio' }), 'commerciale');
});

test('categoria della pertinenza: una sola unità per lotto, altrimenti niente calcolo', () => {
  assert.equal(K.categoriaPertinenza({ titolo: 'Box singolo di mq 14,00 sito al piano S1' }), 'C/6');
  assert.equal(K.categoriaPertinenza({ titolo: 'Trattasi di cantina nell\'ambito di complesso immobiliare' }), 'C/2');
  assert.equal(K.categoriaPertinenza({ titolo: 'N. 9 posti auto e n. 1 cantina in autorimessa in Tarquinia (Vt) Vicolo delle Pietrare n. 4 al piano interrato…' }), null); // pvp-4605366
  assert.equal(K.categoriaPertinenza({ titolo: 'Piena proprietà di posti auto. Libero da persone e da cose' }), null); // pvp-4619374
});

test('risparmio "prima casa": niente su edifici interi e lotti di più posti auto (caso reale Tarquinia, prima 154.153 €)', () => {
  const p = { categoria: 'immobile', tribunale: 'Civitavecchia', rge: '145', comune: 'Tarquinia', provincia: 'VT', dataAsta: '2026-10-26' };
  const lotti = [
    { ...p, id: 'pvp-4604961', numeroLotto: '3', titolo: 'Appartamento con balcone al piano secondo interno 10 Palazzina A in Tarquinia (Vt) Vicolo delle Pietrare n. 4…', prezzoBase: 63000 },
    { ...p, id: 'pvp-4605389', numeroLotto: '4', titolo: 'Appartamento con balcone al piano quarto interno 22 Palazzina A in Tarquinia (Vt) Vicolo delle Pietrare n. 4…', prezzoBase: 63000 },
    { ...p, id: 'pvp-4605366', numeroLotto: '5', titolo: 'N. 9 posti auto e n. 1 cantina in autorimessa in Tarquinia (Vt) Vicolo delle Pietrare n. 4 al piano interrato…', prezzoBase: 84375 },
    { ...p, id: 'pvp-4605394', numeroLotto: '6', titolo: 'Intero edificio da cielo a terra compresa porzione di pertinenza dell’autorimessa al piano interrato…', prezzoBase: 1209375 },
    { ...p, id: 'pvp-4605399', numeroLotto: '7', titolo: 'Intero edificio da cielo a terra compresa porzione di pertinenza dell’autorimessa al piano interrato…', prezzoBase: 908437 }
  ];
  const c = K.trova(lotti, { T, oggi: '2026-10-22' }).combinazioni[0];
  assert.equal(c.numeri.risparmioPrimaCasa, undefined);
  assert.equal(c.risparmio, undefined);
});

test('risparmio "prima casa": una sola pertinenza per categoria (caso reale Ventimiglia, due box)', () => {
  const p = { categoria: 'immobile', tribunale: 'Imperia', rge: '54', comune: 'Ventimiglia', provincia: 'IM', dataAsta: '2026-11-17' };
  const lotti = [
    { ...p, id: 'pvp-4624122', numeroLotto: '1', titolo: 'Appartamento sito al piano quinto sottotetto int.28 composto da piccolo ingresso, bagno, un vano con angolo…', prezzoBase: 75335 },
    { ...p, id: 'pvp-4624124', numeroLotto: '3', titolo: 'Box singolo sito al piano S1 con altezza interna 2,60 mt.', prezzoBase: 71250 },
    { ...p, id: 'pvp-4624083', numeroLotto: '6', titolo: 'Box singolo di mq 14,00 sito al piano S1 con altezza interno 2,50 composto da un unico ampio vano dotato si…', prezzoBase: 46550 }
  ];
  const c = K.trova(lotti, { T, oggi: '2026-10-22' }).combinazioni[0];
  const atteso = C.imposteImmobile({ prezzo: 71250, regime: 'seconda-privato' }, T).totale - C.imposteImmobile({ prezzo: 71250, regime: 'prima-privato' }, T).totale;
  assert.equal(c.numeri.risparmioPrimaCasa, Math.round(atteso));
  assert.deepEqual(c.risparmio.voci.map((v) => [v.id, v.categoria]), [['pvp-4624124', 'C/6']]);
});

test('pertinenze troppo grandi o descritte insieme ad altri lotti: niente risparmio; "due unità residenziali" sono abitazioni', () => {
  // pvp-4618159 (Pelago, 640.000 €): il testo descrive anche gli altri lotti
  assert.equal(K.categoriaPertinenza({ titolo: 'Locale destinato urbanisticamente ad uso autorimessa. LOTTO 2: Locale destinato urbanisticamente ad uso…' }), null);
  // pvp-4630407 (Gravina in Puglia): autorimessa di 241 mq
  assert.equal(K.categoriaPertinenza({ titolo: 'Piena proprietà di Garage ubicato a Gravina in Puglia (BA)', superficieMq: 241 }), null);
  assert.equal(K.categoriaPertinenza({ titolo: 'Si tratta un locale destinato ad autorimessa della superficie di circa 820 mq., in corso di costruzione…' }), null); // pvp-4607012
  assert.equal(K.categoriaPertinenza({ titolo: 'Box della superficie commerciale di 22,63 mq, posta al piano terra.' }), 'C/6'); // pvp-4631427
  assert.equal(K.categoriaPertinenza({ titolo: 'LOTTO 3: box auto al piano interrato' }), 'C/6');
  // pvp-4633266 (Caraglio) e pvp-4608978
  assert.equal(K.ruolo({ titolo: 'Piena proprietà di due unità residenziali in buono stato:1)tre livelli: sotterraneo-cantina; primo: cucina…' }), 'abitazione');
  assert.equal(K.ruolo({ titolo: 'Piena proprietà di locale destinato ad attività commerciale al piano terra e locale box al piano semiterrato…' }), 'commerciale');
});
