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
 *    prima casa pagano l'imposta di registro agevolata (aliquote di config/tariffe.js, al prezzo base);
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

  // ruolo del lotto dal titolo e dalla descrizione: le pertinenze solo se il testo non parla anche di un'abitazione
  function ruolo(a) {
    var t = norm((a.titolo || '') + ' ' + (a.descrizione || '').slice(0, 400));
    var casa = /\b(APPARTAMENT|ABITAZION|ALLOGGI|VILLA|VILLIN|VILLETT|CASA |CASE |BILOCAL|TRILOCAL|MONOLOCAL|ATTICO|MANSARD|A\/[1-9]\b)/.test(t);
    var pert = /\b(BOX|GARAGE|AUTORIMESS|POSTO AUTO|POSTI AUTO|CANTIN|SOFFITT|C\/2\b|C\/6\b|C\/7\b)/.test(t);
    if (pert && !casa) return 'pertinenza';
    if (casa) return 'abitazione';
    if (/\b(TERRENO|TERRENI|FONDO RUSTICO|APPEZZAMENT|AGRICOL)/.test(t)) return 'terreno';
    if (/\b(NEGOZI|UFFICI|CAPANNON|MAGAZZIN|LABORATORI|LOCALE COMMERCIAL|LOCALE AD USO|LOCALI AD USO|OPIFICI|DEPOSITO|C\/1\b|D\/[1-9]\b)/.test(t)) return 'commerciale';
    return 'altro';
  }

  function chiave(a) {
    if (!a.tribunale || !a.rge || a.categoria !== 'immobile') return null;
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
      var risparmio = 0, voci = [];
      lotti.forEach(function (a) {
        if (a._ruolo !== 'pertinenza' || !(num(a.prezzoBase) > 0)) return;
        var s2 = imposte(a.prezzoBase, 'seconda-privato', T), s1 = imposte(a.prezzoBase, 'prima-privato', T);
        if (s1 == null || s2 == null || s2 <= s1) return;
        risparmio += s2 - s1; voci.push({ id: a.id, senza: Math.round(s2), conPrimaCasa: Math.round(s1) });
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

  var Combinazioni = { LIMITI: LIMITI, NOMI_RUOLO: NOMI_RUOLO, ruolo: ruolo, chiave: chiave, combina: combina, trova: trova };
  if (NODE) module.exports = Combinazioni;
  else root.Combinazioni = Combinazioni;
})(typeof window !== 'undefined' ? window : globalThis);
