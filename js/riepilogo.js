/* Riepilogo per la home: numeri e piccole liste calcolati sulle aste raccolte.
 * La raccolta lo scrive in data/riepilogo.js, così la home si apre subito senza caricare tutte le aste. */
(function (root) {
  'use strict';
  var CAMPI = ['id', 'titolo', 'categoria', 'tipo', 'comune', 'provincia', 'tribunale', 'fonte', 'prezzoBase', 'offertaMinima', 'dataAsta', 'ora', 'stato',
    'linkAvviso', 'pubblicata', 'vista', 'punteggio', 'sconto', 'stima'];

  function compatta(a) { var o = {}; CAMPI.forEach(function (c) { if (a[c] !== undefined && a[c] !== null && a[c] !== '') o[c] = a[c]; }); return o; }
  function piu(data, giorni) { var d = new Date(data + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + giorni); return d.toISOString().slice(0, 10); }

  // aste: elenco completo (già senza doppioni); oggi: 'AAAA-MM-GG'
  function calcola(aste, oggi, opz) {
    opz = opz || {};
    var attive = aste.filter(function (a) { return a.dataAsta && a.dataAsta >= oggi; });
    var ieri = piu(oggi, -1), fra7 = piu(oggi, 7);
    var nuove = attive.filter(function (a) { return (a.pubblicata && a.pubblicata >= ieri) || a.vista === oggi && !a.pubblicata; })
      .sort(function (x, y) { return (y.pubblicata || y.vista || '').localeCompare(x.pubblicata || x.vista || '') || (y.punteggio || 0) - (x.punteggio || 0); });
    var scadenza = attive.filter(function (a) { return a.dataAsta <= fra7; })
      .sort(function (x, y) { return x.dataAsta.localeCompare(y.dataAsta) || (x.ora || '').localeCompare(y.ora || ''); });
    var conPunteggio = attive.filter(function (a) { return a.punteggio != null && a.punteggioCompleto; })
      .sort(function (x, y) { return y.punteggio - x.punteggio; });
    var sconti = attive.filter(function (a) { return a.sconto != null && isFinite(a.sconto); }).map(function (a) { return a.sconto; });
    var perCategoria = {};
    attive.forEach(function (a) { perCategoria[a.categoria] = (perCategoria[a.categoria] || 0) + 1; });
    return {
      oggi: oggi,
      attive: attive.length,
      perCategoria: perCategoria,
      nuove: { totale: nuove.length, dal: ieri, lista: nuove.slice(0, opz.quanteNuove || 12).map(compatta) },
      inScadenza: { totale: scadenza.length, al: fra7, lista: scadenza.slice(0, opz.quanteScadenza || 12).map(compatta) },
      migliori: { totale: conPunteggio.length, lista: conPunteggio.slice(0, 10).map(compatta) },
      sconto: sconti.length ? { medio: sconti.reduce(function (s, x) { return s + x; }, 0) / sconti.length, campione: sconti.length } : null
    };
  }

  var Riepilogo = { calcola: calcola, compatta: compatta, piu: piu };
  if (typeof module !== 'undefined' && module.exports) module.exports = Riepilogo;
  else root.Riepilogo = Riepilogo;
})(typeof window !== 'undefined' ? window : globalThis);
