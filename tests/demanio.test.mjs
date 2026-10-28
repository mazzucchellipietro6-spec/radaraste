// Lettore dell'Agenzia del Demanio (scripts/fonti/demanio.mjs): data dell'asta dal testo dell'avviso, termine nel suo campo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { leggiScheda, giornoAsta, categoriaBene } from '../scripts/fonti/demanio.mjs';

const URL_VENETO = 'https://www.agenziademanio.it/it/gare-aste/beni-mobili-e-veicoli-confiscati/gara/Asta-pubblica-per-la-vendita-di-n.-25-lotti-di-beni-mobili-di-competenza-della-Direzione-Regionale-Veneto';

test('scheda reale (Veneto, 25 lotti): asta l\'11/11 come scritto nell\'avviso, termine per le offerte il 10/11 alle 16:00', async () => {
  // estratto della pagina pubblica scaricata il 26/10/2026 (tests/fixture/demanio-veneto-17839.html)
  const h = await readFile(new URL('./fixture/demanio-veneto-17839.html', import.meta.url), 'utf8');
  const a = leggiScheda(h, URL_VENETO, 'beni', 'Asta pubblica per la vendita di n. 25 lotti di beni mobili di competenza della Direzione Regionale Veneto',
    { data: '2026-11-10', ora: '16:00' }, '2026-10-21');
  assert.equal(a.id, 'dem-Asta-pubblica-per-la-vendita-di-n.-25-lotti-di-beni-mobili-di-competenza-della-D');
  assert.equal(a.dataAsta, '2026-11-11');
  assert.equal(a.ora, '', 'l\'ora dell\'asta non è nella pagina: non si usa quella del termine');
  assert.equal(a.termineOfferte, '2026-11-10T16:00');
  assert.equal(a.provincia, 'VE');
  assert.equal(a.comune, 'Mestre');
  assert.equal(a.categoria, 'auto');
  assert.equal(a.linkPdf, 'https://www.agenziademanio.it/export/sites/demanio/download/Documentigare_2026_2/Bando_2026_17839_DR_VE.pdf');
  assert.match(a.descrizione, /^Asta pubblica del giorno 11 novembre 2026/);
  // il termine si legge anche dalla scheda, senza quello dell'elenco
  assert.equal(leggiScheda(h, URL_VENETO, 'beni', 'Asta pubblica', null, '').termineOfferte, '2026-11-10T16:00');
});

test('categoria: "beni mobili" restano beni, salvo veicoli veri (testi reali del Demanio del 21-22/10/2026)', async () => {
  const VENETO = 'Asta pubblica per la vendita di n. 25 lotti di beni mobili di competenza della Direzione Regionale Veneto';
  // il titolo da solo dice "beni mobili": nessuna parola dei veicoli, quindi beni
  assert.equal(categoriaBene(VENETO, 'beni'), 'beni');
  // ma la descrizione della stessa gara dice che ogni lotto è un veicolo confiscato (art. 215 C.d.S.): sono veicoli veri
  const h = await readFile(new URL('./fixture/demanio-veneto-17839.html', import.meta.url), 'utf8');
  const a = leggiScheda(h, URL_VENETO, 'beni', VENETO, { data: '2026-11-10', ora: '16:00' }, '2026-10-21');
  assert.match(a.descrizione, /ciascuno composto da veicolo oggetto di confisca definitiva/);
  assert.equal(a.categoria, 'auto', 'veicoli: la categoria dei veicoli del sito (come AUTOVEICOLI_E_CICLI del PVP)');
  // senza la frase sui veicoli la stessa pagina è una vendita di beni
  assert.equal(leggiScheda(h.replace('ciascuno composto da veicolo oggetto di confisca definitiva ovvero assoggettato', 'ciascuno composto da beni assoggettati'), URL_VENETO, 'beni', VENETO, null, '').categoria, 'beni');
  // gara reale del 22/10/2026 (stessa sezione): materiale metallico, DPR 189/2001
  assert.equal(categoriaBene('Asta pubblica per la vendita di n. 1 lotto di materiale metallico di competenza della Direzione Regionale Veneto Asta pubblica per la vendita di n. 1 lotto di materiale metallico ovvero assoggettato alle procedure di cui al DPR 189/2001.', 'beni'), 'beni');
  // parole dei veicoli usate per altri beni (frasi costruite sul modello degli avvisi): restano beni
  assert.equal(categoriaBene('Vendita di ricambi per autoveicoli e pneumatici', 'beni'), 'beni');
  assert.equal(categoriaBene('Lotto di rottami ferrosi derivanti da veicoli demoliti', 'beni'), 'beni');
  assert.equal(categoriaBene('Pezzi di ricambio per moto', 'beni'), 'beni');
  // veicoli veri: moto solo senza auto nello stesso testo; "motoveicoli" non è un'auto
  assert.equal(categoriaBene('Asta per n. 3 motoveicoli confiscati', 'beni'), 'moto');
  assert.equal(categoriaBene('Lotti composti da autovetture e motocicli', 'beni'), 'auto');
  assert.equal(categoriaBene('Autovettura Fiat Panda', 'beni'), 'auto');
  // la sezione immobiliare resta immobile
  assert.equal(categoriaBene('Autorimessa con posti auto', 'immobile'), 'immobile');
});

