/* Icone di Radar Aste Italia: disegnate su griglia 24, tratto 1.8, angoli arrotondati.
 * Uso: UI.icona('casa') → <svg class="icona"><use href="#i-casa"/></svg> */
(function (root) {
  'use strict';
  var P = {
    oggi: '<path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/><circle cx="12" cy="12" r="4"/>',
    radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l6.5-4.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
    lista: '<rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/>',
    mappa: '<path d="M9 4l-6 2.5v13.5l6-2.5 6 2.5 6-2.5v-13.5l-6 2.5z"/><path d="M9 4v13.5M15 6.5v13.5"/>',
    stella: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
    altro: '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
    cerca: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    calcolo: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8.5 7h7M8.5 11h1M12 11h1M15.5 11h0M8.5 14.5h1M12 14.5h1M8.5 18h1M12 18h1M15.5 14.5v3.5"/>',
    confronta: '<rect x="3" y="5" width="7" height="14" rx="1.6"/><rect x="14" y="5" width="7" height="14" rx="1.6"/><path d="M10 12h4"/>',
    tasse: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9.5 16.5l5-5M10 11.5h0M14.5 16h0"/>',
    fonti: '<path d="M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    casa: '<path d="M3.5 11L12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
    auto: '<path d="M5 16.5h14M4 16.5v-3l1.6-4.4A2 2 0 017.5 7.8h9a2 2 0 011.9 1.3l1.6 4.4v3"/><circle cx="7.5" cy="17" r="1.8"/><circle cx="16.5" cy="17" r="1.8"/><path d="M4.5 13h15"/>',
    moto: '<circle cx="6" cy="16.5" r="3"/><circle cx="18" cy="16.5" r="3"/><path d="M6 16.5l4-6h4l3 6M13 7h3l2 3.5M10 10.5L8 7H6"/>',
    beni: '<path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5L12 12l8.5-4.5M12 12v9"/>',
    martello: '<path d="M13.5 4.5l6 6M11 7l6 6M14.3 3.7l-4.6 4.6M18.3 7.7l-4.6 4.6M11.5 10.5L4 18a1.4 1.4 0 002 2l7.5-7.5"/>',
    calendario: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    euro: '<path d="M17.5 6.5A7 7 0 107 17.2M17.5 17.5A7 7 0 0110 18"/><path d="M4 10.5h9M4 13.5h8"/>',
    luogo: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0113 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    chiave: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8.5-8.5M16 7l2.5 2.5M14 9l2 2"/>',
    allerta: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.5h0"/>',
    ok: '<circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.7 2.7L16 9.6"/>',
    freccia: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    indietro: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    esterno: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>',
    chiudi: '<path d="M6 6l12 12M18 6L6 18"/>',
    filtro: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    sole: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    luna: '<path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/>',
    automatico: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17" /><path d="M12 3.5a8.5 8.5 0 010 17z" fill="currentColor"/>',
    documento: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 15.5h5M10 8.5h2"/>',
    grafico: '<path d="M4 20V4M4 20h16"/><path d="M7 15l4-4 3 3 5-6"/>',
    occupato: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 018 0v2.5"/>',
    libero: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 017.6-1.7"/>',
    orologio: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    tribunale: '<path d="M3.5 9L12 4l8.5 5M5 9v9M9.5 9v9M14.5 9v9M19 9v9M3.5 20.5h17"/>',
    piu: '<path d="M12 5v14M5 12h14"/>',
    ribasso: '<path d="M4 6l6 6 4-4 6 7"/><path d="M20 10v5h-5"/>',
    scuola: '<path d="M3 9l9-4.5L21 9l-9 4.5z"/><path d="M7 11v5c3 2 7 2 10 0v-5"/>',
    treno: '<rect x="6" y="3.5" width="12" height="13" rx="3"/><path d="M6 11h12M9 20l1.5-3.5M15 20l-1.5-3.5"/><circle cx="9.5" cy="13.8" r=".6" fill="currentColor"/><circle cx="14.5" cy="13.8" r=".6" fill="currentColor"/>',
    carrello: '<path d="M3.5 4.5h2l2.2 10.5h10l2-7.5H7"/><circle cx="9.5" cy="19" r="1.4"/><circle cx="16.5" cy="19" r="1.4"/>',
    bus: '<rect x="5" y="3.5" width="14" height="14" rx="2.5"/><path d="M5 11h14M8 20v-2.5M16 20v-2.5"/>',
    onde: '<path d="M3 9c2.5-2 4.5-2 7 0s4.5 2 7 0 3-1.5 4-1M3 15c2.5-2 4.5-2 7 0s4.5 2 7 0 3-1.5 4-1"/>',
    terremoto: '<path d="M2.5 12h4l2-5 3.5 11 3-8 1.5 2h5"/>',
    banca: '<path d="M3.5 9L12 4l8.5 5H3.5zM5.5 9.5v7.5M10 9.5v7.5M14 9.5v7.5M18.5 9.5v7.5M3.5 20h17"/>',
    campana: '<path d="M6 16.5V11a6 6 0 0112 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 004 0"/>',
    scarica: '<path d="M12 4v11M7 10.5l5 5 5-5M4.5 20h15"/>',
    telegram: '<path d="M20.5 4.5L3.5 11l5.5 2 2 6 3-4 4.5 3.5z"/><path d="M9 13l7.5-5.5"/>'
  };
  var sprite = '<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">' +
    Object.keys(P).map(function (k) { return '<symbol id="i-' + k + '" viewBox="0 0 24 24">' + P[k] + '</symbol>'; }).join('') + '</svg>';
  function inietta() { if (!document.getElementById('i-radar')) document.body.insertAdjacentHTML('afterbegin', sprite); }
  if (document.body) inietta(); else document.addEventListener('DOMContentLoaded', inietta);
  root.Icone = { nomi: Object.keys(P), svg: function (n, cls) { return '<svg class="icona' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; } };
})(window);
