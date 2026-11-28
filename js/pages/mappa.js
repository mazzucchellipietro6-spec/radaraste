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
 * - Mappa di calore degli sconti (interruttore nei filtri, js/calore.js): quadrati di circa 40 px disegnati su una tela
 *   sotto i puntini, colorati con lo sconto medio delle sole aste con valore di affidabilità media o alta (almeno 3).
 *
 * - Più interattiva (27/11/2026): "Colora per" punteggio, sconto (solo affidabilità media o alta) o data dell'asta; prezzo
 *   base sui puntini quando si avvicina la mappa; ricerca di un luogo (regioni, province, comuni e tribunali con aste);
 *   "Vicino a me" o un punto scelto con un cerchio di 5-100 km (la posizione resta nel browser, mai nei link);
 *   filtri per data dell'asta e sconto minimo; elenco della zona ordinabile e collegato ai puntini; link della vista.
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
  var K_FILTRI = 'radaraste.mappa.filtri', K_VISTA = 'radaraste.mappa.vista', K_AVVISO = 'radaraste.mappa.avvisoChiuso', K_STRATI = 'radaraste.mappa.strati';
  var CAL = window.Calore, PAD_CALORE = 0.1, OPACITA_CALORE = 0.82;
  var VUOTI = { cat: '', max: '', pmin: 0, libere: false, conPunteggio: false, seguite: false, giorni: 0, smin: 0 };
  var GIORNI = [7, 14, 30, 60, 90], SCONTI = [0.1, 0.2, 0.3, 0.4], KM = [5, 10, 25, 50, 100];
  var ZOOM_PREZZI = 12.5;                                 // da qui il puntino singolo mostra il prezzo base
  var MODI = ['punteggio', 'sconto', 'data'];
  var MENO = '<svg class="icona" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>';
  var SCHERMO = '<svg class="icona" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
  var CHIUDI = '<button class="m-x" type="button" data-chiudi aria-label="Chiudi">' + U.icona('chiudi') + '</button>';
  var MANIGLIA = '<span class="maniglia" aria-hidden="true"></span>';

  /* ---------- stato ---------- */
  var mappa = null, sfondo = null, strato = null, confini = null, etichette = null, segno = null, indice = null;
  var tutte = [], correnti = [], sulMappa = [], perId = {}, seguite = {}, statReg = {}, senzaPos = 0, senzaReg = 0;
  var marcatori = {}, generazione = 0, scelta = null, elencoPunto = null, regioneFissa = null, regioneSopra = null;
  var filtri = copia(VUOTI), extra = {}, parole = [], OGGI = '';
  var fallback = false, primi = false, datiPronti = false, timerRegione = null, inAttesa = false, ritornoFuoco = null;
  var tileOk = 0, tileKo = 0;
  var strati = { puntini: true, calore: false, prezzi: true, colore: 'punteggio' }, calore = null, celle = null, versione = 0, cacheXY = null;
  var raggio = null, cerchio = null, distanze = {}, sceltaPunto = false, ordineZona = 'migliori', luoghi = null, sopra = null, LIMITE = '', vistaUrl = null;
  // ultima posizione data dal browser ("Vicino a me"): solo in memoria, per tenerla fuori dai link anche dopo "Togli"
  var posizioneTe = null;
  var cellaSopra = null, cellaFissa = null, COLC = null, timerCella = null;

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
  // sconto usato per colori e filtri: solo con valore di affidabilità media o alta (come la mappa di calore)
  function scontoAffidabile(a) { var s = sconto(a); return s != null && AFFIDABILE[a.affidabilita] ? s : null; }
  function piuGiorni(data, g) { var d = new Date(data + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + g); return d.toISOString().slice(0, 10); }
  function giorniA(a) {
    if (!a.dataAsta || !/^\d{4}-\d{2}-\d{2}/.test(a.dataAsta)) return null;
    var g = Math.round((Date.parse(a.dataAsta.slice(0, 10) + 'T12:00:00Z') - Date.parse(OGGI + 'T12:00:00Z')) / 864e5);
    return isFinite(g) && g >= 0 ? g : null;
  }
  function distanzaKm(lat1, lng1, lat2, lng2) {
    var r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  function km(d) { return d < 10 ? (Math.round(d * 10) / 10).toLocaleString('it-IT') + ' km' : Math.round(d) + ' km'; }
  // prezzo sul puntino: 950 €, 85k €, 1,2 mln €
  function prezzoBreve(x) {
    if (x >= 999500) return (Math.round(x / 100000) / 10).toLocaleString('it-IT') + ' mln €';
    if (x >= 10000) return Math.round(x / 1000) + 'k €';
    if (x >= 1000) return (Math.round(x / 100) / 10).toLocaleString('it-IT') + 'k €';
    return Math.round(x) + ' €';
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
    if (filtri.giorni) n++; if (filtri.smin) n++; if (raggio) n++;
    Object.keys(extra).forEach(function (k) { if (k !== 'ordina') n++; });
    return n;
  }
  function bboxValido(b) {
    return Array.isArray(b) && b.length === 4 && b.every(function (x) { return isFinite(Number(x)); }) && +b[0] < +b[2] && +b[1] < +b[3];
  }
  // filtri arrivati dall'elenco (?filtri=<json> o data-passa="filtri:<json>"): quelli che la mappa conosce diventano controlli,
  // gli altri (testo, regione, provincia, comune, tribunale, prezzo minimo, date, zona) restano attivi e si vedono come etichette
  function daElenco(f) {
    filtri = copia(VUOTI); extra = {}; raggio = null;
    if (f.cat && NOMI_CAT[f.cat]) filtri.cat = f.cat;
    if (+f.max > 0) filtri.max = String(+f.max);
    if (f.stato === 'libero') filtri.libere = true; else if (f.stato) extra.stato = String(f.stato);
    var pm = +(f.punteggioMin || f.pmin || 0);
    if (pm > 0 && pm <= 100) filtri.pmin = pm;
    if (f.soloConPunteggio || f.conPunteggio) filtri.conPunteggio = true;
    if (f.seguite) filtri.seguite = true;
    if (GIORNI.indexOf(+f.giorni) >= 0) filtri.giorni = +f.giorni;
    if (SCONTI.indexOf(+f.smin) >= 0) filtri.smin = +f.smin;
    ['testo', 'regione', 'provincia', 'comune', 'tribunale', 'dal', 'al'].forEach(function (k) { if (f[k]) extra[k] = String(f[k]).trim(); });
    if (+f.min > 0) extra.min = String(+f.min);
    if (bboxValido(f.bbox)) extra.bbox = f.bbox.map(Number);
    if (f.nuove) extra.nuove = true;
    if (f.ordina) extra.ordina = String(f.ordina);
  }
  function leggiFiltri() {
    var s = leggiSessione(K_FILTRI);
    if (s && s.filtri) { for (var k in VUOTI) if (k in s.filtri) filtri[k] = s.filtri[k]; extra = s.extra || {}; }
    raggio = s && raggioValido(s.raggio) ? s.raggio : null;
    if (raggio && raggio.te) posizioneTe = [raggio.lat, raggio.lng];
    var arrivo = null, nellUrl = new URLSearchParams(location.search).get('filtri');
    try { arrivo = U.parametro('filtri'); } catch (e) {}
    // se i filtri sono nell'indirizzo, il valore lasciato in sessionStorage dallo stesso link è già usato
    if (nellUrl) { try { var p = sessionStorage.getItem('radaraste.passa') || ''; if (p.indexOf('filtri:') === 0) sessionStorage.removeItem('radaraste.passa'); } catch (e) {} }
    if (arrivo) { try { var f = JSON.parse(arrivo); if (f && typeof f === 'object') { daElenco(f); return true; } } catch (e) {} }
    return false;
  }
  // il raggio resta solo in questa scheda del browser (sessionStorage): la posizione non entra nei link
  function salvaFiltri() { scriviSessione(K_FILTRI, { filtri: filtri, extra: extra, raggio: raggio }); }
  function raggioValido(r) {
    return !!r && typeof r === 'object' && isFinite(r.lat) && isFinite(r.lng) && r.lat >= DENTRO.s - 1 && r.lat <= DENTRO.n + 1 &&
      r.lng >= DENTRO.o - 1 && r.lng <= DENTRO.e + 1 && KM.indexOf(+r.km) >= 0;
  }

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
    // l'elenco non conosce "entro N giorni": diventa la data "al"
    if (filtri.giorni) { var lim = piuGiorni(oggi(), filtri.giorni); if (!f.al || f.al > lim) f.al = lim; }
    // con il cerchio della distanza la zona è il riquadro del cerchio (anche per "Cerca in questa zona")
    if (raggio) f.bbox = bboxRaggio(); else if (conZona && mappa) f.bbox = bboxVista(); else if (extra.bbox) f.bbox = extra.bbox;
    return f;
  }
  // zona intorno alla persona ("Vicino a me", o la vista ancora centrata lì): riquadro allargato a 0,1° (circa 10 km),
  // mai la posizione precisa
  function vicinoATe() { return !!mappa && (!!(raggio && raggio.te) || vistaSuDiTe(mappa.getCenter())); }
  function bboxLargo(b) {
    var giu = function (x) { return Math.floor(x * 10) / 10; }, su = function (x) { return Math.ceil(x * 10) / 10; };
    return [giu(b[0]), giu(b[1]), su(b[2]), su(b[3])];
  }
  function bboxRaggio() {
    var dLat = raggio.km / 111.2, dLng = raggio.km / (111.32 * Math.cos(raggio.lat * Math.PI / 180)), r = function (x) { return Math.round(x * 10000) / 10000; };
    return [r(raggio.lat - dLat), r(raggio.lng - dLng), r(raggio.lat + dLat), r(raggio.lng + dLng)];
  }
  // link all'elenco con gli stessi filtri. Vicino alla persona la zona non va nell'indirizzo (che arriva al server e resta
  // nella cronologia): passa solo dentro il browser (data-passa → sessionStorage), allargata a circa 10 km
  function linkElenco(el, f) {
    var privato = !!f.bbox && vicinoATe();
    if (privato) { f = copia(f); f.bbox = bboxLargo(f.bbox); }
    var vuoto = !Object.keys(f).length, j = JSON.stringify(f);
    el.href = vuoto || privato ? 'aste.html' : 'aste.html?filtri=' + encodeURIComponent(j);
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
    if (filtri.giorni && !(a.dataAsta && a.dataAsta.slice(0, 10) <= LIMITE)) return false;
    if (filtri.smin) { var sa = scontoAffidabile(a); if (sa == null || sa < filtri.smin) return false; }
    if (raggio) {
      if (!conPosizione(a)) return false;
      var d = distanzaKm(raggio.lat, raggio.lng, a.lat, a.lng);
      if (d > raggio.km) return false;
      distanze[a.id] = d;
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
    LIMITE = filtri.giorni ? piuGiorni(OGGI, filtri.giorni) : '';
    distanze = {};
    parole = senzaAccenti(extra.testo).split(/\s+/).filter(Boolean);
    correnti = []; sulMappa = []; perId = {}; statReg = {}; senzaPos = 0; senzaReg = 0; versione++;
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
      var sa = scontoAffidabile(a), g = giorniA(a);
      feats[i] = { type: 'Feature', properties: { i: i, p: p == null ? -1 : p, s: sa == null ? -9 : sa, g: g == null ? 1e6 : g }, geometry: { type: 'Point', coordinates: [a.lng, a.lat] } };
    }
    // ogni gruppo ricorda il miglior punteggio, lo sconto più alto e la prima data: "Colora per" sceglie quale usare
    indice = new window.Supercluster({
      radius: TOCCO.matches ? 64 : 56, extent: 256, maxZoom: MAX_ZOOM_GRUPPI, minPoints: 2,
      map: function (pr) { return { best: pr.p, sb: pr.s, gm: pr.g }; },
      reduce: function (acc, pr) { if (pr.best > acc.best) acc.best = pr.best; if (pr.sb > acc.sb) acc.sb = pr.sb; if (pr.gm < acc.gm) acc.gm = pr.gm; }
    });
    indice.load(feats);
    generazione++;
  }

  /* ---------- marcatori ---------- */
  // "Colora per": classe di colore, ordine (chi sta sopra) e testo per il puntatore
  function valoreAsta(a) { return strati.colore === 'sconto' ? scontoAffidabile(a) : strati.colore === 'data' ? giorniA(a) : punti(a); }
  function valoreGruppo(pr) {
    if (strati.colore === 'sconto') return pr.sb > -9 ? pr.sb : null;
    if (strati.colore === 'data') return pr.gm < 1e6 ? pr.gm : null;
    return pr.best >= 0 ? pr.best : null;
  }
  function classeColore(v) {
    var m = strati.colore;
    if (m === 'sconto') return v == null ? 'f-nd' : v >= 0.4 ? 'f-ottimo' : v >= 0.25 ? 'f-buono' : v >= 0.1 ? 'f-medio' : 'f-basso';
    if (m === 'data') return v == null ? 'f-nd' : v <= 7 ? 'd-1' : v <= 30 ? 'd-2' : v <= 90 ? 'd-3' : 'd-4';
    return 'f-' + fascia(v).chiave;
  }
  function ordineColore(v) {
    if (v == null) return -1;
    if (strati.colore === 'sconto') return Math.max(0, Math.min(100, Math.round(v * 100)));
    if (strati.colore === 'data') return Math.max(0, 100 - Math.min(100, Math.round(v / 4)));
    return Math.round(v);
  }
  function testoColore(v, gruppo) {
    if (strati.colore === 'sconto') {
      if (v == null) return gruppo ? 'nessuna con sconto affidabile' : 'sconto non stimato o poco affidabile';
      if (v < 0) return (gruppo ? 'anche la migliore costa ' : 'costo totale sopra il valore del ') + (gruppo ? Math.round(-v * 100) + '% sopra il valore' : Math.round(-v * 100) + '%');
      return (gruppo ? 'lo sconto più alto è ' : 'sconto ') + Math.round(v * 100) + '%';
    }
    if (strati.colore === 'data') return v == null ? 'data non indicata' : (gruppo ? 'la prima asta è ' : 'asta ') + (v === 0 ? 'oggi' : v === 1 ? 'domani' : 'tra ' + v + ' giorni');
    return v == null ? (gruppo ? 'nessuna con punteggio' : 'senza punteggio') : (gruppo ? 'il migliore ha ' : '') + Math.round(v) + ' punti (' + fascia(v).etichetta.toLowerCase() + ')';
  }
  function conPrezzi() { return strati.prezzi && mappa && mappa.getZoom() >= ZOOM_PREZZI; }
  function marcatore(f) {
    var c = f.geometry.coordinates, pr = f.properties, m, v, cls;
    if (pr.cluster) {
      var n = pr.point_count;
      v = valoreGruppo(pr); cls = classeColore(v);
      var d = n < 10 ? 34 : n < 100 ? 40 : n < 1000 ? 48 : 56;
      m = L.marker([c[1], c[0]], {
        icon: L.divIcon({ className: 'm-gruppo ' + cls, iconSize: [d, d], html: '<span>' + breve(n) + '</span>' }),
        keyboard: false, riseOnHover: true, zIndexOffset: (ordineColore(v) + 2) * 1000,
        title: aste(n) + ': ' + testoColore(v, true) + '. Clic per avvicinare.'
      });
      m._gruppo = pr.cluster_id;
      return m;
    }
    var a = sulMappa[pr.i], s = TOCCO.matches ? 36 : 24;
    v = valoreAsta(a); cls = classeColore(v);
    var titolo = String(a.titolo || '').slice(0, 90) + ' · ' + (a.prezzoBase ? U.eur(a.prezzoBase) + ' · ' : '') + testoColore(v, false) +
      (raggio && distanze[a.id] != null ? ' · ' + km(distanze[a.id]) : '');
    if (conPrezzi() && a.prezzoBase > 0) {
      // pillola con il prezzo base: elemento di misura zero sul punto, testo centrato con il CSS
      m = L.marker([c[1], c[0]], {
        icon: L.divIcon({ className: 'm-prezzo ' + cls + (a.id === scelta ? ' scelto' : ''), iconSize: [0, 0], html: '<span>' + prezzoBreve(a.prezzoBase) + '</span>' }),
        keyboard: false, riseOnHover: true, zIndexOffset: (ordineColore(v) + 2) * 1000, title: titolo
      });
    } else {
      m = L.marker([c[1], c[0]], {
        icon: L.divIcon({ className: 'm-punto ' + cls + (a.id === scelta ? ' scelto' : ''), iconSize: [s, s], html: '<i></i>' }),
        keyboard: false, riseOnHover: true, zIndexOffset: (ordineColore(v) + 2) * 1000, title: titolo
      });
    }
    m._asta = a;
    return m;
  }
  function disegna() {
    if (!mappa || !indice || !strati.puntini) return;
    var b = mappa.getBounds().pad(0.35), z = Math.round(mappa.getZoom()), prezzi = conPrezzi();
    var lista = indice.getClusters([Math.max(-180, b.getWest()), Math.max(-85, b.getSouth()), Math.min(180, b.getEast()), Math.min(85, b.getNorth())], Math.min(z, MAX_ZOOM_GRUPPI + 1));
    var visti = {}, nuovi = [], k;
    for (var i = 0; i < lista.length; i++) {
      var pr = lista[i].properties;
      k = generazione + (pr.cluster ? 'g' + pr.cluster_id : 'p' + pr.i + (prezzi ? 'e' : ''));
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
    if (strati.calore) disegnaCalore();
    aggiornaZona();
    linkElenco($('#mCercaZona'), perElenco(true));
    $('#mMappa').classList.toggle('regioni-attive', mappa.getZoom() <= (TOCCO.matches ? ZOOM_REGIONI_TOCCO : ZOOM_REGIONI_PUNTATORE));
    var c = mappa.getCenter();
    scriviSessione(K_VISTA, { c: [Math.round(c.lat * 1e5) / 1e5, Math.round(c.lng * 1e5) / 1e5], z: mappa.getZoom() });
  }

  /* ---------- "In questa zona" ---------- */
  // miniatura della foto dell'annuncio (solo immagini del Portale, stessa regola delle card: js/formato.js e UI.fotoCopertina);
  // se non si apre, js/ui.js la toglie e il riquadro sparisce. Niente foto inventate: senza foto, niente miniatura.
  function miniatura(a) {
    var F = window.Formato, u = F && F.copertina ? F.copertina(a.copertina) : null;
    return u ? '<span class="m-mini" aria-hidden="true"><img src="' + esc(u) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-copertina></span>' : '';
  }
  function voce(a) {
    var p = punti(a), fa = fascia(p);
    var dett = [raggio && distanze[a.id] != null ? km(distanze[a.id]) : '', luogoBreve(a), a.prezzoBase ? U.eur(a.prezzoBase) : '', U.dataIt(a.dataAsta)].filter(Boolean).join(' · ');
    return '<li><button type="button" class="m-voce" data-id="' + esc(a.id) + '">' +
      '<span class="m-voto f-' + fa.chiave + '" aria-hidden="true">' + (p == null ? '–' : Math.round(p)) + '</span>' +
      '<span class="m-voce-t"><span class="sr-only">' + (p == null ? 'Senza punteggio. ' : 'Punteggio ' + Math.round(p) + ' su 100. ') + '</span><b>' + esc(a.titolo) + '</b><small>' + esc(dett) + '</small></span>' + miniatura(a) + '</button></li>';
  }
  var ORDINI_ZONA = {
    migliori: { cmp: migliore, titolo: function (n) { return n === 1 ? 'L\'unica con punteggio' : 'Le ' + n + ' migliori per punteggio'; } },
    vicine: { cmp: function (x, y) { return (distanze[x.id] || 0) - (distanze[y.id] || 0); }, titolo: function (n) { return n === 1 ? 'L\'unica nel raggio' : 'Le ' + n + ' più vicine'; } },
    data: { cmp: primaData, titolo: function (n) { return n === 1 ? 'L\'unica con la data' : 'Le prime ' + n + ' per data dell\'asta'; } },
    prezzo: { cmp: function (x, y) { return (x.prezzoBase > 0 ? x.prezzoBase : 1e15) - (y.prezzoBase > 0 ? y.prezzoBase : 1e15) || primaData(x, y); }, titolo: function (n) { return n === 1 ? 'L\'unica con il prezzo' : 'Le ' + n + ' con il prezzo base più basso'; } }
  };
  var N_ZONA = 8;
  function aggiornaZona() {
    var b = mappa.getBounds(), s = b.getSouth(), w = b.getWest(), n = b.getNorth(), e = b.getEast();
    if (ordineZona === 'vicine' && !raggio) ordineZona = 'migliori';
    var conta = 0, conP = 0, top = [], perData = [], O = ORDINI_ZONA[ordineZona];
    for (var i = 0; i < sulMappa.length; i++) {
      var a = sulMappa[i];
      if (a.lat < s || a.lat > n || a.lng < w || a.lng > e) continue;
      conta++;
      if (ordineZona !== 'migliori') { inserisci(top, a, O.cmp, N_ZONA); continue; }
      if (punti(a) != null) { conP++; inserisci(top, a, migliore, N_ZONA); }
      else if (!conP) inserisci(perData, a, primaData, N_ZONA);
    }
    var lista = ordineZona !== 'migliori' || conP ? top : perData;
    $('#mZonaN').innerHTML = conta ? '<b>' + num(conta) + '</b> ' + (conta === 1 ? 'asta' : 'aste') + ' con posizione in questa zona' + (raggio ? ' e nel raggio di ' + raggio.km + ' km' : '') :
      'Nessuna asta con posizione in questa zona: allontana la mappa o cambia i filtri.';
    $('#mZonaTitolo').textContent = !conta ? '' : ordineZona !== 'migliori' ? O.titolo(lista.length) : conP ? O.titolo(Math.min(N_ZONA, conP)) :
      'Nessuna ha ancora un punteggio: ecco le prime per data dell\'asta';
    $$('#mOrdina .chip').forEach(function (c) {
      c.setAttribute('aria-pressed', String(c.dataset.ord === ordineZona));
      if (c.dataset.ord === 'vicine') c.hidden = !raggio;
    });
    // l'elenco si riscrive: chi lo usa da tastiera resta sulla stessa voce
    var att = document.activeElement, idFuoco = att && att.closest && att.closest('#mMigliori') ? att.getAttribute('data-id') : null;
    $('#mMigliori').innerHTML = lista.map(voce).join('');
    if (idFuoco) { var el = $$('#mMigliori .m-voce').filter(function (x) { return x.getAttribute('data-id') === idFuoco; })[0]; fuoco(el || $('#mMigliori .m-voce') || $('#mCercaZona')); }
    $('#mPillTesto').innerHTML = '<b>' + breve(conta) + '</b> ' + (conta === 1 ? 'asta' : 'aste') + ' qui · ' + (ordineZona === 'vicine' ? 'le più vicine' : ordineZona === 'data' ? 'le prime' : ordineZona === 'prezzo' ? 'le più economiche' : 'le migliori');
    // il nome per i lettori di schermo comincia con il testo visibile (chi usa i comandi vocali dice quello che vede)
    $('#mApriZona').setAttribute('aria-label', $('#mPillTesto').textContent + ': ' + aste(conta) + ' con posizione in questa zona');
  }
  // passando su una voce dell'elenco (o con il fuoco da tastiera) un anello mostra dov'è sulla mappa
  function mostraSopra(a) {
    if (!mappa) return;
    if (!a || !conPosizione(a)) { if (sopra) { mappa.removeLayer(sopra); sopra = null; } return; }
    var ll = [a.lat, a.lng];
    if (!sopra) sopra = L.marker(ll, { icon: L.divIcon({ className: 'm-sopra', iconSize: [40, 40], html: '<span></span>' }), interactive: false, keyboard: false, zIndexOffset: 400000 }).addTo(mappa);
    else sopra.setLatLng(ll);
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
    var D = window.Formato.date(a), xd = D.asta || D.termine;
    var avviso = U.linkSicuro(a.linkAvviso), sc = sconto(a), q = U.quando && xd ? U.quando(xd.data) : '';
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
      (luogo(a) ? '<p class="m-luogo">' + U.icona('luogo') + '<span>' + esc(luogo(a)) + (raggio && distanze[a.id] != null ? ' · <b>' + km(distanze[a.id]) + '</b> da ' + esc(nomeRaggio()) : '') + '</span></p>' : '') +
      '<dl class="kv m-kv">' +
        // del Demanio a volte si conosce solo il termine per le offerte (js/formato.js)
        '<div><dt>' + (D.asta || !D.termine ? 'Data asta' : 'Termine offerte') + '</dt><dd>' + (xd ? U.dataIt(xd.data) + (xd.ora ? ' ' + esc(xd.ora) : '') : '—') + (q ? ' <small>(' + esc(q) + ')</small>' : '') + '</dd></div>' +
        '<div><dt>Prezzo base</dt><dd>' + (a.prezzoBase ? U.eur(a.prezzoBase) : '<span class="muted">nell\'avviso</span>') + '</dd></div>' +
        '<div><dt>Offerta minima</dt><dd>' + (min ? U.eur(min) : '—') + '</dd></div>' +
        '<div><dt>Sconto sul valore</dt><dd>' + (sc != null ? U.pct(sc, 0) + aff : '<span class="muted">non stimato</span>') + '</dd></div>' +
      '</dl>' +
      (p == null ? '<p class="m-nota">Senza punteggio: per calcolarlo serve il valore di mercato (stima del perito o prezzo della prima asta), non ancora disponibile per questa asta. Non lo inventiamo.</p>' : '') +
      '<div class="m-azioni"><a class="btn" href="scheda.html?id=' + encodeURIComponent(a.id) + '" data-passa="id:' + esc(a.id) + '">Apri la scheda' + U.icona('freccia') + '</a>' +
        (avviso ? '<a class="btn ghost" href="' + esc(avviso) + '" target="_blank" rel="noopener">Avviso originale' + U.icona('esterno') + '<span class="sr-only"> (si apre in una nuova scheda)</span></a>' : '<span class="muted">Link all\'avviso mancante</span>') +
      '</div></div>';
  }
  // prima foto che sia un'immagine di resource-pvp.giustizia.it (stessa regola della copertina: js/formato.js)
  function primaFoto(d) {
    var l = d && d.foto ? [].concat(d.foto) : [], F = window.Formato;
    if (!F || !F.copertina) return null;
    for (var i = 0; i < l.length; i++) {
      var u = F.copertina(typeof l[i] === 'string' ? l[i] : l[i] && (l[i].url || l[i].src));
      if (u) return u;
    }
    return null;
  }
  // foto di copertina dell'elenco, altrimenti la prima foto della scheda a pezzi (solo se l'asta dice di averne: niente
  // richieste inutili). La foto porta alla scheda come "Apri la scheda"; per i lettori di schermo resta solo il pulsante.
  function caricaFoto(a) {
    var fig = $('#mFoto'), D = window.Dettagli;
    if (!fig) return;
    var subito = primaFoto({ foto: [a.copertina].concat(a.foto || []) });
    var attesa = subito ? Promise.resolve({ foto: [subito], fotoTotali: Number(a.nFoto) || 1 }) : D && Number(a.nFoto) > 0 ? D.carica(a.id) : null;
    if (!attesa) return;
    fig.classList.add('in-carico');
    attesa.then(function (d) {
      if (scelta !== a.id || !fig.isConnected) return;
      var u = primaFoto(d), tot = d && (d.fotoTotali || (d.foto && d.foto.length)) || Number(a.nFoto) || 0;
      if (!u) { fig.classList.remove('in-carico'); return; }
      var img = document.createElement('img'), link = document.createElement('a');
      // alt vuoto: subito dopo c'è il titolo dell'asta, e la foto è dentro un link nascosto ai lettori di schermo
      img.alt = '';
      img.loading = 'lazy'; img.decoding = 'async';
      img.referrerPolicy = 'no-referrer'; img.setAttribute('referrerpolicy', 'no-referrer');
      link.className = 'm-foto-link'; link.href = 'scheda.html?id=' + encodeURIComponent(a.id); link.setAttribute('data-passa', 'id:' + a.id);
      link.tabIndex = -1; link.setAttribute('aria-hidden', 'true');
      img.addEventListener('load', function () { fig.classList.remove('in-carico'); fig.classList.add('con-foto'); });
      img.addEventListener('error', function () {
        link.remove(); fig.classList.remove('in-carico'); fig.classList.add('foto-ko');
        var c = fig.querySelector('figcaption'); if (c) c.insertAdjacentHTML('beforeend', '<small>Foto non disponibile</small>');
      });
      img.src = u;
      link.appendChild(img);
      fig.insertBefore(link, fig.firstChild);
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

  /* ---------- mappa di calore degli sconti (js/calore.js) ---------- */
  // tela sopra sfondo e confini, sotto i puntini; durante lo zoom animato si scala come i renderer di Leaflet
  function creaStratoCalore() {
    var Strato = L.Layer.extend({
      onAdd: function (m) {
        var pane = m.getPane('calore') || m.createPane('calore');
        pane.style.zIndex = 420; pane.style.pointerEvents = 'none';
        this._tela = L.DomUtil.create('canvas', 'm-calore leaflet-zoom-animated', pane);
        this._tela.setAttribute('aria-hidden', 'true');
        m.on('zoom', this._suZoom, this);
        if (m._zoomAnimated) m.on('zoomanim', this._suAnimazione, this);
        disegnaCalore();
      },
      onRemove: function (m) {
        m.off('zoom', this._suZoom, this);
        m.off('zoomanim', this._suAnimazione, this);
        L.DomUtil.remove(this._tela);
        this._tela = null; this._centro = null;
      },
      _suZoom: function () { this._trasforma(this._map.getCenter(), this._map.getZoom()); },
      _suAnimazione: function (e) { this._trasforma(e.center, e.zoom); },
      // come L.Renderer._updateTransform: la tela disegnata con (centro, zoom) segue la nuova vista
      _trasforma: function (centro, zoom) {
        if (!this._centro || !this._tela) return;
        var m = this._map, k = m.getZoomScale(zoom, this._zoom), meta = m.getSize().multiplyBy(0.5 + PAD_CALORE);
        var pos = meta.multiplyBy(-k).add(m.project(this._centro, zoom)).subtract(m._getNewPixelOrigin(centro, zoom));
        L.DomUtil.setTransform(this._tela, pos, k);
      }
    });
    return new Strato();
  }
  // colori della scala dai token del tema (--accent sulla --surface), letti come rgb() dal browser
  function coloriCalore() {
    if (COLC) return COLC;
    var p = document.createElement('i');
    p.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden';
    document.body.appendChild(p);
    var leggi = function (v) { p.style.color = 'var(' + v + ')'; return getComputedStyle(p).color; };
    var acc = leggi('--accent'), sup = leggi('--surface'), fg = leggi('--fg');
    p.remove();
    COLC = { scala: CAL.scalaColori(acc, sup), accento: acc, bordo: fg, superficie: sup };
    return COLC;
  }
  // posizioni in pixel del livello di zoom, calcolate una volta per zoom e per insieme di aste
  function posizioni(z) {
    if (!cacheXY || cacheXY.z !== z || cacheXY.v !== versione) {
      var xy = new Float64Array(sulMappa.length * 2);
      for (var i = 0; i < sulMappa.length; i++) { var p = CAL.proietta(sulMappa[i].lat, sulMappa[i].lng, z); xy[2 * i] = p[0]; xy[2 * i + 1] = p[1]; }
      cacheXY = { z: z, v: versione, xy: xy };
    }
    var t = cacheXY.xy;
    return function (a, i) { return [t[2 * i], t[2 * i + 1]]; };
  }
  function disegnaCalore() {
    var tela = calore && calore._tela;
    if (!tela || !mappa) return;
    var size = mappa.getSize(), pad = size.multiplyBy(PAD_CALORE).round(), w = size.x + 2 * pad.x, h = size.y + 2 * pad.y;
    var alto = mappa.containerPointToLayerPoint([-pad.x, -pad.y]).round(), z = mappa.getZoom(), k = Math.min(2, window.devicePixelRatio || 1);
    calore._centro = mappa.getCenter(); calore._zoom = z; calore._k = k;
    L.DomUtil.setPosition(tela, alto);
    if (tela.width !== Math.round(w * k) || tela.height !== Math.round(h * k)) { tela.width = Math.round(w * k); tela.height = Math.round(h * k); }
    tela.style.width = w + 'px'; tela.style.height = h + 'px';
    var o = alto.add(mappa.getPixelOrigin());   // angolo della tela in pixel del livello di zoom
    celle = datiPronti ? CAL.aggrega(sulMappa, posizioni(z), { limiti: [o.x, o.y, o.x + w, o.y + h] }) : null;
    if (celle) { celle.zoom = z; celle.ox = o.x; celle.oy = o.y; celle.vista = [o.x + pad.x, o.y + pad.y, o.x + pad.x + size.x, o.y + pad.y + size.y]; }
    cellaSopra = null;
    if (cellaFissa) riapriCella(); else nascondiCella();
    dipingi();
    areaCalore();
  }
  function dipingi() {
    var tela = calore && calore._tela;
    if (!tela) return;
    var ctx = tela.getContext('2d'), k = calore._k || 1;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, tela.width / k, tela.height / k);
    if (!celle) return;
    var col = coloriCalore(), l = celle.lato, ev = celle.indice[cellaFissa ? cellaFissa.chiave : cellaSopra];
    for (var i = 0; i < celle.celle.length; i++) {
      var c = celle.celle[i];
      if (!c.colorata) continue;
      if (col.scala) { ctx.globalAlpha = OPACITA_CALORE; ctx.fillStyle = col.scala[c.classe]; }
      else { ctx.globalAlpha = OPACITA_CALORE * CAL.TONI[c.classe]; ctx.fillStyle = col.accento; }
      ctx.fillRect(c.x0 - celle.ox + 1, c.y0 - celle.oy + 1, l - 2, l - 2);   // 2 px di stacco tra i quadrati
    }
    ctx.globalAlpha = 1;
    if (ev && ev.colorata) {
      // quadrato sotto il puntatore o fissato: anello del colore della superficie e bordo del colore del testo
      ctx.lineWidth = 4; ctx.strokeStyle = col.superficie; ctx.strokeRect(ev.x0 - celle.ox + 2, ev.y0 - celle.oy + 2, l - 4, l - 4);
      ctx.lineWidth = 2; ctx.strokeStyle = col.bordo; ctx.strokeRect(ev.x0 - celle.ox + 2, ev.y0 - celle.oy + 2, l - 4, l - 4);
    }
  }
  // riga della legenda: quante aste contano nei quadrati visibili
  function areaCalore() {
    var t = '';
    if (celle) {
      var v = celle.vista, n = 0, cam = 0, col = 0;
      celle.celle.forEach(function (c) {
        if (c.x1 <= v[0] || c.x0 >= v[2] || c.y1 <= v[1] || c.y0 >= v[3]) return;
        n += c.aste; cam += c.campione; if (c.colorata) col++;
      });
      if (!n) t = 'In quest\'area non ci sono aste con posizione con i filtri scelti.';
      else if (!cam) t = 'In quest\'area ' + (n === 1 ? 'l\'unica asta con posizione non ha' : 'nessuna delle ' + num(n) + ' aste con posizione ha') + ' sconto e valore affidabili: niente da colorare.';
      else if (!col) t = 'In quest\'area ' + (cam === 1 ? 'solo 1 asta ha' : 'solo ' + num(cam) + ' aste hanno') + ' sconto e valore affidabili (su ' + num(n) + ' con posizione) e nessun quadrato ne ha almeno ' + celle.minimo + ': allontana la mappa per unirli.';
      else t = 'In quest\'area: ' + aste(cam) + ' nel campione su ' + num(n) + ' con posizione, ' + col + (col === 1 ? ' quadrato colorato.' : ' quadrati colorati.');
    }
    $$('[data-calore-area]').forEach(function (el) { el.textContent = t; });
  }
  function cellaIn(cp) {
    if (!celle || !strati.calore || celle.zoom !== mappa.getZoom()) return null;
    var p = mappa.containerPointToLayerPoint(cp).add(mappa.getPixelOrigin()), c = CAL.trova(celle, p.x, p.y);
    return c && c.colorata ? c : null;
  }
  // al passaggio del puntatore è un'anteprima che non si tocca (così si passa da un quadrato al vicino);
  // con un clic o un tocco si fissa e porta il link alle aste del quadrato
  function htmlCella(c, fissa) {
    var forchetta = c.min !== c.max ? 'valori da ' + U.pct(c.min, 0) + ' a ' + U.pct(c.max, 0) : 'tutte con lo stesso sconto';
    return '<div class="m-cella-testa"><p class="m-legenda-t">Sconto medio nel quadrato</p>' +
        (fissa ? '<button class="m-x" type="button" data-chiudi-cella aria-label="Chiudi il riquadro del quadrato">' + U.icona('chiudi') + '</button>' : '') + '</div>' +
      '<p class="m-cella-v"><b>' + U.pct(c.media, 0) + '</b><small>' + esc(forchetta) + '</small></p>' +
      '<p class="m-cella-n">Campione: ' + aste(c.campione) + ' con sconto e valore di affidabilità media o alta, su ' + aste(c.aste) + ' nel quadrato con i filtri scelti.</p>' +
      (fissa ? '<a class="btn small" href="aste.html" data-cella-elenco>Apri queste aste' + U.icona('freccia') + '</a>'
        : '<p class="m-suggerimento">Clic sul quadrato per fissare il riquadro e aprire queste aste.</p>');
  }
  function mostraCella(c, fissa) {
    clearTimeout(timerCella);
    var el = $('#mCella'), dentro = el.contains(document.activeElement);
    el.innerHTML = htmlCella(c, fissa);
    if (fissa) {
      var f = copia(perElenco(false));
      f.bbox = CAL.bbox(c, celle.zoom);
      linkElenco(el.querySelector('[data-cella-elenco]'), f);
    }
    el.classList.toggle('fissa', !!fissa);
    el.hidden = false;
    // il riquadro della regione (al passaggio) lascia il posto a quello del quadrato
    if (!regioneFissa) { clearTimeout(timerRegione); $('#mRegione').removeAttribute('data-aperto'); }
    posizionaCella(c);
    if (dentro) fuoco(el.querySelector('[data-cella-elenco]'));
  }
  // accanto al quadrato, dentro la mappa (su telefono tra la barra dei filtri e la legenda in basso)
  function posizionaCella(c) {
    var el = $('#mCella'), box = $('#mMappa'), po = mappa.getPixelOrigin();
    var a = mappa.layerPointToContainerPoint([c.x0 - po.x, c.y0 - po.y]), b = mappa.layerPointToContainerPoint([c.x1 - po.x, c.y1 - po.y]);
    var W = box.clientWidth, H = box.clientHeight, w = el.offsetWidth, h = el.offsetHeight, m = 8;
    var su = TELEFONO.matches ? 62 : m, giu = TELEFONO.matches ? 114 : m, x = b.x + m, y = a.y;
    if (x + w > W - m) x = a.x - m - w;
    if (x < m) {
      x = Math.max(m, Math.min(W - w - m, (a.x + b.x - w) / 2));
      y = b.y + m;
      if (y + h > H - giu) y = a.y - m - h;
    }
    el.style.left = Math.round(x) + 'px';
    el.style.top = Math.round(Math.max(su, Math.min(H - giu - h, y))) + 'px';
  }
  function fuoriVista(c) {
    var v = celle.vista;
    return c.x1 <= v[0] || c.x0 >= v[2] || c.y1 <= v[1] || c.y0 >= v[3];
  }
  function fissaCella(c) {
    cellaFissa = { chiave: c.i + ':' + c.j, zoom: celle.zoom };
    cellaSopra = null;
    mostraCella(c, true);
    dipingi();
  }
  function riapriCella() {
    var c = celle && celle.zoom === cellaFissa.zoom ? celle.indice[cellaFissa.chiave] : null;
    if (!c || !c.colorata || fuoriVista(c)) { cellaFissa = null; nascondiCella(); return; }
    mostraCella(c, true);
  }
  function nascondiCella() {
    clearTimeout(timerCella);
    var el = $('#mCella');
    el.hidden = true; el.classList.remove('fissa');
  }
  function chiudiCella(rifuoco) {
    var era = cellaFissa;
    cellaFissa = null; cellaSopra = null;
    nascondiCella(); dipingi();
    if (era && rifuoco) fuoco($('#map'));
  }
  function nascondiCellaPresto() {
    clearTimeout(timerCella);
    timerCella = setTimeout(function () {
      if (cellaFissa) return;
      cellaSopra = null; nascondiCella(); dipingi();
      // il puntatore è ancora sulla regione (mappa lontana): torna il suo riquadro
      if (regioneSopra && !regioneFissa && !TOCCO.matches && mappa.getZoom() <= ZOOM_REGIONI_PUNTATORE) mostraRegione(regioneSopra, false);
    }, 220);
  }
  // passando il puntatore (non al tocco: lì si tocca il quadrato)
  function sopraMappa(e) {
    if (!strati.calore || cellaFissa || TOCCO.matches) return;
    var c = cellaIn(e.containerPoint), k = c ? c.i + ':' + c.j : null;
    if (k === cellaSopra) { if (k) clearTimeout(timerCella); return; }
    if (!c) { nascondiCellaPresto(); return; }
    cellaSopra = k; mostraCella(c, false); dipingi();
  }
  function legendaCalore(mini) {
    var tasselli = CAL.TONI.map(function (t) { return '<i style="--t:' + Math.round(t * 100) + '%"></i>'; }).join('');
    if (mini) return '<span>Sconto medio</span><span>0%</span><span class="m-scala" aria-hidden="true">' + tasselli + '</span><span>40%+</span>';
    var passi = ['0%'].concat(CAL.PASSI.map(function (p, i) { return Math.round(p * 100) + '%' + (i === CAL.PASSI.length - 1 ? '+' : ''); }));
    return '<div class="m-leg-calore"><p class="m-legenda-t">Sconto medio sul valore</p>' +
      '<div class="m-scala" role="img" aria-label="Scala di colore a una sola tinta: più intenso è il quadrato, più alto è lo sconto medio, da meno del 10% fino al 40% e oltre">' + tasselli + '</div>' +
      '<div class="m-scala-n" aria-hidden="true">' + passi.map(function (p) { return '<span>' + p + '</span>'; }).join('') + '</div>' +
      '<p class="m-legenda-n">Quadrati di circa ' + CAL.LATO + ' px. Contano solo le aste con sconto e valore di affidabilità media o alta; con meno di ' + CAL.MINIMO + ' il quadrato resta vuoto.</p>' +
      '<p class="m-legenda-n" data-calore-area></p></div>';
  }
  function legende() {
    var h = (strati.calore && CAL ? legendaCalore(false) : '') + (strati.puntini ? legenda() : '');
    $('#mLegenda').innerHTML = h; $('#mLegenda').hidden = !h;
    $('#mLegendaLista').innerHTML = h; $('#mLegendaLista').hidden = !h;
    var mini = $('#mCaloreMini');
    mini.hidden = !(strati.calore && CAL);
    if (!mini.hidden) {
      mini.innerHTML = legendaCalore(true);
      mini.setAttribute('aria-label', 'Legenda della mappa di calore: sconto medio da 0% a 40% e oltre. Apri i filtri per il metodo e la fonte');
    }
    areaCalore();
  }
  function leggiStrati() {
    var s = leggiSessione(K_STRATI);
    if (s && typeof s === 'object') {
      strati.puntini = s.puntini !== false; strati.calore = !!s.calore; strati.prezzi = s.prezzi !== false;
      if (MODI.indexOf(s.colore) >= 0) strati.colore = s.colore;
    }
    // un link con ?colore=sconto (Condividi questa vista) sceglie il colore dei puntini
    var c = new URLSearchParams(location.search).get('colore');
    if (MODI.indexOf(c) >= 0) strati.colore = c;
    if (!CAL) strati.calore = false;
  }
  function applicaStrati() {
    $('#mPuntini').checked = strati.puntini;
    $('#mPrezzi').checked = strati.prezzi;
    $('#mPrezzi').disabled = !strati.puntini;
    $('#mColora').value = strati.colore;
    $('#mCalore').checked = strati.calore;
    $('#mCalore').disabled = !CAL;
    $('#mCaloreMetodo').hidden = !strati.calore;
    if (mappa && strato) {
      if (strati.puntini && !mappa.hasLayer(strato)) { mappa.addLayer(strato); disegna(); }
      else if (!strati.puntini && mappa.hasLayer(strato)) mappa.removeLayer(strato);
    }
    if (mappa && CAL) {
      if (strati.calore) { if (!calore) calore = creaStratoCalore(); if (!mappa.hasLayer(calore)) mappa.addLayer(calore); }
      else if (calore && mappa.hasLayer(calore)) { chiudiCella(); mappa.removeLayer(calore); celle = null; }
    }
    legende();
  }
  function cambiaStrati() { scriviSessione(K_STRATI, strati); applicaStrati(); }
  // colore o prezzi cambiati: si rifanno i marcatori visibili
  function rifaiMarcatori() {
    if (!strato) return;
    for (var k in marcatori) strato.removeLayer(marcatori[k]);
    marcatori = {}; generazione++;
    if (datiPronti) disegna();
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
      if (!regioneFissa && $('#mCella').hidden) mostraRegione(nome, false);   // con il riquadro di un quadrato aperto, la regione aspetta
    } else if (tipo === 'fuori') {
      if (regioneSopra === nome) { regioneSopra = null; layer.setStyle(stileRegione(layer.feature)); }
      if (!regioneFissa) { clearTimeout(timerRegione); timerRegione = setTimeout(nascondiRegione, 260); }
    } else if (tipo === 'clic') {
      if (z > (TOCCO.matches ? ZOOM_REGIONI_TOCCO : ZOOM_REGIONI_PUNTATORE)) return;
      if (cellaIn(e.containerPoint)) return;   // con la mappa di calore il quadrato colorato ha la precedenza (clic sulla mappa)
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
  function apriFoglio(nome, primo) {
    var el = $(FOGLI[nome]);
    if (TELEFONO.matches) Object.keys(FOGLI).forEach(function (k) { if (k !== nome) chiudiFoglio(k, true); });
    if (!el.hasAttribute('data-aperto')) { void el.offsetWidth; el.setAttribute('data-aperto', ''); }
    el.style.removeProperty('--trascina');
    if (nome === 'filtri' && TELEFONO.matches) {
      $('#mVelo').hidden = false;
      $('#mApriFiltri').setAttribute('aria-expanded', 'true');
      if (U.finestra && U.apriFinestra) { U.finestra(el, function () { chiudiFoglio('filtri'); }, 'Filtri della mappa'); U.apriFinestra(el, primo || $('#mCat .chip[aria-pressed="true"]')); }
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
    $('#mGiorni').value = String(filtri.giorni || 0);
    $('#mSconto').value = String(filtri.smin || 0);
    $('#mRaggio').hidden = !raggio;
    if (raggio) { $('#mKm').value = String(raggio.km); $('#mRaggioDa').textContent = 'da ' + nomeRaggio(); }
    $('#mVicino').classList.toggle('attivo', !!(raggio && raggio.te));
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
    disegnaCerchio();
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
    var voci = [], titolo, nota;
    if (strati.colore === 'sconto') {
      titolo = 'Sconto sul valore';
      [['f-ottimo', '40% o più'], ['f-buono', '25–39%'], ['f-medio', '10–24%'], ['f-basso', 'meno del 10%'], ['f-nd', 'Non stimato o poco affidabile']].forEach(function (x) {
        voci.push('<li><i class="m-dot ' + x[0] + '" aria-hidden="true"></i>' + x[1] + '</li>');
      });
      nota = 'Solo sconti con valore di affidabilità media o alta. Un gruppo ha il colore del suo sconto più alto.';
    } else if (strati.colore === 'data') {
      titolo = 'Data dell\'asta';
      [['d-1', 'Entro 7 giorni'], ['d-2', 'Entro 30 giorni'], ['d-3', 'Entro 90 giorni'], ['d-4', 'Oltre 90 giorni'], ['f-nd', 'Data non indicata']].forEach(function (x) {
        voci.push('<li><i class="m-dot ' + x[0] + '" aria-hidden="true"></i>' + x[1] + '</li>');
      });
      nota = 'Un gruppo ha il colore della sua asta più vicina nel tempo.';
    } else {
      var s = soglie(), ord = ['ottimo', 'buono', 'medio', 'basso'];
      titolo = 'Punteggio affare';
      ord.forEach(function (k, i) {
        if (s[k] == null) return;
        var sup = null;
        for (var j = i - 1; j >= 0; j--) if (s[ord[j]] != null) { sup = s[ord[j]] - 1; break; }
        voci.push('<li><i class="m-dot f-' + k + '" aria-hidden="true"></i>' + esc(fascia(s[k]).etichetta) + '<span>' + (sup == null ? s[k] + '+' : s[k] + '–' + sup) + '</span></li>');
      });
      voci.push('<li><i class="m-dot f-nd" aria-hidden="true"></i>Senza punteggio</li>');
      nota = 'Un gruppo ha il colore del suo affare migliore.';
    }
    return '<p class="m-legenda-t">' + titolo + '</p><ul>' + voci.join('') + '</ul><p class="m-legenda-n">' + nota +
      (strati.prezzi ? ' Avvicinando la mappa, il puntino mostra il prezzo base.' : '') + '</p>';
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

  /* ---------- distanza: "Vicino a me" o un punto scelto, con un cerchio ---------- */
  function nomeRaggio() { return raggio && raggio.te ? 'te' : 'il punto scelto'; }
  function disegnaCerchio() {
    if (!mappa) return;
    if (!raggio) { if (cerchio) { mappa.removeLayer(cerchio); cerchio = null; } return; }
    var ll = [raggio.lat, raggio.lng];
    if (!cerchio) {
      cerchio = L.layerGroup([
        L.circle(ll, { radius: raggio.km * 1000, className: 'm-cerchio', interactive: false }),
        L.marker(ll, { icon: L.divIcon({ className: 'm-centro' + (raggio.te ? ' te' : ''), iconSize: [18, 18], html: '<i></i>' }), interactive: false, keyboard: false, zIndexOffset: 300000 })
      ]).addTo(mappa);
    } else cerchio.eachLayer(function (l) { l.setLatLng(ll); if (l.setRadius) l.setRadius(raggio.km * 1000); });
    cerchio.eachLayer(function (l) { var el = l.getElement && l.getElement(); if (el && l.setRadius === undefined) el.classList.toggle('te', !!raggio.te); });
  }
  function boundsRaggio() { var b = bboxRaggio(); return [[b[0], b[1]], [b[2], b[3]]]; }
  function impostaRaggio(lat, lng, te) {
    var k = raggio ? raggio.km : 25;
    if (cerchio) { mappa.removeLayer(cerchio); cerchio = null; }
    raggio = { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5, km: k, te: !!te };
    ordineZona = 'vicine';
    cambiaFiltri();
    disegnaCerchio();
    adatta(boundsRaggio());
    if (TELEFONO.matches) { chiudiFoglio('filtri', true); apriFoglio('zona'); fuoco($('#hZona')); }
  }
  function togliRaggio() {
    raggio = null;
    if (ordineZona === 'vicine') ordineZona = 'migliori';
    disegnaCerchio();
    cambiaFiltri();
  }
  function armaPunto(si) {
    sceltaPunto = si;
    $('#mScegliPunto').setAttribute('aria-pressed', String(si));
    $('#mMappa').classList.toggle('m-scegli', si);
    if (si) {
      if (TELEFONO.matches) chiudiFoglio('filtri', true);
      U.toast((TOCCO.matches ? 'Tocca' : 'Fai clic su') + ' la mappa nel punto da cui misurare la distanza');
    }
  }
  function vicinoAMe() {
    var b = $('#mVicino');
    if (!navigator.geolocation) { U.toast('Questo browser non sa dire dove ti trovi: scegli un punto sulla mappa'); return; }
    if (b.disabled) return;
    var t = b.innerHTML;
    b.disabled = true; $('span', b).textContent = 'Cerco la tua posizione…';
    navigator.geolocation.getCurrentPosition(function (p) {
      b.disabled = false; b.innerHTML = t;
      var c = p.coords;
      if (c.latitude < DENTRO.s - 0.5 || c.latitude > DENTRO.n + 0.5 || c.longitude < DENTRO.o - 0.5 || c.longitude > DENTRO.e + 0.5) {
        U.toast('Sembri fuori dall\'Italia: scegli un punto sulla mappa', 6000); return;
      }
      posizioneTe = [c.latitude, c.longitude];
      impostaRaggio(c.latitude, c.longitude, true);
    }, function (e) {
      b.disabled = false; b.innerHTML = t;
      U.toast(e && e.code === 1 ? 'Posizione non permessa: puoi scegliere un punto sulla mappa' : 'Posizione non disponibile: riprova o scegli un punto sulla mappa', 6000);
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
  }

  /* ---------- cerca un luogo: regioni, province, comuni e tribunali con aste ---------- */
  var TIPI_LUOGO = { Comune: 0, Provincia: 1, Regione: 2, Tribunale: 3 };
  function estendi(o, k, a) {
    var x = o[k] || (o[k] = { n: 0, s: 90, w: 180, nn: -90, e: -180 });
    x.n++; if (a.lat < x.s) x.s = a.lat; if (a.lat > x.nn) x.nn = a.lat; if (a.lng < x.w) x.w = a.lng; if (a.lng > x.e) x.e = a.lng;
  }
  function costruisciLuoghi() {
    var com = {}, trib = {}, prov = {}, oggiS = oggi();
    for (var i = 0; i < tutte.length; i++) {
      var a = tutte[i];
      if (!conPosizione(a) || (a.dataAsta && a.dataAsta < oggiS)) continue;
      if (a.comune) estendi(com, a.comune + '|' + (a.provincia || ''), a);
      if (a.tribunale) estendi(trib, a.tribunale, a);
      if (a.provincia) estendi(prov, a.provincia, a);
    }
    luoghi = [];
    (G.regioni || []).forEach(function (r) { luoghi.push({ tipo: 'Regione', nome: r, chiave: senzaAccenti(r), regione: r }); });
    Object.keys(G.province).forEach(function (sg) {
      var p = G.province[sg];
      luoghi.push({ tipo: 'Provincia', nome: p.nome + ' (' + sg + ')', chiave: senzaAccenti(p.nome + ' ' + sg), b: prov[sg], n: prov[sg] ? prov[sg].n : 0, centro: [p.lat, p.lng] });
    });
    Object.keys(com).forEach(function (k) {
      var x = k.split('|');
      luoghi.push({ tipo: 'Comune', nome: x[0] + (x[1] ? ' (' + x[1] + ')' : ''), chiave: senzaAccenti(x[0]), b: com[k], n: com[k].n });
    });
    Object.keys(trib).forEach(function (t) { luoghi.push({ tipo: 'Tribunale', nome: 'Tribunale di ' + t, chiave: senzaAccenti(t + ' tribunale'), b: trib[t], n: trib[t].n }); });
  }
  function trovaLuoghi(q) {
    var t = senzaAccenti(q).trim().replace(/\s+/g, ' ');
    if (t.length < 2 || !luoghi) return [];
    var out = [];
    for (var i = 0; i < luoghi.length; i++) {
      var l = luoghi[i], j = l.chiave.indexOf(t);
      if (j < 0) continue;
      var pos = j === 0 ? 0 : /[\s'(-]/.test(l.chiave.charAt(j - 1)) ? 1 : 2;
      out.push([pos * 10 + TIPI_LUOGO[l.tipo], -(l.n || 0), l]);
    }
    out.sort(function (x, y) { return x[0] - y[0] || x[1] - y[1] || x[2].nome.localeCompare(y[2].nome, 'it'); });
    return out.slice(0, 8).map(function (x) { return x[2]; });
  }
  var trovati = [], attivo = -1;
  function mostraLuoghi() {
    var inp = $('#mCercaInput'), ul = $('#mCercaLista');
    trovati = trovaLuoghi(inp.value); attivo = trovati.length ? 0 : -1;
    var q = inp.value.trim();
    if (!q || q.length < 2) { ul.hidden = true; inp.setAttribute('aria-expanded', 'false'); inp.removeAttribute('aria-activedescendant'); return; }
    ul.innerHTML = trovati.length ? trovati.map(function (l, i) {
      return '<li role="option" id="mLuogo' + i + '" data-i="' + i + '" aria-selected="' + (i === attivo) + '"><b>' + esc(l.nome) + '</b><small>' + l.tipo +
        (l.tipo === 'Regione' ? '' : ' · ' + (l.n ? aste(l.n) + ' sulla mappa' : 'nessuna asta sulla mappa')) + '</small></li>';
    }).join('') : '<li class="m-cerca-vuoto" role="option" aria-disabled="true">Nessun luogo con aste trovato</li>';
    ul.hidden = false; inp.setAttribute('aria-expanded', 'true');
    if (attivo >= 0) inp.setAttribute('aria-activedescendant', 'mLuogo' + attivo); else inp.removeAttribute('aria-activedescendant');
  }
  function evidenziaLuogo(i) {
    attivo = i;
    $$('#mCercaLista [role="option"]').forEach(function (li, k) { li.setAttribute('aria-selected', String(k === i)); if (k === i) li.scrollIntoView({ block: 'nearest' }); });
    if (i >= 0) $('#mCercaInput').setAttribute('aria-activedescendant', 'mLuogo' + i);
  }
  function chiudiLuoghi() { $('#mCercaLista').hidden = true; $('#mCercaInput').setAttribute('aria-expanded', 'false'); $('#mCercaInput').removeAttribute('aria-activedescendant'); }
  function vaiLuogo(l) {
    if (!l || !mappa) return;
    if (l.tipo === 'Regione') { var r = confiniDi(l.regione); if (r) adatta(r); }
    else if (l.b && l.b.n) {
      if (l.b.n === 1 || (l.b.nn - l.b.s < 0.004 && l.b.e - l.b.w < 0.004)) vai([(l.b.s + l.b.nn) / 2, (l.b.w + l.b.e) / 2], 14);
      else { var o = paddingVista(); o.maxZoom = 14; o.animate = !CALMO.matches; mappa.fitBounds([[l.b.s, l.b.w], [l.b.nn, l.b.e]], o); }
    } else if (l.centro) vai(l.centro, 10);
    $('#mCercaInput').value = l.nome;
    chiudiLuoghi();
    if (TELEFONO.matches) chiudiCerca(true);   // il campo sparisce: il fuoco torna al pulsante della lente, non si perde
    U.toast(l.tipo === 'Regione' || (l.b && l.b.n) ? 'Ecco ' + l.nome : l.nome + ': nessuna asta con posizione, ti porto nel capoluogo');
  }
  function apriCerca() {
    var f = $('#mCerca');
    f.classList.add('aperta'); $('#mApriCerca').setAttribute('aria-expanded', 'true');
    fuoco($('#mCercaInput'));
  }
  function chiudiCerca(rifuoco) {
    chiudiLuoghi();
    $('#mCerca').classList.remove('aperta'); $('#mApriCerca').setAttribute('aria-expanded', 'false');
    if (rifuoco && TELEFONO.matches) fuoco($('#mApriCerca'));
  }

  /* ---------- condividi la vista: centro, zoom, colore e filtri (mai la posizione) ---------- */
  function linkVista() {
    var c = mappa.getCenter(), z = Math.round(mappa.getZoom() * 4) / 4;
    var f = perElenco(false);
    delete f.seguite;                                  // le aste seguite sono di chi condivide, non di chi riceve il link
    delete f.al; if (extra.al) f.al = extra.al;      // nella mappa "entro N giorni" resta relativo a oggi
    if (raggio) { delete f.bbox; if (extra.bbox) f.bbox = extra.bbox; }
    if (filtri.giorni) f.giorni = filtri.giorni;
    if (filtri.smin) f.smin = filtri.smin;
    // con "Vicino a me" la vista è centrata sulla posizione di chi usa la mappa: il link non la porta, anche dopo aver
    // tolto il cerchio finché la vista resta a meno di 25 km da lì
    var parti = [];
    if (!vistaSuDiTe(c)) parti.push('vista=' + c.lat.toFixed(4) + ',' + c.lng.toFixed(4) + ',' + z);
    if (strati.colore !== 'punteggio') parti.push('colore=' + strati.colore);
    if (Object.keys(f).length) parti.push('filtri=' + encodeURIComponent(JSON.stringify(f)));
    return location.origin + location.pathname + (parti.length ? '?' + parti.join('&') : '');
  }
  function vistaSuDiTe(c) {
    return !!(raggio && raggio.te) || !!(posizioneTe && distanzaKm(c.lat, c.lng, posizioneTe[0], posizioneTe[1]) < 25);
  }
  function condividiVista() {
    if (!mappa) return;
    var u = linkVista(), nota = vistaSuDiTe(mappa.getCenter()) ? ' (senza la tua posizione né la vista intorno a te)' : raggio ? ' (senza il cerchio della distanza)' : '';
    if (navigator.share && TOCCO.matches) { navigator.share({ title: 'Mappa delle aste – Radar Aste Italia', url: u }).catch(function () {}); return; }
    function ok() { U.toast('Link della vista copiato' + nota); }
    function ripiego() {
      var t = document.createElement('textarea'); t.value = u; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;opacity:0;top:0';
      document.body.appendChild(t); t.select();
      var riuscito = false; try { riuscito = document.execCommand('copy'); } catch (e) {}
      t.remove();
      if (riuscito) ok(); else U.toast('Copia non riuscita. Il link è: ' + u, 9000);
    }
    try { navigator.clipboard.writeText(u).then(ok, ripiego); } catch (e) { ripiego(); }
  }
  // ?vista=lat,lng,zoom: la vista del link condiviso
  function leggiVista() {
    var v = (new URLSearchParams(location.search).get('vista') || '').split(',').map(Number);
    if (v.length !== 3 || !v.every(isFinite)) return null;
    if (v[0] < LIMITI[0][0] || v[0] > LIMITI[1][0] || v[1] < LIMITI[0][1] || v[1] > LIMITI[1][1]) return null;
    return { c: [v[0], v[1]], z: Math.max(4, Math.min(19, v[2])) };
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
    // "Vicino a me" e schermo intero (solo dove il browser lo permette)
    var Altri = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function () {
        var d = L.DomUtil.create('div', 'leaflet-bar m-altri'), a = L.DomUtil.create('a', '', d);
        a.href = '#'; a.title = 'Vicino a me'; a.setAttribute('role', 'button'); a.setAttribute('aria-label', 'Aste vicino a me');
        a.innerHTML = U.icona('mirino');
        L.DomEvent.on(a, 'click', function (e) { L.DomEvent.preventDefault(e); vicinoAMe(); });
        var app = $('.m-app');
        if (document.fullscreenEnabled && app && app.requestFullscreen) {
          var fs = L.DomUtil.create('a', 'm-schermo', d);
          fs.href = '#'; fs.title = 'Schermo intero'; fs.setAttribute('role', 'button'); fs.setAttribute('aria-label', 'Mappa a schermo intero'); fs.setAttribute('aria-pressed', 'false');
          fs.innerHTML = SCHERMO;
          L.DomEvent.on(fs, 'click', function (e) {
            L.DomEvent.preventDefault(e);
            if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
            else app.requestFullscreen().catch(function () { U.toast('Schermo intero non disponibile'); });
          });
          document.addEventListener('fullscreenchange', function () {
            var su = !!document.fullscreenElement;
            fs.setAttribute('aria-pressed', String(su)); fs.title = su ? 'Esci dallo schermo intero' : 'Schermo intero';
            setTimeout(function () { mappa.invalidateSize({ pan: false }); programma(); }, 60);
          });
        }
        L.DomEvent.disableClickPropagation(d);
        return d;
      }
    });
    new Altri().addTo(mappa);
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
    mappa.on('mousemove', sopraMappa);
    mappa.on('mouseout', function () { if (!cellaFissa && cellaSopra) nascondiCellaPresto(); });
    mappa.on('click', function (e) {
      if (sceltaPunto) { armaPunto(false); impostaRaggio(e.latlng.lat, e.latlng.lng, false); return; }
      var c = cellaIn(e.containerPoint);
      if (c) fissaCella(c); else if (cellaFissa) chiudiCella();
      if (regioneFissa) chiudiFoglio('regione');
      if (TELEFONO.matches) { chiudiFoglio('scheda', true); chiudiFoglio('zona', true); }
    });
    // vista iniziale: l'Italia intera su qualunque schermo (tornando indietro, dove si era)
    var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0], v = leggiSessione(K_VISTA);
    vistaUrl = leggiVista();
    if (vistaUrl) mappa.setView(vistaUrl.c, vistaUrl.z, { animate: false });
    else if (nav && nav.type === 'back_forward' && v && v.c && isFinite(v.z)) mappa.setView(v.c, v.z, { animate: false });
    else mappa.fitBounds(ITALIA, paddingVista());
    // tasto destro (computer): misura la distanza da quel punto
    mappa.on('contextmenu', function (e) {
      if (TOCCO.matches || !datiPronti) return;
      impostaRaggio(e.latlng.lat, e.latlng.lng, false);
      U.toast('Distanza misurata dal punto del clic destro: cambiala o toglila nei filtri');
    });
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
    $('#mPuntini').addEventListener('change', function () { strati.puntini = this.checked; cambiaStrati(); });
    $('#mPrezzi').addEventListener('change', function () { strati.prezzi = this.checked; cambiaStrati(); rifaiMarcatori(); });
    $('#mColora').addEventListener('change', function () { if (MODI.indexOf(this.value) >= 0) { strati.colore = this.value; cambiaStrati(); rifaiMarcatori(); } });
    $('#mGiorni').addEventListener('change', function () { filtri.giorni = GIORNI.indexOf(+this.value) >= 0 ? +this.value : 0; cambiaFiltri(); });
    $('#mSconto').addEventListener('change', function () { filtri.smin = SCONTI.indexOf(+this.value) >= 0 ? +this.value : 0; cambiaFiltri(); });
    $('#mVicino').addEventListener('click', vicinoAMe);
    $('#mScegliPunto').addEventListener('click', function () { armaPunto(!sceltaPunto); });
    $('#mTogliRaggio').addEventListener('click', function () { togliRaggio(); fuoco($('#mVicino')); });
    $('#mKm').addEventListener('change', function () {
      if (!raggio || KM.indexOf(+this.value) < 0) return;
      raggio.km = +this.value; cambiaFiltri(); disegnaCerchio(); adatta(boundsRaggio());
    });
    $('#mCondividi').addEventListener('click', condividiVista);
    $('#mOrdina').addEventListener('click', function (e) {
      var c = e.target.closest('.chip'); if (!c || !ORDINI_ZONA[c.dataset.ord]) return;
      ordineZona = c.dataset.ord; aggiornaZona();
    });
    // anello sulla mappa per la voce sotto il puntatore o con il fuoco
    var sopraVoce = function (e) { var v = e.target.closest && e.target.closest('.m-voce'); mostraSopra(v ? perId[v.getAttribute('data-id')] : null); };
    ['mouseover', 'focusin'].forEach(function (t) { $('#mMigliori').addEventListener(t, sopraVoce); $('#mScheda').addEventListener(t, sopraVoce); });
    ['mouseleave', 'focusout'].forEach(function (t) { $('#mMigliori').addEventListener(t, function () { mostraSopra(null); }); $('#mScheda').addEventListener(t, function () { mostraSopra(null); }); });
    // ricerca dei luoghi
    var inp = $('#mCercaInput');
    inp.addEventListener('input', mostraLuoghi);
    inp.addEventListener('focus', function () { if (inp.value.trim().length >= 2) mostraLuoghi(); });
    inp.addEventListener('keydown', function (e) {
      var n = trovati.length;
      if (e.key === 'ArrowDown' && n) { e.preventDefault(); if ($('#mCercaLista').hidden) mostraLuoghi(); evidenziaLuogo((attivo + 1) % n); }
      else if (e.key === 'ArrowUp' && n) { e.preventDefault(); evidenziaLuogo((attivo - 1 + n) % n); }
      else if (e.key === 'Enter') { e.preventDefault(); if (attivo >= 0 && trovati[attivo]) vaiLuogo(trovati[attivo]); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!$('#mCercaLista').hidden) chiudiLuoghi(); else chiudiCerca(true); }
    });
    $('#mCercaLista').addEventListener('mousedown', function (e) { e.preventDefault(); });   // il clic non toglie il fuoco al campo
    $('#mCercaLista').addEventListener('click', function (e) { var li = e.target.closest('[data-i]'); if (li) vaiLuogo(trovati[+li.getAttribute('data-i')]); });
    $('#mCerca').addEventListener('submit', function (e) { e.preventDefault(); if (attivo >= 0 && trovati[attivo]) vaiLuogo(trovati[attivo]); });
    $('#mCerca').addEventListener('focusout', function (e) { if (!$('#mCerca').contains(e.relatedTarget)) chiudiLuoghi(); });
    $('#mApriCerca').addEventListener('click', function () { if ($('#mCerca').classList.contains('aperta')) chiudiCerca(true); else apriCerca(); });
    $('#mCercaChiudi').addEventListener('click', function () { inp.value = ''; chiudiCerca(true); });
    $('#mCalore').addEventListener('change', function () { strati.calore = this.checked; cambiaStrati(); });
    $('#mCaloreMini').addEventListener('click', function () {
      apriFoglio('filtri', $('#mCalore'));
      var corpo = $('#mFiltri .m-foglio-corpo'), fs = $('#mFiltri .m-strati');
      if (corpo && fs) corpo.scrollTop = Math.max(0, fs.offsetTop - corpo.offsetTop - 12);
    });
    $('#mCella').addEventListener('click', function (e) { if (e.target.closest('[data-chiudi-cella]')) chiudiCella(true); });
    $('#mDaElenco').addEventListener('click', function (e) {
      var b = e.target.closest('[data-togli]'); if (!b) return;
      delete extra[b.getAttribute('data-togli')];
      cambiaFiltri();
      fuoco($('#mDaElenco [data-togli]') || $('#mCat .chip[aria-pressed="true"]'));
    });
    // anche la distanza è un filtro (conta in "N attivi"): l'azzeramento toglie il cerchio
    $('#mAzzera').addEventListener('click', function () { filtri = copia(VUOTI); extra = {}; togliRaggio(); fuoco($('#mCat .chip')); });
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
      if (sceltaPunto) { armaPunto(false); e.preventDefault(); return; }
      if (!$('#mCella').hidden) { chiudiCella($('#mCella').contains(document.activeElement)); e.preventDefault(); }
      else if (aperto('scheda')) { chiudiFoglio('scheda'); e.preventDefault(); }
      else if (aperto('regione')) { chiudiFoglio('regione'); e.preventDefault(); }
      else if (TELEFONO.matches && aperto('zona')) { chiudiFoglio('zona'); fuoco($('#mApriZona')); e.preventDefault(); }
    });
    Object.keys(FOGLI).forEach(function (k) { trascinabile($(FOGLI[k]), k); });
    var suCambio = function (mq, fn) { try { mq.addEventListener('change', fn); } catch (e) { try { mq.addListener(fn); } catch (e2) {} } };
    suCambio(TELEFONO, adattaLayout);
    window.addEventListener('resize', function () { misuraTesta(); });
    var tema = function () { COL = null; COLC = null; ristilizza(); dipingi(); };
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
    leggiStrati();
    var R = window.ASTE_RACCOLTE, quando = R && typeof R.aggiornato === 'string' ? R.aggiornato.slice(0, 10) : '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(quando)) $('#mCaloreData').textContent = '; dati della raccolta del ' + U.dataIt(quando);
    eventi(); sincronizza(); applicaStrati(); adattaLayout();
    if (!window.Supercluster) $('#mAvviso').innerHTML = 'Impossibile caricare il raggruppamento dei punti (assets/vendor/supercluster).', $('#mAvviso').hidden = false;
    // lascia disegnare la pagina prima del lavoro pesante (decodifica di decine di migliaia di aste)
    setTimeout(function () {
      tutte = S ? S.aste() : [];
      seguite = S ? S.idSeguite() : {};
      ricalcola();
      datiPronti = true;
      costruisciLuoghi();
      if (daFuori) { salvaFiltri(); if (!vistaUrl) vistaDaFiltri(); }
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
