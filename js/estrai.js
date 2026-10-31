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
  // unità prima del numero: "mq. 145", "MQ 208 CATASTALI", "m.q. 95,50"
  // anche "metri quadrati 17" (pvp-4649281), "mq lordi 210" (pvp-4653123), "mq. convenzionali di 126,48" (pvp-4653660)
  var MQ_PRIMA = /(?:\bmq\b|\bm\.q\.|\bm2\b|m²|\bmetri\s+quadr\w*|\bmt\.?\s?q\.)\.?\s*(?:(?:lord[ie]|commercial[ie]|convenzional[ie]|catastal[ie]|complessiv[ie])\s+)?(?:di\s+|circa\s+|:\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d{1,5}(?:,\d{1,2})?)(?![\d.,]*\s*(?:%|\/|mq\b|m2\b))/gi;
  var SUP_ETICHETTA = /superficie\s+(?:commerciale|lorda|complessiva|convenzionale|catastale|utile|netta|calpestabile)?[^.;\d]{0,40}?(\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?|\d{1,5}(?:[.,]\d{1,2})?)\s*(?:mq|m\.q\.?|m2|m²|metri\s+quadr)/i;
  var PERTINENZA_ETICHETTA = /(giardin|cortil|corte\b|terrazz|balcon|lastric|cantin|box\b|garage|autorimess|posto auto|soffitt|portico|loggia|veranda)/i;
  // dopo la misura: "1.000 mq di terreno", "mq 300 di giardino"
  var ACCESSORIA_DOPO = /^\s*(?:circa\s+)?(?:di|ad?|adibit\w*\s+a|destinat\w*\s+a)\s+(?:uso\s+)?(giardin|cortil|corte\b|terren|area\b|aree\b|terrazz|balcon|lastric|scopert|cantin|box\b|garage|autorimess|posto auto|soffitt|magazzin|deposit|piazzal|pertinenz)/i;

  function misure(t) {
    var out = [], x;
    MQ.lastIndex = 0;
    while ((x = MQ.exec(t))) out.push({ i: x.index, inizio: x.index, fine: x.index + x[0].length, num: x[1] });
    MQ_PRIMA.lastIndex = 0;
    while ((x = MQ_PRIMA.exec(t))) {
      var i = x.index;
      // la stessa misura già trovata come "numero + unità" (es. "100 mq 200": vince la prima lettura)
      if (out.some(function (m) { return i >= m.inizio && i < m.fine; })) continue;
      out.push({ i: i, inizio: i, fine: i + x[0].length, num: x[1] });
    }
    return out.sort(function (a, b) { return a.i - b.i; });
  }

  var NUM = '(\\d{1,3}(?:[.\\s]\\d{3})+(?:,\\d{1,2})?|\\d{1,5}(?:[.,]\\d{1,2})?)';
  var UNITA = '(?:mq|m\\.q\\.?|m2|m²|metri\\s+quadr\\w*|mt\\.?\\s?q\\.?)';
  // superficie complessiva o commerciale dichiarata: ha la precedenza sulle singole misure
  var TOTALE = [
    new RegExp('(?:complessiv\\w*|in\\s+totale|totale)\\s+(?:di\\s+)?(?:circa\\s+)?' + UNITA + '\\.?\\s*(?:di\\s+)?(?:circa\\s+)?' + NUM, 'i'),
    new RegExp(NUM + '\\s*' + UNITA + '\\.?\\s*(?:circa\\s*)?\\(?\\s*(?:complessiv\\w*|di\\s+superficie\\s+commerciale|superficie\\s+commerciale|commerciali)', 'i'),
    new RegExp('superficie\\s+(?:commerciale|lorda|complessiva|convenzionale)[^.;\\d]{0,30}?' + UNITA + '\\.?\\s*(?:di\\s+)?(?:circa\\s+)?' + NUM, 'i')
  ];
  var ABITAZIONE = /\b(appartament\w*|abitazion\w*|alloggi\w*|villa|villett\w*|villin\w*|casa\b|attico|mansard\w*|bilocal\w*|trilocal\w*|quadrilocal\w*)/i;
  var ACCESSORIO_UNITA = /\b(garage|box\b|autorimess\w*|posto auto|posti auto|cantin\w*|magazzin\w*|deposit\w*|soffitt\w*|C\s*\/\s*[2367]\b)/i;

  // la misura appartiene a una pertinenza? (frase vicina o unità catastale descritta come garage, cantina, C/6...)
  // (la frase prima della misura finisce al punto: "... e balcone / terrazzo. Superficie commerciale totale 72,35 mq" è la
  // superficie dell'appartamento, caso reale pvp-4653789, Ardea)
  function diPertinenza(t, inizio, fine) {
    var prima = t.slice(Math.max(0, inizio - 60), inizio).split(/[a-zà-ÿ]{3}\.\s+(?=[A-ZÀ-Ý]|$)/).pop().split(/[,;:]|\s(?:e|ed|con|oltre a|oltre|più)\s/i).pop();
    if (ACCESSORIE.test(prima) || /\b(portico|loggia|veranda|lavanderia|tettoia|pensilina)\b/i.test(prima) || ACCESSORIA_DOPO.test(t.slice(fine, fine + 40))) return true;
    var unita = t.slice(0, inizio).split(/[;•]|\s-\s|\bbene\s+n?\.?\s*\d+\b/i).pop();
    return ACCESSORIO_UNITA.test(unita) && !ABITAZIONE.test(unita) && !/\bA\s*\/\s*\d\b/.test(unita);
  }
  // per un'abitazione meno di 30 mq quasi sempre è una pertinenza (box, cantina, balcone) e non l'alloggio
  function troppoPiccola(t, n) { return n < 30 && ABITAZIONE.test(t) && !/monolocal/i.test(t); }
  // il totale dichiarato è quello dell'area esterna di un fabbricato, non del fabbricato: "a) capannone ... c) Area di
  // complessivi mq.10.333 destinata a parcheggio" (caso reale pvp-4641116, Mozzecane, deposito di carburanti stimato come
  // capannone di 10.333 mq dal 30/10/2026). Solo se il testo parla di un fabbricato: per i terreni il totale resta quello giusto
  var FABBRICATO = /\b(fabbricat[oi]|capannon\w*|opifici\w*|edificio|stabilimento|deposito|magazzin\w*|appartament\w*|abitazion\w*|villa|villin\w*|casa)\b/i;
  function totaleEsterno(t, inizio, fine) {
    var prima = t.slice(Math.max(0, inizio - 30), inizio).split(/[,;:()]|\s-\s|\.\s|\s(?:e|ed|con|oltre a|oltre)\s/i).pop();
    return FABBRICATO.test(t) && (/\b(area|aree|corte|cortil\w*|giardin\w*|piazzal\w*|scopert\w*|parchegg\w*)\b/i.test(prima) ||
      /^\s*(?:circa\s+)?(?:di|ad?|adibit\w*\s+a|destinat\w*\s+a)\s+(?:uso\s+)?(?:giardin|cortil|corte\b|area\b|aree\b|scopert|piazzal|parchegg)/i.test(t.slice(fine, fine + 40)));
  }

  var COSTRUITO = /\b(?:(?:sovrastant|soprastant|entrostant|insistent)\w*|annesso|annessi|con)\s+(?:\w+\s+){0,2}?(?:fabbricat\w*|capannon\w*|abitazion\w*|casa|casolare|villa|villino|edificio|opifici\w*|stall[ae]|rustico|manufatt\w*)\b|\be\s+(?:un\s+|di\s+)?(?:fabbricat\w*|capannon\w*|abitazion\w*|casa|casolare|edificio)\b/i;

  function superficie(s) {
    var t = testo(s);
    if (!t) return null;
    for (var j = 0; j < TOTALE.length; j++) {
      var mt = t.match(TOTALE[j]);
      if (!mt) continue;
      // totale dell'area esterna: le altre misure del testo non sono più affidabili (pvp-4629650, Cremosano: "Superficie totale
      // 3.581 mq, con una superficie coperta di 2.350 mq e una superficie scoperta di 1.231 mq"), meglio nessuna superficie
      var vt = numero(mt[1]);
      if (!(vt >= 10 && vt <= 20000) || troppoPiccola(t, vt)) continue;
      if (totaleEsterno(t, mt.index, mt.index + mt[0].length)) return null;
      return { mq: vt, metodo: 'superficie complessiva indicata', prova: prova(t, mt.index, mt.index + mt[0].length) };
    }
    var m = t.match(SUP_ETICHETTA);
    if (m) {
      var v = numero(m[1]);
      // la pertinenza può essere anche tra l'etichetta e il numero: "Superficie del giardino 300 mq" (non "escluse aree
      // scoperte", che è la superficie catastale dell'unità, né i terreni e le aree, che sono il lotto stesso)
      if (v >= 10 && v <= 20000 && !PERTINENZA_ETICHETTA.test(m[0]) && !diPertinenza(t, m.index, m.index + m[0].length) && !troppoPiccola(t, v)) return { mq: v, metodo: 'superficie indicata', prova: prova(t, m.index, m.index + m[0].length) };
    }
    var accessoria = null;
    // se il lotto stesso è un terreno (o un box, una cantina, un magazzino...), la sua superficie è quella giusta
    // "proprietà" con la à (che \w non comprende): prima "Piena proprietà di box..." non era riconosciuto (pvp-4653557, Modica)
    var lotto = t.match(/^(?:\W*(?:lotto\s*\w*\W*)?)(?:piena propriet(?:à|a'|\w*)\s*(?:di|del|su)?\s*)?(?:un\s+|una\s+)?(terren|appezzament|fondo|area|lotto di terreno|box|garage|autorimess|posto auto|cantin|magazzin|deposit)/i);
    // ma non un terreno con sopra un fabbricato: la superficie del terreno non è quella del fabbricato (casi reali del
    // 30/10/2026: pvp-4541059, Buddusò, "appezzamento di terreno della superficie di 14.168 metri quadri circa, con sovrastante
    // capannone industriale", stimato come capannone di 14.168 mq; pvp-4636793, Aidone, "appezzamenti di terreno e fabbricato
    // destinato a civile abitazione ... oltre a terrazzo e portico di superficie circa mq.100,00", letto come lotto di 100 mq)
    var eTerreno = !!lotto && !(/^(?:terren|appezzament|fondo|area|lotto di terreno)/i.test(lotto[1]) && COSTRUITO.test(t));
    var lista = misure(t);
    for (var k = 0; k < lista.length; k++) {
      var x = lista[k];
      var n = numero(x.num);
      if (!(n >= 15 && n <= 200000)) continue;
      if (diPertinenza(t, x.inizio, x.fine) || troppoPiccola(t, n)) { if (!accessoria) accessoria = { mq: n, prova: prova(t, x.inizio, x.fine) }; continue; }
      if (n <= 20000) return { mq: n, metodo: 'prima superficie citata', prova: prova(t, x.inizio, x.fine) };
    }
    if (eTerreno && accessoria) return { mq: accessoria.mq, metodo: 'superficie del lotto', prova: accessoria.prova };
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
    // "diruto", "unità collabenti" (catasto F/2), "allo stato grezzo", "al rustico avanzato": casi reali del PVP (22/10/2026)
    ['rudere', /\b(rude(?:re|ri)\b|crollat|inagibil|non agibil|pericolant|fatiscent|dirut|collabent)/i],
    ['grezzo', /\b(al grezzo|stato grezzo|grezzo avanzato|al rustico\b|rustico avanzato|non ultimat|incomplet|in corso di costruzione|mancante di (?:impianti|infissi|finiture))/i],
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
    { chiave: 'degrado', etichetta: 'Immobile al grezzo, inagibile o degradato', re: /\b(al grezzo|stato grezzo|grezzo avanzato|al rustico\b|rustico avanzato|inagibil\w*|non agibil\w*|fatiscent\w*|rude(?:re|ri)\b|dirut\w*|collabent\w*|pericolant\w*|crollat\w*|non ultimat\w*|in corso di costruzione)/i },
    { chiave: 'occupazione', etichetta: 'Occupato o locato', re: /\b(occupat\w* (?:dal|da|con|senza)|locat\w* (?:a|con)|contratto di locazione|in corso di liberazione|comodato)/i },
    { chiave: 'agricolo', etichetta: 'Terreno agricolo o fabbricato rurale', re: /\b(terren\w* agricol\w*|fabbricat\w* rural\w*|uso agricolo|seminativo|uliveto|vigneto|bosco)/i },
    // veicoli
    { chiave: 'chiavi', etichetta: 'Veicolo senza chiavi', test: function (t) {
      return t.match(/\b(?:senza|priv[oaie] d(?:elle|ella|i)|sprovvist\w* d(?:elle|ella|i)|mancan\w* (?:di |delle |della )?|in assenza d(?:elle|ella|i)|non (?:sono |è )?(?:disponibil\w*|present\w*|consegnat\w*) (?:le |la )?)\s*(?:le |la |alcuna |una )?chiav[ei]\b/i)
        || nonNegato(t, /\bchiav[ei]\s+(?:del veicolo\s+|dell'auto\s+)?(?:non\s+(?:sono\s+|è\s+)?(?:disponibil|present|reperit|consegnat|rinvenut|fornit)\w*|assent\w*|mancant\w*|smarrit\w*)/gi, /\bcon\s*$/i);
    } },
    { chiave: 'documenti', etichetta: 'Veicolo senza documenti (libretto o certificato di proprietà)', test: function (t) {
      // anche il documento unico (DU, dal 2020 al posto di libretto e certificato di proprietà): caso reale pvp-4652799,
      // Peugeot Bipper "All'atto della vendita sprovvisto di documento unico", segnalato tra gli affari del 29/10/2026 senza rischi
      var DOC = '(?:libretto(?: di circolazione)?|carta di circolazione|certificato di propriet\\w*|c\\.?d\\.?p\\.?|documento unico(?: di circolazione)?|documenti(?: di circolazione)?|documentazione(?: del veicolo)?)';
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
