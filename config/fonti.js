/*
 * RADAR ASTE ITALIA — REGISTRO DELLE FONTI
 * ------------------------------------------------------------------
 * Esito della verifica manuale di robots.txt e termini d'uso di ogni fonte.
 * Lo usano sia il sito (pagina "Fonti") sia il programma di raccolta
 * (scripts/raccogli.mjs), che attiva solo le fonti con stato "attiva".
 *
 * stato: "attiva"        → raccolta consentita e attivata
 *        "non-attivata"  → lettura consentita ma non attivata (motivo indicato)
 *        "vietata"       → i termini d'uso o robots.txt vietano la raccolta
 *        "errore"        → sito non raggiungibile al momento della verifica
 */
(function (root) {
  'use strict';
  var VERIFICA = '2026-10-11';

  var FONTI = [
    {
      chiave: 'pvp', nome: 'Portale Vendite Pubbliche', url: 'https://pvp.giustizia.it/pvp/', stato: 'attiva', verificato: VERIFICA,
      metodo: 'Servizio JSON pubblico usato dal portale stesso per la ricerca (POST /ric-ms/ricerca/vendite), una richiesta ogni 2,5 secondi.',
      motivo: 'robots.txt assente (HTTP 404), quindi nessuna restrizione dichiarata. Portale pubblico del Ministero della Giustizia: i dati pubblicati da una pubblica amministrazione senza licenza esplicita sono riutilizzabili (art. 52 del Codice dell\'amministrazione digitale). Contiene per legge tutte le vendite giudiziarie, comprese quelle di veicoli e beni mobili gestite dagli IVG.'
    },
    {
      chiave: 'demanio', nome: 'Agenzia del Demanio', url: 'https://www.agenziademanio.it/it/gare-aste/', stato: 'attiva', verificato: VERIFICA,
      metodo: 'Pagine pubbliche "Gare e aste" (elenco e scheda di ogni vendita in corso), una richiesta ogni 3 secondi.',
      motivo: 'robots.txt assente (HTTP 404); le note legali non pongono limiti al riuso. Ente pubblico: dati riutilizzabili (art. 52 CAD). Il prezzo base è indicato solo nel PDF dell\'avviso, che viene linkato.'
    },
    {
      chiave: 'astegiudiziarie', nome: 'Aste Giudiziarie Inlinea', url: 'https://www.astegiudiziarie.it/', stato: 'vietata', verificato: VERIFICA,
      termini: 'https://www.astegiudiziarie.it/condizioni-generali',
      motivo: 'Le condizioni generali (artt. 5 e 6) dichiarano l\'archivio "banca dati proprietaria" tutelata dagli artt. 102-bis e seguenti della legge sul diritto d\'autore e avvertono che estrazione e riutilizzo possono costituire violazione e concorrenza sleale. Raccolta non effettuata. Le vendite giudiziarie che pubblica sono comunque presenti sul Portale Vendite Pubbliche.'
    },
    {
      chiave: 'astalegale', nome: 'Astalegale', url: 'https://www.astalegale.net/', stato: 'non-attivata', verificato: VERIFICA,
      motivo: 'robots.txt consente la lettura degli annunci e non sono stati trovati termini d\'uso che la vietino. Non attivata perché pubblica le stesse vendite giudiziarie del Portale Vendite Pubbliche (si creerebbero doppioni) e perché la banca dati di un privato è comunque tutelata dagli artt. 102-bis e seguenti L.d.A.'
    },
    {
      chiave: 'fallco', nome: 'Fallco Aste', url: 'https://www.fallcoaste.it/', stato: 'non-attivata', verificato: VERIFICA,
      termini: 'https://www.fallcoaste.it/informazioni/condizioni-partecipazione-fallcoaste.html',
      motivo: 'robots.txt consente la lettura (vieta solo /admin/) e le condizioni generali riguardano la partecipazione alle vendite, senza divieti di consultazione. Non attivata per lo stesso motivo di Astalegale: vendite già presenti sul PVP e banca dati privata tutelata.'
    },
    {
      chiave: 'ivg', nome: 'IVG – Istituti Vendite Giudiziarie', url: 'https://www.ivgitalia.it/', stato: 'errore', verificato: VERIFICA,
      motivo: 'Il sito www.ivgitalia.it non risponde (errore 502 del server): non è stato possibile leggere robots.txt e termini. Le vendite giudiziarie di beni mobili gestite dagli IVG devono comunque essere pubblicate sul Portale Vendite Pubbliche e compaiono tramite il PVP.'
    }
  ];

  if (typeof module !== 'undefined' && module.exports) module.exports = FONTI;
  else root.FONTI = FONTI;
})(typeof window !== 'undefined' ? window : globalThis);
