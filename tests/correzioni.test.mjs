import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  controllaCoordinate, soloBiciclette, prezzo, anomalia, adessoRoma, giaIniziata, togliPrefisso, frase, tuttoMaiuscolo, fileCollegati
} from '../scripts/lib/correzioni.mjs';
import { converti, tipo, titolo, numeroLotto } from '../scripts/fonti/pvp.mjs';
import { CAMPI, argomenti } from '../scripts/raccogli.mjs';

const require = createRequire(import.meta.url);
const Formato = require('../js/formato.js');
const Estrai = require('../js/estrai.js');

// vendita sintetica della ricerca del PVP
const x = (o = {}) => ({
  id: 4600001, tipoLotto: 'IMMOBILI', categoriaLotto: 'IMMOBILE_RESIDENZIALE', categoriaBene: ['APPARTAMENTO'], numeroLotto: '1', procedura: '120',
  prezzoBaseAsta: 90000, offertaMinima: 67500, rialzoMinimo: 1000, dataVendita: '2026-11-20', orarioVendita: '10:00', dataPubblicazione: '2026-10-01',
  descLotto: 'Appartamento in Genova, via Roma 10', tribunale: 'Tribunale di GENOVA', codiceTribunale: 'T1', disponibilita: ['LIBER'],
  indirizzo: { via: 'Via Roma 10', citta: 'GENOVA', provincia: 'Genova', coordinate: { latitudine: 44.4056, longitudine: 8.9463 } }, ...o
});

/* a. coordinate */
test('coordinate: fuori dall\'Italia, (1,1), (0,0) e lontane dalla provincia scartate', () => {
  assert.deepEqual(controllaCoordinate(44.4056, 8.9463, 'GE'), { lat: 44.4056, lng: 8.9463, scarto: null });
  assert.equal(controllaCoordinate(1, 1, 'GE').scarto, 'fuori-italia');
  assert.equal(controllaCoordinate(0, 0, 'GE').scarto, 'fuori-italia');
  assert.equal(controllaCoordinate(38.9, -77.03, 'RM').scarto, 'fuori-italia');      // Washington
  assert.equal(controllaCoordinate(47.5, 19.04, 'UD').scarto, 'fuori-italia');       // Budapest
  assert.equal(controllaCoordinate(45.46, 9.19, 'PA').scarto, 'lontana');            // Milano per un'asta di Palermo
  assert.equal(controllaCoordinate(45.46, 9.19, 'MI').scarto, null);
  assert.equal(controllaCoordinate(45.46, 9.19, '').scarto, null);                   // provincia sconosciuta: basta il riquadro
  assert.deepEqual(controllaCoordinate(null, null, 'GE'), { lat: null, lng: null, scarto: null });
  // nella conversione del PVP
  const a = converti(x({ indirizzo: { citta: 'GENOVA', provincia: 'Genova', coordinate: { latitudine: 1, longitudine: 1 } } }));
  assert.equal(a.lat, null); assert.equal(a.lng, null);
});

/* b. biciclette */
test('biciclette (anche elettriche) tra i beni, lotti misti e moto restano', () => {
  const v = (descLotto, categoriaBene = ['BENE_GENERICO']) => ({ tipoLotto: 'MOBILI', categoriaLotto: 'AUTOVEICOLI_E_CICLI', categoriaBene, descLotto });
  assert.equal(soloBiciclette(v('BICICLETTA MOUNTAIN BIKE CARBONIO 2020')), true);
  assert.equal(soloBiciclette(v('Bicicletta elettrica a pedalata assistita')), true);
  assert.equal(soloBiciclette(v('n. 30 biciclette da corsa')), true);
  assert.equal(soloBiciclette(v('E-bike con motore centrale')), true);
  assert.equal(soloBiciclette(v('Autovettura Fiat Panda e bicicletta')), false);        // misto
  assert.equal(soloBiciclette(v('Bicicletta', ['AUTOVETTURE'])), false);
  assert.equal(soloBiciclette(v('Autocarro Iveco Daily targato')), false);
  assert.equal(converti(x({ tipoLotto: 'MOBILI', categoriaLotto: 'AUTOVEICOLI_E_CICLI', categoriaBene: ['BENE_GENERICO'], descLotto: 'BICICLETTA DA CORSA BIANCHI' })).categoria, 'beni');
  assert.equal(converti(x({ tipoLotto: 'MOBILI', categoriaLotto: 'AUTOVEICOLI_E_CICLI', categoriaBene: ['AUTOVETTURE'], descLotto: 'Autovettura Fiat Punto' })).categoria, 'auto');
  assert.equal(converti(x({ tipoLotto: 'MOBILI', categoriaLotto: 'AUTOVEICOLI_E_CICLI', categoriaBene: ['MOTOVEICOLO_O_CICLOMOTORE'], descLotto: 'Scooter' })).categoria, 'moto');
});

