/* Pagina "Radar 3D": mappa inclinabile e ruotabile (MapLibre GL) con le aste come colonne 3D (deck.gl).
 *
 * - Colonne (mappa vicina): altezza = sconto reale, solo per le aste con sconto e valore di affidabilità media o alta;
 *   le altre sono punti bassi grigi. Colore = punteggio, con la scala del sito (--s-0, --s-50, --s-100 dal tema).
 * - Esagoni (mappa lontana): altezza = numero di aste, colore = sconto medio delle aste affidabili. Tra i due zoom
 *   le due viste si sfumano.
 * - Viaggio nel tempo: le aste del mese scelto, con play e pausa (più lento e senza movimenti con prefers-reduced-motion).
 * - Clic su una colonna: la telecamera vola sul punto e si apre la scheda (foglio dal basso su telefono).
 * - Sfondo: OpenFreeMap (vettoriale, gratuito, senza chiavi); se non risponde, tile raster di OpenStreetMap; se manca
 *   anche quello, i confini delle regioni ISTAT di data/italia.js.
 * - Senza WebGL, o se la pagina è troppo lenta (fotogrammi misurati nei primi secondi), il 3D si ferma: avviso e link
 *   alla mappa 2D. Numeri e migliori affari restano nella colonna.
 * I calcoli sui dati sono in js/radar3d-dati.js (testati in Node). Il file parte prima di data/aste.js: lo sfondo
 * compare subito, le colonne a DOMContentLoaded. */
