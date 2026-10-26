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

test('stato letto dall\'avviso come lo passa la raccolta (oggetto di Estrai.conservazione): quotazione "scadente" (bug trovato il 22/10/2026)', () => {
  const E = require('../js/estrai.js');
  const a = { categoria: 'immobile', tipo: 'Immobile residenziale', comune: 'Melilli', provincia: 'SR', indirizzo: 'frazione Villasmundo', superficieMq: 100 };
  // testo reale di pvp-4638150 (Cerreto Guidi): prima lo stato si perdeva e si usava sempre la quotazione "normale"
  const testo = 'Piena proprietà di un fabbricato urbano per civile abitazione su due piani fuori terra per circa 139 mq oltre ampia soffitta al piano secondo sottotetto di circa mq 69 e altro fabbricato accessorio di circa mq 34, in pessimo stato di conservazione ed in parte diruto, e corte esterna esclusiva di circa mq 360.';
  const c = E.conservazione(testo);
  assert.equal(Omi.statoOmi(c), 'S');
  const s = Omi.stima(a, ind, { testo, conservazione: c });
  assert.equal(s.stato, 'scadente');
  assert.equal(s.euroMq.min, 450);
});

test('valori tipici del comune: lo stato si usa solo se tutte le zone lo quotano, senza mescolare stati diversi', () => {
  // Melilli: la zona B1 quota solo "normale", la E1 anche "scadente" → per il comune si resta sul normale
  const a = { categoria: 'immobile', tipo: 'Immobile residenziale', comune: 'Melilli', provincia: 'SR', indirizzo: 'Via Inesistente', superficieMq: 100 };
  const s = Omi.stima(a, ind, { conservazione: { stato: 'da ristrutturare' } });
  assert.equal(s.zona, null);
  assert.equal(s.stato, 'normale');
  assert.deepEqual(s.euroMq, { min: 720, max: 855 });   // mediana di 800/640 e 1000/710: solo righe "normale"
  assert.match(s.note.join(), /non quotato in tutte le zone del comune/);
});

test('stato "ottimo" scritto nell\'avviso: per prudenza non alza il valore (caso reale pvp-4621160, Giovo)', () => {
  const E = require('../js/estrai.js');
  const a = { categoria: 'immobile', tipo: 'Immobile residenziale', comune: 'Melilli', provincia: 'SR', indirizzo: 'frazione Villasmundo', superficieMq: 100 };
  const c = E.conservazione('un edificio che si sviluppa in quattro piani fuori terra, in ottimo stato di conservazione');
  assert.equal(Omi.statoOmi(c), 'O');
  // indice di prova con una quotazione "ottimo" (numeri finti) nella zona E1
  const conOttimo = Omi.costruisciIndice(ZONE, VALORI + 'ISOLE;SICILIA;SR;19089012;I754; ;F107;MELILLI;E;E1;SR00000002;20;Abitazioni civili;OTTIMO;P;900;1100;L;3;4;L;\n', null);
  const s = Omi.stima(a, conOttimo, { conservazione: c });
  assert.equal(s.stato, 'normale');
  assert.equal(s.euroMq.min, 640);
  assert.match(s.note.join(), /per prudenza si usa la quotazione dello stato normale/);
});

/* Sigle di provincia delle aste diverse dall'indice OMI (bug del 19/10: ~1.000 immobili senza dati OMI, es. Fano).
 * Nomi e sigle come nell'indice OMI 2025/2; codici, zone, valori e compravendite sono finti. */
const SIGLE = [['PS', 'FANO'], ['PS', 'PEGLIO'], ['CO', 'PEGLIO'], ['FO', 'FORLI`'], ['BA', 'ANDRIA'], ['FG', 'TRINITAPOLI'], ['MI', 'MONZA'],
  ['CA', 'CARBONIA'], ['AP', 'SANT`ELPIDIO A MARE'], ['BG', 'CASTRO'], ['LE', 'CASTRO']];
const ZONE_SIGLE = ZONE.split('\n').slice(0, 2).join('\n') + '\n' +
  SIGLE.map(([p, n], i) => `X;X;${p};0;Z${i}; ;Z${i};${n};B;'CENTRO';B1;L${i};20;Abitazioni civili;N;1;`).join('\n') + '\n';
