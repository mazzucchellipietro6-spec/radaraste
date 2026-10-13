/* Schede a pezzi: per ogni asta un record completo, diviso in 128 file data/dettagli/XX.js (XX = 00..7f,
 * hash semplice e stabile dell'id). Il sito scarica solo il pezzo che serve: la scheda e il confronto si
 * aprono con quel solo file, senza caricare l'elenco (data/aste.js).
 *
 * Ogni pezzo è una sola istruzione JavaScript, così funziona anche aprendo il sito da file (senza fetch):
 *   (window.RADAR_DETTAGLI = window.RADAR_DETTAGLI || {})['3f'] = { "pvp-123": {...}, ... };
 *
 *   Dettagli.chiave('pvp-123')  → '3f'   (la stessa funzione è usata dalla raccolta: scripts/lib/arricchimento.mjs)
 *   Dettagli.carica('pvp-123')  → Promise dell'oggetto, o null se l'asta non c'è (o il pezzo non si scarica)
 *   Dettagli.base = 'data/dettagli/'   cartella dei pezzi (relativa alla pagina)
 *
 * Contenuto di ogni oggetto (i campi assenti mancano: nessun valore inventato):
 *   - tutti i campi corti dell'elenco (id, titolo, categoria, prezzoBase, dataAsta, lat, lng, tentativo, stima,
 *     termineOfferte, superficieMq, valore, valoreMin, valoreMax, fonteValore, affidabilita, sconto, punteggio...);
 *   - descrizione: testo completo ripulito dai dati personali (descrizione del lotto + descrizioni dei beni, max 1500);
 *   - foto: fino a 8 URL completi (https://resource-pvp.giustizia.it/...); fotoTotali: quante sono in tutto;
 *   - allegati: { perizia, avviso, ordinanza } (URL completi); catasto (testo), vani, piano;
 *   - cauzione (testo), cauzionePerc, contoSpese (testo), contoSpesePerc, modalita, tipoVendita, rito, esito;
 *   - rge: 'numero/anno' se letto dal dettaglio (nell'elenco solo il numero);
 *   - rischi: [{ chiave, etichetta, prova, importo? }] (nell'elenco solo le chiavi); superficieDa ('scheda' o 'testo')
 *     e superficieProva (frase da cui viene la superficie, se dal testo);
 *   - storico: [[data, prezzoBase, esito]] dei tentativi precedenti (dal più vecchio, max 10; esito 'deserta',
 *     'aggiudicata', 'sospesa' o null); storicoNota se una parte della catena non si è potuta collegare;
 *   - parti, mancanti, controlli, zona: dettaglio del punteggio (js/punteggio.js), valoreEtichetta. */
(function (root) {
  'use strict';

  var PEZZI = 128;

  // FNV-1a a 32 bit sull'id, ultimi 7 bit in esadecimale ('00'..'7f')
  function chiave(id) {
    var s = String(id), h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return ('0' + (h % PEZZI).toString(16)).slice(-2);
  }

  // tutte le chiavi dei pezzi, in ordine
  function chiavi() {
    var out = [];
    for (var i = 0; i < PEZZI; i++) out.push(('0' + i.toString(16)).slice(-2));
    return out;
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

  var Dettagli = { PEZZI: PEZZI, chiave: chiave, chiavi: chiavi, carica: carica, testo: testo, analizza: analizza, base: 'data/dettagli/' };
  if (typeof module !== 'undefined' && module.exports) module.exports = Dettagli;
  else root.Dettagli = Dettagli;
})(typeof window !== 'undefined' ? window : globalThis);
