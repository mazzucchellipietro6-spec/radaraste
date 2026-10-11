const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../config/tariffe.js');
const C = require('../js/calcoli.js');

test('offerta minima = 75% del prezzo base', () => {
  assert.equal(C.offertaMinima(100000, T), 75000);
});

test('soglie del giudizio', () => {
  assert.equal(C.giudizio(0.30, T).etichetta, 'Affare');
  assert.equal(C.giudizio(0.25, T).etichetta, 'Affare');
  assert.equal(C.giudizio(0.20, T).etichetta, 'Conviene');
  assert.equal(C.giudizio(0.10, T).etichetta, 'Margine stretto');
  assert.equal(C.giudizio(0.04, T).etichetta, 'Non conviene');
});

test('prima casa da privato: 2% con minimo 1.000 € + 50 + 50', () => {
  assert.equal(C.imposteImmobile({ prezzo: 100000, regime: 'prima-privato' }, T).totale, 2100);
  assert.equal(C.imposteImmobile({ prezzo: 30000, regime: 'prima-privato' }, T).totale, 1100);
});

test('seconda casa: 9% + fisse', () => {
  assert.equal(C.imposteImmobile({ prezzo: 100000, regime: 'seconda-privato' }, T).totale, 9100);
});

test('prezzo-valore: rendita × 1,05 × 120 se più basso del prezzo', () => {
  const r = C.imposteImmobile({ prezzo: 200000, regime: 'seconda-privato', rendita: 900 }, T);
  assert.ok(r.prezzoValore);
  assert.equal(Math.round(r.base), 113400);
  assert.equal(Math.round(r.totale), Math.round(113400 * 0.09) + 100);
});

test('prezzo-valore ignorato se il valore catastale supera il prezzo', () => {
  const r = C.imposteImmobile({ prezzo: 50000, regime: 'prima-privato', rendita: 900 }, T);
  assert.equal(r.prezzoValore, false);
});

test('da impresa con IVA 10%: IVA + 3 × 200 €', () => {
  assert.equal(C.imposteImmobile({ prezzo: 200000, regime: 'seconda-iva' }, T).totale, 20600);
  assert.equal(C.imposteImmobile({ prezzo: 200000, regime: 'lusso-iva' }, T).totale, 44600);
});

test('strumentale IVA: 22% + 200 + 3% + 1%', () => {
  assert.equal(C.imposteImmobile({ prezzo: 100000, regime: 'strumentale-iva' }, T).totale, 22000 + 200 + 3000 + 1000);
});

test('costo immobile e giudizio', () => {
  const r = C.costoImmobile({ prezzoBase: 120000, offerta: 95000, valoreMercato: 165000, regime: 'prima-privato',
    condominioCorrente: 1200, condominioPrecedente: 1200, lavori: 15000, liberazione: 0, speseProcedura: 1500 }, T);
  assert.equal(r.totale, 95000 + 1900 + 100 + 2400 + 15000 + 1500);
  assert.equal(r.offertaMinima, 90000);
  assert.ok(r.offertaValida);
  assert.equal(r.giudizio.etichetta, 'Affare'); // (165000-115900)/165000 ≈ 29,8%
});

test('offerta massima tiene il costo al ~80% del mercato', () => {
  const input = { prezzoBase: 120000, valoreMercato: 165000, regime: 'seconda-privato', lavori: 10000, speseProcedura: 1500 };
  const max = C.offertaMassima(C.costoImmobile, input, T);
  const tot = C.costoImmobile({ ...input, offerta: max }, T).totale;
  assert.ok(tot <= 165000 * 0.8, 'costo entro l\'obiettivo');
  assert.ok(165000 * 0.8 - tot < 200, 'vicino all\'obiettivo');
});

test('offerta massima = 0 se i costi fissi superano già l\'obiettivo', () => {
  assert.equal(C.offertaMassima(C.costoImmobile, { valoreMercato: 10000, regime: 'prima-privato', lavori: 20000 }, T), 0);
});

test('IPT: fissa fino a 53 kW, per kW oltre, maggiorazione provinciale', () => {
  assert.equal(C.ipt({ kw: 50, provincia: 'TN' }, T).importo, 151);
  assert.equal(C.ipt({ kw: 100, provincia: 'AO' }, T).importo, Math.round(351.19));
  assert.equal(C.ipt({ kw: 100, provincia: 'MI' }, T).importo, Math.round(351.19 * 1.3));
  assert.equal(C.ipt({ kw: 100, provincia: 'MI', soggettoIva: true }, T).importo, Math.round(150.81 * 1.3));
});

test('costo veicolo con diritti e IVA sui diritti', () => {
  const r = C.costoVeicolo({ tipo: 'auto', offerta: 10000, valoreMercato: 15000, dirittiQuota: 0.10, ivaSuDiritti: true, kw: 50, provincia: 'TN', riparazioni: 500, trasporto: 200 }, T);
  assert.equal(Math.round(r.totale), Math.round(10000 + 1000 + 220 + (151 + 27 + 32 + 10.2) + 500 + 200));
});

test('beni mobili: niente passaggio di proprietà', () => {
  const r = C.costoVeicolo({ tipo: 'beni', offerta: 1000, valoreMercato: 2000, dirittiQuota: 0.1 }, T);
  assert.equal(r.passaggio, null);
  assert.equal(Math.round(r.totale), 1122);
});

test('bollo Euro 6 nazionale e superbollo', () => {
  assert.equal(C.bolloAuto({ kw: 100, euro: 'Euro 4-5-6', regione: 'Lazio' }, T).bollo, 258);
  assert.equal(C.bolloAuto({ kw: 120, euro: 'Euro 4-5-6', regione: 'Lazio' }, T).bollo, 258 + 20 * 3.87);
  assert.equal(C.bolloAuto({ kw: 200, euro: 'Euro 4-5-6', regione: 'Lazio', anniVeicolo: 2 }, T).superbollo, 300);
  assert.equal(C.bolloAuto({ kw: 200, euro: 'Euro 4-5-6', regione: 'Lazio', anniVeicolo: 12 }, T).superbollo, 90);
});

test('IMU e plusvalenza', () => {
  assert.equal(C.imuAnnua({ rendita: 1000, aliquota: 0.0106 }, T).importo, Math.round(1000 * 1.05 * 160 * 0.0106));
  assert.equal(C.plusvalenza({ prezzoVendita: 180000, costoAcquisto: 150000, anniPossesso: 2 }, T).imposta, 7800);
  assert.equal(C.plusvalenza({ prezzoVendita: 180000, costoAcquisto: 150000, anniPossesso: 6 }, T).imposta, 0);
});
