const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../config/tariffe.js');
const P = require('../js/punteggio.js');

const base = { categoria: 'immobile', tipo: 'Immobile residenziale', comune: 'Genova', provincia: 'GE', stato: 'libero', rischi: [] };

test('senza stima né storico non c\'è valore né punteggio', () => {
  const r = P.valuta({ ...base, prezzoBase: 90000 }, { T });
  assert.equal(r.valore, null);
  assert.equal(r.punteggio, null);
  assert.match(r.mancanti.join(), /valore di mercato/);
});

test('prezzo base mancante o zero: nessun calcolo', () => {
  const r = P.valuta({ ...base, prezzoBase: 0, stima: 100000 }, { T });
  assert.equal(r.punteggio, null);
});

test('stima del perito, terza asta, libero e senza rischi: punteggio alto e forchetta ±10%', () => {
  const r = P.valuta({ ...base, prezzoBase: 90000, stima: 200000, superficieMq: 100, tentativo: 3 }, { T });
  assert.equal(r.valore.fonte, 'perizia');
  assert.equal(r.valore.min, 180000);
  assert.equal(r.valore.max, 220000);
  // costo = 90.000 + 9% registro + 50 + 50 + 1.500 spese = 99.700
  assert.equal(r.costoTotale, 99700);
  assert.ok(Math.abs(r.sconto - 0.5015) < 0.001);
  assert.equal(r.parti.sconto, 40);
  assert.equal(r.parti.tentativo, 9);
  assert.equal(r.parti.occupazione, 13);
  assert.equal(r.parti.rischi, 20);
  assert.equal(r.punteggio, 89);
  // offerta massima: costo totale entro l'80% del valore minimo (180.000 × 0,8 = 144.000)
  assert.ok(r.offertaMax > 120000 && r.offertaMax < 132000, String(r.offertaMax));
});

test('metri quadri assenti abbassano l\'affidabilità', () => {
  const r = P.valuta({ ...base, prezzoBase: 90000, stima: 200000, tentativo: 2 }, { T });
  assert.equal(r.valore.affidabilita, 'bassa');
  assert.match(r.valore.controlli.join(), /Metri quadri/);
  assert.equal(r.completo, false);
});

test('prezzo base più alto della stima: dato incoerente, affidabilità bassa', () => {
  const r = P.valuta({ ...base, prezzoBase: 150000, stima: 100000, superficieMq: 80, tentativo: 1 }, { T });
  assert.equal(r.valore.affidabilita, 'bassa');
  assert.match(r.valore.controlli.join(), /incoerente/);
});

test('prima asta: il valore è il prezzo base e lo sconto è negativo (nessun affare)', () => {
  const r = P.valuta({ ...base, prezzoBase: 100000, superficieMq: 90, tentativo: 1 }, { T });
  assert.equal(r.valore.fonte, 'prima-asta');
  assert.ok(r.sconto < 0);
  assert.equal(r.parti.sconto, 0);
});

test('secondo tentativo senza stima: valore dal primo prezzo', () => {
  const r = P.valuta({ ...base, prezzoBase: 75000, primoPrezzo: 100000, superficieMq: 90, tentativo: 2 }, { T });
  assert.equal(r.valore.fonte, 'primo-prezzo');
  assert.equal(r.valore.centrale, 100000);
  assert.equal(r.valore.affidabilita, 'bassa');
});

test('rischi gravi tolgono punti, occupato vale zero', () => {
  const sano = P.valuta({ ...base, prezzoBase: 90000, stima: 200000, superficieMq: 100, tentativo: 3 }, { T });
  const quota = P.valuta({ ...base, prezzoBase: 90000, stima: 200000, superficieMq: 100, tentativo: 3, rischi: ['quota', 'abusi'] }, { T });
  assert.equal(quota.parti.rischi, 0);
  const occ = P.valuta({ ...base, stato: 'occupato', prezzoBase: 90000, stima: 200000, superficieMq: 100, tentativo: 3, rischi: ['occupazione'] }, { T });
  assert.equal(occ.parti.occupazione, 0);
  assert.equal(occ.parti.rischi, 20); // l'occupazione non si conta due volte
  assert.ok(quota.punteggio < sano.punteggio && occ.punteggio < sano.punteggio);
});

test('rischi non controllati: punti neutri e segnalati come mancanti', () => {
  const a = { ...base, prezzoBase: 90000, stima: 200000, superficieMq: 100, tentativo: 3 };
  delete a.rischi;
  const r = P.valuta(a, { T });
  assert.equal(r.parti.rischi, 10);
  assert.match(r.mancanti.join(), /rischi/);
});

