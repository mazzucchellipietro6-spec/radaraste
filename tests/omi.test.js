const test = require('node:test');
const assert = require('node:assert/strict');
const Omi = require('../js/omi.js');

// estratto in formato OMI reale (separatore ';', prima riga titolo, seconda intestazione)
const ZONE = `Quotazioni Immobiliari : Informazioni di Zona OMI - Semestre 2025/2 - elaborazione del 12-OTT-26
Area_territoriale;Regione;Prov;Comune_ISTAT;Comune_cat;Sez;Comune_amm;Comune_descrizione;Fascia;Zona_Descr;Zona;LinkZona;Cod_tip_prev;Descr_tip_prev;Stato_prev;Microzona;
ISOLE;SICILIA;SR;19089012;I754; ;F107;MELILLI;B;'CENTRO URBANO';B1;SR00000001;20;Abitazioni civili;N;1;
ISOLE;SICILIA;SR;19089012;I754; ;F107;MELILLI;E;'VILLASMUNDO';E1;SR00000002;20;Abitazioni civili;N;1;
ISLE;CAMPANIA;CB;14006;B519; ;B519;CAMPOBASSO;D;'QUARTIERI SAN GIOVANNI E CONTRADA SANT\`ANTONIO DEI LAZZARI';D2;CB00000002;20;Abitazioni civili;N;1;
ISLE;CAMPANIA;CB;14006;B519; ;B519;CAMPOBASSO;B;'CENTRO STORICO';B1;CB00000001;20;Abitazioni civili;N;1;
`;
const VALORI = `Quotazioni Immobiliari : Valori di Mercato - Semestre 2025/2 - elaborazione del 12-OTT-26
Area_territoriale;Regione;Prov;Comune_ISTAT;Comune_cat;Sez;Comune_amm;Comune_descrizione;Fascia;Zona;LinkZona;Cod_Tip;Descr_Tipologia;Stato;Stato_prev;Compr_min;Compr_max;Sup_NL_compr;Loc_min;Loc_max;Sup_NL_loc;
ISOLE;SICILIA;SR;19089012;I754; ;F107;MELILLI;B;B1;SR00000001;20;Abitazioni civili;NORMALE;P;800;1000;L;3;4;L;
ISOLE;SICILIA;SR;19089012;I754; ;F107;MELILLI;E;E1;SR00000002;20;Abitazioni civili;NORMALE;P;640;710;L;2,4;3,1;L;
ISOLE;SICILIA;SR;19089012;I754; ;F107;MELILLI;E;E1;SR00000002;20;Abitazioni civili;SCADENTE;P;450;520;L;1,8;2,2;L;
ISLE;CAMPANIA;CB;14006;B519; ;B519;CAMPOBASSO;D;D2;CB00000002;20;Abitazioni civili;NORMALE;P;700;900;L;3;4;L;
ISLE;CAMPANIA;CB;14006;B519; ;B519;CAMPOBASSO;B;B1;CB00000001;20;Abitazioni civili;NORMALE;P;1100;1500;L;4;5;L;
`;
const ind = Omi.costruisciIndice(ZONE, VALORI, null);

test('indice: semestre, comuni, zone e valori letti dal formato OMI', () => {
  assert.equal(ind.semestre, '2025/2');
  assert.equal(ind.comuni['MELILLI|SR'].zone.length, 2);
  assert.deepEqual(ind.valori.SR00000002['20'][0].slice(0, 5), ['N', 640, 710, 2.4, 3.1]);
});

test('zona dalla frazione nell\'indirizzo: Villasmundo (caso reale pvp-4644761)', () => {
  const a = { categoria: 'immobile', tipo: 'Immobile residenziale', comune: 'Melilli', provincia: 'SR', indirizzo: 'frazione Villasmundo, Via delle Rose, 24', superficieMq: 117, titolo: 'appartamento' };
  const s = Omi.stima(a, ind, { testo: 'Piena proprietà di appartamento' });
  assert.equal(s.zona.codice, 'E1');
  assert.equal(s.affidabilita, 'media');
  assert.deepEqual(s.valore, { min: 74880, max: 83070, centrale: 78975 });
  assert.deepEqual(s.affitto, { min: 281, max: 363 });
});

test('una parola in comune non basta: "Via Sant\'Antonio Abate" non è la contrada Sant\'Antonio dei Lazzari', () => {
  const a = { categoria: 'immobile', tipo: 'Immobile residenziale', comune: 'Campobasso', provincia: 'CB', indirizzo: 'Via Sant\'Antonio Abate, 86100 Campobasso CB, Italia', superficieMq: 80 };
  const s = Omi.stima(a, ind, {});
  assert.equal(s.zona, null);
  assert.equal(s.affidabilita, 'bassa');
  assert.match(s.note.join(), /valori tipici del comune/);
});

test('stato scadente dall\'avviso → quotazione "scadente" se esiste; niente mq → niente valore', () => {
  const a = { categoria: 'immobile', tipo: 'Immobile residenziale', comune: 'Melilli', provincia: 'SR', indirizzo: 'frazione Villasmundo', superficieMq: 100 };
  assert.equal(Omi.stima(a, ind, { conservazione: 'da ristrutturare' }).euroMq.min, 450);
  const senza = Omi.stima({ ...a, superficieMq: null }, ind, {});
  assert.equal(senza.valore, undefined);
  assert.match(senza.mancante, /metri quadri/);
});

test('tipologie: terreni non quotati, box, ville, negozi', () => {
  assert.equal(Omi.tipologia({ tipo: 'Altra categoria', titolo: 'terreno agricolo di 2 ettari' }), null);
  assert.deepEqual(Omi.tipologia({ tipo: 'Immobile residenziale', titolo: 'box auto al piano interrato' }), ['13']);
  assert.equal(Omi.tipologia({ tipo: 'Immobile residenziale', titolo: 'villino su due piani' })[0], '1');
  assert.deepEqual(Omi.tipologia({ tipo: 'Immobile commerciale', titolo: 'locale commerciale' }), ['5']);
});

test('comune con nome scritto diversamente e comune assente', () => {
  assert.ok(Omi.trovaComune(ind, 'melilli', 'SR'));
  assert.equal(Omi.stima({ categoria: 'immobile', comune: 'Inesistente', provincia: 'XX' }, ind, {}).mancante, 'comune non trovato nelle quotazioni OMI');
});

test('lotto con più unità e superfici diverse (caso reale Albosaggia): valore OMI con affidabilità bassa', () => {
  const a = { categoria: 'immobile', tipo: 'Immobile residenziale', comune: 'Melilli', provincia: 'SR', indirizzo: 'frazione Villasmundo', superficieMq: 57.4 };
  const testo = 'Abitazione della superficie commerciale di 57,40 mq. + Deposito della superficie commerciale di 20,50 mq. + Fabbricato rurale della superficie commerciale di 75,00 mq. + Cantina della superficie commerciale di 21,80 mq.';
  const s = Omi.stima(a, ind, { testo });
  assert.equal(s.affidabilita, 'bassa');
  assert.match(s.note.join(), /più unità con superfici diverse/);
  // una sola unità, superficie ripetuta: nessun allarme
  const uno = Omi.stima(a, ind, { testo: 'Appartamento della superficie commerciale di 57,40 mq. Superficie commerciale di 57,40 mq.' });
  assert.equal(uno.affidabilita, 'media');
});
