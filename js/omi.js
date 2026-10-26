/* Quotazioni OMI (Osservatorio del Mercato Immobiliare, Agenzia delle Entrate – OMI, licenza CC BY 4.0).
 * Collega un immobile all'asta alla sua zona OMI e stima valore di mercato e affitto mensile:
 *   valore = superficie × quotazione di compravendita (€/mq, min–max) della zona, tipologia e stato;
 *   affitto = superficie × quotazione di locazione (€/mq al mese, min–max).
 * Senza i perimetri delle zone (file KML) la zona si riconosce dall'indirizzo e dalle località citate
 * nell'avviso, confrontate con la descrizione ufficiale della zona; se non si riconosce si usano i valori
 * tipici del comune, con affidabilità bassa. Nessun valore inventato: se manca qualcosa, nessuna stima.
 * L'indice compatto si costruisce con scripts/omi.mjs dai file scaricati dall'area riservata AdE. */
(function (root) {
  'use strict';

  // Tipologie OMI (Cod_Tip) usate per gli immobili all'asta
  var TIP = { villa: '1', negozio: '5', ufficio: '6', capannoneTipico: '7', capannone: '8', magazzino: '9', laboratorio: '10', box: '13',
    postoCoperto: '14', postoScoperto: '15', autorimessa: '16', signorile: '19', civile: '20', economica: '21', tipica: '22' };
  var NOMI_TIP = { 1: 'Ville e villini', 5: 'Negozi', 6: 'Uffici', 7: 'Capannoni tipici', 8: 'Capannoni industriali', 9: 'Magazzini', 10: 'Laboratori',
    13: 'Box', 14: 'Posti auto coperti', 15: 'Posti auto scoperti', 16: 'Autorimesse', 19: 'Abitazioni signorili', 20: 'Abitazioni civili',
    21: 'Abitazioni di tipo economico', 22: 'Abitazioni tipiche dei luoghi' };
  var FASCE = { B: 'centrale', C: 'semicentrale', D: 'periferica', E: 'suburbana', R: 'extraurbana/rurale' };

  // parole che non distinguono una zona da un'altra
  var VUOTE = {};
  ('VIA VIE VIALE VIALI V VLE PIAZZA PIAZZALE PZA PZZA ZZA P LARGO CORSO CSO C SO VICOLO VICO STRADA STRADE SS SP SR STATALE PROVINCIALE COMUNALE ' +
   'VICINALE LOC LOCALITA LOCALITÀ FRAZ FRAZIONE FRAZIONI ZONA ZONE AREA AREE CENTRO URBANO URBANA STORICO STORICA ABITATO NUCLEO NUCLEI RESTANTE ' +
   'PARTE TERRITORIO COMUNALE AGRICOLA AGRICOLO RURALE ESPANSIONE PERIFERIA PERIFERICA SEMICENTRALE SUBURBANA CONFINE CONFINI LIMITE TRA FRA ' +
   'DI DA DEL DELLA DELLO DELLE DEI DEGLI DAL DALLA DALLE AL ALLA ALLE AI AGLI NEL NELLA NEI SUL SULLA SUI E ED O IL LO LA LE GLI I UN UNA ' +
   'S SAN SANTA SANTO SS ITALIA NORD SUD EST OVEST VERSO LUNGO TRATTO INTERO INTERA LATO ESCLUSO ESCLUSA COMPRESO COMPRESA CON SENZA ' +
   'QUARTIERE QUARTIERI BORGO BORGATA BORGATE CASE CASALE NUMERO CIVICO CIVICI SNC ALTRE ALTRI TUTTO TUTTA TUTTE').split(' ').forEach(function (w) { VUOTE[w] = 1; });

  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[`'’]/g, ' ').toUpperCase(); }
  function chiaveComune(nome, prov) { return norm(nome).split('/')[0].replace(/[^A-Z]/g, '') + '|' + String(prov || '').toUpperCase(); }
  function parole(s, togli) {
    var out = {};
    norm(s).split(/[^A-Z]+/).forEach(function (w) { if (w.length >= 4 && !VUOTE[w] && !(togli && togli[w])) out[w] = 1; });
    return out;
  }
  function num(x) { var n = Number(String(x == null ? '' : x).replace(',', '.')); return isFinite(n) ? n : 0; }
  function mediana(v) { var s = v.slice().sort(function (a, b) { return a - b; }), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; }

  /* ---------- costruzione dell'indice (scripts/omi.mjs) ---------- */

  // righe CSV OMI (separatore ';', prima riga = titolo, seconda = intestazione)
  function leggiCsv(testo) {
    var righe = String(testo).replace(/\r/g, '').split('\n').filter(function (r) { return r.trim(); });
    var titolo = righe.shift(), testa = righe.shift().split(';');
    return { titolo: titolo, righe: righe.map(function (r) { var c = r.split(';'), o = {}; testa.forEach(function (h, i) { if (h) o[h.trim()] = (c[i] || '').trim(); }); return o; }) };
  }

  /* zone: CSV *_ZONE.csv; valori: *_VALORI.csv; compravendite: { listaCom, valoriRes } dai file VCN (facoltativi) */
  function costruisciIndice(zoneCsv, valoriCsv, vcn) {
    var Z = leggiCsv(zoneCsv), V = leggiCsv(valoriCsv);
    var sem = (V.titolo.match(/Semestre\s+(\d{4}\/\d)/) || [])[1] || null;
    var elab = (V.titolo.match(/elaborazione del\s+([\w-]+)/) || [])[1] || null;
    var comuni = {}, valori = {}, catastali = {};
    Z.righe.forEach(function (z) {
      var k = chiaveComune(z.Comune_descrizione, z.Prov);
      var c = comuni[k] = comuni[k] || { nome: z.Comune_descrizione, prov: z.Prov, istat: z.Comune_ISTAT, catastale: z.Comune_amm, zone: [] };
      catastali[z.Comune_amm] = k;
      if (!c.zone.some(function (x) { return x[0] === z.LinkZona; }))
        c.zone.push([z.LinkZona, z.Fascia, z.Zona, String(z.Zona_Descr || '').replace(/^'|'$/g, '').trim()]);
    });
    V.righe.forEach(function (v) {
      var cmin = num(v.Compr_min), cmax = num(v.Compr_max);
      if (!(cmin > 0 && cmax >= cmin)) return;
      var z = valori[v.LinkZona] = valori[v.LinkZona] || {};
      (z[v.Cod_Tip] = z[v.Cod_Tip] || []).push([v.Stato.charAt(0), cmin, cmax, num(v.Loc_min), num(v.Loc_max), v.Sup_NL_compr || 'L', v.Sup_NL_loc || '']);
    });
    var compravendite = {};
    if (vcn && vcn.valoriRes) {
      var taglie = {};
      if (vcn.listaCom) leggiCsvVcn(vcn.listaCom).forEach(function (r) { taglie[r['2025_CodCom'] || r[Object.keys(r).filter(function (h) { return /CodCom/.test(h); })[0]]] = r['TAGLIA MERCATO']; });
      leggiCsvVcn(vcn.valoriRes).forEach(function (r) {
        var cod = r[Object.keys(r).filter(function (h) { return /CodCom/.test(h); })[0]], k = catastali[cod];
        var tot = Object.keys(r).filter(function (h) { return /^NTN[_ ]\d{4}$/.test(h); })[0];
        if (k && tot) compravendite[k] = { ntn: num(r[tot]), taglia: taglie[cod] || null };
      });
    }
    return { fonte: 'Agenzia delle Entrate – OMI', licenza: 'CC BY 4.0', semestre: sem, elaborazione: elab, comuni: comuni, valori: valori,
      compravendite: compravendite, anno: vcn && vcn.anno || null };
  }
  function leggiCsvVcn(testo) {
    var righe = String(testo).replace(/\r/g, '').split('\n').filter(function (r) { return r.trim(); });
    var testa = righe.shift().split(';').map(function (h) { return h.trim(); });
    return righe.map(function (r) { var c = r.split(';'), o = {}; testa.forEach(function (h, i) { o[h] = (c[i] || '').trim(); }); return o; });
  }

  /* ---------- uso dell'indice ---------- */

  function trovaComune(ind, nome, prov) {
    if (!ind || !nome) return null;
    var k = chiaveComune(nome, prov);
    if (ind.comuni[k]) return ind.comuni[k];
    // nomi scritti in modo diverso dalla fonte (es. "Reggio Calabria" / "REGGIO DI CALABRIA"): stessa provincia, stesse lettere senza "DI/NEL..."
    var corta = function (s) { return norm(s).split('/')[0].replace(/\b(DI|DEL|DELLA|NELL|NEL|SUL|IN)\b/g, '').replace(/[^A-Z]/g, ''); };
    var cercato = corta(nome), trovati = [];
    for (var j in ind.comuni) { var c = ind.comuni[j]; if (c.prov === String(prov || '').toUpperCase() && corta(c.nome) === cercato) trovati.push(c); }
    return trovati.length === 1 ? trovati[0] : null;
  }

  // tipologia OMI dall'asta (tipo del PVP + parole del testo)
  function tipologia(a, testo) {
    var t = norm((a.titolo || '') + ' ' + (testo || ''));
    if (/\b(BOX|GARAGE|AUTORIMESSA)\b/.test(t) && !/\b(APPARTAMENT|ABITAZION|VILL|NEGOZI|FABBRICAT|TENUTA|CASA)/.test(t)) return /AUTORIMESSA/.test(t) ? [TIP.autorimessa, TIP.box] : [TIP.box];
    if (/POSTO AUTO/.test(t) && !/\b(APPARTAMENT|ABITAZION|VILLA)/.test(t)) return [/SCOPERT/.test(t) ? TIP.postoScoperto : TIP.postoCoperto, TIP.box];
    if (/residenzial/i.test(a.tipo || '') || /\b(APPARTAMENT|ABITAZION|ALLOGGI|VILLA|VILLINO|BILOCALE|TRILOCALE|MONOLOCALE|ATTICO|MANSARDA|CASA)\b/.test(t)) {
      if (/\b(VILLA|VILLINO|VILLETTA|UNIFAMILIARE|BIFAMILIARE|SCHIERA)\b/.test(t)) return [TIP.villa, TIP.civile];
      if (/\b(SIGNORIL|PREGIO|LUSSO)\b/.test(t)) return [TIP.signorile, TIP.civile];
      if (/\b(ECONOMIC|POPOLARE)\b/.test(t)) return [TIP.economica, TIP.civile];
      return [TIP.civile, TIP.economica];
    }
    if (/\b(NEGOZI|NEGOZIO|BOTTEGA|LOCALE COMMERCIALE|ESERCIZIO COMMERCIALE)/.test(t)) return [TIP.negozio];
    if (/\bUFFICI/.test(t)) return [TIP.ufficio];
    if (/\b(CAPANNONE|CAPANNONI|OPIFICIO|STABILIMENTO)\b/.test(t)) return [TIP.capannone, TIP.capannoneTipico];
    if (/\bLABORATORI/.test(t)) return [TIP.laboratorio];
    if (/\b(MAGAZZIN|DEPOSITO)/.test(t)) return [TIP.magazzino];
    if (/commercial/i.test(a.tipo || '')) return [TIP.negozio];
    if (/industrial/i.test(a.tipo || '')) return [TIP.capannone, TIP.capannoneTipico];
    return null; // terreni e altro: l'OMI non li quota
  }

  // stato OMI: Ottimo, Normale, Scadente (dallo stato di conservazione letto nell'avviso: testo, oppure l'oggetto
  // { stato, prova } di Estrai.conservazione, che è quello passato dalla raccolta)
  function statoOmi(conservazione) {
    var c = String((conservazione && conservazione.stato) || conservazione || '').toLowerCase();
    if (/pessim|scadent|mediocre|fatiscent|grezzo|rudere|da ristruttur/.test(c)) return 'S';
    if (/ottim|ristrutturat|nuov/.test(c)) return 'O';
    return 'N';
  }

  /* Zona OMI dell'asta: la via (tutte le sue parole significative) o la località/frazione (dall'indirizzo e
   * dall'avviso) devono comparire nella descrizione ufficiale della zona; una sola parola in comune non basta
   * (es. "Via Sant'Antonio Abate" non è "Contrada Sant'Antonio dei Lazzari"). In caso di dubbio: nessuna zona.
   * → { zona, metodo: 'unica'|'indirizzo'|'comune', punti } */
  var TIPO_STRADA = /^\s*(?:VIA|VIALE|V\.?\s?LE|V\.|PIAZZA|P\.?\s?ZZA|PIAZZALE|P\.?\s?LE|LARGO|CORSO|C\.?\s?SO|VICOLO|VICO|STRADA|STR\.|SALITA|LUNGOMARE|TRAVERSA|CONTRADA|C\.?\s?DA|LOCALITA|LOC\.?|FRAZIONE|FRAZ\.?|BORGATA|REGIONE|RIONE)\b\.?\s*/;
  var LOCALITA = /\b(?:FRAZIONE|FRAZ\.|LOCALITA|LOC\.|CONTRADA|C\.DA|C\/DA|BORGATA|QUARTIERE|RIONE|BORGO)\s+((?:[A-Z]+\s?){1,3})/g;
  function tutte(gruppo, pz) { var n = 0; for (var w in gruppo) { if (!pz[w]) return false; n++; } return n > 0; }
  function trovaZona(comune, a, testo) {
    var zone = comune.zone;
    if (zone.length === 1) return { zona: zone[0], metodo: 'unica' };
    var nomeComune = parole(comune.nome), pezzi = norm(a.indirizzo).split(',');
    var via = parole(pezzi[0].replace(TIPO_STRADA, ''), nomeComune);
    var luoghi = [];
    // altri pezzi dell'indirizzo (es. "21056 Colleverde RM"), senza CAP, sigla e nome del comune
    pezzi.slice(1).forEach(function (p) { var g = parole(p.replace(/\b\d+\w*\b|\b[A-Z]{2}\b|ITALIA/g, ' '), nomeComune); if (Object.keys(g).length) luoghi.push(g); });
    var tt = norm((a.indirizzo || '') + ' ' + (testo || '')), m;
    LOCALITA.lastIndex = 0;
    while ((m = LOCALITA.exec(tt))) { var g = parole(m[1], nomeComune); if (Object.keys(g).length) luoghi.push(g); }
    var punteggi = zone.map(function (z) {
      var pz = parole(z[3], nomeComune), p = 0;
      if (tutte(via, pz)) p += 10;
      luoghi.forEach(function (g) { if (tutte(g, pz)) p += 8; });
      return { zona: z, punti: p };
    }).sort(function (x, y) { return y.punti - x.punti; });
    var primo = punteggi[0], secondo = punteggi[1] || { punti: 0 };
    if (primo.punti >= 8 && primo.punti > secondo.punti) return { zona: primo.zona, metodo: 'indirizzo', punti: primo.punti };
    return { zona: null, metodo: 'comune' };
  }

  function rigaValori(ind, linkZona, tipi, stato) {
    var vz = ind.valori[linkZona];
    if (!vz) return null;
    for (var i = 0; i < tipi.length; i++) {
      var l = vz[tipi[i]];
      if (!l) continue;
      var r = l.filter(function (x) { return x[0] === stato; })[0] || l.filter(function (x) { return x[0] === 'N'; })[0] || l[0];
      return { tip: tipi[i], riga: r, statoUsato: r[0] };
    }
    return null;
  }

  /* Stima completa. a: asta (comune, provincia, indirizzo, tipo, titolo, superficieMq), testo: descrizione,
   * conservazione: dallo stato letto nell'avviso. → null se non stimabile, altrimenti valore e affitto con forchetta. */
  function stima(a, ind, opz) {
    opz = opz || {};
    if (!ind || a.categoria !== 'immobile') return null;
    var mq = num(a.superficieMq);
    var comune = trovaComune(ind, a.comune, a.provincia);
    if (!comune) return { mancante: 'comune non trovato nelle quotazioni OMI' };
    var tipi = tipologia(a, opz.testo);
    if (!tipi) return { mancante: 'tipologia non quotata dall\'OMI (es. terreni)', comune: comune.nome };
    // per prudenza lo stato "ottimo" scritto nell'avviso non alza il valore (spesso riguarda l'edificio, non l'unità):
    // si usa la quotazione dello stato normale; lo stato scadente invece sì, perché abbassa il valore
    var st = statoOmi(opz.conservazione), ottimo = st === 'O';
    if (ottimo) st = 'N';
    var z = trovaZona(comune, a, opz.testo), base = null, zonaInfo = null, note = [];
    if (z.zona) {
      base = rigaValori(ind, z.zona[0], tipi, st);
      if (base) zonaInfo = { link: z.zona[0], fascia: z.zona[1], codice: z.zona[2], descrizione: z.zona[3], metodo: z.metodo };
    }
    var rr;
    if (base) rr = base.riga;
    else {
      // valori tipici del comune: mediana delle zone non rurali per la stessa tipologia
      var righe = [], tipUsato = null;
      comune.zone.forEach(function (zz) {
        if (zz[1] === 'R' && comune.zone.some(function (y) { return y[1] !== 'R'; })) return;
        var b = rigaValori(ind, zz[0], tipi, st);
        if (!b) return;
        tipUsato = tipUsato || b.tip;
        if (b.tip !== tipUsato) return;
        righe.push({ link: zz[0], riga: b.riga });
      });
      if (!righe.length) return { mancante: 'nessuna quotazione OMI per questa tipologia nel comune', comune: comune.nome };
      // lo stato letto nell'avviso si usa solo se tutte le zone lo quotano: mescolare stati diversi falserebbe la mediana
      var tutte = righe.every(function (x) { return x.riga[0] === st; }), statoComune = tutte ? st : 'N';
      if (!tutte) righe = righe.map(function (x) { var n = rigaValori(ind, x.link, [tipUsato], 'N'); return n ? n.riga : x.riga; });
      else righe = righe.map(function (x) { return x.riga; });
      var col = function (i) { return righe.map(function (r) { return r[i]; }).filter(function (v) { return v > 0; }); };
      var lmin = col(3), lmax = col(4);
      rr = [statoComune, mediana(col(1)), mediana(col(2)), lmin.length ? mediana(lmin) : 0, lmax.length ? mediana(lmax) : 0, 'L', 'L'];
      base = { tip: tipUsato, riga: rr, statoUsato: statoComune };
      note.push('Zona OMI non riconosciuta dall\'indirizzo: valori tipici del comune (mediana di ' + righe.length + ' zone)');
    }
    var out = {
      fonte: ind.fonte + ', ' + (ind.semestre ? 'semestre ' + ind.semestre : '') + (ind.licenza ? ' (' + ind.licenza + ')' : ''),
      semestre: ind.semestre, comune: comune.nome, zona: zonaInfo, tipologia: NOMI_TIP[base.tip] || base.tip,
      stato: { O: 'ottimo', N: 'normale', S: 'scadente' }[base.statoUsato], euroMq: { min: rr[1], max: rr[2] },
      affittoMq: rr[3] > 0 ? { min: rr[3], max: rr[4], superficie: rr[6] === 'N' ? 'netta' : 'lorda' } : null, note: note
    };
    if (ottimo) note.push('Stato "ottimo" indicato nell\'avviso: per prudenza si usa la quotazione dello stato normale');
    if (st !== base.statoUsato) note.push('Stato "' + { O: 'ottimo', S: 'scadente' }[st] + '" non quotato ' + (zonaInfo ? 'in questa zona' : 'in tutte le zone del comune') + ': usato lo stato normale');
    if (!(mq > 0)) { out.mancante = 'metri quadri non indicati nell\'avviso'; return out; }
    out.mq = mq;
    out.valore = { min: Math.round(mq * rr[1]), max: Math.round(mq * rr[2]) };
    out.valore.centrale = Math.round((out.valore.min + out.valore.max) / 2);
    if (out.affittoMq) out.affitto = { min: Math.round(mq * rr[3]), max: Math.round(mq * rr[4]) };
    // zona riconosciuta (unica del comune o dall'indirizzo) → media; valori tipici del comune → bassa
    out.affidabilita = zonaInfo ? 'media' : 'bassa';
    // lotti con più unità (tenute, compendi, "n. 2 fabbricati"): la superficie letta copre solo una parte
    var tt = norm((a.titolo || '') + ' ' + (opz.testo || ''));
    if (/\b(COMPENDIO|TENUTA|COMPLESSO IMMOBILIARE|PIU UNITA|SEGUENTI UNITA|UNITA IMMOBILIARI|N\.?\s?[2-9]\s+(?:FABBRICATI|UNITA|APPARTAMENTI|IMMOBILI)|BENE\s+N?\.?\s*[2-9])\b/.test(tt)) {
      out.affidabilita = 'bassa'; note.push('Il lotto comprende più unità: il valore OMI riguarda solo la superficie indicata');
    } else {
      // "Abitazione di 57 mq + Deposito di 20 mq + Fabbricato rurale di 75 mq…": tre o più superfici commerciali diverse
      var sup = {}, m, reSup = /SUPERFICIE\s+COMMERCIALE\s+(?:COMPLESSIVA\s+)?(?:DI\s+)?(?:CIRCA\s+)?(?:MQ\.?\s*)?(\d+(?:[.,]\d+)?)/g;
      while ((m = reSup.exec(tt))) sup[m[1].replace(',', '.')] = 1;
      if (Object.keys(sup).length >= 3) { out.affidabilita = 'bassa'; note.push('Il lotto comprende più unità con superfici diverse: il valore OMI riguarda solo la superficie indicata'); }
    }
    // box o posti auto molto grandi: probabilmente la tipologia letta dal testo non è quella giusta
    if ((base.tip === TIP.box || base.tip === TIP.postoCoperto || base.tip === TIP.postoScoperto) && mq > 50) {
      out.affidabilita = 'bassa'; note.push('Superficie insolita per un box o posto auto: tipologia da verificare');
    }
    if (/SUPERFICIE\s+(?:NETTA|CALPESTABILE|UTILE)/.test(tt)) note.push('L\'avviso indica la superficie netta: le quotazioni OMI sono sulla superficie lorda, quindi il valore può essere più alto');
    var cv = ind.compravendite && ind.compravendite[chiaveComune(comune.nome, comune.prov)];
    if (cv) out.compravendite = cv;
    return out;
  }

  var Omi = { TIP: TIP, NOMI_TIP: NOMI_TIP, FASCE: FASCE, chiaveComune: chiaveComune, leggiCsv: leggiCsv, costruisciIndice: costruisciIndice,
    trovaComune: trovaComune, tipologia: tipologia, statoOmi: statoOmi, trovaZona: trovaZona, stima: stima };
  if (typeof module !== 'undefined' && module.exports) module.exports = Omi;
  else root.Omi = Omi;
})(typeof window !== 'undefined' ? window : globalThis);
