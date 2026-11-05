import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  pulisci, descrizione, urlRisorsa, termine, mqChiari, catasto, cauzione, estrai, ordina, scarica, nomeFileSicuro, segnaposto, MAX_FOTO, MAX_DESCRIZIONE
} from '../scripts/lib/dettaglio-pvp.mjs';
import { componi, daVecchia, scriviSchede, leggiSchede, record, valutaTutte, arricchisci } from '../scripts/lib/arricchimento.mjs';
import { FonteBloccata } from '../scripts/lib/http.mjs';
import { converti } from '../scripts/fonti/pvp.mjs';

const require = createRequire(import.meta.url);
const Dettagli = require('../js/dettagli.js');
const T = require('../config/tariffe.js');
const OGGI = '2026-10-13';

/* ---------- dati personali ---------- */

test('pulisci: email, telefoni, codici fiscali, IBAN e nomi dopo titoli o ruoli', () => {
  const casi = [
    ['Rivolgersi al dott. Mario Rossi, mario.rossi@example.it, cell. 333 1234567', /Mario|Rossi|@|333/],
    ['Custode giudiziario Avv. Maria Bianchi tel. 06 1234567', /Maria|Bianchi|1234567/],
    ['IMMOBILE INTESTATO A ROSSI MARIO E BIANCHI ANNA, C.F. RSSMRA80A01H501U', /ROSSI|BIANCHI|RSSMRA/],
    ['Delegato alla vendita: Dott.ssa Paola Neri', /Paola|Neri/],
    ['bonifico su IBAN IT60X0542811101000000123456 intestato alla procedura', /IT60X/],
    ['C.F. e P.IVA 06669950963', /06669950963/],
    // casi reali della raccolta del 13/10/2026: un titolo o un ruolo prima del titolo vero non deve "coprire" il nome
    ['La vendita avverrà a cura del Notaio Incaricato Dott. Mario Rossi, mediante la Rete Aste Notarili', /Mario|Rossi/],
    ['supplemento di perizia redatta dal Dott. Ing. Luca Bianchi.', /Luca|Bianchi/],
    ['PERIZIA DEL DOTT. ING. MARIO ROSSI, IMMOBILE INTESTATO A ROSSI MARIO', /MARIO|ROSSI/],
    ['Km non rilevabili. Il Sig. Lo Re dichiara circa 2 milioni di km', /Lo Re/],
    ['Avv. De Luca Giovanni custode; dott.ssa Della Valle', /Luca|Giovanni|Valle/],
    ['ELABORATO PERITALE A CURA DEL PERITO IND. EDILE MOLTENI. VENDITA COMPETITIVA', /MOLTENI/],
    ["per visite contattare l'avv Biliotti; stima CTU Ing Ammendola", /Biliotti|Ammendola/],
    ['quota del debitore esecutato nato il 18 settembre 1945, porzione di fabbricato', /1945|settembre/],
    ['intestata a soggetto nata a San Giovanni Rotondo (FG) il 01/02/1960, residente', /1960/]
  ];
  for (const [t, vietato] of casi) {
    const p = pulisci(t);
    assert.doesNotMatch(p, vietato, p);
    assert.match(p, /\[omissis\]/);
  }
  // numeri dell'immobile e prezzi restano
  assert.equal(pulisci('prezzo base euro 312.500,00, offerta minima 234.375,00'), 'prezzo base euro 312.500,00, offerta minima 234.375,00');
  assert.equal(pulisci('foglio 43 particella 845 sub 3, cat. A/2'), 'foglio 43 particella 845 sub 3, cat. A/2');
  assert.equal(pulisci("L'immobile verrà consegnato libero a cura del Custode Giudiziario."), "L'immobile verrà consegnato libero a cura del Custode Giudiziario.");
  // le strade intitolate a una persona restano (sono indirizzi)
  assert.equal(pulisci('immobile in Via Dott. Giuseppe Mazzini 4, custode Avv. Paolo Neri'), 'immobile in Via Dott. Giuseppe Mazzini 4, custode Avv. [omissis]');
});

