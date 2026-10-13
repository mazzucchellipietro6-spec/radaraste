/* Pagina "Combinazioni d'oro": legge data/combinazioni.js (scritto ogni mattina dalla raccolta con js/combinazioni.js). */
(function () {
  'use strict';
  var U = window.UI, $ = U.$, K = window.Combinazioni, T = window.TARIFFE;
  var TIPI = { '': 'Tutte', 'casa-pertinenza': 'Casa e box o cantina', 'unita-vicine': 'Più abitazioni', 'casa-terreno': 'Casa e terreno', 'spazi-attivita': 'Spazi per un\'attività' };
  var AFF = { alta: ['p-good', 'alta'], media: ['p-info', 'media'], bassa: ['p-warn', 'bassa'] };
  var filtro = { tipo: '', affidabili: false, regione: '' }, mostrate = 10, PASSO = 10;

  function n(x) { return Number(x || 0).toLocaleString('it-IT'); }
  function titolo(c) {
    var dove = c.comune ? ' a ' + c.comune : '';
    var ab = c.lotti.filter(function (l) { return l.ruolo === 'abitazione'; }).length;
    if (c.tipo === 'casa-pertinenza') return (ab > 1 ? ab + ' abitazioni' : 'Abitazione') + ' e box o cantina' + dove;
    if (c.tipo === 'unita-vicine') return ab + ' abitazioni della stessa procedura' + dove;
    if (c.tipo === 'casa-terreno') return 'Abitazione e terreno' + dove;
    return c.lotti.length + ' locali della stessa procedura' + dove;
  }
  function pillAff(a) { var p = AFF[a]; return p ? '<span class="pill ' + p[0] + '">' + p[1] + '</span>' : '<span class="pill p-neutral">n.d.</span>'; }
  function cella(v) { return v ? U.eur(v) : '<span class="muted">—</span>'; }
  function card(c) {
    var N = c.numeri, lotti = c.lotti.map(function (l) {
      return '<tr><td data-label="Lotto"><div class="v"><span class="cb-ruolo">' + U.esc(K.NOMI_RUOLO[l.ruolo] || l.ruolo) + (l.numeroLotto ? ' · lotto ' + U.esc(l.numeroLotto) : '') + '</span>' +
        '<a href="scheda.html?id=' + encodeURIComponent(l.id) + '" data-passa="id:' + U.esc(l.id) + '">' + U.esc(String(l.titolo || '').slice(0, 140)) + '</a></div></td>' +
        '<td class="num" data-label="Prezzo base"><span class="v">' + cella(l.prezzoBase) + '</span></td>' +
        '<td class="num" data-label="Valore stimato"><span class="v">' + (l.valore ? U.eur(l.valore) + ' ' + pillAff(l.affidabilita) : '<span class="muted">non stimato</span>') + '</span></td>' +
        '<td class="num" data-label="Punteggio"><span class="v">' + (l.punteggio != null ? l.punteggio + '/100' : '<span class="muted">—</span>') + '</span></td></tr>';
    }).join('');
    var numeri = '<dl class="cb-numeri">' +
      '<div><dt>Lotti</dt><dd>' + N.lotti + '</dd></div>' +
      '<div><dt>Prezzo base totale</dt><dd>' + U.eur(N.prezzoBase) + '<small>offerta minima ' + U.eur(N.offertaMinima) + '</small></dd></div>' +
      '<div><dt>Valore stimato</dt><dd>' + (N.valore ? U.eur(N.valore) + '<small>affidabilità ' + c.affidabilita + '</small>' : '<span class="muted" style="font-size:14px;font-weight:500">non calcolato</span><small>' + N.lottiConValore + ' lotti su ' + N.lotti + ' con valore affidabile</small>') + '</dd></div>' +
      (N.sconto != null ? '<div><dt>Sconto complessivo</dt><dd class="' + (N.sconto >= 0.25 ? 'buono' : '') + '">' + U.pct(N.sconto, 0) + '<small>costo totale ' + U.eur(N.costoTotale) + '</small></dd></div>' : '') +
      (N.risparmioPrimaCasa ? '<div><dt>Risparmio prima casa</dt><dd class="buono">' + U.eur(N.risparmioPrimaCasa) + '<small>imposte sulle pertinenze</small></dd></div>' : '') + '</dl>';
    var risp = c.risparmio ? '<div class="cb-risparmio"><span><b>' + U.eur(c.risparmio.importo) + ' di imposte in meno.</b> ' + U.esc(c.risparmio.testo) + '</span><span class="fonte">' + U.esc(c.risparmio.condizioni) +
      ' Fonte: <a href="' + U.esc(c.risparmio.url) + '" target="_blank" rel="noopener">' + U.esc(c.risparmio.fonte) + '</a>, aliquote verificate il ' + U.dataIt(c.risparmio.verificato) + '.</span></div>' : '';
    return '<article class="cb-card"><header class="cb-testa"><span class="cb-tipo">' + U.esc(TIPI[c.tipo] || c.tipo) + '</span><h2>' + U.esc(titolo(c)) + '</h2>' +
      '<p class="cb-dove">' + U.esc(['Tribunale di ' + c.tribunale, 'procedura n. ' + c.rge + (c.annoProcedura ? '/' + c.annoProcedura : ''), c.provincia ? 'provincia ' + c.provincia : '', 'asta il ' + U.dataIt(c.dataAsta)].filter(Boolean).join(' · ')) + '</p></header>' +
      '<div class="cb-corpo">' + numeri + risp +
      '<div class="tablebox"><table class="responsive cb-lotti"><thead><tr><th>Lotto</th><th class="num">Prezzo base</th><th class="num">Valore stimato</th><th class="num">Punteggio</th></tr></thead><tbody>' + lotti + '</tbody></table></div>' +
      '<div class="cb-due"><div><h3>Perché insieme</h3><ul>' + c.motivi.map(function (m) { return '<li>' + U.esc(m) + '</li>'; }).join('') + '</ul></div>' +
      '<div><h3>Da sapere</h3><ul>' + (c.avvisi || []).concat(c.nota ? [c.nota] : []).map(function (m) { return '<li>' + U.esc(m) + '</li>'; }).join('') + '</ul></div></div>' +
      '<p class="fonte">Fonti: lotti e prezzi dal Portale delle Vendite Pubbliche; valore di ogni lotto come nella sua scheda (quotazioni OMI dell\'Agenzia delle Entrate o stima del perito).</p></div></article>';
  }
  function disegna() {
    var C = window.COMBINAZIONI, el = $('#cbElenco');
    if (!C) { el.innerHTML = '<div class="panel cb-vuoto">Le combinazioni di oggi non sono ancora disponibili: si calcolano ogni mattina dopo la raccolta delle aste.</div>'; $('#cbSintesi').textContent = ''; return; }
    var l = C.combinazioni.filter(function (c) {
      return (!filtro.tipo || c.tipo === filtro.tipo) && (!filtro.affidabili || c.affidabilita !== 'bassa') && (!filtro.regione || c.regione === filtro.regione);
    });
    $('#cbSintesi').innerHTML = 'Oggi <b>' + n(C.trovate) + '</b> combinazioni tra <b>' + n(C.gruppiAnalizzati) + '</b> procedure con più lotti; qui le prime ' + n(C.combinazioni.length) +
      ', ordinate per tipo, affidabilità e sconto. Aggiornato il ' + U.dataIt(String(C.aggiornato || '').slice(0, 10)) + '.';
    el.innerHTML = l.length ? l.slice(0, mostrate).map(card).join('') +
      (l.length > mostrate ? '<button class="btn ghost" type="button" id="cbAltre" style="justify-self:center">Mostra altre ' + Math.min(PASSO, l.length - mostrate) + ' (' + (l.length - mostrate) + ' rimaste)</button>' : '')
      : '<div class="panel cb-vuoto">Nessuna combinazione con questi filtri.</div>';
  }
  function avvia() {
    var C = window.COMBINAZIONI;
    $('#cbTipo').innerHTML = Object.keys(TIPI).map(function (k) {
      var q = C && k ? ' <span class="muted">' + n((C.perTipo || {})[k] || 0) + '</span>' : '';
      return '<button class="chip" type="button" data-tipo="' + k + '" aria-pressed="' + (k === '' ? 'true' : 'false') + '">' + U.esc(TIPI[k]) + q + '</button>';
    }).join('');
    var reg = {}; (C ? C.combinazioni : []).forEach(function (c) { if (c.regione) reg[c.regione] = 1; });
    $('#cbRegione').innerHTML = '<option value="">Tutte le regioni</option>' + Object.keys(reg).sort().map(function (r) { return '<option>' + U.esc(r) + '</option>'; }).join('');
    $('#cbTipo').addEventListener('click', function (e) {
      var b = e.target.closest('[data-tipo]'); if (!b) return;
      filtro.tipo = b.dataset.tipo; mostrate = PASSO;
      U.$$('#cbTipo .chip').forEach(function (c) { c.setAttribute('aria-pressed', String(c === b)); });
      disegna();
    });
    $('#cbAffidabili').addEventListener('change', function () { filtro.affidabili = this.checked; mostrate = PASSO; disegna(); });
    $('#cbRegione').addEventListener('change', function () { filtro.regione = this.value; mostrate = PASSO; disegna(); });
    $('#cbElenco').addEventListener('click', function (e) {
      if (!e.target.closest('#cbAltre')) return;
      var prima = mostrate; mostrate += PASSO; disegna();
      var c = U.$$('#cbElenco .cb-card')[prima]; if (c) { var h = c.querySelector('h2 a, h2'); c.setAttribute('tabindex', '-1'); c.focus({ preventScroll: false }); }
    });
    disegna();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia); else avvia();
})();
