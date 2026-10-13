/* Pagina "Scheda dell'asta": tutto su un'asta, da scheda.html?id=… (o dal link cliccato, data-passa).
 * I dati arrivano da js/asta.js (scheda a pezzi, poi elenco completo solo se serve). Ogni dato assente
 * è dichiarato ("non indicato nell'avviso" se l'avviso è stato letto, "non ancora disponibile" altrimenti). */
(function () {
  'use strict';
  var U = window.UI, S = window.Store, C = window.Calcoli, T = window.TARIFFE, A = window.Asta, E = window.Estrai, $ = U.$;
  var ICONE = { immobile: 'casa', auto: 'auto', moto: 'moto', beni: 'beni' };
  var DEMANIO = 'Agenzia del Demanio';
  var SMIN = -0.10, SMAX = 0.50; // scala del tachimetro (sconto sul valore)
  var stato = { a: null, r: null, offerta: null };

  /* ---------- utilità ---------- */

  function esc(s) { return U.esc(s); }
  function letto(a) { return !!(a.letto || a.dettaglio || a.origine === 'manuale'); }
  function nd(a, cosa) {
    return '<span class="sc-nd">' + (cosa || (letto(a) ? 'non indicato nell\'avviso' : 'non ancora disponibile')) + '</span>';
  }
  function maiuscola(t) { t = String(t || ''); return t.charAt(0).toUpperCase() + t.slice(1); }
  function mq(n) { return Number(n).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' m²'; }
  function cat(a) { return ICONE[a.categoria] ? a.categoria : 'beni'; }
  function esterno(url, testo, cls) {
    var u = U.linkSicuro(url);
    return u ? '<a class="' + (cls || '') + '" href="' + esc(u) + '" target="_blank" rel="noopener">' + testo + ' <span aria-hidden="true">↗</span><span class="sr-only"> (si apre in una nuova scheda)</span></a>' : '';
  }

  var istante = A.istante, oraDi = A.oraDi;
  function quandoEsteso(data, ora) {
    if (!data) return '';
    var h = oraDi(data, ora);
    return U.dataIt(String(data).slice(0, 10), true) + (h ? ', ore ' + h : '');
  }
  // testo del conto alla rovescia
  function conto(t, ora) {
    var d = t - Date.now();
    if (d <= 0) return d > -6 * 3600000 && ora ? 'iniziata da poco' : 'conclusa';
    var g = Math.floor(d / 86400000), h = Math.floor(d % 86400000 / 3600000), m = Math.floor(d % 3600000 / 60000), s = Math.floor(d % 60000 / 1000);
    if (g >= 2) return 'tra ' + g + ' giorni' + (h ? ' e ' + h + (h === 1 ? ' ora' : ' ore') : '');
    if (g === 1) return 'tra 1 giorno e ' + h + (h === 1 ? ' ora' : ' ore');
    if (h >= 1) return 'tra ' + h + ' h ' + String(m).padStart(2, '0') + ' min';
    return 'tra ' + m + ' min ' + String(s).padStart(2, '0') + ' s';
  }
  function blocchiConto(t) {
    var d = Math.max(0, t - Date.now());
    var g = Math.floor(d / 86400000), h = Math.floor(d % 86400000 / 3600000), m = Math.floor(d % 3600000 / 60000), s = Math.floor(d % 60000 / 1000);
    var b = g >= 1 ? [[g, g === 1 ? 'giorno' : 'giorni'], [h, 'ore'], [m, 'min']] : [[h, 'ore'], [m, 'min'], [s, 'sec']];
    return b.map(function (x) { return '<span><b>' + String(x[0]).padStart(2, '0') + '</b>' + x[1] + '</span>'; }).join('');
  }
  function aggiornaConti() {
    U.$$('[data-conto]').forEach(function (el) {
      var t = +el.dataset.conto, testo = el.dataset.blocchi ? blocchiConto(t) : conto(t, el.dataset.ora);
      if (el.dataset.blocchi && t <= Date.now()) { el.closest('.sc-conto-box') && (el.closest('.sc-conto-box').hidden = true); return; }
      if (el._ultimo !== testo) { el._ultimo = testo; el.innerHTML = testo; }
    });
  }

  /* ---------- testa: galleria, titolo, prezzi, azioni ---------- */

  function copertina(a, messaggio) {
    var c = cat(a), dove = window.Schede ? Schede.luogoBreve(a) : (a.comune || '');
    var avviso = U.linkSicuro(a.linkAvviso);
    return '<div class="sc-copertina" data-cat="' + c + '">' + U.icona(ICONE[c], 'sc-cop-icona') +
      (messaggio ? '<p class="sc-cop-msg">' + messaggio + '</p>' + (avviso ? '<a class="btn sc-cop-btn" href="' + esc(avviso) + '" target="_blank" rel="noopener">Apri l\'avviso <span aria-hidden="true">↗</span></a>' : '')
        : '<p class="sc-cop-luogo">' + U.icona('luogo') + '<span>' + esc(dove || 'Luogo non indicato') + '</span></p>' +
          '<p class="sc-cop-nota">' + (a.nFoto === 0 || letto(a) ? 'Nessuna foto pubblicata con l\'avviso' : 'Foto non ancora disponibili qui') + '</p>') + '</div>';
  }

  function galleria(a) {
    var foto = (Array.isArray(a.foto) ? a.foto : []).map(U.linkSicuro).filter(Boolean);
    if (!foto.length) return '<div class="sc-galleria vuota">' + copertina(a) + '</div>';
    var n = foto.length, tot = a.fotoTotali > n ? a.fotoTotali : n;
    return '<div class="sc-galleria" data-n="' + n + '" role="region" aria-roledescription="galleria" aria-label="Foto dell\'asta: ' + n + (n === 1 ? ' immagine' : ' immagini') + '">' +
      '<div class="sc-foto" tabindex="0" aria-label="Scorri le foto">' + foto.map(function (u, i) {
        return '<figure data-i="' + i + '"><img src="' + esc(u) + '" alt="Foto ' + (i + 1) + ' di ' + n + ' dell\'asta" loading="lazy" decoding="async" referrerpolicy="no-referrer"></figure>';
      }).join('') + '</div>' +
      (n > 1 ? '<button class="sc-freccia prec" type="button" aria-label="Foto precedente" disabled>' + U.icona('indietro') + '</button>' +
        '<button class="sc-freccia succ" type="button" aria-label="Foto successiva">' + U.icona('freccia') + '</button>' : '') +
      '<span class="sc-contatore" aria-live="polite"><b>1</b> / ' + n + (tot > n ? ' · ' + tot + ' nell\'avviso' : '') + '</span></div>';
  }

  function attivaGalleria(a) {
    var g = $('.sc-galleria[data-n]'); if (!g) return;
    var striscia = $('.sc-foto', g), n = +g.dataset.n, caricate = 0;
    g.addEventListener('load', function (e) { if (e.target.tagName === 'IMG') caricate++; }, true);
    g.addEventListener('error', function (e) {
      if (e.target.tagName !== 'IMG' || !g.isConnected) return; // galleria già sostituita dalla copertina
      var fig = e.target.closest('figure');
      // la prima foto non si carica e nessun'altra è arrivata: il server delle foto non è raggiungibile da qui
      if (!caricate) { g.outerHTML = '<div class="sc-galleria vuota">' + copertina(a, 'Foto non disponibili qui: aprile dall\'avviso') + '</div>'; return; }
      fig.classList.add('rotta');
      fig.innerHTML = '<div class="sc-foto-rotta">' + U.icona('allerta') + '<span>Questa foto non si apre: guardala nell\'avviso</span></div>';
    }, true);
    if (n < 2) return;
    var prec = $('.prec', g), succ = $('.succ', g), num = $('.sc-contatore b', g);
    function corrente() { return Math.round(striscia.scrollLeft / Math.max(1, striscia.clientWidth)); }
    function vai(i) { striscia.scrollTo({ left: Math.max(0, Math.min(n - 1, i)) * striscia.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
    var t;
    striscia.addEventListener('scroll', function () {
      clearTimeout(t);
      t = setTimeout(function () { var i = corrente(); num.textContent = i + 1; prec.disabled = i <= 0; succ.disabled = i >= n - 1; }, 60);
    }, { passive: true });
    prec.addEventListener('click', function () { vai(corrente() - 1); });
    succ.addEventListener('click', function () { vai(corrente() + 1); });
    striscia.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); vai(corrente() + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); vai(corrente() - 1); }
    });
  }

  function pills(a) {
    var g = U.giorniA(a.dataAsta), h = '';
    h += '<span class="pill p-info">' + U.icona(ICONE[cat(a)]) + esc(U.CATEGORIE[a.categoria] || 'Altro') + '</span>';
    if (window.Schede) h += Schede.statoPill(a);
    if (g !== null && g < 0) h += '<span class="pill p-neutral">Conclusa</span>';
    else if (a.pubblicata && U.giorniA(a.pubblicata) >= -2) h += '<span class="pill p-signal">Nuova</span>';
    if (a.prezzoPrecedente > a.prezzoBase) h += '<span class="pill p-good" title="Prezzo base sceso rispetto alla raccolta precedente">Ribassata</span>';
    if (a.tipo) h += '<span class="tag">' + esc(a.tipo) + '</span>';
    if (a._origine === 'manuale') h += '<span class="tag" title="Copiata da te da un avviso">inserita da te</span>';
    if (a._origine === 'copia') h += '<span class="tag" title="L\'asta non è più nell\'elenco raccolto: mostro la copia salvata quando hai iniziato a seguirla">copia salvata · non più in elenco</span>';
    return h;
  }

  function righeLuogo(a) {
    var dove = window.Schede ? Schede.luogoBreve(a) : a.comune;
    var ind = a.indirizzo && a.comune && a.indirizzo.indexOf(a.comune) >= 0 ? a.indirizzo : [a.indirizzo, dove].filter(Boolean).join(', ');
    var ente = a.fonte === DEMANIO ? 'Agenzia del Demanio' : a.tribunale ? 'Tribunale di ' + a.tribunale : (a.fonte || '');
    var proc = [ente, a.rge ? 'procedura n. ' + a.rge : '', a.numeroLotto ? 'lotto ' + a.numeroLotto : ''].filter(Boolean).join(' · ');
    var vendita = [a.tipoVendita ? 'Vendita ' + String(a.tipoVendita).toLowerCase() : '', a.modalita ? 'modalità ' + String(a.modalita).toLowerCase() : ''].filter(Boolean).join(' · ');
    return '<ul class="sc-luogo">' +
      '<li>' + U.icona('luogo') + '<span>' + (ind || dove ? esc(ind || dove) : nd(a, 'luogo non indicato')) + (a.regione ? ' <span class="muted">· ' + esc(a.regione) + '</span>' : '') + '</span></li>' +
      '<li>' + U.icona('tribunale') + '<span>' + (proc ? esc(proc) : nd(a)) + '</span></li>' +
      '<li>' + U.icona('martello') + '<span>' + (vendita ? esc(maiuscola(vendita)) : 'Tipo di vendita: ' + nd(a)) + (a.rito ? ' <span class="muted">· ' + esc(a.rito) + '</span>' : '') + '</span></li>' +
      '</ul>';
  }

  function bloccoPrezzo(a, r) {
    var dem = a.fonte === DEMANIO, t = istante(a.dataAsta, a.ora), futura = t && t > Date.now();
    var base = r.prezzoBase ? '<b class="sc-grande">' + U.eur(r.prezzoBase) + '</b>'
      : '<b class="sc-grande sc-grande-nd">' + (dem ? 'Nel PDF dell\'avviso' : 'Non indicato') + '</b>';
    return '<div class="sc-prezzo">' +
      '<div class="sc-prezzi"><div><span class="sc-et">Prezzo base</span>' + base + '</div>' +
      '<div><span class="sc-et">Offerta minima</span><b class="sc-medio">' + (r.offertaMinima ? U.eur(r.offertaMinima) : '—') + '</b></div></div>' +
      (futura ? '<div class="sc-conto-box"><span class="sc-et">' + (dem ? 'Mancano al termine per le offerte' : 'Mancano all\'asta') + '</span><div class="sc-conto" data-conto="' + t + '" data-blocchi="1" aria-hidden="true">' + blocchiConto(t) + '</div>' +
        '<span class="sr-only">' + esc(conto(t, a.ora)) + '</span></div>' : '') +
      '<p class="sc-quando">' + U.icona('calendario') + '<span>' + (a.dataAsta ? (dem ? 'Offerte entro ' : 'Asta ') + esc(quandoEsteso(a.dataAsta, a.ora)) : 'Data ' + nd(a)) + '</span></p>' +
      '</div>';
  }

  function azioni(a) {
    var avviso = U.linkSicuro(a.linkAvviso);
    return '<div class="sc-azioni">' +
      (avviso ? '<a class="btn" href="' + esc(avviso) + '" target="_blank" rel="noopener">' + U.icona('esterno') + 'Avviso originale<span class="sr-only"> (si apre in una nuova scheda)</span></a>' : '') +
      '<button class="btn ghost" type="button" data-azione="segui" aria-pressed="false">' + U.icona('stella') + '<span>Segui</span></button>' +
      '<button class="btn ghost" type="button" data-azione="confronta" aria-pressed="false">' + U.icona('confronta') + '<span>Confronta</span></button>' +
      '<button class="btn ghost" type="button" data-azione="condividi">' + U.icona('freccia') + '<span>Condividi</span></button>' +
      (a.dataAsta && window.Calendario ? '<button class="btn ghost" type="button" data-azione="calendario">' + U.icona('calendario') + '<span>Promemoria</span></button>' : '') +
      '</div><div class="sc-azioni sc-azioni-2">' +
      '<a class="btn quiet small" href="consulente.html?q=' + encodeURIComponent('spiegami l\'asta ' + a.id) + '">' + U.icona('chat') + 'Chiedi al consulente</a>' +
      (a.categoria === 'immobile' ? '<a class="btn quiet small" href="mutuo.html?id=' + encodeURIComponent(a.id) + '" data-passa="id:' + esc(a.id) + '">' + U.icona('mutuo') + 'Posso permettermela?</a>' : '') +
      '</div>';
  }
  function aggiornaAzioni() {
    var a = stato.a; if (!a) return;
    var seg = !!S.seguita(a.id), conf = window.Confronto && Confronto.ha(a.id);
    var bs = $('[data-azione="segui"]'), bc = $('[data-azione="confronta"]');
    if (bs) { bs.setAttribute('aria-pressed', String(seg)); $('span', bs).textContent = seg ? 'Seguita' : 'Segui'; }
    if (bc) { bc.setAttribute('aria-pressed', String(!!conf)); $('span', bc).textContent = conf ? 'Nel confronto' : 'Confronta'; }
  }

  function testa(a, r) {
    return '<section class="sc-hero" aria-labelledby="h-titolo">' + galleria(a) +
      '<div class="sc-testa"><div class="sc-pill">' + pills(a) + '</div>' +
      '<h1 id="h-titolo">' + esc(a.titolo || 'Asta senza titolo') + '</h1>' + righeLuogo(a) + bloccoPrezzo(a, r) + azioni(a) + '</div></section>';
  }

  function indiceSezioni(r) {
    var v = [['sez-numeri', 'Prezzi e date'], ['sez-punteggio', 'Punteggio'], ['sez-costi', 'Costi'], ['sez-simula', 'Simula l\'offerta'],
      ['sez-rischi', 'Rischi'], ['sez-tempi', 'Scadenze'], ['sez-dettagli', 'Descrizione'], ['sez-documenti', 'Documenti']];
    return '<nav class="sc-sezioni" aria-label="Sezioni della scheda">' + v.map(function (x) { return '<a class="chip" href="#' + x[0] + '">' + x[1] + '</a>'; }).join('') + '</nav>';
  }

  /* ---------- numeri chiave ---------- */

  function tile(et, val, nota, cls) {
    return '<div class="tile' + (cls ? ' ' + cls : '') + '"><div class="t-et">' + et + '</div><div class="t-val">' + val + '</div>' + (nota ? '<div class="t-nota">' + nota + '</div>' : '') + '</div>';
  }
  function numeri(a, r) {
    var dem = a.fonte === DEMANIO, h = '';
    h += tile('Prezzo base', r.prezzoBase ? U.eur(r.prezzoBase) : nd(a, dem ? 'nel PDF dell\'avviso' : null), dem && !r.prezzoBase ? 'Il Demanio lo scrive solo nell\'avviso PDF' : '', r.prezzoBase ? '' : 't-testo');
    var notaMin = '';
    if (r.offertaMinima && r.prezzoBase) {
      notaMin = Math.abs(r.offertaMinima - r.prezzoBase * T.asta.offertaMinima.quota) < 1 ? U.pct(T.asta.offertaMinima.quota, 0) + ' del prezzo base (art. 571 c.p.c.)'
        : r.offertaMinima >= r.prezzoBase ? (r.offertaMinima > r.prezzoBase ? '<span class="sc-attenzione">Più alta del prezzo base: dato della fonte, verifica nell\'avviso</span>' : 'Uguale al prezzo base') : 'Indicata nell\'avviso';
    }
    h += tile('Offerta minima', r.offertaMinima ? U.eur(r.offertaMinima) : nd(a), notaMin, r.offertaMinima ? '' : 't-testo');
    h += tile('Rialzo minimo', a.rialzo > 0 ? U.eur(a.rialzo) : nd(a), a.rialzo > 0 ? 'Aumento minimo tra un\'offerta e l\'altra in gara' : '', a.rialzo > 0 ? '' : 't-testo');
    var cauz = '', notaC = '';
    if (a.cauzionePerc > 0) {
      cauz = U.pct(a.cauzionePerc / 100, 1) + ' dell\'offerta';
      notaC = r.offertaMinima ? U.eur(r.offertaMinima * a.cauzionePerc / 100) + ' con l\'offerta minima' : '';
    } else if (a.cauzione) cauz = esc(a.cauzione);
    h += tile('Cauzione', cauz || nd(a), cauz ? notaC : 'Di norma il ' + U.pct(T.asta.cauzione.quota, 0) + ' dell\'offerta: l\'importo esatto è nell\'avviso', cauz && a.cauzionePerc > 0 ? 't-testo t-medio' : 't-testo');
    var t = istante(a.dataAsta, a.ora);
    if (dem) {
      h += tile('Termine per le offerte', a.dataAsta ? esc(quandoEsteso(a.dataAsta, a.ora)) : nd(a), t ? '<span data-conto="' + t + '" data-ora="' + esc(a.ora || '') + '">' + conto(t, a.ora) + '</span>' : '', 't-testo t-medio');
      h += tile('Apertura delle offerte', nd(a, 'indicata nel PDF dell\'avviso'), 'Data, ora e luogo della gara sono nell\'avviso', 't-testo');
    } else {
      h += tile('Data e ora dell\'asta', a.dataAsta ? esc(quandoEsteso(a.dataAsta, a.ora)) : nd(a), t ? '<span data-conto="' + t + '" data-ora="' + esc(a.ora || '') + '">' + conto(t, a.ora) + '</span>' : '', 't-testo t-medio');
      var to = a.termineOfferte && istante(a.termineOfferte);
      h += tile('Termine per le offerte', a.termineOfferte ? esc(quandoEsteso(a.termineOfferte)) : nd(a), to ? '<span data-conto="' + to + '" data-ora="1">' + conto(to, '1') + '</span>' : 'Di solito entro le 12 del giorno feriale prima dell\'asta: verifica nell\'avviso', 't-testo t-medio');
    }
    return '<section class="sc-sez" id="sez-numeri" aria-labelledby="h-numeri"><h2 id="h-numeri" class="sr-only">Prezzi e date</h2><div class="sc-numeri">' + h + '</div></section>';
  }

  /* ---------- punteggio ---------- */

  function colore(p) {
    if (p >= 75) return 'var(--s-100)';
    if (p >= 55) return 'color-mix(in srgb, var(--s-100) 60%, var(--s-50))';
    if (p >= 35) return 'var(--s-50)';
    return 'var(--s-0)';
  }
  var PARTI = [
    ['sconto', 'Sconto sul valore'], ['tentativo', 'Tentativi già andati a vuoto'], ['occupazione', 'Libero o occupato'],
    ['rischi', 'Rischi trovati nel testo'], ['zona', 'Affitto della zona (OMI)']
  ];
  function dettaglioParte(k, a, r) {
    var ch = Array.isArray(a.rischi) ? a.rischi.length : null;
    switch (k) {
      case 'sconto': return r.sconto != null ? 'Costo totale ' + U.pct(Math.abs(r.sconto), 0) + (r.sconto >= 0 ? ' sotto' : ' sopra') + ' il valore' : 'serve il valore';
      case 'tentativo': return a.tentativo ? a.tentativo + '° tentativo' + (a.deserte ? ', ' + a.deserte + (a.deserte === 1 ? ' deserta' : ' deserte') : '') : 'non noto';
      case 'occupazione': return a.categoria !== 'immobile' ? 'non si applica: punteggio neutro' : a.stato === 'libero' ? 'libero' : a.stato === 'occupato' ? 'occupato' : 'non indicato: punteggio neutro';
      case 'rischi': return ch === null ? 'testo non controllato: punteggio neutro' : ch ? ch + (ch === 1 ? ' rischio trovato' : ' rischi trovati') : 'nessuno nel testo';
      case 'zona':
        var rend = a.rendimento != null ? a.rendimento : r.valuta && r.valuta.rendimento;
        return rend != null && isFinite(rend) ? 'affitto OMI della zona: rendimento lordo ' + U.pct(rend, 1) + ' l\'anno sul costo totale' : 'neutro: manca l\'affitto OMI della zona';
    }
    return '';
  }
  var MANCA = {
    'prezzo base': 'Prezzo base: non indicato nei dati raccolti.',
    'numero del tentativo': 'Numero del tentativo: non è stato possibile collegare le aste precedenti.',
    'stato di occupazione': 'Stato di occupazione: l\'avviso non dice se è libero o occupato.',
    'controllo dei rischi nel testo': 'Controllo dei rischi: il testo dell\'avviso non è ancora stato letto (punteggio neutro).',
    'domanda della zona (servono i dati OMI)': 'Domanda della zona: servono i valori OMI dell\'Agenzia delle Entrate, non ancora collegati (punteggio neutro).',
    'affitto della zona (quotazione OMI di locazione non disponibile)': 'Affitto della zona: quotazione OMI di locazione non disponibile per questa asta (punteggio della zona neutro).',
    'valore di mercato (manca la stima del perito)': 'Valore di mercato: manca la stima del perito e non è la prima asta. Senza valore il punteggio non si calcola.'
  };
  function testoMancante(m, a) {
    // "non è la prima asta" solo se il numero del tentativo è noto
    if (/^valore di mercato/.test(m) && !(a && a.tentativo > 1)) return 'Valore di mercato: manca la stima del perito e non sappiamo ancora se è la prima asta. Senza valore il punteggio non si calcola.';
    return MANCA[m] || maiuscola(m) + '.';
  }

  function sezPunteggio(a, r) {
    var p = r.punteggio, h = '';
    var fascia = p && window.Punteggio ? Punteggio.fascia(p.valore).etichetta : 'Senza punteggio';
    if (p) {
      h += '<div class="sc-punteggio"><div class="sc-anello"><div class="anello" style="--v:' + Math.max(0, Math.min(100, p.valore)) + ';--c:' + colore(p.valore) + ';--d:132px" role="img" aria-label="Punteggio affare ' + p.valore + ' su 100: ' + esc(fascia) + '"><b aria-hidden="true">' + p.valore + '</b></div><span class="sc-su100" aria-hidden="true">su 100</span></div>';
      if (p.parti) {
        var pesi = (window.Punteggio && Punteggio.PESI) || {};
        h += '<ul class="sc-parti">' + PARTI.map(function (x) {
          var v = Number(p.parti[x[0]]) || 0, max = pesi[x[0]] || 1;
          return '<li><span class="sc-parte-nome">' + x[1] + '</span><b class="num">' + v.toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' / ' + max + '</b>' +
            '<span class="sc-barra" aria-hidden="true"><i style="--w:' + Math.round(v / max * 100) + '%"></i></span><small>' + esc(dettaglioParte(x[0], a, r)) + '</small></li>';
        }).join('') + '</ul>';
      } else h += '<p class="note">Il dettaglio delle voci non è ancora disponibile per questa asta.</p>';
      h += '</div>';
    } else {
      h += '<div class="sc-punteggio"><div class="sc-anello"><div class="anello vuoto" style="--d:132px" role="img" aria-label="Senza punteggio"><b aria-hidden="true">n.d.</b></div></div>' +
        '<p class="sc-spiega">Il punteggio si calcola solo con un valore di mercato attendibile: la stima del perito o il prezzo della prima asta. Per questa asta non c\'è ancora, e non lo inventiamo.</p></div>';
    }
    var manca = r.mancanti.filter(function (m) { return !(p && /^valore di mercato/.test(m)); });
    if (manca.length) h += '<div class="sc-manca"><h3>Cosa manca</h3><ul>' + manca.map(function (m) { return '<li>' + esc(testoMancante(m, a)) + '</li>'; }).join('') + '</ul></div>';
    if (a.limitato) h += '<p class="note">Punteggio <b>fermato a ' + (window.Punteggio && window.Punteggio.TETTO_INCERTO || 54) + '</b>: il valore di mercato ha affidabilità bassa, quindi non possiamo dire che sia un buon affare.</p>';
    else if (p && !p.completo) h += '<p class="note">Punteggio <b>parziale</b>: alcuni dati sono incerti o mancanti, quindi va preso con prudenza.</p>';
    return '<section class="panel sc-sez" id="sez-punteggio" aria-labelledby="h-punteggio"><div class="sc-sez-testa"><h2 id="h-punteggio">Punteggio affare</h2>' +
      '<span class="pill ' + (p ? (p.valore >= 55 ? 'p-good' : p.valore >= 35 ? 'p-warn' : 'p-bad') : 'p-neutral') + '">' + esc(fascia) + '</span></div>' + h +
      '<p class="note">Somma di cinque voci: sconto (fino a 40 punti), tentativi andati a vuoto (12), occupazione (13), rischi nel testo (20) e affitto della zona rispetto al costo (15).</p></section>';
  }

  /* ---------- valore di mercato ---------- */

  var AFFIDABILITA = {
    alta: ['p-good', 'Alta', 'due fonti indipendenti concordano entro il 35%: quotazione OMI della zona e stima del perito (o prezzo della prima asta)'],
    media: ['p-info', 'Media', 'una sola fonte diretta: quotazione OMI della zona oppure stima del perito'],
    bassa: ['p-warn', 'Bassa', 'stima indiretta o fonti molto diverse: il punteggio resta al massimo "Da valutare"']
  };

  function forchetta(v, r) {
    var punti = [v.min, v.max, v.centrale];
    if (r.prezzoBase) punti.push(r.prezzoBase);
    if (r.offertaMinima) punti.push(r.offertaMinima);
    var lo = Math.min.apply(null, punti), hi = Math.max.apply(null, punti), pad = (hi - lo) * 0.06 || hi * 0.1;
    lo = Math.max(0, lo - pad); hi += pad;
    function pos(x) { return (x - lo) / (hi - lo) * 100; }
    function allinea(p) { return p < 16 ? ' a-sx' : p > 84 ? ' a-dx' : ''; }
    var segni = [];
    var stessi = r.prezzoBase && r.offertaMinima && Math.abs(r.prezzoBase - r.offertaMinima) < 1;
    if (r.prezzoBase) segni.push([r.prezzoBase, stessi ? 'prezzo base = offerta minima' : 'prezzo base', 'base']);
    if (r.offertaMinima && !stessi) segni.push([r.offertaMinima, 'offerta minima', 'minima']);
    if (segni.length === 2 && Math.abs(pos(segni[0][0]) - pos(segni[1][0])) < 34) segni[1][3] = ' giu';
    var etic = 'Valore tra ' + U.eur(v.min) + ' e ' + U.eur(v.max) + segni.map(function (s) { return '; ' + s[1] + ' ' + U.eur(s[0]); }).join('');
    return '<div class="sc-forchetta" role="img" aria-label="' + esc(etic) + '">' +
      '<span class="sc-f-banda" style="left:' + pos(v.min).toFixed(2) + '%;width:' + Math.max(1, pos(v.max) - pos(v.min)).toFixed(2) + '%"></span>' +
      '<span class="sc-f-centro" style="left:' + pos(v.centrale).toFixed(2) + '%"><span class="' + allinea(pos(v.centrale)).trim() + '">valore ' + U.eur(v.centrale) + '</span></span>' +
      segni.map(function (s) {
        var p = pos(s[0]);
        return '<span class="sc-f-segno ' + s[2] + (s[3] || '') + '" style="left:' + p.toFixed(2) + '%"><span class="' + allinea(p).trim() + '">' + s[1] + '<b>' + U.eur(s[0]) + '</b></span></span>';
      }).join('') + '</div>';
  }

  function sezValore(a, r) {
    var v = r.valore, h;
    if (!v) {
      h = '<div class="sc-vuoto-sez">' + U.icona('grafico') + '<div><p><b>Non ancora disponibile.</b> Per stimarlo serve la stima del perito (nell\'avviso o nella perizia) oppure il prezzo base della prima asta. Non lo inventiamo.</p>' +
        '<p class="note">Se lo conosci (per esempio dalla perizia), inseriscilo nel <a href="calcolatore.html?id=' + encodeURIComponent(a.id) + '" data-passa="id:' + esc(a.id) + '">calcolo completo</a>.</p></div></div>';
    } else {
      var aff = AFFIDABILITA[v.affidabilita];
      h = '<div class="sc-valore"><b class="sc-grande">' + U.eur(v.centrale) + '</b>' + (v.min !== v.max ? '<span>tra <b class="num">' + U.eur(v.min) + '</b> e <b class="num">' + U.eur(v.max) + '</b></span>' : '') + '</div>' +
        (v.min !== v.max || r.prezzoBase ? forchetta(v, r) : '') +
        '<dl class="kv sc-kv"><div><dt>Da dove viene</dt><dd class="sc-dd-testo">' + esc(v.etichetta || 'Valore stimato') + '</dd></div>' +
        '<div><dt>Affidabilità</dt><dd class="sc-dd-testo">' + (aff ? '<span class="pill ' + aff[0] + '">' + aff[1] + '</span> <span class="muted">' + aff[2] + '</span>' : v.fonte === 'manuale' ? '<span class="muted">non valutata: l\'hai inserito tu</span>' : nd(a, 'non indicata')) + '</dd></div></dl>';
      var ctrl = v.controlli || [];
      h += '<div class="sc-controlli"><h3>Controlli di coerenza</h3><ul>' +
        (ctrl.length ? ctrl.map(function (c) { return '<li class="ko">' + U.icona('allerta') + '<span>' + esc(c) + '</span></li>'; }).join('')
          : '<li class="ok">' + U.icona('ok') + '<span>Nessuna incoerenza tra prezzo base, valore e superficie nei dati disponibili.</span></li>') +
        (v.zona && v.zona.mediana ? '<li class="ok">' + U.icona('mappa') + '<span>Confronto con la zona: mediana delle perizie di ' + esc(v.zona.livello === 'comune' ? v.zona.nome : 'provincia ' + v.zona.nome) + ' ' + Number(v.zona.mediana).toLocaleString('it-IT') + ' €/m² su ' + v.zona.n + ' perizie' + (r.mq ? '; questa: ' + Math.round(v.centrale / r.mq).toLocaleString('it-IT') + ' €/m²' : '') + '.</span></li>' : '') +
        (v.senzaZona && a.categoria === 'immobile' ? '<li class="info">' + U.icona('mappa') + '<span>Confronto con le perizie della zona non disponibile in questa scheda.</span></li>' : '') +
        '</ul></div>' +
        (a.omiAffMin > 0 && a.omiAffMax >= a.omiAffMin ? '<p class="note">Affitto tipico della zona (OMI) per questa superficie: da <b class="num">' + U.eur(a.omiAffMin) + '</b> a <b class="num">' + U.eur(a.omiAffMax) + '</b> al mese.</p>' : '') +
        (v.fonte === 'manuale' ? '' : /^omi/.test(v.fonte) ? '<p class="note">La forchetta è quella delle quotazioni OMI (minimo e massimo al m² della zona) moltiplicate per la superficie. Il valore reale dipende dallo stato dell\'immobile: leggi la perizia.</p>'
          : '<p class="note">La forchetta è ±10% intorno alla stima del perito, ±15% quando il valore è ricavato dal prezzo della prima asta. Il valore reale dipende dallo stato dell\'immobile: leggi la perizia.</p>');
    }
    return '<section class="panel sc-sez" id="sez-valore" aria-labelledby="h-valore"><div class="sc-sez-testa"><h2 id="h-valore">Valore di mercato</h2>' +
      (v && AFFIDABILITA[v.affidabilita] ? '<span class="pill ' + AFFIDABILITA[v.affidabilita][0] + '">Affidabilità ' + AFFIDABILITA[v.affidabilita][1].toLowerCase() + '</span>' : '') + '</div>' + h + '</section>';
  }

  /* ---------- costo totale ---------- */

  function riga(et, val, cls) { return '<div class="line' + (cls ? ' ' + cls : '') + '"><span>' + et + '</span><b>' + val + '</b></div>'; }
  function vociCosto(a, c) {
    var h = riga(a.categoria === 'immobile' ? 'Prezzo (offerta al prezzo base)' : 'Aggiudicazione al prezzo base', U.eur(c.offerta));
    if (a.categoria === 'immobile') {
      h += riga('Imposte (' + esc(c.imposte.regime.nome.toLowerCase()) + ')', U.eur(c.imposte.totale));
      c.imposte.voci.forEach(function (v) { h += riga(esc(v.voce), U.eur(v.importo), 'sub'); });
      c.extra.forEach(function (v) { if (v.importo) h += riga(esc(v.voce), U.eur(v.importo)); });
    } else {
      c.voci.forEach(function (v) {
        if (!v.importo) return;
        h += riga(esc(v.voce), U.eur(v.importo, v.voce === 'Passaggio di proprietà' ? 2 : 0));
        if (v.voce === 'Passaggio di proprietà' && c.passaggio) c.passaggio.voci.forEach(function (p) { h += riga(esc(p.voce), U.eur(p.importo, 2), 'sub'); });
      });
    }
    return h + riga('Costo totale', U.eur(c.totale), 'total');
  }
  function ipotesi(a) {
    var I = (window.Punteggio && Punteggio.IPOTESI) || C.IPOTESI_RAPIDE;
    if (a.categoria === 'immobile') return 'Ipotesi: acquisto come seconda casa da privato (senza agevolazioni prima casa), spese di procedura ' + U.eur(I.speseProcedura) +
      (a.stato === 'occupato' ? ', liberazione ' + U.eur(I.liberazioneOccupato) : '') + '. Non inclusi: condominio arretrato, lavori, mutuo.';
    if (a.categoria === 'auto') return 'Ipotesi: diritti d\'asta del ' + U.pct(T.veicoli.dirittiAsta.quota, 0) + ' + IVA, passaggio di proprietà con potenza di ' + I.kw + ' kW. Non inclusi: riparazioni e trasporto.';
    if (a.categoria === 'moto') return 'Ipotesi: diritti d\'asta del ' + U.pct(T.veicoli.dirittiAsta.quota, 0) + ' + IVA; l\'IPT delle moto va chiesta all\'ACI. Non inclusi: riparazioni e trasporto.';
    return 'Ipotesi: diritti d\'asta del ' + U.pct(T.veicoli.dirittiAsta.quota, 0) + ' + IVA, senza IVA sul prezzo. Non inclusi: trasporto e smontaggio.';
  }
  function sezCosti(a, r) {
    var h;
    if (!r.costo) {
      h = '<div class="sc-vuoto-sez">' + U.icona('euro') + '<div><p><b>Non calcolabile qui:</b> manca il prezzo base' + (a.fonte === DEMANIO ? ', che il Demanio indica solo nel PDF dell\'avviso' : '') + '.</p>' +
        '<p class="note">Inseriscilo nel <a href="calcolatore.html?id=' + encodeURIComponent(a.id) + '" data-passa="id:' + esc(a.id) + '">calcolo completo</a> per avere imposte e costo totale.</p></div></div>';
    } else {
      h = '<div class="result">' + vociCosto(a, r.costo) + '</div><p class="note">' + esc(ipotesi(a)) + '</p>';
      var obiettivo = U.pct(T.giudizio.scontoObiettivo, 0);
      if (r.offertaMax > 0) {
        h += '<div class="sc-offmax"><span class="sc-et">Offerta massima consigliata</span><b class="sc-grande">' + U.eur(r.offertaMax) + '</b>' +
          '<p>Per restare circa il ' + obiettivo + ' sotto il valore minimo stimato (' + U.eur(r.valore.min) + '), costi compresi.</p>' +
          (r.offertaMinima && r.offertaMax < r.offertaMinima ? '<p class="sc-attenzione">È sotto l\'offerta minima ammessa: a queste condizioni l\'asta non conviene.</p>' : '') + '</div>';
      } else if (r.valore) {
        h += '<div class="callout warn">Con questi costi nessuna offerta resta il ' + obiettivo + ' sotto il valore minimo stimato: il margine è troppo stretto.</div>';
      } else h += '<p class="note">L\'offerta massima consigliata si calcola quando c\'è il valore di mercato.</p>';
    }
    return '<section class="panel sc-sez" id="sez-costi" aria-labelledby="h-costi"><div class="sc-sez-testa"><h2 id="h-costi">Quanto costa davvero</h2>' +
      (r.giudizio ? '<span class="pill p-' + r.giudizio.tono + '" title="Giudizio con un\'offerta pari al prezzo base">Al prezzo base: ' + esc(r.giudizio.etichetta.toLowerCase()) + ' · ' + U.pct(r.sconto, 0) + '</span>' : '') + '</div>' + h + '</section>';
  }

  /* ---------- mini calcolatore ---------- */

  function passo(intervallo) {
    var p = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000], obiettivo = intervallo / 200;
    for (var i = 0; i < p.length; i++) if (p[i] >= obiettivo) return p[i];
    return p[p.length - 1];
  }
  function puntoArco(s, R) {
    var f = Math.max(0, Math.min(1, (s - SMIN) / (SMAX - SMIN))), th = Math.PI * (1 - f);
    return [(100 + R * Math.cos(th)).toFixed(2), (100 - R * Math.sin(th)).toFixed(2)];
  }
  function tachimetro() {
    var G = T.giudizio;
    var seg = [[SMIN, G.margineStretto, 'var(--s-0)'], [G.margineStretto, G.conviene, 'var(--s-50)'], [G.conviene, G.affare, 'color-mix(in srgb, var(--s-100) 55%, var(--s-50))'], [G.affare, SMAX, 'var(--s-100)']];
    var archi = seg.map(function (s) {
      var p0 = puntoArco(s[0], 80), p1 = puntoArco(s[1], 80);
      return '<path d="M' + p0[0] + ' ' + p0[1] + ' A80 80 0 0 1 ' + p1[0] + ' ' + p1[1] + '" fill="none" stroke-width="16" style="stroke:' + s[2] + '"/>';
    }).join('');
    var tacche = [G.margineStretto, G.conviene, G.affare].map(function (s) {
      var p = puntoArco(s, 101);
      return '<text x="' + p[0] + '" y="' + p[1] + '" text-anchor="middle">' + Math.round(s * 100) + '%</text>';
    }).join('');
    return '<svg class="tachimetro" viewBox="-6 -14 212 124" aria-hidden="true">' + archi + tacche +
      '<g class="ago"><path d="M100 100 L100 30" stroke-width="4" stroke-linecap="round" style="stroke:var(--fg)"/><circle cx="100" cy="100" r="8" style="fill:var(--fg)"/></g></svg>';
  }

  function sezSimula(a, r) {
    var link = '<a class="btn ghost" href="calcolatore.html?id=' + encodeURIComponent(a.id) + '" data-passa="id:' + esc(a.id) + '">' + U.icona('calcolo') + 'Calcolo completo</a>';
    var h;
    if (!r.prezzoBase || !r.offertaMinima) {
      h = '<div class="sc-vuoto-sez">' + U.icona('calcolo') + '<div><p><b>Simulazione non disponibile:</b> manca il prezzo base' + (a.fonte === DEMANIO ? ' (è nel PDF dell\'avviso)' : '') + '.</p><p class="note">Nel calcolo completo puoi inserirlo a mano.</p></div></div>';
    } else {
      var min = Math.min(r.offertaMinima, r.prezzoBase), max = Math.round(r.prezzoBase * 1.5), st = passo(max - min);
      var scorc = '<button class="chip" type="button" data-offerta="' + r.offertaMinima + '">Offerta minima</button><button class="chip" type="button" data-offerta="' + r.prezzoBase + '">Prezzo base</button>' +
        (r.offertaMax > min && r.offertaMax <= max ? '<button class="chip" type="button" data-offerta="' + r.offertaMax + '">Offerta massima consigliata</button>' : '');
      h = '<div class="sc-calc"><div class="sc-calc-sx">' +
        '<div class="cursore"><div class="testa"><label for="offerta">La tua offerta</label><output id="outOfferta" for="offerta" class="num"></output></div>' +
        '<input type="range" id="offerta" min="' + min + '" max="' + max + '" step="' + st + '" value="' + r.offertaMinima + '">' +
        '<div class="estremi"><span>' + U.eur(min) + '</span><span>' + U.eur(max) + ' (1,5 × base)</span></div></div>' +
        '<div class="chips sc-scorciatoie" role="group" aria-label="Valori rapidi">' + scorc + '</div>' +
        '<dl class="sc-esiti" aria-live="polite"><div><dt>Costo totale</dt><dd id="simCosto" class="num"></dd></div>' +
        '<div><dt>Sconto sul valore</dt><dd id="simSconto" class="num"></dd></div>' +
        '<div><dt>' + (r.valore ? 'Margine' : 'Costi oltre l\'offerta') + '</dt><dd id="simMargine" class="num"></dd></div>' +
        '<div><dt>Cauzione' + (a.cauzionePerc > 0 ? ' (' + U.pct(a.cauzionePerc / 100, 1) + ')' : ' (circa ' + U.pct(T.asta.cauzione.quota, 0) + ')') + '</dt><dd id="simCauzione" class="num"></dd></div></dl></div>' +
        '<div class="sc-calc-dx">' + (r.valore ? tachimetro() + '<p class="sc-giudizio" id="simGiudizio"></p><p class="note sc-centro">Scala: Non conviene sotto il ' + U.pct(T.giudizio.margineStretto, 0) + ', Affare dal ' + U.pct(T.giudizio.affare, 0) + ' in su.</p>'
          : '<div class="sc-vuoto-sez">' + U.icona('grafico') + '<div><p><b>Giudizio non disponibile:</b> per dire se conviene serve il valore di mercato (stima del perito o prezzo della prima asta), che qui manca.</p><p class="note">Il costo totale qui accanto è comunque reale: inserisci il valore nel calcolo completo.</p></div></div>') +
        '</div></div>';
    }
    return '<section class="panel sc-sez" id="sez-simula" aria-labelledby="h-simula"><div class="sc-sez-testa"><h2 id="h-simula">Simula la tua offerta</h2></div>' + h +
      '<div class="row-actions sc-fondo">' + link + '<span class="note">Condominio arretrato, lavori, prima casa, mutuo e tre strategie.</span></div></section>';
  }

  function simula(valore) {
    var a = stato.a, r = stato.r, inp = $('#offerta'); if (!inp) return;
    var v = valore != null ? valore : +inp.value;
    stato.offerta = v;
    var min = +inp.min, max = +inp.max;
    inp.style.setProperty('--p', ((v - min) / (max - min) * 100).toFixed(1) + '%');
    inp.setAttribute('aria-valuetext', U.eur(v));
    $('#outOfferta').textContent = U.eur(v);
    var c = A.costo(a, v, r.valore && r.valore.centrale);
    $('#simCosto').textContent = U.eur(c.totale);
    $('#simCauzione').textContent = U.eur(v * (a.cauzionePerc > 0 ? a.cauzionePerc / 100 : T.asta.cauzione.quota));
    U.$$('.sc-scorciatoie [data-offerta]').forEach(function (b) { b.setAttribute('aria-pressed', String(Math.abs(+b.dataset.offerta - v) < 0.5)); });
    if (!r.valore) {
      $('#simSconto').innerHTML = '<span class="sc-nd">serve il valore</span>';
      $('#simMargine').textContent = U.eur(c.totale - v);
      return;
    }
    var g = C.giudizio(c.sconto, T);
    $('#simSconto').textContent = U.pct(c.sconto, 0);
    $('#simSconto').className = 'num sc-tono-' + g.tono;
    $('#simMargine').textContent = U.eur(c.margine);
    var f = Math.max(0, Math.min(1, (c.sconto - SMIN) / (SMAX - SMIN)));
    var ago = $('.sc-calc .ago'); if (ago) ago.style.transform = 'rotate(' + ((f - 0.5) * 180).toFixed(1) + 'deg)';
    var gj = $('#simGiudizio');
    gj.className = 'sc-giudizio v-' + g.tono;
    gj.innerHTML = '<b>' + esc(g.etichetta) + '</b><span>' + (c.sconto >= 0 ? U.pct(c.sconto, 0) + ' sotto il valore' : U.pct(-c.sconto, 0) + ' sopra il valore') + '</span>';
  }

  /* ---------- rischi ---------- */

  var ESITO = { verde: 'Nessun segnale', rosso: 'Trovato', giallo: 'Da verificare', grigio: 'Non verificabile' };
  function sezRischi(a, r) {
    var perizia = U.linkSicuro((a.allegati || {}).perizia) || U.linkSicuro(a.linkPerizia);
    var h = '<div class="sc-legenda" aria-hidden="true"><span class="verde">verificato assente nel testo</span><span class="rosso">trovato</span><span class="giallo">incerto</span><span class="grigio">non verificabile</span></div>' +
      '<div class="semafori">' + r.semafori.map(function (s) {
        return '<div class="semaforo ' + s.colore + '"><i aria-hidden="true"></i><div><span class="sc-sem-testa"><b>' + esc(s.titolo) + '</b><span class="sc-esito">' + ESITO[s.colore] + '</span></span>' +
          esc(s.testo) + (s.prova ? '<small class="sc-prova">«' + esc(s.prova) + '»</small>' : '') + '</div></div>';
      }).join('') + '</div>' +
      '<div class="callout warn sc-perizia">' + U.icona('documento') + '<div><b>La perizia va letta comunque.</b> Questo controllo cerca le parole tipiche dei problemi solo nel testo breve dell\'avviso: un rischio può esserci anche se qui non compare. ' +
      (perizia ? esterno(perizia, 'Apri la perizia') : 'La perizia si scarica dall\'avviso originale.') + '</div></div>';
    var n = r.nRischi;
    return '<section class="panel sc-sez" id="sez-rischi" aria-labelledby="h-rischi"><div class="sc-sez-testa"><h2 id="h-rischi">Semafori dei rischi</h2>' +
      '<span class="pill ' + (n === null ? 'p-neutral">Testo non disponibile' : n ? 'p-bad">' + n + (n === 1 ? ' rischio trovato' : ' rischi trovati') : 'p-good">Nessun rischio nel testo') + '</span></div>' + h + '</section>';
  }

  /* ---------- linea del tempo ---------- */

  var ESITI = { deserta: 'andata deserta', aggiudicata: 'aggiudicata', sospesa: 'sospesa' };
  function sezTempi(a, r) {
    var dem = a.fonte === DEMANIO, ev = [], adesso = Date.now();
    if (a.pubblicata) ev.push({ data: a.pubblicata, titolo: 'Pubblicazione dell\'avviso', nota: a.fonte || '' });
    var storico = Array.isArray(a.storico) ? a.storico : [];
    storico.forEach(function (s, i) {
      if (!s || !s[0]) return;
      var es = s[2] ? ESITI[s[2]] || s[2] : 'esito non pubblicato';
      ev.push({ data: s[0], titolo: (i + 1) + '° tentativo' + (s[1] > 0 ? ' a ' + U.eur(s[1]) : ''), nota: maiuscola(es) });
    });
    if (a.prezzoPrecedente > a.prezzoBase && a.dataRibasso) ev.push({ data: a.dataRibasso, titolo: 'Prezzo ribassato', nota: 'da ' + U.eur(a.prezzoPrecedente) + ' a ' + U.eur(a.prezzoBase) });
    if (a.termineOfferte && !dem) ev.push({ data: a.termineOfferte, titolo: 'Termine per le offerte', nota: 'Offerta e cauzione vanno depositate entro questa data' });
    if (a.dataAsta) ev.push({ data: a.dataAsta + (a.ora ? 'T' + oraDi(a.dataAsta, a.ora) : ''), titolo: dem ? 'Termine per le offerte' : (a.tentativo ? a.tentativo + '° tentativo: questa asta' : 'Asta'), nota: dem ? 'Apertura delle offerte: vedi l\'avviso PDF' : (r.prezzoBase ? 'Prezzo base ' + U.eur(r.prezzoBase) : ''), qui: true });
    ev.sort(function (x, y) { return String(x.data).localeCompare(String(y.data)); });
    var prossimo = false;
    var li = ev.map(function (e) {
      var t = istante(String(e.data).slice(0, 10), oraDi(e.data, '') || '23:59'), fatto = t && t < adesso, cls = fatto ? 'fatto' : '';
      if (!fatto && !prossimo) { cls = 'prossimo'; prossimo = true; }
      return '<li class="' + cls + (e.qui ? ' qui' : '') + '"><span class="punto" aria-hidden="true"></span><div><b class="sc-t-tit">' + esc(e.titolo) + '</b>' + (e.nota ? '<small>' + esc(e.nota) + '</small>' : '') + '</div><b>' + esc(U.dataIt(String(e.data).slice(0, 10))) + (oraDi(e.data, '') ? ' ' + oraDi(e.data, '') : '') + '</b></li>';
    }).join('');
    li += '<li><span class="punto" aria-hidden="true"></span><div><b class="sc-t-tit">Saldo del prezzo</b><small>Di norma entro 120 giorni dall\'aggiudicazione: verifica nell\'avviso.</small></div><b class="sc-senza-data" aria-hidden="true">—</b></li>';
    var note = '';
    if (!storico.length && a.tentativo > 1) note += '<p class="note">Prima di questa asta ci sono stati ' + (a.tentativo - 1) + (a.tentativo - 1 === 1 ? ' tentativo' : ' tentativi') + (a.deserte ? ' (' + a.deserte + ' andati deserti)' : '') + ': date non disponibili.</p>';
    else if (!storico.length && a.tentativo === 1) note += '<p class="note">È il primo tentativo di vendita trovato nello storico del portale.</p>';
    else if (!storico.length && !a.tentativo && a.fonte !== DEMANIO && a._origine !== 'manuale') note += '<p class="note">Storico dei tentativi precedenti: non ancora disponibile.</p>';
    if (a.ribasso > 0) note += '<p class="note">Ribasso rispetto al tentativo precedente: <b>' + U.pct(a.ribasso, 0) + '</b>' + (a.primoPrezzo > 0 ? ' · prezzo della prima asta: ' + U.eur(a.primoPrezzo) : '') + '.</p>';
    if (a.storicoNota) note += '<p class="note">' + esc(a.storicoNota) + '</p>';
    return '<section class="panel sc-sez" id="sez-tempi" aria-labelledby="h-tempi"><div class="sc-sez-testa"><h2 id="h-tempi">Linea del tempo</h2>' +
      (a.tentativo ? '<span class="pill p-info">' + a.tentativo + '° tentativo</span>' : '') + '</div><ol class="tempi">' + li + '</ol>' + note + '</section>';
  }

  /* ---------- descrizione e dati ---------- */

  function voce(dt, dd) { return '<div><dt>' + dt + '</dt><dd>' + dd + '</dd></div>'; }
  function sezDettagli(a, r) {
    var d = r.testo, h = '';
    // testo che finisce a metà parola: la fonte lo ha tagliato, lo si dice invece di farlo sembrare completo
    var tagliato = d && d.length > 200 && !/[.!?;:)\]»"'”]\s*$/.test(d);
    h += d ? '<div class="sc-descr"><p>' + esc(d) + (tagliato ? '…' : '') + '</p>' + (tagliato ? '<p class="note">Il testo è stato accorciato dalla fonte: leggilo per intero nell\'avviso originale.</p>' : '') + '</div>'
      : '<div class="sc-vuoto-sez">' + U.icona('documento') + '<div><p><b>Descrizione completa ' + (letto(a) ? 'non pubblicata nei dati del portale' : 'non ancora disponibile') + '.</b> La trovi nell\'avviso originale e nella perizia.</p></div></div>';
    var kv = '';
    if (a.categoria === 'immobile') {
      var sup = r.mq ? mq(r.mq) + (a.superficieDa === 'testo' ? ' <span class="muted">(letta dal testo)</span>' : '') : nd(a);
      kv += voce('Superficie', sup);
      kv += voce('Vani', a.vani ? String(a.vani).replace('.', ',') : nd(a));
      kv += voce('Piano', a.piano ? esc(a.piano) : nd(a));
      kv += voce('Dati catastali', a.catasto ? esc(a.catasto) : nd(a));
      if (r.euroMq) kv += voce('Prezzo base al m²', U.eur(r.euroMq) + '/m²');
    }
    kv += voce('Tipologia', a.tipo ? esc(a.tipo) : nd(a));
    kv += voce(a.fonte === DEMANIO ? 'Ente' : 'Tribunale', a.fonte === DEMANIO ? 'Agenzia del Demanio' : a.tribunale ? esc(a.tribunale) : nd(a));
    kv += voce('Procedura', a.rge ? esc(a.rge) : nd(a));
    if (a.numeroLotto) kv += voce('Lotto', esc(a.numeroLotto));
    if (a.rito) kv += voce('Rito', esc(a.rito));
    kv += voce('Tipo di vendita', a.tipoVendita ? esc(maiuscola(String(a.tipoVendita).toLowerCase())) : nd(a));
    kv += voce('Modalità', a.modalita ? esc(maiuscola(String(a.modalita).toLowerCase())) : nd(a));
    kv += voce('Fonte', esc(a.fonte || (a._origine === 'manuale' ? 'inserita da te' : '—')));
    h += '<dl class="kv sc-dati">' + kv + '</dl>';
    if (a.superficieProva && a.superficieDa === 'testo') h += '<p class="note">Superficie letta dal testo: «' + esc(a.superficieProva) + '».</p>';
    if ((a.categoria === 'auto' || a.categoria === 'moto') && E) {
      var vei = E.veicolo(d || a.titolo);
      if (vei) {
        var vv = '';
        if (vei.marca) vv += voce('Marca', esc(vei.marca));
        if (vei.modello) vv += voce('Modello', esc(vei.modello));
        if (vei.anno) vv += voce('Anno', String(vei.anno));
        if (vei.km) vv += voce('Chilometri', vei.km.toLocaleString('it-IT') + ' km');
        if (vei.alimentazione) vv += voce('Alimentazione', esc(vei.alimentazione));
        if (vei.kw) vv += voce('Potenza', vei.kw + ' kW');
        if (vei.stato) vv += voce('Stato', esc(vei.stato));
        if (vv) h += '<h3 class="sc-h3">Dati del veicolo letti dal testo</h3><dl class="kv sc-dati">' + vv + '</dl><p class="note">Ricavati automaticamente dal testo dell\'avviso: controllali sul libretto o nella perizia.' + (vei.multiplo ? ' <b>Il lotto sembra contenere più veicoli.</b>' : '') + '</p>';
      }
    }
    return '<section class="panel sc-sez" id="sez-dettagli" aria-labelledby="h-dettagli"><div class="sc-sez-testa"><h2 id="h-dettagli">Descrizione e dati</h2></div>' + h + '</section>';
  }

  /* ---------- documenti ---------- */

  function doc(url, titolo, nota, icona) {
    var u = U.linkSicuro(url);
    if (!u) return '<div class="sc-doc manca">' + U.icona(icona) + '<span>' + titolo + '<small>' + nota + '</small></span></div>';
    return '<a class="sc-doc" href="' + esc(u) + '" target="_blank" rel="noopener">' + U.icona(icona) + '<span>' + titolo + '<small>' + esc(new URL(u).hostname.replace(/^www\./, '')) + '</small></span>' + U.icona('esterno', 'sc-doc-freccia') + '<span class="sr-only"> (si apre in una nuova scheda)</span></a>';
  }
  function sezDocumenti(a) {
    var al = a.allegati || {}, manca = letto(a) ? 'non pubblicato con l\'avviso' : 'non ancora disponibile qui: è nell\'avviso originale';
    var h = doc(a.linkAvviso, a.fonte === DEMANIO ? 'Pagina dell\'avviso (Agenzia del Demanio)' : a.fonte === 'Portale Vendite Pubbliche' ? 'Avviso originale sul Portale Vendite Pubbliche' : 'Avviso originale', '', 'esterno') +
      doc(al.perizia || a.linkPerizia, 'Perizia di stima', manca, 'documento') +
      doc(al.avviso || a.linkPdf, 'Avviso di vendita (PDF)', manca, 'documento') +
      (a.fonte === DEMANIO ? '' : doc(al.ordinanza, 'Ordinanza di vendita', manca, 'tribunale'));
    (Array.isArray(a.altriLink) ? a.altriLink : []).forEach(function (x) { if (x && U.linkSicuro(x[1])) h += doc(x[1], 'Anche su ' + esc(x[0]), '', 'fonti'); });
    return '<section class="panel sc-sez" id="sez-documenti" aria-labelledby="h-documenti"><div class="sc-sez-testa"><h2 id="h-documenti">Documenti e link</h2></div><div class="sc-documenti">' + h + '</div></section>';
  }

  function avvertenza() {
    return '<div class="disclaimer sc-avvertenza" role="note">' + U.icona('allerta') + '<div><strong>Prima di offrire, fatti aiutare.</strong> I numeri di questa scheda sono stime indicative ricavate dall\'avviso e non sostituiscono il parere di un <b>notaio</b>, di un <b>avvocato</b> o di un <b>commercialista</b>. ' +
      'Leggi per intero avviso di vendita e perizia, visita il bene con il custode e verifica costi, vincoli e scadenze prima di versare la cauzione.</div></div>';
  }

  /* ---------- pagina ---------- */

  function vuota(titolo, testo) {
    $('#scheda').setAttribute('aria-busy', 'false');
    $('#scheda').innerHTML = '<div class="panel empty sc-vuota">' + U.icona('cerca', 'sc-vuota-icona') + '<h2>' + titolo + '</h2><p>' + testo + '</p>' +
      '<div class="row-actions"><a class="btn" href="aste.html">Vai all\'elenco delle aste</a><a class="btn ghost" href="mie-aste.html">Le aste che segui</a></div></div>';
    document.title = titolo + ' – Radar Aste Italia';
  }

  function disegna(a) {
    var r = A.analizza(a);
    stato.a = a; stato.r = r;
    document.title = (a.titolo || 'Asta') + ' – Radar Aste Italia';
    var el = $('#scheda');
    el.innerHTML = testa(a, r) + indiceSezioni(r) + numeri(a, r) +
      '<div class="sc-griglia">' + sezPunteggio(a, r) + sezValore(a, r) + '</div>' +
      '<div class="sc-griglia sc-griglia-calc">' + sezSimula(a, r) + sezCosti(a, r) + '</div>' +
      '<div class="sc-griglia">' + sezRischi(a, r) + sezTempi(a, r) + '</div>' +
      sezDettagli(a, r) + sezDocumenti(a) + avvertenza();
    el.setAttribute('aria-busy', 'false');
    attivaGalleria(a);
    aggiornaAzioni();
    var inp = $('#offerta');
    if (inp) { inp.addEventListener('input', function () { simula(); }); simula(r.offertaMinima); }
    aggiornaConti();
    setInterval(aggiornaConti, 1000);
  }

  function condividi() {
    var a = stato.a;
    var url = location.href.split('#')[0].split('?')[0] + '?id=' + encodeURIComponent(a.id);
    if (navigator.share) { navigator.share({ title: a.titolo, text: 'Asta: ' + a.titolo, url: url }).catch(function () {}); return; }
    function riuscito() { U.toast('Link della scheda copiato'); }
    function ripiego() {
      var t = document.createElement('textarea'); t.value = url; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;opacity:0;top:0';
      document.body.appendChild(t); t.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
      t.remove();
      if (ok) riuscito(); else U.toast('Copia non riuscita. Il link è: ' + url, 8000);
    }
    try { navigator.clipboard.writeText(url).then(riuscito, ripiego); } catch (e) { ripiego(); }
  }

  document.addEventListener('DOMContentLoaded', function () {
    // "Indietro": se si arriva da un'altra pagina del sito si torna lì
    try {
      var ref = document.referrer && new URL(document.referrer);
      if (ref && ref.origin === location.origin && !/scheda\.html$/.test(ref.pathname)) {
        var ind = $('#indietro'); ind.href = ref.href; $('span', ind).textContent = 'Indietro';
      }
    } catch (e) {}

    var id = U.parametro('id');
    if (!id) { vuota('Nessuna asta indicata', 'Questa pagina mostra la scheda di un\'asta: aprila dall\'elenco, dalla mappa o dalle aste che segui.'); return; }
    // il link aperto da data-passa non ha ?id=: lo si aggiunge, così ricaricare o condividere la pagina funziona
    if (!new URLSearchParams(location.search).get('id')) { try { history.replaceState(null, '', location.pathname + '?id=' + encodeURIComponent(id) + location.hash); } catch (e) {} }

    A.carica(id).then(function (a) {
      if (!a) { vuota('Asta non trovata', 'Non troviamo un\'asta con il codice «' + U.esc(id) + '». Forse è conclusa e non è più nell\'elenco, oppure il link è incompleto.'); return; }
      disegna(a);
    }).catch(function (e) {
      vuota('Scheda non disponibile', 'Non è stato possibile caricare i dati dell\'asta (' + U.esc(e && e.message || 'errore sconosciuto') + '). Riprova tra poco.');
    });

    $('#scheda').addEventListener('click', function (e) {
      var b = e.target.closest('[data-azione]');
      if (b && stato.a) {
        var az = b.dataset.azione, a = stato.a;
        if (az === 'segui') {
          var s = S.seguita(a.id);
          if (s && (s.note || s.valutazione)) U.conferma($('span', b), 'Conferma: cancella note', function () { S.smetti(a.id); U.toast('Non segui più questa asta'); aggiornaAzioni(); });
          else if (s) { S.smetti(a.id); U.toast('Rimossa da "Le mie aste"'); }
          else { A.segui(a); U.toast('Aggiunta a "Le mie aste"'); }
          aggiornaAzioni();
        } else if (az === 'confronta') {
          if (Confronto.ha(a.id)) { Confronto.togli(a.id); U.toast('Tolta dal confronto'); }
          else if (!Confronto.cambia(a.id, true)) U.toast('Puoi confrontare al massimo ' + Confronto.MAX + ' aste: togline una');
          else U.toast('Aggiunta al confronto');
          aggiornaAzioni();
        } else if (az === 'condividi') condividi();
        else if (az === 'calendario') U.offriFile('asta-' + a.id + '.ics', window.Calendario.ics(a), 'text/calendar;charset=utf-8');
        return;
      }
      var o = e.target.closest('[data-offerta]');
      if (o) { var inp = $('#offerta'); inp.value = o.dataset.offerta; simula(+o.dataset.offerta); }
    });
    document.addEventListener('radaraste:seguite', aggiornaAzioni);
  });
})();