test('nomi dei file allegati: scartati se contengono dati personali', () => {
  assert.equal(nomeFileSicuro('/allegati/1/Perizia%20Oscurata.pdf?versionId=x'), true);
  assert.equal(nomeFileSicuro('/allegati/1/Avviso di vendita es 151 2022.pdf'), true);
  assert.equal(nomeFileSicuro('/allegati/1/perizia avv. Mario Rossi.pdf'), false);
  assert.equal(nomeFileSicuro('/allegati/1/RSSMRA80A01H501U.pdf'), false);
});

/* ---------- campi ---------- */

test('descrizione: testi senza ripetizioni, ripuliti, al massimo 1500 caratteri', () => {
  assert.equal(descrizione('Appartamento in Via Roma', [{ descrizione: 'Appartamento in Via Roma' }, { descrizione: 'Box auto di 15 mq' }]),
    'Appartamento in Via Roma. Box auto di 15 mq.');
  assert.equal(descrizione('Casa', [{ descrizione: 'Casa con giardino' }]), 'Casa con giardino.');
  assert.equal(descrizione(''), null);
  const lunga = descrizione('parola '.repeat(400));
  assert.ok(lunga.length <= MAX_DESCRIZIONE && lunga.endsWith('…'));
});

test('url delle risorse, termine, metri quadri, catasto, cauzione', () => {
  assert.equal(urlRisorsa('/allegati/1/AVV 1°ASTA.pdf?versionId=x'), 'https://resource-pvp.giustizia.it/allegati/1/AVV%201%C2%B0ASTA.pdf?versionId=x');
  assert.equal(urlRisorsa(null), null);
  assert.equal(termine('28/09/2026', '23:59'), '2026-09-28T23:59');
  assert.equal(termine('28/09/2026', ''), '2026-09-28');
  assert.equal(termine('', '12:00'), null);
  assert.equal(mqChiari('185'), 185);
  assert.equal(mqChiari('103,72'), 103.72);
  assert.equal(mqChiari('1.250 mq'), 1250);
  assert.equal(mqChiari('circa 100'), null);
  assert.equal(mqChiari(2), null);
  assert.equal(catasto([{ datiCatastali: [{ textFoglio: '43', textParticella: '845', textSubalterno: '3' }, { textFoglio: '43', textParticella: '845', textSubalterno: '3' }] }]), 'F.43 P.845 S.3');
  assert.deepEqual(cauzione('10% del prezzo offerto'), { testo: '10% del prezzo offerto', perc: 10 });
  assert.deepEqual(cauzione('5000,00'), { testo: '5000,00', perc: null });
  assert.deepEqual(cauzione(null), { testo: null, perc: null });
});

// corpo sintetico di /restricted (nessun dato reale), con i campi personali che NON devono finire nella scheda
function corpo(o = {}) {
  const fotoBene = Array.from({ length: 11 }, (_, i) => ({ descrizione: 'IMMAGINE BENE', linkAllegato: `/immagini-beni/77/1/foto${i}.jpg?versionId=v${i}` }));
  return {
    idVendita: 77, descTipoVendita: 'Senza Incanto', descModVendita: 'Asincrona Telematica', impoBaseAsta: 90000, impoStima: o.stima ?? 120000,
    impoOffertaAumento: 1000, dataTermPresOff: '19/11/2026', oraTermPresOff: '12:00', codEsito: o.esito,
    codFiscaleCustode: 'RSSMRA80A01H501U', soggetti: [{ nome: 'Mario', cognome: 'Rossi', email: 'mario@example.it', telefono: '3331234567' }],
    procedura: { numeRg: ' 151 ', numeAnnoRg: 2022, descTipoRito: 'Esecuzione immobiliare', nomeTitolarePegno: 'Mario' },
    lotto: { descLotto: 'Appartamento con cantina' },
    datiDeposito: { depoCauzionale: '10% del prezzo offerto', depositoContoSpese: '15%' },
    beni: [
      { descrizione: 'Appartamento al secondo piano di 95 mq. Custode: Avv. Mario Rossi', descTipologiaBene: 'Appartamento', superficie: o.sup ?? '92,50', numeroVani: 4, piano: 'Secondo',
        datiCatastali: [{ textFoglio: '10', textParticella: '200', textSubalterno: '5' }], allegati: fotoBene },
      { descrizione: 'Cantina', descTipologiaBene: 'Cantina', superficie: '8' }
    ],
    allegati: [
      { codiceTipoAllegato: 'PERIZ', descrizione: 'Perizia', linkAllegato: '/allegati/77/perizia.pdf?versionId=a' },
      { codiceTipoAllegato: 'PERIZ', descrizione: 'Perizia privacy', linkAllegato: '/allegati/77/perizia privacy.pdf?versionId=b' },
      { codiceTipoAllegato: 'AVEND', descrizione: 'Avviso', linkAllegato: '/allegati/77/avviso.pdf?versionId=c' },
      { codiceTipoAllegato: 'ORDIN', descrizione: 'Ordinanza', linkAllegato: '/allegati/77/ordinanza.pdf?versionId=d' }
    ]
  };
}

