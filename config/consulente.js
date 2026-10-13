/* Consulente d'asta: collegamento a un servizio di intelligenza artificiale. SPENTO.
 *
 * Oggi il consulente risponde solo con le regole di js/consulente.js (ricerca, filtri e calcoli del sito): è gratuito
 * e non manda dati a nessuno. Per attivare la modalità AI serve un servizio a pagamento: costi e confronto in
 * CONSULENTE.md. Il collegamento è già pronto in functions/api/consulente.js (funzione di Cloudflare Pages che
 * tiene la chiave nelle variabili d'ambiente, MAI nel codice): basta pubblicarla e scrivere qui il suo indirizzo.
 *
 *   ponte: indirizzo della funzione, es. '/api/consulente' (null = modalità AI non disponibile)
 *   modello: nome mostrato nella pagina (solo informativo)
 *   maxTurni: quante chiamate al servizio per una domanda, al massimo (limita la spesa) */
(function (root) {
  'use strict';
  var CONSULENTE_CONFIG = { ponte: null, modello: null, maxTurni: 5 };
  if (typeof module !== 'undefined' && module.exports) module.exports = CONSULENTE_CONFIG;
  else root.CONSULENTE_CONFIG = CONSULENTE_CONFIG;
})(typeof window !== 'undefined' ? window : globalThis);
