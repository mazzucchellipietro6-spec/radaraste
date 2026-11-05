/* Radar 3D: prepara le aste per i livelli della mappa 3D (js/pages/radar3d.js) in funzioni pure, testate in
 * tests/radar3d.test.js.
 *
 * - Fuori: le aste già passate (data dell'asta prima di oggi, come la mappa 2D) e quelle senza una posizione valida
 *   (stessi controlli di conPosizione in js/pages/mappa.js). Restano contate nei totali.
 * - Altezza: lo sconto reale (costo totale al prezzo base contro il valore di mercato), SOLO per le aste con sconto e
 *   valore di affidabilità media o alta. Le altre sono punti bassi grigi: nessuna altezza inventata.
 * - Colore: il punteggio affare sulla scala del sito (--s-0, --s-50, --s-100, letti dal tema dalla pagina).
 * - Esagoni (mappa lontana): altezza = numero di aste, colore = sconto medio delle sole aste affidabili, con le stesse
 *   classi e lo stesso campione minimo della mappa di calore (js/calore.js).
 * - Viaggio nel tempo: i mesi delle date d'asta delle aste in corso.
 * Usabile nel browser (window.Radar3dDati) e in Node. */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  function modulo(nome, file) { try { return NODE ? require(file) : root[nome] || null; } catch (e) { return null; } }

  var DENTRO = { s: 35.2, o: 6.4, n: 47.2, e: 18.8 };   // coordinate plausibili per un'asta in Italia (come la mappa)
  var AFFIDABILE = { media: 1, alta: 1 };
  var PASSI = [0.1, 0.2, 0.3, 0.4];   // classi dello sconto medio, come js/calore.js
  var MINIMO = 3;                     // aste affidabili minime per colorare un esagono, come js/calore.js
  var ALTO_MIN = 0.02;                // colonna affidabile con sconto nullo o negativo: si vede, ma bassa
  var BASSO = 0.01;                   // punti grigi (senza sconto affidabile)
  var MAX_MESI = 10;                  // oltre, i mesi più lontani diventano una voce sola (sul telefono entrano 10 barre)
  var NOMI_MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  // esagoni: dominio del colore e valori al centro di ogni classe (grigio = campione troppo piccolo)
  var DOMINIO_ESAGONI = [-0.1, 0.5];
  var GRIGIO_ESAGONO = -0.05;

  var Calore = modulo('Calore', './calore.js');
  var Formato = modulo('Formato', './formato.js');
  var GEO = modulo('GEO', '../data/geo.js');
  if (Calore) { PASSI = Calore.PASSI; MINIMO = Calore.MINIMO; }

  /* ---------- piccoli aiuti ---------- */
  function numero(x) {
    if (x == null || x === '') return null;
    var n = Number(x);
    return isFinite(n) ? n : null;
  }
  function limita(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function oggiIso(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  /* ---------- regole sulle aste ---------- */
  // coordinate utili: dentro l'Italia e non lontanissime dal capoluogo della provincia indicata (come la mappa 2D)
  function conPosizione(a, province) {
    province = province || (GEO && GEO.province) || {};
    var ok = !!a && typeof a.lat === 'number' && typeof a.lng === 'number' && a.lat >= DENTRO.s && a.lat <= DENTRO.n && a.lng >= DENTRO.o && a.lng <= DENTRO.e;
    var pr = ok && a.provincia && province[a.provincia];
    if (pr && (Math.abs(a.lat - pr.lat) > 1.6 || Math.abs(a.lng - pr.lng) > 2.1)) ok = false;
    return ok;
  }
  // asta già passata: data dell'asta prima di oggi (senza data resta, come nella mappa 2D)
  function passata(a, oggi) { return !!(a && a.dataAsta && String(a.dataAsta).slice(0, 10) < oggi); }
  // sconto che conta: solo con valore di affidabilità media o alta
  function scontoAffidabile(a) {
    var s = numero(a && a.sconto);
    return s != null && AFFIDABILE[a.affidabilita] ? s : null;
  }
  function punteggio(a) {
    var p = numero(a && a.punteggio);
    return p == null ? null : limita(p, 0, 100);
  }
  // giorno dell'asta (Agenzia del Demanio: a volte si conosce solo il termine per le offerte, e allora non c'è)
  function giornoAsta(a) {
    if (Formato && Formato.date) { var D = Formato.date(a); return D.asta ? D.asta.data : null; }
    var m = /^(\d{4}-\d{2}-\d{2})/.exec(String((a && a.dataAsta) || ''));
    return m ? m[1] : null;
  }
  function meseDi(a) { var g = giornoAsta(a); return g ? g.slice(0, 7) : null; }
  // altezza della colonna in frazione (1 = sconto del 100%); i punti grigi hanno BASSO
  function altezza(a) {
    var s = scontoAffidabile(a);
    return s == null ? BASSO : Math.max(ALTO_MIN, limita(s, 0, 1));
  }

  /* ---------- preparazione ---------- */
  /* aste: elenco (Store.aste()); opz: { oggi: 'AAAA-MM-GG', province }.
   * Risultato: { punti: [...], totali: {...}, mesi: [...] }
   * punto: { id, lng, lat, mese, giorno, punteggio, sconto, affidabile, alto, chiave (posizione), insieme (aste nello stesso punto), a } */
  function prepara(aste, opz) {
    opz = opz || {};
    var oggi = opz.oggi || oggiIso(), province = opz.province || (GEO && GEO.province) || {};
    var punti = [], perPosizione = {};
    var tot = { aste: 0, passate: 0, inCorso: 0, senzaPosizione: 0, conPosizione: 0, affidabili: 0, conPunteggio: 0, senzaMese: 0 };
    for (var i = 0; i < (aste || []).length; i++) {
      var a = aste[i];
      if (!a) continue;
      tot.aste++;
      if (passata(a, oggi)) { tot.passate++; continue; }
      tot.inCorso++;
      if (!conPosizione(a, province)) { tot.senzaPosizione++; continue; }
      tot.conPosizione++;
      var s = scontoAffidabile(a), p = punteggio(a), g = giornoAsta(a);
      var pt = {
        id: a.id, lng: a.lng, lat: a.lat, giorno: g, mese: g ? g.slice(0, 7) : null,
        punteggio: p, sconto: s, affidabile: s != null, alto: altezza(a),
        chiave: a.lat.toFixed(5) + ',' + a.lng.toFixed(5), insieme: 1, a: a
      };
      if (pt.affidabile) tot.affidabili++;
      if (p != null) tot.conPunteggio++;
      if (!pt.mese) tot.senzaMese++;
      (perPosizione[pt.chiave] || (perPosizione[pt.chiave] = [])).push(pt);
      punti.push(pt);
    }
    for (var k in perPosizione) { var l = perPosizione[k]; for (var j = 0; j < l.length; j++) l[j].insieme = l.length; }
    return { punti: punti, totali: tot, mesi: elencoMesi(punti, oggi), perPosizione: perPosizione, oggi: oggi };
  }

  /* ---------- viaggio nel tempo ---------- */
  function nomeMese(chiave, breve) {
    var m = /^(\d{4})-(\d{2})$/.exec(chiave || '');
    if (!m) return '';
    var n = NOMI_MESI[+m[2] - 1];
    return (breve ? n.slice(0, 3) : n) + ' ' + m[1];
  }
  /* mesi delle aste in corso, in ordine, con quante aste e quante affidabili. Oltre MAX_MESI, gli ultimi diventano
   * una voce sola "più avanti" (chiave '>AAAA-MM', dal primo mese raggruppato). I mesi prima di oggi non ci sono
   * (le aste passate sono già fuori). */
  function elencoMesi(punti, oggi, max) {
    max = max > 1 ? max : MAX_MESI;
    var conta = {}, aff = {};
    for (var i = 0; i < punti.length; i++) {
      var m = punti[i].mese;
      if (!m) continue;
      conta[m] = (conta[m] || 0) + 1;
      if (punti[i].affidabile) aff[m] = (aff[m] || 0) + 1;
    }
    var chiavi = Object.keys(conta).sort(), mesi = [];
    for (var j = 0; j < chiavi.length; j++) {
      var c = chiavi[j];
      if (mesi.length === max - 1 && chiavi.length > max) {
        var resto = chiavi.slice(j), n = 0, na = 0;
        resto.forEach(function (x) { n += conta[x]; na += aff[x] || 0; });
        mesi.push({ chiave: '>' + c, n: n, affidabili: na, da: c, a: resto[resto.length - 1], etichetta: 'da ' + nomeMese(c) + ' in poi', breve: 'dopo' });
        break;
      }
      mesi.push({ chiave: c, n: conta[c], affidabili: aff[c] || 0, etichetta: nomeMese(c), breve: nomeMese(c, true) });
    }
    return mesi;
  }
  // punti del mese scelto (null o '' = tutti; '>AAAA-MM' = da quel mese in poi)
  function delMese(punti, chiave) {
    if (!chiave) return punti.slice();
    var da = chiave.charAt(0) === '>' ? chiave.slice(1) : null;
    return punti.filter(function (p) { return p.mese && (da ? p.mese >= da : p.mese === chiave); });
  }

  /* ---------- miglior affare ---------- */
  // punteggio più alto tra le aste con valore affidabile; a pari punteggio lo sconto più alto, poi l'asta più vicina
  function confronta(x, y) {
    if (x.punteggio !== y.punteggio) return y.punteggio - x.punteggio;
    if (x.sconto !== y.sconto) return y.sconto - x.sconto;
    var gx = x.giorno || '9', gy = y.giorno || '9';
    if (gx !== gy) return gx < gy ? -1 : 1;
    return String(x.id) < String(y.id) ? -1 : String(x.id) > String(y.id) ? 1 : 0;
  }
  function migliori(punti, k) {
    return punti.filter(function (p) { return p.affidabile && p.punteggio != null; }).sort(confronta).slice(0, k > 0 ? k : 5);
  }
  function migliore(punti) { return migliori(punti, 1)[0] || null; }

  /* ---------- esagoni ---------- */
  // classe 0..4 dello sconto medio (sotto lo 0% resta nella prima), come js/calore.js
  function classe(media) {
    if (Calore && Calore.classe) return Calore.classe(media);
    var k = 0;
    while (k < PASSI.length && media >= PASSI[k] - 1e-9) k++;
    return k;
  }
  /* riassunto delle aste di un esagono: { n, campione, media (null se nessuna affidabile), classe (-1 sotto il minimo),
   * valore: numero per il colore dell'HexagonLayer (centro della classe, GRIGIO_ESAGONO se il campione è piccolo) } */
  function esagono(punti) {
    var n = 0, cam = 0, somma = 0;
    for (var i = 0; i < punti.length; i++) {
      n++;
      if (punti[i].affidabile) { cam++; somma += punti[i].sconto; }
    }
    var media = cam ? somma / cam : null, k = cam >= MINIMO ? classe(media) : -1;
    return { n: n, campione: cam, media: media, classe: k, valore: k < 0 ? GRIGIO_ESAGONO : k * 0.1 + 0.05 };
  }

  /* ---------- colori ---------- */
  // "rgb(r, g, b)" o "#rrggbb" -> [r, g, b]
  function rgb(c) {
    if (Calore && Calore.rgb) return Calore.rgb(c);
    c = String(c || '').trim();
    var m = /^#([0-9a-f]{6})$/i.exec(c);
    if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
    m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(c);
    return m ? [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3])] : null;
  }
  function mescola(x, y, t) { return [0, 1, 2].map(function (k) { return Math.round(x[k] + (y[k] - x[k]) * t); }); }
  /* colore di un punteggio 0..100 sulla scala del sito: 0 = --s-0, 50 = --s-50, 100 = --s-100, in mezzo sfumato.
   * scala: { s0, s50, s100, grigio } in [r, g, b]; senza punteggio il grigio. */
  function colorePunteggio(p, scala) {
    if (p == null || !isFinite(p)) return scala.grigio.slice();
    p = limita(p, 0, 100);
    return p <= 50 ? mescola(scala.s0, scala.s50, p / 50) : mescola(scala.s50, scala.s100, (p - 50) / 50);
  }
  // colore di un punto: punteggio per le colonne con sconto affidabile, grigio per le altre
  function colorePunto(pt, scala) { return pt.affidabile ? colorePunteggio(pt.punteggio, scala) : scala.grigio.slice(); }
  // sei colori per gli esagoni: grigio (campione piccolo) e le 5 classi di sconto sulla stessa scala (0%, 10%… 40%+)
  function coloriEsagoni(scala) {
    return [scala.grigio.slice()].concat([0, 25, 50, 75, 100].map(function (p) { return colorePunteggio(p, scala); }));
  }

  /* ---------- misure ---------- */
  // metri per pixel di schermo a quella latitudine e zoom (Web Mercator, tile da 512 px come MapLibre)
  function metriPerPixel(lat, zoom) { return 40075016.686 * Math.cos(lat * Math.PI / 180) / (512 * Math.pow(2, zoom)); }

  var Radar3dDati = {
    DENTRO: DENTRO, PASSI: PASSI, MINIMO: MINIMO, ALTO_MIN: ALTO_MIN, BASSO: BASSO, MAX_MESI: MAX_MESI,
    DOMINIO_ESAGONI: DOMINIO_ESAGONI, GRIGIO_ESAGONO: GRIGIO_ESAGONO,
    conPosizione: conPosizione, passata: passata, scontoAffidabile: scontoAffidabile, punteggio: punteggio,
    giornoAsta: giornoAsta, meseDi: meseDi, altezza: altezza, prepara: prepara,
    nomeMese: nomeMese, elencoMesi: elencoMesi, delMese: delMese, migliori: migliori, migliore: migliore,
    classe: classe, esagono: esagono, rgb: rgb, colorePunteggio: colorePunteggio, colorePunto: colorePunto,
    coloriEsagoni: coloriEsagoni, metriPerPixel: metriPerPixel, oggi: oggiIso
  };
  if (NODE) module.exports = Radar3dDati;
  else root.Radar3dDati = Radar3dDati;
})(typeof window !== 'undefined' ? window : globalThis);