test('estrai: campi della scheda, foto al massimo 8, perizia oscurata preferita, nessun dato personale', () => {
  const s = estrai(corpo(), { oggi: OGGI, descLotto: 'Appartamento con cantina' });
  assert.equal(s.dettaglio, OGGI);
  assert.equal(s.foto.length, MAX_FOTO);
  assert.equal(s.fotoTotali, 11);
  assert.match(s.foto[0], /^https:\/\/resource-pvp\.giustizia\.it\/immagini-beni\/77\/1\/foto0\.jpg/);
  assert.match(s.allegati.perizia, /perizia%20privacy\.pdf/);
  assert.match(s.allegati.avviso, /avviso\.pdf/);
  assert.match(s.allegati.ordinanza, /ordinanza\.pdf/);
  assert.equal(s.catasto, 'F.10 P.200 S.5');
  assert.equal(s.mqScheda, 92.5); // dai beni, non la cantina
  assert.equal(s.vani, 4);
  assert.equal(s.cauzionePerc, 10);
  assert.equal(s.contoSpesePerc, 15);
  assert.equal(s.stima, 120000);
  assert.equal(s.rialzo, 1000);
  assert.equal(s.termineOfferte, '2026-11-19T12:00');
  assert.equal(s.rge, '151/2022');
  assert.equal(s.annoProcedura, 2022);
  assert.equal(s.modalita, 'Asincrona Telematica');
  const testo = JSON.stringify(s);
  assert.doesNotMatch(testo, /Rossi|Mario|RSSMRA|example\.it|3331234567/);
  // stima a zero = non indicata
  assert.equal(estrai(corpo({ stima: 0 }), { oggi: OGGI }).stima, undefined);
});

/* ---------- ordine e scaricamento ---------- */

test('ordine di lettura: pubblicate negli ultimi 3 giorni, poi data d\'asta più vicina, oggi in fondo', () => {
  const aste = [
    { id: 'a', dataAsta: '2026-12-01', pubblicata: '2026-08-01' },
    { id: 'b', dataAsta: '2026-10-20', pubblicata: '2026-08-01' },
    { id: 'c', dataAsta: OGGI, pubblicata: '2026-08-01' },
    { id: 'd', dataAsta: '2027-01-10', pubblicata: '2026-10-12' },
    { id: 'e', dataAsta: '2026-12-15', pubblicata: '2026-10-11' }
  ];
  assert.deepEqual(ordina(aste, OGGI).map((a) => a.id), ['d', 'e', 'b', 'a', 'c']);
});

test('scaricamento: tetto massimo, errori singoli saltati, stop se il sito blocca', async () => {
  let r = await scarica([1, 2, 3, 4], { max: 2, log: () => {}, leggi: async (id) => ({ id }) });
  assert.deepEqual([...r.dettagli.keys()], [1, 2]);
  assert.equal(r.richieste, 2);
  r = await scarica([1, 2, 3], { log: () => {}, leggi: async (id) => { if (id === 2) throw new Error('HTTP 404'); return { id }; } });
  assert.deepEqual([...r.dettagli.keys()], [1, 3]);
  r = await scarica([1, 2, 3], { log: () => {}, leggi: async (id) => { if (id === 2) throw new FonteBloccata('HTTP 429'); return { id }; } });
  assert.deepEqual([...r.dettagli.keys()], [1]);
  assert.match(r.fermo, /429/);
  r = await scarica([1, 2, 3, 4, 5, 6, 7], { log: () => {}, leggi: async () => { throw new Error('rete'); } });
  assert.equal(r.richieste, 5);
  assert.equal(r.fermo, '5 errori di fila');
});

