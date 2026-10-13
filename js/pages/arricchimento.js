/* Pagina "Agente di arricchimento": numeri di oggi da data/riepilogo.js (campo "agenti", scritto da scripts/lib/derivati.mjs). */
(function () {
  'use strict';
  var U = window.UI, $ = U.$;
  var FONTI = { omi: 'Quotazioni OMI della zona dell\'immobile', perizia: 'Stima del perito indicata nell\'avviso', 'omi-comune': 'Quotazioni OMI tipiche del comune', 'primo-prezzo': 'Prezzo della prima asta (di norma = stima del perito)', 'prima-asta': 'Prezzo base della prima asta' };
  var LIV = { alta: ['p-good', 'Alta'], media: ['p-info', 'Media'], bassa: ['p-warn', 'Bassa'] };
  function n(x) { return x == null ? '—' : Number(x).toLocaleString('it-IT'); }
  function tile(et, val, tot, nota) {
    var p = tot ? Math.round(val / tot * 1000) / 10 : null;
    return '<div class="tile"><div class="t-et">' + et + '</div><div class="t-val">' + n(val) + '</div>' +
      (p != null ? '<div class="ar-barra" aria-hidden="true"><i style="--p:' + Math.min(100, p) + '%"></i></div><div class="t-nota">' + String(p).replace('.', ',') + '% ' + nota + '</div>' : '<div class="t-nota">' + nota + '</div>') + '</div>';
  }
  function righe(tab, ogg, nomi, tot) {
    var k = Object.keys(ogg || {}).sort(function (x, y) { return ogg[y] - ogg[x]; });
    $(tab + ' tbody').innerHTML = k.length ? k.map(function (c) {
      var nome = nomi[c] ? (Array.isArray(nomi[c]) ? '<span class="pill ' + nomi[c][0] + '">' + nomi[c][1] + '</span>' : U.esc(nomi[c])) : U.esc(c);
      return '<tr><td data-label="Voce"><span class="v">' + nome + '</span></td><td class="num" data-label="Aste"><span class="v">' + n(ogg[c]) + '</span></td><td class="num" data-label="Quota"><span class="v">' + U.pct(ogg[c] / tot, 1) + '</span></td></tr>';
    }).join('') : '<tr><td colspan="3" class="muted">Non disponibile</td></tr>';
  }
  function avvia() {
    var R = window.RIEPILOGO, G = R && R.agenti;
    if (!G) { $('#arNumeri').innerHTML = '<p class="muted" style="grid-column:1/-1">I numeri di oggi non sono ancora disponibili: arrivano con la prossima raccolta.</p>'; return; }
    var a = G.arricchimento, tot = a.aste;
    $('#arSintesi').innerHTML = 'Ultima raccolta: ' + U.dataIt(String(R.aggiornato || '').slice(0, 10)) + ' alle ' + new Date(R.aggiornato).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) +
      (a.dettagliLettiOggi != null ? ' · <b>' + n(a.dettagliLettiOggi) + '</b> schede di dettaglio lette in questa raccolta' : '') + '.';
    $('#arNumeri').innerHTML =
      tile('Aste raccolte', tot, null, 'in corso, dalle fonti ufficiali') +
      tile('Con la scheda di dettaglio', a.conDettaglio, tot, 'delle aste: le altre arrivano nei prossimi giorni') +
      tile('Con tentativi precedenti', a.catene, tot, 'collegate ai tentativi precedenti dello stesso lotto') +
      tile('Con foto', a.conFoto, tot, 'con almeno una foto sul Portale') +
      tile('Con la stima del perito', a.conStima, tot, 'con la stima indicata nella scheda') +
      tile('Immobili con i metri quadri', a.conSuperficie, a.immobili, 'degli immobili') +
      tile('Immobili con l\'occupazione indicata', a.conOccupazione, a.immobili, 'libero o occupato, dall\'avviso') +
      tile('Testi controllati per i rischi', a.conRischiControllati, tot, 'delle aste; ' + n(a.conRischi) + ' con almeno un rischio');
    var V = G.valori || {}, conV = V.conValore || 0;
    righe('#arFonti', V.perFonte, FONTI, conV || 1);
    righe('#arAff', V.perAffidabilita, LIV, conV || 1);
    $('#arOmi').innerHTML = V.omi ? 'Quotazioni OMI: Agenzia delle Entrate – Osservatorio del Mercato Immobiliare, semestre ' + U.esc(V.omi.semestre) + ' (' + U.esc(V.omi.licenza || 'CC BY 4.0') + '); ' + n(V.omi.conValore) + ' immobili con una quotazione. Aste: Portale delle Vendite Pubbliche, Ministero della Giustizia.'
      : 'Quotazioni OMI non disponibili in questa raccolta. Aste: Portale delle Vendite Pubbliche, Ministero della Giustizia.';
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia); else avvia();
})();
