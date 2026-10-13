/* Home "Migliori affari di oggi": legge solo il riepilogo (data/riepilogo.js), leggero e veloce. */
(function () {
  'use strict';
  var U = window.UI, S = window.Store, $ = U.$;
  var NON_DISPONIBILE = 'non ancora disponibile';

  // contatore che sale fino al valore (niente animazione con "riduci movimento"); il valore finale è subito leggibile dagli screen reader
  function conta(el, valore, formato) {
    var finale = formato(valore);
    el.innerHTML = '<span aria-hidden="true"></span><span class="sr-only"></span>';
    var vis = el.firstChild; el.lastChild.textContent = finale;
    if (U.menoMovimento() || !(valore > 0) || !window.requestAnimationFrame) { vis.textContent = finale; return; }
    var t0 = null, durata = 900;
    function passo(t) {
      if (t0 === null) t0 = t;
      var k = Math.min(1, (t - t0) / durata), e = 1 - Math.pow(1 - k, 3);
      vis.textContent = k < 1 ? formato(valore * e) : finale;
      if (k < 1) requestAnimationFrame(passo);
    }
    vis.textContent = formato(0);
    requestAnimationFrame(passo);
  }
  function intero(n) { return Math.round(n).toLocaleString('it-IT'); }
  function euroBreve(n) {
    try { return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(n); }
    catch (e) { return U.eur(n); }
  }
  function percento(f) { return U.pct(f, 0); }

  function tile(etichetta, nota, tono) {
    var t = document.createElement('div');
    t.className = 'tile' + (tono ? ' t-' + tono : '');
    t.innerHTML = '<div class="t-et">' + etichetta + '</div><div class="t-val"></div>' + (nota ? '<div class="t-nota">' + nota + '</div>' : '');
    return t;
  }

  function schede(lista, dove, vuoto) {
    var seg = S.idSeguite();
    $(dove).innerHTML = lista.length
      ? lista.map(function (a) { a.origine = 'raccolta'; return window.Schede.card(a, { compatta: true, seguita: !!seg[a.id], confronto: true, selezionata: window.Confronto.ha(a.id) }); }).join('')
      : '<div class="panel empty" style="grid-column:1/-1">' + vuoto + '</div>';
  }

  function kpi(R) {
    var box = $('#kpi'); box.innerHTML = '';
    var cat = R.perCategoria || {};
    var t1 = tile('Aste attive', [['immobile', 'immobili'], ['auto', 'auto'], ['moto', 'moto'], ['beni', 'beni']].filter(function (c) { return cat[c[0]]; })
      .map(function (c) { return cat[c[0]].toLocaleString('it-IT') + ' ' + c[1]; }).join(' · '));
    var t2 = tile('Nuove nelle ultime 24 ore', 'pubblicate dal ' + U.dataIt(R.nuove.dal), R.nuove.totale ? 'good' : '');
    // somma dei prezzi base delle aste attive: R.valoreTotale (js/riepilogo.js); manca nei riepiloghi generati prima di quel campo
    var tot = R.valoreTotale > 0 ? R.valoreTotale : R.prezziBase && R.prezziBase.totale > 0 ? R.prezziBase.totale : null;
    var pb = tot ? { totale: tot } : null;
    var t3 = tile('Valore totale dei prezzi base', pb ? 'somma dei prezzi base delle aste attive (dove indicato)' : NON_DISPONIBILE + ': arriva con il prossimo aggiornamento dei dati');
    var t4 = tile('Sconto medio sul valore', R.sconto ? 'su ' + R.sconto.campione.toLocaleString('it-IT') + ' aste con il valore di mercato' : NON_DISPONIBILE + ': serve il valore di mercato (stima del perito)', R.sconto ? 'good' : '');
    [t1, t2, t3, t4].forEach(function (t) { box.appendChild(t); });
    conta(t1.querySelector('.t-val'), R.attive, intero);
    conta(t2.querySelector('.t-val'), R.nuove.totale, intero);
    if (pb) conta(t3.querySelector('.t-val'), pb.totale, euroBreve); else t3.querySelector('.t-val').innerHTML = '<span aria-hidden="true">—</span><span class="sr-only">' + NON_DISPONIBILE + '</span>';
    if (R.sconto) conta(t4.querySelector('.t-val'), R.sconto.medio, percento); else t4.querySelector('.t-val').innerHTML = '<span aria-hidden="true">—</span><span class="sr-only">' + NON_DISPONIBILE + '</span>';
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
    $('#aggiornamento').innerHTML = 'Aste di immobili, auto, moto e beni mobili dalle fonti ufficiali. Aggiornato ' + U.dataIt(R.aggiornato.slice(0, 10)) + ' alle ' + new Date(R.aggiornato).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) +
      ' da ' + U.esc(attive.join(', ') || 'nessuna fonte') + ' · <a href="fonti.html">fonti</a>';
    kpi(R);

    // classifica solo con aste che hanno davvero un punteggio (calcolato dalla raccolta con js/punteggio.js)
    var migliori = (R.migliori && R.migliori.lista || []).filter(function (a) { return a.punteggio != null && isFinite(a.punteggio); });
    if (migliori.length) {
      $('#migliori').className = 'cards';
      schede(migliori, '#migliori', '');
      $('#notaMigliori').textContent = 'Ordinati per punteggio affare (0–100) tra ' + R.migliori.totale.toLocaleString('it-IT') + ' aste con il punteggio completo.';
      var f = JSON.stringify({ ordina: 'punteggio' });
      $('#linkMigliori').href = 'aste.html?filtri=' + encodeURIComponent(f);
      $('#linkMigliori').setAttribute('data-passa', 'filtri:' + f);
    } else {
      $('#migliori').className = '';
      $('#migliori').innerHTML = '<div class="panel empty"><p style="margin:0">La classifica usa il <b>punteggio affare</b>, che richiede la stima del valore di mercato. Finché la stima non è disponibile non mostriamo una classifica: sarebbe inventata.</p><p class="note" style="margin:8px auto 0">Nel frattempo trovi qui sotto le aste nuove e quelle in scadenza.</p></div>';
    }

    schede(R.nuove.lista, '#nuove', 'Nessuna asta nuova nelle ultime 24 ore.');
    $('#linkNuove').textContent = R.nuove.totale > R.nuove.lista.length ? 'Tutte le ' + R.nuove.totale.toLocaleString('it-IT') + ' →' : '';
    schede(R.inScadenza.lista, '#scadenza', 'Nessuna asta nei prossimi 7 giorni.');
    $('#linkScadenza').textContent = R.inScadenza.totale > R.inScadenza.lista.length ? 'Tutte le ' + R.inScadenza.totale.toLocaleString('it-IT') + ' →' : '';

    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-segui]'); if (!b) return;
      var id = b.dataset.segui;
      var tutte = migliori.concat(R.nuove.lista, R.inScadenza.lista), a = tutte.filter(function (x) { return x.id === id; })[0];
      var on = !S.seguita(id);
      if (on) S.segui(id, a ? { copia: a } : null); else S.smetti(id);
      // la stessa asta può comparire in più sezioni: si aggiornano tutte le stelle
      U.$$('[data-segui]').forEach(function (x) { if (x.dataset.segui === id) window.Schede.aggiornaSegui(x, on); });
      U.toast(on ? 'Aggiunta a "Le mie aste"' : 'Rimossa da "Le mie aste"');
    });
  });
})();
