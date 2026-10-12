/* Home "Migliori affari di oggi": legge solo il riepilogo (data/riepilogo.js), leggero e veloce. */
(function () {
  'use strict';
  var U = window.UI, S = window.Store, $ = U.$;

  function tile(etichetta, valore, nota, tono) {
    return '<div class="tile' + (tono ? ' t-' + tono : '') + '"><div class="t-et">' + etichetta + '</div><div class="t-val">' + valore + '</div>' + (nota ? '<div class="t-nota">' + nota + '</div>' : '') + '</div>';
  }

  function schede(lista, dove, vuoto) {
    var seg = S.idSeguite();
    $(dove).innerHTML = lista.length
      ? lista.map(function (a) { a.origine = 'raccolta'; return window.Schede.card(a, { compatta: true, seguita: !!seg[a.id], confronto: true, selezionata: window.Confronto.ha(a.id) }); }).join('')
      : '<div class="panel empty" style="grid-column:1/-1">' + vuoto + '</div>';
  }

  document.addEventListener('DOMContentLoaded', function () {
    var R = window.RIEPILOGO;
    $('#dataOggi').textContent = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (!R) {
      $('#kpi').innerHTML = '';
      $('#migliori').innerHTML = '<div class="panel empty"><h2>Nessuna asta da mostrare</h2><p>La raccolta dalle fonti ufficiali non è ancora stata eseguita su questa copia del sito. Qui non compaiono mai dati di esempio. <a href="fonti.html">Stato delle fonti</a></p></div>';
      ['#nuove', '#scadenza'].forEach(function (d) { $(d).innerHTML = ''; });
      $('#linkNuove').textContent = ''; $('#linkScadenza').textContent = '';
      return;
    }
    var attive = R.fonti.filter(function (f) { return f.stato === 'attiva'; }).map(function (f) { return f.nome; });
    $('#aggiornamento').innerHTML = 'Aggiornato ' + U.dataIt(R.aggiornato.slice(0, 10)) + ' alle ' + new Date(R.aggiornato).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) +
      ' da ' + U.esc(attive.join(', ') || 'nessuna fonte') + ' · <a href="fonti.html">fonti</a>';
    var cat = R.perCategoria || {};
    $('#kpi').innerHTML =
      tile('Aste attive', R.attive.toLocaleString('it-IT'), [['immobile', 'immobili'], ['auto', 'auto'], ['moto', 'moto'], ['beni', 'beni']].filter(function (c) { return cat[c[0]]; }).map(function (c) { return cat[c[0]].toLocaleString('it-IT') + ' ' + c[1]; }).join(' · ')) +
      tile('Nuove nelle ultime 24 ore', R.nuove.totale.toLocaleString('it-IT'), 'pubblicate dal ' + U.dataIt(R.nuove.dal), R.nuove.totale ? 'good' : '') +
      (R.sconto ? tile('Sconto medio sul valore stimato', U.pct(R.sconto.medio, 0), 'su ' + R.sconto.campione.toLocaleString('it-IT') + ' aste con stima affidabile', 'good')
        : tile('Sconto medio', '—', 'serve la stima del valore di mercato, in attivazione'));

    if (R.migliori.lista.length) schede(R.migliori.lista, '#migliori', '');
    else $('#migliori').innerHTML = '<div class="panel empty"><p style="margin:0">La classifica usa il <b>punteggio affare</b>, che richiede la stima automatica del valore di mercato. Finché la stima non è attiva non mostriamo una classifica: sarebbe inventata.</p><p class="note" style="margin:8px auto 0">Nel frattempo trovi qui sotto le aste nuove e quelle in scadenza.</p></div>';
    if (R.migliori.lista.length) $('#migliori').className = 'cards';

    schede(R.nuove.lista, '#nuove', 'Nessuna asta nuova nelle ultime 24 ore.');
    $('#linkNuove').textContent = R.nuove.totale > R.nuove.lista.length ? 'Tutte le ' + R.nuove.totale.toLocaleString('it-IT') + ' →' : '';
    schede(R.inScadenza.lista, '#scadenza', 'Nessuna asta nei prossimi 7 giorni.');
    $('#linkScadenza').textContent = R.inScadenza.totale > R.inScadenza.lista.length ? 'Tutte le ' + R.inScadenza.totale.toLocaleString('it-IT') + ' →' : '';

    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-segui]'); if (!b) return;
      var id = b.dataset.segui;
      var tutte = R.migliori.lista.concat(R.nuove.lista, R.inScadenza.lista), a = tutte.filter(function (x) { return x.id === id; })[0];
      if (S.seguita(id)) { S.smetti(id); b.textContent = 'Segui'; b.setAttribute('aria-pressed', 'false'); U.toast('Rimossa da "Le mie aste"'); }
      else { S.segui(id, a ? { copia: a } : null); b.textContent = 'Seguita ✓'; b.setAttribute('aria-pressed', 'true'); U.toast('Aggiunta a "Le mie aste"'); }
    });
  });
})();
