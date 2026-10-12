const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/estrai.js');

test('superficie indicata in modi diversi', () => {
  assert.equal(E.superficie('Appartamento in Via Diaz n. 25, della superficie commerciale di 100,34 mq.').mq, 100.34);
  assert.equal(E.superficie('categoria A/2, consistenza 5,5 vani, superficie catastale totale 80 mq, r.c. 355,06').mq, 80);
  assert.equal(E.superficie('Locale in Via Beata Chiara di circa 29 mq.').mq, 29);
  assert.equal(E.superficie('Terreno di 1.930 mq').mq, 1930);
});

test('superficie: ignora giardini e box, usa i vani se non c\'è altro', () => {
  assert.equal(E.superficie('Villetta con giardino di 300 mq e box'), null);
  const v = E.superficie('Unità immobiliare cat. A/3, consistenza 6,5 vani');
  assert.equal(v.mq, null); assert.equal(v.vani, 6.5);
  assert.equal(E.superficie('Appartamento al secondo piano'), null);
});

test('stato di conservazione', () => {
  assert.equal(E.conservazione('capannone lasciato inconcluso e al grezzo').stato, 'grezzo');
  assert.equal(E.conservazione('risulta completato e rifinito, dotato di impianti').stato, 'buono');
  assert.equal(E.conservazione('vigneto in stato di abbandono').stato, 'da ristrutturare');
  assert.equal(E.conservazione('Appartamento al piano terzo'), null);
});

test('veicoli: marca, modello, anno, km, alimentazione', () => {
  const a = E.veicolo('LOTTO 1: AUTOVETTURA TOYOTA CHR TG GJ*****, BENZINA/IBRIDO ELETTRICO, CILINDRATA 1800cc, ANNO PRIMA IMMATRICOLAZIONE 2022. KM RILEVATI 44.213 KM');
  assert.deepEqual([a.marca, a.modello, a.anno, a.km, a.alimentazione], ['Toyota', 'CHR', 2022, 44213, 'ibrida']);
  const b = E.veicolo('Lotto 2: Autocarro marca Fiat, modello Fiorino di colore bianco, targato, anno 2009, alimentazione gasolio');
  assert.deepEqual([b.tipo, b.marca, b.modello, b.anno, b.alimentazione], ['autocarro', 'Fiat', 'Fiorino', 2009, 'diesel']);
  const c = E.veicolo('Automobile Mercedes Benz C220 SW diesel targata CJ282TK anno 2003');
  assert.deepEqual([c.marca, c.modello, c.anno], ['Mercedes-Benz', 'C220 SW', 2003]);
  assert.equal(E.veicolo('Fiat Punto tg DC075KW anno di immatricolazione 2006 Kilometraggio 330.000').km, 330000);
});

test('veicoli: lotti multipli e auto d\'epoca segnalati', () => {
  assert.equal(E.veicolo('a) Automezzo: si tratta di un’ape quadriciclo b) Automezzo: si tratta di una ford focus c) Automezzo: furgone Peugeot').multiplo, true);
  assert.equal(E.veicolo('autovettura Fiat 500 d\'epoca, targa FG138586, stato pessimo').epoca, true);
});

test('rischi: quota parziale sì, piena proprietà no', () => {
  const chiavi = (t) => E.rischi(t).map((r) => r.chiave);
  assert.ok(chiavi('Quota 1/12 di appartamento a Primaluna').includes('quota'));
  assert.ok(chiavi('Diritti pari a ½ della nuda proprietà su un fabbricato').includes('quota'));
  assert.ok(!chiavi('Piena proprietà per la quota di 1000/1000 di una unità immobiliare').includes('quota'));
  assert.ok(!chiavi('Per la quota 1/1 di usufrutto e 1/1 di nuda proprietà: appartamento').includes('quota'));
  assert.ok(chiavi('Sono presenti difformità edilizie sanabili').includes('abusi'));
  assert.ok(chiavi('Terreno agricolo ad uso seminativo').includes('agricolo'));
});
