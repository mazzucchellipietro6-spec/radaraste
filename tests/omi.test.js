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

// --- revisione del 29/10/2026: "Villa" nei nomi di luogo e lotti con più unità (casi reali dei dati locali del 29/10) ---

const PERUGIA = { id: 'pvp-4651261', categoria: 'immobile', tipo: 'Immobile commerciale', comune: 'Perugia', provincia: 'PG',
  titolo: 'Porzioni di complesso polifunzionale, sito in Perugia (PG), Fraz. Villa Pitignano, Via della Vecchia Fornace.…',
  descrizione: 'Porzioni di complesso polifunzionale, sito in Perugia (PG), Fraz. Villa Pitignano, Via della Vecchia Fornace. Superfici: commerciale 514,4 mq; uso direzionale 324 mq; autorimessa uso pubblico 180 mq circa; autorimessa uso privato 2.437,40 mq Per maggiori informazioni visitare il portale www.quimmo.it - Codice annuncio 25428.' };

test('tipologia: "Villa" in un nome di luogo non fa dell\'immobile una villa (caso reale pvp-4651261, Perugia, Fraz. Villa Pitignano)', () => {
  // prima: "Ville e villini" per un complesso commerciale, punteggio 90 con affidabilità alta (secondo nel Radar 3D)
  assert.notEqual(Omi.tipologia(PERUGIA, PERUGIA.descrizione)[0], Omi.TIP.villa);
  // altri casi reali: box in località Villa Adriana, negozio in frazione Villa Torre, terreno in località Villa Reale,
  // appartamento nel comune di Villa Santa Lucia, casa in contrada Villa Elce
  assert.deepEqual(Omi.tipologia({ tipo: 'Altra categoria', comune: 'Tivoli', titolo: 'Quota pari a 1/1 del diritto di proprietà su Box Auto sito nel Comune di Tivoli (RM), località Villa Adriana…' }), [Omi.TIP.box]);
  assert.deepEqual(Omi.tipologia({ tipo: 'Immobile commerciale', comune: 'Cingoli', titolo: 'Diritti di piena proprietà di negozio a CINGOLI Frazione Villa Torre 25, della superficie commerciale di…' }), [Omi.TIP.negozio]);
  assert.equal(Omi.tipologia({ tipo: 'Altra categoria', comune: 'Chieti', titolo: 'Terreno sito nel Comune di Chieti in località Villa Reale' }), null);
  assert.equal(Omi.tipologia({ tipo: 'Immobile residenziale', comune: 'Villa Santa Lucia', titolo: 'Nuda proprietà di appartamento arredato con terreno a Villa Santa Lucia (FR), via Giosuè Carducci 2.…' })[0], Omi.TIP.civile);
  assert.equal(Omi.tipologia({ tipo: 'Immobile residenziale', comune: 'Lanciano', titolo: 'Piena proprietà di edificio in muratura ad uso residenziale sito nel Comune di Lanciano (CH), alla contrada Villa Elce n.36' })[0], Omi.TIP.civile);
  assert.equal(Omi.tipologia({ tipo: 'Immobile industriale', comune: 'Siracusa', titolo: 'Opificio industriale in Siracusa, c.da Cozzo Villa, via Elorina n. 117' })[0] === Omi.TIP.villa, false);
  // le ville vere restano ville (caso reale pvp-4635783, Ostuni; "villa" anche tra parentesi nell'indirizzo)
  assert.equal(Omi.tipologia({ tipo: 'Immobile residenziale', comune: 'Ostuni', titolo: 'Villa singola a Ostuni (BR) alla via Lucy civ. 33 ( villa BL/33), frazione di Rosa Marina, della superficie…' })[0], Omi.TIP.villa);
  assert.equal(Omi.tipologia({ tipo: 'Immobile residenziale', comune: 'Latina', titolo: 'Villino sviluppato su n.2 piani' })[0], Omi.TIP.villa);
});

