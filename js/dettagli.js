/* Schede a pezzi: i dati lunghi di ogni asta (descrizione completa, foto, allegati, catasto, storico dei
 * tentativi, rischi con la frase di prova) stanno in data/dettagli/XX.js, 256 file divisi per un hash
 * semplice e stabile dell'id (XX = due cifre esadecimali). Il sito scarica solo il pezzo che serve.
 *
 * Ogni pezzo è una sola istruzione JavaScript, così funziona anche aprendo il sito da file (senza fetch):
 *   (window.RADAR_DETTAGLI = window.RADAR_DETTAGLI || {})['3f'] = { "pvp-123": {...}, ... };
 *
 *   Dettagli.chiave('pvp-123')  → '3f'   (la stessa funzione è usata dalla raccolta: scripts/raccogli.mjs)
 *   Dettagli.carica('pvp-123')  → Promise dell'oggetto, o null se l'asta non ha scheda
 *   Dettagli.base = 'data/dettagli/'   cartella dei pezzi (relativa alla pagina) */
(function (root) {
  'use strict';

  // FNV-1a a 32 bit sull'id, ultimi 8 bit in esadecimale
  function chiave(id) {
    var s = String(id), h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return ('0' + (h & 255).toString(16)).slice(-2);
  }

  var VARIABILE = 'RADAR_DETTAGLI';

  // testo del file di un pezzo (usato dalla raccolta)
  function testo(k, schede) {
    return '(window.' + VARIABILE + ' = window.' + VARIABILE + ' || {})[' + JSON.stringify(k) + '] = ' + JSON.stringify(schede) + ';\n';
  }
  // contenuto di un pezzo già scritto (usato dalla raccolta per conservare i dettagli letti)
  function analizza(t) {
    var s = String(t || ''), i = s.indexOf('] = ');
    if (i < 0) return null;
    try { return JSON.parse(s.slice(i + 4, s.lastIndexOf('}') + 1)); } catch (e) { return null; }
  }

  var attesi = {};
  function pezzo(k) {
    var g = root[VARIABILE];
    if (g && g[k]) return Promise.resolve(g[k]);
    if (attesi[k]) return attesi[k];
    if (typeof document === 'undefined') return Promise.resolve(null);
    attesi[k] = new Promise(function (ok) {
      var s = document.createElement('script');
      s.src = Dettagli.base + k + '.js';
      s.async = true;
      s.onload = function () { var g2 = root[VARIABILE]; ok(g2 && g2[k] || {}); };
      // pezzo mancante o rete assente: si potrà riprovare più tardi
      s.onerror = function () { delete attesi[k]; if (s.parentNode) s.parentNode.removeChild(s); ok(null); };
      (document.head || document.documentElement).appendChild(s);
    });
    return attesi[k];
  }

  function carica(id) {
    return pezzo(chiave(id)).then(function (p) { return p && p[id] || null; });
  }

  var Dettagli = { chiave: chiave, carica: carica, testo: testo, analizza: analizza, base: 'data/dettagli/' };
  if (typeof module !== 'undefined' && module.exports) module.exports = Dettagli;
  else root.Dettagli = Dettagli;
})(typeof window !== 'undefined' ? window : globalThis);
