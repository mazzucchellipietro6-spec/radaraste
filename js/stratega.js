/* Stratega d'asta: dato il capitale, quali aste puntare, quanto offrire e quando, con una simulazione Monte Carlo.
 *
 * Regola assoluta: nessun dato inventato.
 * - La probabilità che ci siano altri offerenti viene dagli esiti REALI delle vendite passate del Portale delle Vendite
 *   Pubbliche (data/statistiche.js, generato da scripts/lib/statistiche.mjs), sempre con campione e periodo.
 * - La probabilità di vincere quando ci sono altri offerenti è un'ipotesi dell'utente (profilo.concorrenza), detta come tale.
 * - Valore, costi e offerta massima sono quelli del sito (js/punteggio.js, js/calcoli.js, config/tariffe.js), con le stesse ipotesi.
 * - Su più anni (proiezione): affitti dalle quotazioni OMI di locazione della scheda, plusvalenza con le regole di
 *   config/tariffe.js; rivalutazione, costi e sfitto, costi e tempi di vendita, reinvestimento sono ipotesi dell'utente.
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

  // indice del valore mediano, lo stesso che usa percentili (p50)
  function giroMediano(valori) {
    var idx = [];
    for (var i = 0; i < valori.length; i++) idx.push(i);
    idx.sort(function (x, y) { return valori[x] - valori[y] || x - y; });
    return idx[Math.floor(0.5 * (idx.length - 1))];
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
        // il guadagno non si scrive qui: la pagina mostra una cifra sola, la media delle simulazioni (simula), che tiene conto
        // della regola di cassa e di chi cerca una sola casa; la somma diretta (guadagnoAttesoTotale) per "ci vado a vivere"
        // contava anche le case che non servono più (caso reale del 26/10/2026: 72.160 € contro 43.516 € simulati)
        ': vincendole tutte servirebbero ' + eur(cassaTutte) + ' di cassa su ' + eur(prof.capitale) + '.'
      : (lista.length ? 'Nessuna delle ' + lista.length + ' aste candidate entra nel piano con le tue regole.' : 'Nessuna asta candidata') + ': meglio aspettare che forzare un piano.';
    var ordineMotivi = Object.keys(motivi).sort(function (x, y) { return motivi[y] - motivi[x]; });
    return { prudenza: prof.prudenza, scelte: scelte, escluse: escluse.slice(0, 30), motivi: motivi, motiviPrincipali: ordineMotivi.slice(0, 5), sintesi: sintesi };
  }

  /* ---------- simulazione ---------- */

  /* Un giro del piano: offerte ed esiti in ordine di data con la regola di cassa (vedi simula).
   * u: un numero casuale per asta; pv: probabilità di vincere; una: si cerca una sola casa.
   * → { stato [per asta: aperta, vinta, persa, saltata, non-serve], tenuta [{cassa, mutuo}], vinte, usato, guad, picco, sforato, saltate } */
  function giroPiano(scelte, prof, ev, pv, u, una) {
    var libera = prof.capitale, mutuo = prof.mutuo, stato = [], tenuta = [], vinte = 0, usato = 0, guad = 0, impegnato = 0, cauzioni = 0, aperte = 0, picco = 0, sforato = false, saltate = 0;
    for (var j = 0; j < ev.length; j++) {
      var e = ev[j], c = scelte[e.i];
      if (e.tipo === 0) {
        if (una && (vinte > 0 || aperte > 0)) { stato[e.i] = 'non-serve'; continue; }
        var m = quotaMutuo(c, mutuo), serve = c.costoTotale - m;
        if (serve > libera + 0.5) { stato[e.i] = 'saltata'; saltate++; continue; }
        libera -= serve; mutuo -= m; tenuta[e.i] = { cassa: serve, mutuo: m }; stato[e.i] = 'aperta'; aperte++; cauzioni += c.cauzione.importo;
      } else {
        if (stato[e.i] !== 'aperta') continue;
        aperte--; cauzioni -= c.cauzione.importo;
        if (u[e.i] < pv[e.i]) {
          stato[e.i] = 'vinta'; vinte++;
          usato += tenuta[e.i].cassa; impegnato += tenuta[e.i].cassa; guad += c.margine;
        } else { stato[e.i] = 'persa'; libera += tenuta[e.i].cassa; mutuo += tenuta[e.i].mutuo; }
      }
      if (impegnato + cauzioni > picco) picco = impegnato + cauzioni;
      if (impegnato + cauzioni > prof.capitale + 0.5) sforato = true;
    }
    return { stato: stato, tenuta: tenuta, vinte: vinte, usato: usato, guad: guad, picco: picco, sforato: sforato, saltate: saltate };
  }

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
      var r = giroPiano(scelte, prof, ev, pv, u, una);
      for (i = 0; i < k; i++) {
        if (r.stato[i] === 'vinta') vintePer[i]++;
        else if (r.stato[i] === 'saltata') saltatePer[i]++;
        else if (r.stato[i] === 'non-serve') nonServePer[i]++;
      }
      istogramma[r.vinte]++;
      if (r.vinte > 0) almenoUna++;
      capitali.push(r.usato); guadagni.push(r.guad); picchi.push(r.picco);
      if (r.sforato) sforamenti++;
      if (r.saltate) conSaltate++;
      saltateTot += r.saltate;
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

  /* ---------- patrimonio su più anni ---------- */

  // valori predefiniti prudenti (frazioni: 0.38 = 38%): sono ipotesi, non dati, e l'utente le cambia.
  // costiAffitto: le stesse ipotesi del calcolatore "Conviene?" (vedi costiAffittoBase); 0.25 di prima era meno prudente
  var PROIEZIONE_BASE = { anni: 3, rivalutazione: 0, costiAffitto: 0.38, mesiRivendita: 12, costiVendita: 0.04, reinvesti: false, tassoMutuo: null };
  var LIMITI_PROIEZIONE = { anni: [1, 5], rivalutazione: [-0.1, 0.1], costiAffitto: [0, 0.9], mesiRivendita: [1, 60], costiVendita: [0, 0.3], tassoMutuo: [0, 0.2] };
  var MESI_SALDO_SIMILI = 4;   // aste del reinvestimento: saldo dopo circa 120 giorni, come PARAMETRI.giorniSaldo
  var GIORNI_MESE = 30.4375;
  var URL_OMI = 'https://www.agenziaentrate.gov.it/portale/web/guest/schede/fabbricatiterreni/omi/banche-dati/quotazioni-immobiliari';
  var URL_PVP = 'https://pvp.giustizia.it/pvp/';

  function numeroIn(v, base, lim) {
    if (v == null || v === '' || !isFinite(Number(v))) return base;
    return Math.max(lim[0], Math.min(lim[1], Number(v)));
  }
  function siNo(v) { return v === true || v === 1 || v === '1' || v === 'si' || v === 'sì' || v === 'on' || v === 'true'; }
  function mesiTra(da, a) { return (Date.parse(a + 'T12:00:00Z') - Date.parse(da + 'T12:00:00Z')) / 86400000 / GIORNI_MESE; }

  /* Costi e sfitto predefiniti, in quota del canone annuo, con le ipotesi del calcolatore "Conviene?" (js/calcoli.js,
   * config/tariffe.js): cedolare secca sul canone libero per i mesi affittati, mesi sfitti, spese del proprietario.
   * Arrotondati per eccesso al punto percentuale. IMU esclusa (serve la rendita catastale). */
  function costiAffittoBase(T) {
    var A = T && T.affitto;
    if (!A || !A.cedolareLibero || !A.ipotesi) return PROIEZIONE_BASE.costiAffitto;
    var mesi = 12 - num(A.ipotesi.mesiSfitto);
    var resta = mesi / 12 * (1 - num(A.cedolareLibero.aliquota)) - num(A.ipotesi.speseProprietario);
    return Math.ceil(Math.round((1 - resta) * 10000) / 100) / 100;
  }

  /* input: { anni (1–5), rivalutazione, costiAffitto, costiVendita (frazioni), mesiRivendita, reinvesti, tassoMutuo (TAN, frazione, facoltativo) }
   * T (facoltativo): con le tariffe il valore predefinito di costiAffitto viene da costiAffittoBase */
  function opzioniProiezione(input, T) {
    input = input || {};
    var L = LIMITI_PROIEZIONE, B = PROIEZIONE_BASE;
    var tasso = input.tassoMutuo;
    return {
      anni: Math.round(numeroIn(input.anni, B.anni, L.anni)),
      rivalutazione: numeroIn(input.rivalutazione, B.rivalutazione, L.rivalutazione),
      costiAffitto: numeroIn(input.costiAffitto, T ? costiAffittoBase(T) : B.costiAffitto, L.costiAffitto),
      mesiRivendita: Math.round(numeroIn(input.mesiRivendita, B.mesiRivendita, L.mesiRivendita)),
      costiVendita: numeroIn(input.costiVendita, B.costiVendita, L.costiVendita),
      reinvesti: siNo(input.reinvesti),
      tassoMutuo: tasso == null || tasso === '' || !isFinite(Number(tasso)) ? null : numeroIn(tasso, null, L.tassoMutuo)
    };
  }

  /* Vendita: costi di vendita, plusvalenza e imposta (art. 67 TUIR, aliquota e anni da config/tariffe.js).
   * Per prudenza, come il calcolatore "Conviene?" (js/calcoli.js), i costi di vendita non si tolgono dalla plusvalenza:
   * imposta più alta o uguale a quella vera; se il notaio li riconosce come costi inerenti, si paga meno.
   * x: { prezzo, costo (acquisto con imposte e spese), costiVendita (frazione), mesiPossesso, immobile, abitazionePrincipale } */
  function vendita(x, T) {
    var prezzo = num(x.prezzo), costi = prezzo * num(x.costiVendita), mesi = num(x.mesiPossesso);
    var out = { prezzo: prezzo, costi: costi, plusvalenza: prezzo - num(x.costo), imposta: 0, entroCinqueAnni: mesi < T.plusvalenza.anni * 12 };
    // la tassa sulla plusvalenza dell'art. 67 riguarda gli immobili; per veicoli e beni usati di un privato non si applica
    if (x.immobile !== false) {
      var p = C.plusvalenza({ prezzoVendita: prezzo, costoAcquisto: num(x.costo), costiInerenti: 0, anniPossesso: mesi / 12, abitazionePrincipale: !!x.abitazionePrincipale }, T);
      out.imposta = p.imposta;
    }
    out.netto = prezzo - costi - out.imposta;
    return out;
  }

  // canone netto al mese: un valore tra il minimo e il massimo OMI di locazione (annui), meno costi e sfitto
  function canoneNetto(rendita, u, o) { return (rendita.min + u * (rendita.max - rendita.min)) / 12 * (1 - o.costiAffitto); }

  // asta simile per il reinvestimento: le medie delle aste del piano (ipotesi esplicita)
  function astaSimile(scelte, pv, prof) {
    var k = scelte.length, costo = 0, valore = 0, p = 0, rMin = 0, rMax = 0, nr = 0, immobili = 0;
    scelte.forEach(function (c, i) {
      costo += c.costoTotale; valore += c.valore.min; p += pv[i];
      if (c.categoria === 'immobile') immobili++;
      if (c.renditaAnnua) { rMin += c.renditaAnnua.min; rMax += c.renditaAnnua.max; nr++; }
    });
    return { costo: Math.round(costo / k), valore: Math.round(valore / k), probabilita: tre(p / k), immobile: immobili * 2 >= k,
      passo: Math.max(1, Math.round(prof.orizzonteMesi / k)), inizio: prof.orizzonteMesi,
      affitto: prof.strategia === 'affittare' && nr ? { min: Math.round(rMin / nr), max: Math.round(rMax / nr), su: nr } : null };
  }

  /* Patrimonio nel tempo, a fine di ogni anno per 1–5 anni: cassa, valore degli immobili comprati, mutuo da restituire,
   * affitti incassati e imposte sulle plusvalenze, con la forchetta p10–p50–p90 su n simulazioni.
   * Le aste del piano si giocano come in simula (stesso seme e stessa sequenza casuale: stessi esiti giro per giro);
   * canoni e aste del reinvestimento usano un secondo generatore con seme derivato, quindi tutto si ripete identico.
   * La cassa non scende mai sotto zero: si offre solo con la cassa che basta, gli interessi si pagano con la cassa
   * libera (il resto si somma al debito) e alla vendita si estingue prima il mutuo.
   * La rivalutazione (ipotesi dell'utente) vale solo per gli immobili: veicoli e beni restano al valore di oggi.
   * risultato: quello di esegui. opz: opzioniProiezione + { T, n, seme, oggi, semestreOmi (es. '2025/2', per la fonte) } */
  function proiezione(risultato, opz) {
    risultato = risultato || {};
    opz = opz || {};
    var T = opz.T || risultato.T;
    if (!T) throw new Error('Servono le tariffe (config/tariffe.js)');
    var o = opzioniProiezione(opz, T);
    var prof = normale(risultato.profilo || {}), sim = risultato.simulazione || {};
    var scelte = (risultato.piano && risultato.piano.scelte) || [], k = scelte.length;
    var n = Math.max(1, Math.round(opz.n || sim.n || PARAMETRI.simulazioni));
    var seme = opz.seme != null ? opz.seme : sim.seme != null ? sim.seme : PARAMETRI.seme;
    var oggi = opz.oggi || (risultato.candidati && risultato.candidati.oggi) || oggiIso();
    var A = o.anni, M = A * 12, r = o.rivalutazione, strategia = prof.strategia, una = strategia === 'vivere';
    var pv = scelte.map(function (c) { return probUsata(c, 'centrale'); }), ev = eventi(scelte);
    var tempi = scelte.map(function (c) {
      return { asta: Math.max(0, mesiTra(oggi, c.dataAsta)), saldo: Math.max(0, mesiTra(oggi, c.dataSaldo.data)),
        affitto: strategia === 'affittare' && c.categoria === 'immobile' && c.renditaAnnua ? c.renditaAnnua : null };
    });
    var simile = o.reinvesti && !una && k ? astaSimile(scelte, pv, prof) : null;
    var rnd = mulberry32(seme), rnd2 = mulberry32((seme ^ 0x5bd1e995) >>> 0);
    // rivalutazione dopo `mesi` mesi da oggi: solo per gli immobili
    function crescita(immobile, mesi) { return immobile ? Math.pow(1 + r, mesi / 12) : 1; }
    var anni = [], y, i;
    for (y = 0; y <= A; y++) anni.push({ patrimonio: [], cassa: [], immobili: [], debito: [], affitti: [], imposte: [], posseduti: 0 });
    var cassaMinima = Infinity, venditeTot = 0, conVendite = 0, conImposta = 0, impostaTot = 0, reinvTot = 0, reinvGiri = 0;

    for (var g = 0; g < n; g++) {
      var u = [];
      for (i = 0; i < k; i++) u.push(rnd());
      var gp = giroPiano(scelte, prof, ev, pv, u, una), beni = [];
      for (i = 0; i < k; i++) {
        if (gp.stato[i] !== 'vinta') continue;
        var c = scelte[i], t = tempi[i];
        beni.push({ valore: c.valore.min, costo: c.costoTotale, cassa: gp.tenuta[i].cassa, mutuo: gp.tenuta[i].mutuo, piano: true, comprato: false, venduto: false,
          immobile: c.categoria === 'immobile', compra: t.asta, saldo: t.saldo, vende: strategia === 'rivendere' ? t.saldo + o.mesiRivendita : Infinity,
          canone: t.affitto ? canoneNetto(t.affitto, rnd2(), o) : 0 });
      }
      var cassa = prof.capitale, debito = 0, investito = 0, riservata = gp.usato, affitti = 0, imposte = 0, vendute = 0, conTassa = false, reinv = 0;
      anni[0].patrimonio.push(cassa); anni[0].cassa.push(cassa); anni[0].immobili.push(0); anni[0].debito.push(0); anni[0].affitti.push(0); anni[0].imposte.push(0);
      for (var m = 1; m <= M; m++) {
        var b, j;
        // aste del piano vinte: la cassa esce il giorno dell'asta, il mutuo diventa debito
        for (j = 0; j < beni.length; j++) {
          b = beni[j];
          if (!b.comprato && b.compra <= m) { b.comprato = true; cassa -= b.cassa; riservata -= b.cassa; investito += b.cassa; debito += b.mutuo; }
        }
        // interessi del mutuo (solo con il tasso indicato): con la cassa libera, il resto si somma al debito
        if (o.tassoMutuo && debito > 0) {
          var interessi = debito * o.tassoMutuo / 12, pagati = Math.min(interessi, Math.max(0, cassa - riservata));
          cassa -= pagati; debito += interessi - pagati;
        }
        // affitti: ogni mese intero dopo il saldo
        for (j = 0; j < beni.length; j++) {
          b = beni[j];
          if (b.comprato && !b.venduto && b.canone > 0 && b.saldo <= m - 1) { cassa += b.canone; affitti += b.canone; }
        }
        // vendite: prezzo rivalutato (se l'ipotesi c'è), costi di vendita, plusvalenza; con il ricavato si estingue prima il mutuo
        for (j = 0; j < beni.length; j++) {
          b = beni[j];
          if (!b.comprato || b.venduto || b.vende > m) continue;
          var v = vendita({ prezzo: b.valore * crescita(b.immobile, b.vende), costo: b.costo, costiVendita: o.costiVendita, mesiPossesso: b.vende - b.saldo, immobile: b.immobile }, T);
          var rimborso = Math.min(debito, Math.max(0, v.netto));
          cassa += v.netto - rimborso; debito -= rimborso; b.venduto = true; vendute++;
          if (b.piano) investito -= b.cassa;
          if (v.imposta > 0) { imposte += v.imposta; conTassa = true; }
        }
        // reinvestimento: dopo la fine del piano, al ritmo del piano, solo con i guadagni già incassati
        if (simile && m > simile.inizio && (m - simile.inizio) % simile.passo === 0) {
          var costoSimile = simile.costo * crescita(simile.immobile, m);
          // guadagni incassati = cassa − capitale + cassa ancora dentro gli immobili del piano; spenderli non tocca la cassa tenuta per il piano
          var guadagni = cassa - prof.capitale + investito;
          if (guadagni >= costoSimile && rnd2() < simile.probabilita) {
            cassa -= costoSimile; reinv++;
            beni.push({ valore: simile.valore, costo: costoSimile, cassa: costoSimile, mutuo: 0, piano: false, comprato: true, venduto: false, immobile: simile.immobile,
              compra: m, saldo: m + MESI_SALDO_SIMILI, vende: strategia === 'rivendere' ? m + MESI_SALDO_SIMILI + o.mesiRivendita : Infinity,
              canone: simile.affitto ? canoneNetto(simile.affitto, rnd2(), o) : 0 });
          }
        }
        if (cassa < cassaMinima) cassaMinima = cassa;
        if (m % 12 === 0) {
          y = m / 12;
          var valore = 0, posseduti = 0;
          for (j = 0; j < beni.length; j++) {
            b = beni[j];
            if (b.comprato && !b.venduto) { valore += b.valore * crescita(b.immobile, m); posseduti++; }
          }
          anni[y].patrimonio.push(cassa + valore - debito); anni[y].cassa.push(cassa); anni[y].immobili.push(valore); anni[y].debito.push(debito);
          anni[y].affitti.push(affitti); anni[y].imposte.push(imposte); anni[y].posseduti += posseduti;
        }
      }
      venditeTot += vendute; impostaTot += imposte; reinvTot += reinv;
      if (vendute) conVendite++;
      if (conTassa) conImposta++;
      if (reinv) reinvGiri++;
    }

    var serie = anni.map(function (x, a) {
      var s = { anno: a, data: piuMesi(oggi, a * 12), patrimonio: percentili(x.patrimonio), cassa: percentili(x.cassa), immobili: percentili(x.immobili),
        debito: percentili(x.debito), affitti: percentili(x.affitti), imposte: percentili(x.imposte), posseduti: tre(x.posseduti / n) };
      // la simulazione del patrimonio mediano, voce per voce: cassa + immobili − mutuo = mediana (le mediane delle singole voci non si sommano)
      var gm = giroMediano(x.patrimonio), im = Math.round(x.immobili[gm]), de = Math.round(x.debito[gm]);
      s.mediana = { cassa: s.patrimonio.p50 - im + de, immobili: im, debito: de, affitti: Math.round(x.affitti[gm]), imposte: Math.round(x.imposte[gm]) };
      return s;
    });
    var out = {
      opzioni: o, anni: A, n: n, seme: seme, oggi: oggi, strategia: strategia, capitale: prof.capitale, aste: k,
      serie: serie, finale: serie[A],
      vendite: { media: tre(venditeTot / n), quotaGiri: tre(conVendite / n), quotaConImposta: tre(conImposta / n), impostaMedia: Math.round(impostaTot / n) },
      reinvestimento: simile ? { simile: simile, media: tre(reinvTot / n), quotaGiri: tre(reinvGiri / n) } : null,
      affitto: strategia === 'affittare' ? { conQuotazione: tempi.filter(function (t) { return t.affitto; }).length, senzaQuotazione: tempi.filter(function (t) { return !t.affitto; }).length,
        occupati: scelte.filter(function (c, x) { return tempi[x].affitto && c.stato === 'occupato'; }).length } : null,
      mutuo: scelte.some(function (c) { return c.mutuoUsato > 0; }),
      cassaMinima: k ? Math.round(cassaMinima) : prof.capitale,
      costiAffittoBase: costiAffittoBase(T), semestreOmi: opz.semestreOmi ? String(opz.semestreOmi) : null
    };
    var sp = spiegaProiezione(out, { prof: prof, scelte: scelte, T: T, stat: risultato.statistiche || null });
    out.ipotesi = sp.ipotesi; out.nonSappiamo = sp.nonSappiamo; out.avvertenze = sp.avvertenze; out.fonti = sp.fonti; out.disclaimer = DISCLAIMER;
    return out;
  }

  // ipotesi, fonti e avvertenze della proiezione, in italiano per il sito
  function spiegaProiezione(p, x) {
    var o = p.opzioni, T = x.T, prof = x.prof, s = x.scelte, ipotesi = [], nonSappiamo = [], avvertenze = [], fonti = [];
    var PV = T.plusvalenza, AF = T.affitto, RV = T.rivendita;
    var semestre = p.semestreOmi ? ', semestre ' + p.semestreOmi : ' (semestre non indicato nei dati)';
    ipotesi.push('Patrimonio = cassa + valore degli immobili comprati − mutuo ancora da restituire, alla fine di ogni anno da oggi (' + dataIt(p.oggi) + '). ' +
      'Gli immobili non ancora venduti contano per il valore stimato, senza togliere costi di vendita e imposte' + (p.strategia === 'rivendere' ? ': quando un immobile si vende il patrimonio può scendere un po\'.' : '.'));
    ipotesi.push(o.rivalutazione
      ? 'Valore degli immobili: il minimo della forchetta stimata per ogni asta, con ' + (o.rivalutazione > 0 ? 'una rivalutazione del ' + pct(o.rivalutazione) : 'un calo dei prezzi del ' + pct(-o.rivalutazione)) +
        ' l\'anno. È un\'ipotesi tua, non una previsione.'
      : 'Valore degli immobili: il minimo della forchetta stimata per ogni asta (perizia, prima asta o quotazioni OMI), senza rivalutazione: i prezzi restano quelli di oggi.');
    ipotesi.push('Le aste del piano si giocano come nella simulazione del piano (stesse probabilità, stessa regola di cassa, stesso seme): la cassa esce il giorno dell\'asta e l\'immobile è tuo dal saldo (' + NOTA_SALDO + ').');
    if (p.strategia === 'affittare') {
      ipotesi.push('Affitto: canone dalle quotazioni OMI di locazione della zona (Agenzia delle Entrate – OMI' + semestre + '). In ogni simulazione un canone tra il minimo e il massimo della quotazione, tutti ugualmente probabili, incassato dal primo mese intero dopo il saldo e senza aumenti negli anni.');
      ipotesi.push('Costi e sfitto: ' + pct(o.costiAffitto) + ' del canone tra tasse, spese e mesi senza inquilino. È un\'ipotesi tua. Il valore proposto, ' + pct(p.costiAffittoBase) +
        ', somma le ipotesi del calcolatore «Conviene?»: cedolare secca del ' + pct(AF.cedolareLibero.aliquota) + ' sul canone libero (' + pct(AF.cedolareConcordato.aliquota) + ' con il canone concordato; ' + AF.cedolareLibero.fonte + '), ' +
        AF.ipotesi.mesiSfitto + (AF.ipotesi.mesiSfitto === 1 ? ' mese' : ' mesi') + ' senza inquilino all\'anno e spese del proprietario pari al ' + pct(AF.ipotesi.speseProprietario) + ' del canone. IMU e lavori straordinari si aggiungono.');
      fonti.push({ nome: 'Agenzia delle Entrate – Quotazioni OMI di locazione' + semestre + ', licenza CC BY 4.0', url: URL_OMI, uso: 'canoni d\'affitto' });
      fonti.push({ nome: AF.cedolareLibero.fonte, url: AF.cedolareLibero.url, uso: 'aliquote della cedolare secca' });
    }
    if (p.strategia === 'rivendere') {
      ipotesi.push('Rivendita ' + o.mesiRivendita + ' mesi dopo il saldo, al valore minimo' + (o.rivalutazione ? ' aggiornato con la variazione dei prezzi' : '') + '. Costi di vendita: ' + pct(o.costiVendita) +
        ' del prezzo tra provvigione dell\'agenzia e spese a carico di chi vende. È un\'ipotesi: per confronto, una provvigione del ' + pct(RV.provvigioneAgenzia) + ' più IVA (prassi diffusa, non una tariffa) vale il ' +
        pct(RV.provvigioneAgenzia * (1 + RV.ivaProvvigione)) + ' del prezzo.');
      ipotesi.push('Plusvalenza: se rivendi entro ' + PV.anni + ' anni dall\'acquisto, la differenza tra prezzo di vendita e costo d\'acquisto con imposte e spese è tassata. ' +
        'Per prudenza non tolgo i costi di vendita, come il calcolatore «Conviene?»: se il notaio li riconosce come costi inerenti, l\'imposta è più bassa. Ipotizzo che tu chieda al notaio l\'imposta sostitutiva del ' +
        pct(PV.aliquotaSostitutiva) + ', che è facoltativa: in alternativa la plusvalenza va nell\'IRPEF con la tua aliquota. Non si paga se l\'immobile è stato la tua abitazione principale per la maggior parte del periodo (' + PV.fonte + ').');
      fonti.push({ nome: PV.fonte + ' – Agenzia delle Entrate, vendita della casa', url: PV.url, uso: 'imposta sulla plusvalenza' });
    }
    if (p.strategia === 'vivere') ipotesi.push('Ci vai a vivere: la casa resta tua per tutto il periodo. Non conto l\'affitto che non paghi più né le spese della casa.');
    if (p.mutuo) {
      ipotesi.push((o.tassoMutuo != null
        ? 'Mutuo: interessi al TAN del ' + pct(o.tassoMutuo) + ' indicato da te, dal giorno dell\'asta, pagati con la cassa libera (se non basta si sommano al debito); il capitale da restituire è tolto dal patrimonio e alla vendita si estingue per primo.'
        : 'Mutuo: il debito è tolto dal patrimonio per intero; gli interessi non sono contati perché non hai indicato il tasso.') +
        ' Le rate del capitale non sono simulate: spostano soldi dalla cassa al debito senza cambiare il patrimonio, ma la tua cassa vera sarà più bassa.');
      if (o.tassoMutuo == null) avvertenze.push('Indica il tasso del mutuo per contare gli interessi: senza, il patrimonio risulta più alto del vero.');
    }
    ipotesi.push('Cassa: la liquidità non rende interessi; gli importi sono in euro di oggi, senza inflazione.');
    var R = p.reinvestimento;
    if (R) {
      ipotesi.push('Reinvesti: dopo la fine del piano, ogni ' + R.simile.passo + (R.simile.passo === 1 ? ' mese' : ' mesi') + ' (il ritmo del piano: ' + p.aste + (p.aste === 1 ? ' asta' : ' aste') + ' in ' + prof.orizzonteMesi +
        ' mesi) offri a una nuova asta simile se i guadagni già incassati bastano a pagarla, senza mutuo. Ipotesi: costa ' + eur(R.simile.costo) + ', vale ' + eur(R.simile.valore) +
        ' e la vinci con probabilità ' + pct(R.simile.probabilita) + ', cioè le medie delle aste del piano' + (o.rivalutazione && R.simile.immobile ? ', con costo e valore rivalutati' : '') +
        (R.simile.affitto ? '; canone OMI medio delle ' + R.simile.affitto.su + ' aste del piano che lo hanno' : '') + '. Non è detto che aste simili ci siano davvero.');
      if (!R.quotaGiri) avvertenze.push('In ' + p.anni + (p.anni === 1 ? ' anno' : ' anni') + ' i guadagni incassati non bastano mai per un\'altra asta simile: il reinvestimento non scatta.');
    } else if (o.reinvesti && p.strategia === 'vivere') ipotesi.push('Reinvestimento non applicato: chi ci va a vivere cerca una sola casa.');
    else ipotesi.push('Nessun reinvestimento: i guadagni restano in cassa.');
    ipotesi.push('Forchetta: ' + p.n + ' simulazioni (seme ' + p.seme + '), con la probabilità centrale di ogni asta. La fascia va dal 10° al 90° percentile del patrimonio, la linea è la mediana: metà delle simulazioni sta sopra, metà sotto.');
    if (x.stat && x.stat.fonte) {
      var rec = x.stat.recenti && x.stat.recenti.totale && x.stat.recenti.totale.p != null && x.stat.recenti.periodo;
      fonti.unshift({ nome: x.stat.fonte + (rec ? ' (per le probabilità le ultime settimane, dal ' + dataIt(rec.dal) + ' al ' + dataIt(rec.al) + ')' : ''), url: URL_PVP, uso: 'probabilità di vincere' });
    } else if (p.aste) avvertenze.push('Statistiche sugli esiti passati del Portale non disponibili: le probabilità di vincere sono il caso peggiore per te (sempre altri offerenti).');

    nonSappiamo.push('Come cambieranno prezzi e canoni: lo decidi tu con la rivalutazione, qui non c\'è nessuna previsione.');
    nonSappiamo.push('I tempi veri di decreto di trasferimento, liberazione, affitto e vendita: dipendono dal tribunale e dal mercato.');
    nonSappiamo.push('IMU, condominio, manutenzione e lavori durante il possesso' + (p.strategia === 'affittare' ? ', oltre a quelli compresi nella percentuale di costi e sfitto' : '') + ': non sono contati.');

    if (!p.aste) avvertenze.push('Nessuna asta nel piano: il patrimonio resta il capitale in cassa.');
    if (p.affitto && p.aste && !p.affitto.conQuotazione) avvertenze.push('Per nessuna asta del piano c\'è la quotazione OMI di locazione: non stimo nessun affitto e il patrimonio conta solo cassa e immobili.');
    else if (p.affitto && p.affitto.senzaQuotazione) {
      avvertenze.push(p.affitto.senzaQuotazione === 1 ? 'Per 1 asta del piano manca la quotazione OMI di locazione: per quella non conto nessun affitto.'
        : 'Per ' + p.affitto.senzaQuotazione + ' aste del piano manca la quotazione OMI di locazione: per quelle non conto nessun affitto.');
    }
    if (p.affitto && p.affitto.occupati) {
      avvertenze.push((p.affitto.occupati === 1 ? '1 immobile del piano è occupato' : p.affitto.occupati + ' immobili del piano sono occupati') +
        ': se va liberato, l\'affitto parte solo dopo la liberazione, che può richiedere mesi. Qui parte dal saldo come per gli altri, quindi gli affitti possono essere contati per eccesso.');
    }
    if (p.strategia === 'rivendere' && p.aste && !p.vendite.quotaGiri) avvertenze.push('Con ' + o.mesiRivendita + ' mesi alla rivendita nessun immobile è ancora venduto alla fine del periodo: conta il valore stimato, non un incasso.');
    if (s.some(function (c) { return c.categoria !== 'immobile'; })) avvertenze.push('Veicoli e beni perdono valore con il tempo: qui il loro valore resta quello di oggi, anche con la rivalutazione (che vale solo per gli immobili).');
    return { ipotesi: ipotesi, nonSappiamo: nonSappiamo, avvertenze: avvertenze, fonti: fonti };
  }

  /* ---------- dati del grafico "Il patrimonio nel tempo" ---------- */

  // euro in forma breve per assi ed etichette strette: 950, 12,5 mila, 250 mila, 1,25 mln
  function eurBreve(v) {
    var a = Math.abs(v), s = v < 0 ? '−' : '', t;
    if (a >= 999500) t = String(Math.round(a / 1e4) / 100).replace('.', ',') + ' mln';
    else if (a >= 99950) t = Math.round(a / 1e3) + ' mila';
    else if (a >= 1000) t = String(Math.round(a / 100) / 10).replace('.', ',') + ' mila';
    else t = String(Math.round(a));
    return s + t;
  }
  // passo "tondo" delle tacche (1, 2, 2,5 o 5 per una potenza di 10)
  function passoTacche(ampiezza, quante) {
    var grezzo = ampiezza / Math.max(1, quante), p = Math.pow(10, Math.floor(Math.log(grezzo) / Math.LN10 + 1e-9)), f = grezzo / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }

  /* Geometria del grafico del patrimonio, senza DOM (la pagina disegna l'SVG). Una sola scala in euro, da zero
   * (o dal valore più basso, se negativo) a un valore tondo sopra il caso alto; asse degli anni da oggi.
   * p: risultato di proiezione. opz: { larghezza, altezza } in pixel; sotto 520 px la forma è compatta (telefono).
   * → { vuoto, riassunto (testo alternativo), larghezza, altezza, compatto, piano {x0,x1,y0,y1}, scala {min,max,passo,tacche},
   *     punti [per anno: x, y10, y50, y90, p10, p50, p90, mediana {cassa, immobili, debito, affitti, imposte}, zona {x, larghezza}],
   *     area (fascia p10–p90), linea (p50), asseX, nomeAsse, etichette (valori finali, senza sovrapporsi) } */
  function datiGrafico(p, opz) {
    opz = opz || {};
    var serie = (p && p.serie) || [];
    var W = Math.max(280, Math.round(num(opz.larghezza) || 640)), compatto = W < 520;
    var H = Math.max(200, Math.round(num(opz.altezza) || (compatto ? 250 : 300)));
    if (!p || !p.aste || serie.length < 2) {
      return { vuoto: true, larghezza: W, altezza: H, compatto: compatto,
        riassunto: p && !p.aste ? 'Nessuna asta nel piano: il patrimonio resta il capitale in cassa' + (p.capitale ? ', ' + eur(p.capitale) : '') + '.' : 'Dati della proiezione non disponibili.' };
    }
    var A = serie.length - 1, i, y0 = 14, y1 = H - 30;
    var lo = 0, hi = 0;
    serie.forEach(function (s) { lo = Math.min(lo, s.patrimonio.p10); hi = Math.max(hi, s.patrimonio.p90); });
    if (!(hi > lo)) hi = lo + 1;
    var passo = passoTacche(hi - lo, compatto ? 3 : 4);
    var vMin = Math.floor(lo / passo) * passo, vMax = Math.ceil(hi / passo) * passo;
    function Y(v) { return y1 - (v - vMin) / (vMax - vMin) * (y1 - y0); }
    function r1(v) { return Math.round(v * 10) / 10; }
    var tacche = [], quante = Math.round((vMax - vMin) / passo);
    for (i = 0; i <= quante; i++) { var tv = vMin + i * passo; tacche.push({ valore: tv, y: r1(Y(tv)), testo: tv === 0 ? '0' : eurBreve(tv) }); }
    tacche[quante].testo += ' €';   // l'unità sulla tacca più alta

    // etichette dirette sui valori finali: dall'alto caso alto, mediana, caso basso; valori uguali in un'etichetta sola.
    // Il nome va sotto il valore, su una o due righe (così entra anche su telefono)
    var f = serie[A].patrimonio, fine = [];
    if (f.p90 === f.p10) fine.push({ chiave: 'p50', righe: ['tutte le', 'simulazioni'] });
    else {
      if (f.p90 !== f.p50) fine.push({ chiave: 'p90', righe: ['caso alto'] });
      fine.push({ chiave: 'p50', righe: f.p90 === f.p50 ? ['mediana e', 'caso alto'] : f.p10 === f.p50 ? ['mediana e', 'caso basso'] : ['mediana'] });
      if (f.p10 !== f.p50) fine.push({ chiave: 'p10', righe: ['caso basso'] });
    }
    fine.forEach(function (e) { e.nome = e.righe.join(' '); e.valore = f[e.chiave]; e.testo = compatto ? eurBreve(e.valore) + ' €' : eur(e.valore); });

    // margini dalla larghezza stimata dei testi (Inter: circa 5,7 px a carattere a 11 px, 6,6 px in grassetto a 12 px)
    var lungTacca = 0, lungEtich = 0;
    tacche.forEach(function (t) { lungTacca = Math.max(lungTacca, t.testo.length * 5.7); });
    fine.forEach(function (e) { lungEtich = Math.max(lungEtich, e.testo.length * 6.6); e.righe.forEach(function (r) { lungEtich = Math.max(lungEtich, r.length * 5.7); }); });
    var m = { alto: y0, basso: H - y1, sinistra: Math.max(30, Math.ceil(lungTacca + 12)), destra: Math.max(compatto ? 64 : 96, Math.ceil(lungEtich + 18)) };
    var x0 = m.sinistra, x1 = W - m.destra;
    function X(k) { return x0 + k * (x1 - x0) / A; }

    var punti = serie.map(function (s, k) {
      var P = s.patrimonio;
      return { anno: s.anno, data: s.data, quando: dataIt(s.data), etichetta: s.anno === 0 ? 'Oggi' : 'Dopo ' + (s.anno === 1 ? '1 anno' : s.anno + ' anni'),
        x: r1(X(k)), y10: r1(Y(P.p10)), y50: r1(Y(P.p50)), y90: r1(Y(P.p90)), p10: P.p10, p50: P.p50, p90: P.p90,
        mediana: s.mediana || null, affitti: s.affitti || null, imposte: s.imposte || null, posseduti: s.posseduti };
    });
    // zone sensibili al mouse e al tocco: da metà strada con l'anno prima a metà strada con l'anno dopo
    punti.forEach(function (q, k) {
      var a = k ? (punti[k - 1].x + q.x) / 2 : x0 - 12, b = k < A ? (q.x + punti[k + 1].x) / 2 : x1 + 12;
      q.zona = { x: r1(a), larghezza: r1(b - a) };
    });
    var linea = punti.map(function (q, k) { return (k ? 'L' : 'M') + q.x + ' ' + q.y50; }).join('');
    var area = punti.map(function (q, k) { return (k ? 'L' : 'M') + q.x + ' ' + q.y90; }).join('') +
      punti.slice().reverse().map(function (q) { return 'L' + q.x + ' ' + q.y10; }).join('') + 'Z';
    var asseX = punti.map(function (q) { return { x: q.x, testo: q.anno === 0 ? 'oggi' : compatto ? String(q.anno) : (q.anno === 1 ? '1 anno' : q.anno + ' anni') }; });

    // posizione verticale (c = centro del valore): si allontanano quanto serve, restando dentro il riquadro.
    // Spazio di un'etichetta: 17 px per il valore + 13 px per ogni riga del nome
    function spazio(e) { return 17 + 13 * e.righe.length; }
    var n = fine.length, cMin = 10, cMax = H - 8 - 13 * fine[n - 1].righe.length;
    fine.forEach(function (e) { e.y = r1(Y(e.valore)); e.c = Math.max(cMin, Math.min(cMax, e.y)); });
    for (i = 1; i < n; i++) fine[i].c = Math.max(fine[i].c, fine[i - 1].c + spazio(fine[i - 1]));
    if (fine[n - 1].c > cMax) { fine[n - 1].c = cMax; for (i = n - 2; i >= 0; i--) fine[i].c = Math.min(fine[i].c, fine[i + 1].c - spazio(fine[i])); }
    fine.forEach(function (e) { e.c = r1(e.c); e.guida = Math.abs(e.c - e.y) > 3; });

    var anniTxt = A === 1 ? '1 anno' : A + ' anni';
    var riassunto = 'Patrimonio stimato ' + (A === 1 ? 'nel prossimo anno' : 'nei prossimi ' + anniTxt) + ', in ' + p.n + ' simulazioni. Oggi: ' + eur(punti[0].p50) + '. Dopo ' + anniTxt + ': mediana ' + eur(f.p50) +
      (f.p10 === f.p90 ? ', uguale in tutte le simulazioni' : '; caso basso ' + eur(f.p10) + ', caso alto ' + eur(f.p90) + ' (8 simulazioni su 10 stanno tra i due)') +
      '. Mediana a fine anno: ' + punti.slice(1).map(function (q) { return q.anno + '° ' + eur(q.p50); }).join(', ') + '.';
    return { vuoto: false, larghezza: W, altezza: H, compatto: compatto, margini: m, piano: { x0: x0, x1: x1, y0: y0, y1: y1 },
      scala: { min: vMin, max: vMax, passo: passo, tacche: tacche }, punti: punti, linea: linea, area: area, asseX: asseX, nomeAsse: compatto ? 'anni' : null,
      etichette: fine, riassunto: riassunto };
  }
  // anno più vicino a una x del grafico (mouse, tocco): indice in dati.punti
  function puntoVicino(dati, x) {
    var pt = (dati && dati.punti) || [], best = -1, d = Infinity;
    for (var i = 0; i < pt.length; i++) { var di = Math.abs(pt[i].x - x); if (di < d) { d = di; best = i; } }
    return best;
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
    PROIEZIONE_BASE: PROIEZIONE_BASE, LIMITI_PROIEZIONE: LIMITI_PROIEZIONE,
    profilo: profilo, gruppoDi: gruppoDi, fascia: fascia, probabilita: probabilita, candidati: candidati, piano: piano, simula: simula, spiega: spiega,
    esegui: esegui, rischio: rischio, cassaSeVinciTutte: cassaSeVinciTutte, dataCauzione: dataCauzione, mulberry32: mulberry32,
    opzioniProiezione: opzioniProiezione, proiezione: proiezione, vendita: vendita, costiAffittoBase: costiAffittoBase,
    datiGrafico: datiGrafico, puntoVicino: puntoVicino, eurBreve: eurBreve
  };
  if (NODE) module.exports = Stratega;
  else root.Stratega = Stratega;
})(typeof window !== 'undefined' ? window : globalThis);
