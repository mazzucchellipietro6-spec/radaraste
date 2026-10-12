/* Ricerca istantanea: si apre con il pulsante Cerca, con "/" o Ctrl/Cmd+K.
 * Suggerisce luoghi, tribunali, tipologie e singole aste mentre si scrive. */
(function (root) {
  'use strict';
  var U = root.UI, $ = U.$;
  var indice = null, aste = null, caricando = null, selezione = 0, voci = [];

  function norm(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function evidenzia(testo, parole) {
    var t = U.esc(testo);
    parole.forEach(function (p) {
      if (!p) return;
      var i = norm(testo).indexOf(p);
      if (i >= 0) { var orig = testo.substr(i, p.length); t = t.replace(U.esc(orig), '<mark>' + U.esc(orig) + '</mark>'); }
    });
    return t;
  }

  // carica tutte le aste solo quando serve (nelle pagine che non le hanno già)
  function carica() {
    if (aste) return Promise.resolve(aste);
    if (root.ASTE_RACCOLTE && root.Store) { aste = root.Store.aste(); return Promise.resolve(aste); }
    if (caricando) return caricando;
    caricando = new Promise(function (ok) {
      var s = document.createElement('script'); s.src = 'data/aste.js'; s.async = true;
      s.onload = function () { aste = root.Store ? root.Store.aste() : []; ok(aste); };
      s.onerror = function () { aste = []; ok(aste); };
      document.head.appendChild(s);
    });
    return caricando;
  }

  function costruisciIndice(lista) {
    var comuni = {}, tribunali = {}, tipi = {};
    lista.forEach(function (a) {
      if (a.comune) { var k = a.comune + '|' + (a.provincia || ''); comuni[k] = (comuni[k] || 0) + 1; }
      if (a.tribunale) tribunali[a.tribunale] = (tribunali[a.tribunale] || 0) + 1;
      if (a.tipo) tipi[a.tipo] = (tipi[a.tipo] || 0) + 1;
      if (a._n === undefined) a._n = norm([a.titolo, a.comune, a.tribunale, a.tipo, a.rge].join(' '));
    });
    var perProv = {}, perReg = {};
    lista.forEach(function (a) { if (a.provincia) perProv[a.provincia] = (perProv[a.provincia] || 0) + 1; if (a.regione) perReg[a.regione] = (perReg[a.regione] || 0) + 1; });
    return {
      luoghi: root.GEO.regioni.map(function (r) { return { tipo: 'regione', nome: r, n: perReg[r] || 0, filtri: { regione: r } }; })
        .concat(Object.keys(root.GEO.province).map(function (s) { var p = root.GEO.province[s]; return { tipo: 'provincia', nome: p.nome + ' (' + s + ')', n: perProv[s] || 0, filtri: { regione: p.regione, provincia: s } }; }))
        .concat(Object.keys(comuni).map(function (k) { var x = k.split('|'); return { tipo: 'comune', nome: x[0] + (x[1] ? ' (' + x[1] + ')' : ''), n: comuni[k], filtri: { testo: x[0] } }; })),
      tribunali: Object.keys(tribunali).map(function (t) { return { tipo: 'tribunale', nome: 'Tribunale di ' + t, n: tribunali[t], filtri: { tribunale: t } }; }),
      tipi: Object.keys(tipi).map(function (t) { return { tipo: 'tipologia', nome: t, n: tipi[t], filtri: { testo: t } }; })
    };
  }

  function linkFiltri(f) {
    var j = JSON.stringify(f);
    return 'aste.html?filtri=' + encodeURIComponent(j);
  }

  function cerca(q) {
    var parole = norm(q).split(/\s+/).filter(Boolean);
    var out = [];
    if (!parole.length) {
      out.push({ gruppo: 'Vai a', voci: [
        { nome: 'Migliori affari di oggi', href: 'index.html', icona: 'radar' },
        { nome: 'Tutte le aste', href: 'aste.html', icona: 'lista' },
        { nome: 'Mappa delle aste', href: 'mappa.html', icona: 'mappa' },
        { nome: 'Calcola se conviene', href: 'calcolatore.html', icona: 'calcolo' },
        { nome: 'Le aste che segui', href: 'mie-aste.html', icona: 'stella' }
      ] });
      return out;
    }
    function filtra(lista, max) {
      return lista.filter(function (x) { var n = norm(x.nome); return parole.every(function (p) { return n.indexOf(p) >= 0; }); })
        .sort(function (a, b) { var pa = norm(a.nome).indexOf(parole[0]) === 0 ? 0 : 1, pb = norm(b.nome).indexOf(parole[0]) === 0 ? 0 : 1; return pa - pb || b.n - a.n; })
        .slice(0, max);
    }
    if (indice) {
      var l = filtra(indice.luoghi, 6), t = filtra(indice.tribunali, 3), ti = filtra(indice.tipi, 3);
      if (l.length) out.push({ gruppo: 'Luoghi', voci: l.map(function (x) { return { nome: x.nome, nota: x.n.toLocaleString('it-IT') + ' aste', href: linkFiltri(x.filtri), passa: 'filtri:' + JSON.stringify(x.filtri), icona: 'luogo' }; }) });
      if (t.length) out.push({ gruppo: 'Tribunali', voci: t.map(function (x) { return { nome: x.nome, nota: x.n.toLocaleString('it-IT') + ' aste', href: linkFiltri(x.filtri), passa: 'filtri:' + JSON.stringify(x.filtri), icona: 'tribunale' }; }) });
      if (ti.length) out.push({ gruppo: 'Tipologie', voci: ti.map(function (x) { return { nome: x.nome, nota: x.n.toLocaleString('it-IT') + ' aste', href: linkFiltri(x.filtri), passa: 'filtri:' + JSON.stringify(x.filtri), icona: 'casa' }; }) });
    }
    if (aste) {
      var trovate = [];
      for (var i = 0; i < aste.length && trovate.length < 8; i++) {
        var a = aste[i]; if (a._n === undefined) a._n = norm([a.titolo, a.comune, a.tribunale, a.tipo, a.rge].join(' '));
        if (parole.every(function (p) { return a._n.indexOf(p) >= 0; })) trovate.push(a);
      }
      if (trovate.length) out.push({ gruppo: 'Aste', voci: trovate.map(function (a) {
        return { nome: a.titolo, nota: (a.comune || '') + (a.prezzoBase ? ' · ' + U.eur(a.prezzoBase) : ''), href: 'scheda.html?id=' + encodeURIComponent(a.id), passa: 'id:' + a.id,
          icona: { immobile: 'casa', auto: 'auto', moto: 'moto', beni: 'beni' }[a.categoria] || 'beni' };
      }) });
      out.push({ gruppo: 'Ricerca libera', voci: [{ nome: 'Tutte le aste con “' + q + '”', href: linkFiltri({ testo: q }), passa: 'filtri:' + JSON.stringify({ testo: q }), icona: 'cerca' }] });
    }
    return out;
  }

  function disegna(q) {
    var gruppi = cerca(q), parole = norm(q).split(/\s+/).filter(Boolean);
    voci = []; var h = '';
    gruppi.forEach(function (g) {
      h += '<div class="gruppo">' + U.esc(g.gruppo) + '</div>';
      g.voci.forEach(function (v) {
        var i = voci.length; voci.push(v);
        h += '<a class="voce" role="option" id="voce' + i + '" href="' + U.esc(v.href) + '"' + (v.passa ? ' data-passa="' + U.esc(v.passa) + '"' : '') + ' aria-selected="' + (i === selezione) + '">' +
          U.icona(v.icona) + '<span>' + evidenzia(v.nome, parole) + '</span>' + (v.nota ? '<small>' + U.esc(v.nota) + '</small>' : '') + '</a>';
      });
    });
    if (!voci.length) h = '<div class="vuoto">' + (aste ? 'Nessun risultato per “' + U.esc(q) + '”.' : 'Carico le aste…') + '</div>';
    $('#paletteRisultati').innerHTML = h;
  }

  function apri() {
    var p = $('#palette');
    if (!p) {
      p = document.createElement('div'); p.id = 'palette'; p.className = 'palette'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Ricerca');
      p.innerHTML = '<div class="box"><div class="campo">' + U.icona('cerca') + '<input id="paletteCampo" type="search" autocomplete="off" placeholder="Comune, provincia, tribunale, tipologia o parole dell\'avviso" aria-controls="paletteRisultati" aria-autocomplete="list" enterkeyhint="search">' +
        '<button class="btn small quiet" type="button" id="paletteChiudi">Esc</button></div><div class="risultati" id="paletteRisultati" role="listbox"></div>' +
        '<div class="piede"><span>↑↓ per scegliere</span><span>Invio per aprire</span><span>Esc per chiudere</span></div></div>';
      document.body.appendChild(p);
      var campo = $('#paletteCampo');
      p.addEventListener('click', function (e) { if (e.target === p || e.target.closest('#paletteChiudi')) chiudi(); });
      campo.addEventListener('input', function () { selezione = 0; disegna(campo.value); });
      campo.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault(); if (!voci.length) return;
          selezione = (selezione + (e.key === 'ArrowDown' ? 1 : -1) + voci.length) % voci.length; disegna(campo.value);
          var el = $('#voce' + selezione); if (el) el.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') { var el2 = $('#voce' + selezione); if (el2) { e.preventDefault(); el2.click(); } }
        else if (e.key === 'Escape') chiudi();
      });
    }
    requestAnimationFrame(function () { p.setAttribute('data-aperta', ''); $('#paletteCampo').focus(); });
    disegna($('#paletteCampo').value);
    carica().then(function (l) { if (!indice) indice = costruisciIndice(l); disegna($('#paletteCampo').value); });
  }
  function chiudi() { var p = $('#palette'); if (p) p.removeAttribute('data-aperta'); }
  // precarica in background quando il browser è libero, così la prima ricerca è immediata
  if ('requestIdleCallback' in root) root.requestIdleCallback(function () { if (root.ASTE_RACCOLTE) carica(); }, { timeout: 4000 });

  root.Cerca = { apri: apri, chiudi: chiudi };
})(window);
