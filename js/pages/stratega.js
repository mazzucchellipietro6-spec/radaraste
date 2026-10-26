/* Pagina "Stratega d'asta": profilo dell'utente → Stratega.esegui (js/stratega.js) sulle aste in corso (data/aste.js,
 * caricato in background) con le statistiche degli esiti passati (data/statistiche.js). Mostra il piano, la
 * simulazione Monte Carlo (istogramma delle aste vinte), le ipotesi, cosa non sappiamo e l'avviso. */
(function () {
  'use strict';
  var U = window.UI, $ = U.$, S = window.Stratega;
  var K_PROFILO = 'radaraste.stratega';
  var aste = null, caricamento = null;

  function caricaAste() {
    if (aste) return Promise.resolve(aste);
    if (caricamento) return caricamento;
    caricamento = new Promise(function (ok) {
      var s = document.createElement('script'); s.src = 'data/aste.js'; s.async = true;
      s.onload = function () { aste = window.Store ? window.Store.aste() : []; ok(aste); };
      s.onerror = function () { aste = []; ok(aste); };
      document.head.appendChild(s);
    });
    return caricamento;
  }
  function profiloDalForm() {
    var f = new FormData($('#stForm')), n = function (k) { var v = parseFloat(String(f.get(k) || '').replace(',', '.')); return isFinite(v) ? v : 0; };
    return { capitale: n('capitale'), mutuo: n('mutuo'), orizzonteMesi: n('orizzonteMesi') || 6, strategia: f.get('strategia'), prudenza: f.get('prudenza'),
      regioni: f.get('regione') ? [f.get('regione')] : [], concorrenza: n('concorrenza') / 100, categoria: 'immobile' };
  }
  function n(x) { return Number(x || 0).toLocaleString('it-IT'); }
  function tile(et, val, nota) { return '<div class="tile"><div class="t-et">' + et + '</div><div class="t-val">' + val + '</div>' + (nota ? '<div class="t-nota">' + nota + '</div>' : '') + '</div>'; }

  // istogramma delle aste vinte nelle simulazioni: una sola serie, barre sottili con l'estremo arrotondato, etichette %
  function istogramma(v) {
    var h = v.istogramma || [], W = 520, H = 190, sx = 36, base = H - 28, alto = 18, larg = Math.min(64, (W - sx - 10) / Math.max(1, h.length) - 12);
    var max = Math.max.apply(null, h.concat([0.01]));
    var passo = (W - sx - 10) / Math.max(1, h.length);
    var barre = h.map(function (p, i) {
      var x = sx + i * passo + (passo - larg) / 2, hh = Math.max(p > 0 ? 2 : 0, (base - alto) * p / max), y = base - hh;
      var r = Math.min(4, hh / 2), etich = U.pct(p, 0);
      var d = hh > 0 ? 'M' + x + ' ' + base + 'V' + (y + r) + 'Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + 'H' + (x + larg - r) + 'Q' + (x + larg) + ' ' + y + ' ' + (x + larg) + ' ' + (y + r) + 'V' + base + 'Z' : '';
      return '<g class="st-barra"><title>' + i + (i === 1 ? ' asta vinta' : ' aste vinte') + ': ' + etich + ' delle simulazioni</title>' +
        '<rect x="' + (x - 6) + '" y="' + alto + '" width="' + (larg + 12) + '" height="' + (base - alto) + '" fill="transparent"/>' +
        (d ? '<path d="' + d + '" style="fill:var(--accent)"/>' : '') +
        '<text x="' + (x + larg / 2) + '" y="' + (y - 6) + '" text-anchor="middle" class="st-val">' + etich + '</text>' +
        '<text x="' + (x + larg / 2) + '" y="' + (base + 18) + '" text-anchor="middle">' + i + '</text></g>';
    }).join('');
    return '<svg class="grafico st-grafico" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Aste vinte nelle simulazioni: ' + h.map(function (p, i) { return i + ' ' + U.pct(p, 0); }).join(', ') + '">' +
      '<line class="asse" x1="' + sx + '" x2="' + (W - 6) + '" y1="' + base + '" y2="' + base + '"/>' + barre +
      '<text x="' + sx + '" y="' + (H - 1) + '" class="st-asse">aste vinte →</text></svg>' +
      '<details class="st-tabella"><summary>I numeri del grafico</summary><table class="responsive"><thead><tr><th>Aste vinte</th><th class="num">Simulazioni</th><th class="num">Quota</th></tr></thead><tbody>' +
      h.map(function (p, i) { return '<tr><td data-label="Aste vinte"><span class="v">' + i + '</span></td><td class="num" data-label="Simulazioni"><span class="v">' + n((v.conteggi || [])[i]) + '</span></td><td class="num" data-label="Quota"><span class="v">' + U.pct(p, 1) + '</span></td></tr>'; }).join('') +
      '</tbody></table></details>';
  }

  function rigaScelta(c, sim) {
    var pa = (sim.perAsta || []).filter(function (x) { return x.id === c.id; })[0], v = c.valore || {}, p = c.probabilita || {};
    var aff = { alta: 'p-good', media: 'p-info' }[v.affidabilita] || 'p-warn';
    return '<article class="st-scelta">' +
      '<header><span class="st-data">' + U.dataIt(c.dataAsta) + '</span><h3><a href="scheda.html?id=' + encodeURIComponent(c.id) + '" data-passa="id:' + U.esc(c.id) + '">' + U.esc(c.titolo) + '</a></h3>' +
      '<p class="note">' + U.esc([c.comune ? c.comune + (c.provincia ? ' (' + c.provincia + ')' : '') : '', c.tribunale ? 'Tribunale di ' + c.tribunale : '', c.tentativo ? c.tentativo + '° tentativo' : ''].filter(Boolean).join(' · ')) + '</p></header>' +
      '<dl class="cb-numeri">' +
        '<div><dt>Offerta consigliata</dt><dd>' + U.eur(c.offerta) + '<small>minima ' + U.eur(c.offertaMinima) + ' · massima ' + U.eur(c.offertaMax) + '</small></dd></div>' +
        '<div><dt>Cauzione</dt><dd>' + U.eur(c.cauzione && c.cauzione.importo) + '<small>entro il ' + U.dataIt(c.dataCauzione && c.dataCauzione.data) + '</small></dd></div>' +
        '<div><dt>Se vinci paghi</dt><dd>' + U.eur(c.costoTotale) + '<small>saldo entro il ' + U.dataIt(c.dataSaldo && c.dataSaldo.data) + (c.mutuoUsato ? ', mutuo ' + U.eur(c.mutuoUsato) : '') + '</small></dd></div>' +
        '<div><dt>Valore minimo</dt><dd>' + U.eur(v.min) + '<small><span class="pill ' + aff + '">' + U.esc(v.affidabilita || 'n.d.') + '</span> ' + U.esc(v.fonte === 'omi' ? 'OMI della zona' : v.fonte === 'perizia' ? 'perizia' : v.fonte || '') + '</small></dd></div>' +
        '<div><dt>Probabilità di vincerla</dt><dd>' + U.pct(p.vincere, 0) + '<small>' + (p.intervallo ? 'tra ' + U.pct(p.intervallo[0], 0) + ' e ' + U.pct(p.intervallo[1], 0) : '') + (pa ? '; vinta nel ' + U.pct(pa.vinta, 0) + ' delle simulazioni' : '') + '</small></dd></div>' +
      '</dl>' +
      '<details class="st-fonte"><summary>Perché questa offerta e da dove viene la probabilità</summary><p class="fonte">' + U.esc(c.motivoOfferta || '') + '</p><p class="fonte">' + U.esc(p.fonte || '') + '</p></details></article>';
  }

  function disegna(r) {
    var pi = r.piano, sim = r.simulazione, sp = r.spiegazione, box = $('#stEsito');
    if (r.profilo.errori && r.profilo.errori.length) { box.innerHTML = '<div class="panel"><p class="cs-avviso">' + U.esc(r.profilo.errori.join(' ')) + '</p></div>'; return; }
    var testa = '<section class="panel stack" style="gap:14px" aria-labelledby="h-piano"><h2 id="h-piano">Il piano</h2><p>' + U.esc(pi.sintesi && pi.sintesi.testo || '') + '</p>';
    if (!pi.scelte.length) {
      box.innerHTML = testa + '<p class="note">' + U.esc((pi.motiviPrincipali || []).join(' · ') || 'Nessuna asta adatta con queste scelte: meglio aspettare che forzare un piano.') + '</p></section>' + spiegazione(sp);
      return;
    }
    testa += '<div class="ar-numeri">' +
      tile('Aste nel piano', n(pi.scelte.length), 'tra ' + n(r.candidati.candidati.length) + ' adatte al tuo profilo, con valore affidabile') +
      tile('Cassa se le vinci tutte', U.eur(pi.sintesi.cassaSeVinciTutte), 'su ' + U.eur(r.profilo.capitale) + ' di capitale') +
      tile('Ne vinci almeno una', U.pct(sim.almenoUna, 0), sim.forchetta ? 'tra ' + U.pct(sim.forchetta.almenoUna[0], 0) + ' e ' + U.pct(sim.forchetta.almenoUna[1], 0) : '') +
      // media delle simulazioni: può differire di poco dal "guadagno atteso" della sintesi, che è il calcolo diretto
      tile('Margine medio nelle simulazioni', U.eur(sim.guadagno.media), 'sul valore minimo: dal ' + U.eur(sim.guadagno.p10) + ' (caso basso) al ' + U.eur(sim.guadagno.p90) + ' (caso alto)') +
      '</div><p class="note">' + U.esc(pi.sintesi.regola || '') + ' Simulazioni con offerte superiori alla cassa: ' + U.pct(sim.sforamento || 0, 0) + '.</p></section>';
    var scelte = '<section class="stack" style="gap:12px" aria-labelledby="h-scelte"><h2 id="h-scelte">Le aste, in ordine di data</h2>' + pi.scelte.map(function (c) { return rigaScelta(c, sim); }).join('') + '</section>';
    var grafico = '<section class="panel stack" style="gap:10px" aria-labelledby="h-sim"><h2 id="h-sim">Quante ne vinci: ' + n(sim.n) + ' simulazioni</h2>' +
      '<p class="note">Ogni simulazione gioca le aste del piano in ordine di data con le probabilità indicate; in media ne vinci ' + String(Math.round(sim.vinte.media * 10) / 10).replace('.', ',') + '. Capitale usato: mediana ' + U.eur(sim.capitaleUsato.p50) + ', al massimo ' + U.eur(sim.capitaleUsato.p90) + ' nel 90% dei casi.</p>' +
      istogramma(sim.vinte) + '</section>';
    box.innerHTML = testa + scelte + grafico + spiegazione(sp);
  }
  function lista(t, l) { return l && l.length ? '<div><h3>' + t + '</h3><ul>' + l.map(function (x) { return '<li>' + U.esc(x) + '</li>'; }).join('') + '</ul></div>' : ''; }
  function spiegazione(sp) {
    if (!sp) return '';
    return '<section class="panel stack" style="gap:12px" aria-labelledby="h-ipo"><h2 id="h-ipo">Su cosa si basa</h2><div class="cb-due">' +
      lista('Ipotesi e fonti', sp.ipotesi) + lista('Cosa non sappiamo', sp.nonSappiamo) + '</div>' + lista('Attenzione', sp.avvertenze) + '</section>';
  }

  function calcola() {
    var prof = profiloDalForm();
    try { localStorage.setItem(K_PROFILO, JSON.stringify(prof)); } catch (e) {}
    if (!(prof.capitale > 0)) { $('#stEsito').innerHTML = '<div class="panel"><p class="muted">Inserisci il capitale disponibile.</p></div>'; return; }
    $('#stEsito').innerHTML = '<div class="panel"><p class="muted">Carico le aste in corso e calcolo il piano…</p></div>';
    caricaAste().then(function (l) {
      if (!l.length) { $('#stEsito').innerHTML = '<div class="panel"><p class="muted">Nessuna asta disponibile in questa copia del sito.</p></div>'; return; }
      // lascia aggiornare la pagina prima del calcolo (qualche decimo di secondo)
      setTimeout(function () {
        var r = S.esegui(l, prof, { T: window.TARIFFE, stat: window.STATISTICHE || null, oggi: U.oggi() });
        disegna(r);
      }, 20);
    });
  }

  function avvia() {
    if (!S) { $('#stEsito').innerHTML = '<p class="cs-avviso">Il motore dello Stratega non si è caricato (js/stratega.js).</p>'; return; }
    $('#stRegione').insertAdjacentHTML('beforeend', (window.GEO && window.GEO.regioni || []).map(function (r) { return '<option>' + U.esc(r) + '</option>'; }).join(''));
    $('#stDisclaimer').textContent = S.DISCLAIMER;
    var conc = $('#stConc'), out = $('#stConcOut');
    function cursore() { out.textContent = conc.value + '%'; conc.style.setProperty('--p', ((conc.value - conc.min) / (conc.max - conc.min) * 100) + '%'); }
    conc.addEventListener('input', cursore);
    try { var p = JSON.parse(localStorage.getItem(K_PROFILO) || 'null'); if (p) {
      ['capitale', 'mutuo', 'orizzonteMesi', 'strategia', 'prudenza'].forEach(function (k) { var el = $('#stForm [name="' + k + '"]'); if (el && p[k] != null && p[k] !== 0) el.value = p[k]; });
      if (p.regioni && p.regioni[0]) $('#stRegione').value = p.regioni[0];
      if (p.concorrenza) conc.value = Math.round(p.concorrenza * 100);
    } } catch (e) {}
    cursore();
    $('#stForm').addEventListener('submit', function (e) { e.preventDefault(); calcola(); });
    caricaAste();
    if (+$('#stForm [name="capitale"]').value > 0) calcola();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia); else avvia();
})();
