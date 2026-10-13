/* Stratega d'asta: dato il capitale, quali aste puntare, quanto offrire e quando, con una simulazione Monte Carlo.
 *
 * Regola assoluta: nessun dato inventato.
 * - La probabilità che ci siano altri offerenti viene dagli esiti REALI delle vendite passate del Portale delle Vendite
 *   Pubbliche (data/statistiche.js, generato da scripts/lib/statistiche.mjs), sempre con campione e periodo.
 * - La probabilità di vincere quando ci sono altri offerenti è un'ipotesi dell'utente (profilo.concorrenza), detta come tale.
 * - Valore, costi e offerta massima sono quelli del sito (js/punteggio.js, js/calcoli.js, config/tariffe.js), con le stesse ipotesi.
 * Funzioni pure; il generatore casuale ha un seme, così la simulazione si ripete identica (test riproducibili).
 * Usabile nel browser (window.Stratega) e in Node per i test. */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  var C = NODE ? require('./calcoli.js') : root.Calcoli;
  var P = NODE ? require('./punteggio.js') : root.Punteggio;
  var M = NODE ? require('./mutuo.js') : root.Mutuo;

  var STRATEGIE = ['vivere', 'affittare', 'rivendere'];
  var PRUDENZE = ['prudente', 'equilibrata', 'audace'];
  var CATEGORIE = ['immobile', 'auto', 'moto', 'beni', 'tutte'];
  var PROFILO_BASE = {
    capitale: 0, mutuo: 0, orizzonteMesi: 6, strategia: 'rivendere', regioni: [], categoria: 'immobile',
    prudenza: 'prudente', concorrenza: 0.3, regime: P.IPOTESI.regime
  };
  // probabilità massima accettata di vincere più di quanto si può pagare, se si offrisse a tutte le aste del piano
  var RISCHIO_MASSIMO = { prudente: 0, equilibrata: 0.10, audace: 0.25 };
  var PARAMETRI = {
    giorniSaldo: 120,           // art. 569 c.p.c.: il saldo va versato entro il termine dell'ordinanza, non oltre 120 giorni
    massimoAste: 10,            // aste al massimo in un piano
    perProcedura: 1, perComune: 2,
    simulazioniPiano: 2000,     // giri per il controllo del rischio mentre si costruisce il piano
    simulazioni: 5000, seme: 20261013
  };
  var DISCLAIMER = 'È una simulazione, non una consulenza finanziaria: le probabilità vengono da esiti passati e da ipotesi tue; verifica sempre avviso e perizia.';
  var NOMI_GRUPPI = {
    residenziale: 'immobili residenziali', 'altri-immobili': 'altri immobili (commerciali, industriali, terreni e altro)',
    veicoli: 'veicoli e nautica', beni: 'altri beni mobili'
  };
  var NOTA_CAUZIONE = 'di solito il 10%, verifica l\'avviso';
  var NOTA_SALDO = 'di solito entro 120 giorni, verifica l\'avviso';

  /* ---------- piccoli aiuti ---------- */

  function num(x) { var n = Number(x); return isFinite(n) ? n : 0; }
  function tre(x) { return Math.round(x * 1000) / 1000; }
  function eur(n) { return Math.round(n).toLocaleString('it-IT') + ' €'; }
  function pct(f) { return f == null ? '–' : (Math.round(f * 1000) / 10).toString().replace('.', ',') + '%'; }
  function dataIt(d) { if (!d) return ''; var p = String(d).slice(0, 10).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function piu(data, giorni) { var d = new Date(data + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + giorni); return d.toISOString().slice(0, 10); }
  function piuMesi(data, mesi) {
    var d = new Date(data + 'T12:00:00Z'), g = d.getUTCDate();
    d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + mesi);
    var ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)).getUTCDate();
    d.setUTCDate(Math.min(g, ultimo));
    return d.toISOString().slice(0, 10);
  }
  function oggiIso() { return new Date().toISOString().slice(0, 10); }

  // generatore pseudo-casuale con seme (mulberry32): stessi semi, stessi numeri
  function mulberry32(seme) {
    var a = seme >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function percentili(valori) {
    if (!valori.length) return { p10: null, p50: null, p90: null, media: null };
    var s = valori.slice().sort(function (x, y) { return x - y; });
    function q(f) { return Math.round(s[Math.floor(f * (s.length - 1))]); }
    var somma = 0; for (var i = 0; i < s.length; i++) somma += s[i];
    return { p10: q(0.1), p50: q(0.5), p90: q(0.9), media: Math.round(somma / s.length) };
  }

  /* ---------- profilo ---------- */

  /* input: { capitale (contanti €, obbligatorio), mutuo (€ già disponibili dalla banca, solo se li indica l'utente),
   *          orizzonteMesi (1–12), strategia, regioni [], categoria, prudenza, concorrenza (0–1 o 0–100), regime } */
  function profilo(input) {
    input = input || {};
    var p = {}, errori = [];
    var cap = num(input.capitale);
    if (!(cap > 0)) errori.push('Indica il capitale che hai in contanti, in euro.');
    p.capitale = Math.max(0, Math.round(cap));
    p.mutuo = Math.max(0, Math.round(num(input.mutuo)));
    var o = Math.round(num(input.orizzonteMesi) || PROFILO_BASE.orizzonteMesi);
    p.orizzonteMesi = Math.max(1, Math.min(12, o));
    p.strategia = STRATEGIE.indexOf(input.strategia) >= 0 ? input.strategia : PROFILO_BASE.strategia;
    var r = input.regioni;
    if (typeof r === 'string') r = r.split(',');
    p.regioni = Array.isArray(r) ? r.map(function (x) { return String(x).trim(); }).filter(Boolean) : [];
    p.categoria = CATEGORIE.indexOf(input.categoria) >= 0 ? input.categoria : PROFILO_BASE.categoria;
    p.prudenza = PRUDENZE.indexOf(input.prudenza) >= 0 ? input.prudenza : PROFILO_BASE.prudenza;
    var predefinita = input.concorrenza == null || input.concorrenza === '' || !isFinite(Number(input.concorrenza));
    var q = predefinita ? PROFILO_BASE.concorrenza : Number(input.concorrenza);
    if (q > 1) q = q / 100;
    p.concorrenza = Math.max(0, Math.min(1, q));
    p.concorrenzaPredefinita = predefinita;
    p.regime = input.regime ? String(input.regime) : PROFILO_BASE.regime;
    p.errori = errori;
    p.valido = !errori.length;
    return p;
  }
  function normale(prof) { return prof && prof.errori ? prof : profilo(prof); }

  /* ---------- probabilità ---------- */

  // Gruppo delle statistiche (scripts/lib/statistiche.mjs). Le biciclette e la nautica, che nel sito sono "beni",
  // nel PVP hanno la categoria AUTOVEICOLI_E_CICLI o NAUTICA: stanno nei veicoli come nelle statistiche.
  function gruppoDi(a) {
    if (a.categoria === 'immobile') return /residenzial/i.test(a.tipo || '') ? 'residenziale' : 'altri-immobili';
    if (a.categoria === 'auto' || a.categoria === 'moto') return 'veicoli';
    if (/autoveicoli|nautica/i.test(a.tipo || '')) return 'veicoli';
    return 'beni';
  }
  function fascia(k) { return k >= 4 ? '4+' : String(k); }

  // blocco delle statistiche da usare: le ultime settimane se hanno abbastanza esiti noti (negli esiti più vecchi
  // il portale conserva soprattutto le deserte, vedi avvertenze del file), altrimenti l'intero periodo
  function bloccoStatistiche(stat) {
    if (!stat) return null;
    var r = stat.recenti;
    if (r && r.totale && r.totale.p != null) return { b: r, recenti: true, periodo: r.periodo || {}, giorni: r.giorni };
    if (stat.totale) return { b: stat, recenti: false, periodo: stat.periodo || {} };
    return null;
  }

  function testoInterpretazione(q) {
    return 'In passato un\'asta «aggiudicata» ha avuto almeno un offerente; se nessun altro offre, un\'offerta valida (almeno l\'offerta minima) vince. ' +
      'Quindi P(vincere) = P(nessun altro offerente) + P(altri offerenti) × ' + pct(q) + '.';
  }
  function testoIpotesi(prof, q) {
    return 'Se ci sono altri offerenti vinci con probabilità ' + pct(q) + ': è un\'ipotesi tua' +
      (prof && prof.concorrenzaPredefinita ? ' (valore predefinito: cambialo se conosci la zona)' : '') + ', non un dato.';
  }

  /* Probabilità di vincere l'asta a. stat = window.STATISTICHE (o null). */
  function probabilita(a, stat, prof) {
    var q = prof && prof.concorrenza != null ? Math.max(0, Math.min(1, num(prof.concorrenza))) : PROFILO_BASE.concorrenza;
    var g = gruppoDi(a), k = num(a.tentativo), f = k > 0 ? fascia(k) : null;
    var base = { gruppo: g, fascia: f, concorrenza: q, ipotesi: testoIpotesi(prof, q), interpretazione: testoInterpretazione(q) };
    var B = bloccoStatistiche(stat);
    var G = B && B.b.gruppi ? B.b.gruppi[g] : null;
    var scelta = null, livello = null, perche = '';
    if (G && f && G.tentativi && G.tentativi[f] && G.tentativi[f].p != null) { scelta = G.tentativi[f]; livello = 'tentativo'; }
    else if (G && G.p != null) { scelta = G; livello = 'gruppo'; perche = f ? 'al ' + nomeFascia(f) + ' gli esiti noti sono meno di 30: uso tutto il gruppo' : 'numero del tentativo non noto: uso tutto il gruppo'; }
    else if (B && B.b.totale && B.b.totale.p != null) { scelta = B.b.totale; livello = 'totale'; perche = 'per questo gruppo gli esiti noti sono meno di 30: uso tutte le vendite'; }
    if (!scelta) {
      base.altriOfferenti = null; base.vincere = tre(q); base.intervallo = [tre(q), 1]; base.livello = null;
      base.fonte = 'Statistiche sugli esiti passati non disponibili: senza dati ipotizzo che ci siano sempre altri offerenti (il caso peggiore per te).';
      return base;
    }
    var pa = scelta.p, pMin = scelta.pMin != null ? scelta.pMin : pa, pMax = scelta.pMax != null ? scelta.pMax : pa;
    var noti = scelta.aggiudicate + scelta.deserte;
    var nome = (stat.nomi && stat.nomi[g]) || NOMI_GRUPPI[g];
    var descr = livello === 'tentativo' ? nome + ' al ' + nomeFascia(f) : livello === 'gruppo' ? nome + ' (tutti i tentativi)' : 'tutte le categorie';
    base.altriOfferenti = tre(pa);
    base.vincere = tre((1 - pa) + pa * q);
    base.intervallo = [tre((1 - pMax) + pMax * q), tre((1 - pMin) + pMin * q)];
    base.altriIntervallo = [pMin, pMax];
    base.livello = livello;
    base.campione = { noti: noti, ignote: scelta.ignote, n: scelta.n, dal: B.periodo.dal || null, al: B.periodo.al || null, recenti: B.recenti };
    base.fonte = 'Esiti reali del Portale delle Vendite Pubbliche dal ' + dataIt(B.periodo.dal) + ' al ' + dataIt(B.periodo.al) + ': tra le ' + noti +
      ' vendite di ' + descr + ' con esito noto il ' + pct(pa) + ' è stato aggiudicato, cioè ha avuto almeno un offerente; contando anche le ' + scelta.ignote +
      ' senza esito, tra il ' + pct(pMin) + ' e il ' + pct(pMax) + '.' + (perche ? ' (' + perche + '.)' : '') +
      (B.recenti ? ' Uso le ultime ' + Math.round((B.giorni || 28) / 7) + ' settimane: negli esiti più vecchi il portale conserva soprattutto le aste deserte.' : '');
    return base;
  }
  function nomeFascia(f) { return f === '4+' ? '4° tentativo o oltre' : f + '° tentativo'; }

  /* ---------- candidati ---------- */

  function regimeValido(id, T) { return T.immobili.regimi.some(function (r) { return r.id === id; }); }
  function nomeRegime(id, T) { var r = T.immobili.regimi.filter(function (x) { return x.id === id; })[0]; return r ? r.nome : id; }

  // termineOfferte: 'AAAA-MM-GG' o 'AAAA-MM-GGTHH:MM' (dal dettaglio del PVP); se manca, il giorno prima dell'asta
  function dataCauzione(a) {
    if (a.termineOfferte) {
      var p = String(a.termineOfferte).split('T');
      return { data: p[0], ora: p[1] ? p[1].slice(0, 5) : null, nota: 'termine per le offerte indicato nell\'avviso' };
    }
    return { data: piu(a.dataAsta, -1), ora: null, nota: 'di solito il giorno prima dell\'asta: verifica il termine nell\'avviso' };
  }

  // stessi ingressi di js/punteggio.js (inputCosto), con l'offerta scelta e il regime del profilo
  function costo(a, offerta, valoreMercato, regime, T) {
    if (a.categoria === 'immobile') {
      return C.costoImmobile({ prezzoBase: a.prezzoBase, offerta: offerta, valoreMercato: valoreMercato, regime: regime,
        speseProcedura: P.IPOTESI.speseProcedura, liberazione: a.stato === 'occupato' ? P.IPOTESI.liberazioneOccupato : 0 }, T);
    }
    return C.costoVeicolo({ tipo: a.categoria === 'beni' ? 'beni' : a.categoria, offerta: offerta, valoreMercato: valoreMercato, kw: P.IPOTESI.kw, provincia: a.provincia }, T);
  }
  function inputOffertaMassima(a, regime) {
    if (a.categoria === 'immobile') {
      return { fn: C.costoImmobile, input: { prezzoBase: a.prezzoBase, offerta: a.prezzoBase, valoreMercato: a.valoreMin, regime: regime,
        speseProcedura: P.IPOTESI.speseProcedura, liberazione: a.stato === 'occupato' ? P.IPOTESI.liberazioneOccupato : 0 } };
    }
    return { fn: C.costoVeicolo, input: { tipo: a.categoria === 'beni' ? 'beni' : a.categoria, offerta: a.prezzoBase, valoreMercato: a.valoreMin, kw: P.IPOTESI.kw, provincia: a.provincia } };
  }

  // mutuo usabile per un acquisto: solo immobili, al massimo l'80% dell'offerta (prassi delle banche, js/mutuo.js), entro quello disponibile
  function quotaMutuo(c, disponibile) { return c.categoria === 'immobile' ? Math.max(0, Math.min(M.IPOTESI.ltvMassimo * c.offerta, disponibile)) : 0; }

  function analizza(a, prof, T, stat, regime, offMin) {
    var base = num(a.prezzoBase);
    // offerta massima del sito (costo totale entro l'80% del valore minimo): con un regime diverso da quello del punteggio si ricalcola
    var offMax = num(a.offertaMax);
    if (a.categoria === 'immobile' && regime !== P.IPOTESI.regime) {
      var im = inputOffertaMassima(a, regime);
      offMax = C.offertaMassima(im.fn, im.input, T, T.giudizio.scontoObiettivo);
    }
    if (!(offMax >= offMin)) return null;
    var offerta = Math.max(offMin, Math.min(offMax, base));
    var motivo = offerta >= base
      ? 'Offri il prezzo base: l\'offerta massima consigliata (' + eur(offMax) + ', con imposte e spese resti almeno il 20% sotto il valore minimo) lo permette, e un\'offerta pari al prezzo base non rischia di essere rifiutata se sei l\'unico offerente.'
      : 'Offri ' + eur(offerta) + ', l\'offerta massima consigliata: oltre, con imposte e spese, resteresti meno del 20% sotto il valore minimo. È sotto il prezzo base ma non sotto l\'offerta minima (' +
        eur(offMin) + '): è valida, ma se sei l\'unico offerente il giudice può non accettarla (art. 572 c.p.c.).';
    var quota = num(a.cauzionePerc) > 0 ? (num(a.cauzionePerc) > 1 ? num(a.cauzionePerc) / 100 : num(a.cauzionePerc)) : T.asta.cauzione.quota;
    var dc = dataCauzione(a);
    var ct = costo(a, offerta, num(a.valoreMin), regime, T);
    var costoTotale = Math.round(ct.totale);
    var c = {
      id: a.id, titolo: a.titolo, categoria: a.categoria, tipo: a.tipo, gruppo: gruppoDi(a), regione: a.regione, provincia: a.provincia, comune: a.comune,
      tribunale: a.tribunale, rge: a.rge, annoProcedura: a.annoProcedura, dataAsta: a.dataAsta, ora: a.ora || null, linkAvviso: a.linkAvviso, stato: a.stato,
      tentativo: a.tentativo || null, prezzoBase: base, offertaMinima: offMin, offertaMax: offMax,
      offerta: Math.round(offerta), motivoOfferta: motivo,
      valore: { min: num(a.valoreMin), centrale: num(a.valore) || null, max: num(a.valoreMax) || null, fonte: a.fonteValore || null, affidabilita: a.affidabilita },
      costoTotale: costoTotale,
      dataCauzione: dc,
      dataSaldo: { data: piu(a.dataAsta, PARAMETRI.giorniSaldo), nota: NOTA_SALDO },
      asta: a
    };
    c.cauzione = { importo: Math.round(offerta * quota), quota: quota, nota: num(a.cauzionePerc) > 0 ? 'indicata nell\'avviso' : NOTA_CAUZIONE, data: dc.data };
    c.mutuoUsato = Math.round(quotaMutuo(c, prof.mutuo));
    c.cassaNecessaria = costoTotale - c.mutuoUsato;
    c.margine = Math.round(c.valore.min - costoTotale);
    c.probabilita = probabilita(a, stat, prof);
    c.guadagnoAtteso = Math.round(c.probabilita.vincere * c.margine);
    c.guadagnoAttesoForchetta = [Math.round(c.probabilita.intervallo[0] * c.margine), Math.round(c.probabilita.intervallo[1] * c.margine)];
    c.efficienza = c.cassaNecessaria > 0 ? c.guadagnoAtteso / c.cassaNecessaria : 0;
    if (a.categoria === 'immobile' && num(a.omiAffMin) > 0 && num(a.omiAffMax) >= num(a.omiAffMin)) {
      c.renditaAnnua = { min: Math.round(num(a.omiAffMin) * 12), max: Math.round(num(a.omiAffMax) * 12),
        fonte: 'Quotazioni OMI di locazione della zona (Agenzia delle Entrate – OMI), lorde: senza tasse, spese e mesi sfitti' };
      c.rendimento = { min: tre(c.renditaAnnua.min / costoTotale), max: tre(c.renditaAnnua.max / costoTotale) };
    } else if (prof.strategia === 'affittare') c.renditaAnnua = null;
    return c;
  }

  /* Aste su cui ha senso puntare. opz: { T (tariffe), stat (window.STATISTICHE), oggi 'AAAA-MM-GG' }
   * → { candidati: [...], scartate: { motivo: quante }, esclusiBassa, analizzate, oggi, fine, regime, note } */
  function candidati(aste, prof, opz) {
    opz = opz || {};
    var T = opz.T;
    if (!T) throw new Error('Servono le tariffe (config/tariffe.js)');
    prof = normale(prof);
    var oggi = opz.oggi || oggiIso(), fine = piuMesi(oggi, prof.orizzonteMesi);
    var note = [], regime = prof.regime;
    if (!regimeValido(regime, T)) { note.push('Regime fiscale «' + regime + '» sconosciuto: uso «' + nomeRegime(P.IPOTESI.regime, T) + '».'); regime = P.IPOTESI.regime; }
    var scartate = {}, lista = [];
    function scarta(m) { scartate[m] = (scartate[m] || 0) + 1; }
    (aste || []).forEach(function (a) {
      if (prof.categoria !== 'tutte' && a.categoria !== prof.categoria) return scarta('altra categoria');
      if (prof.regioni.length && prof.regioni.indexOf(a.regione) < 0) return scarta('fuori dalle regioni scelte');
      if ((prof.strategia === 'vivere' || prof.strategia === 'affittare') && a.categoria !== 'immobile') return scarta('non è un immobile');
      if (prof.strategia === 'vivere' && gruppoDi(a) !== 'residenziale') return scarta('non è un immobile residenziale');
      if (!a.dataAsta) return scarta('data dell\'asta non indicata');
      if (a.dataAsta <= oggi || dataCauzione(a).data < oggi) return scarta('asta passata o termine per le offerte scaduto');
      if (a.dataAsta > fine) return scarta('oltre l\'orizzonte di ' + prof.orizzonteMesi + ' mesi');
      if (a.affidabilita === 'bassa') return scarta('valore poco affidabile');
      if ((a.affidabilita !== 'media' && a.affidabilita !== 'alta') || !(num(a.valoreMin) > 0)) return scarta('valore di mercato non stimabile');
      if (!(num(a.prezzoBase) > 0)) return scarta('prezzo base non indicato');
      // offerta minima dell'avviso, oppure il 75% del prezzo base (art. 571 c.p.c., config/tariffe.js)
      var offMin = num(a.offertaMinima) > 0 ? num(a.offertaMinima) : C.offertaMinima(a.prezzoBase, T);
      var c = analizza(a, prof, T, opz.stat || null, regime, offMin);
      if (!c) return scarta('nemmeno l\'offerta minima lascia margine sul valore');
      if (!(c.margine > 0)) return scarta('costo totale sopra il valore minimo');
      lista.push(c);
    });
    return { candidati: lista, scartate: scartate, esclusiBassa: scartate['valore poco affidabile'] || 0, analizzate: (aste || []).length,
      oggi: oggi, fine: fine, regime: regime, note: note };
  }

  /* ---------- piano ---------- */

  function chiaveProcedura(c) { return [c.tribunale || '', c.rge || '', c.annoProcedura || ''].join('|'); }

  // cassa necessaria se si vincessero tutte: costi meno il mutuo, che copre al massimo l'80% di ogni offerta e in tutto la cifra del profilo
  function cassaSeVinciTutte(scelte, prof) {
    var costi = 0, bisognoMutuo = 0;
    scelte.forEach(function (c) { costi += c.costoTotale; bisognoMutuo += quotaMutuo(c, Infinity); });
    return Math.round(costi - Math.min(bisognoMutuo, prof.mutuo));
  }

  // eventi in ordine di tempo: offerta (con cauzione) al termine per le offerte, esito il giorno dell'asta.
  // Nello stesso giorno le offerte vengono prima degli esiti (per prudenza: la cauzione è già versata).
  function eventi(scelte) {
    var ev = [];
    scelte.forEach(function (c, i) { ev.push({ t: c.dataCauzione.data, tipo: 0, i: i }); ev.push({ t: c.dataAsta, tipo: 1, i: i }); });
    ev.sort(function (x, y) { return x.t < y.t ? -1 : x.t > y.t ? 1 : x.tipo - y.tipo || x.i - y.i; });
    return ev;
  }

  function probUsata(c, quale) {
    var p = c.probabilita || {};
    if (quale === 'massima') return p.intervallo ? p.intervallo[1] : p.vincere;
    if (quale === 'minima') return p.intervallo ? p.intervallo[0] : p.vincere;
    return p.vincere;
  }

  /* Rischio di sforare se si offrisse a TUTTE le aste del piano: quota di giri in cui, a una data qualsiasi,
   * cassa delle aste vinte + cauzioni delle offerte ancora aperte > capitale. */
  function rischio(scelte, prof, opz) {
    opz = opz || {};
    if (!scelte.length || cassaSeVinciTutte(scelte, prof) <= prof.capitale) return 0;
    var n = opz.n || PARAMETRI.simulazioniPiano, rnd = mulberry32(opz.seme != null ? opz.seme : PARAMETRI.seme), ev = eventi(scelte);
    var pv = scelte.map(function (c) { return probUsata(c, opz.probabilita || 'massima'); });
    var sforati = 0;
    for (var g = 0; g < n; g++) {
      var u = scelte.map(function () { return rnd(); });
      var impegnato = 0, cauzioni = 0, mutuo = prof.mutuo;
      for (var j = 0; j < ev.length; j++) {
        var e = ev[j], c = scelte[e.i];
        if (e.tipo === 0) cauzioni += c.cauzione.importo;
        else {
          cauzioni -= c.cauzione.importo;
          if (u[e.i] < pv[e.i]) { var m = quotaMutuo(c, mutuo); mutuo -= m; impegnato += c.costoTotale - m; }
        }
        if (impegnato + cauzioni > prof.capitale + 0.5) { sforati++; break; }
      }
    }
    return sforati / n;
  }

  function testoRegola(prudenza) {
    if (prudenza === 'prudente') return 'Prudente: anche vincendo tutte le aste del piano hai la cassa per pagarle.';
    return (prudenza === 'equilibrata' ? 'Equilibrata' : 'Audace') + ': se offrissi a tutte le aste del piano, la probabilità di vincerne più di quante puoi pagare resta sotto il ' +
      pct(RISCHIO_MASSIMO[prudenza]) + ' (calcolata con la probabilità di vittoria più alta della forchetta). Con la regola «offri solo se la cassa libera copre l\'acquisto» non sfori mai: al massimo salti un\'offerta.';
  }

  /* Piano: scelta golosa per guadagno atteso / cassa necessaria, con diversificazione e regola di cassa della prudenza.
   * → { prudenza, scelte (in ordine di data), escluse [{id, titolo, motivo}], motivi {motivo: quante}, sintesi } */
  function piano(cand, prof) {
    prof = normale(prof);
    var lista = Array.isArray(cand) ? cand : (cand && cand.candidati) || [];
    var soglia = RISCHIO_MASSIMO[prof.prudenza];
    var ordinati = lista.slice().sort(function (x, y) { return y.efficienza - x.efficienza || y.guadagnoAtteso - x.guadagnoAtteso || String(x.id).localeCompare(String(y.id)); });
    var scelte = [], escluse = [], motivi = {}, perProc = {}, perCom = {}, ultimoRischio = 0;
    function escludi(c, motivo, chiave) { escluse.push({ id: c.id, titolo: c.titolo, motivo: motivo }); motivi[chiave || motivo] = (motivi[chiave || motivo] || 0) + 1; }
    ordinati.forEach(function (c) {
      if (!(prof.capitale > 0)) return escludi(c, 'capitale non indicato');
      if (!(c.guadagnoAtteso > 0)) return escludi(c, 'guadagno atteso non positivo');
      if (c.cassaNecessaria > prof.capitale) return escludi(c, 'servono ' + eur(c.cassaNecessaria) + ' di cassa, più del tuo capitale', 'cassa necessaria oltre il capitale');
      if (scelte.length >= PARAMETRI.massimoAste) return escludi(c, 'il piano ha già ' + PARAMETRI.massimoAste + ' aste', 'piano già pieno');
      var kp = chiaveProcedura(c), kc = (c.comune || '') + '|' + (c.provincia || '');
      if (c.rge && (perProc[kp] || 0) >= PARAMETRI.perProcedura) return escludi(c, 'un altro lotto della stessa procedura è già nel piano');
      if (c.comune && (perCom[kc] || 0) >= PARAMETRI.perComune) return escludi(c, 'già ' + PARAMETRI.perComune + ' aste nello stesso comune');
      var prova = scelte.concat([c]);
      if (prof.prudenza === 'prudente') {
        var tot = cassaSeVinciTutte(prova, prof);
        if (tot > prof.capitale) return escludi(c, 'vincendo tutte servirebbero ' + eur(tot) + ' di cassa, più del tuo capitale', 'non pagabile se le vinci tutte');
      } else {
        var r = rischio(prova, prof, { n: PARAMETRI.simulazioniPiano, seme: PARAMETRI.seme });
        if (r > soglia) return escludi(c, 'la probabilità di vincere più di quanto puoi pagare salirebbe al ' + pct(r) + ' (massimo ' + pct(soglia) + ')', 'rischio di sforare oltre la soglia');
        ultimoRischio = r;
      }
      scelte.push(c);
      perProc[kp] = (perProc[kp] || 0) + 1; perCom[kc] = (perCom[kc] || 0) + 1;
    });
    scelte.sort(function (x, y) { return x.dataCauzione.data < y.dataCauzione.data ? -1 : x.dataCauzione.data > y.dataCauzione.data ? 1 : x.dataAsta < y.dataAsta ? -1 : x.dataAsta > y.dataAsta ? 1 : 0; });
    var cassaTutte = cassaSeVinciTutte(scelte, prof), guadagno = 0;
    scelte.forEach(function (c) { guadagno += c.guadagnoAtteso; });
    var sintesi = {
      aste: scelte.length, cassaSeVinciTutte: cassaTutte, guadagnoAttesoTotale: Math.round(guadagno),
      rischioSforamento: prof.prudenza === 'prudente' ? 0 : ultimoRischio, sogliaRischio: soglia, regola: testoRegola(prof.prudenza),
      candidati: lista.length
    };
    sintesi.testo = scelte.length
      ? 'Piano con ' + scelte.length + (scelte.length === 1 ? ' asta' : ' aste') + ' tra il ' + dataIt(scelte[0].dataAsta) + ' e il ' + dataIt(scelte[scelte.length - 1].dataAsta) +
        ': vincendole tutte servirebbero ' + eur(cassaTutte) + ' di cassa su ' + eur(prof.capitale) + '. Guadagno atteso (probabilità × margine sul valore minimo) ' + eur(guadagno) + '.'
      : (lista.length ? 'Nessuna delle ' + lista.length + ' aste candidate entra nel piano con le tue regole.' : 'Nessuna asta candidata') + ': meglio aspettare che forzare un piano.';
    var ordineMotivi = Object.keys(motivi).sort(function (x, y) { return motivi[y] - motivi[x]; });
    return { prudenza: prof.prudenza, scelte: scelte, escluse: escluse.slice(0, 30), motivi: motivi, motiviPrincipali: ordineMotivi.slice(0, 5), sintesi: sintesi };
  }

  /* ---------- simulazione ---------- */

  /* Monte Carlo sequenziale in ordine di data. A ogni termine per le offerte si offre solo se la cassa libera
   * (capitale − cassa delle aste già vinte − cassa tenuta da parte per le offerte ancora aperte) copre l'intera cassa
   * necessaria in caso di vittoria: così non si sfora mai (lo sforamento si conta comunque, come controllo).
   * Per chi vuole viverci si cerca una sola casa: dopo una vittoria, o con un'offerta ancora aperta, non si offre più.
   * opz: { n (5000), seme, probabilita: 'centrale' | 'minima' | 'massima', forchetta (true: rifà il conto agli estremi) } */
  function simula(pi, prof, opz) {
    opz = opz || {};
    prof = normale(prof);
    var scelte = Array.isArray(pi) ? pi : (pi && pi.scelte) || [];
    var n = Math.max(1, Math.round(opz.n || PARAMETRI.simulazioni)), seme = opz.seme != null ? opz.seme : PARAMETRI.seme;
    var quale = opz.probabilita || 'centrale', una = prof.strategia === 'vivere';
    var rnd = mulberry32(seme), ev = eventi(scelte), k = scelte.length;
    var pv = scelte.map(function (c) { return probUsata(c, quale); });
    var istogramma = [], vintePer = [], saltatePer = [], nonServePer = [], i;
    for (i = 0; i <= k; i++) istogramma.push(0);
    for (i = 0; i < k; i++) { vintePer.push(0); saltatePer.push(0); nonServePer.push(0); }
    var capitali = [], guadagni = [], picchi = [], sforamenti = 0, conSaltate = 0, saltateTot = 0, almenoUna = 0;
    for (var g = 0; g < n; g++) {
      var u = [];
      for (i = 0; i < k; i++) u.push(rnd());
      var libera = prof.capitale, mutuo = prof.mutuo, stato = [], tenuta = [], vinte = 0, usato = 0, guad = 0, impegnato = 0, cauzioni = 0, aperte = 0, picco = 0, sforato = false, saltateGiro = 0;
      for (var j = 0; j < ev.length; j++) {
        var e = ev[j], c = scelte[e.i];
        if (e.tipo === 0) {
          if (una && (vinte > 0 || aperte > 0)) { stato[e.i] = 'non-serve'; nonServePer[e.i]++; continue; }
          var m = quotaMutuo(c, mutuo), serve = c.costoTotale - m;
          if (serve > libera + 0.5) { stato[e.i] = 'saltata'; saltatePer[e.i]++; saltateGiro++; continue; }
          libera -= serve; mutuo -= m; tenuta[e.i] = { cassa: serve, mutuo: m }; stato[e.i] = 'aperta'; aperte++; cauzioni += c.cauzione.importo;
        } else {
          if (stato[e.i] !== 'aperta') continue;
          aperte--; cauzioni -= c.cauzione.importo;
          if (u[e.i] < pv[e.i]) {
            stato[e.i] = 'vinta'; vinte++; vintePer[e.i]++;
            usato += tenuta[e.i].cassa; impegnato += tenuta[e.i].cassa; guad += c.margine;
          } else { stato[e.i] = 'persa'; libera += tenuta[e.i].cassa; mutuo += tenuta[e.i].mutuo; }
        }
        if (impegnato + cauzioni > picco) picco = impegnato + cauzioni;
        if (impegnato + cauzioni > prof.capitale + 0.5) sforato = true;
      }
      istogramma[vinte]++;
      if (vinte > 0) almenoUna++;
      capitali.push(usato); guadagni.push(guad); picchi.push(picco);
      if (sforato) sforamenti++;
      if (saltateGiro) conSaltate++;
      saltateTot += saltateGiro;
    }
    var out = {
      n: n, seme: seme, probabilita: quale,
      vinte: { istogramma: istogramma.map(function (x) { return tre(x / n); }), conteggi: istogramma, media: tre(istogramma.reduce(function (s, x, v) { return s + x * v; }, 0) / n) },
      almenoUna: tre(almenoUna / n),
      capitaleUsato: percentili(capitali),
      guadagno: percentili(guadagni),
      impegnoMassimo: percentili(picchi),
      sforamento: tre(sforamenti / n),
      offerteSaltate: { media: tre(saltateTot / n), quotaGiri: tre(conSaltate / n) },
      perAsta: scelte.map(function (c, x) {
        return { id: c.id, titolo: c.titolo, dataAsta: c.dataAsta, probabilita: tre(pv[x]), vinta: tre(vintePer[x] / n), saltataPerCassa: tre(saltatePer[x] / n), nonServe: tre(nonServePer[x] / n) };
      })
    };
    if (opz.forchetta !== false && quale === 'centrale' && k) {
      var lo = simula(scelte, prof, { n: n, seme: seme, probabilita: 'minima', forchetta: false });
      var hi = simula(scelte, prof, { n: n, seme: seme, probabilita: 'massima', forchetta: false });
      out.forchetta = { almenoUna: [lo.almenoUna, hi.almenoUna], guadagnoMedio: [lo.guadagno.media, hi.guadagno.media], vinteMedia: [lo.vinte.media, hi.vinte.media],
        nota: 'Stessa simulazione con le probabilità più basse e più alte della forchetta dei dati (le vendite senza esito contate come non aggiudicate o come aggiudicate).' };
    }
    return out;
  }

  /* ---------- spiegazione ---------- */

  /* risultato: { profilo, candidati, piano, simulazione, statistiche } (come da esegui) → righe in italiano per il sito */
  function spiega(ris) {
    ris = ris || {};
    var prof = normale(ris.profilo || {}), pi = ris.piano || null, sim = ris.simulazione || null, stat = ris.statistiche || null, cand = ris.candidati || null, T = ris.T || null;
    var q = prof.concorrenza, ipotesi = [], nonSappiamo = [], avvertenze = [];
    if (stat && stat.fonte) {
      ipotesi.push('Probabilità che ci siano altri offerenti: dagli esiti reali delle vendite passate (' + stat.fonte + (stat.recenti && stat.recenti.totale && stat.recenti.totale.p != null
        ? '; per le probabilità uso le ultime ' + Math.round((stat.recenti.giorni || 28) / 7) + ' settimane, ' + stat.recenti.fonte.replace('Portale delle Vendite Pubbliche – ', '') : '') +
        '). Per ogni asta è indicato il campione: gruppo, tentativo, esiti noti e forchetta con quelli ignoti.');
    } else ipotesi.push('Statistiche sugli esiti passati non disponibili: ipotizzo che ci siano sempre altri offerenti (il caso peggiore per te).');
    ipotesi.push(testoIpotesi(prof, q));
    ipotesi.push(testoInterpretazione(q));
    ipotesi.push('Valore: il minimo della forchetta stimata (perizia, prima asta o quotazioni OMI, come indicato per ogni asta), solo con affidabilità media o alta.');
    ipotesi.push('Costi: imposte del regime «' + (T ? nomeRegime((cand && cand.regime) || prof.regime, T) : (cand && cand.regime) || prof.regime) + '» (config/tariffe.js), spese di procedura ' +
      eur(P.IPOTESI.speseProcedura) + ' e liberazione ' + eur(P.IPOTESI.liberazioneOccupato) + ' se occupato: le stesse ipotesi del punteggio.');
    ipotesi.push('Offerta: il prezzo base se l\'offerta massima consigliata lo permette, altrimenti l\'offerta massima; mai sotto l\'offerta minima (75% del prezzo base, art. 571 c.p.c.).');
    ipotesi.push('Cauzione ' + NOTA_CAUZIONE + ', da versare entro il termine per le offerte; saldo ' + NOTA_SALDO + '.');
    ipotesi.push(prof.mutuo > 0
      ? 'Mutuo: ' + eur(prof.mutuo) + ' indicati da te, solo per immobili e al massimo l\'' + Math.round(M.IPOTESI.ltvMassimo * 100) + '% dell\'offerta: deve essere già deliberato prima dell\'asta.'
      : 'Nessun mutuo: tutto in contanti.');
    ipotesi.push(testoRegola(prof.prudenza));
    if (sim) ipotesi.push('Simulazione: ' + sim.n + ' giri (seme ' + sim.seme + '); a ogni asta offri solo se la cassa libera copre l\'acquisto in caso di vittoria, e per le offerte ancora aperte la cassa resta da parte.');
    if (prof.strategia === 'vivere') ipotesi.push('Vuoi viverci: cerchi una sola casa, quindi dopo una vittoria (o con un\'offerta ancora aperta) non offri più.');
    if (prof.strategia === 'affittare') ipotesi.push('Affitto: quotazioni OMI di locazione della zona (Agenzia delle Entrate – OMI), lorde: senza tasse, spese e mesi sfitti.');

    nonSappiamo.push('Quanti offerenti ci saranno davvero e fino a quanto rilanceranno: il portale non pubblica il prezzo di aggiudicazione.');
    nonSappiamo.push('Lo stato reale del bene: abusi, lavori, vizi e occupazione si leggono solo nella perizia, che lo Stratega non legge.');
    nonSappiamo.push('I tempi veri: termine del saldo, erogazione del mutuo, decreto di trasferimento e liberazione dipendono dal tribunale e dalla banca.');
    if (cand && cand.esclusiBassa) {
      nonSappiamo.push(cand.esclusiBassa === 1 ? '1 asta in linea con le tue scelte è esclusa perché il suo valore stimato è poco affidabile.'
        : cand.esclusiBassa + ' aste in linea con le tue scelte sono escluse perché il loro valore stimato è poco affidabile.');
    }

    if (stat && Array.isArray(stat.avvertenze)) stat.avvertenze.forEach(function (a) { avvertenze.push(a); });
    (cand && cand.note || []).forEach(function (a) { avvertenze.push(a); });
    if (pi && pi.scelte && !pi.scelte.length) avvertenze.push(pi.sintesi && pi.sintesi.testo ? pi.sintesi.testo : 'Nessuna asta adatta: meglio aspettare che forzare un piano.');
    if (sim && sim.offerteSaltate && sim.offerteSaltate.quotaGiri > 0) {
      avvertenze.push('Nel ' + pct(sim.offerteSaltate.quotaGiri) + ' delle simulazioni almeno un\'offerta va saltata perché la cassa è impegnata nelle aste già vinte o ancora aperte.');
    }
    var righe = ipotesi.concat(nonSappiamo, avvertenze, [DISCLAIMER]);
    return { ipotesi: ipotesi, nonSappiamo: nonSappiamo, avvertenze: avvertenze, disclaimer: DISCLAIMER, righe: righe };
  }

  /* Giro completo per il sito: aste (decodificate), input del modulo, { T, stat, oggi, n, seme } */
  function esegui(aste, input, opz) {
    opz = opz || {};
    var prof = profilo(input);
    var cand = candidati(aste, prof, opz);
    var pi = piano(cand, prof);
    var sim = simula(pi, prof, { n: opz.n, seme: opz.seme });
    var ris = { profilo: prof, candidati: cand, piano: pi, simulazione: sim, statistiche: opz.stat || null, T: opz.T };
    ris.spiegazione = spiega(ris);
    return ris;
  }

  var Stratega = {
    PROFILO_BASE: PROFILO_BASE, PARAMETRI: PARAMETRI, RISCHIO_MASSIMO: RISCHIO_MASSIMO, DISCLAIMER: DISCLAIMER, STRATEGIE: STRATEGIE, PRUDENZE: PRUDENZE,
    profilo: profilo, gruppoDi: gruppoDi, fascia: fascia, probabilita: probabilita, candidati: candidati, piano: piano, simula: simula, spiega: spiega,
    esegui: esegui, rischio: rischio, cassaSeVinciTutte: cassaSeVinciTutte, dataCauzione: dataCauzione, mulberry32: mulberry32
  };
  if (NODE) module.exports = Stratega;
  else root.Stratega = Stratega;
})(typeof window !== 'undefined' ? window : globalThis);