test('scaricamento: 403 su una vendita si salta; ci si ferma solo se il sito rifiuta anche una vendita già letta', async () => {
  const negato = () => new FonteBloccata('accesso negato dal sito (HTTP 403)', 'bloccata', 403);
  // una vendita rifiutata (come la 4644696 del PVP): si salta e si continua
  let chiamate = [];
  let r = await scarica([1, 2, 3], { log: () => {}, leggi: async (id) => { chiamate.push(id); if (id === 2) throw negato(); return { id }; } });
  assert.deepEqual([...r.dettagli.keys()], [1, 3]);
  assert.equal(r.fermo, null);
  assert.equal(r.rifiutate, 1);
  // tre rifiuti di fila ma la vendita già letta risponde: si continua
  chiamate = [];
  r = await scarica([1, 2, 3, 4, 5], { log: () => {}, leggi: async (id) => { chiamate.push(id); if (id >= 2 && id <= 4 && chiamate.length <= 4) throw negato(); return { id }; } });
  assert.deepEqual(chiamate, [1, 2, 3, 4, 1, 5]);
  assert.deepEqual([...r.dettagli.keys()], [1, 5]);
  assert.equal(r.richieste, 6);
  assert.equal(r.fermo, null);
  // blocco vero: rifiuta anche la vendita già letta → stop
  chiamate = [];
  let primo = true;
  r = await scarica([1, 2, 3, 4, 5, 6], { log: () => {}, leggi: async (id) => { chiamate.push(id); if (primo) { primo = false; return { id }; } throw negato(); } });
  assert.deepEqual(chiamate, [1, 2, 3, 4, 1]);
  assert.match(r.fermo, /403.*3 vendite di fila e su una già letta/);
  // tre rifiuti all'inizio, nessuna vendita da riprovare: stop
  r = await scarica([1, 2, 3, 4], { log: () => {}, leggi: async () => { throw negato(); } });
  assert.equal(r.richieste, 3);
  assert.match(r.fermo, /3 vendite di fila$/);
});

/* ---------- composizione della scheda ---------- */

const asta = (o = {}) => ({
  id: 'pvp-77', categoria: 'immobile', tipo: 'Immobile residenziale', comune: 'Genova', provincia: 'GE', stato: 'libero', prezzoBase: 90000, dataAsta: '2026-11-20',
  _pvp: { id: 77, descLotto: o.descLotto ?? 'Appartamento di 80 mq con difformità edilizie sanabili', rialzoMinimo: 500 }, ...o
});

test('componi: senza dettaglio, descrizione dalla ricerca, superficie e rischi dal testo, storico', () => {
  const storia = { tentativo: 3, deserte: 2, primoPrezzo: 160000, ribasso: 0.25, storico: [['2025-06-10', 160000, 'deserta', 1], ['2025-12-10', 120000, 'deserta', 2]] };
  const { scheda, corti } = componi(asta(), { storia, oggi: OGGI });
  assert.equal(scheda.descrizione, 'Appartamento di 80 mq con difformità edilizie sanabili.');
  assert.equal(corti.superficieMq, 80);
  assert.equal(scheda.superficieDa, 'testo');
  assert.match(scheda.superficieProva, /80 mq/);
  assert.deepEqual(corti.rischi, ['abusi']);
  assert.equal(scheda.rischi[0].chiave, 'abusi');
  assert.match(scheda.rischi[0].prova, /difformità/);
  assert.deepEqual([corti.tentativo, corti.deserte, corti.primoPrezzo, corti.ribasso], [3, 2, 160000, 0.25]);
  assert.deepEqual(scheda.storico, [['2025-06-10', 160000, 'deserta'], ['2025-12-10', 120000, 'deserta']]);
  assert.equal(corti.rialzo, 500);
  assert.equal(corti.dettaglio, undefined);
  // testo senza rischi: elenco vuoto (controllato); senza testo: nessun campo
  assert.deepEqual(componi(asta({ _pvp: { id: 77, descLotto: 'Appartamento luminoso' } }), { oggi: OGGI }).corti.rischi, []);
  assert.equal(componi(asta({ _pvp: { id: 77, descLotto: '' } }), { oggi: OGGI }).corti.rischi, undefined);
});

