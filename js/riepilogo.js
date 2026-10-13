/* Riepilogo per la home e per la mappa: numeri e piccole liste calcolati sulle aste raccolte.
 * La raccolta lo scrive in data/riepilogo.js, così la home si apre subito senza caricare tutte le aste.
 *
 *   attive, perCategoria, valoreTotale (somma dei prezzi base delle aste attive)
 *   nuove, inScadenza, migliori, ribassi: { totale, lista } con le aste in forma compatta (CAMPI)
 *   sconto: { medio, campione } solo sulle aste con valore ad affidabilità media o alta
 *   perRegione: { regione: { n, scontoMedio, campione, migliore: { id, titolo, punteggio } } } */
(function (root) {
  'use strict';
  var CAMPI = ['id', 'titolo', 'categoria', 'tipo', 'regione', 'comune', 'provincia', 'tribunale', 'fonte', 'prezzoBase', 'offertaMinima', 'dataAsta', 'ora', 'stato',
    'linkAvviso', 'pubblicata', 'vista', 'lat', 'lng', 'superficieMq', 'tentativo', 'rischi', 'nFoto', 'stima', 'valore', 'valoreMin', 'valoreMax', 'fonteValore',
    'affidabilita', 'sconto', 'costoTotale', 'offertaMax', 'punteggio', 'punteggioCompleto', 'prezzoPrecedente', 'dataRibasso', 'ribasso', 'termineOfferte'];

  function compatta(a) {
    var o = {};
    CAMPI.forEach(function (c) { var v = a[c]; if (v !== undefined && v !== null && v !== '') o[c] = Array.isArray(v) ? v.slice() : v; });
    return o;
  }
  function piu(data, giorni) { var d = new Date(data + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + giorni); return d.toISOString().slice(0, 10); }
  function affidabile(a) { return a.sconto != null && isFinite(a.sconto) && (a.affidabilita === 'media' || a.affidabilita === 'alta'); }
  function media(v) { return v.length ? v.reduce(function (s, x) { return s + x; }, 0) / v.length : null; }
  function tonda(x) { return x == null ? null : Math.round(x * 1000) / 1000; }
  // migliori: punteggio più alto, poi sconto più alto, poi data d'asta più vicina
  function perPunteggio(x, y) { return y.punteggio - x.punteggio || (y.sconto || 0) - (x.sconto || 0) || (x.dataAsta || '').localeCompare(y.dataAsta || ''); }

  // aste: elenco completo (già senza doppioni); oggi: 'AAAA-MM-GG'
  function calcola(aste, oggi, opz) {
    opz = opz || {};
    var attive = aste.filter(function (a) { return a.dataAsta && a.dataAsta >= oggi; });
    var ieri = piu(oggi, -1), fra7 = piu(oggi, 7), due = piu(oggi, -2);
    var nuove = attive.filter(function (a) { return (a.pubblicata && a.pubblicata >= ieri) || a.vista === oggi && !a.pubblicata; })
      .sort(function (x, y) { return (y.pubblicata || y.vista || '').localeCompare(x.pubblicata || x.vista || '') || (y.punteggio || 0) - (x.punteggio || 0); });
    var scadenza = attive.filter(function (a) { return a.dataAsta <= fra7; })
      .sort(function (x, y) { return x.dataAsta.localeCompare(y.dataAsta) || (x.ora || '').localeCompare(y.ora || ''); });
    var migliori = attive.filter(function (a) { return a.punteggio != null && a.punteggioCompleto; }).sort(perPunteggio);
    // ribassi recenti: prezzo base sceso da un giorno all'altro, o nuovo tentativo (2° o successivo) pubblicato da poco
    var ribassi = attive.filter(function (a) {
      return (a.dataRibasso && a.dataRibasso >= due) || (a.tentativo >= 2 && a.pubblicata && a.pubblicata >= due);
    }).sort(function (x, y) {
      var sx = x.sconto != null ? x.sconto : -Infinity, sy = y.sconto != null ? y.sconto : -Infinity;
      return sy - sx || (y.ribasso || 0) - (x.ribasso || 0) || (x.dataAsta || '').localeCompare(y.dataAsta || '');
    });
    var sconti = attive.filter(affidabile).map(function (a) { return a.sconto; });
    var perCategoria = {}, perRegione = {}, valoreTotale = 0;
    attive.forEach(function (a) {
      perCategoria[a.categoria] = (perCategoria[a.categoria] || 0) + 1;
      if (a.prezzoBase > 0) valoreTotale += a.prezzoBase;
      if (!a.regione) return;
      var r = perRegione[a.regione] || (perRegione[a.regione] = { n: 0, sconti: [], migliore: null });
      r.n++;
      if (affidabile(a)) r.sconti.push(a.sconto);
      if (a.punteggio != null && a.punteggioCompleto && (!r.migliore || perPunteggio(a, r.migliore) < 0)) r.migliore = a;
    });
    Object.keys(perRegione).forEach(function (k) {
      var r = perRegione[k];
      perRegione[k] = { n: r.n, scontoMedio: tonda(media(r.sconti)), campione: r.sconti.length,
        migliore: r.migliore ? { id: r.migliore.id, titolo: r.migliore.titolo, punteggio: r.migliore.punteggio } : null };
    });
    return {
      oggi: oggi,
      attive: attive.length,
      perCategoria: perCategoria,
      valoreTotale: Math.round(valoreTotale),
      nuove: { totale: nuove.length, dal: ieri, lista: nuove.slice(0, opz.quanteNuove || 12).map(compatta) },
      inScadenza: { totale: scadenza.length, al: fra7, lista: scadenza.slice(0, opz.quanteScadenza || 12).map(compatta) },
      migliori: { totale: migliori.length, lista: migliori.slice(0, opz.quanteMigliori || 10).map(compatta) },
      ribassi: { totale: ribassi.length, dal: due, lista: ribassi.slice(0, opz.quantiRibassi || 12).map(compatta) },
      sconto: sconti.length ? { medio: tonda(media(sconti)), campione: sconti.length } : null,
      perRegione: perRegione
    };
  }

  var Riepilogo = { CAMPI: CAMPI, calcola: calcola, compatta: compatta, piu: piu };
  if (typeof module !== 'undefined' && module.exports) module.exports = Riepilogo;
  else root.Riepilogo = Riepilogo;
})(typeof window !== 'undefined' ? window : globalThis);
