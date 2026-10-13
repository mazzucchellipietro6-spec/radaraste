/* Pagina "Conviene?": calcolatore per immobili e per veicoli/beni mobili. */
(function () {
  'use strict';
  var T = window.TARIFFE, U = window.UI, S = window.Store, C = window.Calcoli, $ = U.$, $$ = U.$$;
  var astaCorrente = null, stimaCorrente = null, ultimo = { immobile: null, veicolo: null };

  function n(id) { var v = parseFloat($('#' + id).value); return isFinite(v) ? v : 0; }
  function riga(etichetta, valore, cls) { return '<div class="line' + (cls ? ' ' + cls : '') + '"><span>' + etichetta + '</span><b>' + valore + '</b></div>'; }
  function verdetto(r) {
    return '<div class="verdict v-' + r.giudizio.tono + '"><div class="big">' + r.giudizio.etichetta + '</div>' +
      '<div>Sconto reale sul mercato: <b>' + U.pct(r.sconto) + '</b> · Margine: <b>' + U.eur(r.margine) + '</b></div></div>' +
      '<div class="scale" aria-label="Scala del giudizio">' +
      '<span class="v-good">Affare ≥ ' + U.pct(T.giudizio.affare, 0) + '</span><span class="v-good">Conviene ' + U.pct(T.giudizio.conviene, 0) + '–' + U.pct(T.giudizio.affare, 0) + '</span>' +
      '<span class="v-warn">Stretto ' + U.pct(T.giudizio.margineStretto, 0) + '–' + U.pct(T.giudizio.conviene, 0) + '</span><span class="v-bad">No &lt; ' + U.pct(T.giudizio.margineStretto, 0) + '</span></div>';
  }
  function bloccoOffertaMax(max, idInput) {
    if (!max) return '<div class="callout warn" style="margin-top:12px">Con questi costi non c\'è un\'offerta che resti ' + U.pct(T.giudizio.scontoObiettivo, 0) + ' sotto il mercato.</div>';
    return '<div class="callout" style="margin-top:12px">Offerta massima consigliata per restare circa il ' + U.pct(T.giudizio.scontoObiettivo, 0) + ' sotto il mercato: <b class="mono">' + U.eur(max) + '</b> ' +
      '<button class="btn small ghost" type="button" data-usa="' + idInput + '" data-valore="' + max + '">Usa questa offerta</button></div>';
  }
  function bloccoSalva() {
    if (!astaCorrente) return '<p class="note">Per salvare la valutazione scegli un\'asta del tuo elenco in alto.</p>';
    return '<div class="row-actions" style="margin-top:12px"><button class="btn" type="button" id="salva">Salva valutazione in "Le mie aste"</button></div>';
  }

  /* ---------- Immobile ---------- */
  function inputImmobile() {
    return {
      prezzoBase: n('iBase'), offerta: n('iOfferta'), valoreMercato: n('iMercato'), regime: $('#iRegime').value, rendita: n('iRendita'),
      condominioCorrente: n('iCondCorr'), condominioPrecedente: n('iCondPrec'), lavori: n('iLavori'),
      liberazione: n('iLiberazione'), speseProcedura: n('iProcedura'), altri: n('iAltri')
    };
  }

  function calcImmobile() {
    var inp = inputImmobile(), out = $('#outImm');
    if (!inp.offerta || !inp.valoreMercato) {
      out.innerHTML = '<h3>Risultato</h3><p class="muted">Inserisci almeno la tua offerta e il valore di mercato.</p>';
      ultimo.immobile = null; aggiornaRiepilogo(); return;
    }
    var r = C.costoImmobile(inp, T);
    var max = C.offertaMassima(C.costoImmobile, inp, T);
    var imp = r.imposte, reg = imp.regime;
    var h = '<h3>Risultato</h3>';
    if (inp.prezzoBase) h += riga('Offerta minima ammessa (75%)', U.eur(r.offertaMinima));
    h += riga('La tua offerta', U.eur(r.offerta));
    if (!r.offertaValida) h += '<div class="callout warn">⚠ L\'offerta è sotto il 75% del prezzo base: non sarebbe valida.</div>';
    h += riga('Imposte (' + U.esc(reg.nome) + ')', U.eur(imp.totale));
    imp.voci.forEach(function (v) { h += riga(U.esc(v.voce), U.eur(v.importo), 'sub'); });
    if (imp.prezzoValore) h += '<p class="note">Registro calcolato con il prezzo-valore: base ' + U.eur(imp.base) + ' (rendita × 1,05 × ' + reg.prezzoValore + ') invece dell\'offerta. Va chiesto prima della registrazione del decreto di trasferimento.</p>';
    else if (reg.prezzoValore && !inp.rendita) h += '<p class="note">Indica la rendita catastale: con il prezzo-valore il registro potrebbe essere più basso.</p>';
    r.extra.forEach(function (v) { if (v.importo) h += riga(U.esc(v.voce), U.eur(v.importo)); });
    h += riga('Costo totale', U.eur(r.totale), 'total');
    h += riga('Valore di mercato', U.eur(r.valoreMercato));
    h += verdetto(r) + bloccoOffertaMax(max, 'iOfferta');
    h += riga('Cauzione da versare con l\'offerta (circa ' + U.pct(T.asta.cauzione.quota, 0) + ')', U.eur(r.offerta * T.asta.cauzione.quota));

    // Dopo l'acquisto
    var dopo = '';
    var principale = $('#iPrincipale').checked;
    if (inp.rendita && !principale) {
      var imu = C.imuAnnua({ rendita: inp.rendita, aliquota: n('iImuAliquota') / 100 }, T);
      dopo += riga('IMU annua stimata (aliquota ' + U.pct(imu.aliquota, 2) + ')', U.eur(imu.importo));
    }
    var vend = n('iRivendita');
    if (vend) {
      var pv = C.plusvalenza({ prezzoVendita: vend, costoAcquisto: r.offerta + imp.totale, costiInerenti: inp.lavori + inp.speseProcedura, anniPossesso: n('iAnni'), abitazionePrincipale: principale }, T);
      dopo += riga('Plusvalenza alla rivendita', U.eur(pv.plusvalenza));
      dopo += riga(pv.dovuta ? 'Imposta sostitutiva 26% sulla plusvalenza' : 'Tassa sulla plusvalenza', pv.dovuta ? U.eur(pv.imposta) : 'non dovuta');
      dopo += riga('Guadagno netto stimato', U.eur(vend - r.totale - pv.imposta), 'total');
    }
    if (dopo) h += '<h3 style="margin-top:16px">Dopo l\'acquisto</h3>' + dopo;
    h += bloccoStrategie(inp);
    h += bloccoSalva();
    out.innerHTML = h;
    ultimo.immobile = { tipo: 'immobile', input: inp, totale: r.totale, sconto: r.sconto, giudizio: r.giudizio.etichetta, tono: r.giudizio.tono, offertaMax: max };
    aggiornaRiepilogo();
  }

  function forchetta(f, fmt) {
    fmt = fmt || U.eur;
    if (!f) return '—';
    return Math.round(f.min) === Math.round(f.max) || fmt(f.min) === fmt(f.max) ? fmt(f.min) : fmt(Math.min(f.min, f.max)) + ' – ' + fmt(Math.max(f.min, f.max));
  }
  function bloccoStrategie(inp) {
    var mq = n('sMq'), canone = n('sCanone');
    var lavoriRiv = n('sLavori') || (mq ? mq * T.rivendita.lavoriEuroMq.medi : 0);
    var valMin = inp.valoreMercato, valMax = inp.valoreMercato;
    if (stimaCorrente && stimaCorrente.min && !inp.valoreManuale) { valMin = stimaCorrente.min; valMax = stimaCorrente.max; }
    var dopo = n('sValoreDopo');
    var r = C.strategie({
      prezzoBase: inp.prezzoBase, offerta: inp.offerta, rendita: inp.rendita, condominioCorrente: inp.condominioCorrente, condominioPrecedente: inp.condominioPrecedente,
      liberazione: inp.liberazione, speseProcedura: inp.speseProcedura, altri: inp.altri, lavori: inp.lavori, lavoriRistrutturazione: lavoriRiv,
      valore: { min: valMin, max: valMax }, valoreDopoLavori: dopo ? { min: dopo, max: dopo } : null,
      canoneMese: canone ? { min: canone, max: canone } : (stimaCorrente && stimaCorrente.canoneMin ? { min: stimaCorrente.canoneMin, max: stimaCorrente.canoneMax } : null),
      contratto: $('#sContratto').value, aliquotaImu: n('iImuAliquota') / 100, mesiOperazione: n('sMesi') || 12
    }, T);
    var pct = function (x) { return U.pct(x, 1); };
    function card(titolo, corpo) { return '<div class="strategia"><h4>' + titolo + '</h4>' + corpo + '</div>'; }
    function manca(cosa, dove) { return '<p class="muted" style="margin:0">Serve il ' + cosa + ': ' + dove + '.</p>'; }
    var vivo = r.vivo.mancante ? manca('valore di mercato', 'inseriscilo sopra') :
      '<div class="big mono">' + forchetta(r.vivo.risparmio) + '</div><p class="muted">risparmio rispetto a comprarla sul mercato (' + forchetta(r.vivo.percentuale, pct) + ')</p><div class="line"><span>Costo totale (prima casa)</span><b>' + U.eur(r.vivo.costoTotale) + '</b></div>';
    var aff = r.affitto.mancante ? manca('canone di mercato al mese', 'inseriscilo qui sopra') :
      '<div class="big mono">' + forchetta(r.affitto.rendimentoNetto, pct) + '</div><p class="muted">rendimento netto all\'anno (lordo ' + forchetta(r.affitto.rendimentoLordo, pct) + ')</p>' +
      '<div class="line"><span>Netto all\'anno</span><b>' + forchetta(r.affitto.nettoAnno) + '</b></div><div class="line"><span>Cedolare secca</span><b>' + U.pct(r.affitto.aliquotaCedolare, 0) + '</b></div>' +
      (r.affitto.imuMancante ? '<p class="note">IMU non inclusa: manca la rendita catastale.</p>' : '<div class="line"><span>IMU</span><b>' + U.eur(r.affitto.imu) + '</b></div>');
    var riv = r.rivendo.mancante ? manca('valore di mercato', 'inseriscilo sopra') :
      '<div class="big mono">' + forchetta(r.rivendo.guadagno) + '</div><p class="muted">guadagno dopo tasse in ' + r.rivendo.mesi + ' mesi (' + forchetta(r.rivendo.roi, pct) + ' sul capitale)</p>' +
      '<div class="line"><span>Lavori</span><b>' + U.eur(lavoriRiv) + '</b></div><div class="line"><span>Vendita a</span><b>' + forchetta(r.rivendo.prezzoVendita) + '</b></div>' +
      '<div class="line"><span>Agenzia + IVA</span><b>' + forchetta(r.rivendo.costiVendita) + '</b></div><div class="line"><span>Imposta plusvalenza 26%</span><b>' + forchetta(r.rivendo.tassaPlusvalenza) + '</b></div>';
    return '<h3 style="margin-top:16px">Tre strategie</h3><div class="strategie">' + card('Ci vivo', vivo) + card('Lo affitto', aff) + card('Ristrutturo e rivendo', riv) + '</div>' +
      '<p class="note">Ipotesi: ' + T.affitto.ipotesi.mesiSfitto + ' mese sfitto all\'anno, spese del proprietario ' + U.pct(T.affitto.ipotesi.speseProprietario, 0) + ' del canone, agenzia ' + U.pct(T.rivendita.provvigioneAgenzia, 0) + ' + IVA alla vendita. Si modificano in config/tariffe.js.</p>';
  }

  /* ---------- Veicoli ---------- */
  function inputVeicolo() {
    return {
      tipo: $('#vTipo').value, prezzoBase: n('vBase'), offerta: n('vOfferta'), valoreMercato: n('vMercato'),
      dirittiQuota: n('vDiritti') / 100, ivaSuDiritti: $('#vIvaDiritti').value === '1', ivaSulPrezzo: $('#vIvaPrezzo').value === '1',
      kw: n('vKw'), provincia: $('#vProvincia').value, iptManuale: $('#vTipo').value === 'moto' ? n('vIptMoto') : undefined,
      riparazioni: n('vRiparazioni'), trasporto: n('vTrasporto'), altri: n('vAltri')
    };
  }

  function aggiornaCampiVeicolo() {
    var t = $('#vTipo').value;
    $('#vPassaggio').hidden = t === 'beni';
    $$('.vAuto').forEach(function (el) { el.hidden = t !== 'auto'; });
    $$('.vMoto').forEach(function (el) { el.hidden = t !== 'moto'; });
  }

  function calcVeicolo() {
    var inp = inputVeicolo(), out = $('#outVei');
    if (!inp.offerta || !inp.valoreMercato) {
      out.innerHTML = '<h3>Risultato</h3><p class="muted">Inserisci almeno il prezzo di aggiudicazione e il valore di mercato.</p>';
      ultimo.veicolo = null; aggiornaRiepilogo(); return;
    }
    var r = C.costoVeicolo(inp, T);
    var max = C.offertaMassima(C.costoVeicolo, inp, T);
    var h = '<h3>Risultato</h3>';
    if (inp.prezzoBase) h += riga('Offerta minima indicativa (75% del prezzo base)', U.eur(C.offertaMinima(inp.prezzoBase, T)));
    h += riga('Aggiudicazione', U.eur(r.offerta));
    r.voci.forEach(function (v) {
      if (!v.importo) return;
      h += riga(U.esc(v.voce), U.eur(v.importo, v.voce === 'Passaggio di proprietà' ? 2 : 0));
      if (v.voce === 'Passaggio di proprietà' && r.passaggio) r.passaggio.voci.forEach(function (p) { h += riga(U.esc(p.voce), U.eur(p.importo, 2), 'sub'); });
    });
    if (r.passaggio && r.passaggio.ipt.statoMaggiorazione === 'da-verificare') h += '<p class="note">IPT calcolata con la maggiorazione provinciale predefinita (+30%): verifica il valore della tua provincia nella pagina Tariffe.</p>';
    if (inp.tipo === 'moto' && !inp.iptManuale) h += '<p class="note">Per le moto inserisci l\'IPT indicata dall\'ACI: le tariffe sono diverse da quelle delle auto.</p>';
    h += riga('Costo totale', U.eur(r.totale), 'total');
    h += riga('Valore di mercato', U.eur(r.valoreMercato));
    h += verdetto(r) + bloccoOffertaMax(max, 'vOfferta');
    if (inp.tipo === 'auto' && inp.kw) {
      var b = C.bolloAuto({ kw: inp.kw, euro: $('#vEuro').value, regione: $('#vRegione').value, anniVeicolo: n('vEta') }, T);
      h += '<h3 style="margin-top:16px">Costi annuali</h3>' + riga('Bollo auto annuo stimato', U.eur(b.bollo, 2));
      if (b.superbollo) h += riga('Superbollo', U.eur(b.superbollo, 2));
      if (b.statoRegione === 'da-verificare') h += '<p class="note">Maggiorazione regionale da verificare con il calcolo bollo ACI.</p>';
    }
    h += bloccoSalva();
    out.innerHTML = h;
    ultimo.veicolo = { tipo: 'veicolo', input: inp, totale: r.totale, sconto: r.sconto, giudizio: r.giudizio.etichetta, tono: r.giudizio.tono, offertaMax: max };
    aggiornaRiepilogo();
  }

  /* ---------- Riepilogo fisso (telefono) ---------- */
  var risultatoVisibile = false;
  function tabCorrente() { return $('#pan-immobile').hidden ? 'veicolo' : 'immobile'; }
  function aggiornaRiepilogo() {
    var box = $('#riepilogoFisso'); if (!box) return;
    var v = ultimo[tabCorrente()];
    box.hidden = false;
    document.body.classList.add('con-riepilogo');
    box.className = 'riepilogo-fisso' + (v ? ' v-' + v.tono : '') + (risultatoVisibile ? ' nascosto' : '');
    if (v) {
      $('#rfGiudizio').textContent = v.giudizio;
      $('#rfNumeri').innerHTML = '<span>Sconto <b>' + U.pct(v.sconto, 0) + '</b></span><span>Costo totale <b>' + U.eur(v.totale) + '</b></span>';
    } else {
      $('#rfGiudizio').textContent = 'Risultato';
      $('#rfNumeri').textContent = tabCorrente() === 'immobile' ? 'Inserisci offerta e valore di mercato' : 'Inserisci aggiudicazione e valore di mercato';
    }
  }
  function osservaRisultato() {
    if (!('IntersectionObserver' in window)) return;
    var vis = {};
    var io = new IntersectionObserver(function (voci) {
      voci.forEach(function (x) { vis[x.target.id] = x.isIntersecting; });
      risultatoVisibile = !!vis[tabCorrente() === 'immobile' ? 'outImm' : 'outVei'];
      aggiornaRiepilogo();
    }, { threshold: 0.15 });
    io.observe($('#outImm')); io.observe($('#outVei'));
  }

  /* ---------- Asta collegata ---------- */
  function mostraTab(t, fuoco) {
    $$('.tabs [role=tab]').forEach(function (b) {
      var on = b.dataset.tab === t;
      b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
      if (on && fuoco) b.focus();
    });
    $('#pan-immobile').hidden = t !== 'immobile';
    $('#pan-veicolo').hidden = t !== 'veicolo';
    aggiornaRiepilogo();
  }

  function caricaAsta(id) {
    astaCorrente = id ? S.asta(id) || (S.seguita(id) || {}).copia || null : null;
    var a = astaCorrente, info = $('#infoAsta');
    if (!a) { info.innerHTML = ''; calcImmobile(); calcVeicolo(); return; }
    var link = U.linkSicuro(a.linkAvviso);
    info.innerHTML = '<b>' + U.esc(a.titolo) + '</b> · asta del ' + U.dataIt(a.dataAsta) + (link ? ' · <a href="' + U.esc(link) + '" target="_blank" rel="noopener">avviso originale ↗</a>' : '');
    var val = (S.seguita(a.id) || {}).valutazione;
    if (a.categoria === 'immobile') {
      mostraTab('immobile');
      $('#iBase').value = a.prezzoBase || ''; $('#iMercato').value = a.valoreMercato || '';
      $('#iOfferta').value = a.offertaMinima || (a.prezzoBase ? C.offertaMinima(a.prezzoBase, T) : '');
      var occ = a.stato === 'occupato' ? '1500' : '0'; $('#iOccupazione').value = occ; $('#iLiberazione').value = occ;
      if (val && val.tipo === 'immobile') ripristina(val.input, { prezzoBase: 'iBase', offerta: 'iOfferta', valoreMercato: 'iMercato', regime: 'iRegime', rendita: 'iRendita', condominioCorrente: 'iCondCorr', condominioPrecedente: 'iCondPrec', lavori: 'iLavori', liberazione: 'iLiberazione', speseProcedura: 'iProcedura', altri: 'iAltri' });
    } else {
      mostraTab('veicolo');
      $('#vTipo').value = a.categoria; $('#vBase').value = a.prezzoBase || ''; $('#vOfferta').value = a.prezzoBase || ''; $('#vMercato').value = a.valoreMercato || '';
      if (val && val.tipo === 'veicolo') {
        ripristina(val.input, { tipo: 'vTipo', prezzoBase: 'vBase', offerta: 'vOfferta', valoreMercato: 'vMercato', kw: 'vKw', provincia: 'vProvincia', riparazioni: 'vRiparazioni', trasporto: 'vTrasporto', altri: 'vAltri' });
        $('#vDiritti').value = Math.round(val.input.dirittiQuota * 1000) / 10;
      }
      aggiornaCampiVeicolo();
    }
    calcImmobile(); calcVeicolo();
  }
  function ripristina(input, mappa) { Object.keys(mappa).forEach(function (k) { if (input[k] !== undefined && input[k] !== '') $('#' + mappa[k]).value = input[k]; }); }

  /* ---------- Avvio ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    // regimi fiscali raggruppati
    var gruppi = {};
    T.immobili.regimi.forEach(function (r) { (gruppi[r.gruppo] = gruppi[r.gruppo] || []).push(r); });
    $('#iRegime').innerHTML = Object.keys(gruppi).map(function (g) {
      return '<optgroup label="' + U.esc(g) + '">' + gruppi[g].map(function (r) { return '<option value="' + r.id + '">' + U.esc(r.nome) + '</option>'; }).join('') + '</optgroup>';
    }).join('');
    $('#iRegime').value = 'prima-privato';
    $('#iImuComune').innerHTML = '<option value="">Aliquota massima ordinaria (' + U.pct(T.imu.aliquotaMassima, 2) + ')</option>' +
      T.imu.comuni.map(function (c, i) { return '<option value="' + i + '">' + U.esc(c.comune + ' (' + c.provincia + ')') + ' – ' + U.pct(c.aliquota, 2) + '</option>'; }).join('');
    $('#iImuAliquota').value = (T.imu.aliquotaMassima * 100).toFixed(2);
    $('#iImuComune').addEventListener('change', function () {
      var c = T.imu.comuni[this.value]; $('#iImuAliquota').value = ((c ? c.aliquota : T.imu.aliquotaMassima) * 100).toFixed(2); calcImmobile();
    });
    $('#iOccupazione').addEventListener('change', function () { $('#iLiberazione').value = this.value; calcImmobile(); });

    $('#vDiritti').value = T.veicoli.dirittiAsta.quota * 100;
    U.opzioniProvince($('#vProvincia'), ''); $('#vProvincia').value = 'RM';
    U.opzioniRegioni($('#vRegione')); $('#vRegione').value = 'Lazio';
    $('#vEuro').innerHTML = Object.keys(T.veicoli.bollo.tariffeNazionali).map(function (k) { return '<option>' + k + '</option>'; }).join('');
    $('#vEuro').value = 'Euro 4-5-6';
    $('#vProvincia').addEventListener('change', function () { var p = window.GEO.province[this.value]; if (p) $('#vRegione').value = p.regione; });
    $('#vTipo').addEventListener('change', aggiornaCampiVeicolo);
    aggiornaCampiVeicolo();

    $('#fImm').addEventListener('input', calcImmobile);
    $('#fVei').addEventListener('input', calcVeicolo);
    $('#fImm').addEventListener('submit', function (e) { e.preventDefault(); });
    $('#fVei').addEventListener('submit', function (e) { e.preventDefault(); });
    $$('.tabs [role=tab]').forEach(function (b) { b.addEventListener('click', function () { mostraTab(b.dataset.tab); }); });
    // schede accessibili da tastiera: frecce sinistra/destra, Home e Fine
    $('.tabs').addEventListener('keydown', function (e) {
      var tab = $$('.tabs [role=tab]'), i = tab.indexOf(document.activeElement);
      if (i < 0) return;
      var j = e.key === 'ArrowRight' ? (i + 1) % tab.length : e.key === 'ArrowLeft' ? (i - 1 + tab.length) % tab.length : e.key === 'Home' ? 0 : e.key === 'End' ? tab.length - 1 : -1;
      if (j < 0) return;
      e.preventDefault(); mostraTab(tab[j].dataset.tab, true);
    });
    $('#rfDettagli').addEventListener('click', function () {
      var out = $(tabCorrente() === 'immobile' ? '#outImm' : '#outVei');
      out.scrollIntoView({ block: 'start', behavior: U.menoMovimento() ? 'auto' : 'smooth' });
    });
    osservaRisultato();

    document.addEventListener('click', function (e) {
      var u = e.target.closest('[data-usa]');
      if (u) { $('#' + u.dataset.usa).value = u.dataset.valore; calcImmobile(); calcVeicolo(); return; }
      if (e.target.id === 'salva' && astaCorrente) {
        var tipo = $('#pan-immobile').hidden ? 'veicolo' : 'immobile';
        var v = ultimo[tipo]; if (!v) return;
        v.data = new Date().toISOString();
        S.segui(astaCorrente.id, { valutazione: v });
        U.toast('Valutazione salvata in "Le mie aste": ' + v.giudizio);
      }
    });

    // nel menu: le aste che segui + quella aperta dall'elenco (l'elenco completo è troppo lungo)
    var id = U.parametro('id');
    var aste = S.seguite().map(function (s) { return S.asta(s.id) || s.copia; }).filter(Boolean);
    if (id && !aste.some(function (a) { return a.id === id; }) && S.asta(id)) aste.unshift(S.asta(id));
    aste.sort(function (a, b) { return (a.dataAsta || '').localeCompare(b.dataAsta || ''); });
    $('#selAsta').innerHTML += aste.map(function (a) { return '<option value="' + U.esc(a.id) + '">' + U.esc(a.titolo.slice(0, 70)) + ' – ' + U.dataIt(a.dataAsta) + '</option>'; }).join('');
    if (!aste.length) $('#infoAsta').innerHTML = 'Nessuna asta seguita: apri "Conviene?" da una scheda dell\'<a href="aste.html">elenco aste</a>, oppure fai un calcolo libero.';
    $('#selAsta').addEventListener('change', function () {
      history.replaceState(null, '', this.value ? '?id=' + encodeURIComponent(this.value) : location.pathname);
      caricaAsta(this.value);
    });
    if (id) { $('#selAsta').value = id; caricaAsta(id); }
    else { calcImmobile(); calcVeicolo(); }
    aggiornaRiepilogo();
  });
})();
