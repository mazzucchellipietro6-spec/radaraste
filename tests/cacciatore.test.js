const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../config/tariffe.js');
const K = require('../js/cacciatore.js');

const OGGI = '2026-10-13';
function asta(x) {
  return { id: 'pvp-' + Math.random().toString(36).slice(2), titolo: 'Appartamento – Genova', categoria: 'immobile', tipo: 'Immobile residenziale',
    regione: 'Liguria', provincia: 'GE', comune: 'Genova', tribunale: 'Genova', rge: '100', prezzoBase: 90000, offertaMinima: 67500,
    dataAsta: '2026-12-01', ora: '10:00', pubblicata: '2026-10-12', stato: 'libero', stima: 200000, superficieMq: 100, tentativo: 3, deserte: 2,
    primoPrezzo: 160000, rischi: [], linkAvviso: 'https://pvp.giustizia.it/pvp/it/detail_annuncio.page?idAnnuncio=1', ...x };
}

test('candidati: solo future, nuove da ieri o ribassate da ieri', () => {
  const l = [asta({}), asta({ pubblicata: '2026-09-01' }), asta({ pubblicata: '2026-09-01', dataRibasso: '2026-10-13', prezzoPrecedente: 100000 }),
    asta({ dataAsta: '2026-10-01' }), asta({ pubblicata: '2026-09-01', tentativo: 2 })];
  const c = K.candidati(l, OGGI);
  assert.equal(c.length, 2);
  assert.deepEqual(c.map((x) => x.motivo).sort(), ['nuovo-tentativo', 'ribasso']);
});