test('giorno dell\'asta: scritto in lettere o in cifre (titoli e descrizioni reali dell\'elenco), con l\'ora se c\'è', () => {
  assert.deepEqual(giornoAsta('Asta pubblica del giorno 04 marzo 2026 per la vendita di n. 2 lotti composti da bene dichiarate fuori uso.'), { data: '2026-03-04', ora: '' });
  assert.deepEqual(giornoAsta('Asta pubblica del giorno 09.06.2026 per la vendita di n. 7 lotti'), { data: '2026-06-09', ora: '' });
  assert.deepEqual(giornoAsta('si terrà il giorno 20/11/2026 alle ore 10.30 presso la sede'), { data: '2026-11-20', ora: '10:30' });
  assert.equal(giornoAsta('Quota indivisa di fabbricato residenziale situato nel'), null);
  assert.equal(giornoAsta('del giorno 31 brumaio 2026'), null);
  // il termine per le offerte scritto nel testo non è il giorno dell'asta (frasi costruite sul modello degli avvisi)
  assert.equal(giornoAsta('Le offerte dovranno pervenire entro il giorno 10/11/2026'), null);
  assert.equal(giornoAsta('entro e non oltre le ore 12:00 del giorno 10.11.2026'), null);
  assert.deepEqual(giornoAsta('offerte entro le ore 12 del giorno 10.11.2026; l\'asta si terrà il giorno 11.11.2026 alle ore 10:00'), { data: '2026-11-11', ora: '10:00' });
});

test('avviso senza il giorno dell\'asta (Portoferraio, raccolta del 12/10): data = termine per le offerte, come prima', () => {
  const h = '<p class="descrizione"><span>Descrizione: </span>Quota indivisa di fabbricato residenziale situato nel</p><p class="tipologia"><span>Tipologia: </span>Pubblicità rinnovo - formalizzazione utilizzo</p>' +
    '<p class="regione"><span>Regione: </span>TOSCANA</p><p class="provincia"><span>Provincia: </span>LIVORNO</p><p class="comune"><span>Comune: </span>PORTOFERRAIO</p>' +
    '<p class="datascadenza"><span>Termine per la presentazione delle offerte: </span>06 novembre 2026  12:00</p><div class="documentigara"><h2>Documenti</h2></div>';
  const a = leggiScheda(h, 'https://www.agenziademanio.it/it/gare-aste/immobiliare/gara/Avviso-di-vendita-quota-indivisa-di-bene-immobile-sito-nel-Comune-di-Portoferraio-LI', 'immobile',
    'Avviso di vendita quota indivisa di bene immobile sito nel Comune di Portoferraio (LI)', { data: '2026-11-06', ora: '12:00' }, '2026-10-08');
  assert.equal(a.dataAsta, '2026-11-06');
  assert.equal(a.ora, '12:00');
  assert.equal(a.termineOfferte, '2026-11-06T12:00');
  // un giorno prima del termine non è il giorno dell'asta
  const prima = leggiScheda(h.replace('situato nel', 'aggiudicato il giorno 01 ottobre 2026'), 'https://x/gara/Y', 'immobile', 'Avviso', { data: '2026-11-06', ora: '12:00' }, '');
  assert.equal(prima.dataAsta, '2026-11-06');
});