test('più unità: "porzioni di complesso" (Perugia) e unità di categorie catastali diverse (San Severino Marche) → affidabilità bassa', () => {
  assert.match(Omi.piuUnita(PERUGIA.titolo + ' ' + PERUGIA.descrizione), /più unità/);
  // caso reale pvp-4641495: appartamento A/6 di 214,25 mq più ufficio F/3 e terreni, valutato sui soli 214,25 mq (punteggio 89, alta)
  const sanSeverino = 'Diritti di piena proprietà per l\'intero di appartamento di mq 214,25 (Fg. 151 part 125 sub.2 - cat.A/6), di ufficio di mq. 155,84 (fg. 151 part. 125 sub.3 - cat. F/3) e di terreni per complessivi m...';
  assert.match(Omi.piuUnita(sanSeverino), /categorie catastali diverse/);
  // abitazione con deposito e garage (A/3 + C/2 + C/6, caso reale pvp-4624358, Mazzarino): le pertinenze non contano
  assert.equal(Omi.piuUnita('LOTTO2 Fabbricato sito in Mazzarino in Viale della Repubblica N° 43/A, risultante nel N.C.E.U. al foglio di mappa 70 particella 380 Sub.3 abitazione a primo piano, Cat. A/3 Classe 2^ consistenza 6,5 vani, dati superficie totale mq.147 totale escluse aree scoperte mq.143; Sub. 6 locale di deposito a piano terra Cat. C/2 consistenza mq. 39 Superficie totale mq.46; Sub. 9 Garage a piano terra Cat. C/6 classe 3^ consistenza 43 mq. Dati superficie totale mq. 40.'), null);
  // un'unità sola: il lotto uno di Sant'Elpidio a Mare (laboratorio C/3 di 828 mq, caso del 29/10/2026)
  assert.equal(Omi.piuUnita('LOTTO UNO (A in perizia). Diritti di piena proprietà su Unità immobiliare sita in Sant’Elpidio a Mare (FM), Via E. Lussu, n. 300 – Località Cascinare, destinata ad uso laboratorio, che occupa tutto il piano terra, avente superficie pari a mq. 828 Unità immobiliare descritta al Catasto Fabbricati del comune di Sant\'Elpidio a Mare al foglio n. 8, part. 316, sub. 2, cat. C/3, classe 2, Piano Terra, rendita € 1.859,35, Via E. Lussu n. 300, località Cascinare.'), null);
  // nella stima: la nota e l'affidabilità bassa (zona di prova di Melilli, testo vero di San Severino)
  const a = { categoria: 'immobile', tipo: 'Immobile residenziale', comune: 'Melilli', provincia: 'SR', indirizzo: 'frazione Villasmundo', superficieMq: 214.25, titolo: sanSeverino.slice(0, 110) };
  const s = Omi.stima(a, ind, { testo: sanSeverino });
  assert.equal(s.zona.codice, 'E1');
  assert.equal(s.affidabilita, 'bassa');
  assert.match(s.note.join(), /categorie catastali diverse/);
});

test('caso del 29/10/2026, lotto uno di Sant\'Elpidio a Mare (FM): laboratorio, zona E1 "Casette d\'Ete - Cascinare" dall\'indirizzo', () => {
  // comune cercato nelle province d'origine (FM → AP) e zona dalla località Cascinare; le descrizioni delle zone sono quelle OMI
  const comune = { nome: 'SANT`ELPIDIO A MARE', prov: 'AP', zone: [
    ['AP00001633', 'B', 'B1', 'CENTRO STORICO'], ['AP00001672', 'B', 'B2', 'PERIMETRO ESTERNO AL CENTRO STORICO'],
    ['AP00002090', 'D', 'D1', 'PORZIONE DI TERRITORIO LUNGO LA S.P. FALERIENSE'], ['AP00002857', 'E', 'E1', 'CASETTE D`ETE - CASCINARE E DINTORNI'],
    ['AP00002858', 'R', 'R1', 'PORZIONE AGRICOLA DEL TERRITORIO']] };
  const a = { categoria: 'immobile', tipo: 'Immobile industriale', comune: 'Sant\'Elpidio a Mare', provincia: 'FM', indirizzo: 'Via Lussu, n. 300, 63811 Sant\'Elpidio a Mare FM, Italia',
    titolo: 'LOTTO UNO (A in perizia). Diritti di piena proprietà su Unità immobiliare sita in Sant’Elpidio a Mare (FM)…' };
  const testo = 'Via E. Lussu, n. 300 – Località Cascinare, destinata ad uso laboratorio, che occupa tutto il piano terra, avente superficie pari a mq. 828';
  assert.equal(Omi.trovaZona(comune, a, testo).zona[2], 'E1');
  assert.deepEqual(Omi.tipologia(a, testo), [Omi.TIP.laboratorio]);
  assert.equal(Omi.cercaComune({ comuni: { 'SANTELPIDIOAMARE|AP': comune } }, 'Sant\'Elpidio a Mare', 'FM').comune, comune);
});