const VALORI_SIGLE = VALORI.split('\n').slice(0, 2).join('\n') + '\nX;X;PS;0;Z0; ;Z0;FANO;B;B1;L0;20;Abitazioni civili;NORMALE;P;1000;1400;L;4;5;L;\n';
const VCN = { listaCom: 'Area;Regione;Provincia;2025_CodCom;Comune;Cap;TAGLIA MERCATO\nX;X;PS;Z0;FANO;0;M\n',
  valoriRes: 'Area;Regione;Provincia;2025_CodCom;NTN 2025 fino a 50 mq;NTN_2025\nX;X;PS;Z0;10;512,5\n', anno: null };
const indSigle = Omi.costruisciIndice(ZONE_SIGLE, VALORI_SIGLE, VCN);
// caso reale pvp-4635797
const FANO = { categoria: 'immobile', tipo: 'Immobile residenziale', comune: 'Fano', provincia: 'PU', indirizzo: 'Via Alessandro Brenci n. 6', superficieMq: 222,
  titolo: 'Unità immobiliare sita in Fano, Via Alessandro Brenci, n. 6' };

test('sigle diverse dall\'indice OMI: PU è PS, FC è FO (casi reali Fano pvp-4635797, Forlì pvp-4613346, Peglio pvp-4630242)', () => {
  assert.equal(Omi.trovaComune(indSigle, 'Fano', 'PU').prov, 'PS');
  assert.equal(Omi.trovaComune(indSigle, 'Forlì', 'FC').nome, 'FORLI`');
  // Peglio c'è anche in provincia di Como: con la sigla PU si prende quello di Pesaro e Urbino
  assert.equal(Omi.trovaComune(indSigle, 'Peglio', 'PU').prov, 'PS');
});

test('Fano (PU): valore OMI e compravendite con l\'anno, la scheda scrive "Nel 2025"', () => {
  const s = Omi.stima(FANO, indSigle, {});
  assert.equal(s.comune, 'FANO');
  assert.deepEqual(s.valore, { min: 222000, max: 310800, centrale: 266400 });
  assert.deepEqual(s.compravendite, { ntn: 512.5, taglia: 'M', anno: '2025' });
  const SD = require('../js/scheda-dati.js');
  assert.match(SD.zona({ ...FANO, omi: s }).omi.compravendite.testo, /^Nel 2025 a /);
  // indice senza anno: compravendite come prima (la scheda scrive "In un anno")
  assert.deepEqual(Omi.stima(FANO, { ...indSigle, anno: null }, {}).compravendite, { ntn: 512.5, taglia: 'M' });
});

test('anno delle compravendite dalla colonna NTN_2025, anche se il nome del file dice altro', () => {
  assert.equal(indSigle.anno, '2025');
  assert.equal(Omi.costruisciIndice(ZONE_SIGLE, VALORI_SIGLE, { ...VCN, anno: '2024' }).anno, '2025');
});

test('province nate dopo l\'indice OMI (MB, SU, BT, FM): il comune si cerca nelle province da cui sono nate (casi reali)', () => {
  assert.equal(Omi.trovaComune(indSigle, 'Andria', 'BT').prov, 'BA');        // pvp-4620844
  assert.equal(Omi.trovaComune(indSigle, 'Trinitapoli', 'BT').prov, 'FG');   // pvp-4636781
  assert.equal(Omi.trovaComune(indSigle, 'Monza', 'MB').prov, 'MI');         // pvp-4630879
  assert.equal(Omi.trovaComune(indSigle, 'Carbonia', 'SU').prov, 'CA');      // pvp-4616674
  assert.equal(Omi.trovaComune(indSigle, 'Sant\'Elpidio a Mare', 'FM').nome, 'SANT`ELPIDIO A MARE'); // pvp-4618077
  // fuori dalle province d'origine solo un nome unico in tutta Italia (caso costruito)
  assert.equal(Omi.trovaComune(indSigle, 'Fano', 'FM').prov, 'PS');
});