/* ---------- il sito legge le date del nuovo lettore e quelle dei dati raccolti prima (senza termineOfferte) ---------- */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Formato = require('../js/formato.js');
const Calendario = require('../js/calendario.js');
const SD = require('../js/scheda-dati.js');
const Cacciatore = require('../js/cacciatore.js');
const Consulente = require('../js/consulente.js');
const T = require('../config/tariffe.js');

// stessa vendita reale: dati locali del 22/10/2026 (vecchio lettore) e lettura della pagina pubblica del 26/10/2026
const VECCHIA = { id: 'dem-Asta-pubblica-per-la-vendita-di-n.-25-lotti-di-beni-mobili-di-competenza-della-D', titolo: 'Asta pubblica per la vendita di n. 25 lotti di beni mobili di competenza della Direzione Regionale Veneto',
  categoria: 'auto', comune: 'Mestre', provincia: 'VE', regione: 'Veneto', fonte: 'Agenzia del Demanio', dataAsta: '2026-11-10', ora: '16:00', stato: 'nd', linkAvviso: URL_VENETO, pubblicata: '2026-10-21' };
async function nuova() {
  const h = await readFile(new URL('./fixture/demanio-veneto-17839.html', import.meta.url), 'utf8');
  return leggiScheda(h, URL_VENETO, 'beni', VECCHIA.titolo, { data: '2026-11-10', ora: '16:00' }, '2026-10-21');
}

test('Formato.date: Demanio con il giorno dell\'asta, senza (termine = data) e raccolto prima del 26/10; PVP come prima', async () => {
  const a = await nuova();
  assert.deepEqual(Formato.date(a), { asta: { data: '2026-11-11', ora: '' }, termine: { data: '2026-11-10', ora: '16:00' } });
  // dati vecchi: la data è il termine, il giorno dell'asta non si conosce
  assert.deepEqual(Formato.date(VECCHIA), { asta: null, termine: { data: '2026-11-10', ora: '16:00' } });
  // nuovo lettore, avviso senza il giorno dell'asta (Portoferraio): dataAsta e ora sono il termine
  assert.deepEqual(Formato.date({ fonte: 'Agenzia del Demanio', dataAsta: '2026-11-06', ora: '12:00', termineOfferte: '2026-11-06T12:00' }), { asta: null, termine: { data: '2026-11-06', ora: '12:00' } });
  // PVP: dataAsta è sempre l'asta, anche senza termine
  assert.deepEqual(Formato.date({ fonte: 'Portale Vendite Pubbliche', dataAsta: '2026-12-03', ora: '09:30', termineOfferte: '2026-12-02T12:00' }), { asta: { data: '2026-12-03', ora: '09:30' }, termine: { data: '2026-12-02', ora: '12:00' } });
  assert.deepEqual(Formato.date({ fonte: 'Portale Vendite Pubbliche', dataAsta: '2026-12-03', ora: '09:30' }), { asta: { data: '2026-12-03', ora: '09:30' }, termine: null });
  assert.deepEqual(Formato.date({}), { asta: null, termine: null });
});

test('calendario (.ics) del Demanio: termine ed eventuale giorno dell\'asta, mai un giorno d\'asta inventato', async () => {
  const s = Calendario.scadenze(await nuova());
  assert.deepEqual(s.map((x) => [x.chiave, x.data, x.ora]), [['offerte', '2026-11-10', '16:00'], ['asta', '2026-11-11', '']]);
  assert.deepEqual(Calendario.scadenze(VECCHIA).map((x) => [x.chiave, x.data, x.ora]), [['offerte', '2026-11-10', '16:00']]);
  const ics = Calendario.ics(VECCHIA, new Date('2026-10-26T08:00:00Z'));
  assert.match(ics, /SUMMARY:Termine per le offerte – Asta pubblica/);
  assert.doesNotMatch(ics, /SUMMARY:Asta – /);
});

