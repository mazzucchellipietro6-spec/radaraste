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

test('superficie: totale dichiarato prima delle misure parziali, pertinenze escluse (casi reali del PVP)', () => {
  // pvp-4644196: portico di 18 mq citato prima del totale
  assert.equal(E.superficie('piano interrato non residenziale: magazzino, deposito e sottoscala; oltre portico di circa 18 mq; per complessivi mq 176,00 circa (superficie commerciale)').mq, 176);
  // pvp-4618538: solo cantina e box hanno i mq → nessuna superficie per l'appartamento
  const capurso = E.superficie('Appartamento al secondo piano composto da tre vani e accessori, cantinola al piano interrato della superficie di circa mq 8, box auto al piano interrato della superficie di circa 12 mq.');
  assert.ok(!capurso || !capurso.mq);
  // pvp-4633087: i mq sono del garage C/6
  const tito = E.superficie('- unità immobiliare adibita ad abitazione, sita in Tito, cat. A/2, classe 05, vani 4,5, rendita €. 325,37;- unità immobiliare adibita a garage, sita in Tito, cat. C/6, classe 04, mq 22, rendita €. 28,41');
  assert.ok(!tito || !tito.mq);
  // pvp-4628804: abitazione e box con "6,5 vani e 28 mq": i 28 mq non sono dell'abitazione
  assert.equal(E.superficie('quota intera di un\'abitazione di tipo civile e di un box auto, Ctg. A/2 e C/6, 6,5 vani e 28 mq.').mq, null);
  assert.equal(E.superficie('Appartamento a PORTO RECANATI, della superficie commerciale di 66,6 mq').mq, 66.6);
  assert.equal(E.superficie('appartamento di 76 mq di 5 vani catastali e terrazzo di 20 mq').mq, 76);
});

test('degrado e stato di conservazione: "allo stato grezzo", "al rustico avanzato", "diruto", "collabenti" (casi reali del PVP, 22/10/2026)', () => {
  const casi = [
    // pvp-4644746 (Sora)
    ['appartamento ubicato a Sora (Fr) via dei Passionisti snc, primo piano posto al primo piano, adibito a civile abitazione attualmente allo stato grezzo, inserito in un fabbricato privo di ascensore', 'grezzo'],
    // pvp-4619319 (Castegnato)
    ['Piena proprietà di appartamento al rustico avanzato posto al piano secondo con cantina esclusiva', 'grezzo'],
    // pvp-4631333 (Camerino)
    ['Diritti di piena proprietà su fabbricati diruti a CAMERINO Frazione Tuseggia', 'rudere'],
    // pvp-4623490 (Luni)
    ['Quota di 12/42 della piena proprietà di due unità collabenti site nel Comune di Luni (SP).', 'rudere']
  ];
  for (const [t, stato] of casi) {
    assert.ok(E.rischi(t).some((r) => r.chiave === 'degrado'), t);
    assert.equal(E.conservazione(t).stato, stato, t);
  }
  // pvp-4638150 (Cerreto Guidi): il fabbricato accessorio "in parte diruto" è un rischio da verificare
  assert.ok(E.rischi('altro fabbricato accessorio di circa mq 34, in pessimo stato di conservazione ed in parte diruto, e corte esterna esclusiva').some((r) => r.chiave === 'degrado'));
  // fabbricato "rustico" (rurale) o in buono stato: nessun degrado
  assert.ok(!E.rischi('Fabbricato rustico in pietra ristrutturato, in buono stato').some((r) => r.chiave === 'degrado'));
});
