/* Pagina "Assistenti": le cinque schede con lo stato di oggi (js/agenti.js). */
(function () {
  'use strict';
  function avvia() { document.getElementById('assistenti').innerHTML = window.Agenti.schede({ titoloTag: 'h3' }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia); else avvia();
})();
