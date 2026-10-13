/* Dati completi di un'asta per la scheda e il confronto.
 *
 * Caricamento veloce, nell'ordine:
 *   1. aste inserite a mano (in questo browser);
 *   2. scheda a pezzi (data/dettagli/XX.js, poche decine di KB, vedi js/dettagli.js): se contiene il record
 *      completo basta lei;
 *   3. solo se serve, l'elenco completo (data/aste.js, qualche MB), unito alla scheda a pezzi;
 *   4. la copia salvata quando l'asta è stata seguita (se non è più nell'elenco).
 *
 * Analisi: valore di mercato, costo totale, offerta massima, punteggio, semafori dei rischi.
 * Usa solo dati dell'avviso: quello che manca resta mancante e viene detto. */
(function (root) {
  'use strict';
  var U = root.UI, C = root.Calcoli, T = root.TARIFFE, P = root.Punteggio, E = root.Estrai, D = root.Dettagli, S = root.Store;
  var K_PEZZI = 'radaraste.pezziAssenti';

  /* ---------- caricamento ---------- */

  var attesaElenco = null;
  function caricaElenco() {
    if (root.ASTE_RACCOLTE) return Promise.resolve(true);
    if (attesaElenco) return attesaElenco;
    attesaElenco = new Promise(function (ok) {
      var s = document.createElement('script');
      s.src = 'data/aste.js'; s.async = true;
      s.onload = function () { ok(!!root.ASTE_RACCOLTE); };
      s.onerror = function () { attesaElenco = null; if (s.parentNode) s.parentNode.removeChild(s); ok(false); };
      document.head.appendChild(s);
    });
    return attesaElenco;
  }

  // Se per questa versione dei dati le schede a pezzi non sono state pubblicate, non si chiedono più
  // (ogni tentativo sarebbe un errore 404 inutile). La versione è la data di aggiornamento del riepilogo.
  // Anche i dati scritti prima delle schede a pezzi non le hanno: il loro riepilogo non ha né "dettagli" né
  // "perRegione" (aggiunto dalla stessa raccolta che scrive i pezzi). Così nessuna richiesta finisce in un 404.
  function versioneDati() { return root.RIEPILOGO && root.RIEPILOGO.aggiornato || null; }
  function pezziAssenti() {
    var R = root.RIEPILOGO, v = versioneDati();
    if (R && R.dettagli === false) return true;
    if (R && !R.dettagli && !R.perRegione) return true;
    if (!v) return false;
    try { return localStorage.getItem(K_PEZZI) === v; } catch (e) { return false; }
  }
  // la raccolta scrive i pezzi solo se l'arricchimento è riuscito (dati.arricchimento non vuoto)
  function ricordaPezziAssenti() {
    var R = root.ASTE_RACCOLTE, v = versioneDati();
    if (!R || !v || R.aggiornato !== v || R.arricchimento) return;
    try { localStorage.setItem(K_PEZZI, v); } catch (e) {}
  }

  function dalPezzo(id) {
    if (!D || pezziAssenti()) return Promise.resolve({ scheda: null, mancante: true });
    return D.carica(id).then(function (s) {
      var g = root.RADAR_DETTAGLI;
      return { scheda: s, mancante: !(g && g[D.chiave(id)]) };
    }, function () { return { scheda: null, mancante: true }; });
  }

  // aste inserite a mano (in questo browser): non serve nessun file
  function manuale(id) { return (S.backup().aste || []).filter(function (a) { return a.id === id; })[0] || null; }

  function unisci(base, scheda, origine) {
    var a = {}, k;
    for (k in base) a[k] = base[k];
    if (scheda) for (k in scheda) if (scheda[k] !== null && scheda[k] !== undefined && scheda[k] !== '') a[k] = scheda[k];
    if (!(a.superficieMq > 0) && a.mq > 0) a.superficieMq = a.mq;
    a._origine = origine;
    return a;
  }

  /* Promise di { a, origine } oppure null se l'asta non esiste.
   * origine: 'manuale' | 'pezzo' (scheda completa) | 'elenco' (data/aste.js + scheda) | 'copia' (copia salvata) */
  function carica(id) {
    if (!id) return Promise.resolve(null);
    var m = manuale(id);
    if (m) return Promise.resolve(unisci(m, null, 'manuale'));
    var seg = S.seguita(id), copia = seg && seg.copia;
    return dalPezzo(id).then(function (p) {
      var s = p.scheda;
      if (s && s.titolo && U.linkSicuro(s.linkAvviso)) return unisci(s, null, 'pezzo');
      return caricaElenco().then(function (ok) {
        if (ok && p.mancante) ricordaPezziAssenti();
        var base = ok ? S.asta(id) : null;
        if (base) return unisci(base, s, 'elenco');
        if (copia) return unisci(copia, s, 'copia');
        return null;
      });
    });
  }

  /* Copia corta da salvare tra le aste seguite (niente testi lunghi né foto). */
  var CORTI = ['valore', 'valoreMin', 'valoreMax', 'fonteValore', 'affidabilita', 'costoTotale', 'sconto', 'offertaMax', 'punteggio', 'punteggioCompleto',
    'superficieMq', 'stima', 'termineOfferte', 'tentativo', 'deserte', 'primoPrezzo', 'ribasso', 'nFoto', 'prezzoPrecedente', 'dataRibasso', 'origine'];
  function copiaBreve(a) {
    var o = { id: a.id };
    S.campi.concat(CORTI).forEach(function (k) { if (k !== 'descrizione' && a[k] !== undefined && a[k] !== null && a[k] !== '') o[k] = a[k]; });
    var ch = chiaviRischi(a);
    if (ch) o.rischi = ch;
    return o;
  }

  // segue l'asta salvando una copia corta (resta visibile anche se l'asta sparisce dall'elenco)
  function segui(a) { return S.segui(a.id, { copia: copiaBreve(a) }); }

  /* ---------- date (ora di Roma) ---------- */

  // istante (ms) di una data e ora di Roma, qualunque sia il fuso del browser
  function scartoRoma(t) {
    try {
      var p = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Rome', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(t));
      var x = {}; p.forEach(function (q) { x[q.type] = +q.value; });
      return Date.UTC(x.year, x.month - 1, x.day, x.hour % 24, x.minute, x.second) - t;
    } catch (e) { return -new Date(t).getTimezoneOffset() * 60000; }
  }
  function istante(data, ora) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{1,2}):(\d{2}))?/.exec(data || '');
    if (!m) return null;
    var o = /^(\d{1,2})[:.](\d{2})/.exec(ora || '');
    var hh = o ? +o[1] : m[4] ? +m[4] : 23, mi = o ? +o[2] : m[5] ? +m[5] : 59;
    var g = Date.UTC(+m[1], +m[2] - 1, +m[3], hh, mi);
    var t = g - scartoRoma(g);
    return g - scartoRoma(t);
  }
  function oraDi(data, ora) {
    var o = /^(\d{1,2})[:.](\d{2})/.exec(ora || '') || /T(\d{1,2}):(\d{2})/.exec(data || '');
    return o ? o[1].padStart(2, '0') + ':' + o[2] : '';
  }

  /* ---------- rischi ---------- */

  var PER_CATEGORIA = {
    immobile: ['occupazione', 'abusi', 'quota', 'superficie', 'vincoli', 'degrado', 'condominio'],
    auto: ['chiavi', 'documenti', 'marcia', 'quota'],
    moto: ['chiavi', 'documenti', 'marcia', 'quota'],
    beni: ['quota']
  };
  // rischi che il punteggio considera (come la raccolta): per gli immobili anche "agricolo"
  var AMMESSI = { immobile: PER_CATEGORIA.immobile.concat('agricolo'), auto: PER_CATEGORIA.auto, moto: PER_CATEGORIA.moto, beni: PER_CATEGORIA.beni };
  var TITOLI = {
    occupazione: 'Occupazione', abusi: 'Abusi o difformità edilizie', quota: 'Quota o nuda proprietà', superficie: 'Diritto di superficie',
    vincoli: 'Vincoli, servitù, edilizia convenzionata', degrado: 'Degrado, grezzo o inagibile', condominio: 'Spese condominiali arretrate',
    agricolo: 'Terreno agricolo o fabbricato rurale', chiavi: 'Chiavi del veicolo', documenti: 'Documenti (libretto, certificato di proprietà)', marcia: 'Marcia e danni'
  };
  var TROVATO = {
    occupazione: 'Il testo parla di occupazione o locazione', abusi: 'Il testo cita abusi, difformità o sanatorie', quota: 'Si vende solo una quota o un diritto parziale',
    superficie: 'Si vende un diritto di superficie (spesso a tempo)', vincoli: 'Il testo cita vincoli, servitù o edilizia convenzionata',
    degrado: 'Il testo parla di immobile al grezzo, inagibile o degradato', condominio: 'Il testo cita spese condominiali non pagate',
    agricolo: 'Terreno agricolo o fabbricato rurale', chiavi: 'Il veicolo risulta senza chiavi', documenti: 'Il veicolo risulta senza documenti',
    marcia: 'Non marciante, incidentato o da rottamare'
  };

  function testoAvviso(a) { return String(a.descrizione || '').trim(); }

  function categoria(a) { return PER_CATEGORIA[a.categoria] ? a.categoria : 'beni'; }

  // rischi trovati: { chiave: { prova, importo } } dalla scheda (con la prova), dall'elenco (solo le chiavi) e dal testo
  function trovati(a, testo) {
    var out = {}, amm = AMMESSI[categoria(a)];
    (Array.isArray(a.rischi) ? a.rischi : []).forEach(function (r) {
      var k = typeof r === 'string' ? r : r && r.chiave;
      if (!k || amm.indexOf(k) < 0) return;
      var x = out[k] || (out[k] = {});
      if (r && r.prova && !x.prova) x.prova = r.prova;
      if (r && r.importo != null) x.importo = r.importo;
    });
    if (testo && E) E.rischi(testo).forEach(function (r) {
      if (amm.indexOf(r.chiave) < 0) return;
      var x = out[r.chiave] || (out[r.chiave] = {});
      if (!x.prova) x.prova = r.prova;
      if (r.importo != null && x.importo == null) x.importo = r.importo;
    });
    return out;
  }

  function chiaviRischi(a) {
    if (!Array.isArray(a.rischi)) return null;
    return a.rischi.map(function (r) { return typeof r === 'string' ? r : r && r.chiave; }).filter(Boolean);
  }

  /* Semafori: verde = cercato nel testo e non trovato, rosso = trovato (con la frase), giallo = dato incerto,
   * grigio = non verificabile (testo dell'avviso non disponibile).
   * Il testo è "controllato" se c'è qui la descrizione oppure se la raccolta l'ha già letto (rischi: [] = nessuno). */
  function semafori(a, testo) {
    var tr = trovati(a, testo), lista = PER_CATEGORIA[categoria(a)].slice();
    var controllato = !!testo || Array.isArray(a.rischi);
    var dove = testo ? 'nel testo dell\'avviso' : 'nel testo dell\'avviso letto dalla raccolta';
    Object.keys(tr).forEach(function (k) { if (lista.indexOf(k) < 0) lista.push(k); });
    return lista.map(function (k) {
      var x = tr[k], s = { chiave: k, titolo: TITOLI[k] || k, prova: x && x.prova || null };
      if (k === 'occupazione' && a.categoria === 'immobile') {
        if (a.stato === 'occupato') { s.colore = 'rosso'; s.testo = 'L\'avviso lo indica come occupato: per liberarlo servono tempo e costi.'; }
        else if (a.stato === 'libero' && x) { s.colore = 'giallo'; s.testo = 'Indicato come libero, ma il testo parla di occupazione o locazione: chiedi al custode.'; }
        else if (a.stato === 'libero') { s.colore = 'verde'; s.testo = 'L\'avviso lo indica come libero.'; }
        else if (x) { s.colore = 'rosso'; s.testo = TROVATO[k] + '.'; }
        else if (controllato) { s.colore = 'giallo'; s.testo = 'Stato non indicato dalla fonte e nessun segnale ' + dove + ': chiedi al custode.'; }
        else { s.colore = 'grigio'; s.testo = 'Stato non indicato e testo dell\'avviso non ancora disponibile.'; }
        return s;
      }
      if (x) {
        s.colore = 'rosso';
        s.testo = TROVATO[k] + (x.importo ? ' (importo indicato: ' + U.eur(x.importo) + ')' : '') + '.';
        if (!x.prova) s.testo += ' La frase esatta è nell\'avviso.';
      } else if (controllato) { s.colore = 'verde'; s.testo = 'Nessun segnale ' + dove + '.'; }
      else { s.colore = 'grigio'; s.testo = 'Non verificabile: il testo dell\'avviso non è ancora disponibile qui.'; }
      return s;
    });
  }

  /* ---------- costi e valore ---------- */

  var IP = (P && P.IPOTESI) || C.IPOTESI_RAPIDE;
  function inputCosto(a, offerta, valoreMercato) {
    if (a.categoria === 'immobile') {
      return { fn: C.costoImmobile, input: { prezzoBase: a.prezzoBase, offerta: offerta, valoreMercato: valoreMercato || 0, regime: IP.regime,
        speseProcedura: IP.speseProcedura, liberazione: a.stato === 'occupato' ? IP.liberazioneOccupato : 0 } };
    }
    return { fn: C.costoVeicolo, input: { tipo: a.categoria === 'auto' || a.categoria === 'moto' ? a.categoria : 'beni', offerta: offerta,
      valoreMercato: valoreMercato || 0, kw: IP.kw, provincia: a.provincia } };
  }
  function costo(a, offerta, valoreMercato) {
    if (!(offerta > 0)) return null;
    var ic = inputCosto(a, offerta, valoreMercato);
    return ic.fn(ic.input, T);
  }
  function offertaMassima(a, valoreMin) {
    if (!(valoreMin > 0)) return null;
    var ic = inputCosto(a, a.prezzoBase || valoreMin, valoreMin);
    return C.offertaMassima(ic.fn, ic.input, T, T.giudizio.scontoObiettivo);
  }

  var FONTI_VALORE = {
    perizia: 'Stima del perito indicata nell\'avviso',
    'primo-prezzo': 'Prezzo base della prima asta, che di norma coincide con la stima del perito',
    'prima-asta': 'È la prima asta: il prezzo base di norma coincide con la stima del perito',
    manuale: 'Valore inserito da te'
  };

  function analizza(a) {
    var r = { a: a, testo: testoAvviso(a) };
    var base = a.prezzoBase > 0 ? a.prezzoBase : null;
    r.prezzoBase = base;
    r.offertaMinima = a.offertaMinima > 0 ? a.offertaMinima : base ? C.offertaMinima(base, T) : null;
    r.mq = a.superficieMq > 0 ? a.superficieMq : a.mq > 0 ? a.mq : null;
    r.euroMq = base && r.mq && a.categoria === 'immobile' ? base / r.mq : null;
    r.semafori = semafori(a, r.testo);
    var verificabili = r.semafori.filter(function (s) { return s.colore !== 'grigio'; });
    r.nRischi = verificabili.length ? r.semafori.filter(function (s) { return s.colore === 'rosso'; }).length : null;
    r.nVerificati = verificabili.length;

    // 1. valori già calcolati dalla raccolta (con il confronto delle perizie della zona): stessi numeri dell'elenco
    var pre = a.punteggio != null && a.parti && typeof a.parti === 'object';
    // 2. altrimenti si calcola qui con js/punteggio.js, sugli stessi dati; i rischi sono quelli della raccolta
    //    (elenco vuoto = testo controllato) e, se la raccolta non li ha, quelli trovati qui nel testo (per prudenza)
    var x = {}, k;
    for (k in a) x[k] = a[k];
    var ch = chiaviRischi(a);
    var dalTesto = r.semafori.filter(function (s) { return s.colore === 'rosso' && s.chiave !== 'occupazione'; }).map(function (s) { return s.chiave; });
    x.rischi = ch ? ch : dalTesto.length ? dalTesto : undefined;
    r.valuta = P && base ? P.valuta(x, { T: T }) : null;
    var vv = r.valuta && r.valuta.valore;

    if (a.valore > 0) {
      r.valore = { centrale: a.valore, min: a.valoreMin || a.valore, max: a.valoreMax || a.valore, fonte: a.fonteValore,
        etichetta: a.valoreEtichetta || (vv && vv.fonte === a.fonteValore && vv.etichetta) || FONTI_VALORE[a.fonteValore] || 'Valore stimato dalla raccolta',
        affidabilita: a.affidabilita || (vv && vv.affidabilita) || null,
        controlli: Array.isArray(a.controlli) ? a.controlli.slice() : vv ? vv.controlli.slice() : [],
        zona: a.zona && typeof a.zona === 'object' ? a.zona : null };
    } else if (vv) {
      r.valore = { centrale: vv.centrale, min: vv.min, max: vv.max, fonte: vv.fonte, etichetta: vv.etichetta,
        affidabilita: vv.affidabilita, controlli: vv.controlli.slice(), zona: vv.zona, senzaZona: true };
    } else if (a.valoreMercato > 0) {
      r.valore = { centrale: a.valoreMercato, min: a.valoreMercato, max: a.valoreMercato, fonte: 'manuale', etichetta: FONTI_VALORE.manuale, affidabilita: null, controlli: [] };
    } else r.valore = null;

    r.costo = base ? costo(a, base, r.valore && r.valore.centrale) : null;
    if (r.valore && r.costo) {
      r.sconto = a.sconto != null && isFinite(a.sconto) ? a.sconto : r.costo.sconto;
      r.giudizio = C.giudizio(r.sconto, T);
      r.offertaMax = a.offertaMax != null && isFinite(a.offertaMax) ? a.offertaMax : vv && r.valuta.offertaMax != null ? r.valuta.offertaMax : offertaMassima(a, r.valore.min);
    } else { r.sconto = null; r.offertaMax = null; }

    if (pre) r.punteggio = { valore: Math.round(a.punteggio), parti: a.parti, completo: a.punteggioCompleto !== false };
    else if (r.valuta && r.valuta.punteggio != null) r.punteggio = { valore: r.valuta.punteggio, parti: r.valuta.parti, completo: r.valuta.completo };
    else if (a.punteggio != null) r.punteggio = { valore: Math.round(a.punteggio), parti: null, completo: a.punteggioCompleto !== false };
    else r.punteggio = null;
    r.mancanti = pre && Array.isArray(a.mancanti) ? a.mancanti.slice() : r.valuta ? r.valuta.mancanti.slice() : base ? [] : ['prezzo base'];
    return r;
  }

  root.Asta = {
    carica: carica, caricaElenco: caricaElenco, analizza: analizza, istante: istante, oraDi: oraDi, costo: costo, segui: segui, copiaBreve: copiaBreve,
    TITOLI_RISCHI: TITOLI, FONTI_VALORE: FONTI_VALORE
  };
})(window);
