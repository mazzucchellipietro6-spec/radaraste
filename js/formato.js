/* Formato compatto del file delle aste raccolte (data/aste.js), condiviso da raccolta (Node) e sito.
 *
 *   { versione: 2, campi: [...], dizionari: { campo: [valori] }, prefissi: [...], righe: [[...], ...] }
 *
 * - i campi con pochi valori diversi (fonte, categoria, tribunale, date...) sono salvati come indice nel loro dizionario;
 *   anche gli elenchi corti (es. rischi: ['abusi','quota']) possono stare in un dizionario: si salva l'indice della combinazione
 *   (l'elenco vuoto è un valore: rischi [] = testo controllato, nessun rischio; campo assente = non controllato);
 * - gli altri valori (numeri, testi, array) sono salvati così come sono;
 * - i link sono salvati come "~N" + resto, dove N è l'indice del prefisso comune in "prefissi";
 * - i valori null in fondo alla riga sono omessi;
 * - la foto di copertina (prima foto della scheda del Portale delle Vendite Pubbliche) è salvata senza
 *   "https://resource-pvp.giustizia.it/" e ricostruita alla lettura solo con quel dominio: un valore che non è il percorso
 *   di un'immagine di quel sito non si scrive e non si legge (nessun indirizzo arbitrario nelle pagine).
 * Il formato precedente (campi + righe senza dizionari) resta leggibile.
 * Formato.date(a) dice come leggere le date di un record (giorno dell'asta e termine per le offerte, Demanio compreso). */