// --- controllo dei dati del 30/10/2026 (casi reali dei dati locali del 30/10) ---

test('tipologia: capannoni, opifici e stabilimenti prima di uffici e negozi (144 casi reali del 30/10/2026)', () => {
  const cap = [Omi.TIP.capannone, Omi.TIP.capannoneTipico];
  // pvp-4631006, Treia: stimato come Uffici (1.379.638 €) contro 385.410 € della prima asta
  assert.deepEqual(Omi.tipologia({ tipo: 'Immobile commerciale', comune: 'Treia', titolo: 'Diritti di piena proprieta\' su capannone artigianale della superficie commerciale di 1452,25 mq con ufficio…' },
    'DIRITTI DI PIENA PROPRIETA\' SU CAPANNONE ARTIGIANALE DELLA SUPERFICIE COMMERCIALE DI 1452,25 MQ CON UFFICIO DELLA SUPERFICIE COMMERCIALE DI 242,90 MQ.'), cap);
  // pvp-4636019, Siracusa: opificio D/10 stimato come Uffici nella zona D6 (1.990.000 €)
  assert.deepEqual(Omi.tipologia({ tipo: 'Immobile industriale', comune: 'Siracusa', titolo: 'Opificio industriale in Siracusa, c.da Cozzo Villa, via Elorina n. 117, formato da locale laboratorio…' },
    'Opificio industriale in Siracusa, c.da Cozzo Villa, via Elorina n. 117, formato da locale laboratorio, deposito, ufficio, archivio ed accessori e piazzale carrabile esteso mq. 2370 circa, identificato al C.F. al fg. 118, p.lla 424, sub. 4, cat. D/10'), cap);
  // pvp-4640947, Ottaviano: capannone adibito a locale commerciale, prima stimato come Negozi
  assert.deepEqual(Omi.tipologia({ tipo: 'Immobile commerciale', comune: 'Ottaviano', titolo: 'Piena e perfetta proprietà per una quota pari all’intero del capannone adibito a locale commerciale della…' },
    'Piena e perfetta proprietà per una quota pari all’intero del capannone adibito a locale commerciale della superficie di mq 660 circa'), cap);
  // senza capannone, uffici e negozi restano quello che sono
  assert.deepEqual(Omi.tipologia({ tipo: 'Immobile commerciale', titolo: 'Ufficio al primo piano di edificio direzionale' }), [Omi.TIP.ufficio]);
  assert.deepEqual(Omi.tipologia({ tipo: 'Immobile commerciale', titolo: 'Negozio con retro e bagno' }), [Omi.TIP.negozio]);
});

