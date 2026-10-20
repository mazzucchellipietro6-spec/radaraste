/* Dati della scheda dell'asta in funzioni pure (testate in tests/scheda.test.js):
 *   SchedaDati.lineaTempo(a, opz)     → eventi in ordine di data: pubblicazione, tentativi precedenti, ribasso,
 *                                        termine per le offerte, asta, saldo (stimato) e note sullo storico;
 *   SchedaDati.zona(a)                → zona OMI spiegata in parole semplici, compravendite del comune, perizie della zona;
 *   SchedaDati.probabilita(a, stat, q) → testi sulla probabilità che ci siano altri offerenti e di vincere (js/stratega.js).
 * Regola: nessun dato inventato. Quello che manca resta mancante e viene detto; le date stimate sono segnate come stime.
 * Usabile nel browser (window.SchedaDati) e in Node. */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  function modulo(nome, file) { try { return NODE ? require(file) : root[nome] || null; } catch (e) { return null; } }

  var DEMANIO = 'Agenzia del Demanio', PVP = 'Portale Vendite Pubbliche';
  var GIORNI_SALDO = 120; // come js/stratega.js: art. 569 c.p.c., saldo entro il termine dell'ordinanza, non oltre 120 giorni

  /* ---------- piccoli aiuti ---------- */

  function num(x) { var n = Number(x); return isFinite(n) ? n : 0; }
  // spazio non divisibile: il simbolo dell'euro non va mai a capo da solo
  function eur(n) { return Math.round(n).toLocaleString('it-IT') + '\u00a0€'; }
  function due(n) { return ('0' + n).slice(-2); }
  function pct(f, dec) {
    if (f == null || !isFinite(f)) return '–';
    var p = Math.pow(10, dec == null ? 1 : dec);
    return (Math.round(f * 100 * p) / p).toString().replace('.', ',') + '%';
  }
  function cifre(n, dec) { return Number(n).toLocaleString('it-IT', { maximumFractionDigits: dec || 0 }); }
  function dataIt(d) { if (!d) return ''; var p = String(d).slice(0, 10).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function piu(data, giorni) { var d = new Date(data + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + giorni); return d.toISOString().slice(0, 10); }
  function maiuscola(t) { t = String(t || ''); return t.charAt(0).toUpperCase() + t.slice(1); }
  // "PANCOLE E MONTORGIALI" → "Pancole e Montorgiali" (solo per i nomi scritti tutti in maiuscolo dalla fonte)
  var PICCOLE = /^(e|ed|o|di|d|del|dell|dello|della|dei|degli|delle|da|dal|dall|dalla|in|nel|nell|nella|a|al|all|alla|ai|sul|sull|sulla|con|per|tra|fra)$/;
  function nome(t) {
    t = String(t || '').trim();
    if (!t || t !== t.toUpperCase()) return t;
    return t.toLowerCase().replace(/[a-zà-ù]+/g, function (w, i) {
      var prima = i ? t.charAt(i - 1) : '';
      return i && PICCOLE.test(w) && /\s/.test(prima) ? w : w.charAt(0).toUpperCase() + w.slice(1);
    });
  }
  // 'AAAA-MM-GG' o 'AAAA-MM-GGTHH:MM' → { data, ora }
  function dataOra(x, ora) {
    var s = String(x || ''), m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{1,2}):(\d{2}))?/.exec(s);
    if (!m) return { data: null, ora: '' };
    var o = /^(\d{1,2})[:.](\d{2})/.exec(ora || '');
    return { data: m[1], ora: o ? due(o[1]) + ':' + o[2] : m[2] ? due(m[2]) + ':' + m[3] : '' };
  }

  /* ---------- linea del tempo ---------- */

  var ESITI = {
    deserta: 'andata deserta',
    aggiudicata: 'aggiudicata, ma il lotto è poi tornato in vendita',
    sospesa: 'sospesa: non conta come tentativo'
  };

  /* a: asta (scheda a pezzi). opz.adesso: 'AAAA-MM-GGTHH:MM' (ora di Roma) per dire cosa è già passato.
   * → { eventi: [{ chiave, data|null, ora, titolo, nota, stima, qui, stato: 'fatto'|'prossimo'|'futuro'|'senza-data' }], note: [] } */
  function lineaTempo(a, opz) {
    opz = opz || {};
    a = a || {};
    var adesso = String(opz.adesso || ''), dem = a.fonte === DEMANIO, ev = [], note = [];
    var base = num(a.prezzoBase), tentativo = num(a.tentativo);

    if (a.pubblicata) ev.push({ chiave: 'pubblicazione', data: dataOra(a.pubblicata).data, ora: '', titolo: 'Pubblicazione dell\'avviso',
      nota: a.fonte === PVP ? 'Sul Portale delle Vendite Pubbliche' : dem ? 'Sul sito dell\'Agenzia del Demanio' : a.fonte ? 'Fonte: ' + a.fonte : '' });

    // tentativi precedenti: [[data, prezzo, esito]] dal più vecchio (max 10); le vendite sospese non contano come tentativi
    var storico = (Array.isArray(a.storico) ? a.storico : []).filter(function (s) { return Array.isArray(s) && s[0]; });
    var contati = storico.filter(function (s) { return s[2] !== 'sospesa'; }).length;
    // lo storico conserva gli ultimi 10: se il tentativo è più alto, i primi mancano
    var salto = tentativo > contati + 1 ? tentativo - 1 - contati : 0;
    var n = salto, prezzoPrima = 0;
    storico.forEach(function (s) {
      var d = dataOra(s[0]), prezzo = num(s[1]), sosp = s[2] === 'sospesa';
      var esito = s[2] ? ESITI[s[2]] || String(s[2]) : (d.data && (!adesso || d.data < adesso.slice(0, 10)) ? 'esito non pubblicato; il lotto è poi tornato in vendita' : 'esito non ancora pubblicato');
      var parti = [prezzo > 0 ? 'Prezzo base ' + eur(prezzo) : 'prezzo non indicato'];
      if (!sosp && prezzo > 0 && prezzoPrima > 0 && prezzo < prezzoPrima) parti[0] += ' (−' + pct(1 - prezzo / prezzoPrima, 0) + ')';
      parti.push(esito);
      if (!sosp) { n++; if (prezzo > 0) prezzoPrima = prezzo; }
      ev.push({ chiave: sosp ? 'sospesa' : 'tentativo', data: d.data, ora: '', titolo: sosp ? 'Vendita sospesa' : n + '° tentativo', nota: parti.join(' · '), esito: s[2] || null, prezzo: prezzo || null });
    });

    // prezzo sceso rispetto alla raccolta precedente (stesso avviso)
    if (num(a.prezzoPrecedente) > base && base > 0 && a.dataRibasso) {
      ev.push({ chiave: 'ribasso', data: dataOra(a.dataRibasso).data, ora: '', titolo: 'Prezzo base ribassato',
        nota: 'Da ' + eur(a.prezzoPrecedente) + ' a ' + eur(base) + ' (−' + pct(1 - base / a.prezzoPrecedente, 0) + '): rilevato dalla raccolta di quel giorno' });
    }

    var asta = dataOra(a.dataAsta, a.ora);
    var termine = null;
    if (dem) {
      termine = { chiave: 'termine', data: asta.data, ora: asta.ora, titolo: 'Termine per le offerte', nota: 'Data, ora e luogo dell\'apertura delle offerte sono nell\'avviso PDF', qui: true };
    } else if (a.termineOfferte) {
      var t = dataOra(a.termineOfferte);
      termine = { chiave: 'termine', data: t.data, ora: t.ora, titolo: 'Termine per le offerte', nota: 'Offerta e cauzione vanno depositate entro questo termine' };
    } else {
      termine = { chiave: 'termine', data: null, ora: '', titolo: 'Termine per le offerte',
        nota: 'Non indicato nei dati raccolti: di solito entro le 12 del giorno feriale prima dell\'asta, verifica nell\'avviso' };
    }
    var astaEv = null;
    if (!dem) {
      var notaAsta = base > 0 ? 'Prezzo base ' + eur(base) : 'Prezzo base non indicato';
      if (base > 0 && num(a.ribasso) > 0) notaAsta += ' (−' + pct(a.ribasso, 0) + ' rispetto al tentativo precedente)';
      if (num(a.offertaMinima) > 0) notaAsta += ' · offerta minima ' + eur(a.offertaMinima);
      astaEv = { chiave: 'asta', data: asta.data, ora: asta.ora, titolo: tentativo ? tentativo + '° tentativo: questa asta' : 'Questa asta', nota: asta.data ? notaAsta : 'Data non indicata nei dati raccolti', qui: true };
    }
    var saldo;
    if (!dem && a.categoria === 'immobile' && asta.data) {
      saldo = { chiave: 'saldo', data: piu(asta.data, GIORNI_SALDO), ora: '', titolo: 'Saldo del prezzo (stima)', stima: true,
        nota: 'Di solito entro ' + GIORNI_SALDO + ' giorni dall\'aggiudicazione: verifica l\'avviso' };
    } else {
      saldo = { chiave: 'saldo', data: null, ora: '', titolo: 'Saldo del prezzo', nota: 'Il termine è indicato nell\'avviso di vendita' };
    }

    // eventi con la data in ordine; il termine senza data va subito prima dell'asta, il saldo senza data in fondo
    if (termine.data) ev.push(termine);
    if (astaEv && astaEv.data) ev.push(astaEv);
    if (saldo.data) ev.push(saldo);
    ev.forEach(function (e, i) { e._i = i; });
    ev.sort(function (x, y) {
      var kx = x.data + 'T' + (x.ora || '00:00'), ky = y.data + 'T' + (y.ora || '00:00');
      return kx < ky ? -1 : kx > ky ? 1 : x._i - y._i;
    });
    if (!termine.data) {
      var iA = -1;
      ev.forEach(function (e, i) { if (e.chiave === 'asta' && iA < 0) iA = i; });
      if (iA >= 0) ev.splice(iA, 0, termine); else ev.push(termine);
    }
    if (astaEv && !astaEv.data) ev.push(astaEv);
    if (!saldo.data) ev.push(saldo);

    // cosa è già passato: confronto per data e ora di Roma (senza ora: la fine del giorno)
    var prossimo = false;
    ev.forEach(function (e) {
      delete e._i;
      e.stima = !!e.stima; e.qui = !!e.qui;
      if (!e.data) { e.stato = 'senza-data'; return; }
      // pubblicazione, tentativi e ribasso sono già avvenuti nel giorno indicato; asta e scadenze alla loro ora (o a fine giornata)
      var gia = /^(pubblicazione|tentativo|sospesa|ribasso)$/.test(e.chiave);
      var fatto = adesso && (gia ? e.data <= adesso.slice(0, 10) : e.data + 'T' + (e.ora || '23:59') < adesso);
      if (fatto) e.stato = 'fatto';
      else if (!prossimo) { e.stato = 'prossimo'; prossimo = true; }
      else e.stato = 'futuro';
    });

    if (!storico.length) {
      if (tentativo > 1) note.push('Prima di questa asta ci sono stati ' + (tentativo - 1) + (tentativo - 1 === 1 ? ' tentativo' : ' tentativi') +
        (num(a.deserte) ? ' (' + a.deserte + (a.deserte === 1 ? ' andato deserto' : ' andati deserti') + ')' : '') + ': date non disponibili.');
      else if (tentativo === 1) note.push('È il primo tentativo di vendita trovato nello storico del portale.');
      // con storicoNota la raccolta dice già perché i tentativi precedenti mancano
      else if (!dem && a._origine !== 'manuale' && !a.storicoNota) note.push('Storico dei tentativi precedenti: non ancora disponibile.');
    } else if (salto > 0) {
      note.push((salto === 1 ? 'Il primo tentativo non è' : 'I primi ' + salto + ' tentativi non sono') + ' nello storico: qui ci sono solo gli ultimi.');
    }
    if (num(a.primoPrezzo) > 0 && base > 0 && tentativo > 1 && base < a.primoPrezzo) {
      note.push('Dalla prima asta (' + eur(a.primoPrezzo) + ') il prezzo base è sceso del ' + pct(1 - base / a.primoPrezzo, 0) + '.');
    }
    if (a.storicoNota) note.push(String(a.storicoNota));
    return { eventi: ev, note: note };
  }

  /* ---------- zona ---------- */

  // fasce OMI in parole semplici (i nomi ufficiali sono in js/omi.js, FASCE)
  var FASCE_SEMPLICI = {
    B: 'il centro del comune',
    C: 'la parte tra il centro e la periferia',
    D: 'la periferia del centro abitato',
    E: 'fuori dal centro abitato: frazioni e nuclei staccati dal capoluogo',
    R: 'campagna e zone agricole'
  };
  var FASCE_NOMI = { B: 'centrale', C: 'semicentrale', D: 'periferica', E: 'suburbana', R: 'extraurbana/rurale' };
  var METODI = {
    indirizzo: 'riconosciuta confrontando l\'indirizzo dell\'avviso con la descrizione ufficiale della zona',
    unica: 'il comune ha una sola zona OMI'
  };
  var SPIEGA_OMI = 'L\'Osservatorio del Mercato Immobiliare (OMI) dell\'Agenzia delle Entrate divide ogni comune in zone omogenee e, ogni sei mesi, ' +
    'pubblica per ogni zona i prezzi al metro quadro (minimo e massimo) di vendita e di affitto, per tipologia e stato dell\'immobile.';
  var SPIEGA_FASCE = 'La fascia dice dove si trova la zona nel comune: B centrale, C semicentrale, D periferica, E suburbana (frazioni e nuclei fuori dal centro abitato), R extraurbana o rurale.';
  var SPIEGA_NTN = 'NTN (numero di transazioni normalizzate) conta le compravendite di abitazioni registrate nel comune in un anno: la vendita di metà casa conta 0,5.';
  var SPIEGA_TAGLIA = 'L\'OMI raggruppa i comuni per taglia del mercato: S, M, L, XL, XXL, dal più piccolo al più grande.';

  /* a: asta (scheda a pezzi: campo omi da scripts/lib/arricchimento.mjs, campo zona da js/punteggio.js).
   * → { immobile, omi: {...} | null, perizie: {...} | null, mancanti: [testi], mappa: { comune, provincia } | null, sintesi } */
  function zona(a) {
    a = a || {};
    var Omi = modulo('Omi', './omi.js'), nomiFasce = (Omi && Omi.FASCE) || FASCE_NOMI;
    var out = { immobile: a.categoria === 'immobile', omi: null, perizie: null, mancanti: [], spiegazioni: { omi: SPIEGA_OMI, fasce: SPIEGA_FASCE, ntn: SPIEGA_NTN, taglia: SPIEGA_TAGLIA } };
    var comune = a.comune || (a.omi && nome(a.omi.comune)) || '';
    out.comune = comune;
    out.mappa = comune ? { comune: comune, provincia: a.provincia || undefined } : a.provincia ? { provincia: a.provincia } : null;
    if (!out.immobile) { out.mancanti.push('Le quotazioni OMI riguardano solo gli immobili.'); return out; }

    var o = a.omi && typeof a.omi === 'object' ? a.omi : null;
    if (!o) out.mancanti.push('Quotazioni OMI della zona: non ancora collegate a questa asta.');
    else if (!(o.euroMq && o.euroMq.min > 0)) out.mancanti.push('Quotazioni OMI della zona: ' + (o.mancante ? o.mancante : 'non disponibili') + '.');
    else {
      var z = o.zona && o.zona.codice ? o.zona : null, f = z && z.fascia ? String(z.fascia).toUpperCase() : null;
      var x = {
        fonte: o.fonte || 'Agenzia delle Entrate – OMI', semestre: o.semestre || null,
        comune: nome(o.comune) || comune,
        zona: z ? { codice: z.codice, fascia: f, nomeFascia: nomiFasce[f] || null, spiegaFascia: FASCE_SEMPLICI[f] || null,
          descrizione: z.descrizione ? nome(z.descrizione) : null, metodo: z.metodo || null, comeTrovata: METODI[z.metodo] || null } : null,
        senzaZona: z ? null : 'Zona OMI non riconosciuta dall\'indirizzo: valori tipici del comune (mediana delle sue zone)',
        tipologia: o.tipologia || null, stato: o.stato || null,
        euroMq: { min: num(o.euroMq.min), max: num(o.euroMq.max) },
        affittoMq: o.affittoMq && o.affittoMq.min > 0 ? { min: num(o.affittoMq.min), max: num(o.affittoMq.max), superficie: o.affittoMq.superficie || null } : null,
        mq: num(o.mq) || null, affidabilita: o.affidabilita || null,
        // nota con "undefined": difetto di js/omi.js (stato non quotato), non la si mostra
        note: (Array.isArray(o.note) ? o.note : []).filter(function (t) { return t && !/undefined/.test(t) && !/^Zona OMI non riconosciuta/.test(t); }),
        mancante: o.mancante || null
      };
      if (x.mq) {
        x.valore = { min: Math.round(x.mq * x.euroMq.min), max: Math.round(x.mq * x.euroMq.max) };
        if (x.affittoMq) x.affitto = { min: Math.round(x.mq * x.affittoMq.min), max: Math.round(x.mq * x.affittoMq.max) };
      }
      var cv = o.compravendite;
      if (cv && isFinite(Number(cv.ntn))) {
        var ntn = num(cv.ntn);
        x.compravendite = { ntn: ntn, anno: cv.anno || null, taglia: cv.taglia || null,
          testo: (cv.anno ? 'Nel ' + cv.anno : 'In un anno') + ' a ' + x.comune + ' sono state registrate circa ' + cifre(Math.round(ntn)) + ' compravendite di abitazioni (NTN ' + cifre(ntn, 2) + ')' +
            (cv.taglia ? ': mercato di taglia ' + cv.taglia + '.' : '.') };
      } else out.mancanti.push('Compravendite del comune (NTN): non disponibili per questa asta' + (x.mq ? '' : ' (arrivano con la superficie)') + '.');
      x.sintesi = (x.zona ? 'Zona OMI ' + x.zona.codice + (x.zona.nomeFascia ? ' (fascia ' + x.zona.fascia + ', ' + x.zona.nomeFascia + ')' : '') + (x.zona.descrizione ? ' – ' + x.zona.descrizione : '') : 'Valori tipici del comune (zona OMI non riconosciuta)') +
        ': ' + (x.tipologia ? x.tipologia.toLowerCase() + ' ' : '') + cifre(x.euroMq.min) + '–' + cifre(x.euroMq.max) + '\u00a0€/m²' +
        (x.affittoMq ? ', affitto ' + cifre(x.affittoMq.min, 2) + '–' + cifre(x.affittoMq.max, 2) + '\u00a0€/m² al mese' : '') + '.';
      out.omi = x;
    }

    // perizie della zona (js/punteggio.js, zonaDi): solo immobili residenziali con stima e superficie
    var p = a.zona && typeof a.zona === 'object' && a.zona.mediana > 0 ? a.zona : null;
    if (p) {
      var dove = p.livello === 'comune' ? 'nel comune di ' + p.nome : 'nella provincia di ' + p.nome;
      var questa = num(a.valore) > 0 && num(a.superficieMq) > 0 ? Math.round(a.valore / a.superficieMq) : null;
      out.perizie = { livello: p.livello, nome: p.nome, mediana: num(p.mediana), n: num(p.n), rapporto: p.rapporto != null ? num(p.rapporto) : null, questa: questa,
        testo: 'Mediana delle stime dei periti per le abitazioni all\'asta ' + dove + ': ' + cifre(p.mediana) + '\u00a0€/m² su ' + p.n + ' perizie' +
          (questa ? '; questa asta: ' + cifre(questa) + '\u00a0€/m²' + (p.rapporto != null ? ' (' + cifre(p.rapporto, 2) + ' volte la mediana)' : '') : '') + '.' };
    } else if (/residenzial/i.test(a.tipo || '')) {
      out.mancanti.push('Confronto con le perizie della zona: non disponibile (servono almeno 5 perizie con stima e superficie nello stesso comune o provincia).');
    }
    out.sintesi = out.omi ? out.omi.sintesi : null;
    return out;
  }

  /* ---------- probabilità ---------- */

  function nomeFascia(f) { return f === '4+' ? '4° tentativo o oltre' : f + '° tentativo'; }
  var NOMI_GRUPPI = {
    residenziale: 'immobili residenziali', 'altri-immobili': 'altri immobili (commerciali, industriali, terreni e altro)',
    veicoli: 'veicoli e nautica', beni: 'altri beni mobili'
  };
  // nomi brevi per la frase "Aste simili (…)"
  var BREVI = { residenziale: 'immobili residenziali', 'altri-immobili': 'immobili non residenziali', veicoli: 'veicoli e nautica', beni: 'altri beni mobili' };

  /* a: asta, stat: window.STATISTICHE (o null), q: probabilità di vincere se ci sono altri offerenti (0–1, ipotesi dell'utente).
   * → { disponibile, motivo?, simili, testoSimili, testoIpotesi, testoVincere, fonte, campione, periodo, spiegazione, perche, avvertenze, ... } */
  function probabilita(a, stat, q) {
    a = a || {};
    var St = modulo('Stratega', './stratega.js');
    q = Math.max(0, Math.min(1, num(q != null ? q : St ? St.PROFILO_BASE.concorrenza : 0.3)));
    var out = { disponibile: false, concorrenza: q, testoIpotesi: 'Se offri e ci sono altri offerenti, vinci con la probabilità che scegli tu: ' + pct(q, 0) + ' (ipotesi tua, non un dato).' };
    if (a.fonte === DEMANIO) { out.motivo = 'Le statistiche vengono dalle vendite giudiziarie del Portale delle Vendite Pubbliche: per le vendite dell\'Agenzia del Demanio non ci sono dati sugli esiti.'; return out; }
    if (!St) { out.motivo = 'Calcolo non disponibile: manca js/stratega.js.'; return out; }
    if (!stat || typeof stat !== 'object') { out.motivo = 'Statistiche sugli esiti delle vendite passate non disponibili: non possiamo dire quante aste simili hanno trovato un acquirente, e non lo inventiamo.'; return out; }
    var p = St.probabilita(a, stat, { concorrenza: q });
    out.gruppo = p.gruppo; out.fascia = p.fascia; out.livello = p.livello;
    if (!p.livello) { out.motivo = 'Le statistiche non hanno abbastanza esiti noti (almeno 30) per aste di questo tipo: non possiamo stimare la probabilità.'; return out; }
    out.disponibile = true;
    var gruppo = BREVI[p.gruppo] || (stat.nomi && stat.nomi[p.gruppo]) || p.gruppo;
    out.nomeGruppo = (stat.nomi && stat.nomi[p.gruppo]) || NOMI_GRUPPI[p.gruppo] || gruppo;
    out.simili = p.livello === 'tentativo' ? gruppo + ', ' + nomeFascia(p.fascia) : p.livello === 'gruppo' ? gruppo + ', tutti i tentativi' : 'tutte le categorie e tutti i tentativi';
    var c = p.campione || {}, lo = p.altriIntervallo ? p.altriIntervallo[0] : p.altriOfferenti, hi = p.altriIntervallo ? p.altriIntervallo[1] : p.altriOfferenti;
    out.altriOfferenti = p.altriOfferenti; out.altriIntervallo = [lo, hi];
    out.vincere = p.vincere; out.intervallo = p.intervallo;
    out.recenti = !!c.recenti;
    out.periodo = { dal: c.dal, al: c.al };
    out.campione = { noti: c.noti, ignote: c.ignote, n: c.n };
    out.testoSimili = 'Aste simili (' + out.simili + ') hanno trovato un acquirente nel ' + pct(p.altriOfferenti) + ' dei casi ' +
      (c.recenti ? 'negli ultimi esiti noti' : 'negli esiti noti') + ' (forchetta ' + pct(lo).replace('%', '') + '–' + pct(hi) + ').';
    out.testoVincere = 'Probabilità di vincere con un\'offerta valida: ' + pct(p.vincere) + ' (forchetta ' + pct(p.intervallo[0]).replace('%', '') + '–' + pct(p.intervallo[1]) + ').';
    out.testoCampione = cifre(c.noti) + ' vendite con esito noto dal ' + dataIt(c.dal) + ' al ' + dataIt(c.al) + (c.ignote ? ', più ' + cifre(c.ignote) + ' senza esito (contate nella forchetta)' : '') + '.';
    var blocco = c.recenti && stat.recenti ? stat.recenti : stat;
    out.fonte = (blocco.fonte || stat.fonte || 'Portale delle Vendite Pubbliche') + (stat.calcolato ? ' (calcolate il ' + dataIt(stat.calcolato) + ')' : '');
    out.url = stat.url || null;
    out.perche = p.livello === 'gruppo' ? (p.fascia ? 'Al ' + nomeFascia(p.fascia) + ' gli esiti noti sono meno di 30: uso tutto il gruppo.' : 'Numero del tentativo non noto: uso tutto il gruppo.')
      : p.livello === 'totale' ? 'Per questo gruppo gli esiti noti sono meno di 30: uso tutte le vendite.' : '';
    out.testoStima = 'È una stima dai dati passati (' + (c.recenti ? 'ultimi esiti noti del Portale delle Vendite Pubbliche' : 'esiti noti del Portale delle Vendite Pubbliche') + '), non una previsione.';
    out.spiegazione = 'È una stima dai dati passati, non una previsione. Un\'asta «aggiudicata» ha avuto almeno un offerente: usiamo questa quota come probabilità che ci siano altri offerenti oltre a te. ' +
      'Se nessun altro offre, un\'offerta valida vince; quindi P(vincere) = P(nessun altro offerente) + P(altri offerenti) × la tua ipotesi. ' +
      'La forchetta conta le vendite senza esito prima tutte come deserte, poi tutte come aggiudicate.' +
      (c.recenti ? ' Usiamo le ultime ' + Math.round((stat.recenti && stat.recenti.giorni || 28) / 7) + ' settimane: negli esiti più vecchi il portale conserva soprattutto le aste deserte.' : '');
    out.avvertenze = Array.isArray(stat.avvertenze) ? stat.avvertenze.slice() : [];
    return out;
  }

  var SchedaDati = { lineaTempo: lineaTempo, zona: zona, probabilita: probabilita, FASCE_SEMPLICI: FASCE_SEMPLICI, GIORNI_SALDO: GIORNI_SALDO, _: { eur: eur, pct: pct, dataIt: dataIt, nome: nome } };
  if (NODE) module.exports = SchedaDati;
  else root.SchedaDati = SchedaDati;
})(typeof window !== 'undefined' ? window : globalThis);
