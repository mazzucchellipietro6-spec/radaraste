/* Estrae i dati principali dal testo di un avviso di vendita incollato dall'utente,
 * e riconosce la fonte di un link. Nessuna richiesta di rete: lavora solo sul testo. */
(function (root) {
  'use strict';

  var MESI = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];

  var FONTI = [
    { re: /pvp\.giustizia\.it/i, nome: 'Portale Vendite Pubbliche' },
    { re: /astegiudiziarie\.it/i, nome: 'Aste Giudiziarie Inlinea' },
    { re: /astalegale\.net/i, nome: 'Astalegale' },
    { re: /fallcoaste\.it/i, nome: 'Fallco Aste' },
    { re: /ivg|istitutovendite/i, nome: 'IVG' },
    { re: /agenziademanio\.it/i, nome: 'Agenzia del Demanio' }
  ];

  // "120.000,00" → 120000 ; "95 000" → 95000 ; "1.234" → 1234
  function numeroIt(s) {
    if (!s) return null;
    var t = String(s).replace(/[€\s]/g, '').replace(/euro/i, '');
    if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
    else t = t.replace(/[.,]/g, '');
    var n = parseFloat(t);
    return isFinite(n) ? n : null;
  }

  function cifra(testo, etichetta) {
    var re = new RegExp(etichetta + '[^0-9€\\n]{0,40}(?:€|euro|eur)?\\s*([0-9][0-9.\\s]*(?:,[0-9]{1,2})?)', 'i');
    var m = testo.match(re);
    return m ? numeroIt(m[1].trim()) : null;
  }

  function isoData(g, m, a) {
    var d = new Date(Date.UTC(+a, +m - 1, +g));
    if (d.getUTCMonth() !== +m - 1) return null;
    return a + '-' + String(m).padStart(2, '0') + '-' + String(g).padStart(2, '0');
  }

  function data(testo) {
    // preferisce una data vicina a parole chiave dell'asta
    var zona = testo.match(/(?:asta|vendita|esperimento|udienza|giorno|data)[\s\S]{0,80}/i);
    var pezzi = zona ? [zona[0], testo] : [testo];
    for (var i = 0; i < pezzi.length; i++) {
      var m = pezzi[i].match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/);
      if (m) { var d = isoData(m[1], m[2], m[3]); if (d) return d; }
      var t = pezzi[i].match(new RegExp('(\\d{1,2})\\s+(' + MESI.join('|') + ')\\s+(\\d{4})', 'i'));
      if (t) { var d2 = isoData(t[1], MESI.indexOf(t[2].toLowerCase()) + 1, t[3]); if (d2) return d2; }
    }
    return null;
  }

  function categoria(testo) {
    var t = testo.toLowerCase();
    if (/\b(motociclo|moto|scooter|ciclomotore)\b/.test(t)) return 'moto';
    if (/\b(autovettura|automobile|autocarro|furgone|veicolo|targa(?:ta|to)?|km percorsi)\b/.test(t)) return 'auto';
    if (/(appartament|abitazion|villa|immobil|terreno|box|garage|negozio|capannone|fabbricat|foglio\s+\d+|mappale|particella)/.test(t)) return 'immobile';
    if (/(lotto|attrezzatur|macchinari|arred|beni mobili|gioielli|quadri)/.test(t)) return 'beni';
    return null;
  }

  function fonteDaLink(url) {
    for (var i = 0; i < FONTI.length; i++) if (FONTI[i].re.test(url)) return FONTI[i].nome;
    return null;
  }

  function analizza(testo, GEO) {
    testo = String(testo || '');
    var out = {};
    var base = cifra(testo, 'prezzo\\s+(?:a\\s+)?base(?:\\s+d[\'’]asta)?') || cifra(testo, 'valore\\s+(?:di\\s+)?base') || cifra(testo, 'base\\s+d[\'’]asta');
    if (base) out.prezzoBase = base;
    var min = cifra(testo, 'offerta\\s+minima');
    if (min) out.offertaMinima = min;
    var d = data(testo);
    if (d) out.dataAsta = d;

    var trib = testo.match(/Tribunale\s+(?:ordinario\s+)?di\s+([A-ZÀ-Ý][A-Za-zÀ-ÿ'’]+(?:\s+(?:di\s+|del\s+)?[A-ZÀ-Ý][A-Za-zÀ-ÿ'’]+){0,2})/);
    if (trib) out.tribunale = trib[1].trim();
    var rge = testo.match(/R\.?\s?G\.?\s?E\.?\s*(?:n\.?|nr\.?|num\.?)?\s*(\d+\s*\/\s*\d{2,4})/i) || testo.match(/(?:procedura|esecuzione)[^\n]{0,30}?n\.?\s*(\d+\s*\/\s*\d{4})/i);
    if (rge) out.rge = rge[1].replace(/\s/g, '');

    if (/\b(occupat[oa]|locat[oa]|in corso di liberazione)\b/i.test(testo)) out.stato = 'occupato';
    else if (/\b(liber[oa](?:\s+da\s+persone)?|libero al decreto)\b/i.test(testo)) out.stato = 'libero';

    var cat = categoria(testo);
    if (cat) out.categoria = cat;

    var sig = testo.match(/\(([A-Z]{2})\)/);
    if (GEO && sig && GEO.province[sig[1]]) { out.provincia = sig[1]; out.regione = GEO.province[sig[1]].regione; }
    var com = testo.match(/(?:sit[oa]|ubicat[oa])\s+(?:in|a)\s+([A-ZÀ-Ý][A-Za-zÀ-ÿ'’]+(?:\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ'’]+){0,2})/);
    if (com) out.comune = com[1].trim();
    if (GEO && !out.provincia && out.tribunale) {
      var p = GEO.trova(out.tribunale);
      if (p) { out.provincia = p.sigla; out.regione = p.regione; }
    }

    var urls = testo.match(/https?:\/\/[^\s<>"')]+/gi) || [];
    urls.forEach(function (u) {
      if (/perizia|ctu|stima/i.test(u)) { if (!out.linkPerizia) out.linkPerizia = u; }
      else if (!out.linkAvviso) out.linkAvviso = u;
    });
    if (out.linkAvviso) { var f = fonteDaLink(out.linkAvviso); if (f) out.fonte = f; }

    var prima = testo.split('\n').map(function (r) { return r.trim(); }).filter(function (r) { return r.length > 8 && r.length < 140 && !/^https?:/i.test(r); })[0];
    if (prima) out.titolo = prima;
    return out;
  }

  var Parser = { analizza: analizza, numeroIt: numeroIt, fonteDaLink: fonteDaLink };
  if (typeof module !== 'undefined' && module.exports) module.exports = Parser;
  else root.Parser = Parser;
})(typeof window !== 'undefined' ? window : globalThis);