test('più unità: "porzioni di fabbricato" con un solo appartamento e le sue pertinenze non è un lotto con più unità (pvp-4647812)', () => {
  // caso reale pvp-4647812, Bertinoro (FC): portato ad affidabilità bassa dalla revisione del 29/10/2026
  const lara = '1/1 di porzioni di fabbricato denomin. “Condominio Lara” - dotato di ascensore - costituite da un appartamento al secondo piano (vano soggiorno con ang.cottura, 2 camere da letto, un grande ripostiglio, 2 bagni e 2 balconi), con cantina e garage pertinenziali al piano terra, oltre la proporzionale comproprietà delle parti comuni come per legge. Superficie convenzionale tot. mq.114,69.';
  assert.equal(Omi.piuUnita(lara), null);
  // restano lotti con più unità: porzioni di un complesso (Perugia, sopra) e porzioni contate (pvp-4633231, Lurago Marinone)
  assert.match(Omi.piuUnita(PERUGIA.titolo + ' ' + PERUGIA.descrizione), /più unità/);
  assert.match(Omi.piuUnita('Piena proprietà di 3 porzioni di fabbricato: A - 103,93 mq composto da al PT soggiorno, cucina e bagno, al P1 camera, ripostiglio e balcone, al P2 camera e balcone. B - 54,79 mq composto da al PT lavanderia e ripostiglio, al P1 ripostiglio, camera e balcone. C - 116,96 mq composto da al PS1 cantina'), /più unità/);
  // nella stima: zona riconosciuta e affidabilità media (zona di prova di Melilli, testo vero di Bertinoro)
  const a = { categoria: 'immobile', tipo: 'Immobile residenziale', comune: 'Melilli', provincia: 'SR', indirizzo: 'frazione Villasmundo', superficieMq: 114.69, titolo: lara.slice(0, 100) };
  const s = Omi.stima(a, ind, { testo: lara });
  assert.equal(s.affidabilita, 'media');
  assert.equal(s.note.some((n) => /più unità/.test(n)), false);
});

test('tipologia: ville, villette e villini con il posto auto restano ville (casi reali del 30/10/2026)', () => {
  // pvp-4627829, Castello dell'Acqua (SO): stimata con la quotazione dei "Box", 59.772 €
  assert.deepEqual(Omi.tipologia({ tipo: 'Immobile residenziale', comune: 'Castello Dell\'Acqua', titolo: 'Villetta a schiera centrale su tre piani con corti annesse della superficie commerciale di 103,95 mq…' },
    'Villetta a schiera centrale su tre piani con corti annesse della superficie commerciale di 103,95 mq, composta da: area esterna, soggiorno-cucina, anti servizio, servizio a piano terra, bagno, due camere, disimpegno e balcone a piano primo e soppalco a piano sottotetto, oltre a box singolo e posto auto.'),
  [Omi.TIP.villa, Omi.TIP.civile]);
  // pvp-4651280, Roma: villino quadrifamiliare con posto auto coperto
  assert.equal(Omi.tipologia({ tipo: 'Immobile residenziale', comune: 'Roma', titolo: 'Villino quadrifamiliare con posto auto coperto in Roma, Viale di Castel Porziano 414C e 414D, Edificio B…' })[0], Omi.TIP.villa);
  // i posti auto restano posti auto (caso reale pvp-4649281, Modena), anche in una via con "Villa" nel nome (testo di prova)
  assert.deepEqual(Omi.tipologia({ tipo: 'Altra categoria', comune: 'Modena', titolo: 'Posto auto interrato, categoria C/6, metri quadrati 17, sito in Modena, alla Via Pier Paolo Pasolini' }), [Omi.TIP.postoCoperto, Omi.TIP.box]);
  assert.deepEqual(Omi.tipologia({ tipo: 'Altra categoria', comune: 'Modena', titolo: 'Posto auto scoperto in via Villanova 861' }), [Omi.TIP.postoScoperto, Omi.TIP.box]);
});

// --- revisione del 30/10/2026 (casi reali dei dati locali del 30/10) ---

test('più unità: "porzioni" restano più unità, tranne quando il testo dice un solo appartamento (revisione del 30/10/2026)', () => {
  // pvp-4616083 (Chiusdino), pvp-4633414 (Montefiore Conca), pvp-4625477 (Osimo): con la regola del 30/10 non erano più "più unità"
  assert.match(Omi.piuUnita('Varie porzioni immobiliari costituite da appartamenti, rimesse agricole, capannone e terreni per la gran parte seminativi.'), /più unità/);
  assert.match(Omi.piuUnita('Piena proprietà di porzioni di fabbricato urbano ad uso civile abitazione costituite da due appartamenti con corte e locale allo stato grezzo.'), /più unità/);
  assert.match(Omi.piuUnita('Piena proprietà di porzioni del fabbricato costituite da: laboratorio artigianale e due uffici al piano terra.'), /più unità/);
  // resta un solo appartamento il Condominio Lara (pvp-4647812, test sopra)
  assert.equal(Omi.piuUnita('1/1 di porzioni di fabbricato denomin. “Condominio Lara” - dotato di ascensore - costituite da un appartamento al secondo piano (vano soggiorno con ang.cottura, 2 camere da letto, un grande ripostiglio, 2 bagni e 2 balconi), con cantina e garage pertinenziali al piano terra, oltre la proporzionale comproprietà delle parti comuni come per legge. Superficie convenzionale tot. mq.114,69.'), null);
});

