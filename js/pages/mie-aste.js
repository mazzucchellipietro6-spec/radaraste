/* Pagina "Le mie aste": aste seguite con note, stato personale e valutazione. */
(function () {
  'use strict';
  var T = window.TARIFFE, U = window.UI, S = window.Store, C = window.Calcoli, $ = U.$, $$ = U.$$;
  var STATI = [
    ['da-valutare', 'Da valutare'], ['interessato', 'Interessato'], ['offerta', 'Offerta presentata'],
    ['aggiudicata', 'Aggiudicata'], ['persa', 'Persa'], ['scartata', 'Scartata']
  ];
  var filtro = '';

  function nomeStato(k) { return (STATI.filter(function (s) { return s[0] === k; })[0] || [k, k])[1]; }

  function elemento(s) {
    var a = S.asta(s.id) || s.copia;
    if (!a) return '';
    var sparita = !S.asta(s.id);
    var v = s.valutazione;
    var g = U.giorniA(a.dataAsta);
    var urgente = g !== null && g >= 0 && g <= 7;
    var link = U.linkSicuro(a.linkAvviso), perizia = U.linkSicuro(a.linkPerizia);
    return '<article class="panel" data-id="' + U.esc(s.id) + '">' +
      '<div class="row-actions" style="align-items:flex-start">' +
        '<div style="flex:1;min-width:220px">' +
          '<div class="row-actions" style="gap:6px;margin-bottom:4px"><span class="pill p-info">' + U.esc(U.CATEGORIE[a.categoria] || a.categoria) + '</span>' +
            (v ? '<span class="pill p-' + v.tono + '" title="Valutazione del ' + U.dataIt((v.data || '').slice(0, 10)) + '">' + U.esc(v.giudizio) + ' · ' + U.pct(v.sconto, 0) + '</span>' : '<span class="pill p-neutral">Non ancora valutata</span>') +
            (urgente ? '<span class="pill p-warn">Asta ' + U.quando(a.dataAsta) + '</span>' : '') +
            (sparita ? '<span class="pill p-neutral" title="Non è più nell\'elenco: mostro la copia salvata">non più in elenco</span>' : '') + '</div>' +
          '<h2 style="font-size:18px">' + U.esc(a.titolo) + '</h2>' +
          '<div class="note" style="margin:0">' + U.esc([a.comune, a.provincia ? '(' + a.provincia + ')' : '', a.tribunale ? '· Trib. ' + a.tribunale : '', a.rge ? '· R.G.E. ' + a.rge : ''].filter(Boolean).join(' ')) + '</div>' +
        '</div>' +
        '<label style="min-width:180px">A che punto sei<select data-campo="stato">' + STATI.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === s.stato ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select></label>' +
      '</div>' +
      '<dl class="kv" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr));margin-top:12px">' +
        '<div><dt>Data asta</dt><dd>' + U.dataIt(a.dataAsta) + '</dd></div>' +
        '<div><dt>Prezzo base</dt><dd>' + U.eur(a.prezzoBase) + '</dd></div>' +
        '<div><dt>Offerta minima</dt><dd>' + U.eur(a.offertaMinima || (a.prezzoBase ? C.offertaMinima(a.prezzoBase, T) : NaN)) + '</dd></div>' +
        (v ? '<div><dt>Costo totale stimato</dt><dd>' + U.eur(v.totale) + '</dd></div><div><dt>Offerta max consigliata</dt><dd>' + U.eur(v.offertaMax) + '</dd></div>' : '') +
      '</dl>' +
      '<label style="margin-top:12px">Note<textarea data-campo="note" rows="3" placeholder="Es.: visita fissata, debito condominiale chiesto all\'amministratore, offerta massima decisa…">' + U.esc(s.note || '') + '</textarea></label>' +
      '<div class="row-actions" style="margin-top:10px">' +
        (link ? '<a href="' + U.esc(link) + '" target="_blank" rel="noopener">Avviso originale ↗</a>' : '') +
        (perizia ? '<a href="' + U.esc(perizia) + '" target="_blank" rel="noopener">Perizia ↗</a>' : '') +
        '<span class="spacer"></span>' +
        '<a class="btn small" href="calcolatore.html?id=' + encodeURIComponent(s.id) + '">' + (v ? 'Ricalcola' : 'Valuta convenienza') + '</a>' +
        '<button class="btn small danger" type="button" data-smetti>Smetti di seguire</button>' +
      '</div></article>';
  }

  function render() {
    var seg = S.seguite();
    var conteggi = {}; seg.forEach(function (s) { conteggi[s.stato] = (conteggi[s.stato] || 0) + 1; });
    $('#fStato').innerHTML = '<button class="chip" type="button" data-f="" aria-pressed="' + (filtro === '') + '">Tutte (' + seg.length + ')</button>' +
      STATI.filter(function (x) { return conteggi[x[0]]; }).map(function (x) {
        return '<button class="chip" type="button" data-f="' + x[0] + '" aria-pressed="' + (filtro === x[0]) + '">' + x[1] + ' (' + conteggi[x[0]] + ')</button>';
      }).join('');
    var lista = seg.filter(function (s) { return !filtro || s.stato === filtro; })
      .sort(function (x, y) { var a = S.asta(x.id) || x.copia || {}, b = S.asta(y.id) || y.copia || {}; return (a.dataAsta || '9').localeCompare(b.dataAsta || '9'); });
    if (!seg.length) {
      $('#lista').innerHTML = '<div class="panel empty"><h2>Non stai seguendo nessuna asta</h2><p>Nell\'<a href="index.html">elenco aste</a> premi <b>Segui</b> su quelle che ti interessano: le ritroverai qui con note e valutazione.</p></div>';
    } else if (!lista.length) {
      $('#lista').innerHTML = '<div class="panel empty">Nessuna asta con stato "' + U.esc(nomeStato(filtro)) + '".</div>';
    } else $('#lista').innerHTML = lista.map(elemento).join('');
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!S.persistente()) $('#avvisoArchivio').innerHTML = '<b>Attenzione:</b> questo browser non permette di salvare dati (navigazione privata?). Le aste seguite andranno perse chiudendo la pagina: scarica un backup.';
    render();
    $('#fStato').addEventListener('click', function (e) { var b = e.target.closest('[data-f]'); if (b) { filtro = b.dataset.f; render(); } });
    $('#lista').addEventListener('change', function (e) {
      var art = e.target.closest('[data-id]'); if (!art || !e.target.dataset.campo) return;
      var d = {}; d[e.target.dataset.campo] = e.target.value; S.segui(art.dataset.id, d);
      if (e.target.dataset.campo === 'stato') render(); else U.toast('Note salvate');
    });
    var timer;
    $('#lista').addEventListener('input', function (e) {
      if (e.target.dataset.campo !== 'note') return;
      var art = e.target.closest('[data-id]'), val = e.target.value;
      clearTimeout(timer); timer = setTimeout(function () { S.segui(art.dataset.id, { note: val }); }, 400);
    });
    $('#lista').addEventListener('click', function (e) {
      if (!e.target.matches('[data-smetti]')) return;
      var id = e.target.closest('[data-id]').dataset.id;
      if (confirm('Smettere di seguire questa asta? Note e valutazione verranno cancellate.')) { S.smetti(id); render(); }
    });
    $('#backup').addEventListener('click', function () { U.scarica('radar-aste-backup.json', JSON.stringify(S.backup(), null, 2), 'application/json'); });
    $('#ripristina').addEventListener('change', function () {
      var f = this.files[0]; if (!f) return;
      U.leggiFile(f).then(function (t) { var e = S.ripristina(JSON.parse(t)); render(); alert('Backup ripristinato (' + e.importate + ' aste).'); })
        .catch(function (err) { alert('Ripristino non riuscito: ' + err.message); });
      this.value = '';
    });
  });
})();
