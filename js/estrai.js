/* Estrae dati strutturati dal testo degli avvisi (descrizione del lotto, scheda).
 * Funzioni pure, usate dalla raccolta (Node) e dal sito (browser).
 * Ogni dato estratto riporta il pezzo di testo da cui proviene ("prova"), così si può verificare;
 * se il testo non contiene il dato si restituisce null: niente valori inventati. */
(function (root) {
  'use strict';

  function testo(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function numero(s) {
    var t = String(s).replace(/\s/g, '');
    if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    else t = t.replace(',', '.');
    var n = parseFloat(t);
    return isFinite(n) ? n : null;
  }
  function prova(t, i, j) { return t.slice(Math.max(0, i - 40), Math.min(t.length, j + 40)).trim(); }

  /* ---------- Superficie ---------- */
  // superfici accessorie da non scambiare per la superficie dell'immobile
  var ACCESSORIE = /(giardin|cortil|corte\b|terren|area\b|aree\b|terrazz|balcon|lastric|scopert|cantin|box\b|garage|autorimess|posto auto|soffitt|magazzin|deposit|piazzal|pertinenz|lotto di terreno|fondo\b|particella)/i;
  var MQ = /(\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?|\d{1,5}(?:[.,]\d{1,2})?)\s*(?:mq\b|m\.q\.?|m2\b|m²|metri\s+quadr[ia]?|mt\.?\s?q\.?)/gi;
  var SUP_ETICHETTA = /superficie\s+(?:commerciale|lorda|complessiva|convenzionale|catastale|utile|netta|calpestabile)?[^.;\d]{0,40}?(\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?|\d{1,5}(?:[.,]\d{1,2})?)\s*(?:mq|m\.q\.?|m2|m²|metri\s+quadr)/i;

  function superficie(s) {
    var t = testo(s);
    if (!t) return null;
    var m = t.match(SUP_ETICHETTA);
    if (m) {
      var v = numero(m[1]);
      if (v >= 10 && v <= 20000) return { mq: v, metodo: 'superficie indicata', prova: prova(t, m.index, m.index + m[0].length) };
    }
    MQ.lastIndex = 0;
    var x, accessoria = null;
    // se il lotto stesso è un terreno, la superficie del terreno è quella giusta
    var eTerreno = /^(?:\W*(?:lotto\s*\w*\W*)?)(?:piena propriet\w*\s*(?:di|del|su)?\s*)?(?:un\s+|una\s+)?(terren|appezzament|fondo|area|lotto di terreno)/i.test(t);
    while ((x = MQ.exec(t))) {
      var prima = t.slice(Math.max(0, x.index - 30), x.index);
      var n = numero(x[1]);
      if (!(n >= 15 && n <= 200000)) continue;
      if (ACCESSORIE.test(prima)) { if (!accessoria) accessoria = { mq: n, prova: prova(t, x.index, x.index + x[0].length) }; continue; }
      if (n <= 20000) return { mq: n, metodo: 'prima superficie citata', prova: prova(t, x.index, x.index + x[0].length) };
    }
    if (eTerreno && accessoria) return { mq: accessoria.mq, metodo: 'superficie del terreno', prova: accessoria.prova };
    var vani = t.match(/(?:consistenza\s*(?:di\s*)?)?(\d{1,2}(?:[.,]5)?)\s*vani\b/i);
    if (vani) {
      var nv = numero(vani[1]);
      if (nv >= 1 && nv <= 30) return { vani: nv, mq: null, metodo: 'solo vani catastali', prova: prova(t, vani.index, vani.index + vani[0].length) };
    }
    return null;
  }

  /* ---------- Stato di conservazione ---------- */
  // dal peggiore al migliore: il primo che corrisponde vince
  var STATI = [
    ['rudere', /\b(rudere|crollat|inagibil|pericolant|fatiscent)/i],
    ['grezzo', /\b(al grezzo|allo stato grezzo|non ultimat|incomplet|in corso di costruzione|mancante di (?:impianti|infissi|finiture))/i],
    ['da ristrutturare', /\b(da ristrutturare|necessit\w* di (?:importanti |radicali |consistenti )?(?:lavori|interventi|ristrutturazion)|pessim\w* stato|stato (?:di conservazione )?pessim|scadente|degradat|in abbandono|stato di abbandono)/i],
    ['mediocre', /\b(mediocr|discreto stato|stato discreto|sufficient\w* stato|manutenzione ordinaria (?:da|necessaria))/i],
    ['buono', /\b(buono stato|buone condizioni|stato buono|ben tenut|ristrutturat|rifinit|abitabile)/i],
    ['ottimo', /\b(ottim\w* stato|stato ottim|nuova costruzione|di recente costruzione|finiture di pregio)/i]
  ];
  function conservazione(s) {
    var t = testo(s);
    for (var i = 0; i < STATI.length; i++) {
      var m = t.match(STATI[i][1]);
      if (m) return { stato: STATI[i][0], prova: prova(t, m.index, m.index + m[0].length) };
    }
    return null;
  }

  /* ---------- Veicoli ---------- */
  var MARCHE = ['Alfa Romeo', 'Aston Martin', 'Land Rover', 'Range Rover', 'Mercedes-Benz', 'Mercedes Benz', 'Mercedes', 'Rolls Royce',
    'Abarth', 'Aprilia', 'Audi', 'Benelli', 'BMW', 'BYD', 'Chevrolet', 'Chrysler', 'Citroen', 'Citroën', 'Cupra', 'Dacia', 'DAF', 'Daihatsu', 'Daimler',
    'Dodge', 'DS', 'Ducati', 'Ferrari', 'Fiat', 'Ford', 'Harley-Davidson', 'Harley Davidson', 'Honda', 'Hyundai', 'Hyosung', 'Infiniti', 'Isuzu', 'Iveco', 'Jaguar',
    'Jeep', 'Kawasaki', 'Kia', 'KTM', 'Kymco', 'Lamborghini', 'Lancia', 'Lexus', 'Ligier', 'Lynk', 'Mahindra', 'MAN', 'Maserati', 'Mazda', 'MG',
    'Mini', 'Mitsubishi', 'Moto Guzzi', 'MV Agusta', 'Nissan', 'Opel', 'Peugeot', 'Piaggio', 'Polestar', 'Porsche', 'Renault', 'Saab', 'Scania',
    'Seat', 'Skoda', 'Smart', 'SsangYong', 'Subaru', 'Suzuki', 'SYM', 'Tata', 'Tesla', 'Toyota', 'Triumph', 'Vespa', 'Volkswagen', 'VW', 'Volvo', 'Yamaha'];
  var RE_MARCA = new RegExp('\\b(' + MARCHE.map(function (m) { return m.replace(/[-\s]/g, '[-\\s]?'); }).join('|') + ')\\b', 'i');
  var NORMA = { 'mercedes benz': 'Mercedes-Benz', 'mercedes': 'Mercedes-Benz', 'vw': 'Volkswagen', 'citroen': 'Citroën', 'harley davidson': 'Harley-Davidson', 'range rover': 'Land Rover' };
  var STOP_MODELLO = /^(targ\w*|tg\b.*|telaio|revision\w*|scadenz\w*|anno|immatricol\w*|data|di|del|della|colore|cilindrata|alimentazione|km|kw|cc|con|in|e|ed|per|,|;|\(.*|-|–|stato|modello|mod\.?|tipo|versione|benzina|gasolio|diesel|gpl|metano|ibrid\w*|elettric\w*|auto|immatricolat\w*|vendita\w*|lotto|n\.?)$/i;

  function nomeMarca(m) {
    var k = m.toLowerCase().replace(/-/g, ' ');
    if (NORMA[k]) return NORMA[k];
    var f = MARCHE.filter(function (x) { return x.toLowerCase().replace(/-/g, ' ') === k; })[0];
    return f || m;
  }

  function veicolo(s) {
    var t = testo(s);
    if (!t) return null;
    var out = {};
    // "n.3AUTOVETTURA": il tipo può essere attaccato a una cifra
    var ts = t.replace(/(\d)([A-Za-z\u00C0-\u00FF])/g, '$1 $2');
    var tipo = ts.match(/\b(autovettura|automobile|autocarro|furgone|motociclo|motoveicolo|ciclomotore|scooter|trattore stradale|trattore|semirimorchio|rimorchio|camper|autocaravan|quadriciclo|minivan|autobus)\b/i);
    if (tipo) out.tipo = tipo[1].toLowerCase();
    // lotti con più veicoli (a) ... b) ...; più tipi o più marche diverse): niente stima unica
    var tipi = ts.match(/\b(autovettur\w*|automezz\w*|autocarr\w*|furgon\w*|motocicl\w*|motoveicol\w*|ciclomotor\w*)\b/gi) || [];
    var marche = (t.match(new RegExp(RE_MARCA.source, 'gi')) || []).map(function (x) { return nomeMarca(x); });
    if (tipi.length > 1 && new Set(marche).size > 1 || /\b[a-c]\)\s*(?:automezz|autovettur|autocarr)/i.test(t) || /\blotti di\b|\bn\.\s*\d+\s+(?:autovetture|veicoli|automezzi)/i.test(t)) out.multiplo = true;
    var mm = t.match(RE_MARCA);
    if (mm) {
      out.marca = nomeMarca(mm[1]);
      var esplicito = t.match(/\bmodello\s*:?\s*([A-Za-z0-9][\w\-.\/ ]{0,28}?)(?=\s*(?:[,;]|\bdi colore\b|\btarga|\btg\b|\bimmatricol|\balimentaz|\banno\b|\.\s|$))/i);
      var dopo = t.slice(mm.index + mm[0].length).replace(/^[\s:,-]+/, '').split(/\s+/);
      var mod = [];
      for (var i = 0; i < dopo.length && mod.length < 3; i++) {
        var w = dopo[i].replace(/[,;.:)]+$/, '');
        if (!w || STOP_MODELLO.test(w) || /^\d{4}$/.test(w) && +w > 1950) break;
        if (/^(mod\.?|modello)$/i.test(dopo[i])) continue;
        mod.push(w);
        if (/[,;]$/.test(dopo[i])) break;
      }
      if (esplicito && esplicito[1].trim()) out.modello = esplicito[1].trim();
      else if (mod.length) out.modello = mod.join(' ');
      if (out.modello) out.modello = out.modello.replace(/[.,;:]+$/, '').replace(/\s+d['’]epoca$/i, '');
      out.provaMarca = prova(t, mm.index, mm.index + mm[0].length);
    }
    // "immatricolata il 30/10/2023", "data di immatricolazione 06/2013", "immatricolazione 3 marzo 2015", "anno 05/2018"
    var anno = t.match(/immatricola\w*[^\d]{0,30}(?:\d{1,2}[\/.\-](?:\d{1,2}[\/.\-])?|\d{1,2}\s+[a-z\u00C0-\u00FF]+\s+)?((?:19|20)\d{2})\b/i)
      || t.match(/\banno\s*(?:di\s*(?:prima\s*)?immatricolazione)?\s*:?\s*(?:\d{1,2}[\/.\-])?((?:19|20)\d{2})\b/i)
      || t.match(/\(((?:19[5-9]|20[0-2])\d)\)/);
    var oggiAnno = new Date().getFullYear();
    if (anno && +anno[1] <= oggiAnno && +anno[1] >= 1950) out.anno = +anno[1];
    // prima "Km 151.457" / "chilometraggio: 151.457", poi "151.457 km" ("... novembre 27 Km 151.457" → 151457)
    var km = t.match(/\b(?:km|chilometri|kilometri)\.?\s*(?:rilevat\w*|percors\w*|total\w*|circa|indicat\w*|dichiarat\w*|segnat\w*|effettiv\w*)?\s*:?\s*(\d{1,3}(?:[.\s]\d{3})+|\d{2,7})(?!\d|[.,]\d)/i)
      || t.match(/(?:kilometraggio|chilometraggio|percorrenza|contachilometri)[^\d]{0,25}(\d{1,3}(?:[.\s]\d{3})+|\d{2,7})/i)
      || t.match(/(\d{1,3}(?:[.\s]\d{3})+|\d{2,7})\s*(?:km|chilometri)\b/i);
    if (km) { var k = numero(km[1].replace(/\s/g, '.')); if (k >= 10 && k < 2000000) out.km = k; }
    var al = t.match(/\b(benzina\s*\/\s*ibrid\w*(?:\s+elettric\w*)?|ibrid\w*|hybrid|elettric[ao]|full electric|benzina|gasolio|diesel|gpl|metano)\b/i);
    if (al) {
      var a = al[1].toLowerCase();
      out.alimentazione = /ibrid|hybrid/.test(a) ? 'ibrida' : /elettric/.test(a) ? 'elettrica' : /gasolio|diesel/.test(a) ? 'diesel' : a;
    }
    var kw = t.match(/\b(?:kw|potenza)\s*:?\s*(\d{2,3})(?:[.,]\d+)?\s*(?:kw)?/i) || t.match(/(\d{2,3})(?:[.,]\d+)?\s*kw\b/i);
    if (kw) out.kw = +kw[1];
    if (/d['’]epoca|storic[ao]\b|\bASI\b/i.test(t)) out.epoca = true;
    var st = conservazioneVeicolo(t);
    if (st) out.stato = st;
    return Object.keys(out).length ? out : null;
  }
  function conservazioneVeicolo(t) {
    var m = t.match(/stato\s*(?:d[ei]\s*(?:conservazione|manutenzione|uso))?\s*:?\s*(pessimo|scadente|mediocre|discreto|sufficiente|buono|ottimo)/i)
      || t.match(/\b(pessimo|scadente|mediocre|discreto|buono|ottimo)\s+stato\b/i);
    if (m) return m[1].toLowerCase();
    if (/non\s+(?:marciante|funzionante)|da\s+rottamare|incidentat|senza\s+motore/i.test(t)) return 'non marciante';
    return null;
  }

  /* ---------- Segnali di rischio ---------- */
  // Cerca la prima corrispondenza di "re" (globale) non preceduta da una negazione ("non", "nessuna", "senza"...).
  function nonNegato(t, re, negazione) {
    re.lastIndex = 0;
    var m;
    while ((m = re.exec(t))) {
      var prima = t.slice(Math.max(0, m.index - 45), m.index);
      if (!negazione.test(prima)) return m;
      if (m[0] === '') re.lastIndex++;
    }
    return null;
  }
  var NEGAZIONE = /(?:\bnon\b|\bnessun\w*|\bassenz\w*|\bsenza\b|\bn[ée]\b|\bniente\b|\bprivo di\b)[^.;:]{0,30}$/i;

  // Spese condominiali arretrate o insolute, con l'importo se scritto. Le formule generiche degli avvisi
  // ("eventuali spese", "anno in corso e precedente", art. 63 disp. att. c.c.) non contano.
  var RE_CONDOMINIO = /\b(?:spes\w*|oner\w*|quot\w*|rat\w*)\s+condominial\w*\s+(?:\w+\s+){0,3}?(?:insolut\w*|arretrat\w*|non\s+(?:pagat|versat|saldat|corrispost)\w*|scadut\w*|da\s+pagare)|\b(?:debit\w*|morosit\w*|insolut\w*|arretrat\w*|pendenz\w*|esposizion\w*)\s+(?:\w+\s+){0,4}?(?:condomin\w*)/gi;
  function condominio(t) {
    var re = new RegExp(RE_CONDOMINIO.source, 'gi'), m;
    while ((m = re.exec(t))) {
      var prima = t.slice(Math.max(0, m.index - 45), m.index), dopo = t.slice(m.index + m[0].length, m.index + m[0].length + 120);
      var intorno = t.slice(Math.max(0, m.index - 80), m.index + m[0].length + 80);
      if (NEGAZIONE.test(prima) || /^\s*(?:non\s+(?:risult|vi\s+sono|present|ce\s+ne)|assent|nessun)/i.test(dopo)) continue;
      if (/eventual\w*|art\.?\s*63|anno in corso|biennio|precedente\s+(?:all'|alla|l')|tenut\w* al pagamento|obbligat\w* (?:in solido|al pagamento)/i.test(intorno)) continue;
      var imp = dopo.match(/^[^.;]{0,70}?(?:€|euro|eur\.?)\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/i)
        || dopo.match(/^[^.;]{0,70}?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+,\d{2})\s*(?:€|euro)/i);
      if (imp) m.importo = numero(imp[1]);
      return m;
    }
    return null;
  }

  var RISCHI = [
    { chiave: 'abusi', etichetta: 'Abusi o difformità edilizie', re: /\b(abusiv\w*|difformit\w*|irregolarit\w* (?:urbanistic|edilizi|catastal)\w*|sanatori\w*|condono|non conform\w*|non sanabil\w*)/i },
    { chiave: 'quota', etichetta: 'Si vende solo una quota o un diritto parziale', test: quotaParziale },
    { chiave: 'superficie', etichetta: 'Diritto di superficie (proprietà superficiaria, spesso a tempo)', re: /\b(diritt\w* di superficie|propriet(?:\u00e0|a'|\w*)\s+superficiari\w*)/i },
    { chiave: 'condominio', etichetta: 'Spese condominiali arretrate', test: condominio },
    { chiave: 'vincoli', etichetta: 'Vincoli, servitù o edilizia convenzionata', re: /\b(vincol\w*|servit[uù]|prelazione|edilizia (?:convenzionata|economica e popolare)|peep|erp\b|convenzion\w* (?:ex )?art)/i },
    { chiave: 'degrado', etichetta: 'Immobile al grezzo, inagibile o degradato', re: /\b(al grezzo|inagibil\w*|fatiscent\w*|rudere|pericolant\w*|crollat\w*|non ultimat\w*|in corso di costruzione)/i },
    { chiave: 'occupazione', etichetta: 'Occupato o locato', re: /\b(occupat\w* (?:dal|da|con|senza)|locat\w* (?:a|con)|contratto di locazione|in corso di liberazione|comodato)/i },
    { chiave: 'agricolo', etichetta: 'Terreno agricolo o fabbricato rurale', re: /\b(terren\w* agricol\w*|fabbricat\w* rural\w*|uso agricolo|seminativo|uliveto|vigneto|bosco)/i },
    // veicoli
    { chiave: 'chiavi', etichetta: 'Veicolo senza chiavi', test: function (t) {
      return t.match(/\b(?:senza|priv[oaie] d(?:elle|ella|i)|sprovvist\w* d(?:elle|ella|i)|mancan\w* (?:di |delle |della )?|in assenza d(?:elle|ella|i)|non (?:sono |è )?(?:disponibil\w*|present\w*|consegnat\w*) (?:le |la )?)\s*(?:le |la |alcuna |una )?chiav[ei]\b/i)
        || nonNegato(t, /\bchiav[ei]\s+(?:del veicolo\s+|dell'auto\s+)?(?:non\s+(?:sono\s+|è\s+)?(?:disponibil|present|reperit|consegnat|rinvenut|fornit)\w*|assent\w*|mancant\w*|smarrit\w*)/gi, /\bcon\s*$/i);
    } },
    { chiave: 'documenti', etichetta: 'Veicolo senza documenti (libretto o certificato di proprietà)', test: function (t) {
      var DOC = '(?:libretto(?: di circolazione)?|carta di circolazione|certificato di propriet\\w*|c\\.?d\\.?p\\.?|documenti(?: di circolazione)?|documentazione(?: del veicolo)?)';
      return t.match(new RegExp('\\b(?:senza|priv[oaie] d(?:el|ella|ei|i|elle)|sprovvist\\w* d(?:el|ella|ei|i|elle)|mancan\\w* (?:del |della |dei |di )?|in assenza d(?:el|ella|ei|i))\\s*(?:il |la |i |le )?' + DOC + '(?![a-z])', 'i'))
        || nonNegato(t, new RegExp('\\b' + DOC + '\\s+(?:non\\s+(?:sono\\s+|è\\s+)?(?:disponibil|present|reperit|consegnat|rinvenut|fornit)\\w*|assent\\w*|mancant\\w*|smarrit\\w*)', 'gi'), /\bcon\s*$/i);
    } },
    { chiave: 'marcia', etichetta: 'Non marciante, incidentato o da rottamare', test: function (t) {
      return nonNegato(t, /\b(non\s+(?:è\s+|risulta\s+)?(?:marciant\w*|funzionant\w*|in grado di (?:circolare|marciare))|incidentat\w*|sinistrat\w*|da\s+rottamar\w*|da\s+demolir\w*|destinat\w* alla (?:rottamazione|demolizione)|senza\s+motore|motore\s+(?:fuso|grippato|rotto|non funzionante))/gi, /\b(?:non|mai)\s*$|\bchiav\w*\s*$/i);
    } }
  ];
  // Quota parziale: frazione minore dell'intero (1/2, 500/1000...) o diritto parziale da solo.
  // "1/1", "1000/1000", "pari all'intero" e "1/1 di usufrutto e 1/1 di nuda proprietà" sono proprietà piena.
  function quotaParziale(t) {
    var re = /(\d{1,4})\s*\/\s*(\d{1,4})/g, m;
    while ((m = re.exec(t))) {
      var a = +m[1], b = +m[2];
      var intorno = t.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40);
      if (b > 0 && a > 0 && a < b && b <= 10000 && /quota|propriet|diritt|usufrutt|indivis/i.test(intorno) && !/foglio|particella|mappale|sub\b|p\.f\.|p\.ed|civ|n\.\s*$/i.test(t.slice(Math.max(0, m.index - 12), m.index)))
        return m;
    }
    var nuda = t.match(/nuda propriet\w*/i), usuf = t.match(/\busufrutto\b/i);
    if (nuda && !usuf) return nuda;
    if (usuf && !nuda) return usuf;
    return t.match(/quota indivisa/i);
  }

  function rischi(s) {
    var t = testo(s), out = [];
    RISCHI.forEach(function (r) {
      var m = r.test ? r.test(t) : t.match(r.re);
      if (!m) return;
      var x = { chiave: r.chiave, etichetta: r.etichetta, prova: prova(t, m.index, m.index + m[0].length) };
      if (m.importo != null) x.importo = m.importo;
      out.push(x);
    });
    return out;
  }

  var Estrai = { superficie: superficie, conservazione: conservazione, veicolo: veicolo, rischi: rischi, numero: numero, RISCHI: RISCHI.map(function (r) { return { chiave: r.chiave, etichetta: r.etichetta }; }) };
  if (typeof module !== 'undefined' && module.exports) module.exports = Estrai;
  else root.Estrai = Estrai;
})(typeof window !== 'undefined' ? window : globalThis);