test('più beni: azienda, macchinari e attrezzature, elenchi a) b) e 1) 2) (revisione del 30/10/2026)', () => {
  // pvp-4638848, Castellalto: il valore OMI del solo opificio coincideva per caso con la prima asta di tutto il complesso
  // aziendale (affidabilità alta, punteggio 63)
  assert.match(Omi.piuUnita('Vendita di complesso aziendale composto da: diritti pari a 1/1 su opificio industriale sito in Comune di Castellato (TE), via Tevere, Z.I. di complessivi 2.976,60 mq circa; macchinari ed attrezzature del settore calzaturiero; autovettura Mercedes E350, autocarro FIAT Ducato H2, autovettura Jeep Grand Cherokee; impianti di stabilimento speciali; arredi e macchine per ufficio; magazzino composto prevalentemente da valigeria ed accessori.'), /più beni/);
  // pvp-4644166, Acquasparta, e pvp-4641116, Mozzecane
  assert.match(Omi.piuUnita('Piena proprietà 1/1 su: 1) capannone artigianale di mq 808, con uffici e magazzino al piano T e abitazione allo stato grezzo al piano 1°. E\' presente un box prefabbricato di mq 10,40 e altezza media m 2,60. 2) Attrezzature e ricambi officina riparazione autoveicoli.'), /più beni/);
  assert.match(Omi.piuUnita('a) capannone destinato a deposito oli minerali e carburanti ad uso commerciale, sviluppantesi su tre livelli, b) deposito oli minerali e carburanti con pensilina di mq. 236,00 con bracci di carico ATB e da un ufficio; nel sottosuolo n. 6 serbatoi da 80 mc. e un serbatoio da 50 mc. c) Area di complessivi mq.10.333 destinata a parcheggio sulla quale è in opera una pesa per autobotti.'), /più beni/);
  // non i macchinari esclusi dalla vendita (pvp-4623555, Rieti) né il "locale attrezzature" di un opificio (pvp-4629497, Cicala)
  assert.equal(Omi.piuUnita('Piena proprietà per la quota 1000/1000 di un locale ad uso negozio, piano terra. La superficie netta è di circa 35 mq. Non sono compresi nel pignoramento i macchinari rinvenuti all\'interno del locale in sede di accesso e stima.'), null);
  assert.equal(Omi.piuUnita('Opificio su 2 livelli, mq 1.305, composto da: disimpegno/ingresso, 2 uffici amministrativi con vano, servizi igienici, 2 locali deposito, locale attrezzature, sala mensa.'), null);
  // né "LOTTO UNO (A in perizia)" (pvp-4566904, test sopra)
  assert.equal(Omi.piuUnita('LOTTO UNO (A in perizia). Diritti di piena proprietà su Unità immobiliare destinata ad uso laboratorio, superficie pari a mq. 828'), null);
});

// --- 31/10/2026: terreni valutati come fabbricati (casi reali dei dati locali del 31/10) ---