// caso reale: vendita 4649172 (Prato), tra gli "Affari di oggi" del 22/10/2026 con il titolo "NESSUNA"
test('descrizione "NESSUNA" della fonte (pvp-4649172): titolo da categoria e comune, niente descrizione né rischi', async () => {
  const f = JSON.parse(await readFile(new URL('./fixture/pvp-4649172.json', import.meta.url), 'utf8'));
  const a = converti(f.ricerca);
  assert.equal(a.titolo, 'Abbigliamento e calzature – Prato');
  assert.deepEqual([a.comune, a.provincia, a.prezzoBase, a.categoria], ['Prato', 'PO', 2500, 'beni']);
  const d = estrai(f.dettaglio, { oggi: '2026-10-22', descLotto: f.ricerca.descLotto });
  assert.equal(d.descrizione, undefined);
  assert.equal(d.stima, 6500);
  // né dalla ricerca né dal dettaglio: nessun testo, quindi nessun "controllato, nessun rischio"
  for (const nuovoDettaglio of [null, f.dettaglio]) {
    const { scheda, corti } = componi(a, { nuovoDettaglio, oggi: '2026-10-22' });
    assert.equal(scheda.descrizione, undefined);
    assert.equal(corti.rischi, undefined);
  }
  // scheda letta il 22/10 prima della correzione e conservata nella cache: "NESSUNA." si toglie anche lì
  const vecchiaScheda = { dettaglio: '2026-10-22', descrizione: 'NESSUNA.', stima: 6500, rischi: [] };
  const c = componi(a, { vecchiaScheda, oggi: '2026-10-23' });
  assert.equal(c.scheda.descrizione, undefined);
  assert.equal(c.corti.rischi, undefined);
  assert.equal(c.corti.stima, 6500);
  assert.equal(segnaposto('NESSUNA'), true);
  assert.equal(segnaposto(' Nessuno. '), true);
  assert.equal(segnaposto('Nessuna servitù passiva'), false);
  assert.equal(descrizione('Garage', [{ descrizione: 'NESSUNA' }]), 'Garage.');
});

test('componi: dettaglio nuovo (superficie dai beni) e dettaglio conservato da un pezzo precedente', () => {
  const { scheda, corti } = componi(asta(), { nuovoDettaglio: corpo(), oggi: OGGI });
  assert.equal(corti.superficieMq, 92.5);
  assert.equal(scheda.superficieDa, 'scheda');
  assert.equal(corti.stima, 120000);
  assert.equal(corti.nFoto, 11);
  assert.equal(corti.dettaglio, OGGI);
  assert.equal(corti.annoProcedura, 2022);
  assert.equal(corti.rialzo, 1000);
  assert.equal(corti.termineOfferte, '2026-11-19T12:00');
  assert.equal(scheda.rge, '151/2022');
  // il record salvato nel pezzo basta per non rileggere il dettaglio il giorno dopo
  const salvato = record({ ...asta(), ...corti }, ['id', 'superficieMq', 'stima', 'dettaglio', 'termineOfferte', 'annoProcedura', 'rialzo', 'nFoto'], scheda);
  const v = daVecchia(JSON.parse(JSON.stringify(salvato)));
  assert.equal(v.dettaglio, OGGI);
  assert.equal(v.mqScheda, 92.5);
  const dopo = componi(asta(), { vecchiaScheda: salvato, oggi: '2026-10-14' });
  assert.equal(dopo.corti.dettaglio, OGGI);
  assert.equal(dopo.corti.stima, 120000);
  assert.equal(dopo.corti.superficieMq, 92.5);
  assert.equal(dopo.scheda.foto.length, MAX_FOTO);
  assert.equal(daVecchia({ id: 'x', descrizione: 'solo ricerca' }), null);
  // un testo conservato (salvato con regole più vecchie) si ripulisce di nuovo
  const vecchio = daVecchia({ id: 'x', dettaglio: '2026-10-12', descrizione: 'Vendita a cura del Notaio Incaricato Dott. Mario Rossi.' });
  assert.equal(vecchio.descrizione, 'Vendita a cura del Notaio Incaricato Dott. [omissis].');
});