test('analizza: affare con segnali e riassunto a regole, scadenza dichiarata se manca', () => {
  const x = K.analizza({ asta: asta({}), motivo: 'nuovo-tentativo' }, { T });
  assert.equal(x.scarto, null);
  assert.ok(x.punteggio >= 80);
  assert.match(x.segnaliAffare.join(' | '), /Sconto reale del 50%/);
  assert.match(x.segnaliAffare.join(' | '), /3° tentativo \(2 aste andate deserte\): prezzo sceso del 44% dal primo/);
  assert.match(x.segnaliAffare.join(' | '), /Immobile libero/);
  const r = K.riassunto(x);
  assert.match(r.scadenza.testo, /non letto dall'avviso/);
  assert.match(r.offertaMassima.testo, /Offerta massima consigliata/);
  assert.ok(r.nonSappiamo.some((s) => /OMI/.test(s)));
  assert.ok(r.nonSappiamo.some((s) => /perizia/.test(s)));
});

test('analizza: scarti motivati, mai inventati', () => {
  assert.equal(K.analizza({ asta: asta({ stima: null, primoPrezzo: null, tentativo: null }) }, { T }).scarto, 'valore di mercato non stimabile');
  assert.equal(K.analizza({ asta: asta({ prezzoBase: null }) }, { T }).scarto, 'prezzo base non indicato');
  assert.match(K.analizza({ asta: asta({ superficieMq: null }) }, { T }).scarto, /poco affidabile/);
  assert.match(K.analizza({ asta: asta({ prezzoBase: 185000, offertaMinima: 138750 }) }, { T }).scarto, /sconto reale sotto/);
});

test('pericoli: occupato, quota, diritto di superficie, condominio', () => {
  const x = K.analizza({ asta: asta({ stato: 'occupato', rischi: ['quota', 'superficie', 'condominio'] }) }, { T });
  const p = x.pericoli.join(' | ');
  assert.match(p, /Occupato/); assert.match(p, /quota/); assert.match(p, /superficie/); assert.match(p, /condominiali/);
});

test('seleziona: un lotto per procedura, due per comune, al massimo dieci', () => {
  const l = [];
  for (let i = 0; i < 4; i++) l.push(K.analizza({ asta: asta({ rge: '7', comune: 'Genova' }) }, { T }));
  for (let i = 0; i < 4; i++) l.push(K.analizza({ asta: asta({ rge: String(20 + i), comune: 'Savona', provincia: 'SV' }) }, { T }));
  for (let i = 0; i < 12; i++) l.push(K.analizza({ asta: asta({ rge: String(50 + i), comune: 'Comune' + i }) }, { T }));
  const s = K.seleziona(l);
  assert.equal(s.length, 10);
  assert.equal(s.filter((x) => x.asta.rge === '7').length, 1);
  assert.equal(s.find((x) => x.asta.rge === '7').altriLotti, 3);
  assert.ok(s.filter((x) => x.asta.comune === 'Savona').length <= 2);
});

test('esegui: meno di 5 affari → lo dice, non riempie', () => {
  const r = K.esegui({ aste: [asta({}), asta({ stima: null, primoPrezzo: null, tentativo: null })], oggi: OGGI, T });
  assert.equal(r.analizzate, 2);
  assert.equal(r.migliori.length, 1);
  assert.match(r.nota, /solo 1/);
  assert.equal(r.scartate['valore di mercato non stimabile'], 1);
  assert.match(r.telegram, /Affari di oggi/);
});

test('personale: zona, budget e strategia', () => {
  const pis = [K.analizza({ asta: asta({}) }, { T }), K.analizza({ asta: asta({ regione: 'Lombardia', provincia: 'MI', comune: 'Milano' }) }, { T }),
    K.analizza({ asta: asta({ stato: 'occupato', prezzoBase: 60000, rge: '9' }) }, { T })];
  assert.equal(K.personale(pis, { regioni: ['Liguria'] }).length, 2);
  assert.equal(K.personale(pis, { budget: 80000 }).length, 1);
  assert.equal(K.personale(pis, { regioni: ['Liguria'], strategia: 'vivo' })[0].asta.stato, 'libero');
});

test('storico: aggiunge le segnalate e legge gli esiti; misure prudenti', () => {
  const r = K.esegui({ aste: [asta({ id: 'pvp-1', dataAsta: '2026-10-20' })], oggi: OGGI, T });
  let s = K.aggiornaStorico(null, r, {}, OGGI);
  assert.equal(s.segnalate.length, 1);
  s = K.aggiornaStorico(s, { migliori: [] }, { 'pvp-1': { esito: 'AGGIU', aggiudicazione: 95000 } }, '2026-10-21');
  assert.equal(s.segnalate[0].esito, 'aggiudicata');
  assert.equal(s.segnalate[0].prezzoFinale, 95000);
  assert.equal(s.misure.aggiudicate, 1);
  assert.match(s.misure.nota, /almeno 30 esiti/);
});

test('scadenza con data e ora dal dettaglio (AAAA-MM-GGTHH:MM) e senza termine', () => {
  const K = require('../js/cacciatore.js');
  const x = { asta: { id: 'pvp-1', titolo: 't', dataAsta: '2026-12-04', termineOfferte: '2026-12-03T12:00', prezzoBase: 1000 }, valore: null, segnaliAffare: [], pericoli: [], nonSappiamo: [] };
  const r = K.riassunto(x);
  assert.equal(r.scadenza.data, '2026-12-03');
  assert.equal(r.scadenza.ora, '12:00');
  assert.equal(r.scadenza.testo, 'Offerte entro il 03/12/2026 alle 12:00 (dall\'avviso)');
  const senza = K.riassunto({ ...x, asta: { ...x.asta, termineOfferte: null } });
  assert.match(senza.scadenza.testo, /asta il 04\/12\/2026/);
});

test('riassunto: senza testo dell\'avviso non dice "nessun rischio" (caso reale pvp-4637293, raccolta del 12/10)', () => {
  // asta reale del PVP senza testo letto: il campo rischi manca del tutto
  const reale = { id: 'pvp-4637293', titolo: 'Autoveicoli e cicli', categoria: 'auto', tipo: 'Autoveicoli e cicli', regione: 'Toscana', provincia: 'PT',
    tribunale: 'Pistoia', rge: '597', fonte: 'Portale Vendite Pubbliche', prezzoBase: 3000, offertaMinima: 3000, dataAsta: '2026-10-22', ora: '10:00',
    stato: 'nd', linkAvviso: 'https://pvp.giustizia.it/pvp/it/detail_annuncio.page?idAnnuncio=4637293', pubblicata: '2026-09-28', vista: '2026-10-12', numeroLotto: 'Unico' };
  const x = K.analizza({ asta: reale }, { T });
  assert.deepEqual(K.riassunto(x).rischi, ['Testo dell\'avviso non disponibile: rischi da verificare nella perizia']);
  assert.ok(x.nonSappiamo.some((s) => /testo non disponibile/.test(s)));
  // con altri pericoli la mancanza del testo resta scritta in fondo
  const occ = K.riassunto(K.analizza({ asta: asta({ stato: 'occupato', rischi: undefined }) }, { T }));
  assert.match(occ.rischi[0], /Occupato/);
  assert.equal(occ.rischi[occ.rischi.length - 1], 'Testo dell\'avviso non disponibile: rischi da verificare nella perizia');
  // testo letto e nessun rischio: la frase di prima
  assert.deepEqual(K.riassunto(K.analizza({ asta: asta({}) }, { T })).rischi, ['Nessun rischio trovato nel testo dell\'avviso: leggi comunque la perizia']);
});

test('frasi: con zero affari "nessuna asta", con uno il singolare (data/affari.js del 22/10: 1 analizzata, 0 scelte)', () => {
  assert.equal(K.nota(0), 'Oggi nessuna asta supera tutti i criteri: meglio aspettare che proporre affari incerti.');
  assert.equal(K.nota(1), 'Oggi solo 1 asta supera tutti i criteri: non ne aggiungiamo altre per arrivare a 5.');
  assert.equal(K.nota(3), 'Oggi solo 3 aste superano tutti i criteri: non ne aggiungiamo altre per arrivare a 5.');
  assert.equal(K.nota(5), null);
  // giro reale del 22/10: una sola asta nuova, scartata per il prezzo base mancante
  const r = K.esegui({ aste: [asta({ prezzoBase: null })], oggi: OGGI, T });
  assert.equal(r.nota, 'Oggi nessuna asta supera tutti i criteri: meglio aspettare che proporre affari incerti.');
  assert.match(r.telegram, /^1 asta nuova o ribassata analizzata, nessuna supera i criteri\.$/m);
  const uno = K.esegui({ aste: [asta({})], oggi: OGGI, T });
  assert.match(uno.telegram, /^1 asta nuova o ribassata analizzata, 1 supera i criteri\.$/m);
});

test('tentativo stimato dai prezzi nei segnali d\'affare, dichiarato come stima (caso reale pvp-4566904, Sant\'Elpidio a Mare)', () => {
  const x = K.analizza({ asta: asta({ categoria: 'immobile', tentativo: 3, deserte: 2, primoPrezzo: 534800, prezzoBase: 169214.06, offertaMinima: 126910.54, stima: 484380 }), motivo: 'nuovo-tentativo' }, { T });
  assert.equal(x.tentativoMinimo, 5);
  const s = x.segnaliAffare.find((f) => /tentativo/.test(f));
  assert.match(s, /^È almeno il 5° tentativo \(stima: il prezzo base è quello della prima asta, 534\.800 €, ridotto 4 volte del 25%; l'indice del Portale ne mostra 3\)/);
  assert.equal(K.compatta(x).tentativoMinimo, 5);
  // senza aste mancanti la frase resta quella di prima
  const y = K.analizza({ asta: asta({}), motivo: 'nuova' }, { T });
  assert.equal(y.tentativoMinimo, undefined);
  assert.ok(y.segnaliAffare.some((f) => /^È il 3° tentativo \(2 aste andate deserte\)/.test(f)));
});