// testi e comuni veri delle aste; il comune serve a togliere il suo nome dal testo (Palazzolo dello Stella)
const TERRENI = [
  // stimato come "Abitazioni civili" su 3888 mq: valore centrale 3.382.560 €
  ['pvp-4641187', 'Altissimo', 'Terreno parzialmente edificabile di mq. 3888.'],
  // stimato come "Negozi" su 46.752 mq: valore centrale 46.635.120 € ("Palazzolo" e "via Casali" sono nomi di luogo)
  ['pvp-4623003', 'Palazzolo Dello Stella', 'Terreno agricolo della superficie commerciale di 46.752,00 mq, in Palazzolo dello Stella, via Casali Giambreaz n. 1.'],
  // stimato come "Magazzini": il deposito è di materiale edile, sul piazzale
  ['pvp-4631197', 'Collesalvetti', 'Appezzamento di terreno attualmente utilizzato come piazzale di deposito di materiale edile, costituito da sei particelle della superficie catastale complessiva di 5.850 mq.'],
  ['pvp-4626788', 'Finale Ligure', 'Piena proprietà di terreni cantierizzati per intervento residenziale della superficie commerciale di mq. 9.218,84.'],
  // i fabbricati citati sono assenti o vicini, non nel lotto
  ['pvp-4653985', 'Gualdo Tadino', 'Vendesi terreno agricolo di 520 mq, sito in Gualdo Tadino (PG), in Località Fontivole. Trattasi di terreno isolato e marginale, adiacente ad un corso d’acqua ed ad un’area utilizzata come deposito di materiale edile. Sul terreno in oggetto non vi sono fabbricati ed è libero. Superficie commerciale: 520 mq'],
  ['pvp-4643828', 'San Giovanni La Punta', 'Area urbana edificabile a San Giovanni La Punta (CT), tra via Teano e via della Regione. Superficie catastale di 6730 mq. Area parte di programma costruttivo convenzionato nel 2005 per realizzazione di 96 alloggi sociali (30 già realizzati). Lavori interrotti. Terreno incolto. Stato di abbandono'],
  ['pvp-4642425', 'Osimo', 'Per la piena ed intera proprietà Area edificabile a destinazione industriale/artigianale, di circa 5.597 mq, pressoché pianeggiante ed incolta, ubicata nella frazione Osimo Stazione, via Crispi. L’area è inserita in un contesto prettamente industriale che si contraddistingue per la presenza di numerosi capannoni a destinazione produttiva, di media e grande metratura.'],
  ['pvp-4624421', 'Corridonia', 'Area urbana a Corridonia (MC), località Passo del Bidollo, via Passo del Bidollo snc. Periferia urbanizzata con abitazioni e negozi. Ben collegata a Macerata e litorale. Superficie commerciale di 105 mq. Area adibita a giardino sul retro di palazzina residenziale. Condizioni buone'],
  // aree urbane (cat. F/1): "piano terra", "corte", "Catasto Fabbricati" e "immobile" qui non dicono un fabbricato
  ['pvp-4618296', 'Tivoli', 'Bene posto in vendita per il diritto della piena proprietà e costituito da: Area urbana ubicata a Tivoli (prov. Roma) - Via Luigi Pirandello, 38, piano T. Trattasi di una area urbana di mq. 58 posta al piano terra, l\'area urbana risulta pavimentate e in pare recintata su tre lati. Identificato al catasto Fabbricati - Fg. 49, Part. 1738, Sub. 501, Categoria F/1, della consistenza di 58 mq., superficie catastale 58 mq.'],
  ['pvp-4648176', 'San Pietro in Guarano', 'Corte esclusiva, categoria F/1, consistenza 70 mq, piano T.'],
  ['pvp-4649362', 'Luzzi', 'Immobile di mq 860 circa (corte) con servitù di passaggio, categoria area urbana. Tale area ricade in zona ATUC (Ambito Territoriale Urbano Consolidato) con indice di edificabilità pari a 0,4 mq/mq.']
];
// case con "piano terreno", corte, giardino o terreno di pertinenza: restano fabbricati
const CASE = [
  ['pvp-4630170', 'Torino', 'alloggio al piano terreno rialzato composto da ingresso su disimpegno, una camera, tinello con cucinino, ripostiglio e bagno, superficie commerciali mq 52.'],
  ['pvp-4653927', 'Biella', 'Alloggio su due piani (terreno e primo) posto in contesto di case “di corte”, così composto: al p.t. - ingresso e vano scala, cucina/soggiorno attualmente adibito a deposito, bagno di servizio; al p.1 - locale soggiorno/cucina, camera da letto, disimpegno, bagno, balcone con piccolo wc esterno. Autorimessa.'],
  ['pvp-4630302', 'Roma', 'Lotto Unico: Trattasi di abitazione con corte esterna di pertinenza esclusiva, sita nel Comune di Roma, Vicolo di Vigna Mangani n. 20 (quartiere Pietralata Q.XXI) – Municipio IV (ex V), piano terreno e piano primo. Foglio 580, part. 118, sub. 501, piano T-1, zona censuaria 4, categoria A/4, classe 2, consistenza 6 vani, superficie catastale 143 mq (totale escluse aree scoperte: 129 mq), rendita euro 743,70.'],
  ['pvp-4599116', 'Zagarolo', 'Abitazione unifamiliare con giardino in ZAGAROLO (Rm),loc. Valle Martella, Via Ludwig VAN BEETHOVEN, civico 7, Piano T,composto tinello con cucina zona pranzo, soggiorno con camino, 2 camere bagno, ripostiglio/lavanderia 80 mq lordi portico 4,00 ml x 7,50,portico laterale 3,50 ml x 2,00 ml, giardino piccola piscina deposito 20 mq; terreno di pertinenza 580 mq .NCEU(Codice:M141) F. 4 Part. 794 Sub: 1 e Part. 794 Sub: 2 graffati; cat. A/4, cl 5, 3,5 vani, catastale 49 mq,RC €162,68, Lotto 1217, Piano T.'],
  ['pvp-4611225', 'Gubbio', 'Diritto di intera piena proprietà su unità immobiliare ad uso abitativo posta al piano terreno di un fabbricato sito in Comune di Gubbio, frazione Casamorcia, della superficie complessiva di circa mq 96,00, suddivisa in ingresso, cucina, soggiorno, due camere, due bagni e piccolo locale adibito a c.t. con accesso dalla corte pertinenziale del fabbricato; corte comune con cancello carrabile, come da relazione di stima.'],
  ['pvp-4618822', 'Roccella Ionica', 'Unità immobiliare al piano terzo, oltre porzione millesimale dei terreni di cui alle particelle 346 - 347 adibite a corte, Cat. A/3, Vani 6, superficie commerciale mq. 146.'],
  ['pvp-4630599', 'Carbonia', '3/5 piena proprietà immobile su due livelli mq 111 a piano con annesso terreno mq 2.535.'],
  ['pvp-4653092', 'Polistena', 'Locale al pian terreno di un fabbricato in cemento armato, a quattro elevazioni fuori terra, identificato al Catasto Fabbricati del medesimo Comune al foglio di mappa n° 7, particella 21, sub. 16, categoria C/1, classe 3, piano T, consistenza 94 mq, superficie catastale 106 mq, rendita euro 854,43.']
];
// fabbricati con terreno: restano come oggi (la regola dei lotti con più unità ne abbassa già l'affidabilità)
const CON_TERRENO = [
  ['pvp-4624309', 'Perugia', 'Villa monofamiliare con terreno, sita in Perugia (PG), località San Marco, Strada Ponte d’Oddi n°267/B e 267/A. Superficie commerciale villa 481,75 mq; terreno 30.121 mq'],
  ['pvp-4613852', 'Castelfranco Emilia', 'Piena e intera proprietà di lotto di terreno di 3370 mq su cui sorge un capannone ad uso industriale/artigianale/commerciale di 472 mq lordi, a circa 1.600 metri dal centro di Castelfranco Emilia, edificato a metà degli anni \'60.'],
  ['pvp-4624063', 'Marianopoli', 'Fondo agricolo con annesso fabbricato. Il fabbricato è suddiviso in tre locali con annessa veranda della superficie lorda di ca mq 54,98 più mq 12,00 di veranda. Inagibile. Libero al decreto di trasferimento.'],
  ['pvp-4653770', 'Rignano Sull\'Arno', 'compendio immobiliare ubicato in Rignano Sull’Arno, località Le Valli, Strada Vicinale delle Lame, 23, già costituente azienda agricola denominata “LE LAME” formata da corpi di fabbrica di tipologia rurale alcuni di vetusta edificazione (risalenti al XVII° secolo) ed altri di più recente costruzione, oltre a resede e terreni agricoli; il corpo di fabbrica principale ha una forma ad “L” ed una superficie di circa mq. 800'],
  // area urbana con un fabbricato in costruzione (cat. F/1) e area urbana con un posto auto: non sono solo terreno
  ['pvp-4629376', 'Lumezzane', 'LOTTO D:Unità in costruzione in stato di abbandono su più piani, censito al catasto fabbricati, sez. NCT fg. 7 mapp. 97 sub 16 – p. t - cat. F/1 – 105 mq.'],
  ['pvp-4606874', 'Potenza Picena', 'Diritto di piena proprietà su di un compendio immobiliare ubicato in Potenza Picena (Mc), Contrada Casette Antonelli, n. 20, costituito da un’area urbana della superficie di mq. 5 e un adiacente posto auto scoperto della superficie di mq. 13.']
];

