/* Agente "Cacciatore di affari": ogni mattina, dopo raccolta e arricchimento, guarda le aste
 * nuove o ribassate nelle ultime 24 ore, ricontrolla i numeri, cerca segnali di affare e di
 * pericolo e sceglie i migliori del giorno con un riassunto scritto a regole.
 * Nessuna AI e nessun dato inventato: ogni frase nasce da un dato dell'avviso o da un calcolo,
 * e quello che non si sa viene detto. Usato dalla raccolta (Node) e dal sito (preferenze personali). */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  var P = NODE ? require('./punteggio.js') : root.Punteggio;

  var CRITERI = {
    scontoMinimo: 0.15,          // sotto il 15% non è un affare (soglia "Conviene" di config/tariffe.js)
    scontoAffare: 0.25,          // segnale di affare: sconto reale oltre il 25%
    punteggioMinimo: 50,
    affidabilita: ['media', 'alta'],
    massimi: 10, minimi: 5,
    perProcedura: 1, perComune: 2,
    piscinaPersonale: 400        // aste analizzate conservate per le selezioni personali
  };
  var PESO_AFFIDABILITA = { alta: 1, media: 0.92, bassa: 0.75 };
  var PERICOLI = {
    occupazione: 'Occupato o locato: servono tempo e spese per la liberazione',
    abusi: 'Abusi o difformità edilizie citati nell\'avviso',
    quota: 'Si vende solo una quota o un diritto parziale (non l\'intero)',
    superficie: 'Diritto di superficie: la proprietà può essere a tempo',
    condominio: 'Spese condominiali arretrate',
    vincoli: 'Vincoli, servitù o edilizia convenzionata',
    degrado: 'Immobile al grezzo, inagibile o degradato: lavori pesanti',
    agricolo: 'Terreno agricolo o fabbricato rurale',
    chiavi: 'Veicolo senza chiavi',
    documenti: 'Veicolo senza documenti (libretto o certificato di proprietà)',
    marcia: 'Non marciante, incidentato o da rottamare'
  };

  function num(x) { var n = Number(x); return isFinite(n) ? n : 0; }
  function piu(data, giorni) { var d = new Date(data + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + giorni); return d.toISOString().slice(0, 10); }
  function eur(n) { return Math.round(n).toLocaleString('it-IT') + ' €'; }
  function pct(f) { return Math.round(f * 100) + '%'; }
  function dataIt(d) { if (!d) return ''; var p = d.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }

  /* Aste da analizzare: future, pubblicate da ieri, oppure ribassate da ieri
   * (nuovo tentativo dello stesso lotto o prezzo base sceso rispetto alla raccolta precedente). */
  function candidati(aste, oggi) {
    var ieri = piu(oggi, -1);
    return aste.filter(function (a) {
      if (!a.dataAsta || a.dataAsta < oggi) return false;
      var nuova = a.pubblicata ? a.pubblicata >= ieri : a.vista === oggi;
      var ribassata = (a.dataRibasso && a.dataRibasso >= ieri) || (nuova && num(a.tentativo) >= 2);
      return nuova || ribassata;
    }).map(function (a) {
      var motivo = a.dataRibasso && a.dataRibasso >= ieri ? 'ribasso' : num(a.tentativo) >= 2 ? 'nuovo-tentativo' : 'nuova';
      return { asta: a, motivo: motivo };
    });
  }

  // valutazione: usa i campi già calcolati dalla raccolta, oppure la ricalcola
  function valutazione(a, opz) {
    if (opz && opz.T) return P.valuta(a, { T: opz.T, zone: opz.zone });
    return null;
  }

  /* Analisi di un'asta: ricontrollo dei numeri, segnali di affare e di pericolo, motivo dell'eventuale scarto. */
  function analizza(c, opz) {
    var a = c.asta || c, v = valutazione(a, opz) || {};
    var val = v.valore, out = { id: a.id, motivo: c.motivo || 'nuova', asta: a, segnaliAffare: [], pericoli: [], nonSappiamo: [], scarto: null };
    out.punteggio = v.punteggio != null ? v.punteggio : a.punteggio != null ? a.punteggio : null;
    out.sconto = v.sconto != null ? v.sconto : a.sconto;
    out.costoTotale = v.costoTotale || a.costoTotale || null;
    out.offertaMax = v.offertaMax != null ? v.offertaMax : a.offertaMax;
    out.affidabilita = val ? val.affidabilita : a.affidabilita || null;
    out.valore = val ? { centrale: val.centrale, min: val.min, max: val.max, fonte: val.etichetta } : a.valore ? { centrale: a.valore, min: a.valoreMin, max: a.valoreMax, fonte: a.fonteValore } : null;
    out.controlli = val ? val.controlli : [];
    (v.mancanti || []).forEach(function (m) { out.nonSappiamo.push(m); });

    if (!(num(a.prezzoBase) > 0)) out.scarto = 'prezzo base non indicato';
    else if (!out.valore) out.scarto = 'valore di mercato non stimabile';
    else if (CRITERI.affidabilita.indexOf(out.affidabilita) < 0) out.scarto = 'valore poco affidabile' + (out.controlli.length ? ': ' + out.controlli[0] : '');
    else if (!(out.sconto >= CRITERI.scontoMinimo)) out.scarto = 'sconto reale sotto il ' + pct(CRITERI.scontoMinimo);
    else if (out.offertaMax && num(a.offertaMinima) > 0 && out.offertaMax < a.offertaMinima) out.scarto = 'nemmeno l\'offerta minima resta sotto il valore con i costi';
    else if (out.punteggio == null || out.punteggio < CRITERI.punteggioMinimo) out.scarto = 'punteggio sotto ' + CRITERI.punteggioMinimo;

    // segnali di affare (solo da dati presenti)
    if (out.sconto >= CRITERI.scontoMinimo) out.segnaliAffare.push('Sconto reale del ' + pct(out.sconto) + ' sul valore stimato, imposte e spese comprese' + (out.sconto >= CRITERI.scontoAffare ? ' (oltre la soglia d\'affare del ' + pct(CRITERI.scontoAffare) + ')' : ''));
    var t = num(a.tentativo);
    if (t >= 3) out.segnaliAffare.push('È il ' + t + '° tentativo' + (num(a.deserte) ? ' (' + a.deserte + ' aste andate deserte)' : '') + (num(a.primoPrezzo) > 0 ? ': prezzo sceso del ' + pct(1 - a.prezzoBase / a.primoPrezzo) + ' dal primo' : ''));
    else if (t === 2) out.segnaliAffare.push('Secondo tentativo' + (num(a.primoPrezzo) > 0 ? ': prezzo già sceso del ' + pct(1 - a.prezzoBase / a.primoPrezzo) : ''));
    if (c.motivo === 'ribasso' && num(a.prezzoPrecedente) > 0) out.segnaliAffare.push('Prezzo ribassato ieri da ' + eur(a.prezzoPrecedente) + ' a ' + eur(a.prezzoBase));
    if (a.categoria === 'immobile' && a.stato === 'libero') out.segnaliAffare.push('Immobile libero');
    var rischi = Array.isArray(a.rischi) ? a.rischi : null;
    if (rischi && rischi.indexOf('abusi') < 0 && a.categoria === 'immobile') out.segnaliAffare.push('Nell\'avviso non risultano abusi (la perizia va letta comunque)');
    var rend = v.rendimento != null ? v.rendimento : a.rendimento;
    if (a.categoria === 'immobile' && rend != null && num(a.omiAffMin) > 0) {
      var aff = 'affitto della zona ' + eur(a.omiAffMin) + '–' + eur(a.omiAffMax) + ' al mese (quotazioni OMI), rendimento lordo ' + pct(rend) + ' sul costo totale';
      if (rend >= 0.06) out.segnaliAffare.push('Buona domanda di affitti: ' + aff);
      else out.nonSappiamo.push('se si affitta bene: ' + aff + ', sotto il 6%');
    } else if (a.categoria === 'immobile') out.nonSappiamo.push('affitto della zona (quotazione OMI di locazione non disponibile per questo immobile)');

    // segnali di pericolo
    if (a.categoria === 'immobile' && a.stato === 'occupato') out.pericoli.push(PERICOLI.occupazione);
    (rischi || []).forEach(function (k) { if (PERICOLI[k] && out.pericoli.indexOf(PERICOLI[k]) < 0) out.pericoli.push(PERICOLI[k]); });
    if (!rischi) out.nonSappiamo.push('rischi nel testo dell\'avviso (testo non disponibile)');
    out.controlli.forEach(function (x) { out.pericoli.push(x); });
    if (out.affidabilita === 'bassa') out.pericoli.push('Valore stimato poco affidabile');
    if (a.anomalia === 'offerta-minima-sopra-base') out.pericoli.push('Nell\'avviso l\'offerta minima risulta più alta del prezzo base: verifica');
    out.nonSappiamo.push('contenuto della perizia (non letta dall\'agente)');

    // ordinamento: punteggio pesato per affidabilità
    out.rango = out.punteggio == null ? -1 : out.punteggio * (PESO_AFFIDABILITA[out.affidabilita] || 0.5);
    out.nonSappiamo = out.nonSappiamo.filter(function (x, i, l) { return l.indexOf(x) === i; });
    return out;
  }

  function chiaveProcedura(a) { return [a.tribunale || '', a.rge || '', a.annoProcedura || ''].join('|'); }

  /* I migliori del giorno: solo aste non scartate, al massimo 1 per procedura e 2 per comune. */
  function seleziona(analizzate, criteri) {
    var K = criteri || CRITERI, perProc = {}, perCom = {}, scelte = [], altriLotti = {};
    analizzate.filter(function (x) { return !x.scarto; }).sort(function (x, y) { return y.rango - x.rango; }).forEach(function (x) {
      var kp = chiaveProcedura(x.asta), kc = (x.asta.comune || '') + '|' + (x.asta.provincia || '');
      if (x.asta.rge && (perProc[kp] || 0) >= K.perProcedura) { altriLotti[kp] = (altriLotti[kp] || 0) + 1; return; }
      if (x.asta.comune && (perCom[kc] || 0) >= K.perComune) return;
      if (scelte.length >= K.massimi) return;
      perProc[kp] = (perProc[kp] || 0) + 1; perCom[kc] = (perCom[kc] || 0) + 1; scelte.push(x);
    });
    scelte.forEach(function (x) { var n = altriLotti[chiaveProcedura(x.asta)]; if (n) x.altriLotti = n; });
    return scelte;
  }

  // termineOfferte arriva come 'AAAA-MM-GG' o 'AAAA-MM-GGTHH:MM' (dal dettaglio del PVP); letto con js/formato.js, che sa
  // anche quando la data del Demanio è il termine per le offerte
  function scadenza(a) {
    var F = NODE ? require('./formato.js') : root.Formato, te = F ? F.date(a).termine : null;
    if (te) return { data: te.data, ora: te.ora || null, testo: 'Offerte entro il ' + dataIt(te.data) + (te.ora ? ' alle ' + te.ora : '') + ' (dall\'avviso)' };
    return { data: null, ora: null, testo: 'Termine per le offerte non letto dall\'avviso: di solito scade il giorno prima dell\'asta (asta il ' + dataIt(a.dataAsta) + '), verificalo nell\'avviso' };
  }

  var SENZA_TESTO = 'Testo dell\'avviso non disponibile: rischi da verificare nella perizia';

  /* Riassunto scritto a regole, solo con dati dell'avviso e calcoli. */
  function riassunto(x) {
    var a = x.asta, v = x.valore;
    var perche = x.segnaliAffare.slice();
    if (v) perche.unshift('Valore stimato ' + eur(v.min) + '–' + eur(v.max) + ' (' + v.fonte + ', affidabilità ' + x.affidabilita + '); costo totale al prezzo base circa ' + eur(x.costoTotale));
    // senza testo dell'avviso (rischi assente) non si può dire che rischi non ce ne sono
    var letto = Array.isArray(a.rischi);
    return {
      titolo: a.titolo, perche: perche,
      rischi: x.pericoli.length ? x.pericoli.concat(letto ? [] : [SENZA_TESTO]) : [letto ? 'Nessun rischio trovato nel testo dell\'avviso: leggi comunque la perizia' : SENZA_TESTO],
      offertaMassima: x.offertaMax ? { importo: x.offertaMax, testo: 'Offerta massima consigliata: ' + eur(x.offertaMax) + ' (così, con imposte e spese, resti almeno il 20% sotto il valore minimo stimato)' } : null,
      scadenza: scadenza(a), nonSappiamo: x.nonSappiamo,
      altriLotti: x.altriLotti ? 'La stessa procedura ha altri ' + x.altriLotti + ' lotti tra le aste di oggi' : null
    };
  }

  function testoTelegram(sel, info) {
    var r = ['🎯 Affari di oggi – ' + dataIt(info.oggi), info.analizzate + (info.analizzate === 1 ? ' asta nuova o ribassata analizzata, ' : ' aste nuove o ribassate analizzate, ') +
      (!sel.length ? 'nessuna supera i criteri.' : sel.length + (sel.length === 1 ? ' supera' : ' superano') + ' i criteri.'), ''];
    sel.forEach(function (x, i) {
      var s = riassunto(x), a = x.asta;
      r.push((i + 1) + '. ' + a.titolo + (a.comune ? ' – ' + a.comune + (a.provincia ? ' (' + a.provincia + ')' : '') : ''));
      r.push('Punteggio ' + Math.round(x.punteggio) + '/100 · base ' + eur(a.prezzoBase) + ' · sconto ' + pct(x.sconto));
      if (s.offertaMassima) r.push('Offerta max ' + eur(s.offertaMassima.importo));
      r.push(s.scadenza.testo);
      r.push('Rischi: ' + s.rischi.slice(0, 2).join('; '));
      if (a.linkAvviso) r.push(a.linkAvviso);
      r.push('');
    });
    if (!sel.length) r.push('Oggi nessuna asta supera i criteri: meglio aspettare che proporre affari incerti.');
    r.push('Stime indicative: non sostituiscono notaio, avvocato o commercialista.');
    return r.join('\n');
  }

  /* Selezione personale: filtra la piscina delle aste analizzate con le preferenze
   * { regioni:[], province:[], budget (costo totale massimo), categoria, strategia: 'vivo'|'affitto'|'rivendo' }. */
  function personale(piscina, pref, quante) {
    pref = pref || {};
    var l = piscina.filter(function (x) {
      var a = x.asta || x;
      if (x.scarto) return false;
      if (pref.categoria && a.categoria !== pref.categoria) return false;
      if (pref.regioni && pref.regioni.length && pref.regioni.indexOf(a.regione) < 0) return false;
      if (pref.province && pref.province.length && pref.province.indexOf(a.provincia) < 0) return false;
      if (pref.budget > 0 && (x.costoTotale || a.prezzoBase) > pref.budget) return false;
      if (pref.strategia && a.categoria !== 'immobile') return false;
      if (pref.strategia === 'vivo' && !/residenzial/i.test(a.tipo || '')) return false;
      return true;
    }).map(function (x) {
      var a = x.asta || x, r = x.rango;
      if (pref.strategia === 'vivo') r += a.stato === 'libero' ? 8 : a.stato === 'occupato' ? -15 : 0;
      if (pref.strategia === 'affitto') r += /residenzial/i.test(a.tipo || '') ? 4 : 0;
      if (pref.strategia === 'rivendo') r += (x.sconto || 0) * 30 + ((a.rischi || []).indexOf('degrado') >= 0 ? -3 : 0);
      return { x: x, r: r };
    }).sort(function (p, q) { return q.r - p.r; }).map(function (p) { return p.x; });
    return l.slice(0, quante || 5);
  }

  // forma compatta per data/affari.js
  function compatta(x, conRiassunto) {
    var a = x.asta, o = {
      id: a.id, titolo: a.titolo, categoria: a.categoria, tipo: a.tipo, regione: a.regione, provincia: a.provincia, comune: a.comune,
      tribunale: a.tribunale, rge: a.rge, prezzoBase: a.prezzoBase, offertaMinima: a.offertaMinima, dataAsta: a.dataAsta, ora: a.ora,
      termineOfferte: a.termineOfferte, stato: a.stato, linkAvviso: a.linkAvviso, nFoto: a.nFoto, lat: a.lat, lng: a.lng,
      tentativo: a.tentativo, rischi: a.rischi, motivo: x.motivo, punteggio: x.punteggio, sconto: x.sconto, costoTotale: x.costoTotale,
      offertaMax: x.offertaMax, affidabilita: x.affidabilita, valore: x.valore, rango: Math.round(x.rango * 10) / 10, scarto: x.scarto || undefined
    };
    if (conRiassunto) o.riassunto = riassunto(x);
    for (var k in o) if (o[k] == null) delete o[k];
    return o;
  }

  // nota sotto gli affari quando sono meno dei minimi: si dice, senza riempire
  function nota(n, criteri) {
    var min = (criteri || CRITERI).minimi;
    if (n >= min) return null;
    if (!n) return 'Oggi nessuna asta supera tutti i criteri: meglio aspettare che proporre affari incerti.';
    return 'Oggi solo ' + n + (n === 1 ? ' asta supera' : ' aste superano') + ' tutti i criteri: non ne aggiungiamo altre per arrivare a ' + min + '.';
  }

  /* Giro completo: { aste, oggi, T, zone } → risultato pronto da scrivere in data/affari.js */
  function esegui(opz) {
    var c = candidati(opz.aste, opz.oggi);
    var analizzate = c.map(function (x) { return analizza(x, opz); });
    var scarti = {};
    analizzate.forEach(function (x) { if (x.scarto) { var k = x.scarto.split(':')[0]; scarti[k] = (scarti[k] || 0) + 1; } });
    var sel = seleziona(analizzate);
    var piscina = analizzate.filter(function (x) { return !x.scarto; }).sort(function (p, q) { return q.rango - p.rango; }).slice(0, CRITERI.piscinaPersonale);
    var info = { oggi: opz.oggi, analizzate: analizzate.length };
    return {
      oggi: opz.oggi, analizzate: analizzate.length,
      perMotivo: c.reduce(function (m, x) { m[x.motivo] = (m[x.motivo] || 0) + 1; return m; }, {}),
      scartate: scarti, criteri: CRITERI,
      nota: nota(sel.length),
      migliori: sel.map(function (x) { return compatta(x, true); }),
      piscina: piscina.map(function (x) { return compatta(x, false); }),
      telegram: testoTelegram(sel, info)
    };
  }

  /* Storico delle segnalazioni: aggiunge quelle di oggi e aggiorna gli esiti con l'indice storico del PVP
   * (esito: AGGIU aggiudicata, ASDES deserta, SOSPE sospesa; prezzo solo se pubblicato). */
  function aggiornaStorico(storico, risultato, esiti, oggi) {
    var s = storico && Array.isArray(storico.segnalate) ? storico : { segnalate: [] };
    var presenti = {};
    s.segnalate.forEach(function (x) { presenti[x.id] = x; });
    (risultato.migliori || []).forEach(function (m) {
      if (presenti[m.id]) return;
      var x = { id: m.id, data: oggi, titolo: m.titolo, categoria: m.categoria, provincia: m.provincia, dataAsta: m.dataAsta, prezzoBase: m.prezzoBase,
        valore: m.valore ? m.valore.centrale : null, sconto: m.sconto, punteggio: m.punteggio, offertaMax: m.offertaMax, affidabilita: m.affidabilita, linkAvviso: m.linkAvviso };
      s.segnalate.push(x); presenti[m.id] = x;
    });
    var NOMI = { AGGIU: 'aggiudicata', ASDES: 'deserta', SOSPE: 'sospesa' };
    s.segnalate.forEach(function (x) {
      if (x.esito || !x.dataAsta || x.dataAsta >= oggi) return;
      var e = esiti && esiti[x.id];
      if (e && NOMI[e.esito]) { x.esito = NOMI[e.esito]; if (num(e.aggiudicazione) > 0) x.prezzoFinale = e.aggiudicazione; x.esitoLetto = oggi; }
    });
    s.aggiornato = oggi;
    s.misure = misure(s.segnalate);
    return s;
  }

  // "Ci ha preso?": quante segnalate sono state aggiudicate, e quanto vicino all'offerta massima consigliata
  function misure(segnalate) {
    var chiuse = segnalate.filter(function (x) { return x.esito; });
    var agg = chiuse.filter(function (x) { return x.esito === 'aggiudicata'; });
    var conPrezzo = agg.filter(function (x) { return num(x.prezzoFinale) > 0; });
    var sotto = conPrezzo.filter(function (x) { return x.offertaMax && x.prezzoFinale <= x.offertaMax; });
    return {
      segnalate: segnalate.length, conEsito: chiuse.length, aggiudicate: agg.length,
      deserte: chiuse.filter(function (x) { return x.esito === 'deserta'; }).length,
      sospese: chiuse.filter(function (x) { return x.esito === 'sospesa'; }).length,
      conPrezzoFinale: conPrezzo.length,
      vinteEntroOffertaMax: conPrezzo.length ? sotto.length : null,
      nota: chiuse.length < 30 ? 'Servono almeno 30 esiti per giudicare i criteri: per ora ' + chiuse.length + '.' : null
    };
  }

  var Cacciatore = { CRITERI: CRITERI, candidati: candidati, analizza: analizza, seleziona: seleziona, riassunto: riassunto, personale: personale,
    compatta: compatta, nota: nota, esegui: esegui, testoTelegram: testoTelegram, aggiornaStorico: aggiornaStorico, misure: misure };
  if (NODE) module.exports = Cacciatore;
  else root.Cacciatore = Cacciatore;
})(typeof window !== 'undefined' ? window : globalThis);
