// Lettore dell'Agenzia del Demanio (scripts/fonti/demanio.mjs): data dell'asta dal testo dell'avviso, termine nel suo campo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { leggiScheda, giornoAsta } from '../scripts/fonti/demanio.mjs';

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

test('giorno dell\'asta: scritto in lettere o in cifre (titoli e descrizioni reali dell\'elenco), con l\'ora se c\'è', () => {
  assert.deepEqual(giornoAsta('Asta pubblica del giorno 04 marzo 2026 per la vendita di n. 2 lotti composti da bene dichiarate fuori uso.'), { data: '2026-03-04', ora: '' });
  assert.deepEqual(giornoAsta('Asta pubblica del giorno 09.06.2026 per la vendita di n. 7 lotti'), { data: '2026-06-09', ora: '' });
  assert.deepEqual(giornoAsta('si terrà il giorno 20/11/2026 alle ore 10.30 presso la sede'), { data: '2026-11-20', ora: '10:30' });
  assert.equal(giornoAsta('Quota indivisa di fabbricato residenziale situato nel'), null);
  assert.equal(giornoAsta('del giorno 31 brumaio 2026'), null);
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
