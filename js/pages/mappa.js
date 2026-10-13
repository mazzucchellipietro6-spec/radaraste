/* Pagina "Mappa": mappa vera (Leaflet + tile OpenStreetMap) con ogni asta come puntino colorato per punteggio affare,
 * raggruppate con supercluster quando sono vicine.
 *
 * - Solo i gruppi e i punti visibili diventano marcatori; a ogni spostamento si aggiungono quelli nuovi e si tolgono
 *   quelli usciti (niente clearLayers). L'anteprima e il riquadro della regione vivono fuori da Leaflet: ridisegnare
 *   la mappa non li chiude mai.
 * - Nessun dato inventato: senza punteggio il puntino è grigio, senza foto c'è la copertina della categoria,
 *   lo sconto medio di una regione usa solo le aste con sconto e valore di affidabilità media o alta (con il campione).
 * - Le aste senza coordinate (o con coordinate fuori dall'Italia o lontane dalla loro provincia) sono contate
 *   nella loro regione e nel totale.
 * - Se le tile sono bloccate (es. dentro claude.ai) restano i confini delle regioni ISTAT con i nomi.
 *
 * Il file parte prima di data/aste.js (sfondo e confini compaiono subito); le aste si leggono a DOMContentLoaded. */
(function () {
  'use strict';
  var U = window.UI, G = window.GEO, $ = U.$, $$ = U.$$;

  /* ---------- costanti ---------- */
  var ITALIA = [[35.5, 6.6], [47.1, 18.5]];
  var LIMITI = [[30, -6], [52, 32]];
  var DENTRO = { s: 35.2, o: 6.4, n: 47.2, e: 18.8 };   // coordinate plausibili per un'asta in Italia
  var MAX_ZOOM_GRUPPI = 16;                              // da 17 in su ogni asta è un punto
  var ZOOM_REGIONI_TOCCO = 7.5, ZOOM_REGIONI_PUNTATORE = 9; // "mappa lontana": la regione risponde a tocco o puntatore
  function media(q) { try { return window.matchMedia(q); } catch (e) { return { matches: false }; } }
  var TELEFONO = media('(max-width: 899px)'), TOCCO = media('(pointer: coarse)'), CALMO = media('(prefers-reduced-motion: reduce)');
  var ICONA_CAT = { immobile: 'casa', auto: 'auto', moto: 'moto', beni: 'beni' };
  var NOMI_CAT = { immobile: 'Immobile', auto: 'Auto', moto: 'Moto', beni: 'Beni mobili' };
  var AFFIDABILE = { media: 1, alta: 1 };
  var K_FILTRI = 'radaraste.mappa.filtri', K_VISTA = 'radaraste.mappa.vista', K_AVVISO = 'radaraste.mappa.avvisoChiuso';
  var VUOTI = { cat: '', max: '', pmin: 0, libere: false, conPunteggio: false, seguite: false };
  var MENO = '<svg class="icona" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>';
  var CHIUDI = '<button class="m-x" type="button" data-chiudi aria-label="Chiudi">' + U.icona('chiudi') + '</button>';
  var MANIGLIA = '<span class="maniglia" aria-hidden="true"></span>';

  /* ---------- stato ---------- */
  var mappa = null, sfondo = null, strato = null, confini = null, etichette = null, segno = null, indice = null;
  var tutte = [], correnti = [], sulMappa = [], perId = {}, seguite = {}, statReg = {}, senzaPos = 0, senzaReg = 0;
  var marcatori = {}, generazione = 0, scelta = null, elencoPunto = null, regioneFissa = null, regioneSopra = null;
  var filtri = copia(VUOTI), extra = {}, parole = [], OGGI = '';
  var fallback = false, primi = false, datiPronti = false, timerRegione = null, inAttesa = false, ritornoFuoco = null;
  var tileOk = 0, tileKo = 0;

  /* ---------- utilità ---------- */
  function copia(o) { return JSON.parse(JSON.stringify(o)); }
  function esc(s) { return U.esc(s); }
  function num(x) { return Number(x).toLocaleString('it-IT'); }
  function breve(x) { return x >= 10000 ? Math.round(x / 1000) + 'k' : x >= 1000 ? (Math.round(x / 100) / 10).toLocaleString('it-IT') + 'k' : String(x); }
  function aste(n) { return num(n) + (n === 1 ? ' asta' : ' aste'); }
  function senzaAccenti(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function oggi() {
    if (U.oggi) return U.oggi();
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function leggiSessione(k) { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function scriviSessione(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function fuoco(el) { if (!el) return; try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } }

  function punti(a) {
    var v = a.punteggio;
    if (v == null || v === '') return null;
    v = Number(v);
    return isFinite(v) ? Math.max(0, Math.min(100, v)) : null;
  }
  function sconto(a) {
    var v = a.sconto;
    if (v == null || v === '') return null;
    v = Number(v);
    return isFinite(v) ? v : null;
  }
  function fascia(p) {
    var P = window.Punteggio;
    if (P && P.fascia) return P.fascia(p == null ? null : p);
    if (p == null) return { chiave: 'nd', etichetta: 'Senza punteggio' };
    if (p >= 75) return { chiave: 'ottimo', etichetta: 'Ottimo affare' };
    if (p >= 55) return { chiave: 'buono', etichetta: 'Buon affare' };
    if (p >= 35) return { chiave: 'medio', etichetta: 'Da valutare' };
    return { chiave: 'basso', etichetta: 'Poco interessante' };
  }
  // punteggio minimo di ogni fascia, letto da Punteggio.fascia (così la legenda segue le soglie vere)
  function soglie() {
    var s = {};
    for (var p = 0; p <= 100; p++) { var k = fascia(p).chiave; if (!(k in s)) s[k] = p; }
    return s;
  }
  // coordinate utili: dentro l'Italia e non lontanissime dal capoluogo della provincia indicata
  function conPosizione(a) {
    if (a._mPos !== undefined) return a._mPos;
    var ok = typeof a.lat === 'number' && typeof a.lng === 'number' && a.lat >= DENTRO.s && a.lat <= DENTRO.n && a.lng >= DENTRO.o && a.lng <= DENTRO.e;
    var pr = ok && a.provincia && G.province[a.provincia];
    if (pr && (Math.abs(a.lat - pr.lat) > 1.6 || Math.abs(a.lng - pr.lng) > 2.1)) ok = false;
    try { Object.defineProperty(a, '_mPos', { value: ok, writable: true, configurable: true, enumerable: false }); } catch (e) {}
    return ok;
  }
  function luogoBreve(a) {
    var p = a.provincia && G.province[a.provincia];
    if (a.comune) return a.comune + (a.provincia ? ' (' + a.provincia + ')' : '');
    if (p) return 'Provincia di ' + p.nome;
    return a.regione || '';
  }
  function luogo(a) { return [luogoBreve(a), a.tribunale ? 'Tribunale di ' + a.tribunale : ''].filter(Boolean).join(' · '); }
  function nomeRegione(n) { return String(n || '').split('/')[0].trim(); }
  function migliore(x, y) {
    var px = punti(x), py = punti(y);
    if (px !== py) return (py == null ? -1 : py) - (px == null ? -1 : px);
    var sx = sconto(x), sy = sconto(y);
    if (sx !== sy) return (sy == null ? -9 : sy) - (sx == null ? -9 : sx);
    return (x.dataAsta || '9').localeCompare(y.dataAsta || '9');
  }
  function primaData(x, y) { return (x.dataAsta || '9').localeCompare(y.dataAsta || '9') || (x.prezzoBase || 0) - (y.prezzoBase || 0); }
  // tiene i primi k elementi di una lista ordinata, senza ordinare tutto
  function inserisci(lista, a, cmp, k) {
    if (lista.length >= k && cmp(a, lista[lista.length - 1]) >= 0) return;
    var i = lista.length;
    while (i > 0 && cmp(a, lista[i - 1]) < 0) i--;
    lista.splice(i, 0, a);
    if (lista.length > k) lista.pop();
  }
  function vai(latlng, zoom) {
    if (CALMO.matches) mappa.setView(latlng, zoom, { animate: false });
    else mappa.flyTo(latlng, zoom, { duration: 0.55 });
  }
  function adatta(bounds) {
    var opz = paddingVista();
    opz.animate = !CALMO.matches;
    mappa.fitBounds(bounds, opz);
  }
  function paddingVista() {
    return TELEFONO.matches ? { paddingTopLeft: [12, 66], paddingBottomRight: [12, 86] } : { paddingTopLeft: [24, 24], paddingBottomRight: [24, 24] };
  }

  /* ---------- filtri ---------- */
  function filtriAttivi() {
    var n = 0;
    if (filtri.cat) n++; if (filtri.max) n++; if (filtri.pmin) n++; if (filtri.libere) n++; if (filtri.conPunteggio) n++; if (filtri.seguite) n++;
    Object.keys(extra).forEach(function (k) { if (k !== 'ordina') n++; });
    return n;
  }
  function bboxValido(b) {
    return Array.isArray(b) && b.length === 4 && b.every(function (x) { return isFinite(Number(x)); }) && +b[0] < +b[2] && +b[1] < +b[3];
  }
  // filtri arrivati dall'elenco (?filtri=<json> o data-passa="filtri:<json>"): quelli che la mappa conosce diventano controlli,
  // gli altri (testo, regione, provincia, comune, tribunale, prezzo minimo, date, zona) restano attivi e si vedono come etichette
  function daElenco(f) {
    filtri = copia(VUOTI); extra = {};
    if (f.cat && NOMI_CAT[f.cat]) filtri.cat = f.cat;
    if (+f.max > 0) filtri.max = String(+f.max);
    if (f.stato === 'libero') filtri.libere = true; else if (f.stato) extra.stato = String(f.stato);
    var pm = +(f.punteggioMin || f.pmin || 0);
    if (pm > 0 && pm <= 100) filtri.pmin = pm;
    if (f.soloConPunteggio || f.conPunteggio) filtri.conPunteggio = true;
    if (f.seguite) filtri.seguite = true;
    ['testo', 'regione', 'provincia', 'comune', 'tribunale', 'dal', 'al'].forEach(function (k) { if (f[k]) extra[k] = String(f[k]).trim(); });
    if (+f.min > 0) extra.min = String(+f.min);
    if (bboxValido(f.bbox)) extra.bbox = f.bbox.map(Number);
    if (f.nuove) extra.nuove = true;
    if (f.ordina) extra.ordina = String(f.ordina);
  }
  function leggiFiltri() {
    var s = leggiSessione(K_FILTRI);
    if (s && s.filtri) { for (var k in VUOTI) if (k in s.filtri) filtri[k] = s.filtri[k]; extra = s.extra || {}; }
    var arrivo = null, nellUrl = new URLSearchParams(location.search).get('filtri');
    try { arrivo = U.parametro('filtri'); } catch (e) {}
    // se i filtri sono nell'indirizzo, il valore lasciato in sessionStorage dallo stesso link è già usato
    if (nellUrl) { try { var p = sessionStorage.getItem('radaraste.passa') || ''; if (p.indexOf('filtri:') === 0) sessionStorage.removeItem('radaraste.passa'); } catch (e) {} }
    if (arrivo) { try { var f = JSON.parse(arrivo); if (f && typeof f === 'object') { daElenco(f); return true; } } catch (e) {} }
    return false;
  }
  function salvaFiltri() { scriviSessione(K_FILTRI, { filtri: filtri, extra: extra }); }

  // gli stessi filtri, nel formato dell'elenco (aste.html)
  function perElenco(conZona) {
    var f = {};
    if (filtri.cat) f.cat = filtri.cat;
    if (filtri.max) f.max = filtri.max;
    if (filtri.libere) f.stato = 'libero'; else if (extra.stato) f.stato = extra.stato;
    if (filtri.pmin) f.punteggioMin = filtri.pmin;
    if (filtri.conPunteggio) f.soloConPunteggio = true;
    if (filtri.seguite) f.seguite = true;
    ['testo', 'regione', 'provincia', 'comune', 'tribunale', 'min', 'dal', 'al', 'ordina'].forEach(function (k) { if (extra[k]) f[k] = extra[k]; });
    if (conZona && mappa) f.bbox = bboxVista(); else if (extra.bbox) f.bbox = extra.bbox;
    return f;
  }
  function linkElenco(el, f) {
    var vuoto = !Object.keys(f).length, j = JSON.stringify(f);
    el.href = vuoto ? 'aste.html' : 'aste.html?filtri=' + encodeURIComponent(j);
    if (vuoto) el.removeAttribute('data-passa'); else el.setAttribute('data-passa', 'filtri:' + j);
  }
  function bboxVista() {
    var b = mappa.getBounds(), r = function (x) { return Math.round(x * 10000) / 10000; };
    return [r(Math.max(-90, b.getSouth())), r(Math.max(-180, b.getWest())), r(Math.min(90, b.getNorth())), r(Math.min(180, b.getEast()))];
  }

  function passa(a) {
    if (a.dataAsta && a.dataAsta < OGGI) return false;   // aste concluse: mai sulla mappa
    if (filtri.cat && a.categoria !== filtri.cat) return false;
    if (filtri.max && !(a.prezzoBase <= +filtri.max)) return false;
    if (filtri.libere && a.stato !== 'libero') return false;
    if (filtri.seguite && !seguite[a.id]) return false;
    if (filtri.pmin || filtri.conPunteggio) {
      var p = punti(a);
      if (p == null || (filtri.pmin && p < filtri.pmin)) return false;
    }
    if (extra.stato && !filtri.libere && a.stato !== extra.stato) return false;
    if (extra.regione && a.regione !== extra.regione) return false;
    if (extra.provincia && a.provincia !== extra.provincia) return false;
    if (extra.comune && senzaAccenti(a.comune) !== senzaAccenti(extra.comune)) return false;
    if (extra.tribunale && (a.tribunale || '').toLowerCase().indexOf(extra.tribunale.toLowerCase()) < 0) return false;
    if (extra.min && !(a.prezzoBase >= +extra.min)) return false;
    if (extra.dal && !(a.dataAsta >= extra.dal)) return false;
    if (extra.al && !(a.dataAsta <= extra.al)) return false;
    if (extra.bbox) {
      var b = extra.bbox;
      if (!conPosizione(a) || a.lat < b[0] || a.lat > b[2] || a.lng < b[1] || a.lng > b[3]) return false;
    }
    if (parole.length) {
      if (a._mTesto === undefined) {
        try { Object.defineProperty(a, '_mTesto', { value: senzaAccenti([a.titolo, a.tipo, a.comune, a.provincia, a.indirizzo, a.tribunale, a.rge, a.fonte, a.descrizione].join(' ')), writable: true, configurable: true, enumerable: false }); }
        catch (e) { return true; }
      }
      for (var i = 0; i < parole.length; i++) if (a._mTesto.indexOf(parole[i]) < 0) return false;
    }
    return true;
  }

  /* ---------- dati ---------- */
  function ricalcola() {
    OGGI = oggi();
    parole = senzaAccenti(extra.testo).split(/\s+/).filter(Boolean);
    correnti = []; sulMappa = []; perId = {}; statReg = {}; senzaPos = 0; senzaReg = 0;
    for (var i = 0; i < tutte.length; i++) {
      var a = tutte[i];
      if (!passa(a)) continue;
      correnti.push(a); perId[a.id] = a;
      var st = null;
      if (a.regione) st = statReg[a.regione] || (statReg[a.regione] = { n: 0, mappa: 0, somma: 0, campione: 0, migliore: null });
      else senzaReg++;
      var pos = conPosizione(a);
      if (pos) sulMappa.push(a); else senzaPos++;
      if (!st) continue;
      st.n++; if (pos) st.mappa++;
      var sc = sconto(a), p = punti(a);
      if (sc != null && AFFIDABILE[a.affidabilita]) { st.somma += sc; st.campione++; }
      if (p != null && (!st.migliore || migliore(a, st.migliore) < 0)) st.migliore = a;
    }
    costruisciIndice();
  }
  function costruisciIndice() {
    indice = null;
    if (!window.Supercluster) return;
    var feats = new Array(sulMappa.length);
    for (var i = 0; i < sulMappa.length; i++) {
      var a = sulMappa[i], p = punti(a);
      feats[i] = { type: 'Feature', properties: { i: i, p: p == null ? -1 : p }, geometry: { type: 'Point', coordinates: [a.lng, a.lat] } };
    }
    indice = new window.Supercluster({
      radius: TOCCO.matches ? 64 : 56, extent: 256, maxZoom: MAX_ZOOM_GRUPPI, minPoints: 2,
      map: function (pr) { return { best: pr.p }; },
      reduce: function (acc, pr) { if (pr.best > acc.best) acc.best = pr.best; }
    });
    indice.load(feats);
    generazione++;
  }

  /* ---------- marcatori ---------- */
  function marcatore(f) {
    var c = f.geometry.coordinates, pr = f.properties, m;
    if (pr.cluster) {
      var n = pr.point_count, best = pr.best >= 0 ? pr.best : null, fa = fascia(best);
      var d = n < 10 ? 34 : n < 100 ? 40 : n < 1000 ? 48 : 56;
      m = L.marker([c[1], c[0]], {
        icon: L.divIcon({ className: 'm-gruppo f-' + fa.chiave, iconSize: [d, d], html: '<span>' + breve(n) + '</span>' }),
        keyboard: false, riseOnHover: true, zIndexOffset: Math.round((best == null ? -1 : best) + 2) * 1000,
        title: aste(n) + (best != null ? ': il migliore ha ' + Math.round(best) + ' punti (' + fa.etichetta.toLowerCase() + ')' : ', nessuna con punteggio') + '. Clic per avvicinare.'
      });
      m._gruppo = pr.cluster_id;
      return m;
    }
    var a = sulMappa[pr.i], p = punti(a), fp = fascia(p), s = TOCCO.matches ? 36 : 24;
    m = L.marker([c[1], c[0]], {
      icon: L.divIcon({ className: 'm-punto f-' + fp.chiave + (a.id === scelta ? ' scelto' : ''), iconSize: [s, s], html: '<i></i>' }),
      keyboard: false, riseOnHover: true, zIndexOffset: Math.round((p == null ? -1 : p) + 2) * 1000,
      title: String(a.titolo || '').slice(0, 90) + ' · ' + (p == null ? 'senza punteggio' : Math.round(p) + '/100')
    });
    m._asta = a;
    return m;
  }
  function disegna() {
    if (!mappa || !indice) return;
    var b = mappa.getBounds().pad(0.35), z = Math.round(mappa.getZoom());
    var lista = indice.getClusters([Math.max(-180, b.getWest()), Math.max(-85, b.getSouth()), Math.min(180, b.getEast()), Math.min(85, b.getNorth())], Math.min(z, MAX_ZOOM_GRUPPI + 1));
    var visti = {}, nuovi = [], k;
    for (var i = 0; i < lista.length; i++) {
      var pr = lista[i].properties;
      k = generazione + (pr.cluster ? 'g' + pr.cluster_id : 'p' + pr.i);
      visti[k] = 1;
      if (!marcatori[k]) { marcatori[k] = marcatore(lista[i]); nuovi.push(marcatori[k]); }
    }
    for (k in marcatori) if (!visti[k]) { strato.removeLayer(marcatori[k]); delete marcatori[k]; }
    for (i = 0; i < nuovi.length; i++) strato.addLayer(nuovi[i]);
    if (!primi && lista.length) { primi = true; try { performance.mark('mappa-primi-marker'); } catch (e) {} }
  }
  function aggiornaScelto() {
    for (var k in marcatori) {
      var m = marcatori[k], el = m._asta && m.getElement && m.getElement();
      if (el) el.classList.toggle('scelto', m._asta.id === scelta);
    }
  }
  function segna(latlng) {
    if (!latlng) { if (segno) { mappa.removeLayer(segno); segno = null; } return; }
    if (!segno) segno = L.marker(latlng, { icon: L.divIcon({ className: 'm-segno', iconSize: [44, 44], html: '<span></span>' }), interactive: false, keyboard: false, zIndexOffset: 500000 }).addTo(mappa);
    else segno.setLatLng(latlng);
  }
  function suMarcatore(e) {
    var m = e.propagatedFrom || e.layer;
    if (!m) return;
    if (m._asta) { apriAsta(m._asta); return; }
    if (m._gruppo == null) return;
    var ez;
    try { ez = indice.getClusterExpansionZoom(m._gruppo); } catch (err) { ez = mappa.getZoom() + 2; }
    if (ez <= MAX_ZOOM_GRUPPI) vai(m.getLatLng(), Math.min(18, Math.max(ez, Math.floor(mappa.getZoom()) + 1)));
    else {
      // aste allo stesso indirizzo: non si separano avvicinando, si elencano
      var foglie = indice.getLeaves(m._gruppo, 300).map(function (f) { return sulMappa[f.properties.i]; }).filter(Boolean);
      mostraPunto(foglie, m.getLatLng());
    }
  }

  /* ---------- aggiornamento dopo ogni spostamento ---------- */
  function programma() {
    if (inAttesa) return;
    inAttesa = true;
    requestAnimationFrame(function () { inAttesa = false; aggiorna(); });
  }
  function aggiorna() {
    if (!datiPronti) return;
    disegna();
    aggiornaZona();
    linkElenco($('#mCercaZona'), perElenco(true));
    $('#mMappa').classList.toggle('regioni-attive', mappa.getZoom() <= (TOCCO.matches ? ZOOM_REGIONI_TOCCO : ZOOM_REGIONI_PUNTATORE));
    var c = mappa.getCenter();
    scriviSessione(K_VISTA, { c: [Math.round(c.lat * 1e5) / 1e5, Math.round(c.lng * 1e5) / 1e5], z: mappa.getZoom() });
  }

  /* ---------- "In questa zona" ---------- */
  function voce(a) {
    var p = punti(a), fa = fascia(p);
    var dett = [luogoBreve(a), a.prezzoBase ? U.eur(a.prezzoBase) : '', U.dataIt(a.dataAsta)].filter(Boolean).join(' · ');
    return '<li><button type="button" class="m-voce" data-id="' + esc(a.id) + '">' +
      '<span class="m-voto f-' + fa.chiave + '" aria-hidden="true">' + (p == null ? '–' : Math.round(p)) + '</span>' +
      '<span class="m-voce-t"><span class="sr-only">' + (p == null ? 'Senza punteggio. ' : 'Punteggio ' + Math.round(p) + ' su 100. ') + '</span><b>' + esc(a.titolo) + '</b><small>' + esc(dett) + '</small></span></button></li>';
  }
  function aggiornaZona() {
    var b = mappa.getBounds(), s = b.getSouth(), w = b.getWest(), n = b.getNorth(), e = b.getEast();
    var conta = 0, conP = 0, top = [], perData = [];
    for (var i = 0; i < sulMappa.length; i++) {
      var a = sulMappa[i];
      if (a.lat < s || a.lat > n || a.lng < w || a.lng > e) continue;
      conta++;
      if (punti(a) != null) { conP++; inserisci(top, a, migliore, 5); }
      else if (!conP) inserisci(perData, a, primaData, 5);
    }
    var lista = conP ? top : perData;
    $('#mZonaN').innerHTML = conta ? '<b>' + num(conta) + '</b> ' + (conta === 1 ? 'asta' : 'aste') + ' con posizione in questa zona' : 'Nessuna asta con posizione in questa zona: allontana la mappa o cambia i filtri.';
    $('#mZonaTitolo').textContent = !conta ? '' : conP ? (conP === 1 ? 'L\'unica con punteggio' : 'Le ' + Math.min(5, conP) + ' migliori per punteggio') :
      'Nessuna ha ancora un punteggio: ecco le prime per data dell\'asta';
    // l'elenco si riscrive: chi lo usa da tastiera resta sulla stessa voce
    var att = document.activeElement, idFuoco = att && att.closest && att.closest('#mMigliori') ? att.getAttribute('data-id') : null;
    $('#mMigliori').innerHTML = lista.map(voce).join('');
    if (idFuoco) { var el = $$('#mMigliori .m-voce').filter(function (x) { return x.getAttribute('data-id') === idFuoco; })[0]; fuoco(el || $('#mMigliori .m-voce') || $('#mCercaZona')); }
    $('#mPillTesto').innerHTML = '<b>' + breve(conta) + '</b> ' + (conta === 1 ? 'asta' : 'aste') + ' qui · le migliori';
    $('#mApriZona').setAttribute('aria-label', 'In questa zona: ' + aste(conta) + ' con posizione. Apri le migliori');
  }

  /* ---------- anteprima ---------- */
  function htmlAnello(a) {
    var p = punti(a), fa = fascia(p);
    if (p == null) return '<div class="anello vuoto" style="--d:60px" role="img" aria-label="Senza punteggio"><b aria-hidden="true">n.d.</b></div>';
    p = Math.round(p);
    return '<div class="anello" style="--d:60px;--v:' + p + ';--c:var(--m-' + fa.chiave + ')" role="img" aria-label="Punteggio affare ' + p + ' su 100"><b aria-hidden="true">' + p + '</b></div>';
  }
  function htmlAnteprima(a, ritorno) {
    var p = punti(a), fa = fascia(p), cat = ICONA_CAT[a.categoria] ? a.categoria : 'beni';
    var avviso = U.linkSicuro(a.linkAvviso), sc = sconto(a), q = U.quando ? U.quando(a.dataAsta) : '';
    var min = a.offertaMinima;
    if (!min && a.prezzoBase && window.Calcoli && window.Calcoli.offertaMinima && window.TARIFFE) { try { min = window.Calcoli.offertaMinima(a.prezzoBase, window.TARIFFE); } catch (e) { min = null; } }
    var aff = AFFIDABILE[a.affidabilita] || a.affidabilita === 'bassa' ? ' <small>affidabilità ' + esc(a.affidabilita) + '</small>' : '';
    var testa = '<div class="m-foglio-testa">' + MANIGLIA +
      (ritorno ? '<button class="m-indietro" type="button" data-indietro>' + U.icona('indietro') + '<span>Le ' + ritorno + ' aste del punto</span></button>' : '<span class="m-eti">Anteprima</span>') + CHIUDI + '</div>';
    return testa + '<div class="m-foglio-corpo">' +
      '<figure class="m-foto m-cop-' + cat + '" id="mFoto">' + U.icona(ICONA_CAT[cat], 'icona-cat') +
        '<figcaption>' + esc(NOMI_CAT[cat] + (a.tipo && a.tipo !== NOMI_CAT[cat] ? ' · ' + a.tipo : '')) + '</figcaption></figure>' +
      '<div class="m-prev-testa">' + htmlAnello(a) + '<div class="m-prev-titolo"><p class="m-fascia f-' + fa.chiave + '">' + esc(fa.etichetta) +
        (p != null && a.punteggioCompleto === false ? ' · parziale' : '') + '</p><h2 id="hScheda" tabindex="-1">' + esc(a.titolo) + '</h2></div></div>' +
      (luogo(a) ? '<p class="m-luogo">' + U.icona('luogo') + '<span>' + esc(luogo(a)) + '</span></p>' : '') +
      '<dl class="kv m-kv">' +
        '<div><dt>' + (a.fonte === 'Agenzia del Demanio' ? 'Termine offerte' : 'Data asta') + '</dt><dd>' + U.dataIt(a.dataAsta) + (a.ora ? ' ' + esc(a.ora) : '') + (q ? ' <small>(' + esc(q) + ')</small>' : '') + '</dd></div>' +
        '<div><dt>Prezzo base</dt><dd>' + (a.prezzoBase ? U.eur(a.prezzoBase) : '<span class="muted">nell\'avviso</span>') + '</dd></div>' +
        '<div><dt>Offerta minima</dt><dd>' + (min ? U.eur(min) : '—') + '</dd></div>' +
        '<div><dt>Sconto sul valore</dt><dd>' + (sc != null ? U.pct(sc, 0) + aff : '<span class="muted">non stimato</span>') + '</dd></div>' +
      '</dl>' +
      (p == null ? '<p class="m-nota">Senza punteggio: per calcolarlo serve il valore di mercato (stima del perito o prezzo della prima asta), non ancora disponibile per questa asta. Non lo inventiamo.</p>' : '') +
      '<div class="m-azioni"><a class="btn" href="scheda.html?id=' + encodeURIComponent(a.id) + '" data-passa="id:' + esc(a.id) + '">Apri la scheda' + U.icona('freccia') + '</a>' +
        (avviso ? '<a class="btn ghost" href="' + esc(avviso) + '" target="_blank" rel="noopener">Avviso originale' + U.icona('esterno') + '<span class="sr-only"> (si apre in una nuova scheda)</span></a>' : '<span class="muted">Link all\'avviso mancante</span>') +
      '</div></div>';
  }
  function primaFoto(d) {
    var l = d && d.foto ? [].concat(d.foto) : [];
    for (var i = 0; i < l.length; i++) {
      var u = typeof l[i] === 'string' ? l[i] : l[i] && (l[i].url || l[i].src);
      if (U.linkSicuro(u)) return u;
    }
    return null;
  }
  // prima foto della scheda a pezzi (solo se l'asta dice di averne: niente richieste inutili)
  function caricaFoto(a) {
    var fig = $('#mFoto'), D = window.Dettagli;
    if (!fig) return;
    var subito = primaFoto(a);
    var attesa = subito ? Promise.resolve({ foto: [subito] }) : D && Number(a.nFoto) > 0 ? D.carica(a.id) : null;
    if (!attesa) return;
    fig.classList.add('in-carico');
    attesa.then(function (d) {
      if (scelta !== a.id || !fig.isConnected) return;
      var u = primaFoto(d), tot = d && (d.fotoTotali || (d.foto && d.foto.length)) || Number(a.nFoto) || 0;
      if (!u) { fig.classList.remove('in-carico'); return; }
      var img = document.createElement('img');
      img.alt = 'Foto dall\'avviso: ' + String(a.titolo || '').slice(0, 80);
      img.loading = 'lazy'; img.decoding = 'async';
      img.referrerPolicy = 'no-referrer'; img.setAttribute('referrerpolicy', 'no-referrer');
      img.addEventListener('load', function () { fig.classList.remove('in-carico'); fig.classList.add('con-foto'); });
      img.addEventListener('error', function () {
        img.remove(); fig.classList.remove('in-carico'); fig.classList.add('foto-ko');
        var c = fig.querySelector('figcaption'); if (c) c.insertAdjacentHTML('beforeend', '<small>Foto non disponibile</small>');
      });
      img.src = u;
      fig.insertBefore(img, fig.firstChild);
      if (tot > 1) fig.insertAdjacentHTML('beforeend', '<span class="m-nfoto">' + num(tot) + ' foto nella scheda</span>');
    }, function () { fig.classList.remove('in-carico'); });
  }
  function apriAsta(a, ritorno) {
    if (!a) return;
    if (!ritorno) elencoPunto = null;
    var att = document.activeElement;
    if (att && att !== document.body && !$('#mScheda').contains(att)) ritornoFuoco = att;
    scelta = a.id;
    var el = $('#mScheda');
    el.innerHTML = htmlAnteprima(a, ritorno && elencoPunto ? elencoPunto.length : 0);
    el.setAttribute('aria-labelledby', 'hScheda');
    apriFoglio('scheda');
    caricaFoto(a);
    aggiornaScelto();
    if (conPosizione(a)) segna([a.lat, a.lng]);
    fuoco($('#hScheda'));
  }
  function mostraPunto(lista, latlng) {
    lista.sort(migliore);
    elencoPunto = lista; scelta = null; aggiornaScelto();
    var att = document.activeElement;
    if (att && att !== document.body && !$('#mScheda').contains(att)) ritornoFuoco = att;
    var el = $('#mScheda');
    el.innerHTML = '<div class="m-foglio-testa">' + MANIGLIA + '<span class="m-eti">Stesso punto</span>' + CHIUDI + '</div>' +
      '<div class="m-foglio-corpo"><h2 id="hScheda" tabindex="-1" class="m-punto-titolo">' + aste(lista.length) + ' in questo punto</h2>' +
      '<p class="note">Hanno le stesse coordinate (spesso più lotti dello stesso immobile): scegli quella da vedere.</p>' +
      '<ol class="m-voci">' + lista.map(voce).join('') + '</ol></div>';
    apriFoglio('scheda');
    segna(latlng);
    fuoco($('#hScheda'));
  }

  /* ---------- regioni ---------- */
  function colori() {
    var cs = getComputedStyle(document.documentElement), v = function (n, d) { return cs.getPropertyValue(n).trim() || d; };
    return { accento: v('--accent', '#2b55f0'), terra: v('--mappa-terra', '#e4eaf4'), bordo: v('--mappa-bordo', '#b6c2d8'), sopra: v('--mappa-hover', '#d3ddff') };
  }
  var COL = null;
  function stileRegione(f) {
    var nome = f && f.properties ? nomeRegione(f.properties.regione) : null;
    var acceso = nome && (nome === regioneSopra || nome === regioneFissa);
    if (!COL) COL = colori();
    if (fallback) return { className: 'm-reg', color: acceso ? COL.accento : COL.bordo, weight: acceso ? 2.2 : 1, opacity: 1, fillColor: acceso ? COL.sopra : COL.terra, fillOpacity: 1 };
    return { className: 'm-reg', color: COL.accento, weight: acceso ? 2.2 : 0, opacity: acceso ? 0.9 : 0, fillColor: COL.accento, fillOpacity: acceso ? 0.08 : 0 };
  }
  function ristilizza() { if (confini) confini.setStyle(stileRegione); }
  function statoRegione(nome) { return statReg[nome] || { n: 0, mappa: 0, somma: 0, campione: 0, migliore: null }; }
  function htmlRegione(nome, fissa) {
    var s = statoRegione(nome), m = s.migliore, pm = m ? punti(m) : null;
    var senza = s.n - s.mappa;
    var righe = '<div><dt>Aste</dt><dd><b>' + num(s.n) + '</b>' + (s.n ? '<small>' + (senza ? num(s.mappa) + ' sulla mappa, ' + num(senza) + ' senza posizione precisa' : 'tutte sulla mappa') + '</small>' : '<small>nessuna con questi filtri</small>') + '</dd></div>' +
      '<div><dt>Sconto medio</dt><dd>' + (s.campione ? '<b>' + U.pct(s.somma / s.campione, 0) + '</b><small>su ' + aste(s.campione) + ' con sconto e valore di affidabilità media o alta</small>' : '<span class="muted">non calcolabile</span><small>nessuna asta con sconto e valore affidabile</small>') + '</dd></div>' +
      '<div><dt>Miglior affare</dt><dd>' + (m ? '<a href="scheda.html?id=' + encodeURIComponent(m.id) + '" data-passa="id:' + esc(m.id) + '">' + esc(m.titolo) + '</a><span class="m-voto f-' + fascia(pm).chiave + '">' + Math.round(pm) + '/100</span>' : '<span class="muted">nessuna asta con punteggio</span>') + '</dd></div>';
    var fr = copia(perElenco(false)); fr.regione = nome; delete fr.provincia; delete fr.comune; delete fr.bbox;
    return '<div class="m-foglio-testa">' + MANIGLIA + '<h2 id="hRegione">' + esc(nome) + '</h2>' + (fissa ? CHIUDI : '') + '</div>' +
      '<div class="m-foglio-corpo"><dl class="m-reg-dati">' + righe + '</dl>' +
      (fissa ? '<div class="m-azioni"><button class="btn small ghost" type="button" data-avvicina>' + U.icona('cerca') + 'Avvicina</button>' +
        '<a class="btn small ghost" data-elenco-regione href="aste.html">Apri nell\'elenco</a></div>'
        : '<p class="m-suggerimento">Clic sulla regione per fissare il riquadro.</p>') + '</div>' +
      '<script type="application/json" data-filtri>' + esc(JSON.stringify(fr)) + '</script>';
  }
  function mostraRegione(nome, fissa) {
    var el = $('#mRegione');
    clearTimeout(timerRegione);
    el.innerHTML = htmlRegione(nome, fissa);
    var j = el.querySelector('[data-filtri]'), a = el.querySelector('[data-elenco-regione]');
    if (j && a) { try { linkElenco(a, JSON.parse(j.textContent)); } catch (e) {} }
    if (j) j.remove();
    el.classList.toggle('fissa', !!fissa);
    if (fissa) apriFoglio('regione'); else el.setAttribute('data-aperto', '');
  }
  function nascondiRegione() {
    if (regioneFissa) return;
    var el = $('#mRegione');
    el.removeAttribute('data-aperto');
  }
  function suRegione(layer, tipo, e) {
    var nome = layer._nome, z = mappa.getZoom();
    if (tipo === 'sopra') {
      if (TOCCO.matches || z > ZOOM_REGIONI_PUNTATORE) return;
      regioneSopra = nome; layer.setStyle(stileRegione(layer.feature)); layer.bringToFront && fallback && layer.bringToFront();
      if (!regioneFissa) mostraRegione(nome, false);
    } else if (tipo === 'fuori') {
      if (regioneSopra === nome) { regioneSopra = null; layer.setStyle(stileRegione(layer.feature)); }
      if (!regioneFissa) { clearTimeout(timerRegione); timerRegione = setTimeout(nascondiRegione, 260); }
    } else if (tipo === 'clic') {
      if (z > (TOCCO.matches ? ZOOM_REGIONI_TOCCO : ZOOM_REGIONI_PUNTATORE)) return;
      L.DomEvent.stopPropagation(e);
      regioneFissa = nome; ristilizza();
      mostraRegione(nome, true);
    }
  }
  function creaConfini() {
    if (!window.ITALIA_REGIONI) return;
    confini = L.geoJSON(window.ITALIA_REGIONI, {
      style: stileRegione,
      onEachFeature: function (f, layer) {
        layer._nome = nomeRegione(f.properties && f.properties.regione);
        layer.on('mouseover', function (e) { suRegione(layer, 'sopra', e); });
        layer.on('mouseout', function (e) { suRegione(layer, 'fuori', e); });
        layer.on('click', function (e) { suRegione(layer, 'clic', e); });
      }
    }).addTo(mappa);
    mappa.attributionControl.addAttribution('Confini: <a href="https://www.istat.it/" target="_blank" rel="noopener">ISTAT</a> (CC BY)');
  }
  function confiniDi(nome) {
    var b = null;
    if (confini) confini.eachLayer(function (l) { if (l._nome === nome) b = l.getBounds(); });
    return b;
  }

  /* ---------- sfondo bloccato: confini e nomi delle regioni ---------- */
  // punto "più interno" del poligono più grande (lontano dai bordi): lì va il nome
  function puntoEtichetta(geom) {
    var poli = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates, best = null, area = 0;
    poli.forEach(function (p) {
      var r = p[0], s = 0;
      for (var i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
      if (Math.abs(s) > area) { area = Math.abs(s); best = p; }
    });
    if (!best) return null;
    var anello = best[0], o = Infinity, e = -Infinity, s2 = Infinity, n = -Infinity;
    anello.forEach(function (c) { o = Math.min(o, c[0]); e = Math.max(e, c[0]); s2 = Math.min(s2, c[1]); n = Math.max(n, c[1]); });
    var k = Math.cos((s2 + n) / 2 * Math.PI / 180), passi = 18, migl = null, dMax = -1;
    function dentro(x, y) {
      var d = false;
      best.forEach(function (r) {
        for (var i = 0, j = r.length - 1; i < r.length; j = i++) {
          if ((r[i][1] > y) !== (r[j][1] > y) && x < (r[j][0] - r[i][0]) * (y - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) d = !d;
        }
      });
      return d;
    }
    function distanza(x, y) {
      var m = Infinity;
      for (var i = 0, j = anello.length - 1; i < anello.length; j = i++) {
        var ax = anello[j][0] * k, ay = anello[j][1], bx = anello[i][0] * k, by = anello[i][1], px = x * k;
        var dx = bx - ax, dy = by - ay, t = dx || dy ? ((px - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy) : 0;
        t = Math.max(0, Math.min(1, t));
        var qx = ax + t * dx - px, qy = ay + t * dy - y, d2 = qx * qx + qy * qy;
        if (d2 < m) m = d2;
      }
      return m;
    }
    for (var a = 0; a <= passi; a++) for (var b = 0; b <= passi; b++) {
      var x = o + (e - o) * a / passi, y = s2 + (n - s2) * b / passi;
      if (!dentro(x, y)) continue;
      var d = distanza(x, y);
      if (d > dMax) { dMax = d; migl = [y, x]; }
    }
    return migl || [(s2 + n) / 2, (o + e) / 2];
  }
  function mostraEtichette() {
    if (etichette || !window.ITALIA_REGIONI) return;
    etichette = L.layerGroup();
    window.ITALIA_REGIONI.features.forEach(function (f) {
      var p = puntoEtichetta(f.geometry); if (!p) return;
      etichette.addLayer(L.marker(p, { pane: 'etichette', interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'm-etichetta', iconSize: [0, 0], html: '<span>' + esc(nomeRegione(f.properties.regione)) + '</span>' }) }));
    });
    etichette.addTo(mappa);
  }
  function attivaFallback(definitivo) {
    if (definitivo && sfondo && mappa.hasLayer(sfondo)) mappa.removeLayer(sfondo);  // basta richieste che falliscono
    if (fallback) return;
    fallback = true;
    $('#mMappa').classList.add('senza-sfondo');
    ristilizza(); mostraEtichette();
    var chiuso = leggiSessione(K_AVVISO), el = $('#mAvviso');
    if (chiuso) return;
    el.innerHTML = U.icona('mappa') + '<span>Sfondo della mappa non disponibile qui: mostro confini e nomi delle regioni.</span><button class="m-x" type="button" data-chiudi-avviso aria-label="Chiudi l\'avviso">' + U.icona('chiudi') + '</button>';
    el.hidden = false;
  }
  function esciFallback() {
    if (!fallback) return;
    fallback = false;
    $('#mMappa').classList.remove('senza-sfondo');
    if (etichette) { mappa.removeLayer(etichette); etichette = null; }
    ristilizza();
    $('#mAvviso').hidden = true;
  }

  /* ---------- fogli (telefono) e pannelli (computer) ---------- */
  var FOGLI = { filtri: '#mFiltri', zona: '#mZona', scheda: '#mScheda', regione: '#mRegione' };
  function aperto(nome) { var el = $(FOGLI[nome]); return !!el && el.hasAttribute('data-aperto'); }
  function apriFoglio(nome) {
    var el = $(FOGLI[nome]);
    if (TELEFONO.matches) Object.keys(FOGLI).forEach(function (k) { if (k !== nome) chiudiFoglio(k, true); });
    if (!el.hasAttribute('data-aperto')) { void el.offsetWidth; el.setAttribute('data-aperto', ''); }
    el.style.removeProperty('--trascina');
    if (nome === 'filtri' && TELEFONO.matches) {
      $('#mVelo').hidden = false;
      $('#mApriFiltri').setAttribute('aria-expanded', 'true');
      if (U.finestra && U.apriFinestra) { U.finestra(el, function () { chiudiFoglio('filtri'); }, 'Filtri della mappa'); U.apriFinestra(el, $('#mCat .chip[aria-pressed="true"]')); }
      else fuoco($('#mCat .chip'));
    }
    if (nome === 'zona') $('#mApriZona').setAttribute('aria-expanded', 'true');
    if (nome === 'scheda' && !TELEFONO.matches) { var sc = $('.m-lato-scorri'); sc.inert = true; sc.setAttribute('inert', ''); }
  }
  function chiudiFoglio(nome, silenzioso) {
    var el = $(FOGLI[nome]);
    if (!el || !el.hasAttribute('data-aperto')) return;
    el.removeAttribute('data-aperto');
    el.style.removeProperty('--trascina');
    if (nome === 'filtri') {
      $('#mVelo').hidden = true;
      $('#mApriFiltri').setAttribute('aria-expanded', 'false');
      if (U.chiudiFinestra) U.chiudiFinestra(el, silenzioso);
    }
    if (nome === 'zona') $('#mApriZona').setAttribute('aria-expanded', 'false');
    if (nome === 'scheda') {
      scelta = null; elencoPunto = null; segna(null); aggiornaScelto();
      var sc = $('.m-lato-scorri'); sc.inert = false; sc.removeAttribute('inert');
      if (!silenzioso && ritornoFuoco && document.contains(ritornoFuoco) && ritornoFuoco.getClientRects().length) fuoco(ritornoFuoco);
      else if (!silenzioso) fuoco($('#map'));
      ritornoFuoco = null;
    }
    if (nome === 'regione') { regioneFissa = null; el.classList.remove('fissa'); ristilizza(); }
  }
  // su computer filtri e zona sono sempre visibili nella colonna; su telefono sono fogli
  function adattaLayout() {
    var f = $('#mFiltri');
    if (!TELEFONO.matches) {
      if (aperto('filtri')) chiudiFoglio('filtri', true);
      f.inert = false; f.removeAttribute('inert'); f.removeAttribute('role'); f.removeAttribute('aria-modal'); f.removeAttribute('aria-label');
      if (aperto('zona')) chiudiFoglio('zona', true);
      if (aperto('scheda')) { var sc = $('.m-lato-scorri'); sc.inert = true; sc.setAttribute('inert', ''); }
    } else {
      var s2 = $('.m-lato-scorri'); s2.inert = false; s2.removeAttribute('inert');
    }
    misuraTesta();
    if (mappa) { mappa.invalidateSize({ pan: false }); programma(); }
  }
  // trascinare giù un foglio lo chiude (come il foglio "Altro"); il contenuto scorre se non è in cima
  function trascinabile(el, nome) {
    var y0 = null, dy = 0;
    el.addEventListener('touchstart', function (e) {
      if (!TELEFONO.matches || e.touches.length > 1) return;
      var corpo = el.querySelector('.m-foglio-corpo');
      if (e.target.closest('input, select, textarea') || (corpo && corpo.contains(e.target) && corpo.scrollTop > 0)) return;
      y0 = e.touches[0].clientY; dy = 0;
    }, { passive: true });
    el.addEventListener('touchmove', function (e) {
      if (y0 === null) return;
      dy = Math.max(0, e.touches[0].clientY - y0);
      if (dy > 4) { el.classList.add('trascino'); el.style.setProperty('--trascina', dy + 'px'); }
    }, { passive: true });
    function fine() {
      if (y0 === null) return;
      y0 = null; el.classList.remove('trascino');
      if (dy > 80) chiudiFoglio(nome); else el.style.removeProperty('--trascina');
    }
    el.addEventListener('touchend', fine);
    el.addEventListener('touchcancel', fine);
  }
  function misuraTesta() {
    var h = $('#site-header');
    if (h && h.offsetHeight) document.documentElement.style.setProperty('--m-testa', h.offsetHeight + 'px');
  }

  /* ---------- controlli dei filtri ---------- */
  function riempiPunteggio() {
    var s = soglie(), sel = $('#mPunt'), v = String(filtri.pmin || 0);
    var opz = [['0', 'Qualsiasi']];
    if (s.medio != null) opz.push([String(s.medio), fascia(s.medio).etichetta + ' o meglio (' + s.medio + '+)']);
    if (s.buono != null) opz.push([String(s.buono), fascia(s.buono).etichetta + ' o meglio (' + s.buono + '+)']);
    if (s.ottimo != null) opz.push([String(s.ottimo), 'Solo ' + fascia(s.ottimo).etichetta.toLowerCase() + ' (' + s.ottimo + '+)']);
    if (!opz.some(function (o) { return o[0] === v; })) opz.push([v, 'Almeno ' + v + ' punti']);
    sel.innerHTML = opz.map(function (o) { return '<option value="' + o[0] + '">' + esc(o[1]) + '</option>'; }).join('');
    sel.value = v;
  }
  function sincronizza() {
    $$('#mCat .chip').forEach(function (c) { c.setAttribute('aria-pressed', String(c.dataset.cat === filtri.cat)); });
    var sm = $('#mMax');
    if (filtri.max && !sm.querySelector('option[value="' + filtri.max + '"]')) sm.insertAdjacentHTML('beforeend', '<option value="' + esc(filtri.max) + '">' + U.eur(+filtri.max) + '</option>');
    sm.value = filtri.max || '';
    riempiPunteggio();
    $('#mLibere').checked = !!filtri.libere; $('#mConPunt').checked = !!filtri.conPunteggio; $('#mSeguite').checked = !!filtri.seguite;
    var et = [], E = extra;
    if (E.testo) et.push(['testo', 'Parole: «' + E.testo + '»']);
    if (E.regione) et.push(['regione', E.regione]);
    if (E.provincia) et.push(['provincia', 'Provincia: ' + (G.province[E.provincia] ? G.province[E.provincia].nome : E.provincia)]);
    if (E.comune) et.push(['comune', 'Comune: ' + E.comune]);
    if (E.tribunale) et.push(['tribunale', 'Tribunale: ' + E.tribunale]);
    if (E.min) et.push(['min', 'Prezzo da ' + U.eur(+E.min)]);
    if (E.dal) et.push(['dal', 'Asta dal ' + U.dataIt(E.dal)]);
    if (E.al) et.push(['al', 'Asta entro il ' + U.dataIt(E.al)]);
    if (E.stato) et.push(['stato', 'Stato: ' + (U.STATI[E.stato] || E.stato)]);
    if (E.bbox) et.push(['bbox', 'Zona scelta sulla mappa']);
    var box = $('#mDaElenco');
    box.hidden = !et.length && !E.nuove;
    box.innerHTML = (et.length ? '<p class="m-daelenco-t">Dall\'elenco</p><div class="chips">' + et.map(function (x) {
      return '<button class="chip m-togli" type="button" data-togli="' + x[0] + '" aria-label="Togli il filtro ' + esc(x[1]) + '">' + esc(x[1]) + U.icona('chiudi') + '</button>';
    }).join('') + '</div>' : '') + (E.nuove ? '<p class="note">Il filtro "solo nuove" dell\'elenco non si applica alla mappa.</p>' : '');
    var n = filtriAttivi();
    $('#mAzzera').hidden = !n;
    var b = $('#mNFiltri'); b.hidden = !n; b.textContent = n;
    $('#mApriFiltri').setAttribute('aria-label', n ? 'Filtri: ' + n + ' attivi' : 'Filtri');
  }
  function cambiaFiltri() {
    salvaFiltri(); sincronizza();
    if (!datiPronti) return;
    ricalcola(); dopoRicalcolo();
  }
  function dopoRicalcolo() {
    for (var k in marcatori) strato.removeLayer(marcatori[k]);
    marcatori = {};
    if (scelta && !perId[scelta]) chiudiFoglio('scheda', true);
    sintesi(); linkElenco($('#mApriElenco'), perElenco(false));
    if (regioneFissa) mostraRegione(regioneFissa, true);
    else if ($('#mRegione').hasAttribute('data-aperto') && regioneSopra) mostraRegione(regioneSopra, false);
    var daGeo = correnti.filter(daGeocodificare), bg = $('#geocodifica');
    bg.hidden = !daGeo.length;
    if (!bg.disabled) bg.textContent = 'Posiziona con precisione le tue aste (' + daGeo.length + ')';
    aggiorna();
  }
  function sintesi() {
    var n = correnti.length, f = filtriAttivi();
    var el = $('#mSintesi'), barra = $('#mBarraSintesi'), senza = $('#mSenza'), senzaZ = $('#mSenzaZona');
    if (!tutte.length) {
      el.innerHTML = 'Nessuna asta da mostrare: non ci sono aste raccolte dalle fonti ufficiali né inserite da te. Qui non compaiono mai dati di esempio. <a href="fonti.html">Stato delle fonti</a>';
      barra.textContent = 'Nessuna asta'; senza.hidden = true; if (senzaZ) senzaZ.hidden = true; return;
    }
    if (!n) {
      el.innerHTML = 'Nessuna asta in corso corrisponde ai filtri scelti.';
      barra.textContent = 'Nessuna asta con questi filtri'; senza.hidden = true; if (senzaZ) senzaZ.hidden = true; return;
    }
    el.innerHTML = '<b>' + num(n) + '</b> ' + (n === 1 ? 'asta in corso' : 'aste in corso') + (f ? ' con questi filtri' : '') + ' · <b>' + num(sulMappa.length) + '</b> sulla mappa';
    barra.textContent = breve(n) + ' aste · ' + breve(sulMappa.length) + ' sulla mappa';
    var t = senzaPos ? aste(senzaPos) + ' senza posizione precisa: contate nella loro regione' + (senzaReg ? ' (' + num(senzaReg) + ' senza regione, solo nel totale)' : '') + '.' : '';
    senza.textContent = t; senza.hidden = !t;
    if (senzaZ) { senzaZ.textContent = t; senzaZ.hidden = !t; }
  }
  function legenda() {
    var s = soglie(), ord = ['ottimo', 'buono', 'medio', 'basso'], voci = [];
    ord.forEach(function (k, i) {
      if (s[k] == null) return;
      var sup = null;
      for (var j = i - 1; j >= 0; j--) if (s[ord[j]] != null) { sup = s[ord[j]] - 1; break; }
      voci.push('<li><i class="m-dot f-' + k + '" aria-hidden="true"></i>' + esc(fascia(s[k]).etichetta) + '<span>' + (sup == null ? s[k] + '+' : s[k] + '–' + sup) + '</span></li>');
    });
    voci.push('<li><i class="m-dot f-nd" aria-hidden="true"></i>Senza punteggio</li>');
    return '<p class="m-legenda-t">Punteggio affare</p><ul>' + voci.join('') + '</ul><p class="m-legenda-n">Un gruppo ha il colore del suo affare migliore.</p>';
  }

  /* ---------- geocodifica delle aste inserite a mano (Nominatim, 1 richiesta al secondo) ---------- */
  function daGeocodificare(a) { return a.origine === 'manuale' && !conPosizione(a) && (a.indirizzo || a.comune); }
  function geocodifica() {
    var coda = correnti.filter(daGeocodificare), btn = $('#geocodifica'), ok = 0, i = 0;
    if (!coda.length || btn.disabled) return;
    btn.disabled = true;
    (function prossima() {
      if (i >= coda.length) {
        btn.disabled = false; tutte = window.Store.aste(); ricalcola(); dopoRicalcolo();
        U.toast('Posizionate ' + ok + ' aste su ' + coda.length); return;
      }
      var a = coda[i++];
      var q = [a.indirizzo, a.comune, a.provincia && G.province[a.provincia] ? G.province[a.provincia].nome : ''].filter(Boolean).join(', ');
      btn.textContent = 'Cerco ' + i + ' di ' + coda.length + '…';
      fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=it&q=' + encodeURIComponent(q), { headers: { 'Accept-Language': 'it' } })
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (j) { if (j && j[0]) { window.Store.aggiorna(a.id, { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon) }); ok++; } })
        .catch(function () {})
        .then(function () { setTimeout(prossima, 1100); });
    })();
  }

  /* ---------- avvio ---------- */
  function creaMappa() {
    var calmo = CALMO.matches;
    mappa = L.map('map', {
      zoomControl: false, zoomSnap: 0.25, zoomDelta: 1, wheelPxPerZoomLevel: 110, minZoom: 4, maxZoom: 19,
      maxBounds: LIMITI, maxBoundsViscosity: 0.8, zoomAnimation: !calmo, fadeAnimation: !calmo, markerZoomAnimation: !calmo, inertia: !calmo,
      tapTolerance: 18
    });
    mappa.createPane('etichette').style.zIndex = 450;
    L.control.zoom({ position: 'topright', zoomInText: U.icona('piu'), zoomOutText: MENO, zoomInTitle: 'Avvicina', zoomOutTitle: 'Allontana' }).addTo(mappa);
    var Casa = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function () {
        var d = L.DomUtil.create('div', 'leaflet-bar m-casa'), a = L.DomUtil.create('a', '', d);
        a.href = '#'; a.title = 'Italia intera'; a.setAttribute('role', 'button'); a.setAttribute('aria-label', 'Mostra l\'Italia intera');
        a.innerHTML = U.icona('mappa');
        L.DomEvent.disableClickPropagation(d);
        L.DomEvent.on(a, 'click', function (e) { L.DomEvent.preventDefault(e); adatta(ITALIA); });
        return d;
      }
    });
    new Casa().addTo(mappa);
    sfondo = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, className: 'm-tile',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    });
    sfondo.on('tileload', function () { tileOk++; if (fallback && mappa.hasLayer(sfondo)) esciFallback(); });
    sfondo.on('tileerror', function () { tileKo++; if (!tileOk && tileKo >= 3) attivaFallback(true); });
    sfondo.addTo(mappa);
    setTimeout(function () { if (!tileOk) attivaFallback(false); }, 6000);
    creaConfini();
    strato = L.featureGroup().addTo(mappa);
    strato.on('click', suMarcatore);
    mappa.on('moveend', programma);
    mappa.on('click', function () {
      if (regioneFissa) chiudiFoglio('regione');
      if (TELEFONO.matches) { chiudiFoglio('scheda', true); chiudiFoglio('zona', true); }
    });
    // vista iniziale: l'Italia intera su qualunque schermo (tornando indietro, dove si era)
    var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0], v = leggiSessione(K_VISTA);
    if (nav && nav.type === 'back_forward' && v && v.c && isFinite(v.z)) mappa.setView(v.c, v.z, { animate: false });
    else mappa.fitBounds(ITALIA, paddingVista());
  }

  function vistaDaFiltri() {
    if (extra.bbox) { var b = extra.bbox; adatta([[b[0], b[1]], [b[2], b[3]]]); return; }
    if (extra.provincia || extra.comune || extra.tribunale) {
      if (sulMappa.length) { adatta(L.latLngBounds(sulMappa.map(function (a) { return [a.lat, a.lng]; }))); return; }
      var pr = G.province[extra.provincia]; if (pr) { vai([pr.lat, pr.lng], 9); return; }
    }
    if (extra.regione) { var r = confiniDi(extra.regione); if (r) adatta(r); }
  }

  function eventi() {
    $('#mCat').addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      filtri.cat = b.dataset.cat; cambiaFiltri();
    });
    $('#mMax').addEventListener('change', function () { filtri.max = this.value; cambiaFiltri(); });
    $('#mPunt').addEventListener('change', function () { filtri.pmin = +this.value || 0; cambiaFiltri(); });
    $('#mLibere').addEventListener('change', function () { filtri.libere = this.checked; cambiaFiltri(); });
    $('#mConPunt').addEventListener('change', function () { filtri.conPunteggio = this.checked; cambiaFiltri(); });
    $('#mSeguite').addEventListener('change', function () { filtri.seguite = this.checked; cambiaFiltri(); });
    $('#mDaElenco').addEventListener('click', function (e) {
      var b = e.target.closest('[data-togli]'); if (!b) return;
      delete extra[b.getAttribute('data-togli')];
      cambiaFiltri();
      fuoco($('#mDaElenco [data-togli]') || $('#mCat .chip[aria-pressed="true"]'));
    });
    $('#mAzzera').addEventListener('click', function () { filtri = copia(VUOTI); extra = {}; cambiaFiltri(); fuoco($('#mCat .chip')); });
    $('#geocodifica').addEventListener('click', geocodifica);
    $('#mApriFiltri').addEventListener('click', function () { if (aperto('filtri')) chiudiFoglio('filtri'); else apriFoglio('filtri'); });
    $('#mApriZona').addEventListener('click', function () { if (aperto('zona')) chiudiFoglio('zona'); else { apriFoglio('zona'); fuoco($('#hZona')); } });
    $('#mVelo').addEventListener('click', function () { chiudiFoglio('filtri'); });
    // elenchi di aste (zona e stesso punto)
    document.addEventListener('click', function (e) {
      var v = e.target.closest && e.target.closest('.m-voce');
      if (v) { apriAsta(perId[v.getAttribute('data-id')], v.closest('#mScheda') ? true : false); return; }
      var x = e.target.closest && e.target.closest('[data-chiudi]');
      if (x) { var f = x.closest('.m-foglio'); if (f) chiudiFoglio(Object.keys(FOGLI).filter(function (k) { return $(FOGLI[k]) === f; })[0]); return; }
      if (e.target.closest && e.target.closest('[data-indietro]') && elencoPunto) { mostraPunto(elencoPunto, segno && segno.getLatLng()); return; }
      if (e.target.closest && e.target.closest('[data-avvicina]') && regioneFissa) { var b = confiniDi(regioneFissa); if (b) adatta(b); if (TELEFONO.matches) chiudiFoglio('regione', true); return; }
      if (e.target.closest && e.target.closest('[data-chiudi-avviso]')) { $('#mAvviso').hidden = true; scriviSessione(K_AVVISO, true); }
    });
    // il riquadro della regione resta finché il puntatore ci è sopra (così il link al miglior affare si può cliccare)
    $('#mRegione').addEventListener('mouseenter', function () { clearTimeout(timerRegione); });
    $('#mRegione').addEventListener('mouseleave', function () { if (!regioneFissa) timerRegione = setTimeout(nascondiRegione, 260); });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (aperto('scheda')) { chiudiFoglio('scheda'); e.preventDefault(); }
      else if (aperto('regione')) { chiudiFoglio('regione'); e.preventDefault(); }
      else if (TELEFONO.matches && aperto('zona')) { chiudiFoglio('zona'); fuoco($('#mApriZona')); e.preventDefault(); }
    });
    Object.keys(FOGLI).forEach(function (k) { trascinabile($(FOGLI[k]), k); });
    var suCambio = function (mq, fn) { try { mq.addEventListener('change', fn); } catch (e) { try { mq.addListener(fn); } catch (e2) {} } };
    suCambio(TELEFONO, adattaLayout);
    window.addEventListener('resize', function () { misuraTesta(); });
    var tema = function () { COL = null; ristilizza(); };
    document.addEventListener('radaraste:tema', tema);
    suCambio(media('(prefers-color-scheme: dark)'), tema);
    document.addEventListener('radaraste:seguite', function () {
      seguite = window.Store.idSeguite();
      if (filtri.seguite && datiPronti) { ricalcola(); dopoRicalcolo(); }
    });
  }

  // 1. subito: struttura, misure e mappa con sfondo e confini (data/aste.js si sta ancora scaricando)
  function avvia() {
    misuraTesta();
    if (!window.L) {
      $('#map').innerHTML = '<div class="empty">Impossibile caricare la libreria della mappa (assets/vendor/leaflet).</div>';
      $('#mCarico').hidden = true;
      return false;
    }
    creaMappa();
    return true;
  }
  // 2. a DOMContentLoaded: aste, filtri, gruppi e marcatori
  function avviaDati() {
    if (!mappa) return;
    var S = window.Store;
    var daFuori = leggiFiltri();
    $('#mLegenda').innerHTML = legenda();
    $('#mLegendaLista').innerHTML = legenda();
    eventi(); sincronizza(); adattaLayout();
    if (!window.Supercluster) $('#mAvviso').innerHTML = 'Impossibile caricare il raggruppamento dei punti (assets/vendor/supercluster).', $('#mAvviso').hidden = false;
    // lascia disegnare la pagina prima del lavoro pesante (decodifica di decine di migliaia di aste)
    setTimeout(function () {
      tutte = S ? S.aste() : [];
      seguite = S ? S.idSeguite() : {};
      ricalcola();
      datiPronti = true;
      if (daFuori) { salvaFiltri(); vistaDaFiltri(); }
      dopoRicalcolo();
      $('#mCarico').hidden = true;
      if (!tutte.length) {
        $('#mAvviso').innerHTML = U.icona('allerta') + '<span>Nessuna asta da mostrare sulla mappa. <a href="fonti.html">Stato delle fonti</a> · <a href="aste.html#boxAggiungi">Aggiungi un\'asta da un avviso reale</a></span>';
        $('#mAvviso').hidden = false;
      }
    }, 30);
  }

  var pronta = avvia();
  if (pronta) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avviaDati);
    else avviaDati();
  }
})();