/* c. prezzi a zero */
test('prezzo base e offerta minima a zero → mancanti', () => {
  assert.equal(prezzo(0), null);
  assert.equal(prezzo(-5), null);
  assert.equal(prezzo(null), null);
  assert.equal(prezzo(1500.5), 1500.5);
  const a = converti(x({ prezzoBaseAsta: 0, offertaMinima: 0, rialzoMinimo: 0 }));
  assert.equal(a.prezzoBase, null);
  assert.equal(a.offertaMinima, null);
  assert.equal(a.rialzo, null);
  assert.equal(a._pvp.prezzoBaseAsta, 0); // il dato grezzo resta per l'indice (dove 0 vale "mancante")
});

/* d. aste di oggi già iniziate */
test('ora di Roma e aste di oggi con l\'orario già passato', () => {
  // 13/10/2026 04:41 UTC = 06:41 a Roma (ora legale); 31/12 23:30 UTC = 1/1 00:30 a Roma
  assert.deepEqual(adessoRoma(new Date('2026-10-13T04:41:00Z')), { data: '2026-10-13', ora: '06:41' });
  assert.deepEqual(adessoRoma(new Date('2026-12-31T23:30:00Z')), { data: '2027-01-01', ora: '00:30' });
  const adesso = { data: '2026-10-13', ora: '10:30' };
  assert.equal(giaIniziata({ dataAsta: '2026-10-13', ora: '09:00' }, adesso), true);
  assert.equal(giaIniziata({ dataAsta: '2026-10-13', ora: '10:30' }, adesso), true);
  assert.equal(giaIniziata({ dataAsta: '2026-10-13', ora: '15:00' }, adesso), false);
  assert.equal(giaIniziata({ dataAsta: '2026-10-13', ora: '' }, adesso), false);       // orario sconosciuto: si tiene
  assert.equal(giaIniziata({ dataAsta: '2026-10-13', ora: '9.00' }, adesso), true);
  assert.equal(giaIniziata({ dataAsta: '2026-10-14', ora: '09:00' }, adesso), false);
  assert.equal(giaIniziata({ dataAsta: '2026-10-12', ora: '23:00' }, adesso), true);
});

