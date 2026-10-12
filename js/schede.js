/* Scheda di un'asta in elenco (home, elenco, mappa, confronto). */
(function (root) {
  'use strict';
  var U = root.UI, C = root.Calcoli, T = root.TARIFFE;

  function luogo(a) {
    var p = a.provincia && root.GEO && root.GEO.province[a.provincia];
    return [a.comune ? a.comune + (a.provincia ? ' (' + a.provincia + ')' : '') : (p ? p.nome : a.provincia || ''),
      a.tribunale ? 'Trib. ' + a.tribunale : '', a.rge ? 'Proc. n. ' + a.rge : ''].filter(Boolean).join(' · ');
  }

  function statoPill(a) {
    var c = a.stato === 'libero' ? 'p-good' : a.stato === 'occupato' ? 'p-warn' : 'p-neutral';
    return '<span class="pill ' + c + '">' + U.esc(U.STATI[a.stato] || 'Non indicato') + '</span>';
  }

  function punteggioPill(a) {
    if (a.punteggio == null) return '';
    var tono = a.punteggio >= 70 ? 'good' : a.punteggio >= 45 ? 'warn' : 'bad';
    return '<span class="punteggio p-' + tono + '" title="Punteggio affare su 100">' + Math.round(a.punteggio) + '</span>';
  }

  /* opz: { seguita, nuova, compatta, confronto (bool: mostra casella Confronta), selezionata } */
  function card(a, opz) {
    opz = opz || {};
    var min = a.offertaMinima || (a.prezzoBase ? C.offertaMinima(a.prezzoBase, T) : null);
    var avviso = U.linkSicuro(a.linkAvviso), perizia = U.linkSicuro(a.linkPerizia), pdf = U.linkSicuro(a.linkPdf);
    var q = U.quando(a.dataAsta), l = luogo(a);
    var st = !opz.compatta && C.stimaRapida(a, T);
    var testa = '<div class="top">' + (opz.nuova ? '<span class="pill p-good">Nuova</span>' : '') +
      '<span class="pill p-info">' + U.esc(U.CATEGORIE[a.categoria] || a.categoria) + '</span>' + statoPill(a) +
      (a.tipo && !opz.compatta ? '<span class="tag">' + U.esc(a.tipo) + '</span>' : '') +
      (opz.compatta ? '' : a.origine === 'manuale' ? '<span class="tag" title="Copiata da te da un avviso">inserita da te' + (a.fonte ? ' · ' + U.esc(a.fonte) : '') + '</span>' : '<span class="tag" title="Raccolta automatica dalla fonte ufficiale">' + U.esc(a.fonte || 'fonte') + '</span>') +
      '<span class="spacer"></span>' + punteggioPill(a) + '</div>';
    var dati = '<dl class="kv">' +
      '<div><dt>' + (a.fonte === 'Agenzia del Demanio' ? 'Termine offerte' : 'Data asta') + '</dt><dd>' + U.dataIt(a.dataAsta) + (a.ora ? ' ' + U.esc(a.ora) : '') + (q ? ' <span class="muted" style="font-size:12px">(' + q + ')</span>' : '') + '</dd></div>' +
      '<div><dt>Prezzo base</dt><dd>' + (a.prezzoBase ? U.eur(a.prezzoBase) : '<span class="muted">nell\'avviso</span>') + '</dd></div>' +
      '<div><dt>Offerta minima</dt><dd>' + (min ? U.eur(min) : '—') + '</dd></div>' +
      (a.sconto != null ? '<div><dt>Sconto sul valore</dt><dd>' + U.pct(a.sconto, 0) + '</dd></div>'
        : st ? '<div><dt>Sconto stimato*</dt><dd><span class="pill p-' + st.giudizio.tono + '" title="Costo totale stimato al prezzo base: ' + U.eur(st.totale) + '">' + U.pct(st.sconto, 0) + ' · ' + st.giudizio.etichetta + '</span></dd></div>'
        : '<div><dt>Valore di mercato</dt><dd class="muted">non stimato</dd></div>') +
      '</dl>';
    var link = '<div class="links">' + (avviso ? '<a href="' + U.esc(avviso) + '" target="_blank" rel="noopener">Avviso originale ↗</a>' : '<span class="muted">Avviso mancante</span>') +
      (pdf ? '<a href="' + U.esc(pdf) + '" target="_blank" rel="noopener">Avviso PDF ↗</a>' : '') +
      (perizia ? '<a href="' + U.esc(perizia) + '" target="_blank" rel="noopener">Perizia ↗</a>' : '') + '</div>' +
      (Array.isArray(a.altriLink) && a.altriLink.length ? '<div class="links" style="font-size:13px"><span class="muted">Anche su:</span>' + a.altriLink.filter(function (x) { return U.linkSicuro(x[1]); }).map(function (x) { return '<a href="' + U.esc(x[1]) + '" target="_blank" rel="noopener">' + U.esc(x[0]) + ' ↗</a>'; }).join('') + '</div>' : '');
    var azioni = '<div class="actions">' +
      '<a class="btn small" href="scheda.html?id=' + encodeURIComponent(a.id) + '" data-passa="id:' + U.esc(a.id) + '">Scheda</a>' +
      '<a class="btn small ghost" href="calcolatore.html?id=' + encodeURIComponent(a.id) + '" data-passa="id:' + U.esc(a.id) + '">Conviene?</a>' +
      '<button class="btn small ghost" type="button" data-segui="' + U.esc(a.id) + '" aria-pressed="' + !!opz.seguita + '">' + (opz.seguita ? 'Seguita ✓' : 'Segui') + '</button>' +
      (opz.confronto ? '<label class="check confronta"><input type="checkbox" data-confronta="' + U.esc(a.id) + '"' + (opz.selezionata ? ' checked' : '') + '> Confronta</label>' : '') +
      (a.origine === 'manuale' && !opz.compatta ? '<button class="btn small ghost" type="button" data-modifica="' + U.esc(a.id) + '">Modifica</button><button class="btn small danger" type="button" data-elimina="' + U.esc(a.id) + '">Elimina</button>' : '') +
      '</div>';
    return '<article class="card' + (opz.nuova ? ' nuova' : '') + '">' + testa + '<h4>' + U.esc(a.titolo) + '</h4>' + (l ? '<div class="where">' + U.esc(l) + '</div>' : '') +
      dati + (opz.compatta ? '' : link) + azioni + '</article>';
  }

  root.Schede = { card: card, luogo: luogo, statoPill: statoPill, punteggioPill: punteggioPill };
})(window);