test('omonimo ambiguo: nessun abbinamento, con il motivo', () => {
  // Castro c'è in provincia di Bergamo e di Lecce, nessuno dei due nelle province d'origine della BAT (Bari, Foggia).
  // Asta costruita: nei dati del 22/10 nessuna asta delle province nuove ha un nome ambiguo.
  assert.equal(Omi.trovaComune(indSigle, 'Castro', 'BT'), null);
  const s = Omi.stima({ categoria: 'immobile', tipo: 'Immobile residenziale', comune: 'Castro', provincia: 'BT', superficieMq: 80 }, indSigle, {});
  assert.equal(s.valore, undefined);
  assert.match(s.mancante, /più comuni con questo nome/);
  // con la sigla giusta si trova; una sigla vecchia senza il comune resta "non trovato"
  assert.equal(Omi.trovaComune(indSigle, 'Castro', 'LE').prov, 'LE');
  assert.equal(Omi.stima({ categoria: 'immobile', comune: 'Castro', provincia: 'BA' }, indSigle, {}).mancante, 'comune non trovato nelle quotazioni OMI');
});

test('zona che quota solo lo stato "ottimo": la nota lo dice (prima: Stato "undefined") e l\'affidabilità è bassa', () => {
  // 24 immobili così nei dati locali del 26/10/2026, es. pvp-4630309 (negozio, Potenza Picena) e pvp-4616531 (Andria):
  // qui la zona E1 di Melilli con una quotazione dei negozi solo "ottimo" (numeri finti)
  const soloOttimo = Omi.costruisciIndice(ZONE, VALORI + 'ISOLE;SICILIA;SR;19089012;I754; ;F107;MELILLI;E;E1;SR00000002;5;Negozi;OTTIMO;P;900;1100;L;5;6;L;\n', null);
  const a = { categoria: 'immobile', tipo: 'Immobile commerciale', titolo: 'Negozio', comune: 'Melilli', provincia: 'SR', indirizzo: 'frazione Villasmundo', superficieMq: 50 };
  const s = Omi.stima(a, soloOttimo, {});
  assert.equal(s.zona.codice, 'E1');
  assert.equal(s.stato, 'ottimo');
  assert.equal(s.affidabilita, 'bassa');
  assert.ok(s.note.every((n) => !/undefined/.test(n)), s.note.join(' / '));
  assert.match(s.note.join(), /l'OMI quota solo lo stato "ottimo": il valore può essere più alto di quello reale/);
  // anche con lo stato "scadente" letto nell'avviso la quotazione disponibile è solo "ottimo", e lo si dice
  const sc = Omi.stima(a, soloOttimo, { conservazione: { stato: 'da ristrutturare' } });
  assert.equal(sc.stato, 'ottimo');
  assert.ok(sc.note.every((n) => !/undefined|usato lo stato normale/.test(n)), sc.note.join(' / '));
});

test('valori tipici del comune: solo le zone con lo stato normale, senza mescolare uno stato "ottimo" (stato detto com\'è)', () => {
  // Melilli: B1 quota i negozi solo "ottimo", E1 solo "normale"; stato "scadente" letto nell'avviso, zona non riconosciuta
  const v = VALORI + 'ISOLE;SICILIA;SR;19089012;I754; ;F107;MELILLI;B;B1;SR00000001;5;Negozi;OTTIMO;P;2000;2400;L;9;10;L;\n' +
    'ISOLE;SICILIA;SR;19089012;I754; ;F107;MELILLI;E;E1;SR00000002;5;Negozi;NORMALE;P;700;900;L;3;4;L;\n';
  const a = { categoria: 'immobile', tipo: 'Immobile commerciale', titolo: 'Negozio', comune: 'Melilli', provincia: 'SR', indirizzo: 'Via Inesistente', superficieMq: 50 };
  const s = Omi.stima(a, Omi.costruisciIndice(ZONE, v, null), { conservazione: { stato: 'da ristrutturare' } });
  assert.equal(s.zona, null);
  assert.equal(s.stato, 'normale');
  assert.deepEqual(s.euroMq, { min: 700, max: 900 }, 'la quotazione "ottimo" di B1 non entra nella mediana');
  assert.match(s.note.join(), /valori tipici del comune \(una sola zona quotata\)/);
});
