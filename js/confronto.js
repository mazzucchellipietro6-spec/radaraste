/* Aste scelte per il confronto (massimo 3), con la barra "Confronta" in fondo allo schermo. */
(function (root) {
  'use strict';
  var K = 'radaraste.confronto', MAX = 3;
  function leggi() { try { return JSON.parse(localStorage.getItem(K) || '[]'); } catch (e) { return []; } }
  function scrivi(l) { try { localStorage.setItem(K, JSON.stringify(l)); } catch (e) {} barra(); }

  function barra() {
    var l = leggi(), b = document.getElementById('barraConfronto');
    // la pagina lascia spazio in fondo alla barra, così non copre la fine del contenuto
    if (document.body) document.body.classList.toggle('con-confronto', l.length > 0);
    if (!l.length) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('div'); b.id = 'barraConfronto'; b.className = 'barra-confronto'; b.setAttribute('role', 'region'); b.setAttribute('aria-label', 'Aste da confrontare'); document.body.appendChild(b); }
    b.innerHTML = '<span><b>' + l.length + '</b> di ' + MAX + ' aste da confrontare</span><span class="spacer"></span>' +
      '<button class="btn small ghost" type="button" id="svuotaConfronto">Svuota</button>' +
      '<a class="btn small" href="confronta.html">Confronta →</a>';
    b.querySelector('#svuotaConfronto').onclick = function () {
      scrivi([]);
      Array.prototype.forEach.call(document.querySelectorAll('[data-confronta]'), function (c) { c.checked = false; });
    };
  }

  var Confronto = {
    MAX: MAX,
    ids: leggi,
    ha: function (id) { return leggi().indexOf(id) >= 0; },
    // restituisce false se la lista è piena
    cambia: function (id, scelto) {
      var l = leggi().filter(function (x) { return x !== id; });
      if (scelto) { if (l.length >= MAX) return false; l.push(id); }
      scrivi(l); return true;
    },
    togli: function (id) { scrivi(leggi().filter(function (x) { return x !== id; })); },
    barra: barra
  };

  document.addEventListener('change', function (e) {
    var c = e.target;
    if (!c.matches || !c.matches('[data-confronta]')) return;
    if (!Confronto.cambia(c.dataset.confronta, c.checked)) {
      c.checked = false;
      if (root.UI) root.UI.toast('Puoi confrontare al massimo ' + MAX + ' aste: togline una');
    }
  });
  document.addEventListener('DOMContentLoaded', barra);
  root.Confronto = Confronto;
})(window);
