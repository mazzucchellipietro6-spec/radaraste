/* Valore di mercato, costo totale, sconto e punteggio affare (0–100) di un'asta.
 * Usa solo dati reali dell'avviso: se il valore non si può stimare, niente punteggio
 * (il sito lo dice). Ogni numero porta con sé la fonte e l'affidabilità.
 * Usato dalla raccolta (Node, per calcolarlo una volta al giorno) e dal sito. */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  var C = NODE ? require('./calcoli.js') : root.Calcoli;

  // Pesi del punteggio (somma 100). La zona vale poco finché non ci sono dati di mercato (OMI).
  var PESI = { sconto: 40, tentativo: 12, occupazione: 13, rischi: 20, zona: 15 };
  var NEUTRO = { occupazione: 6, rischi: 10, zona: 7, nonImmobile: 8 };
  // punti tolti per ogni rischio trovato nel testo dell'avviso (chiavi di js/estrai.js)
  var PENALITA = { quota: 20, superficie: 14, abusi: 10, chiavi: 10, documenti: 10, marcia: 7, degrado: 6, condominio: 6, vincoli: 4, occupazione: 4, agricolo: 2 };
  var IPOTESI = { regime: 'seconda-privato', speseProcedura: 1500, liberazioneOccupato: 3000, kw: 70 };
  var FORCHETTA = { perizia: 0.10, 'primo-prezzo': 0.15, 'prima-asta': 0.15 };  // per l'OMI la forchetta è quella della quotazione (min–max)
  var ETICHETTE = {
    perizia: 'Stima del perito indicata nell\'avviso (PVP)',
    'primo-prezzo': 'Prezzo base della prima asta, che di norma coincide con la stima del perito',
    'prima-asta': 'È la prima asta: il prezzo base di norma coincide con la stima del perito',
    omi: 'Quotazioni OMI della zona (Agenzia delle Entrate – OMI) per la superficie indicata',
    'omi-comune': 'Quotazioni OMI tipiche del comune (zona OMI non riconosciuta dall\'indirizzo) per la superficie indicata'
  };
  var LIVELLI = ['bassa', 'media', 'alta'];
  var TETTO_INCERTO = 54;   // punteggio massimo quando il valore di mercato ha affidabilità bassa (fascia "Da valutare")

  function num(x) { var n = Number(x); return isFinite(n) ? n : 0; }
  function abbassa(liv) { return LIVELLI[Math.max(0, LIVELLI.indexOf(liv) - 1)]; }
  function residenziale(a) { return a.categoria === 'immobile' && /residenzial/i.test(a.tipo || ''); }
  function mediana(v) { var s = v.slice().sort(function (x, y) { return x - y; }); var m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

  /* Valori €/mq delle perizie per comune e provincia (solo immobili residenziali con stima e mq):
   * servono a capire se una stima è fuori scala rispetto alla zona. */
  function indiceZone(aste) {
    var com = {}, prov = {};
    aste.forEach(function (a) {
      if (!residenziale(a) || !(num(a.stima) > 0) || !(num(a.superficieMq) >= 20)) return;
      var v = a.stima / a.superficieMq;
      if (v < 50 || v > 30000) return; // valori impossibili: non entrano nel confronto
      if (a.comune) (com[a.comune + '|' + (a.provincia || '')] = com[a.comune + '|' + (a.provincia || '')] || []).push(v);
      if (a.provincia) (prov[a.provincia] = prov[a.provincia] || []).push(v);
    });
    function riduci(o) { var r = {}; for (var k in o) r[k] = { mediana: Math.round(mediana(o[k])), n: o[k].length }; return r; }
    return { comune: riduci(com), provincia: riduci(prov) };
  }

  function zonaDi(a, zone) {
    if (!zone) return null;
    var c = zone.comune[a.comune + '|' + (a.provincia || '')];
    if (c && c.n >= 5) return { livello: 'comune', nome: a.comune, mediana: c.mediana, n: c.n };
    var p = zone.provincia[a.provincia];
    if (p && p.n >= 5) return { livello: 'provincia', nome: a.provincia, mediana: p.mediana, n: p.n };
    return null;
  }

  /* Valore di mercato con forchetta, fonte e affidabilità. null se non stimabile. */
  function valoreOmi(a) {
    if (!(num(a.omiMin) > 0 && num(a.omiMax) >= num(a.omiMin))) return null;
    return { min: num(a.omiMin), max: num(a.omiMax), centrale: (num(a.omiMin) + num(a.omiMax)) / 2, zonaOk: a.omiMetodo === 'indirizzo' || a.omiMetodo === 'unica' };
  }

  function eu(n) { return Math.round(n).toLocaleString('it-IT') + ' €'; }
  var NOME_PERITO = { perizia: 'la stima del perito', 'primo-prezzo': 'il prezzo della prima asta', 'prima-asta': 'il prezzo base della prima asta' };

  function valore(a, zone) {
    var base = num(a.prezzoBase), omi = valoreOmi(a), stima = num(a.stima), primo = num(a.tentativo) >= 2 ? num(a.primoPrezzo) : 0;
    // riferimento del perito: la stima indicata nell'avviso, oppure il prezzo della prima asta (che di norma coincide con la
    // stima), oppure il prezzo base se questa è la prima asta
    var perito = stima > 0 ? { v: stima, fonte: 'perizia' } : primo > 0 ? { v: primo, fonte: 'primo-prezzo' } : num(a.tentativo) === 1 && base > 0 ? { v: base, fonte: 'prima-asta' } : null;
    var controlli = [];
    var fOmi = omi ? { fonte: omi.zonaOk ? 'omi' : 'omi-comune', v: omi.centrale, min: omi.min, max: omi.max, aff: omi.zonaOk ? 'media' : 'bassa' } : null;
    var fPer = perito ? { fonte: perito.fonte, v: perito.v, aff: perito.fonte === 'perizia' ? 'media' : 'bassa' } : null;
    // fonte principale: 1. OMI della zona riconosciuta; 2. stima del perito; 3. OMI tipico del comune; 4. prezzo della prima asta.
    // L'altra fonte, se c'è, serve da controllo.
    var prim = null, sec = null;
    if (fOmi && omi.zonaOk) { prim = fOmi; sec = fPer; }
    else if (stima > 0) { prim = fPer; sec = fOmi; }
    else if (fOmi) { prim = fOmi; sec = fPer; }
    else prim = fPer;
    if (!prim) return null;
    var scelto = prim, aff = prim.aff;
    if (sec) {
      var r = sec.v / prim.v;
      if (r >= 0.65 && r <= 1.35) { if (prim.fonte === 'omi') aff = 'alta'; }   // due fonti indipendenti concordano
      else {
        // non concordano: per prudenza si usa il valore più basso (lo sconto non si gonfia mai)
        var forte = r < 0.5 || r > 1.6, fo = prim.fonte.indexOf('omi') === 0 ? prim : sec, fp = fo === prim ? sec : prim;
        scelto = sec.v < prim.v ? sec : prim;
        aff = forte ? 'bassa' : scelto.aff;
        controlli.push('Il valore OMI (' + eu(fo.v) + ') e ' + NOME_PERITO[fp.fonte] + ' (' + eu(fp.v) + ') sono ' + (forte ? 'molto ' : '') +
          'diversi: uso il più basso, per prudenza. Verifica nella perizia stato dell\'immobile, superficie e lotti compresi.');
      }
    }
    var fonte = scelto.fonte, centrale = scelto.v, min = scelto.min != null ? scelto.min : null, max = scelto.max != null ? scelto.max : null;
    // OMI molto sopra il prezzo base senza nessun riferimento del perito che lo confermi: dato da verificare
    if (!perito && fonte.indexOf('omi') === 0 && base > 0 && centrale > base * 3) {
      aff = 'bassa';
      controlli.push('Il valore OMI (' + eu(centrale) + ') è più di 3 volte il prezzo base e non c\'è una stima del perito o il prezzo della prima asta che lo confermi: può riguardare una superficie diversa o un immobile in cattivo stato.');
    }
    if (!fonte) return null;
    var f = FORCHETTA[fonte] || 0;
    if (base > 0 && centrale < base * 0.95) { aff = 'bassa'; controlli.push('Il prezzo base è più alto del valore: dato incoerente, da verificare sull\'avviso.'); }
    if (base > 0 && centrale > base * 8) { aff = 'bassa'; controlli.push('Il valore è più di 8 volte il prezzo base: forse si riferisce a più lotti.'); }
    var zona = null;
    if (a.categoria === 'immobile') {
      var mq = num(a.superficieMq);
      if (!(mq > 0)) { aff = abbassa(aff); controlli.push('Metri quadri non indicati: impossibile confrontare il valore con la zona.'); }
      else if (residenziale(a)) {
        zona = zonaDi(a, zone);
        if (zona) {
          var r = (centrale / mq) / zona.mediana;
          zona.rapporto = Math.round(r * 100) / 100;
          if (r < 0.4 || r > 2.5) {
            aff = 'bassa';
            controlli.push('Il valore al metro quadro (' + Math.round(centrale / mq) + ' €/mq) è fuori scala rispetto alle perizie della zona (mediana ' + zona.mediana + ' €/mq su ' + zona.n + ').');
          } else if (fonte === 'perizia' && aff === 'media' && !omi && zona.n >= 10 && Math.abs(r - 1) < 0.35) aff = 'alta';
        }
      }
    }
    return { centrale: Math.round(centrale), min: Math.round(min != null ? min : centrale * (1 - f)), max: Math.round(max != null ? max : centrale * (1 + f)),
      fonte: fonte, etichetta: ETICHETTE[fonte], affidabilita: aff, controlli: controlli, zona: zona };
  }

  function inputCosto(a, valoreMercato) {
    if (a.categoria === 'immobile') {
      return { fn: C.costoImmobile, input: { prezzoBase: a.prezzoBase, offerta: a.prezzoBase, valoreMercato: valoreMercato, regime: IPOTESI.regime,
        speseProcedura: IPOTESI.speseProcedura, liberazione: a.stato === 'occupato' ? IPOTESI.liberazioneOccupato : 0 } };
    }
    return { fn: C.costoVeicolo, input: { tipo: a.categoria === 'beni' ? 'beni' : a.categoria, offerta: a.prezzoBase, valoreMercato: valoreMercato, kw: IPOTESI.kw, provincia: a.provincia } };
  }

  /* Valutazione completa. opz: { T (tariffe), zone (da indiceZone) } */
  function valuta(a, opz) {
    var T = opz.T, out = { valore: null, punteggio: null, mancanti: [] };
    if (!(num(a.prezzoBase) > 0)) { out.mancanti.push('prezzo base'); return out; }
    var v = valore(a, opz.zone);
    if (!v) { out.mancanti.push('valore di mercato (manca la stima del perito)'); return out; }
    out.valore = v;
    var ic = inputCosto(a, v.centrale);
    var c = ic.fn(ic.input, T);
    out.costoTotale = Math.round(c.totale);
    out.sconto = Math.round(c.sconto * 1000) / 1000;
    var icMin = inputCosto(a, v.min);
    out.offertaMax = C.offertaMassima(icMin.fn, icMin.input, T, T.giudizio.scontoObiettivo);

    var parti = {};
    parti.sconto = Math.max(0, Math.min(1, out.sconto / 0.5)) * PESI.sconto;
    var t = num(a.tentativo);
    if (!t) out.mancanti.push('numero del tentativo');
    parti.tentativo = t >= 4 ? 12 : ({ 2: 5, 3: 9 }[t] || 0);
    if (a.categoria === 'immobile') {
      parti.occupazione = a.stato === 'libero' ? PESI.occupazione : a.stato === 'occupato' ? 0 : NEUTRO.occupazione;
      if (a.stato !== 'libero' && a.stato !== 'occupato') out.mancanti.push('stato di occupazione');
    } else parti.occupazione = NEUTRO.nonImmobile;
    if (Array.isArray(a.rischi)) {
      var tolti = 0, visti = {};
      a.rischi.forEach(function (k) { if (visti[k]) return; visti[k] = 1; if (k === 'occupazione' && a.stato === 'occupato') return; tolti += PENALITA[k] || 0; });
      parti.rischi = Math.max(0, PESI.rischi - tolti);
    } else { parti.rischi = NEUTRO.rischi; out.mancanti.push('controllo dei rischi nel testo'); }
    if (num(a.omiAffMin) > 0 && num(a.omiAffMax) >= num(a.omiAffMin) && out.costoTotale > 0) {
      out.affitto = { min: num(a.omiAffMin), max: num(a.omiAffMax) };
      out.rendimento = Math.round(((num(a.omiAffMin) + num(a.omiAffMax)) / 2) * 12 / out.costoTotale * 1000) / 1000;
      parti.zona = out.rendimento >= 0.08 ? 15 : out.rendimento >= 0.06 ? 12 : out.rendimento >= 0.045 ? 9 : out.rendimento >= 0.03 ? 5 : 2;
    } else { parti.zona = NEUTRO.zona; out.mancanti.push('affitto della zona (quotazione OMI di locazione non disponibile)'); }
    for (var k in parti) parti[k] = Math.round(parti[k] * 10) / 10;
    out.parti = parti;
    out.punteggio = Math.round(parti.sconto + parti.tentativo + parti.occupazione + parti.rischi + parti.zona);
    // con un valore di mercato poco affidabile non si può dire "buon affare": il punteggio resta nella fascia "Da valutare"
    if (v.affidabilita === 'bassa' && out.punteggio > TETTO_INCERTO) { out.punteggio = TETTO_INCERTO; out.limitato = true; }
    out.completo = v.affidabilita !== 'bassa' && Array.isArray(a.rischi) && !!t;
    return out;
  }

  // Campi corti da salvare in data/aste.js
  function compatto(r) {
    if (!r || !r.valore) return {};
    var o = { valore: r.valore.centrale, valoreMin: r.valore.min, valoreMax: r.valore.max, fonteValore: r.valore.fonte, affidabilita: r.valore.affidabilita,
      costoTotale: r.costoTotale, sconto: r.sconto, offertaMax: r.offertaMax, punteggio: r.punteggio, punteggioCompleto: r.completo };
    if (r.rendimento != null) o.rendimento = r.rendimento;
    return o;
  }

  function fascia(p) {
    if (p == null) return { chiave: 'nd', etichetta: 'Senza punteggio' };
    if (p >= 75) return { chiave: 'ottimo', etichetta: 'Ottimo affare' };
    if (p >= 55) return { chiave: 'buono', etichetta: 'Buon affare' };
    if (p >= 35) return { chiave: 'medio', etichetta: 'Da valutare' };
    return { chiave: 'basso', etichetta: 'Poco interessante' };
  }

  var Punteggio = { PESI: PESI, PENALITA: PENALITA, IPOTESI: IPOTESI, TETTO_INCERTO: TETTO_INCERTO, indiceZone: indiceZone, valore: valore, valuta: valuta, compatto: compatto, fascia: fascia };
  if (NODE) module.exports = Punteggio;
  else root.Punteggio = Punteggio;
})(typeof window !== 'undefined' ? window : globalThis);