test('confronto con la zona: stima fuori scala → affidabilità bassa; coerente con molte perizie → alta', () => {
  const zona = [];
  for (let i = 0; i < 12; i++) zona.push({ ...base, stima: 200000 + i * 1000, superficieMq: 100 });
  const zone = P.indiceZone(zona);
  assert.equal(zone.comune['Genova|GE'].n, 12);
  const fuori = P.valuta({ ...base, prezzoBase: 300000, stima: 900000, superficieMq: 60, tentativo: 2 }, { T, zone });
  assert.equal(fuori.valore.affidabilita, 'bassa');
  assert.match(fuori.valore.controlli.join(), /fuori scala/);
  const ok = P.valuta({ ...base, prezzoBase: 120000, stima: 200000, superficieMq: 95, tentativo: 2 }, { T, zone });
  assert.equal(ok.valore.affidabilita, 'alta');
});

test('auto: costo con diritti d\'asta e passaggio, punteggio calcolato', () => {
  const r = P.valuta({ categoria: 'auto', provincia: 'MI', prezzoBase: 5000, stima: 9000, tentativo: 2, rischi: [] }, { T });
  assert.ok(r.costoTotale > 5000);
  assert.ok(r.punteggio > 0);
  assert.equal(r.parti.occupazione, 8);
});

test('compatto e fasce', () => {
  const r = P.valuta({ ...base, prezzoBase: 90000, stima: 200000, superficieMq: 100, tentativo: 3 }, { T });
  const c = P.compatto(r);
  assert.deepEqual(Object.keys(c).sort(), ['affidabilita', 'costoTotale', 'fonteValore', 'offertaMax', 'punteggio', 'punteggioCompleto', 'sconto', 'valore', 'valoreMax', 'valoreMin']);
  assert.deepEqual(P.compatto({ valore: null }), {});
  assert.equal(P.fascia(89).chiave, 'ottimo');
  assert.equal(P.fascia(null).chiave, 'nd');
});

test('OMI: zona riconosciuta → valore dalla quotazione, forchetta min–max, affitto e rendimento nella zona', () => {
  const a = { ...base, prezzoBase: 90000, superficieMq: 100, tentativo: 2, omiMin: 150000, omiMax: 210000, omiAffMin: 600, omiAffMax: 800, omiMetodo: 'indirizzo' };
  const r = P.valuta(a, { T });
  assert.equal(r.valore.fonte, 'omi');
  assert.equal(r.valore.min, 150000);
  assert.equal(r.valore.max, 210000);
  assert.equal(r.valore.affidabilita, 'media');
  assert.ok(r.rendimento > 0.08 && r.rendimento < 0.09, String(r.rendimento)); // 700 € × 12 / 99.700 € di costo = 8,4%
  assert.equal(r.parti.zona, 15);
  assert.ok(!r.mancanti.some((m) => /affitto della zona/.test(m)));
});

test('OMI e perizia concordano → affidabilità alta; molto diversi → bassa con spiegazione', () => {
  const ok = P.valuta({ ...base, prezzoBase: 90000, superficieMq: 100, tentativo: 2, stima: 175000, omiMin: 150000, omiMax: 210000, omiMetodo: 'unica' }, { T });
  assert.equal(ok.valore.affidabilita, 'alta');
  const ko = P.valuta({ ...base, prezzoBase: 90000, superficieMq: 100, tentativo: 2, stima: 400000, omiMin: 150000, omiMax: 210000, omiMetodo: 'indirizzo' }, { T });
  assert.equal(ko.valore.affidabilita, 'bassa');
  assert.match(ko.valore.controlli.join(), /molto diversi/);
});

test('OMI del solo comune: la stima del perito ha la precedenza; senza perizia valore OMI con affidabilità bassa', () => {
  const p = P.valuta({ ...base, prezzoBase: 90000, superficieMq: 100, tentativo: 2, stima: 170000, omiMin: 150000, omiMax: 210000, omiMetodo: 'comune' }, { T });
  assert.equal(p.valore.fonte, 'perizia');
  const c = P.valuta({ ...base, prezzoBase: 90000, superficieMq: 100, tentativo: 2, omiMin: 150000, omiMax: 210000, omiMetodo: 'comune' }, { T });
  assert.equal(c.valore.fonte, 'omi-comune');
  assert.equal(c.valore.affidabilita, 'bassa');
});
