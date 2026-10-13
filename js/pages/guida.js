/* Pagina "Guida all'asta": i passi della guida (Consulente.GUIDA in js/consulente.js, le stesse risposte della chat). */
(function () {
  'use strict';
  var U = window.UI, $ = U.$;
  function avvia() {
    var G = window.Consulente && window.Consulente.GUIDA;
    if (!G || !G.length) { $('#gdPassi').innerHTML = '<p class="muted">Guida non disponibile.</p>'; return; }
    $('#gdIndice').innerHTML = G.map(function (g, i) { return '<a href="#gd-' + U.esc(g.id) + '">' + (i + 1) + '. ' + U.esc(g.titolo) + '</a>'; }).join('');
    $('#gdPassi').innerHTML = G.map(function (g, i) {
      return '<section class="gd-passo" id="gd-' + U.esc(g.id) + '" aria-labelledby="gdh-' + U.esc(g.id) + '"><h2 id="gdh-' + U.esc(g.id) + '"><span>' + String(i + 1).padStart(2, '0') + '</span>' + U.esc(g.titolo) + '</h2>' +
        '<p>' + U.esc(g.testo) + '</p>' +
        (g.fonti && g.fonti.length ? '<p class="fonte">Fonti: ' + g.fonti.map(function (f) { return U.linkSicuro(f.url) ? '<a href="' + U.esc(f.url) + '" target="_blank" rel="noopener">' + U.esc(f.nome) + '</a>' : U.esc(f.nome); }).join(' · ') + '</p>' : '') +
        '</section>';
    }).join('');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia); else avvia();
})();