/* e. titoli */
test('titoli: prefissi tolti, maiuscolo → frase normale, sigle e comune scritti bene, 110 caratteri', () => {
  assert.equal(togliPrefisso('(Lotto n.1) - Appartamento in via Roma'), 'Appartamento in via Roma');
  assert.equal(togliPrefisso('Lotto unico - Villetta'), 'Villetta');
  assert.equal(togliPrefisso('Bene 3 - Box auto'), 'Box auto');
  assert.equal(togliPrefisso('LOTTO 001: AUTOVETTURA'), 'AUTOVETTURA');
  assert.equal(togliPrefisso('LOTTO 1 - BENE 1 - CAPANNONE'), 'CAPANNONE');
  assert.equal(togliPrefisso('Lotto 2 e 3 - Terreni agricoli'), 'Terreni agricoli');
  assert.equal(togliPrefisso('Lotto A) Villetta'), 'Villetta');
  assert.equal(togliPrefisso('Lotto di terreno edificabile'), 'Lotto di terreno edificabile');
  assert.equal(togliPrefisso('Bene immobile a uso abitativo'), 'Bene immobile a uso abitativo');
  assert.equal(tuttoMaiuscolo('APPARTAMENTO SITO IN MILANO'), true);
  assert.equal(tuttoMaiuscolo('Appartamento sito in Milano'), false);
  assert.equal(frase("APPARTAMENTO SITO IN CORNATE D'ADDA (MB), VIA DELLE ROSE N. 5", { comune: "Cornate d'Adda", provincia: 'MB' }),
    "Appartamento sito in Cornate d'Adda (MB), via delle Rose n. 5");
  assert.equal(frase('APPARTAMENTO CATEGORIA A/2, VIA XX SETTEMBRE 12, 20121 MILANO MI', { comune: 'Milano', provincia: 'MI' }),
    'Appartamento categoria A/2, via XX Settembre 12, 20121 Milano MI');
  assert.equal(frase('LOCALE RIPORTATO AL N.C.E.U. AL FG. 77, VENDITA SU PVP', {}), 'Locale riportato al N.C.E.U. al fg. 77, vendita su PVP');
  assert.equal(frase('AUTOVETTURA BMW X3 TG GJ123AB', {}), 'Autovettura BMW X3 tg GJ123AB');
  assert.equal(frase('Appartamento con GIARDINO', {}), 'Appartamento con GIARDINO'); // non tutto maiuscolo: resta com'è
  const t = titolo(x({ descLotto: '(Lotto n.1) - APPARTAMENTO AL PIANO SECONDO SITO IN GENOVA, VIA ROMA 10, COMPOSTO DA INGRESSO, CUCINA, SOGGIORNO, DUE CAMERE, BAGNO E RIPOSTIGLIO, CON CANTINA' }), 'Genova', 'GE');
  assert.ok(t.length <= 111, t);
  assert.match(t, /^Appartamento al piano secondo sito in Genova, via Roma 10, composto/);
  assert.ok(t.endsWith('…'));
  assert.equal(titolo(x({ descLotto: 'Lotto 1' }), 'Genova', 'GE'), 'Immobile residenziale – Genova');
  // spazio mancante tra due frasi (pvp-4630987), sigle intatte
  assert.equal(titolo(x({ descLotto: 'Appartamento a Frosinone (FR) - Vicolo Moccia 78, piano S2.Trattasi di un appartamento' }), 'Frosinone', 'FR'),
    'Appartamento a Frosinone (FR) - Vicolo Moccia 78, piano S2. Trattasi di un appartamento');
  assert.equal(titolo(x({ descLotto: 'Capannone della Rossi S.p.A. al Fg.19 di 1.200 mq' }), 'Genova', 'GE'), 'Capannone della Rossi S.p.A. al Fg.19 di 1.200 mq');
});

/* f. offerta minima sopra il prezzo base */
test('offerta minima più alta del prezzo base: dato tenuto e segnalato', () => {
  assert.equal(anomalia({ prezzoBase: 1000, offertaMinima: 1500 }), 'offerta-minima-sopra-base');
  assert.equal(anomalia({ prezzoBase: 1000, offertaMinima: 750 }), null);
  assert.equal(anomalia({ prezzoBase: 1000, offertaMinima: 1000 }), null);
  assert.equal(anomalia({ prezzoBase: null, offertaMinima: 1500 }), null);
  assert.ok(CAMPI.includes('anomalia'));
});

/* g. nomi dei file collegati */
test('nome del riepilogo e della cartella delle schede coerenti con --output', () => {
  assert.deepEqual(fileCollegati(path.join('data', 'aste.js')), { riepilogo: path.join('data', 'riepilogo.js'), dettagli: path.join('data', 'dettagli') });
  assert.deepEqual(fileCollegati(path.join('tmp', 'prova-aste.js')), { riepilogo: path.join('tmp', 'prova-aste-riepilogo.js'), dettagli: path.join('tmp', 'prova-aste-dettagli') });
  assert.deepEqual(fileCollegati('x/prova.js'), { riepilogo: path.join('x', 'prova-riepilogo.js'), dettagli: path.join('x', 'prova-dettagli') });
  assert.deepEqual(argomenti(['--output', 'a.js', '--max-dettagli', '300', '--indice', 'i.json', '--tempo-max', '85']),
    { output: 'a.js', maxDettagli: 300, indice: 'i.json', tempoMax: 85 });
});

