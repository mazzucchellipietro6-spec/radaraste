/* Pagina "Strumenti": le schede degli strumenti (elenco unico in js/ui.js). */
(function () {
  'use strict';
  var U = window.UI;
  var COSA = {
    'calcolatore.html': 'Inserisci prezzo, valore e regime fiscale: costo totale, sconto reale e offerta massima.',
    'mutuo.html': 'Rata, mutuo massimo e prezzo che puoi permetterti con stipendio, risparmi, tasso e durata scelti da te.',
    'confronta.html': 'Metti fianco a fianco fino a tre aste: prezzi, costi, sconto, rischi e date.',
    'guida.html': 'Come si fa un\'offerta telematica, la cauzione, la gara, il saldo e il decreto di trasferimento.',
    'tariffe.html': 'Imposte di registro, ipotecaria e catastale, IVA, passaggi di proprietà: con fonte e data.',
    'fonti.html': 'Le fonti delle aste, quando sono state lette e cosa contengono.'
  };
  function avvia() {
    document.getElementById('strumenti').innerHTML = U.STRUMENTI.map(function (v) {
      return '<article class="as-card"><span class="as-icona" aria-hidden="true">' + U.icona(v.icona) + '</span>' +
        '<h2 class="as-nome"><a href="' + v.href + '">' + U.esc(v.nome) + '</a></h2><p class="as-nota">' + U.esc(COSA[v.href] || v.nota) + '</p></article>';
    }).join('');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia); else avvia();
})();