(function () {
  'use strict';
  var U = window.UI, R = window.Radar3dDati, $ = U.$, $$ = U.$$;

  /* ---------- costanti ---------- */
  var ITALIA = [[6.6, 35.5], [18.5, 47.1]];          // [ovest, sud], [est, nord]
  var LIMITI = [[-6, 30], [32, 52]];
  var Z_ESAGONI = 7.5, Z_COLONNE = 8.5;              // sotto: esagoni; sopra: colonne; in mezzo si sfumano
  var Z_VOLO = 13;                                    // zoom dopo il clic su una colonna
  var ALTEZZA_PX = 160;                               // colonna con sconto del 100%: circa 160 px a schermo
  var ALTEZZA_ESAGONO_PX = 150;                       // l'esagono con più aste
  var RAGGIO_ESAGONO_PX = 15;
  var FPS_MIN = 10, MISURA_MS = 2500;                 // sotto 10 immagini al secondo il 3D si ferma
  var PASSO_MS = 1800, PASSO_CALMO_MS = 4000;         // viaggio nel tempo: un mese ogni…
  var ATTESA_SFONDO_MS = 7000;
  var USA_OPENFREEMAP = true;                         // false: subito le tile raster di OpenStreetMap
  var STILI_OFM = { chiaro: 'https://tiles.openfreemap.org/styles/positron', scuro: 'https://tiles.openfreemap.org/styles/dark' };
  var ATTR_OFM = '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">&copy; OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
  var SORGENTE_OSM = {
    type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
  };
  var ATTR_ISTAT = 'Confini: <a href="https://www.istat.it/" target="_blank" rel="noopener">ISTAT</a> (CC BY)';
  var FORZA = /[?&]forza3d=1(&|$)/;                 // radar3d.html?forza3d=1: niente misura (pulsante "Prova comunque il 3D")
  var NOMI_AFF = { alta: 'alta', media: 'media', bassa: 'bassa' };
  var PLAY = '<svg class="icona" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/></svg>';
  var PAUSA = '<svg class="icona" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13M16 5.5v13" stroke-width="3"/></svg>';
  var CHIUDI = '<button class="r3-x" type="button" data-chiudi="scheda" aria-label="Chiudi la scheda">' + U.icona('chiudi') + '</button>';
  function media(q) { try { return window.matchMedia(q); } catch (e) { return { matches: false, addEventListener: function () {} }; } }
  var CALMO = media('(prefers-reduced-motion: reduce)'), TELEFONO = media('(max-width: 899px)'), TOCCO = media('(pointer: coarse)'), SCURO = media('(prefers-color-scheme: dark)');

  /* ---------- stato ---------- */
  var mappa = null, overlay = null, sfondo = '', timerSfondo = null, tileOk = 0, tileKo = 0;
  var dati = null, visibili = [], alte = [], grigie = [], mesi = [], indice = 0, scelta = null, inPlay = false, timerPlay = null;
  var COL = null, versioneTema = 0, maxEsagono = null, inAttesa = false, misurato = false, fermo = false, ritornoFuoco = null;

  /* ---------- utilità ---------- */
  function esc(s) { return U.esc(s); }
  function num(x) { return Number(x).toLocaleString('it-IT'); }
  function aste(n) { return num(n) + (n === 1 ? ' asta' : ' aste'); }
  function limita(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function fuoco(el) { if (!el) return; try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } }
  function fascia(p) { return window.Punteggio && window.Punteggio.fascia ? window.Punteggio.fascia(p) : { chiave: 'nd', etichetta: p == null ? 'Senza punteggio' : 'Punteggio' }; }
  function temaScuro() {
    var t = document.documentElement.getAttribute('data-theme');
    return t ? t === 'dark' : SCURO.matches;
  }
  function luogo(a) {
    var G = window.GEO, p = a.provincia && G && G.province[a.provincia];
    var l = a.comune ? a.comune + (a.provincia ? ' (' + a.provincia + ')' : '') : p ? 'Provincia di ' + p.nome : a.regione || '';
    return [l, a.tribunale ? 'Tribunale di ' + a.tribunale : ''].filter(Boolean).join(' · ');
  }
  function webgl() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }

  /* ---------- colori dal tema ---------- */
  // token del tema (--s-0, --accent…) in [r, g, b]: valore scritto in style.css, altrimenti come lo calcola il browser
  function token(v, d) {
    var c = R.rgb(getComputedStyle(document.documentElement).getPropertyValue(v));
    if (c) return c;
    var p = document.createElement('i');
    p.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden;color:var(' + v + ', ' + d + ')';
    document.body.appendChild(p);
    c = R.rgb(getComputedStyle(p).color);
    p.remove();
    return c || R.rgb(d);
  }
  function colori() {
    if (COL) return COL;
    COL = {
      s0: token('--s-0', '#a8473a'), s50: token('--s-50', '#b08431'), s100: token('--s-100', '#2f7253'), grigio: token('--faint', '#9a978f'),
      accento: token('--accent', '#1f3a5f'), fondo: token('--bg', '#f7f5f0'), terra: token('--mappa-terra', '#efebe3'), bordo: token('--mappa-bordo', '#cfc6b6'),
      superficie: token('--surface', '#ffffff')
    };
    COL.esagoni = R.coloriEsagoni(COL);
    return COL;
  }
  function css(c, a) { return a == null ? 'rgb(' + c.join(',') + ')' : 'rgba(' + c.join(',') + ',' + a + ')'; }

  /* ---------- sfondo: OpenFreeMap → OpenStreetMap → confini delle regioni ---------- */
  function stileOsm() {
    var c = colori(), scuro = temaScuro();
    return {
      version: 8,
      sources: { osm: SORGENTE_OSM },
      layers: [
        { id: 'fondo', type: 'background', paint: { 'background-color': css(c.fondo) } },
        { id: 'osm', type: 'raster', source: 'osm', paint: pitturaOsm(scuro) }
      ]
    };
  }
  // tile più sobrie; nel tema scuro luminosità invertita e tinte riportate al loro posto (come il filtro della mappa 2D)
  function pitturaOsm(scuro) {
    return scuro ? { 'raster-brightness-min': 0.92, 'raster-brightness-max': 0.08, 'raster-hue-rotate': 180, 'raster-saturation': -0.5, 'raster-contrast': -0.1 }
      : { 'raster-brightness-min': 0, 'raster-brightness-max': 1, 'raster-hue-rotate': 0, 'raster-saturation': -0.3, 'raster-contrast': 0 };
  }
  // mare appena tinto dell'accento, terra e confini con i colori della mappa 2D senza sfondo
  function mare(c) { var t = temaScuro() ? 0.02 : 0.08; return c.fondo.map(function (v, k) { return Math.round(v + (c.accento[k] - v) * t); }); }
  function stileRegioni() {
    var c = colori(), s = { version: 8, sources: {}, layers: [{ id: 'fondo', type: 'background', paint: { 'background-color': css(mare(c)) } }] };
    if (window.ITALIA_REGIONI) {
      s.sources.regioni = { type: 'geojson', data: window.ITALIA_REGIONI, attribution: ATTR_ISTAT };
      s.layers.push({ id: 'terra', type: 'fill', source: 'regioni', paint: { 'fill-color': css(c.terra) } });
      s.layers.push({ id: 'confini', type: 'line', source: 'regioni', paint: { 'line-color': css(c.bordo), 'line-width': 1.2 } });
    }
    return s;
  }
  function stileOfm() { return STILI_OFM[temaScuro() ? 'scuro' : 'chiaro']; }
  function stileVuoto() { return { version: 8, sources: {}, layers: [{ id: 'fondo', type: 'background', paint: { 'background-color': css(colori().fondo) } }] }; }
  // l'attribuzione chiesta da OpenFreeMap sulle sorgenti vettoriali che non l'hanno già
  function conAttribuzione(prima, dopo) {
    var s = dopo && dopo.sources;
    for (var k in s) if (s[k] && s[k].type === 'vector' && !s[k].attribution) s[k].attribution = ATTR_OFM;
    return dopo;
  }
  var NOMI_SFONDO = {
    ofm: 'sfondo <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> (dati OpenStreetMap)',
    osm: 'sfondo <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    regioni: 'sfondo con i soli confini delle regioni ISTAT (gli altri non rispondono)'
  };
  function attendiSfondo() {
    clearTimeout(timerSfondo);
    tileOk = 0; tileKo = 0;
    timerSfondo = setTimeout(function () { if (!tileOk) prossimoSfondo(); }, ATTESA_SFONDO_MS);
  }
  function usaSfondo(tipo) {
    sfondo = tipo;
    $('#r3Mappa').setAttribute('data-sfondo', tipo);
    $('#r3Sfondo').innerHTML = '; ' + NOMI_SFONDO[tipo];
    if (tipo === 'ofm') { mappa.setStyle(stileOfm(), { diff: false, transformStyle: conAttribuzione }); attendiSfondo(); }
    else if (tipo === 'osm') { mappa.setStyle(stileOsm(), { diff: false }); attendiSfondo(); }
    else {
      clearTimeout(timerSfondo);
      mappa.setStyle(stileRegioni(), { diff: false });
      avviso('Sfondo della mappa non disponibile qui: mostro i confini delle regioni.');
    }
  }
  function prossimoSfondo() {
    if (fermo || !mappa) return;
    usaSfondo(sfondo === 'ofm' ? 'osm' : 'regioni');
  }
  // errori: stile che non si scarica, o tile che non arrivano (3 errori senza nessuna tile buona)
  function suErrore(e) {
    if (fermo || sfondo === 'regioni') return;
    var err = e && e.error, tile = e && (e.tile || e.sourceId);
    if (!tile && sfondo === 'ofm' && !mappa.isStyleLoaded()) { prossimoSfondo(); return; }
    if (tile) { tileKo++; if (!tileOk && tileKo >= 3) prossimoSfondo(); return; }
    if (err && window.console && console.warn) console.warn('Radar 3D:', err.message || err);
  }
  function suDati(e) {
    if (e && e.dataType === 'source' && e.tile && e.sourceId !== 'regioni') {
      if (!tileOk) { clearTimeout(timerSfondo); nascondiAvviso(); }
      tileOk++;
    }
  }

  /* ---------- avvisi e ripiego al 2D ---------- */
  function avviso(t) {
    var el = $('#r3Avviso');
    el.innerHTML = U.icona('mappa') + '<span>' + esc(t) + '</span><button class="r3-x" type="button" data-chiudi-avviso aria-label="Chiudi l\'avviso">' + U.icona('chiudi') + '</button>';
    el.hidden = false;
  }
  function nascondiAvviso() { $('#r3Avviso').hidden = true; }
  // motivo: 'webgl' (manca) o 'lento' (fps misurati)
  function ripiega(motivo, fps) {
    fermo = true;
    ferma();
    clearTimeout(timerSfondo);
    if (overlay) { try { overlay.finalize(); } catch (e) {} overlay = null; }
    if (mappa) { try { mappa.remove(); } catch (e) {} mappa = null; }
    var el = $('#r3Ripiego'), lento = motivo === 'lento';
    el.innerHTML = '<div class="r3-ripiego-box">' + U.icona('allerta') +
      '<h2>' + (lento ? 'Il Radar 3D è troppo lento su questo dispositivo' : 'Il Radar 3D non può partire su questo dispositivo') + '</h2>' +
      '<p>' + (lento ? 'Nei primi secondi la mappa ha disegnato circa ' + Math.max(1, Math.round(fps)) + ' immagini al secondo (ne servono almeno ' + FPS_MIN + '): per non bloccare il telefono o il computer ho fermato il 3D.'
        : 'Il browser non ha WebGL, la grafica 3D che serve al radar (a volte è spenta nelle impostazioni o con l\'accelerazione hardware disattivata).') + '</p>' +
      '<p>La <b>mappa 2D</b> ha le stesse aste, con i filtri e la mappa di calore degli sconti.</p>' +
      '<div class="r3-azioni"><a class="btn" href="mappa.html">' + U.icona('mappa') + 'Apri la mappa 2D</a>' +
      (lento ? '<button class="btn ghost" type="button" id="r3Riprova">Prova comunque il 3D</button>' : '') + '</div>' +
      '<p class="r3-nota">Numeri e migliori affari restano in ' + (TELEFONO.matches ? '“Legenda”' : 'questa pagina, nella colonna a sinistra') + '.</p></div>';
    el.hidden = false;
    $('#r3Alt').textContent = 'Radar 3D fermo: ' + (lento ? 'troppo lento su questo dispositivo.' : 'manca WebGL.') + ' Usa la mappa 2D.';
    $('#r3Mappa').classList.add('ripiegato');
    $('#r3Carico').hidden = true; $('#r3Tempo').hidden = true; $('#r3Avviso').hidden = true; $('#r3Tip').hidden = true;
    $('#r3Migliore').hidden = true;
    var r = $('#r3Riprova');
    if (r) r.addEventListener('click', function () { location.href = 'radar3d.html?forza3d=1'; });
    if (dati) { aggiornaTesti(); }
  }
  // fotogrammi al secondo nei primi secondi: la mappa si ridisegna di continuo (senza muoversi) e si contano i disegni
  function misuraVelocita() {
    if (misurato || fermo || !mappa) return;
    misurato = true;
    if (FORZA.test(location.search)) return;
    var t0 = 0, n = 0;
    function giro() {
      if (fermo || !mappa) return;
      var t = performance.now();
      if (!t0) { t0 = t; mappa.triggerRepaint(); return; }
      n++;
      if (t - t0 < MISURA_MS) { mappa.triggerRepaint(); return; }
      mappa.off('render', giro);
      var fps = n * 1000 / (t - t0);
      $('#r3Mappa').setAttribute('data-fps', String(Math.round(fps * 10) / 10));
      if (fps < FPS_MIN) ripiega('lento', fps);
    }
    mappa.on('render', giro);
    mappa.triggerRepaint();
  }

  /* ---------- livelli di deck.gl ---------- */
  function posizione(p) { return [p.lng, p.lat]; }
  function altezza(p) { return p.alto; }
  function coloreEsagono(punti) { return R.esagono(punti).valore; }
  function contaEsagono(punti) { return punti.length; }
  function coloreColonna(p) { var c = R.colorePunto(p, colori()); c.push(255); return c; }
  function suDominio(d) {
    var m = d && isFinite(d[1]) && d[1] > 0 ? d[1] : null;
    if (m !== maxEsagono) { maxEsagono = m; programma(); }
  }
  function strati() {
    var D = window.deck, c = colori(), z = mappa.getZoom(), lat = mappa.getCenter().lat, mpp = R.metriPerPixel(lat, z);
    var t = limita((z - Z_ESAGONI) / (Z_COLONNE - Z_ESAGONI), 0, 1), opEs = 1 - t, opCol = t;
    // il raggio cambia a mezzi livelli di zoom (e a latitudine fissa): così gli esagoni non si ricalcolano a ogni spostamento
    var raggio = RAGGIO_ESAGONO_PX * R.metriPerPixel(42, Math.round(z * 2) / 2);
    var luce = { ambient: 0.62, diffuse: 0.5, shininess: 16, specularColor: [40, 40, 40] };
    var evid = c.accento.concat([110]), tocco = TOCCO.matches;
    var l = [
      new D.HexagonLayer({
        id: 'esagoni', data: visibili, visible: opEs > 0.02, opacity: 0.9 * opEs, pickable: opEs > 0.5,
        gpuAggregation: false, getPosition: posizione, radius: raggio, coverage: 0.86, extruded: true, material: luce,
        getColorValue: coloreEsagono, colorDomain: R.DOMINIO_ESAGONI, colorRange: c.esagoni, colorScaleType: 'quantize',
        getElevationValue: contaEsagono, elevationDomain: maxEsagono ? [0, maxEsagono] : null, elevationRange: [0, ALTEZZA_ESAGONO_PX],
        elevationScale: mpp, onSetElevationDomain: suDominio, autoHighlight: true, highlightColor: evid
      }),
      new D.ColumnLayer({
        id: 'grigie', data: grigie, visible: opCol > 0.02, opacity: opCol, pickable: opCol > 0.5,
        getPosition: posizione, getElevation: R.BASSO, elevationScale: ALTEZZA_PX * mpp, radiusUnits: 'pixels', radius: tocco ? 4 : 3,
        diskResolution: 8, extruded: true, getFillColor: c.grigio.concat([200]), material: luce, autoHighlight: true, highlightColor: evid,
        updateTriggers: { getFillColor: versioneTema }
      }),
      new D.ColumnLayer({
        id: 'colonne', data: alte, visible: opCol > 0.02, opacity: opCol, pickable: opCol > 0.5,
        getPosition: posizione, getElevation: altezza, elevationScale: ALTEZZA_PX * mpp, radiusUnits: 'pixels', radius: tocco ? 7 : 6,
        diskResolution: 16, extruded: true, getFillColor: coloreColonna, material: luce, autoHighlight: true, highlightColor: evid,
        updateTriggers: { getFillColor: versioneTema }
      }),
      new D.ScatterplotLayer({
        id: 'scelta', data: scelta ? [scelta] : [], visible: !!scelta, pickable: false, getPosition: posizione,
        radiusUnits: 'pixels', getRadius: 15, stroked: true, filled: true, getFillColor: c.accento.concat([40]), getLineColor: c.accento.concat([255]),
        lineWidthUnits: 'pixels', getLineWidth: 2.5, updateTriggers: { getFillColor: versioneTema, getLineColor: versioneTema }
      })
    ];
    $('#r3Mappa').setAttribute('data-vista', opEs >= 0.5 ? 'esagoni' : 'colonne');
    return l;
  }
  function programma() {
    if (inAttesa || !overlay) return;
    inAttesa = true;
    requestAnimationFrame(function () { inAttesa = false; if (overlay && mappa) { overlay.setProps({ layers: strati() }); legendaMappa(); } });
  }

  /* ---------- telecamera ---------- */
  function margini() {
    var foglio = TELEFONO.matches && $('#r3Scheda').hasAttribute('data-aperto') ? $('#r3Scheda').offsetHeight : 0;
    return TELEFONO.matches ? { top: 70, bottom: Math.max(120, foglio + 20), left: 20, right: 20 } : { top: 80, bottom: 120, left: 40, right: 40 };
  }
  function vola(lnglat, zoom) {
    if (!mappa) return;
    var opz = { center: lnglat, zoom: zoom, padding: margini() };
    if (mappa.getPitch() < 30) opz.pitch = 50;
    if (CALMO.matches) mappa.jumpTo(opz);
    else { opz.speed = 1.3; opz.curve = 1.4; mappa.flyTo(opz); }
  }
  function vistaItalia(animata) {
    var opz = { padding: TELEFONO.matches ? { top: 60, bottom: 120, left: 10, right: 10 } : { top: 40, bottom: 110, left: 30, right: 30 }, pitch: 45, bearing: 0 };
    if (animata && !CALMO.matches) opz.duration = 900; else opz.animate = false;
    mappa.fitBounds(ITALIA, opz);
  }

  /* ---------- scheda dell'asta ---------- */
  function htmlScheda(pt) {
    var a = pt.a, p = pt.punteggio, fa = fascia(p), aff = a.affidabilita, sc = R.scontoAffidabile(a), D = window.Formato ? window.Formato.date(a) : { asta: null };
    var xd = D.asta || D.termine, q = U.quando && xd ? U.quando(xd.data) : '';
    var insieme = pt.insieme > 1 && dati ? (dati.perPosizione[pt.chiave] || []).filter(function (x) { return x !== pt; }) : [];
    var scontoTesto = sc != null ? U.pct(sc, 0) : a.sconto != null && isFinite(a.sconto) ? U.pct(a.sconto, 0) + ' <small>con valore poco affidabile: non conta nell\'altezza</small>' : '<span class="muted">non stimato</span>';
    var h = '<div class="r3-foglio-testa">' + '<span class="maniglia" aria-hidden="true"></span><p class="r3-eti">Asta scelta</p>' + CHIUDI + '</div>' +
      '<div class="r3-scorri">' +
      '<div class="r3-scheda-testa"><span class="r3-voto f-' + fa.chiave + '" aria-hidden="true">' + (p == null ? '–' : Math.round(p)) + '</span>' +
      '<div><p class="r3-fascia f-' + fa.chiave + '">' + esc(fa.etichetta) + (p != null && a.punteggioCompleto === false ? ' · parziale' : '') + '</p>' +
      '<h2 id="hScheda" tabindex="-1">' + esc(a.titolo) + '</h2></div></div>' +
      (luogo(a) ? '<p class="r3-luogo">' + U.icona('luogo') + '<span>' + esc(luogo(a)) + '</span></p>' : '') +
      '<dl class="kv r3-kv">' +
        '<div><dt>Prezzo base</dt><dd>' + (a.prezzoBase ? U.eur(a.prezzoBase) : '<span class="muted">nell\'avviso</span>') + '</dd></div>' +
        '<div><dt>Sconto sul valore</dt><dd>' + scontoTesto + '</dd></div>' +
        '<div><dt>Punteggio affare</dt><dd>' + (p == null ? '<span class="muted">non calcolato</span>' : Math.round(p) + ' su 100') + '</dd></div>' +
        '<div><dt>Offerta massima consigliata</dt><dd>' + (a.offertaMax > 0 ? U.eur(a.offertaMax) : '<span class="muted">non calcolabile</span>') + '</dd></div>' +
        '<div><dt>Affidabilità del valore</dt><dd>' + (NOMI_AFF[aff] ? NOMI_AFF[aff] : '<span class="muted">valore non stimato</span>') + '</dd></div>' +
        '<div><dt>' + (D.asta || !D.termine ? 'Data dell\'asta' : 'Termine offerte') + '</dt><dd>' + (xd ? U.dataIt(xd.data) + (q ? ' <small>(' + esc(q) + ')</small>' : '') : '—') + '</dd></div>' +
      '</dl>' +
      (!pt.affidabile ? '<p class="r3-nota r3-box">Punto basso e grigio: ' + (a.valore || a.sconto != null ? 'il valore di mercato ha affidabilità bassa' : 'manca il valore di mercato') + ', quindi lo sconto non è abbastanza sicuro da diventare un\'altezza.</p>' : '') +
      (insieme.length ? '<div class="r3-insieme"><p class="r3-eti">Nello stesso punto: altre ' + aste(insieme.length) + '</p><ol class="r3-voci">' + insieme.slice(0, 8).map(voce).join('') + '</ol>' +
        (insieme.length > 8 ? '<p class="r3-nota">E altre ' + num(insieme.length - 8) + ': avvicina la mappa 2D per vederle tutte.</p>' : '') + '</div>' : '') +
      '<div class="r3-azioni"><a class="btn" href="scheda.html?id=' + encodeURIComponent(a.id) + '" data-passa="id:' + esc(a.id) + '">Apri la scheda' + U.icona('freccia') + '</a></div>' +
      '</div>';
    return h;
  }
  function apri(pt, conVolo) {
    if (!pt) return;
    var att = document.activeElement, el = $('#r3Scheda');
    if (att && att !== document.body && !el.contains(att)) ritornoFuoco = att;
    scelta = pt;
    el.innerHTML = htmlScheda(pt);
    if (!el.hasAttribute('data-aperto')) { void el.offsetWidth; el.setAttribute('data-aperto', ''); }
    if (!TELEFONO.matches) { var s = $('#r3Info'); s.inert = true; s.setAttribute('inert', ''); }
    else chiudiInfo(true);
    programma();
    if (conVolo) vola([pt.lng, pt.lat], Math.max(Z_VOLO, mappa ? mappa.getZoom() : Z_VOLO));
    fuoco($('#hScheda'));
  }
  function chiudiScheda(silenzioso) {
    var el = $('#r3Scheda');
    if (!el.hasAttribute('data-aperto')) return;
    el.removeAttribute('data-aperto');
    scelta = null;
    var s = $('#r3Info'); s.inert = false; s.removeAttribute('inert');
    if (TELEFONO.matches && !$('#r3Info').hasAttribute('data-aperto')) { s.inert = true; s.setAttribute('inert', ''); }
    programma();
    if (!silenzioso) {
      if (ritornoFuoco && document.contains(ritornoFuoco) && ritornoFuoco.getClientRects().length) fuoco(ritornoFuoco);
      else fuoco($('#r3Map canvas') || $('#r3Map'));
    }
    ritornoFuoco = null;
  }

  /* ---------- foglio "Legenda e numeri" (telefono) ---------- */
  function apriInfo() {
    var el = $('#r3Info');
    chiudiScheda(true);
    el.inert = false; el.removeAttribute('inert');
    void el.offsetWidth;
    el.setAttribute('data-aperto', '');
    $('#r3Velo').hidden = false;
    $('#r3ApriInfo').setAttribute('aria-expanded', 'true');
    if (U.finestra && U.apriFinestra) { U.finestra(el, function () { chiudiInfo(); }, 'Legenda e numeri del Radar 3D'); U.apriFinestra(el, $('#r3Info .r3-x')); }
  }
  function chiudiInfo(silenzioso) {
    var el = $('#r3Info');
    if (!TELEFONO.matches || !el.hasAttribute('data-aperto')) return;
    el.removeAttribute('data-aperto');
    $('#r3Velo').hidden = true;
    $('#r3ApriInfo').setAttribute('aria-expanded', 'false');
    if (U.chiudiFinestra) U.chiudiFinestra(el, silenzioso);
    el.inert = true; el.setAttribute('inert', '');
  }
  // su computer la colonna è sempre visibile; su telefono è un foglio chiuso finché non lo si apre
  function adattaLayout() {
    var el = $('#r3Info');
    if (TELEFONO.matches) {
      if (!el.hasAttribute('data-aperto')) { el.inert = true; el.setAttribute('inert', ''); }
    } else {
      if (el.hasAttribute('data-aperto')) { el.removeAttribute('data-aperto'); $('#r3Velo').hidden = true; if (U.chiudiFinestra) U.chiudiFinestra(el, true); }
      el.removeAttribute('role'); el.removeAttribute('aria-modal'); el.removeAttribute('aria-label');
      el.inert = !!$('#r3Scheda').hasAttribute('data-aperto');
      if (el.inert) el.setAttribute('inert', ''); else el.removeAttribute('inert');
    }
    misuraTesta();
    if (mappa) mappa.resize();
  }
  function misuraTesta() {
    var h = $('#site-header'), t = $('#r3Tempo');
    if (h && h.offsetHeight) document.documentElement.style.setProperty('--r3-testa', h.offsetHeight + 'px');
    // su telefono i crediti della mappa stanno sopra il viaggio nel tempo
    if (t && !t.hidden && t.offsetHeight) document.documentElement.style.setProperty('--r3-tempo-alto', t.offsetHeight + 10 + 'px');
  }
  // trascinare giù un foglio lo chiude (come nella mappa 2D)
  function trascinabile(el, chiudi) {
    var y0 = null, dy = 0;
    el.addEventListener('touchstart', function (e) {
      if (!TELEFONO.matches || e.touches.length > 1) return;
      var corpo = el.querySelector('.r3-scorri');
      if (corpo && corpo.contains(e.target) && corpo.scrollTop > 0) return;
      y0 = e.touches[0].clientY; dy = 0;
    }, { passive: true });
    el.addEventListener('touchmove', function (e) {
      if (y0 === null) return;
      dy = Math.max(0, e.touches[0].clientY - y0);
      if (dy > 4) { el.classList.add('trascino'); el.style.setProperty('--trascina', dy + 'px'); }
    }, { passive: true });
    function fine() {
      if (y0 === null) return;
      y0 = null; el.classList.remove('trascino'); el.style.removeProperty('--trascina');
      if (dy > 80) chiudi();
    }
    el.addEventListener('touchend', fine);
    el.addEventListener('touchcancel', fine);
  }

  /* ---------- viaggio nel tempo ---------- */
  function meseCorrente() { return indice > 0 && mesi[indice - 1] ? mesi[indice - 1] : null; }
  function testoMese(m) { return m ? m.etichetta.charAt(0).toUpperCase() + m.etichetta.slice(1) + ': ' + aste(m.n) : 'Tutti i mesi: ' + aste(dati.punti.length); }
  function scegliMese(i, daPlay) {
    indice = limita(i, 0, mesi.length);
    var m = meseCorrente();
    visibili = R.delMese(dati.punti, m ? m.chiave : '');
    alte = []; grigie = [];
    for (var k = 0; k < visibili.length; k++) (visibili[k].affidabile ? alte : grigie).push(visibili[k]);
    maxEsagono = null;
    if (scelta && visibili.indexOf(scelta) < 0) chiudiScheda(true);
    var nome = $('#r3MeseNome');
    nome.setAttribute('aria-live', daPlay ? 'off' : 'polite');
    nome.textContent = testoMese(m);
    $('#r3Tutti').setAttribute('aria-pressed', String(indice === 0));
    $$('#r3Mesi .r3-mese').forEach(function (b, j) { b.setAttribute('aria-pressed', String(j + 1 === indice)); });
    $('#r3Mesi').classList.toggle('tutti', indice === 0);
    aggiornaTesti();
    programma();
  }
  // una barra per mese, alta quanto il numero di aste; sotto il mese (e l'anno quando cambia)
  function barreMesi() {
    var max = 1, anno = '';
    mesi.forEach(function (m) { if (m.n > max) max = m.n; });
    $('#r3Mesi').innerHTML = mesi.map(function (m, i) {
      var c = m.chiave.replace('>', ''), a = c.slice(2, 4), sotto = a !== anno ? '\u2019' + a : '';
      anno = a;
      return '<button type="button" class="r3-mese" data-i="' + (i + 1) + '" aria-pressed="false" aria-label="' + esc(testoMese(m)) + '" title="' + esc(testoMese(m)) + '">' +
        '<span class="r3-barra"><i style="height:' + Math.max(6, Math.round(m.n / max * 100)) + '%"></i></span>' +
        '<span class="r3-mese-n" aria-hidden="true">' + esc(m.breve.split(' ')[0]) + '<small>' + (m.chiave.charAt(0) === '>' ? '' : sotto) + '</small></span></button>';
    }).join('');
  }
  function aggiornaPlay() {
    var b = $('#r3Play');
    b.innerHTML = inPlay ? PAUSA : PLAY;
    b.setAttribute('aria-pressed', String(inPlay));
    b.setAttribute('aria-label', inPlay ? 'Metti in pausa il viaggio nel tempo' : 'Avvia il viaggio nel tempo, un mese alla volta');
    b.title = inPlay ? 'Pausa' : 'Avvia';
  }
  function avvia() {
    if (!mesi.length) return;
    inPlay = true; aggiornaPlay();
    if (indice === 0 || indice >= mesi.length) scegliMese(1, true);
    clearInterval(timerPlay);
    timerPlay = setInterval(function () {
      if (indice >= mesi.length) { ferma(true); return; }
      scegliMese(indice + 1, true);
    }, CALMO.matches ? PASSO_CALMO_MS : PASSO_MS);
  }
  function ferma(finito) {
    clearInterval(timerPlay); timerPlay = null;
    if (!inPlay) return;
    inPlay = false; aggiornaPlay();
    $('#r3MeseNome').setAttribute('aria-live', 'polite');
    if (finito) $('#r3MeseNome').textContent = testoMese(meseCorrente()) + ' · fine del viaggio';
  }

  /* ---------- testi: sintesi, numeri, migliori, legenda ---------- */
  function voce(pt) {
    var a = pt.a, p = pt.punteggio, fa = fascia(p);
    var dett = [luogo(a).split(' · ')[0], pt.sconto != null ? 'sconto ' + U.pct(pt.sconto, 0) : '', pt.giorno ? U.dataIt(pt.giorno) : ''].filter(Boolean).join(' · ');
    return '<li><button type="button" class="r3-voce" data-id="' + esc(a.id) + '">' +
      '<span class="r3-voto f-' + fa.chiave + '" aria-hidden="true">' + (p == null ? '–' : Math.round(p)) + '</span>' +
      '<span class="r3-voce-t"><span class="sr-only">' + (p == null ? 'Senza punteggio. ' : 'Punteggio ' + Math.round(p) + ' su 100. ') + '</span><b>' + esc(a.titolo) + '</b><small>' + esc(dett) + '</small></span></button></li>';
  }
  function aggiornaTesti() {
    if (!dati) return;
    var T = dati.totali, m = meseCorrente(), nVis = visibili.length, nAlte = alte.length;
    var dove = m ? ' a ' + m.etichetta : '', qui = fermo ? ' in corso con posizione' : ' sulla mappa';
    $('#r3Sintesi').innerHTML = '<b>' + num(nVis) + '</b> ' + (nVis === 1 ? 'asta' : 'aste') + qui + esc(dove) + ' · <b>' + num(nAlte) + '</b> con sconto affidabile';
    // numeri
    var somma = 0, maxS = null;
    alte.forEach(function (p) { somma += p.sconto; if (maxS == null || p.sconto > maxS) maxS = p.sconto; });
    var righe = [
      ['Aste in corso', '<b>' + num(T.inCorso) + '</b><small>' + num(T.conPosizione) + ' con posizione sulla mappa, ' + num(T.senzaPosizione) + ' senza posizione precisa (non disegnate)</small>'],
      [(fermo ? 'Con posizione' : 'Sulla mappa') + (m ? ' a ' + m.etichetta : ', tutti i mesi'), '<b>' + num(nVis) + '</b><small>' + num(nAlte) + (fermo ? ' con sconto affidabile, ' + num(nVis - nAlte) + ' senza' : ' colonne con sconto affidabile, ' + num(nVis - nAlte) + ' punti grigi') + '</small>'],
      ['Sconto medio delle affidabili', nAlte ? '<b>' + U.pct(somma / nAlte, 0) + '</b><small>su ' + aste(nAlte) + '; il più alto ' + U.pct(maxS, 0) + '</small>' : '<span class="muted">non calcolabile</span><small>nessuna asta con sconto e valore affidabile</small>'],
      ['Escluse', '<b>' + num(T.passate) + '</b><small>aste con la data già passata' + (T.senzaMese ? '; ' + num(T.senzaMese) + ' senza giorno dell\'asta solo in “tutti i mesi”' : '') + '</small>']
    ];
    $('#r3Numeri').innerHTML = righe.map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd>' + r[1] + '</dd></div>'; }).join('');
    // migliori
    var top = R.migliori(visibili, 5), att = document.activeElement, idFuoco = att && att.closest && att.closest('#r3Migliori') ? att.getAttribute('data-id') : null;
    $('#r3Migliori').innerHTML = top.map(voce).join('');
    $('#r3MiglioriNota').textContent = top.length ? 'Punteggio più alto tra le aste con un valore di mercato affidabile' + (m ? ', con l\'asta a ' + m.etichetta : '') + (mappa ? '. Scegline una per volarci sopra.' : '.')
      : 'Nessuna asta con un valore di mercato affidabile' + (m ? ' a ' + m.etichetta : '') + ': il miglior affare non si può indicare.';
    if (idFuoco) fuoco($('#r3Migliori .r3-voce[data-id="' + idFuoco + '"]') || $('#r3Migliori .r3-voce'));
    var b = $('#r3Migliore');
    b.disabled = !top.length;
    b.title = top.length ? '' : 'Nessuna asta con valore affidabile' + dove;
    // testo alternativo della mappa
    if (!fermo) $('#r3Alt').textContent = 'Mappa 3D delle aste in corso' + dove + ': ' + aste(nVis) + ' con posizione, di cui ' + num(nAlte) + ' colonne alte quanto lo sconto (valore affidabile) e ' + num(nVis - nAlte) +
      ' punti grigi. ' + (top.length ? 'Il miglior affare è «' + top[0].a.titolo + '», ' + luogo(top[0].a).split(' · ')[0] + ', punteggio ' + Math.round(top[0].punteggio) + ' su 100. ' : '') +
      'Numeri ed elenco dei migliori affari sono nella colonna “Legenda e numeri”.';
  }
  function legendaHtml(vista) {
    var c = colori();
    if (vista === 'esagoni') {
      var cl = c.esagoni, et = ['meno di 10%', '10–20%', '20–30%', '30–40%', '40% e oltre'];
      return '<p class="r3-leg-t">Esagoni · sconto medio</p><ul class="r3-leg-lista">' +
        et.map(function (t, i) { return '<li><i style="background:' + css(cl[i + 1]) + '"></i>' + t + '</li>'; }).join('') +
        '<li><i style="background:' + css(cl[0]) + '"></i>meno di ' + R.MINIMO + ' aste affidabili</li></ul><p class="r3-leg-n">Altezza: numero di aste. Avvicina per le colonne.</p>';
    }
    var g = 'linear-gradient(90deg,' + css(c.s0) + ',' + css(c.s50) + ',' + css(c.s100) + ')';
    return '<p class="r3-leg-t">Colonne · punteggio</p><div class="r3-leg-scala" style="background:' + g + '"></div>' +
      '<div class="r3-leg-num"><span>0</span><span>50</span><span>100</span></div>' +
      '<ul class="r3-leg-lista"><li><i style="background:' + css(c.grigio) + '"></i>punto grigio: sconto non affidabile</li></ul>' +
      '<p class="r3-leg-n">Altezza: sconto reale (valore affidabile). Allontana per gli esagoni.</p>';
  }
  var ultimaLegenda = '';
  function legendaMappa() {
    var v = $('#r3Mappa').getAttribute('data-vista') || 'esagoni', k = v + versioneTema;
    if (k === ultimaLegenda) return;
    ultimaLegenda = k;
    $('#r3Legenda').innerHTML = legendaHtml(v);
  }
  function legendaLista() {
    $('#r3LegendaLista').innerHTML = '<div class="r3-legenda-due">' + legendaHtml('colonne') + '</div><div class="r3-legenda-due">' + legendaHtml('esagoni') + '</div>';
    $('#r3Minimo').textContent = R.MINIMO;
  }

  /* ---------- eventi della mappa ---------- */
  function suClic(info) {
    if (!info || !info.object || !info.layer) return;
    var id = info.layer.id;
    if (id === 'esagoni') {
      var o = info.object, r = R.esagono(o.points || []);
      var t = aste(r.n) + (r.classe >= 0 ? ', sconto medio ' + U.pct(r.media, 0) + ' su ' + num(r.campione) + ' affidabili' : r.campione ? ', solo ' + num(r.campione) + ' con valore affidabile' : ', nessuna con valore affidabile') + '. Avvicino la mappa.';
      $('#r3Tip').hidden = true;
      annuncia(t);
      vola(o.position, Z_COLONNE + 1.5);
      return;
    }
    if (id === 'colonne' || id === 'grigie') apri(info.object, true);
  }
  function annuncia(t) {
    var el = $('#r3Annuncio');
    if (!el) { el = document.createElement('p'); el.id = 'r3Annuncio'; el.className = 'sr-only'; el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
    el.textContent = t;
  }
  function suSopra(info) {
    var tip = $('#r3Tip'), o = info && info.object;
    if (mappa) mappa.getCanvas().style.cursor = o ? 'pointer' : '';
    if (!o || TOCCO.matches) { tip.hidden = true; return; }
    var h;
    if (info.layer.id === 'esagoni') {
      var r = R.esagono(o.points || []);
      h = '<b>' + aste(r.n) + '</b><span>' + (r.classe >= 0 ? 'Sconto medio ' + U.pct(r.media, 0) + ' su ' + num(r.campione) + ' affidabili' : r.campione ? 'Solo ' + num(r.campione) + ' con valore affidabile: grigio' : 'Nessuna con valore affidabile') + '</span><small>Clic per avvicinare</small>';
    } else {
      var a = o.a;
      var tit = String(a.titolo || '');
      h = '<b>' + esc(tit.length > 80 ? tit.slice(0, 78) + '…' : tit) + '</b><span>' + esc(luogo(a).split(' · ')[0]) + '</span><span>' +
        (o.affidabile ? 'Sconto ' + U.pct(o.sconto, 0) + ' · punteggio ' + (o.punteggio == null ? 'n.d.' : Math.round(o.punteggio)) : 'Sconto non affidabile') + '</span>' +
        (o.insieme > 1 ? '<small>' + aste(o.insieme) + ' nello stesso punto</small>' : '');
    }
    tip.innerHTML = h;
    tip.hidden = false;
    var box = $('#r3Mappa'), W = box.clientWidth, w = tip.offsetWidth, hh = tip.offsetHeight;
    var x = info.x + 14, y = info.y + 14;
    if (x + w > W - 8) x = info.x - 14 - w;
    if (y + hh > box.clientHeight - 8) y = info.y - 14 - hh;
    tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px';
  }

  /* ---------- avvio ---------- */
  function creaMappa() {
    var ml = window.maplibregl, D = window.deck;
    if (!ml || !D || !D.MapboxOverlay || !D.HexagonLayer || !D.ColumnLayer) {
      $('#r3Carico').hidden = true;
      $('#r3Ripiego').innerHTML = '<div class="r3-ripiego-box">' + U.icona('allerta') + '<h2>Impossibile caricare le librerie del radar</h2><p>Mancano i file in assets/vendor/maplibre-gl o assets/vendor/deck.gl.</p><div class="r3-azioni"><a class="btn" href="mappa.html">Apri la mappa 2D</a></div></div>';
      $('#r3Ripiego').hidden = false; $('#r3Mappa').classList.add('ripiegato'); $('#r3Migliore').hidden = true;
      fermo = true;
      return false;
    }
    if (ml.setWorkerUrl) ml.setWorkerUrl('assets/vendor/maplibre-gl/maplibre-gl-csp-worker.js');
    var calmo = CALMO.matches;
    sfondo = USA_OPENFREEMAP ? 'ofm' : 'osm';
    mappa = new ml.Map({
      container: 'r3Map', style: stileVuoto(), bounds: ITALIA,
      fitBoundsOptions: { padding: TELEFONO.matches ? { top: 60, bottom: 120, left: 10, right: 10 } : { top: 40, bottom: 110, left: 30, right: 30 } },
      pitch: 45, maxPitch: 60, minZoom: 4, maxZoom: 17.5, maxBounds: LIMITI, attributionControl: false,
      fadeDuration: calmo ? 0 : 200, dragRotate: true, touchPitch: true,
      locale: {
        'NavigationControl.ZoomIn': 'Avvicina', 'NavigationControl.ZoomOut': 'Allontana', 'NavigationControl.ResetBearing': 'Riporta a nord e senza inclinazione',
        'AttributionControl.ToggleAttribution': 'Mostra o nascondi i crediti della mappa', 'Map.Title': 'Radar 3D delle aste'
      }
    });
    mappa.addControl(new ml.NavigationControl({ visualizePitch: true }), 'top-right');
    mappa.addControl(new ml.AttributionControl({ compact: TELEFONO.matches }), 'bottom-right');
    mappa.on('error', suErrore);
    mappa.on('data', suDati);
    mappa.on('move', programma);
    usaSfondo(sfondo);
    overlay = new D.MapboxOverlay({ interleaved: true, layers: [], onClick: suClic, onHover: suSopra });
    mappa.addControl(overlay);
    mappa.getCanvas().setAttribute('aria-label', 'Mappa 3D delle aste');
    return true;
  }

  function eventi() {
    $('#r3Tutti').addEventListener('click', function () { ferma(); scegliMese(0); });
    $('#r3Mesi').addEventListener('click', function (e) {
      var b = e.target.closest('.r3-mese'); if (!b) return;
      ferma(); scegliMese(+b.getAttribute('data-i'));
    });
    // frecce sinistra e destra: mese prima e mese dopo
    $('#r3Mesi').addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d || !mesi.length) return;
      e.preventDefault(); ferma();
      scegliMese(limita(indice + d, 1, mesi.length));
      fuoco($('#r3Mesi .r3-mese[data-i="' + indice + '"]'));
    });
    $('#r3Play').addEventListener('click', function () { if (inPlay) ferma(); else avvia(); });
    $('#r3Migliore').addEventListener('click', function () {
      ferma();
      var b = R.migliore(visibili);
      if (!b) { annuncia('Nessuna asta con valore affidabile in questa selezione.'); return; }
      apri(b, true);
    });
    $('#r3ApriInfo').addEventListener('click', function () { if ($('#r3Info').hasAttribute('data-aperto')) chiudiInfo(); else apriInfo(); });
    $('#r3Velo').addEventListener('click', function () { chiudiInfo(); });
    document.addEventListener('click', function (e) {
      var v = e.target.closest && e.target.closest('.r3-voce');
      if (v && dati) {
        var id = v.getAttribute('data-id'), pt = null;
        for (var i = 0; i < dati.punti.length; i++) if (String(dati.punti[i].id) === id) { pt = dati.punti[i]; break; }
        if (pt && mappa) { ferma(); apri(pt, true); }
        else if (pt) location.href = 'scheda.html?id=' + encodeURIComponent(pt.id);
        return;
      }
      var x = e.target.closest && e.target.closest('[data-chiudi]');
      if (x) { if (x.getAttribute('data-chiudi') === 'scheda') chiudiScheda(); else chiudiInfo(); return; }
      if (e.target.closest && e.target.closest('[data-chiudi-avviso]')) nascondiAvviso();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if ($('#r3Scheda').hasAttribute('data-aperto')) { chiudiScheda(); e.preventDefault(); }
    });
    trascinabile($('#r3Scheda'), function () { chiudiScheda(); });
    trascinabile($('#r3Info'), function () { chiudiInfo(); });
    var suCambio = function (mq, fn) { try { mq.addEventListener('change', fn); } catch (e) { try { mq.addListener(fn); } catch (e2) {} } };
    suCambio(TELEFONO, adattaLayout);
    window.addEventListener('resize', misuraTesta);
    var tema = function () {
      COL = null; versioneTema++; ultimaLegenda = '';
      legendaLista(); programma();
      if (!mappa || fermo) return;
      if (sfondo === 'ofm') usaSfondo('ofm');
      else if (sfondo === 'osm') { var pt = pitturaOsm(temaScuro()); for (var k in pt) mappa.setPaintProperty('osm', k, pt[k]); mappa.setPaintProperty('fondo', 'background-color', css(colori().fondo)); }
      else { var c = colori(); mappa.setPaintProperty('fondo', 'background-color', css(mare(c))); if (window.ITALIA_REGIONI) { mappa.setPaintProperty('terra', 'fill-color', css(c.terra)); mappa.setPaintProperty('confini', 'line-color', css(c.bordo)); } }
    };
    document.addEventListener('radaraste:tema', tema);
    suCambio(SCURO, tema);
  }

  // 1. subito: struttura e mappa con lo sfondo (data/aste.js si sta ancora scaricando)
  function parti() {
    misuraTesta();
    aggiornaPlay();
    if (!webgl()) { ripiega('webgl'); return; }
    creaMappa();
  }
  // 2. a DOMContentLoaded: aste, mesi, livelli
  function partiDati() {
    eventi(); adattaLayout(); legendaLista();
    var Rc = window.ASTE_RACCOLTE, quando = Rc && typeof Rc.aggiornato === 'string' ? Rc.aggiornato.slice(0, 10) : '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(quando)) $('#r3Data').textContent = '; dati della raccolta del ' + U.dataIt(quando);
    // lascia disegnare la pagina prima del lavoro pesante (decodifica di decine di migliaia di aste)
    setTimeout(function () {
      var S = window.Store;
      dati = R.prepara(S ? S.aste() : [], { oggi: U.oggi ? U.oggi() : R.oggi(), province: window.GEO ? window.GEO.province : null });
      mesi = dati.mesi;
      barreMesi();
      scegliMese(0);
      $('#r3Carico').hidden = true;
      if (!fermo) {
        $('#r3Tempo').hidden = !mesi.length;
        misuraTesta();
        if (!dati.totali.aste) avviso('Nessuna asta da mostrare: non ci sono aste raccolte dalle fonti ufficiali. Qui non compaiono mai dati di esempio.');
      }
      if (mappa && !fermo) {
        var via = function () { if (mappa) { programma(); setTimeout(misuraVelocita, 600); } };
        if (mappa.loaded()) via(); else { mappa.once('load', via); setTimeout(function () { if (!misurato) via(); }, ATTESA_SFONDO_MS + 500); }
      }
    }, 30);
  }

  parti();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', partiDati);
  else partiDati();
})();