test('terreni: solo terreno, anche con fabbricati vicini, assenti o da costruire e con le aree urbane (11 casi reali del 31/10/2026)', () => {
  for (const [id, comune, testo] of TERRENI) assert.equal(Omi.soloTerreno(testo, comune), true, id);
});

test('terreni: le case con "piano terreno", corte, giardino o terreno di pertinenza restano fabbricati (8 casi reali)', () => {
  for (const [id, comune, testo] of CASE) assert.equal(Omi.soloTerreno(testo, comune), false, id);
});

test('terreni: un fabbricato con il suo terreno resta un fabbricato (6 casi reali)', () => {
  for (const [id, comune, testo] of CON_TERRENO) assert.equal(Omi.soloTerreno(testo, comune), false, id);
});

test('stima: un terreno non ha valore OMI e lo dice; la casa con piano terreno e la villa con terreno lo tengono', () => {
  // zona di prova di Melilli con i testi veri: prima il terreno di 3888 mq (tipo "Immobile residenziale") era stimato come
  // "Abitazioni civili", da 2.488.320 a 2.760.480 €
  const zona = { categoria: 'immobile', comune: 'Melilli', provincia: 'SR', indirizzo: 'frazione Villasmundo' };
  const terreno = Omi.stima({ ...zona, tipo: 'Immobile residenziale', superficieMq: 3888, titolo: 'Terreno parzialmente edificabile di mq. 3888' }, ind, { testo: TERRENI[0][2] });
  assert.equal(terreno.valore, undefined);
  assert.equal(terreno.affitto, undefined);
  assert.equal(terreno.mancante, 'il lotto è solo terreno e le quotazioni OMI valgono per i fabbricati, non per i terreni');
  assert.equal(terreno.comune, 'MELILLI');
  // anche la corte in cat. F/1 stimata come negozio, e un terreno di un comune che non c'è nelle quotazioni (il motivo è il terreno)
  assert.match(Omi.stima({ ...zona, tipo: 'Immobile commerciale', superficieMq: 70, titolo: 'Corte esclusiva, categoria F/1' }, ind, { testo: TERRENI[9][2] }).mancante, /solo terreno/);
  assert.match(Omi.stima({ ...zona, comune: 'Inesistente', tipo: 'Altra categoria', titolo: 'Terreno agricolo' }, ind, {}).mancante, /solo terreno/);
  // la casa al piano terreno e la villa con terreno restano stimate
  const casa = Omi.stima({ ...zona, tipo: 'Immobile residenziale', superficieMq: 52, titolo: 'Alloggio al piano terreno rialzato' }, ind, { testo: CASE[0][2] });
  assert.deepEqual(casa.valore, { min: 33280, max: 36920, centrale: 35100 });
  const villa = Omi.stima({ ...zona, tipo: 'Immobile residenziale', superficieMq: 481.75, titolo: 'Villa monofamiliare con terreno' }, ind, { testo: CON_TERRENO[0][2] });
  assert.ok(villa.valore && villa.valore.min > 0);
});
