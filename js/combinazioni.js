/* Cacciatore di combinazioni ("Combinazioni d'oro"): lotti della stessa procedura che insieme valgono più che separati.
 *
 * Si confrontano solo lotti immobiliari della stessa procedura (stesso tribunale, stesso numero di procedura, stesso
 * comune e stessa data d'asta: senza l'anno della procedura, comune e data evitano di unire procedure diverse con lo
 * stesso numero). Ogni lotto riceve un ruolo dal testo dell'avviso (abitazione, pertinenza, terreno, commerciale).
 *
 * Nessun numero inventato:
 *  - somme di prezzi, valori e costi solo dai dati di ogni lotto (il valore complessivo solo se tutti i lotti hanno un
 *    valore di affidabilità media o alta);
 *  - l'unico vantaggio "in più" calcolato è fiscale: il box, il posto auto o la cantina comprati come pertinenza della
 *    prima casa pagano l'imposta di registro agevolata (aliquote di config/tariffe.js, al prezzo base), una sola per
 *    categoria catastale (C/2, C/6, C/7), solo per lotti di una sola unità che non costano più dell'abitazione;
 *  - gruppi solo tra lotti con tribunale, procedura e comune;
 *  - gli altri vantaggi (unire due unità, un solo sopralluogo…) sono scritti come motivi qualitativi, senza cifre.
 * Usato dalla raccolta (Node) per scrivere data/combinazioni.js e dal sito. */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  var C = NODE ? require('./calcoli.js') : root.Calcoli;

  var LIMITI = { lottiMin: 2, lottiMax: 8, massimi: 60 };
  var AFFIDABILI = { media: 1, alta: 1 };
  var NOMI_RUOLO = { abitazione: 'Abitazione', pertinenza: 'Box, posto auto o cantina', terreno: 'Terreno', commerciale: 'Locale commerciale o produttivo', altro: 'Altro immobile' };

  function num(x) { var n = Number(x); return isFinite(n) ? n : 0; }
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase(); }

  function testo(a) { return norm((a.titolo || '') + ' ' + (a.descrizione || '').slice(0, 400)).replace(/\bPIANO TERRENO\b/g, 'PIANO TERRA'); }

  // ruolo del lotto dal titolo e dalla descrizione: le pertinenze solo se il testo non parla anche di un'abitazione,
  // di un locale per attività (ufficio, negozio, laboratorio, D/8...) o di un intero edificio: "Ufficio e cantina" o
  // "Intero edificio da cielo a terra compresa l'autorimessa" non sono pertinenze della prima casa (casi reali del 22/10/2026)
  function ruolo(a) {
    var t = testo(a);
    var casa = /\b(APPARTAMENT|ABITAZION|ALLOGGI|VILLA|VILLIN|VILLETT|CASA |CASE |BILOCAL|TRILOCAL|MONOLOCAL|ATTICO|MANSARD|A\/[1-9]\b|(?:USO|DESTINAZIONE|UNITA) ABITATIV|(?:USO|DESTINAZIONE|UNITA|FABBRICATO) RESIDENZIAL)/.test(t);
    var pert = /\b(BOX|GARAGE|AUTORIMESS|POSTO AUTO|POSTI AUTO|CANTIN|SOFFITT|C\/2\b|C\/6\b|C\/7\b)/.test(t);
    var attivita = /\b(NEGOZI|UFFICI|CAPANNON|LABORATORI|OPIFICI|OFFICIN|ALBERG|HOTEL|DIREZIONAL|ARTIGIANAL|PRODUTTIV|INDUSTRIAL|(?:LOCALE|LOCALI|USO|DESTINAZIONE|ATTIVITA) COMMERCIAL|C\/1\b|C\/3\b|A\/10\b|D\/[1-9]\b)/.test(t);
    var edificio = /\b(INTERO EDIFICIO|INTERO FABBRICATO|INTERO STABILE|CIELO A TERRA|(?:DUE|TRE|QUATTRO|CINQUE|SEI|SETTE|OTTO|NOVE|DIECI|\d+) FABBRICATI)\b/.test(t);
    if (pert && !casa && !attivita && !edificio) return 'pertinenza';
    if (casa) return 'abitazione';
    if (attivita) return 'commerciale';
    if (/\b(TERRENO|TERRENI|FONDO RUSTICO|APPEZZAMENT|AGRICOL)/.test(t)) return 'terreno';
    if (/\b(MAGAZZIN|LOCALE AD USO|LOCALI AD USO|DEPOSITO)/.test(t)) return 'commerciale';
    return 'altro';
  }

  // categoria catastale di una pertinenza (l'agevolazione "prima casa" vale per una sola per categoria); null se il
  // lotto comprende più unità ("n. 9 posti auto", "due box", un testo che descrive anche altri lotti) o è troppo grande
  // per un box o una cantina (oltre 60 mq, come in js/omi.js): il prezzo non è quello di una pertinenza e il calcolo non vale
  function categoriaPertinenza(a) {
    var t = testo(a), corpo = t.replace(/^\W*LOTTO\b[^A-Z]*/, '');
    if (/\b(POSTI AUTO|BOXES|GARAGES|AUTORIMESSE|CANTINE|SOFFITTE|(?:[2-9]|\d{2,}|DUE|TRE|QUATTRO|CINQUE|SEI|SETTE|OTTO|NOVE|DIECI) (?:BOX|GARAGE|POSTI|CANTIN|AUTORIMESS))/.test(t)) return null;
    if (/\bLOTTO\s*(?:N\W*)?\d/.test(corpo)) return null;
    var mq = num(a.superficieMq), m, re = /(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:MQ|M2)\b|\bMQ\.?\s*(\d{1,5}(?:[.,]\d{1,2})?)/g;
    while ((m = re.exec(t))) mq = Math.max(mq, parseFloat((m[1] || m[2]).replace(',', '.')));
    if (mq > 60) return null;
    if (/\b(BOX|GARAGE|AUTORIMESS|POSTO AUTO|C\/6\b)/.test(t)) return 'C/6';
    if (/\b(CANTIN|SOFFITT|C\/2\b)/.test(t)) return 'C/2';
    if (/\b(TETTOI|C\/7\b)/.test(t)) return 'C/7';
    return null;
  }

  // senza comune nessun gruppo: lotti della stessa procedura in paesi diversi non sono "vicini" né pertinenze della stessa
  // casa (caso reale del 26/10/2026: abitazioni a Cantù, Carimate, Lomazzo e un sottotetto, tutti senza comune)
  function chiave(a) {
    if (!a.tribunale || !a.rge || !a.comune || a.categoria !== 'immobile') return null;
    return [a.tribunale, a.rge, a.annoProcedura || '', norm(a.comune), a.dataAsta || ''].join('|');
  }

  // imposte al prezzo base con un regime (stesse aliquote del calcolatore)
  function imposte(prezzo, regime, T) {
    try { return C.imposteImmobile({ prezzo: prezzo, regime: regime }, T).totale; } catch (e) { return null; }
  }
  function regimeDi(T, id) { return (T.immobili.regimi || []).filter(function (r) { return r.id === id; })[0] || null; }

  /* Un gruppo di lotti → combinazione (o null se i lotti non si completano a vicenda). */
  function combina(lotti, T) {
    var ruoli = {}, motivi = [], tipo = null;
    lotti.forEach(function (a) { var r = ruolo(a); a._ruolo = r; ruoli[r] = (ruoli[r] || 0) + 1; });
    if (ruoli.abitazione && ruoli.pertinenza) {
      tipo = 'casa-pertinenza';
      motivi.push('Abitazione e box, posto auto o cantina nella stessa procedura: chi la compra come prima casa può comprare insieme anche la pertinenza.');
      motivi.push('Un\'abitazione con box o posto auto di solito è più facile da vendere o affittare (valutazione qualitativa, non un numero).');
    } else if (ruoli.abitazione >= 2) {
      tipo = 'unita-vicine';
      motivi.push(ruoli.abitazione + ' abitazioni della stessa procedura nello stesso comune: si possono unire in un\'unica casa o affittare separatamente (verifica in perizia se sono contigue).');
    } else if (ruoli.abitazione && ruoli.terreno) {
      tipo = 'casa-terreno';
      motivi.push('Abitazione e terreno della stessa procedura: il terreno vicino a casa vale di più per chi ci abita (valutazione qualitativa, non un numero).');
    } else if (ruoli.commerciale >= 2 || (ruoli.commerciale && ruoli.pertinenza)) {
      tipo = 'spazi-attivita';
      motivi.push('Più locali della stessa procedura: spazi da usare insieme per un\'attività o da affittare a un solo conduttore (verifica in perizia se sono contigui).');
    }
    if (!tipo) return null;
    motivi.push('Una sola procedura: stesso custode per le visite, stessa data d\'asta, stesso delegato alla vendita.');
    // cose da sapere prima di puntare su tutti i lotti
    var avvisi = [];
    var quote = lotti.filter(function (a) { return Array.isArray(a.rischi) && a.rischi.indexOf('quota') >= 0; }).length;
    if (quote) avvisi.push(quote === 1 ? 'Un lotto è una quota di proprietà, non l\'intero: verifica chi possiede il resto.' : quote + ' lotti sono quote di proprietà, non l\'intero: verifica chi possiede il resto.');
    var occupati = lotti.filter(function (a) { return a.stato === 'occupato'; }).length;
    if (occupati) avvisi.push((occupati === 1 ? 'Un lotto risulta occupato' : occupati + ' lotti risultano occupati') + ': servono tempi e costi di liberazione.');
    var altri = lotti.filter(function (a) { return a._ruolo === 'altro'; }).length;
    if (altri) avvisi.push((altri === 1 ? 'Un lotto' : altri + ' lotti') + ' di tipo diverso: valuta se ti servono davvero o se puoi offrire solo sugli altri.');
    avvisi.push('Ogni lotto ha la sua asta: puoi vincerne uno e perdere l\'altro. Fai offerte solo se ti va bene anche così.');

    var somma = function (f) { return lotti.reduce(function (s, a) { return s + num(f(a)); }, 0); };
    var prezzoBase = somma(function (a) { return a.prezzoBase; });
    var offertaMinima = somma(function (a) { return a.offertaMinima || (a.prezzoBase ? C.offertaMinima(a.prezzoBase, T) : 0); });
    var conValore = lotti.filter(function (a) { return num(a.valore) > 0 && AFFIDABILI[a.affidabilita]; });
    var completo = conValore.length === lotti.length;
    var out = {
      chiave: chiave(lotti[0]), tipo: tipo, motivi: motivi, avvisi: avvisi,
      tribunale: lotti[0].tribunale, rge: lotti[0].rge, annoProcedura: lotti[0].annoProcedura || null,
      comune: lotti[0].comune, provincia: lotti[0].provincia, regione: lotti[0].regione, dataAsta: lotti[0].dataAsta,
      lotti: lotti.map(function (a) {
        return { id: a.id, titolo: a.titolo, ruolo: a._ruolo, numeroLotto: a.numeroLotto || null, prezzoBase: a.prezzoBase || null,
          offertaMinima: a.offertaMinima || null, valore: a.valore || null, valoreMin: a.valoreMin || null, valoreMax: a.valoreMax || null,
          fonteValore: a.fonteValore || null, affidabilita: a.affidabilita || null, costoTotale: a.costoTotale || null, sconto: a.sconto != null ? a.sconto : null,
          punteggio: a.punteggio != null ? a.punteggio : null, superficieMq: a.superficieMq || null, stato: a.stato || null, indirizzo: a.indirizzo || null,
          linkAvviso: a.linkAvviso || null, termineOfferte: a.termineOfferte || null };
      }),
      numeri: { lotti: lotti.length, prezzoBase: Math.round(prezzoBase), offertaMinima: Math.round(offertaMinima), lottiConValore: conValore.length },
      affidabilita: completo && !quote ? (lotti.every(function (a) { return a.affidabilita === 'alta'; }) ? 'alta' : 'media') : 'bassa'
    };
    if (completo) {
      var valore = somma(function (a) { return a.valore; }), costo = somma(function (a) { return a.costoTotale; });
      out.numeri.valore = Math.round(valore);
      out.numeri.valoreMin = Math.round(somma(function (a) { return a.valoreMin || a.valore; }));
      if (costo > 0) { out.numeri.costoTotale = Math.round(costo); out.numeri.sconto = Math.round((1 - costo / valore) * 1000) / 1000; }
    } else {
      out.nota = conValore.length ? 'Valore complessivo non calcolato: solo ' + conValore.length + ' lotti su ' + lotti.length + ' hanno un valore di mercato affidabile.'
        : 'Valore complessivo non calcolato: nessun lotto ha ancora un valore di mercato affidabile.';
    }
    // vantaggio fiscale delle pertinenze della prima casa (al prezzo base)
    if (tipo === 'casa-pertinenza' && regimeDi(T, 'prima-privato') && regimeDi(T, 'seconda-privato')) {
      // per ogni categoria catastale la pertinenza con il risparmio più alto (una sola per categoria). Una "pertinenza" che
      // costa più dell'abitazione più cara del gruppo non è un box o una cantina al servizio della casa: niente calcolo
      // (casi reali del 26/10/2026: magazzino da 103.900 € con un appartamento da 66.600 € a Genova, garage da 247.731 €
      // con un appartamento da 61.875 € a Misterbianco)
      var perCategoria = {}, risparmio = 0, voci = [], casaMax = 0;
      lotti.forEach(function (a) { if (a._ruolo === 'abitazione') casaMax = Math.max(casaMax, num(a.prezzoBase)); });
      lotti.forEach(function (a) {
        var cat = a._ruolo === 'pertinenza' && num(a.prezzoBase) > 0 && num(a.prezzoBase) <= casaMax ? categoriaPertinenza(a) : null;
        if (!cat) return;
        var s2 = imposte(a.prezzoBase, 'seconda-privato', T), s1 = imposte(a.prezzoBase, 'prima-privato', T);
        if (s1 == null || s2 == null || s2 <= s1) return;
        if (!perCategoria[cat] || s2 - s1 > perCategoria[cat].senza - perCategoria[cat].conPrimaCasa)
          perCategoria[cat] = { id: a.id, categoria: cat, senza: Math.round(s2), conPrimaCasa: Math.round(s1) };
      });
      lotti.forEach(function (a) {
        for (var k in perCategoria) if (perCategoria[k].id === a.id) { risparmio += perCategoria[k].senza - perCategoria[k].conPrimaCasa; voci.push(perCategoria[k]); }
      });
      if (risparmio > 0) {
        var r1 = regimeDi(T, 'prima-privato');
        out.numeri.risparmioPrimaCasa = Math.round(risparmio);
        out.risparmio = {
          importo: Math.round(risparmio), voci: voci,
          testo: 'Imposte sulle pertinenze comprate come pertinenza della prima casa: ' + Math.round(risparmio).toLocaleString('it-IT') + ' € in meno rispetto all\'acquisto separato senza agevolazioni (calcolo al prezzo base).',
          condizioni: 'Vale se hai i requisiti "prima casa" e per una sola pertinenza per categoria catastale (C/2 cantina, C/6 box e posti auto, C/7 tettoie).',
          fonte: r1.fonte, url: r1.url, verificato: r1.verificato
        };
      }
    }
    lotti.forEach(function (a) { delete a._ruolo; });
    return out;
  }

  function rango(c) {
    var r = { 'casa-pertinenza': 3, 'unita-vicine': 2, 'casa-terreno': 1, 'spazi-attivita': 1 }[c.tipo] * 100;
    if (c.affidabilita !== 'bassa') r += 200 + Math.max(0, num(c.numeri.sconto)) * 100;
    if (c.numeri.risparmioPrimaCasa) r += Math.min(50, c.numeri.risparmioPrimaCasa / 100);
    return r;
  }

  /* Tutte le combinazioni tra le aste future. opz: { T, oggi, massimi } */
  function trova(aste, opz) {
    var T = opz.T, oggi = opz.oggi || '', gruppi = {};
    aste.forEach(function (a) {
      if (!a.dataAsta || a.dataAsta < oggi) return;
      var k = chiave(a); if (!k) return;
      (gruppi[k] = gruppi[k] || []).push(a);
    });
    var out = [], analizzati = 0;
    Object.keys(gruppi).forEach(function (k) {
      var l = gruppi[k];
      if (l.length < LIMITI.lottiMin || l.length > LIMITI.lottiMax) return;
      analizzati++;
      l.sort(function (x, y) { return String(x.numeroLotto || x.id).localeCompare(String(y.numeroLotto || y.id), 'it', { numeric: true }); });
      var c = combina(l, T);
      if (c) out.push(c);
    });
    out.sort(function (x, y) { return rango(y) - rango(x) || (x.dataAsta || '').localeCompare(y.dataAsta || ''); });
    var perTipo = {};
    out.forEach(function (c) { perTipo[c.tipo] = (perTipo[c.tipo] || 0) + 1; });
    return { oggi: oggi, gruppiAnalizzati: analizzati, trovate: out.length, perTipo: perTipo, combinazioni: out.slice(0, opz.massimi || LIMITI.massimi) };
  }

  var Combinazioni = { LIMITI: LIMITI, NOMI_RUOLO: NOMI_RUOLO, ruolo: ruolo, categoriaPertinenza: categoriaPertinenza, chiave: chiave, combina: combina, trova: trova };
  if (NODE) module.exports = Combinazioni;
  else root.Combinazioni = Combinazioni;
})(typeof window !== 'undefined' ? window : globalThis);