test('componi: ribasso da un giorno all\'altro (stesso id) e conservato finché il prezzo resta quello', () => {
  let r = componi(asta({ prezzoBase: 80000 }), { prima: { prezzoBase: 90000 }, oggi: OGGI });
  assert.deepEqual([r.corti.prezzoPrecedente, r.corti.dataRibasso], [90000, OGGI]);
  r = componi(asta({ prezzoBase: 80000 }), { prima: { prezzoBase: 80000, prezzoPrecedente: 90000, dataRibasso: OGGI }, oggi: '2026-10-14' });
  assert.deepEqual([r.corti.prezzoPrecedente, r.corti.dataRibasso], [90000, OGGI]);
  r = componi(asta({ prezzoBase: 95000 }), { prima: { prezzoBase: 90000 }, oggi: OGGI });
  assert.equal(r.corti.prezzoPrecedente, undefined);
});

/* ---------- pezzi ---------- */

test('chiave dei pezzi: 128 valori (00..7f), stabile', () => {
  const visti = new Set();
  for (let i = 0; i < 5000; i++) {
    const k = Dettagli.chiave('pvp-' + (4000000 + i));
    assert.match(k, /^[0-7][0-9a-f]$/);
    visti.add(k);
  }
  assert.equal(visti.size, 128);
  assert.equal(Dettagli.chiave('pvp-123'), Dettagli.chiave('pvp-123'));
  assert.equal(Dettagli.chiavi().length, 128);
  assert.equal(Dettagli.chiavi()[127], '7f');
  const t = Dettagli.testo('3f', { 'pvp-1': { id: 'pvp-1', titolo: 'Casa' } });
  assert.deepEqual(Dettagli.analizza(t), { 'pvp-1': { id: 'pvp-1', titolo: 'Casa' } });
});

test('scrittura e lettura dei pezzi: 128 file, i vecchi pezzi 80..ff tolti, carica() nel browser simulato', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'radar-pezzi-'));
  try {
    await writeFile(path.join(dir, 'a3.js'), Dettagli.testo('a3', { 'pvp-9': { id: 'pvp-9', dettaglio: '2026-10-01' } }));
    assert.equal((await leggiSchede(dir)).get('pvp-9').dettaglio, '2026-10-01'); // pezzo del vecchio schema ancora letto
    const records = new Map([['pvp-1', { id: 'pvp-1', titolo: 'Casa' }], ['pvp-2', { id: 'pvp-2', titolo: 'Box' }]]);
    const r = await scriviSchede(dir, records);
    assert.equal(r.file, 128);
    assert.equal(r.tolti, 1);
    const file = (await readdir(dir)).sort();
    assert.equal(file.length, 128);
    assert.equal(file[0], '00.js');
    assert.equal(file[127], '7f.js');
    const lette = await leggiSchede(dir);
    assert.equal(lette.size, 2);
    assert.equal(lette.get('pvp-2').titolo, 'Box');
    // Dettagli.carica legge solo il pezzo (qui già caricato nella variabile globale, come fa il tag <script>)
    const k = Dettagli.chiave('pvp-1');
    const testo = await readFile(path.join(dir, k + '.js'), 'utf8');
    const window = globalThis;
    new Function('window', testo)(window);
    assert.equal((await Dettagli.carica('pvp-1')).titolo, 'Casa');
    assert.equal(await Dettagli.carica('pvp-inesistente-' + k), null);
    delete globalThis.RADAR_DETTAGLI;
  } finally { await rm(dir, { recursive: true, force: true }); }
});

/* ---------- integrazione del punteggio ---------- */

