/* Elementi comuni: intestazione, piè di pagina con avvertenza, tema, formattazione, CSV. */
(function (root) {
  'use strict';

  var PAGINE = [
    ['index.html', 'Aste'], ['mappa.html', 'Mappa'], ['calcolatore.html', 'Conviene?'],
    ['mie-aste.html', 'Le mie aste'], ['tariffe.html', 'Tariffe e tasse'], ['fonti.html', 'Fonti']
  ];
  var CATEGORIE = { immobile: 'Immobile', auto: 'Auto', moto: 'Moto', beni: 'Beni mobili' };
  var STATI = { libero: 'Libero', occupato: 'Occupato', nd: 'Non indicato' };
  var TEMI = { auto: 'Tema: auto', light: 'Tema: chiaro', dark: 'Tema: scuro' };

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function eur(n, dec) { n = Number(n); if (!isFinite(n)) return '—'; return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 }); }
  function pct(f, dec) { f = Number(f); if (!isFinite(f)) return '—'; return (f * 100).toLocaleString('it-IT', { maximumFractionDigits: dec == null ? 1 : dec }) + '%'; }
  function dataIt(iso, lunga) {
    if (!iso) return '—';
    var d = new Date(iso + 'T12:00:00');
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('it-IT', lunga ? { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function giorniA(iso) {
    if (!iso) return null;
    var oggi = new Date(); oggi.setHours(0, 0, 0, 0);
    return Math.round((new Date(iso + 'T00:00:00') - oggi) / 86400000);
  }
  function quando(iso) {
    var g = giorniA(iso);
    if (g === null) return '';
    if (g < 0) return 'conclusa';
    if (g === 0) return 'oggi';
    if (g === 1) return 'domani';
    return 'tra ' + g + ' giorni';
  }
  function linkSicuro(u) { return /^https?:\/\//i.test(u || '') ? u : null; }
  function badgeStato(s) {
    return s === 'confermato'
      ? '<span class="pill p-good" title="Riscontrato su fonte ufficiale">confermato</span>'
      : '<span class="pill p-warn" title="Riscontrato solo su fonti secondarie o valore predefinito: verifica">da verificare</span>';
  }
  function toast(msg, durata) {
    var t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, durata || 2600);
  }

  /* Conferma in due tempi sul pulsante stesso (niente confirm(): in alcuni contesti non compare). */
  function conferma(btn, testo, azione) {
    if (btn.dataset.armato === '1') { btn.dataset.armato = ''; azione(); return; }
    var orig = btn.textContent;
    btn.dataset.armato = '1'; btn.textContent = testo;
    setTimeout(function () { if (btn.isConnected && btn.dataset.armato === '1') { btn.dataset.armato = ''; btn.textContent = orig; } }, 4000);
  }

  /* File da salvare: finestra con "Scarica" e, in alternativa, "Copia" (dove i download sono bloccati). */
  function offriFile(nome, contenuto, tipo) {
    var d = document.getElementById('dlgFile');
    if (!d) {
      d = document.createElement('dialog'); d.id = 'dlgFile';
      d.innerHTML = '<div class="dhead"><h2 style="margin:0;font-size:18px" id="dlgFileTitolo"></h2><button class="btn small ghost" type="button" id="dlgFileChiudi">Chiudi</button></div>' +
        '<div class="dbody"><p class="note" style="margin:0" id="dlgFileInfo"></p><div class="row-actions"><a class="btn" id="dlgFileScarica">Scarica il file</a><button class="btn ghost" type="button" id="dlgFileCopia">Copia il contenuto</button></div>' +
        '<p class="note" style="margin:0">Se il download non parte (per esempio quando il sito è aperto dentro Claude), usa "Copia il contenuto" e incollalo in un file di testo.</p></div>';
      document.body.appendChild(d);
      d.querySelector('#dlgFileChiudi').addEventListener('click', function () { d.close(); });
    }
    var url = URL.createObjectURL(new Blob([contenuto], { type: tipo }));
    var a = d.querySelector('#dlgFileScarica'); a.href = url; a.download = nome;
    d.querySelector('#dlgFileTitolo').textContent = nome;
    var byte = new Blob([contenuto]).size;
    d.querySelector('#dlgFileInfo').textContent = byte < 1024 ? byte + ' byte' : (byte / 1024).toLocaleString('it-IT', { maximumFractionDigits: 0 }) + ' KB';
    var c = d.querySelector('#dlgFileCopia');
    c.onclick = function () {
      var ok = function () { toast('Copiato negli appunti'); }, ko = function () { toast('Copia non riuscita: usa "Scarica il file"', 4000); };
      try { navigator.clipboard.writeText(contenuto).then(ok, ko); } catch (e) { ko(); }
    };
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  }

  /* Parametri tra pagine: ?nome=valore, oppure il valore lasciato dal link cliccato
     (attributo data-passa="nome:valore"), utile dove l'indirizzo non conserva la query. */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-passa]');
    if (a) { try { sessionStorage.setItem('radaraste.passa', a.getAttribute('data-passa')); } catch (err) {} }
  }, true);
  function parametro(nome) {
    var v = new URLSearchParams(location.search).get(nome);
    if (v) return v;
    try {
      var p = sessionStorage.getItem('radaraste.passa') || '';
      var i = p.indexOf(':');
      if (i > 0 && p.slice(0, i) === nome) { sessionStorage.removeItem('radaraste.passa'); return p.slice(i + 1); }
    } catch (err) {}
    return null;
  }

  /* ---- Tema ---- */
  function temaCorrente() { try { return localStorage.getItem('radaraste.tema') || 'auto'; } catch (e) { return 'auto'; } }
  function applicaTema(t) {
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('radaraste.tema', t); } catch (e) {}
    var b = $('#themeBtn'); if (b) b.textContent = TEMI[t];
    try { document.dispatchEvent(new CustomEvent('radaraste:tema')); } catch (e) {}
  }

  /* ---- Layout ---- */
  function layout() {
    var qui = location.pathname.split('/').pop() || 'index.html';
    var h = $('#site-header');
    if (h) {
      h.className = 'site-header';
      h.innerHTML = '<div class="wrap">' +
        '<a class="brand" href="index.html"><svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" stroke-width="2" opacity=".35"/><circle cx="16" cy="16" r="8" fill="none" stroke="currentColor" stroke-width="2" opacity=".6"/><path d="M16 16 L27 9" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/><circle cx="16" cy="16" r="2.5" fill="var(--accent)"/></svg>Radar <span>Aste</span> Italia</a>' +
        '<nav class="nav" aria-label="Sezioni">' + PAGINE.map(function (p) {
          return '<a href="' + p[0] + '"' + (p[0] === qui ? ' aria-current="page"' : '') + '>' + p[1] + '</a>';
        }).join('') + '</nav>' +
        '<button class="theme-btn" id="themeBtn" type="button" aria-label="Cambia tema (automatico, chiaro, scuro)"></button></div>';
      $('#themeBtn').addEventListener('click', function () {
        var ord = ['auto', 'light', 'dark']; applicaTema(ord[(ord.indexOf(temaCorrente()) + 1) % 3]);
      });
      applicaTema(temaCorrente());
    }
    var f = $('#site-footer');
    if (f) {
      var agg = root.TARIFFE ? dataIt(root.TARIFFE.aggiornamento) : '';
      f.className = 'site-footer';
      f.innerHTML = '<div class="wrap">' + avvertenza() +
        '<div>Radar Aste Italia · aliquote aggiornate al ' + esc(agg) + ' (file <code>config/tariffe.js</code>) · I dati delle aste restano salvati in questo browser.</div></div>';
    }
  }
  function avvertenza() {
    return '<div class="disclaimer" role="note"><strong>Calcoli indicativi.</strong> Le stime di Radar Aste Italia sono orientative e non sostituiscono il parere di un notaio, di un avvocato o di un commercialista. Verifica sempre l\'avviso di vendita, la perizia e le aliquote in vigore prima di fare un\'offerta.</div>';
  }

  /* ---- Select comuni ---- */
  function opzioniRegioni(sel, conTutte) {
    sel.innerHTML = (conTutte ? '<option value="">Tutte le regioni</option>' : '<option value="">—</option>') +
      root.GEO.regioni.map(function (r) { return '<option>' + esc(r) + '</option>'; }).join('');
  }
  function opzioniProvince(sel, regione, conTutte) {
    var v = sel.value;
    sel.innerHTML = (conTutte ? '<option value="">Tutte le province</option>' : '<option value="">—</option>') +
      root.GEO.provinceDi(regione).map(function (p) { return '<option value="' + p.sigla + '">' + esc(p.nome) + ' (' + p.sigla + ')</option>'; }).join('');
    if (v && sel.querySelector('option[value="' + v + '"]')) sel.value = v;
  }

  /* ---- CSV ---- */
  function csvParse(testo) {
    testo = testo.replace(/^﻿/, '');
    var primaRiga = testo.split(/\r?\n/)[0] || '';
    var sep = (primaRiga.match(/;/g) || []).length > (primaRiga.match(/,/g) || []).length ? ';' : ',';
    var righe = [], riga = [], campo = '', q = false;
    for (var i = 0; i < testo.length; i++) {
      var c = testo[i];
      if (q) {
        if (c === '"') { if (testo[i + 1] === '"') { campo += '"'; i++; } else q = false; }
        else campo += c;
      } else if (c === '"') q = true;
      else if (c === sep) { riga.push(campo); campo = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && testo[i + 1] === '\n') i++; riga.push(campo); righe.push(riga); riga = []; campo = ''; }
      else campo += c;
    }
    if (campo || riga.length) { riga.push(campo); righe.push(riga); }
    righe = righe.filter(function (r) { return r.some(function (x) { return x.trim() !== ''; }); });
    if (!righe.length) return [];
    var intest = righe.shift().map(function (h) { return h.trim(); });
    return righe.map(function (r) { var o = {}; intest.forEach(function (h, j) { o[h] = (r[j] || '').trim(); }); return o; });
  }
  function csvStringify(lista, campi) {
    function cella(v) { v = v == null ? '' : String(v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    return '﻿' + [campi.join(';')].concat(lista.map(function (o) { return campi.map(function (c) { return cella(o[c]); }).join(';'); })).join('\n');
  }
  function scarica(nome, contenuto, tipo) {
    var url = URL.createObjectURL(new Blob([contenuto], { type: tipo }));
    var a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
  }
  function leggiFile(file) {
    return new Promise(function (ok, ko) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = ko; r.readAsText(file); });
  }

  root.UI = {
    $: $, $$: $$, esc: esc, eur: eur, pct: pct, dataIt: dataIt, giorniA: giorniA, quando: quando,
    linkSicuro: linkSicuro, badgeStato: badgeStato, toast: toast, conferma: conferma, offriFile: offriFile, parametro: parametro, layout: layout, avvertenza: avvertenza,
    opzioniRegioni: opzioniRegioni, opzioniProvince: opzioniProvince,
    csvParse: csvParse, csvStringify: csvStringify, scarica: scarica, leggiFile: leggiFile,
    CATEGORIE: CATEGORIE, STATI: STATI
  };
  document.addEventListener('DOMContentLoaded', layout);

  // App installabile e funzionamento offline (dove il browser lo consente)
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
})(window);
