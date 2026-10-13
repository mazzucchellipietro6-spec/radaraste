/* Elementi comuni: intestazione, piè di pagina con avvertenza, tema, formattazione, CSV. */
(function (root) {
  'use strict';

  var CATEGORIE = { immobile: 'Immobile', auto: 'Auto', moto: 'Moto', beni: 'Beni mobili' };
  var STATI = { libero: 'Libero', occupato: 'Occupato', nd: 'Non indicato' };

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
  // data di oggi (o di d) nel fuso del browser, AAAA-MM-GG: è quella che l'utente vede sul calendario
  function oggi(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
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
  var ICONA_TEMA = { auto: 'automatico', light: 'sole', dark: 'luna' };
  var NOME_TEMA = { auto: 'automatico', light: 'chiaro', dark: 'scuro' };
  function temaCorrente() { try { return localStorage.getItem('radaraste.tema') || 'auto'; } catch (e) { return 'auto'; } }
  var COLORE_BARRA = { light: '#f7f5f0', dark: '#111318' };
  // colore della barra del browser: segue il tema scelto (in automatico decidono i media dei meta)
  function coloreBarra(t) {
    $$('meta[name="theme-color"]').forEach(function (m) {
      if (m.dataset.media === undefined) { m.dataset.media = m.getAttribute('media') || ''; m.dataset.colore = m.getAttribute('content') || ''; }
      if (t === 'auto') { if (m.dataset.media) m.setAttribute('media', m.dataset.media); m.setAttribute('content', m.dataset.colore); }
      else { m.removeAttribute('media'); m.setAttribute('content', COLORE_BARRA[t]); }
    });
  }
  function applicaTema(t) {
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    coloreBarra(t);
    try { localStorage.setItem('radaraste.tema', t); } catch (e) {}
    $$('.theme-btn').forEach(function (b) { b.innerHTML = icona(ICONA_TEMA[t]); b.setAttribute('aria-label', 'Tema ' + NOME_TEMA[t] + ': cambia tema'); b.title = 'Tema ' + NOME_TEMA[t]; });
    try { document.dispatchEvent(new CustomEvent('radaraste:tema')); } catch (e) {}
  }
  function ciclaTema() { var ord = ['auto', 'light', 'dark']; applicaTema(ord[(ord.indexOf(temaCorrente()) + 1) % 3]); toast('Tema ' + NOME_TEMA[temaCorrente()]); }
  function icona(n, cls) { return root.Icone ? root.Icone.svg(n, cls) : ''; }

  /* ---- Struttura del sito: intestazione, barra in basso, foglio "Menu", piè di pagina ----
   * Sei sezioni, sempre nello stesso ordine: Home, Aste, Mappa, Assistenti, Strumenti, Le mie aste.
   * Assistenti e Strumenti hanno una pagina indice e, su computer, una tendina con le loro pagine. */
  var ASSISTENTI = [
    { href: 'affari.html', nome: 'Cacciatore di affari', nota: 'I migliori affari di oggi, con rischi e offerta massima', icona: 'mirino' },
    { href: 'consulente.html', nome: 'Consulente d\'asta', nota: 'Chiedi in italiano: cerca, filtra e calcola per te', icona: 'chat' },
    { href: 'stratega.html', nome: 'Stratega d\'asta', nota: 'Su quali aste puntare con il tuo capitale', icona: 'percorso' },
    { href: 'combinazioni.html', nome: 'Combinazioni d\'oro', nota: 'Lotti che insieme valgono più che separati', icona: 'combinazioni' },
    { href: 'arricchimento.html', nome: 'Agente di arricchimento', nota: 'Dettagli e storico letti ogni giorno dagli avvisi', icona: 'livelli' }
  ];
  var STRUMENTI = [
    { href: 'calcolatore.html', nome: 'Calcolatore "Conviene?"', nota: 'Costo totale, sconto e offerta massima', icona: 'calcolo' },
    { href: 'mutuo.html', nome: 'Simulatore mutuo', nota: 'Rata, budget e quanto puoi permetterti', icona: 'mutuo' },
    { href: 'confronta.html', nome: 'Confronta aste', nota: 'Fino a 3 aste fianco a fianco', icona: 'confronta' },
    { href: 'guida.html', nome: 'Guida all\'asta', nota: 'Come si partecipa, passo per passo', icona: 'guida' },
    { href: 'tariffe.html', nome: 'Tariffe e tasse', nota: 'Aliquote con fonte e data', icona: 'tasse' },
    { href: 'fonti.html', nome: 'Fonti dei dati', nota: 'Da dove arrivano le aste e quando', icona: 'fonti' }
  ];
  var NAV = [
    { href: 'index.html', nome: 'Home', icona: 'home' },
    { href: 'aste.html', nome: 'Aste', icona: 'lista', anche: ['scheda.html'] },
    { href: 'mappa.html', nome: 'Mappa', icona: 'mappa' },
    { href: 'assistenti.html', nome: 'Assistenti', icona: 'assistenti', voci: ASSISTENTI },
    { href: 'strumenti.html', nome: 'Strumenti', icona: 'strumenti', voci: STRUMENTI },
    { href: 'mie-aste.html', nome: 'Le mie aste', icona: 'stella' }
  ];
  // su telefono: le prime quattro sezioni nella barra in basso, il resto nel foglio "Menu"
  var TAB = ['index.html', 'aste.html', 'mappa.html', 'assistenti.html'];
  var MARCHIO = '<svg class="marchio" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="var(--accent)"/><circle cx="16" cy="16" r="9.5" fill="none" stroke="var(--accent-ink)" stroke-opacity=".45" stroke-width="1.4"/><circle cx="16" cy="16" r="5" fill="none" stroke="var(--accent-ink)" stroke-opacity=".75" stroke-width="1.4"/><path d="M16 16 L23.5 11" stroke="var(--accent-ink)" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="16" r="1.8" fill="var(--accent-ink)"/></svg>';

  function paginaCorrente() { return location.pathname.split('/').pop() || 'index.html'; }
  // la sezione a cui appartiene la pagina aperta (la scheda di un'asta sta sotto "Aste", il calcolatore sotto "Strumenti"…)
  function sezioneDi(pagina) {
    for (var i = 0; i < NAV.length; i++) {
      var n = NAV[i];
      if (n.href === pagina || (n.anche || []).indexOf(pagina) >= 0 || (n.voci || []).some(function (v) { return v.href === pagina; })) return n.href;
    }
    return null;
  }
  function voceElenco(v, qui) {
    return '<a href="' + v.href + '"' + (v.href === qui ? ' aria-current="page"' : '') + '>' + icona(v.icona) + '<span>' + esc(v.nome) + '<small>' + esc(v.nota) + '</small></span></a>';
  }

  function layout() {
    var qui = paginaCorrente(), sez = sezioneDi(qui);
    var h = $('#site-header');
    if (h) {
      h.className = 'site-header';
      h.innerHTML = '<div class="wrap">' +
        '<a class="brand" href="index.html" aria-label="Radar Aste Italia, pagina iniziale">' + MARCHIO + '<span>Radar <b>Aste</b></span></a>' +
        '<nav class="nav" aria-label="Sezioni">' + NAV.map(function (p) {
          var corrente = p.href === sez ? ' aria-current="' + (p.href === qui ? 'page' : 'true') + '"' : '';
          var link = '<a href="' + p.href + '"' + corrente + '>' + icona(p.icona) + '<span>' + p.nome + '</span></a>';
          if (!p.voci) return link;
          return '<div class="nav-gruppo">' + link + '<div class="tendina"><div class="tendina-corpo">' +
            p.voci.map(function (v) { return voceElenco(v, qui); }).join('') +
            '<a class="tutte" href="' + p.href + '">Tutti gli ' + p.nome.toLowerCase() + ' →</a></div></div></div>';
        }).join('') + '</nav>' +
        '<button class="cerca-btn" type="button" data-cerca aria-label="Cerca aste, comuni, tribunali">' + icona('cerca') + '<span class="testo">Cerca comune, tribunale, asta…</span><kbd>/</kbd></button>' +
        '<button class="theme-btn" type="button"></button></div>';
    }
    // barra in basso (visibile su telefono)
    if (!$('.tabbar')) {
      var tab = document.createElement('nav'); tab.className = 'tabbar'; tab.setAttribute('aria-label', 'Navigazione');
      var nelMenu = sez && TAB.indexOf(sez) < 0;
      tab.innerHTML = NAV.filter(function (p) { return TAB.indexOf(p.href) >= 0; }).map(function (p) {
        return '<a href="' + p.href + '"' + (p.href === sez ? ' aria-current="' + (p.href === qui ? 'page' : 'true') + '"' : '') + '>' + icona(p.icona) + '<span>' + p.nome + '</span></a>';
      }).join('') + '<button type="button" data-altro aria-haspopup="dialog"' + (nelMenu ? ' aria-current="true"' : '') + '>' + icona('menu') + '<span>Menu</span></button>';
      document.body.appendChild(tab);
      aggiornaSeguite();
    }
    var f = $('#site-footer');
    if (f) {
      var agg = root.TARIFFE ? dataIt(root.TARIFFE.aggiornamento) : '';
      var col = function (titolo, voci) { return '<div><h3>' + titolo + '</h3><ul>' + voci.map(function (v) { return '<li><a href="' + v.href + '">' + esc(v.nome) + '</a></li>'; }).join('') + '</ul></div>'; };
      f.className = 'site-footer';
      f.innerHTML = '<div class="wrap">' +
        '<div class="piede-colonne">' +
          '<div class="piede-marchio"><a class="brand" href="index.html">' + MARCHIO + '<span>Radar <b>Aste</b></span></a><p>Le aste pubbliche italiane raccolte ogni giorno dalle fonti ufficiali, con i conti fatti in chiaro.</p></div>' +
          col('Sezioni', NAV.filter(function (p) { return !p.voci; })) + col('Assistenti', ASSISTENTI) + col('Strumenti', STRUMENTI) +
        '</div>' + avvertenza() +
        '<div class="row-actions piede-link"><span>Aliquote aggiornate al ' + esc(agg) + '</span><span class="spacer"></span><span>Dati personali solo in questo browser · nessun dato inventato</span></div></div>';
    }
    applicaTema(temaCorrente());
    $$('.theme-btn').forEach(function (b) { b.addEventListener('click', ciclaTema); });
    animazioniDiPagina();
  }

  /* ---- Finestre sovrapposte (ricerca, foglio "Altro", filtri su telefono) ----
   * Aperte: il fuoco resta dentro (Tab e Maiusc+Tab girano tra i loro controlli), Esc le chiude da qualunque punto,
   * alla chiusura il fuoco torna al pulsante che le ha aperte. Chiuse: attributo inert (e visibility:hidden nel CSS),
   * quindi il Tab non le raggiunge. */
  var pila = [];
  var FOCUSABILI = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
  function focusabili(el) {
    return $$(FOCUSABILI, el).filter(function (x) { return x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden' && !x.closest('[inert]'); });
  }
  // el: contenitore della finestra; chiudi: funzione che la chiude (chiamata da Esc)
  function finestra(el, chiudi, etichetta) {
    if (!el.hasAttribute('role')) el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    if (etichetta) el.setAttribute('aria-label', etichetta);
    el._chiudi = chiudi;
    if (pila.indexOf(el) < 0) { el.inert = true; el.setAttribute('inert', ''); }
  }
  function apriFinestra(el, primo) {
    if (pila.indexOf(el) >= 0) return;
    var att = document.activeElement;
    el._prima = att && att !== document.body ? att : null;
    el.inert = false; el.removeAttribute('inert'); pila.push(el);
    var f = primo || focusabili(el)[0];
    if (f) { try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } }
  }
  function chiudiFinestra(el, restaQui) {
    var i = pila.indexOf(el); if (i < 0) return;
    pila.splice(i, 1); el.inert = true; el.setAttribute('inert', '');
    var p = el._prima; el._prima = null;
    if (!restaQui && p && p.focus && document.contains(p)) { try { p.focus({ preventScroll: true }); } catch (e) { p.focus(); } }
  }
  function finestraAperta() { return pila[pila.length - 1] || null; }
  document.addEventListener('keydown', function (e) {
    var top = finestraAperta(); if (!top) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (top._chiudi) top._chiudi(); return; }
    if (e.key !== 'Tab') return;
    var f = focusabili(top);
    if (!f.length) { e.preventDefault(); return; }
    var i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && (i < 0 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
  }, true);
  document.addEventListener('focusin', function (e) {
    var top = finestraAperta();
    if (top && !top.contains(e.target)) { var f = focusabili(top)[0]; if (f) f.focus(); }
  });

  // foglio dal basso con il menu completo (su telefono); si chiude toccando fuori, con Esc o trascinandolo giù
  function apriAltro() {
    var d = $('#foglioAltro'), qui = paginaCorrente();
    if (!d) {
      d = document.createElement('div'); d.id = 'foglioAltro'; d.className = 'foglio';
      d.innerHTML = '<div class="corpo"><div class="maniglia" aria-hidden="true"></div><div class="testa-foglio"><h2>Menu</h2><button class="btn small quiet" type="button" data-chiudi>Chiudi</button></div>' +
        '<div class="voci">' + voceElenco({ href: 'mie-aste.html', nome: 'Le mie aste', nota: 'Le aste che segui, con note e promemoria', icona: 'stella' }, qui) + '</div>' +
        '<h3 class="foglio-titolo"><a href="assistenti.html">Assistenti</a></h3><div class="voci">' + ASSISTENTI.map(function (v) { return voceElenco(v, qui); }).join('') + '</div>' +
        '<h3 class="foglio-titolo"><a href="strumenti.html">Strumenti</a></h3><div class="voci">' + STRUMENTI.map(function (v) { return voceElenco(v, qui); }).join('') + '</div>' +
        '<div class="voci"><button type="button" data-tema>' + icona('luna') + '<span>Cambia tema<small>Automatico, chiaro o scuro</small></span></button></div></div>';
      document.body.appendChild(d);
      finestra(d, function () { chiudiFoglio(d); }, 'Menu');
      d.addEventListener('click', function (e) { if (e.target === d || e.target.closest('[data-chiudi]')) chiudiFoglio(d); if (e.target.closest('[data-tema]')) ciclaTema(); });
      trascinaPerChiudere(d);
      aggiornaSeguite();
    }
    void d.offsetWidth; // così la comparsa si anima anche la prima volta
    d.setAttribute('data-aperto', '');
    apriFinestra(d);
  }
  function chiudiFoglio(d) { d.removeAttribute('data-aperto'); d.querySelector('.corpo').style.removeProperty('--trascina'); chiudiFinestra(d); }
  function trascinaPerChiudere(d) {
    var corpo = d.querySelector('.corpo'), y0 = null, dy = 0;
    corpo.addEventListener('touchstart', function (e) { if (corpo.scrollTop > 0) return; y0 = e.touches[0].clientY; dy = 0; corpo.style.transition = 'none'; }, { passive: true });
    corpo.addEventListener('touchmove', function (e) { if (y0 === null) return; dy = Math.max(0, e.touches[0].clientY - y0); corpo.style.setProperty('--trascina', dy + 'px'); }, { passive: true });
    corpo.addEventListener('touchend', function () { if (y0 === null) return; corpo.style.transition = ''; y0 = null; if (dy > 90) chiudiFoglio(d); else corpo.style.setProperty('--trascina', '0px'); });
  }

  // comparsa discreta delle sezioni durante lo scorrimento (nessuna animazione con "riduci movimento", vedi CSS)
  var menoMovimento = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  function animazioniDiPagina() { osservaComparsa(document); }
  // numero delle aste seguite sul pulsante "Menu" della barra in basso e sulla voce "Le mie aste", aggiornato appena cambia
  // (anche da un'altra scheda del browser)
  function aggiornaSeguite() {
    var n = 0;
    try { n = root.Store ? root.Store.seguite().length : JSON.parse(localStorage.getItem('radaraste.v1.seguite') || '[]').length; } catch (e) {}
    $$('.tabbar [data-altro], .foglio a[href="mie-aste.html"], .nav a[href="mie-aste.html"]').forEach(function (a) {
      var b = a.querySelector('.badge');
      if (!n) { if (b) b.remove(); if (a.matches('[data-altro]')) a.removeAttribute('aria-label'); return; }
      if (!b) { b = document.createElement('span'); b.className = 'badge'; b.setAttribute('aria-hidden', 'true'); a.appendChild(b); }
      b.textContent = n > 99 ? '99+' : n;
      if (a.matches('[data-altro]')) a.setAttribute('aria-label', 'Menu (segui ' + n + (n === 1 ? ' asta' : ' aste') + ')');
    });
  }
  document.addEventListener('radaraste:seguite', aggiornaSeguite);
  root.addEventListener('storage', function (e) { if (!e.key || e.key === 'radaraste.v1.seguite') aggiornaSeguite(); });
  var osservatore = 'IntersectionObserver' in root ? new IntersectionObserver(function (voci) {
    voci.forEach(function (v) { if (v.isIntersecting) { v.target.classList.add('vista'); osservatore.unobserve(v.target); } });
  }, { rootMargin: '0px 0px -8% 0px' }) : null;
  function osservaComparsa(ctx) {
    $$('.rivela:not(.vista)', ctx).forEach(function (el) { if (osservatore) osservatore.observe(el); else el.classList.add('vista'); });
  }

  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('[data-altro]')) apriAltro();
    if (e.target.closest && e.target.closest('[data-cerca]') && root.Cerca) root.Cerca.apri();
  });
  document.addEventListener('keydown', function (e) {
    var dig = e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
    if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !dig)) { if (root.Cerca) { e.preventDefault(); root.Cerca.apri(); } }
  });

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
    $: $, $$: $$, esc: esc, eur: eur, pct: pct, dataIt: dataIt, giorniA: giorniA, quando: quando, oggi: oggi,
    linkSicuro: linkSicuro, badgeStato: badgeStato, toast: toast, conferma: conferma, offriFile: offriFile, parametro: parametro, layout: layout, avvertenza: avvertenza,
    icona: icona, osservaComparsa: osservaComparsa, apriAltro: apriAltro, aggiornaSeguite: aggiornaSeguite, NAV: NAV, ASSISTENTI: ASSISTENTI, STRUMENTI: STRUMENTI,
    finestra: finestra, apriFinestra: apriFinestra, chiudiFinestra: chiudiFinestra, focusabili: focusabili, menoMovimento: function () { return menoMovimento.matches; },
    opzioniRegioni: opzioniRegioni, opzioniProvince: opzioniProvince,
    csvParse: csvParse, csvStringify: csvStringify, scarica: scarica, leggiFile: leggiFile,
    CATEGORIE: CATEGORIE, STATI: STATI
  };
  // intestazione, barra in basso e piè di pagina compaiono subito, anche mentre si scaricano i dati delle aste
  var avviato = false;
  function avvia() { if (avviato) return; avviato = true; layout(); }
  if (document.getElementById('site-footer')) avvia(); else document.addEventListener('DOMContentLoaded', avvia);

  // App installabile e funzionamento offline (dove il browser lo consente)
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
})(window);