test('linea del tempo del Demanio: termine e giorno dell\'asta dal nuovo lettore; con i dati vecchi solo il termine', async () => {
  const lt = SD.lineaTempo(await nuova(), { adesso: '2026-10-26T10:00' });
  const ev = (k) => lt.eventi.find((e) => e.chiave === k);
  assert.deepEqual(lt.eventi.map((e) => e.chiave), ['pubblicazione', 'termine', 'asta', 'saldo']);
  assert.deepEqual([ev('termine').data, ev('termine').ora, ev('termine').qui], ['2026-11-10', '16:00', false]);
  assert.deepEqual([ev('asta').data, ev('asta').titolo, ev('asta').qui, ev('asta').stato], ['2026-11-11', 'Giorno dell\'asta', true, 'futuro']);
  assert.match(ev('asta').nota, /Prezzo base nel PDF dell'avviso/);
  assert.equal(ev('saldo').data, null, 'nessun saldo stimato per il Demanio');
  const vecchia = SD.lineaTempo(VECCHIA, { adesso: '2026-10-26T10:00' });
  assert.deepEqual(vecchia.eventi.map((e) => e.chiave), ['pubblicazione', 'termine', 'saldo']);
  assert.deepEqual([vecchia.eventi[1].data, vecchia.eventi[1].ora, vecchia.eventi[1].qui], ['2026-11-10', '16:00', true]);
});

test('Cacciatore e consulente: "offerte entro" dal termine, anche con i dati vecchi del Demanio', async () => {
  const x = { asta: VECCHIA, segnaliAffare: [], pericoli: [], nonSappiamo: [] };
  assert.equal(Cacciatore.riassunto(x).scadenza.testo, 'Offerte entro il 10/11/2026 alle 16:00 (dall\'avviso)');
  assert.equal(Cacciatore.riassunto({ ...x, asta: await nuova() }).scadenza.data, '2026-11-10');
  const testo = (a) => Consulente.rispondi('spiegami l\'asta ' + a.id, { aste: [a], T, oggi: '2026-10-26', affari: null }).blocchi.filter((b) => b.tipo === 'testo').map((b) => b.testo).join(' ');
  const n = testo(await nuova());
  assert.match(n, /Asta il 11\/11\/2026; offerte entro il 10\/11\/2026 alle 16:00 \(dall'avviso\)/);
  const v = testo(VECCHIA);
  assert.match(v, /Giorno della gara indicato nel PDF dell'avviso; offerte entro il 10\/11\/2026 alle 16:00/);
  assert.doesNotMatch(v, /Asta il 10\/11/);
  // l'id del Demanio ha un punto ("n.-25"): prima il consulente non lo riconosceva e cercava "beni mobili"
  assert.equal(Consulente.rispondi('spiegami l\'asta ' + VECCHIA.id + '.', { aste: [VECCHIA], T, oggi: '2026-10-26', affari: null }).intento, 'spiega');
});

test('pagine: le date del Demanio si leggono tutte con Formato.date (scheda, mappa, confronto, le mie aste, consulente, card)', async () => {
  // provate nel browser il 26/10/2026 con i dati del nuovo lettore e con quelli vecchi; qui si controlla che nessuna pagina
  // torni a trattare la dataAsta del Demanio come termine per le offerte solo guardando la fonte
  for (const f of ['js/pages/scheda.js', 'js/pages/mappa.js', 'js/pages/confronta.js', 'js/pages/mie-aste.js', 'js/pages/consulente.js', 'js/schede.js']) {
    const t = await readFile(new URL('../' + f, import.meta.url), 'utf8');
    assert.match(t, /Formato\.date\(/, f);
    assert.doesNotMatch(t, /fonte === (?:DEMANIO|'Agenzia del Demanio'\)?) \? 'Termine offerte'/, f);
    assert.doesNotMatch(t, /dem \? 'Offerte entro '/, f);
  }
});
