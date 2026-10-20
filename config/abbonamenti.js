/*
 * RADAR ASTE ITALIA — ABBONAMENTI (MODALITÀ TEST, SPENTI)
 * ------------------------------------------------------------------
 * Piani, prezzi, funzioni a pagamento e collegamenti agli account. Finché "attivi" è false il sito funziona
 * esattamente come senza abbonamenti: nessuna funzione è bloccata e nessuno vede prezzi o pulsanti di pagamento.
 *
 * PREZZI: sono una PROPOSTA da approvare (euro, IVA inclusa), non ancora decisi dal proprietario.
 *
 * Anteprima per il proprietario: aggiungi ?anteprima=abbonamenti all'indirizzo di una pagina (resta attiva finché
 * la scheda del browser è aperta; ?anteprima=no la spegne). Si vedono blocchi e prezzi con l'avviso
 * "modalità test: nessun pagamento reale".
 *
 * Per attivarli davvero servono, in quest'ordine: progetto Supabase (supabase/schema.sql), prodotti e prezzi su
 * Stripe in modalità test, variabili d'ambiente su Cloudflare Pages (STRIPE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY…),
 * le due chiavi PUBBLICHE qui sotto e infine attivi: true.
 *
 * QUI SOLO CHIAVI PUBBLICHE PER NATURA (la chiave anonima di Supabase e la chiave pubblicabile di Stripe, che
 * finiscono comunque nel browser). Le chiavi segrete stanno SOLO nelle variabili d'ambiente di Cloudflare.
 *
 *   funzioni     → funzione a pagamento: piano minimo che la sblocca
 *   limitiGratis → quante voci vede chi usa il piano Gratis (gli altri piani non hanno limiti)
 */
(function (root) {
  'use strict';

  var LIMITI = { affari: 3, combinazioni: 3, seguite: 10 };
  var PROVA = { giorni: 14, piano: 'pro' };

  var ABBONAMENTI = {
    attivi: false,
    modalita: 'test',
    valuta: 'EUR',
    ivaInclusa: true,
    prova: PROVA,

    // "(in arrivo)" segna ciò che il sito non fa ancora: va tolto solo quando la funzione esiste davvero.
    // Il report PDF esiste già ("Stampa o salva in PDF" nella scheda dell'asta): è una funzione del piano Base.
    piani: [
      {
        id: 'gratis',
        nome: 'Gratis',
        prezzi: { mensile: 0, annuale: 0 },
        sottotitolo: 'Per cercare le aste e fare i conti',
        vantaggi: [
          'Le aste pubbliche raccolte ogni giorno dalle fonti ufficiali: elenco con filtri, mappa e scheda di ogni asta',
          'Calcolatore "Conviene?" con imposte e spese, simulatore del mutuo e confronto fino a 3 aste',
          'Guida all\'asta passo per passo e tariffe con fonte e data',
          'Consulente d\'asta con le regole del sito, senza intelligenza artificiale',
          'I primi ' + LIMITI.affari + ' affari di oggi scelti dal Cacciatore',
          'Le prime ' + LIMITI.combinazioni + ' combinazioni d\'oro',
          'Fino a ' + LIMITI.seguite + ' aste seguite, con note e promemoria in calendario'
        ]
      },
      {
        id: 'base',
        nome: 'Base',
        prezzi: { mensile: 9, annuale: 90 },
        sottotitolo: 'Per chi segue le aste con costanza',
        vantaggi: [
          'Tutto quello che c\'è nel piano Gratis',
          'Tutti gli affari di oggi scelti dal Cacciatore, ogni mattina',
          'La selezione personale degli affari per zona, budget, categoria e strategia',
          'Tutte le combinazioni d\'oro, con il risparmio fiscale "prima casa" calcolato',
          'Aste seguite senza limite',
          'Report PDF di ogni asta da salvare o stampare, con valore, costi, rischi e fonti',
          'Avvisi sulle nuove aste che ti interessano (in arrivo)'
        ]
      },
      {
        id: 'pro',
        nome: 'Pro',
        prezzi: { mensile: 24, annuale: 240 },
        sottotitolo: 'Per chi investe con un piano',
        consigliato: true,
        vantaggi: [
          'Tutto quello che c\'è nel piano Base',
          'Stratega d\'asta: su quali aste puntare con il tuo capitale, quanto offrire e quando, con migliaia di scenari simulati sugli esiti reali delle vendite passate',
          'Consulente d\'asta con intelligenza artificiale (in arrivo)',
          'Statistiche avanzate sulle aste (in arrivo)',
          PROVA.giorni + ' giorni di prova gratuita al primo abbonamento'
        ]
      }
    ],

    funzioni: {
      'affari-tutti': 'base',
      'selezione-personale': 'base',
      'combinazioni-tutte': 'base',
      'seguite-illimitate': 'base',
      'report-pdf': 'base',
      'avvisi': 'base',
      'stratega': 'pro',
      'consulente-ai': 'pro',
      'statistiche-avanzate': 'pro'
    },

    nomiFunzioni: {
      'affari-tutti': 'Tutti gli affari di oggi',
      'selezione-personale': 'Selezione personale degli affari',
      'combinazioni-tutte': 'Tutte le combinazioni d\'oro',
      'seguite-illimitate': 'Aste seguite senza limite',
      'report-pdf': 'Report PDF delle aste',
      'avvisi': 'Avvisi sulle nuove aste',
      'stratega': 'Stratega d\'asta',
      'consulente-ai': 'Consulente con intelligenza artificiale',
      'statistiche-avanzate': 'Statistiche avanzate'
    },

    limitiGratis: LIMITI,

    // pubbliche per natura, ma restano null finché il proprietario non le inserisce
    supabase: { url: null, chiaveAnonima: null },
    stripe: { chiavePubblicabile: null },

    // funzioni di Cloudflare Pages (cartella functions/)
    api: { checkout: '/api/stripe/checkout', portale: '/api/stripe/portale', cancellaAccount: '/api/account/cancella' }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = ABBONAMENTI;
  else root.ABBONAMENTI = ABBONAMENTI;
})(typeof window !== 'undefined' ? window : globalThis);
