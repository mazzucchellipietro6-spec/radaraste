/* Stato di oggi dei cinque assistenti, per la home e la pagina "Assistenti".
 * Legge solo i file prodotti dalla raccolta del mattino: data/riepilogo.js (window.RIEPILOGO, campo "agenti"),
 * data/affari.js (window.AFFARI), data/combinazioni.js (window.COMBINAZIONI). Se un file manca lo dice. */
(function (root) {
  'use strict';
  var U = root.UI;

  function n(x) { return Number(x || 0).toLocaleString('it-IT'); }
  function voce(href) { return (U.ASSISTENTI || []).filter(function (v) { return v.href === href; })[0] || { href: href, nome: href, nota: '', icona: 'assistenti' }; }
  function affidabili() {
    var v = root.RIEPILOGO && root.RIEPILOGO.agenti && root.RIEPILOGO.agenti.valori;
    if (!v || !v.perAffidabilita) return null;
    return (v.perAffidabilita.alta || 0) + (v.perAffidabilita.media || 0);
  }

  // [numero in evidenza, testo che lo spiega] per ogni assistente; null se il dato non c'è ancora
  var STATO = {
    'affari.html': function () {
      var A = root.AFFARI;
      if (!A) return null;
      return [n((A.migliori || []).length), (A.migliori || []).length === 1 ? 'affare scelto oggi su ' + n(A.analizzate) + ' aste nuove o ribassate' : 'affari scelti oggi su ' + n(A.analizzate) + ' aste nuove o ribassate'];
    },
    'consulente.html': function () {
      var R = root.RIEPILOGO;
      if (!R) return null;
      return [n(R.attive), 'aste in corso su cui risponde, con ricerca, filtri e calcoli del sito'];
    },
    'stratega.html': function () {
      var k = affidabili();
      if (k == null) return null;
      return [n(k), 'aste con un valore di mercato affidabile tra cui costruire il tuo piano'];
    },
    'combinazioni.html': function () {
      var C = root.COMBINAZIONI;
      if (!C) return null;
      return [n(C.trovate), 'combinazioni trovate tra ' + n(C.gruppiAnalizzati) + ' procedure con più lotti'];
    },
    'arricchimento.html': function () {
      var a = root.RIEPILOGO && root.RIEPILOGO.agenti && root.RIEPILOGO.agenti.arricchimento;
      if (!a) return null;
      return [n(a.conDettaglio), 'schede con i dettagli dell\'avviso, ' + n(a.conStorico) + ' con lo storico dei tentativi'];
    }
  };

  function stato(href) {
    var f = STATO[href];
    try { return f ? f() : null; } catch (e) { return null; }
  }

  /* Schede degli assistenti. opz: { compatte (bool), titoloTag ('h2'|'h3') } */
  function schede(opz) {
    opz = opz || {};
    var tag = opz.titoloTag || 'h3';
    return (U.ASSISTENTI || []).map(function (v) {
      var s = stato(v.href);
      return '<article class="as-card">' +
        '<span class="as-icona" aria-hidden="true">' + U.icona(v.icona) + '</span>' +
        '<' + tag + ' class="as-nome"><a href="' + v.href + '">' + U.esc(v.nome) + '</a></' + tag + '>' +
        '<p class="as-nota">' + U.esc(v.nota) + '</p>' +
        '<p class="as-stato">' + (s ? '<b>' + s[0] + '</b> ' + U.esc(s[1]) : '<span class="muted">Dati di oggi non ancora disponibili</span>') + '</p>' +
        '</article>';
    }).join('');
  }

  root.Agenti = { stato: stato, schede: schede, voce: voce };
})(window);