/* h. etichette abbreviate dalla fonte */
test('etichette del tipo abbreviate dalla fonte restano come sono', () => {
  assert.equal(tipo('ALTRA_CATEGORIA_M'), 'Altra categoria m');
  assert.equal(tipo('ARREDAMENTO_ELETTRO'), 'Arredamento elettro');
  assert.equal(tipo('IMMOBILE_RESIDENZIALE'), 'Immobile residenziale');
});

test('numero del lotto e rilancio minimo dalla ricerca', () => {
  assert.equal(numeroLotto('LOTTO 001'), '1');
  assert.equal(numeroLotto('Lotto unico'), 'Unico');
  assert.equal(numeroLotto('3 bis'), '3 bis');
  assert.equal(numeroLotto(''), null);
  const a = converti(x());
  assert.equal(a.numeroLotto, '1');
  assert.equal(a.rialzo, 1000);
  assert.equal(a.titolo, 'Appartamento in Genova, via Roma 10');
  assert.equal(a.provincia, 'GE');
});

/* formato: i campi nuovi andata e ritorno senza perdite */
test('formato: campi dell\'arricchimento e del punteggio codificati senza perdite', () => {
  const aste = [
    { id: 'pvp-1', titolo: 'Casa', categoria: 'immobile', fonte: 'Portale Vendite Pubbliche', dataAsta: '2026-11-18', prezzoBase: 90000, linkAvviso: 'https://pvp.giustizia.it/pvp/it/detail_annuncio.page?idAnnuncio=1',
      numeroLotto: '1', rialzo: 1000, rischi: [], tentativo: 3, superficieMq: 92.5, valore: 200000, valoreMin: 180000, valoreMax: 220000, fonteValore: 'perizia',
      affidabilita: 'alta', costoTotale: 99700, sconto: 0.502, offertaMax: 125000, punteggio: 89, punteggioCompleto: true, deserte: 2, primoPrezzo: 160000, ribasso: 0.25,
      dettaglio: '2026-10-13', termineOfferte: '2026-11-17T12:00', stima: 200000, nFoto: 0, annoProcedura: 2022, prezzoPrecedente: 95000, dataRibasso: '2026-10-13', anomalia: 'offerta-minima-sopra-base' },
    { id: 'pvp-2', titolo: 'Box', categoria: 'immobile', fonte: 'Portale Vendite Pubbliche', dataAsta: '2026-11-18', linkAvviso: 'https://pvp.giustizia.it/pvp/it/detail_annuncio.page?idAnnuncio=2',
      rischi: ['abusi', 'quota'], tentativo: 1, valore: 1000, valoreMin: 850, valoreMax: 1150, fonteValore: 'prima-asta', affidabilita: 'bassa', sconto: -0.12, punteggio: 33, punteggioCompleto: false, annoProcedura: 2022 },
    { id: 'dem-x', titolo: 'Terreno', categoria: 'immobile', fonte: 'Agenzia del Demanio', dataAsta: '2026-11-18', linkAvviso: 'https://www.agenziademanio.it/x' }
  ];
  const dec = Formato.decodifica(JSON.parse(JSON.stringify(Formato.codifica(aste, CAMPI))));
  assert.deepEqual(dec, aste);
  for (const c of Object.keys(aste[0])) assert.ok(CAMPI.includes(c), c);
});

/* superficie: unità prima del numero e accessori */
test('superficie: "mq. 145", accessori distinti, lotti che sono box o terreni', () => {
  assert.equal(Estrai.superficie('due camere, un bagno, per complessivi mq. 145, L\'immobile').mq, 145);
  assert.equal(Estrai.superficie('LOCALE COMMERCIALE SITO IN PONTECORVO, PIANO T, MQ. 208 CATASTALI').mq, 208);
  assert.equal(Estrai.superficie('Villa con mq 300 di giardino e appartamento di mq. 120').mq, 120);
  assert.equal(Estrai.superficie('1.000 mq di terreno e casa di 90 mq').mq, 90);
  assert.equal(Estrai.superficie('Box di mq. 18').mq, 18);
  assert.equal(Estrai.superficie('Appartamento di 95 mq con cantina di 10 mq').mq, 95);
  assert.equal(Estrai.superficie('quota del 50% su mq 80').mq, 80);
  assert.equal(Estrai.superficie('Villetta con giardino di 300 mq e box'), null);
});
