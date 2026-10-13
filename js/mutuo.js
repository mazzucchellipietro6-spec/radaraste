/* Simulatore del mutuo: rata (ammortamento alla francese), budget massimo sostenibile e anticipo.
 * Regola prudente usata dalle banche: la rata non supera circa un terzo del reddito netto mensile,
 * tolte le altre rate già in corso. Tasso e durata li sceglie l'utente: il sito non inventa tassi. */
(function (root) {
  'use strict';
  var IPOTESI = { quotaReddito: 1 / 3, ltvMassimo: 0.8 }; // la banca finanzia di solito fino all'80% del valore

  function num(x) { var n = Number(x); return isFinite(n) ? n : 0; }

  // rata mensile per un capitale, tasso annuo nominale (0.035 = 3,5%) e durata in anni
  function rata(capitale, tassoAnnuo, anni) {
    var C = num(capitale), n = Math.round(num(anni) * 12), i = num(tassoAnnuo) / 12;
    if (C <= 0 || n <= 0) return 0;
    if (i === 0) return C / n;
    return C * i / (1 - Math.pow(1 + i, -n));
  }

  // capitale massimo finanziabile con una certa rata
  function capitale(rataMax, tassoAnnuo, anni) {
    var R = num(rataMax), n = Math.round(num(anni) * 12), i = num(tassoAnnuo) / 12;
    if (R <= 0 || n <= 0) return 0;
    if (i === 0) return R * n;
    return R * (1 - Math.pow(1 + i, -n)) / i;
  }

  /* input: { stipendio (netto mensile), altreRate, risparmi, tasso, anni, quotaReddito?, speseAcquisto? (frazione del prezzo, es. 0.1) }
   * → rata massima, mutuo massimo, prezzo massimo (con risparmi come anticipo + spese), anticipo necessario */
  function budget(input) {
    var q = input.quotaReddito == null ? IPOTESI.quotaReddito : num(input.quotaReddito);
    var rataMax = Math.max(0, num(input.stipendio) * q - num(input.altreRate));
    var mutuoMax = capitale(rataMax, input.tasso, input.anni);
    var spese = num(input.speseAcquisto); // imposte e spese in % del prezzo, pagate con i risparmi
    var risparmi = num(input.risparmi);
    // prezzo P tale che: mutuo = P − anticipo, anticipo + spese·P = risparmi, mutuo ≤ LTV·P e ≤ mutuoMax
    var perRisparmi = (risparmi + mutuoMax) / (1 + spese);
    var perLtv = (1 - IPOTESI.ltvMassimo) + spese > 0 ? risparmi / ((1 - IPOTESI.ltvMassimo) + spese) : Infinity;
    var prezzoEsatto = Math.max(0, Math.min(perRisparmi, perLtv));
    var prezzo = Math.floor(prezzoEsatto / 100) * 100; // arrotondato per difetto alle centinaia
    var mutuo = Math.max(0, Math.min(mutuoMax, prezzo * IPOTESI.ltvMassimo, prezzo * (1 + spese) - risparmi));
    return {
      rataMax: Math.round(rataMax), mutuoMax: Math.round(mutuoMax), prezzoMax: prezzo,
      mutuo: Math.round(mutuo), anticipo: Math.round(Math.max(0, prezzo - mutuo)), spese: Math.round(spese * prezzo),
      rata: Math.round(rata(mutuo, input.tasso, input.anni)), limitatoDa: perLtv < perRisparmi ? 'anticipo (la banca finanzia al massimo l\'80%)' : 'rata (un terzo del reddito)'
    };
  }

  /* Posso permettermi questa asta? costoTotale = prezzo + imposte e spese (già calcolato dal sito).
   * Con l'asta il saldo va pagato entro il termine dell'avviso (di solito 120 giorni): serve il mutuo già deliberato. */
  function sostenibile(costoTotale, prezzo, input) {
    var b = budget(input), C = num(costoTotale), P = num(prezzo) || C;
    var mutuoServe = Math.max(0, C - num(input.risparmi));
    var mutuoOk = Math.min(b.mutuoMax, P * IPOTESI.ltvMassimo);
    var r = rata(mutuoServe, input.tasso, input.anni);
    return { ok: mutuoServe <= mutuoOk + 1, mutuo: Math.round(mutuoServe), rata: Math.round(r), rataMax: b.rataMax,
      mancano: Math.max(0, Math.round(mutuoServe - mutuoOk)) };
  }

  var Mutuo = { IPOTESI: IPOTESI, rata: rata, capitale: capitale, budget: budget, sostenibile: sostenibile };
  if (typeof module !== 'undefined' && module.exports) module.exports = Mutuo;
  else root.Mutuo = Mutuo;
})(typeof window !== 'undefined' ? window : globalThis);
