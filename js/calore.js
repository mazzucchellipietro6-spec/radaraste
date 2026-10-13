/* Mappa di calore degli sconti: raggruppa le aste in celle quadrate di circa 40 px, in pixel del livello di zoom
 * (Web Mercator, gli stessi di Leaflet: map.project), e calcola per ogni cella lo sconto medio sul valore.
 *
 * - Nel campione entrano SOLO le aste con sconto e valore di affidabilità media o alta. Le altre restano contate
 *   nella cella (per l'elenco "Apri queste aste") ma non spostano la media.
 * - Una cella con meno di MINIMO aste nel campione non si colora: campione troppo piccolo.
 * - Un quadrato in pixel Web Mercator è un rettangolo esatto in latitudine e longitudine: il riquadro della cella
 *   (bbox) contiene proprio le aste della cella.
 * Usato dalla mappa (js/pages/mappa.js) e dai test (Node). */
(function (root) {
  'use strict';
  var LATO = 40;                       // lato della cella in pixel di schermo
  var MINIMO = 3;                      // aste minime nel campione per colorare la cella
  var PASSI = [0.1, 0.2, 0.3, 0.4];    // limiti delle 5 classi di colore: sotto 10%, 10–20, 20–30, 30–40, 40% e oltre
  var TONI = [0.2, 0.4, 0.6, 0.8, 1];  // quanto --accent c'è in ogni classe (il resto è il colore della superficie)
  var AFFIDABILE = { media: 1, alta: 1 };
  var R = 6378137, MAX_LAT = 85.0511287798;   // come L.Projection.SphericalMercator

  function numero(x) {
    if (x == null || x === '') return null;
    var n = Number(x);
    return isFinite(n) ? n : null;
  }
  // sconto che conta nella media (frazione: 0.25 = 25%), o null
  function scontoValido(a) {
    var s = numero(a && a.sconto);
    return s != null && AFFIDABILE[a.affidabilita] ? s : null;
  }

  /* ---------- proiezione (EPSG:3857, come Leaflet) ---------- */
  function scala(zoom) { return 256 * Math.pow(2, zoom); }
  function proietta(lat, lng, zoom) {
    var d = Math.PI / 180, la = Math.max(Math.min(MAX_LAT, lat), -MAX_LAT), sin = Math.sin(la * d), k = 0.5 / (Math.PI * R), s = scala(zoom);
    return [s * (k * R * lng * d + 0.5), s * (-k * R * Math.log((1 + sin) / (1 - sin)) / 2 + 0.5)];
  }
  function inversa(x, y, zoom) {
    var s = scala(zoom), k = 0.5 / (Math.PI * R), px = (x / s - 0.5) / k, py = (y / s - 0.5) / -k, d = 180 / Math.PI;
    return [(2 * Math.atan(Math.exp(py / R)) - Math.PI / 2) * d, px * d / R];
  }

  /* ---------- aggregazione ---------- */
  /* aste: elenco; posizione(a, i) -> [x, y] in pixel del livello di zoom (o null);
   * opz: { lato, minimo, limiti: [x0, y0, x1, y1] } (le aste fuori dai limiti non si leggono; i limiti si allargano
   * alle celle intere, così le celle sul bordo sono complete).
   * Risultato: { lato, minimo, celle: [...], indice: { 'i:j': cella }, totali: { aste, campione, senzaSconto, pocoAffidabili, celle, colorate } }
   * cella: { i, j, x0, y0, x1, y1, aste, campione, somma, media, min, max (null senza campione), colorata, classe (-1 se non colorata) } */
  function aggrega(aste, posizione, opz) {
    opz = opz || {};
    var lato = opz.lato > 0 ? opz.lato : LATO, minimo = opz.minimo > 0 ? opz.minimo : MINIMO, lim = null;
    if (opz.limiti) {
      var l = opz.limiti;
      lim = [Math.floor(l[0] / lato) * lato, Math.floor(l[1] / lato) * lato, Math.ceil(l[2] / lato) * lato, Math.ceil(l[3] / lato) * lato];
    }
    var indice = {}, celle = [], tot = { aste: 0, campione: 0, senzaSconto: 0, pocoAffidabili: 0, celle: 0, colorate: 0 };
    for (var n = 0; n < aste.length; n++) {
      var a = aste[n], p = posizione(a, n);
      if (!p || !isFinite(p[0]) || !isFinite(p[1])) continue;
      if (lim && (p[0] < lim[0] || p[0] >= lim[2] || p[1] < lim[1] || p[1] >= lim[3])) continue;
      var i = Math.floor(p[0] / lato), j = Math.floor(p[1] / lato), k = i + ':' + j, c = indice[k];
      if (!c) {
        c = indice[k] = { i: i, j: j, x0: i * lato, y0: j * lato, x1: (i + 1) * lato, y1: (j + 1) * lato, aste: 0, campione: 0, somma: 0, media: null, min: null, max: null, colorata: false, classe: -1 };
        celle.push(c);
      }
      c.aste++; tot.aste++;
      var s = scontoValido(a);
      if (s != null) {
        c.campione++; c.somma += s; tot.campione++;
        if (c.min == null || s < c.min) c.min = s;
        if (c.max == null || s > c.max) c.max = s;
      }
      else if (numero(a.sconto) == null) tot.senzaSconto++;
      else tot.pocoAffidabili++;
    }
    for (var m = 0; m < celle.length; m++) {
      var x = celle[m];
      if (x.campione) x.media = x.somma / x.campione;
      x.colorata = x.campione >= minimo;
      x.classe = x.colorata ? classe(x.media) : -1;
      if (x.colorata) tot.colorate++;
    }
    tot.celle = celle.length;
    return { lato: lato, minimo: minimo, celle: celle, indice: indice, totali: tot };
  }

  // cella che contiene il punto (x, y) in pixel del livello di zoom, o null
  function trova(ris, x, y) {
    if (!ris) return null;
    return ris.indice[Math.floor(x / ris.lato) + ':' + Math.floor(y / ris.lato)] || null;
  }

  // classe di colore 0..4 di uno sconto medio (sotto lo 0% resta nella prima)
  function classe(media) {
    var k = 0;
    while (k < PASSI.length && media >= PASSI[k] - 1e-9) k++;
    return k;
  }

  // riquadro [sud, ovest, nord, est] della cella, arrotondato verso l'esterno (6 decimali, circa 10 cm)
  function bbox(cella, zoom) {
    var so = inversa(cella.x0, cella.y1, zoom), ne = inversa(cella.x1, cella.y0, zoom), q = 1e6;
    return [Math.floor(so[0] * q) / q, Math.floor(so[1] * q) / q, Math.ceil(ne[0] * q) / q, Math.ceil(ne[1] * q) / q];
  }

  /* ---------- colori ---------- */
  // "rgb(r, g, b)" o "#rrggbb" -> [r, g, b]
  function rgb(c) {
    c = String(c || '').trim();
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
    if (m) {
      var h = m[1].length === 3 ? m[1].replace(/(.)/g, '$1$1') : m[1];
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(c);
    return m ? [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3])] : null;
  }
  // scala sequenziale a una sola tinta: dalla superficie (poco accento) all'accento pieno.
  // Tema chiaro: dal chiaro allo scuro; tema scuro: dallo scuro al chiaro (più sconto = più contrasto con lo sfondo).
  function scalaColori(accento, superficie) {
    var a = rgb(accento), s = rgb(superficie);
    if (!a || !s) return null;
    return TONI.map(function (t) {
      return 'rgb(' + [0, 1, 2].map(function (k) { return Math.round(s[k] + (a[k] - s[k]) * t); }).join(', ') + ')';
    });
  }

  var Calore = {
    LATO: LATO, MINIMO: MINIMO, PASSI: PASSI, TONI: TONI,
    scontoValido: scontoValido, proietta: proietta, inversa: inversa, aggrega: aggrega, trova: trova, classe: classe, bbox: bbox,
    rgb: rgb, scalaColori: scalaColori
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Calore;
  else root.Calore = Calore;
})(typeof window !== 'undefined' ? window : globalThis);