test('punteggio nella raccolta: campi corti uniti all\'asta, dettaglio per il pezzo, zone da tutte le aste', () => {
  const zona = Array.from({ length: 12 }, (_, i) => ({ id: 'z' + i, categoria: 'immobile', tipo: 'Immobile residenziale', comune: 'Genova', provincia: 'GE',
    stima: 200000 + i * 1000, superficieMq: 100, prezzoBase: 200000, tentativo: 1, stato: 'libero', rischi: [] }));
  const buona = { id: 'pvp-1', categoria: 'immobile', tipo: 'Immobile residenziale', comune: 'Genova', provincia: 'GE', stato: 'libero',
    prezzoBase: 120000, stima: 200000, superficieMq: 95, tentativo: 3, rischi: [], punteggio: 1 /* vecchio valore: si ricalcola */ };
  const senza = { id: 'pvp-2', categoria: 'immobile', tipo: 'Immobile residenziale', prezzoBase: 50000 };
  const aste = [...zona, buona, senza];
  const { zone, dettagli } = valutaTutte(aste, T);
  assert.equal(zone.comune['Genova|GE'].n, 13);
  assert.equal(buona.fonteValore, 'perizia');
  assert.equal(buona.affidabilita, 'alta');
  assert.equal(buona.valore, 200000);
  assert.equal(buona.valoreMin, 180000);
  assert.equal(buona.valoreMax, 220000);
  assert.ok(buona.sconto > 0.3);
  assert.ok(buona.punteggio > 60 && buona.punteggio <= 100);
  assert.equal(buona.punteggioCompleto, true);
  assert.ok(buona.costoTotale > 120000 && buona.offertaMax > 0);
  const d = dettagli.get('pvp-1');
  assert.deepEqual(Object.keys(d.parti).sort(), ['occupazione', 'rischi', 'sconto', 'tentativo', 'zona']);
  assert.equal(d.zona.livello, 'comune');
  assert.match(d.mancanti.join(), /OMI/);
  assert.equal(senza.punteggio, undefined);
  assert.match(dettagli.get('pvp-2').mancanti.join(), /valore di mercato/);
  // record del pezzo: campi corti + lunghi (che prevalgono) + dettaglio del punteggio
  const r = record(buona, ['id', 'prezzoBase', 'rischi', 'punteggio', 'rge'], { rischi: [], rge: '151/2022', descrizione: 'Casa' }, d);
  assert.equal(r.rge, '151/2022');
  assert.deepEqual(r.rischi, []);
  assert.equal(r.descrizione, 'Casa');
  assert.ok(r.parti && r.mancanti && r.zona);
});

test('arricchisci senza rete: storico dall\'indice, dettagli conservati, aste di altre fonti con i dati di prima', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'radar-arr-'));
  try {
    const fileIndice = path.join(dir, 'indice.json');
    const righe = [[1, 'T1', '120', '1', '2025-06-10', 160000, 'ASDES', 'Genova', 'Via Roma 10', 'I', 'IMMOBILE_RESIDENZIALE']];
    await writeFile(fileIndice, JSON.stringify({ versione: 1, completo: true, righe }));
    const cartella = path.join(dir, 'dettagli');
    await scriviSchede(cartella, new Map([['dem-1', { id: 'dem-1', descrizione: 'Terreno demaniale', storico: [] }],
      ['pvp-5', { id: 'pvp-5', dettaglio: '2026-10-10', stima: 150000, foto: ['https://resource-pvp.giustizia.it/x.jpg'] }]]));
    const pvp = (id, prezzo) => ({ id: 'pvp-' + id, categoria: 'immobile', tipo: 'Immobile residenziale', comune: 'Genova', provincia: 'GE', prezzoBase: prezzo, dataAsta: '2026-11-20',
      _pvp: { id, codiceTribunale: 'T1', procedura: '120', numeroLotto: '1', dataVendita: '2026-11-20', prezzoBaseAsta: prezzo, indirizzo: { citta: 'Genova', via: 'Via Roma 10' },
        tipoLotto: 'IMMOBILI', categoriaLotto: 'IMMOBILE_RESIDENZIALE', descLotto: 'Appartamento di 70 mq' } });
    const aste = [pvp(5, 120000), { id: 'dem-1', fonte: 'Agenzia del Demanio', titolo: 'Terreno' }];
    const { schede, stat } = await arricchisci({ aste, oggi: OGGI, cartella, fileIndice, rete: false, log: () => {} });
    assert.equal(aste[0].tentativo, 2);
    assert.equal(aste[0].primoPrezzo, 160000);
    assert.equal(aste[0].stima, 150000);       // dal dettaglio salvato nel pezzo
    assert.equal(aste[0].dettaglio, '2026-10-10');
    assert.equal(aste[0].nFoto, 1);
    assert.equal(aste[0].superficieMq, 70);
    assert.equal(aste[0]._pvp !== undefined, true); // _pvp lo toglie la raccolta
    assert.equal(schede.get('dem-1').descrizione, 'Terreno demaniale');
    assert.equal(stat.catene, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