(function (root) {
  'use strict';

  var DIZIONARIO = ['categoria', 'tipo', 'regione', 'provincia', 'comune', 'tribunale', 'fonte', 'dataAsta', 'ora', 'stato', 'pubblicata', 'vista',
    'termineOfferte', 'dettaglio', 'dataRibasso', 'rischi', 'fonteValore', 'affidabilita', 'anomalia', 'numeroLotto', 'annoProcedura'];
  var LINK = ['linkAvviso', 'linkPerizia', 'linkPdf'];

  /* Foto di copertina: solo immagini di resource-pvp.giustizia.it (lo stesso dominio è in img-src della CSP, _headers).
   * Il percorso ammesso è quello che scrive urlRisorsa (scripts/lib/dettaglio-pvp.mjs): parti codificate, estensione
   * d'immagine e, se c'è, il versionId. Niente "//", ".." o ":" (che porterebbero fuori dal dominio o dal sito), e "%" solo
   * seguito da due cifre esadecimali, mai per un punto ("%2e%2e" il browser lo legge come "..") o un carattere di controllo. */
  var RISORSE = 'https://resource-pvp.giustizia.it/';
  var PERCORSO_FOTO = /^(?:[A-Za-z0-9._~()!*'-]|%[0-9A-Fa-f]{2})+(?:\/(?:[A-Za-z0-9._~()!*'-]|%[0-9A-Fa-f]{2})+)*\.(?:jpe?g|png|webp|gif)(?:\?(?:[A-Za-z0-9_.~=&-]|%[0-9A-Fa-f]{2})*)?$/i;
  var CODIFICA_VIETATA = /%(?:2e|[01][0-9a-f]|7f)/i;
  // percorso dopo il dominio (es. 'immagini-beni/1/2/foto.jpg?versionId=…') o null; accetta l'indirizzo completo o il solo percorso
  function percorsoCopertina(v) {
    if (typeof v !== 'string') return null;
    var p = v.indexOf(RISORSE) === 0 ? v.slice(RISORSE.length) : v;
    if (p.length > 400 || !PERCORSO_FOTO.test(p) || CODIFICA_VIETATA.test(p) || /(?:^|\/)\.\.?(?:\/|\?|$)/.test(p)) return null;
    return p;
  }
  // indirizzo completo della copertina (sempre https://resource-pvp.giustizia.it/…) o null
  function copertina(v) { var p = percorsoCopertina(v); return p ? RISORSE + p : null; }

  function prefisso(url) {
    var i = Math.max(url.lastIndexOf('/'), url.lastIndexOf('='));
    return i > 8 ? url.slice(0, i + 1) : '';
  }

  function codifica(aste, campi) {
    var diz = {}, pos = {}, prefissi = [], posPref = {};
    DIZIONARIO.forEach(function (c) { if (campi.indexOf(c) >= 0) { diz[c] = []; pos[c] = {}; } });
    var righe = aste.map(function (a) {
      var r = campi.map(function (c) {
        var v = a[c];
        if (v === undefined || v === '' || v === null) return null;
        if (diz[c]) {
          var k = typeof v === 'string' ? v : (Array.isArray(v) ? '\u0001' : '\u0002') + JSON.stringify(v);
          if (!(k in pos[c])) { pos[c][k] = diz[c].length; diz[c].push(v); }
          return pos[c][k];
        }
        if (c === 'copertina') return percorsoCopertina(v);
        if (LINK.indexOf(c) >= 0 && typeof v === 'string') {
          var p = prefisso(v);
          if (p) {
            if (!(p in posPref)) { posPref[p] = prefissi.length; prefissi.push(p); }
            return '~' + posPref[p] + '~' + v.slice(p.length);
          }
        }
        return v;
      });
      while (r.length && r[r.length - 1] === null) r.pop();
      return r;
    });
    return { versione: 2, campi: campi, dizionari: diz, prefissi: prefissi, righe: righe };
  }

  // restituisce un array di oggetti (solo i campi presenti)
  function decodifica(dati) {
    if (!dati) return [];
    if (!Array.isArray(dati.righe)) return Array.isArray(dati.aste) ? dati.aste.map(copertinaControllata) : [];
    var c = dati.campi, diz = dati.dizionari || {}, pref = dati.prefissi || [];
    var tipo = c.map(function (k) { return diz[k] ? 1 : LINK.indexOf(k) >= 0 ? 2 : 0; });
    return dati.righe.map(function (r) {
      var o = {};
      for (var i = 0; i < r.length; i++) {
        var v = r[i];
        if (v === null || v === undefined) continue;
        if (tipo[i] === 1) { v = diz[c[i]][v]; if (Array.isArray(v)) v = v.slice(); }
        else if (tipo[i] === 2 && typeof v === 'string' && v.charAt(0) === '~') {
          var j = v.indexOf('~', 1);
          v = pref[+v.slice(1, j)] + v.slice(j + 1);
        }
        // la copertina si controlla comunque arrivi (anche da un dizionario o da un prefisso messi a mano nel file)
        if (c[i] === 'copertina' && !(v = copertina(v))) continue;
        o[c[i]] = v;
      }
      return o;
    });
  }
  // formato più vecchio (dati.aste): stessa regola sulla copertina, senza toccare l'oggetto originale
  function copertinaControllata(a) {
    if (!a || typeof a !== 'object' || !('copertina' in a)) return a;
    var o = {}, u = copertina(a.copertina);
    for (var k in a) if (Object.prototype.hasOwnProperty.call(a, k) && k !== 'copertina') o[k] = a[k];
    if (u) o.copertina = u;
    return o;
  }

  /* Date di un'asta lette dai campi del record → { asta: { data, ora } | null, termine: { data, ora } | null }
   * (data 'AAAA-MM-GG', ora 'HH:MM' o ''). dataAsta e ora sono il giorno dell'asta; termineOfferte ('AAAA-MM-GG' o
   * 'AAAA-MM-GGTHH:MM') il termine per le offerte. Agenzia del Demanio: dal 26/10/2026 la raccolta mette in dataAsta il
   * giorno dell'asta scritto nell'avviso e il termine in termineOfferte; nei dati raccolti prima (senza termineOfferte) e
   * negli avvisi che non scrivono il giorno dell'asta (dataAsta e ora uguali al termine) la data è il termine per le
   * offerte e il giorno dell'asta non è noto: asta null, mai inventata. */
  var DEMANIO = 'Agenzia del Demanio';
  function dataOra(x, ora) {
    var m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{1,2})[:.](\d{2}))?/.exec(String(x || '')), o = /^(\d{1,2})[:.](\d{2})/.exec(String(ora || ''));
    if (!m) return null;
    return { data: m[1], ora: m[2] ? ('0' + m[2]).slice(-2) + ':' + m[3] : o ? ('0' + o[1]).slice(-2) + ':' + o[2] : '' };
  }
  function date(a) {
    a = a || {};
    var asta = dataOra(a.dataAsta, a.ora), termine = dataOra(a.termineOfferte, a.oraTermine);
    if (a.fonte === DEMANIO && asta && (!termine || (termine.data === asta.data && termine.ora === asta.ora))) return { asta: null, termine: asta };
    return { asta: asta, termine: termine };
  }

  var Formato = { codifica: codifica, decodifica: decodifica, date: date, copertina: copertina, percorsoCopertina: percorsoCopertina, RISORSE: RISORSE };
  if (typeof module !== 'undefined' && module.exports) module.exports = Formato;
  else root.Formato = Formato;
})(typeof window !== 'undefined' ? window : globalThis);
