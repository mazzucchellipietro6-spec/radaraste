/* Motore dei calcoli di Radar Aste Italia.
 * Funzioni pure: ricevono i dati e le tariffe (config/tariffe.js) e restituiscono numeri.
 * Usabile nel browser (window.Calcoli) e in Node per i test. */
(function (root) {
  'use strict';

  function num(x) { var n = Number(x); return isFinite(n) ? n : 0; }
  function arrotonda(n) { return Math.round(n * 100) / 100; }

  /* ---------- Asta ---------- */

  function offertaMinima(prezzoBase, T) {
    return arrotonda(num(prezzoBase) * T.asta.offertaMinima.quota);
  }

  // sconto in frazione (0.2 = 20%)
  function giudizio(sconto, T) {
    var g = T.giudizio;
    if (sconto >= g.affare) return { chiave: 'affare', etichetta: 'Affare', tono: 'good' };
    if (sconto >= g.conviene) return { chiave: 'conviene', etichetta: 'Conviene', tono: 'good' };
    if (sconto >= g.margineStretto) return { chiave: 'stretto', etichetta: 'Margine stretto', tono: 'warn' };
    return { chiave: 'no', etichetta: 'Non conviene', tono: 'bad' };
  }

  /* ---------- Imposte immobili ---------- */

  function regime(id, T) {
    var r = T.immobili.regimi.filter(function (x) { return x.id === id; })[0];
    if (!r) throw new Error('Regime fiscale sconosciuto: ' + id);
    return r;
  }

  function valoreCatastale(rendita, coefficiente, T) {
    return num(rendita) * (1 + T.immobili.prezzoValore.rivalutazione) * coefficiente;
  }

  function impostaVoce(def, base) {
    if (!def) return 0;
    if (def.fissa != null) return def.fissa;
    var v = base * (def.aliquota || 0);
    if (def.minimo != null) v = Math.max(def.minimo, v);
    return v;
  }

  /* Imposte d'acquisto su un immobile.
   * opz: { prezzo, regime, rendita }  — se il regime ammette il prezzo-valore e la
   * rendita è indicata, la base del registro è il valore catastale (se più basso del prezzo). */
  function imposteImmobile(opz, T) {
    var r = regime(opz.regime, T);
    var prezzo = num(opz.prezzo);
    var base = prezzo, usaPV = false, vc = null;
    if (r.prezzoValore && num(opz.rendita) > 0) {
      vc = valoreCatastale(opz.rendita, r.prezzoValore, T);
      if (vc < prezzo) { base = vc; usaPV = true; }
    }
    var iva = prezzo * (r.iva || 0);
    var registro = impostaVoce(r.registro, base);
    var ipotecaria = impostaVoce(r.ipotecaria, base);
    var catastale = impostaVoce(r.catastale, base);
    var voci = [];
    if (iva) voci.push({ voce: 'IVA ' + pct(r.iva), importo: iva });
    voci.push({ voce: 'Imposta di registro' + descr(r.registro), importo: registro });
    voci.push({ voce: 'Imposta ipotecaria' + descr(r.ipotecaria), importo: ipotecaria });
    voci.push({ voce: 'Imposta catastale' + descr(r.catastale), importo: catastale });
    return {
      regime: r, base: base, valoreCatastale: vc, prezzoValore: usaPV,
      voci: voci, totale: iva + registro + ipotecaria + catastale
    };
  }

  function pct(f) { return (Math.round(f * 1000) / 10).toString().replace('.', ',') + '%'; }
  function descr(def) {
    if (!def) return '';
    if (def.fissa != null) return ' (fissa)';
    return ' ' + pct(def.aliquota) + (def.minimo ? ' (min. ' + def.minimo + ' €)' : '');
  }

  /* Costo totale di un immobile all'asta e giudizio.
   * input: { prezzoBase, offerta, valoreMercato, regime, rendita,
   *          condominioCorrente, condominioPrecedente, lavori, liberazione,
   *          speseProcedura, altri } */
  function costoImmobile(input, T) {
    var offerta = num(input.offerta);
    var imp = imposteImmobile({ prezzo: offerta, regime: input.regime, rendita: input.rendita }, T);
    var condominio = num(input.condominioCorrente) + num(input.condominioPrecedente);
    var extra = [
      { voce: 'Condominio arretrato (anno in corso + precedente)', importo: condominio },
      { voce: 'Lavori / ristrutturazione', importo: num(input.lavori) },
      { voce: 'Costi di liberazione', importo: num(input.liberazione) },
      { voce: 'Spese di procedura (trasferimento, trascrizione, cancellazioni)', importo: num(input.speseProcedura) },
      { voce: 'Altri costi', importo: num(input.altri) }
    ];
    var totExtra = extra.reduce(function (s, x) { return s + x.importo; }, 0);
    return riepilogo(offerta, imp.totale + totExtra, num(input.valoreMercato), T, {
      imposte: imp, extra: extra,
      offertaMinima: offertaMinima(input.prezzoBase, T),
      offertaValida: num(input.prezzoBase) <= 0 || offerta >= offertaMinima(input.prezzoBase, T)
    });
  }

  function riepilogo(offerta, costiAggiuntivi, mercato, T, altro) {
    var totale = offerta + costiAggiuntivi;
    var margine = mercato - totale;
    var sconto = mercato > 0 ? margine / mercato : 0;
    var out = { offerta: offerta, totale: totale, valoreMercato: mercato, margine: margine, sconto: sconto, giudizio: giudizio(sconto, T) };
    for (var k in altro) out[k] = altro[k];
    return out;
  }

  /* Offerta massima che mantiene il costo totale ≈ (1 − obiettivo) × mercato.
   * Ricerca binaria sulla stessa funzione di costo, così tiene conto di minimi,
   * prezzo-valore e voci fisse. Restituisce 0 se nemmeno un'offerta nulla basta. */
  function offertaMassima(fnCosto, input, T, obiettivo) {
    var mercato = num(input.valoreMercato);
    if (mercato <= 0) return 0;
    var target = mercato * (1 - (obiettivo == null ? T.giudizio.scontoObiettivo : obiettivo));
    function tot(o) { var c = {}; for (var k in input) c[k] = input[k]; c.offerta = o; return fnCosto(c, T).totale; }
    if (tot(0) > target) return 0;
    var lo = 0, hi = mercato;
    while (tot(hi) <= target) hi *= 2;
    for (var i = 0; i < 60; i++) {
      var mid = (lo + hi) / 2;
      if (tot(mid) <= target) lo = mid; else hi = mid;
    }
    return Math.floor(lo / 100) * 100; // arrotondato per difetto alle centinaia
  }

  /* ---------- Veicoli ---------- */

  function maggiorazioneIpt(sigla, T) {
    var p = T.veicoli.ipt.province[(sigla || '').toUpperCase()];
    return p ? { valore: p.maggiorazione, stato: p.stato } : { valore: T.veicoli.ipt.maggiorazionePredefinita, stato: 'da-verificare' };
  }

  // IPT per autovetture e autocarri (kW). soggettoIva → misura fissa.
  function ipt(opz, T) {
    var I = T.veicoli.ipt;
    var kw = num(opz.kw);
    var m = maggiorazioneIpt(opz.provincia, T);
    var base = (opz.soggettoIva || kw <= 53) ? I.fissaFinoA53kW : kw * I.perKwOltre53;
    return { importo: Math.round(base * (1 + m.valore)), maggiorazione: m.valore, statoMaggiorazione: m.stato, base: base };
  }

  function passaggioProprieta(opz, T) {
    var P = T.veicoli.passaggio;
    var imposta = opz.iptManuale != null && opz.iptManuale !== '' ? { importo: num(opz.iptManuale), maggiorazione: null, statoMaggiorazione: 'manuale' } : ipt(opz, T);
    var voci = [
      { voce: 'IPT (imposta provinciale di trascrizione)', importo: imposta.importo },
      { voce: 'Emolumenti ACI', importo: P.emolumentiAci.importo },
      { voce: 'Imposta di bollo (istanza unificata)', importo: P.bolloIstanzaUnificata.importo },
      { voce: 'Diritti Motorizzazione', importo: P.dirittiMotorizzazione.importo }
    ];
    return { voci: voci, ipt: imposta, totale: voci.reduce(function (s, v) { return s + v.importo; }, 0) };
  }

  /* input: { tipo: 'auto'|'moto'|'beni', offerta, valoreMercato, dirittiQuota, ivaSuDiritti(bool),
   *          ivaSulPrezzo(bool), kw, provincia, iptManuale, riparazioni, trasporto, altri } */
  function costoVeicolo(input, T) {
    var V = T.veicoli;
    var offerta = num(input.offerta);
    var quota = input.dirittiQuota == null || input.dirittiQuota === '' ? V.dirittiAsta.quota : num(input.dirittiQuota);
    var diritti = offerta * quota;
    var ivaDiritti = input.ivaSuDiritti === false ? 0 : diritti * V.dirittiAsta.ivaSuDiritti;
    var ivaPrezzo = input.ivaSulPrezzo ? offerta * V.ivaOrdinaria.aliquota : 0;
    var passaggio = input.tipo === 'beni' ? null : passaggioProprieta({
      kw: input.kw, provincia: input.provincia, soggettoIva: !!input.ivaSulPrezzo,
      iptManuale: input.tipo === 'moto' ? (input.iptManuale || 0) : input.iptManuale
    }, T);
    var voci = [
      { voce: 'Diritti d\'asta (' + pct(quota) + ')', importo: diritti },
      { voce: 'IVA sui diritti d\'asta', importo: ivaDiritti },
      { voce: 'IVA sul prezzo', importo: ivaPrezzo }
    ];
    if (passaggio) voci.push({ voce: 'Passaggio di proprietà', importo: passaggio.totale });
    voci.push({ voce: 'Riparazioni', importo: num(input.riparazioni) });
    voci.push({ voce: 'Trasporto', importo: num(input.trasporto) });
    voci.push({ voce: 'Altri costi', importo: num(input.altri) });
    var agg = voci.reduce(function (s, v) { return s + v.importo; }, 0);
    return riepilogo(offerta, agg, num(input.valoreMercato), T, { voci: voci, passaggio: passaggio });
  }

  /* ---------- Imposte annuali e rivendita ---------- */

  function bolloAuto(opz, T) {
    var B = T.veicoli.bollo;
    var t = B.tariffeNazionali[opz.euro] || B.tariffeNazionali['Euro 4-5-6'];
    var kw = num(opz.kw);
    var reg = B.regioni[opz.regione];
    var coeff = reg ? reg.coefficiente : B.coefficientePredefinito;
    var base = (Math.min(kw, 100) * t.fino100 + Math.max(0, kw - 100) * t.oltre100) * coeff;
    var sb = 0, S = B.superbollo;
    if (kw > S.sogliaKw) {
      var eta = num(opz.anniVeicolo), quota = 1;
      S.riduzioni.forEach(function (r) { if (eta >= r.dopoAnni) quota = r.quota; });
      sb = (kw - S.sogliaKw) * S.perKw * quota;
    }
    return { bollo: Math.round(base * 100) / 100, superbollo: sb, totale: Math.round((base + sb) * 100) / 100, coefficiente: coeff, statoRegione: reg ? reg.stato : 'nazionale' };
  }

  function imuAnnua(opz, T) {
    var I = T.imu;
    var base = num(opz.rendita) * (1 + I.rivalutazioneRendita) * I.moltiplicatoreAbitazioni;
    var aliquota = opz.aliquota == null || opz.aliquota === '' ? I.aliquotaMassima : num(opz.aliquota);
    return { base: base, aliquota: aliquota, importo: Math.round(base * aliquota) };
  }

  function plusvalenza(opz, T) {
    var P = T.plusvalenza;
    var guadagno = num(opz.prezzoVendita) - num(opz.costoAcquisto) - num(opz.costiInerenti);
    var dovuta = !opz.abitazionePrincipale && num(opz.anniPossesso) < P.anni && guadagno > 0;
    return { plusvalenza: guadagno, imposta: dovuta ? Math.round(guadagno * P.aliquotaSostitutiva) : 0, dovuta: dovuta };
  }

  /* Stima rapida per l'elenco: offerta = prezzo base, ipotesi prudenti
   * (immobile senza agevolazioni prima casa, spese di procedura standard). */
  var IPOTESI_RAPIDE = { regime: 'seconda-privato', speseProcedura: 1500, liberazioneOccupato: 3000, kw: 70 };
  function stimaRapida(asta, T) {
    if (!asta || !(num(asta.valoreMercato) > 0) || !(num(asta.prezzoBase) > 0)) return null;
    if (asta.categoria === 'immobile') {
      return costoImmobile({ prezzoBase: asta.prezzoBase, offerta: asta.prezzoBase, valoreMercato: asta.valoreMercato,
        regime: IPOTESI_RAPIDE.regime, speseProcedura: IPOTESI_RAPIDE.speseProcedura,
        liberazione: asta.stato === 'occupato' ? IPOTESI_RAPIDE.liberazioneOccupato : 0 }, T);
    }
    return costoVeicolo({ tipo: asta.categoria, offerta: asta.prezzoBase, valoreMercato: asta.valoreMercato,
      kw: IPOTESI_RAPIDE.kw, provincia: asta.provincia }, T);
  }

  var Calcoli = {
    stimaRapida: stimaRapida, IPOTESI_RAPIDE: IPOTESI_RAPIDE,
    offertaMinima: offertaMinima, giudizio: giudizio, imposteImmobile: imposteImmobile,
    valoreCatastale: valoreCatastale, costoImmobile: costoImmobile, costoVeicolo: costoVeicolo,
    offertaMassima: offertaMassima, ipt: ipt, passaggioProprieta: passaggioProprieta,
    bolloAuto: bolloAuto, imuAnnua: imuAnnua, plusvalenza: plusvalenza, pct: pct
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Calcoli;
  else root.Calcoli = Calcoli;
})(typeof window !== 'undefined' ? window : globalThis);
