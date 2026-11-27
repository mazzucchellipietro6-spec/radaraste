/* Pagina "Lettore della perizia": la perizia scelta o trascinata si legge nel browser (js/lettore-perizia.js) e
 * js/perizia.js elenca i punti critici con la frase e la pagina. Nessun file lascia il computer. */
(function () {
  'use strict';
  var U = window.UI, $ = U.$;
  document.addEventListener('DOMContentLoaded', function () {
    var L = window.LettorePerizia, P = window.Perizia;
    if (!L || !P) { $('#lettore').innerHTML = '<p class="callout warn">Il lettore della perizia non si è caricato. Ricarica la pagina.</p>'; return; }
    $('#lettore').innerHTML = L.blocco({});
    L.collega($('#lettore [data-lp]'), {});
    $('#temi').innerHTML = P.TEMI.map(function (t) {
      return '<li><b>' + U.esc(t.titolo) + '</b><span>' + U.esc(t.spiegazione) + '</span></li>';
    }).join('');
  });
})();
