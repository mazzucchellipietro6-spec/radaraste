/* Pagina "Aste": elenco con filtri, inserimento da avviso reale, import/export. */
(function () {
  'use strict';
  var T = window.TARIFFE, U = window.UI, S = window.Store, C = window.Calcoli, $ = U.$, $$ = U.$$;
  var K_FILTRI = 'radaraste.filtri';
  var VUOTI = { cat: '', testo: '', regione: '', provincia: '', tribunale: '', min: '', max: '', dal: '', al: '', stato: '', passate: false, nuove: false, ordina: 'data' };
  var filtri = JSON.parse(JSON.stringify(VUOTI));
  var PASSO = 60, mostrate = PASSO, seguite = {};
  var R = window.Ricerche, nuoveDal = R.visitaPrecedente(), ricercaAperta = null;

  /* ---------- Filtri ---------- */
  function caricaFiltri() {
    try { var f = JSON.parse(localStorage.getItem(K_FILTRI) || 'null'); if (f) for (var k in f) filtri[k] = f[k]; } catch (e) {}
  }
  function salvaFiltri() { try { localStorage.setItem(K_FILTRI, JSON.stringify(filtri)); } catch (e) {} }

  function sincronizzaControlli() {
    $$('#fCat .chip').forEach(function (c) { c.setAttribute('aria-pressed', String(c.dataset.cat === filtri.cat)); });
    $('#fTesto').value = filtri.testo; $('#fRegione').value = filtri.regione;
    U.opzioniProvince($('#fProvincia'), filtri.regione, true); $('#fProvincia').value = filtri.provincia;
    $('#fTribunale').value = filtri.tribunale; $('#fPrezzoMin').value = filtri.min; $('#fPrezzoMax').value = filtri.max;
    $('#fDal').value = filtri.dal; $('#fAl').value = filtri.al; $('#fStato').value = filtri.stato;
    $('#fPassate').checked = !!filtri.passate; $('#fNuove').checked = !!filtri.nuove; $('#ordina').value = filtri.ordina;
  }

  function leggiControlli() {
    filtri.testo = $('#fTesto').value.trim(); filtri.regione = $('#fRegione').value; filtri.provincia = $('#fProvincia').value;
    filtri.tribunale = $('#fTribunale').value.trim(); filtri.min = $('#fPrezzoMin').value; filtri.max = $('#fPrezzoMax').value;
    filtri.dal = $('#fDal').value; filtri.al = $('#fAl').value; filtri.stato = $('#fStato').value;
    filtri.passate = $('#fPassate').checked; filtri.nuove = $('#fNuove').checked; filtri.ordina = $('#ordina').value;
  }

  var oggi = new Date().toISOString().slice(0, 10);
  function senzaAccenti(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  // filtro per un insieme di filtri qualsiasi (quelli correnti o quelli di una ricerca salvata)
  function filtro(filtri, dal) {
    var parole = senzaAccenti(filtri.testo).split(/\s+/).filter(Boolean);
    return function (a) { return passa(a, filtri, parole, dal); };
  }
  function passa(a, filtri, parole, dal) {
    if (filtri.nuove && !R.nuovaDa(a, dal)) return false;
    if (filtri.cat && a.categoria !== filtri.cat) return false;
    if (filtri.regione && a.regione !== filtri.regione) return false;
    if (filtri.provincia && a.provincia !== filtri.provincia) return false;
    if (filtri.tribunale && (a.tribunale || '').toLowerCase().indexOf(filtri.tribunale.toLowerCase()) < 0) return false;
    if (filtri.min && !(a.prezzoBase >= +filtri.min)) return false;
    if (filtri.max && !(a.prezzoBase <= +filtri.max)) return false;
    if (filtri.dal && !(a.dataAsta >= filtri.dal)) return false;
    if (filtri.al && !(a.dataAsta <= filtri.al)) return false;
    if (filtri.stato && a.stato !== filtri.stato) return false;
    if (!filtri.passate && a.dataAsta && a.dataAsta < oggi) return false;
    if (parole.length) {
      if (a._cerca === undefined) a._cerca = senzaAccenti([a.titolo, a.tipo, a.comune, a.provincia, a.indirizzo, a.tribunale, a.rge, a.fonte, a.descrizione].join(' '));
      for (var i = 0; i < parole.length; i++) if (a._cerca.indexOf(parole[i]) < 0) return false;
    }
    return true;
  }

  /* ---------- Elenco ---------- */
  function scheda(a) {
    var seg = seguite[a.id];
    var st = C.stimaRapida(a, T);
    var min = a.offertaMinima || (a.prezzoBase ? C.offertaMinima(a.prezzoBase, T) : null);
    var luogo = [a.comune ? a.comune + (a.provincia ? ' (' + a.provincia + ')' : '') : (a.provincia ? (window.GEO.province[a.provincia] || {}).nome || a.provincia : ''),
      a.tribunale ? 'Trib. ' + a.tribunale : '', a.rge ? 'Proc. n. ' + a.rge : ''].filter(Boolean).join(' · ');
    var avviso = U.linkSicuro(a.linkAvviso), perizia = U.linkSicuro(a.linkPerizia), pdf = U.linkSicuro(a.linkPdf);
    var statoPill = a.stato === 'libero' ? 'p-good' : a.stato === 'occupato' ? 'p-warn' : 'p-neutral';
    var q = U.quando(a.dataAsta);
    return '<article class="card' + (R.nuovaDa(a, nuoveDal) ? ' nuova' : '') + '">' +
      '<div class="top">' + (R.nuovaDa(a, nuoveDal) ? '<span class="pill p-good" title="Pubblicata dopo il ' + U.dataIt(nuoveDal) + '">Nuova</span>' : '') + '<span class="pill p-info">' + U.esc(U.CATEGORIE[a.categoria] || a.categoria) + '</span>' +
        '<span class="pill ' + statoPill + '">' + U.esc(U.STATI[a.stato] || 'Non indicato') + '</span>' +
        (a.tipo ? '<span class="tag">' + U.esc(a.tipo) + '</span>' : '') +
        (a.origine === 'raccolta' ? '<span class="tag" title="Raccolta automatica dalla fonte ufficiale">' + U.esc(a.fonte || 'fonte') + '</span>' : '<span class="tag" title="Copiata da te da un avviso">inserita da te' + (a.fonte ? ' · ' + U.esc(a.fonte) : '') + '</span>') +
      '</div>' +
      '<h4>' + U.esc(a.titolo) + '</h4>' +
      (luogo ? '<div class="where">' + U.esc(luogo) + '</div>' : '') +
      '<dl class="kv">' +
        '<div><dt>' + (a.fonte === 'Agenzia del Demanio' ? 'Termine offerte' : 'Data asta') + '</dt><dd>' + U.dataIt(a.dataAsta) + (a.ora ? ' ' + U.esc(a.ora) : '') + (q ? ' <span class="muted" style="font-size:12px">(' + q + ')</span>' : '') + '</dd></div>' +
        '<div><dt>Prezzo base</dt><dd>' + (a.prezzoBase ? U.eur(a.prezzoBase) : '<span class="muted">nell\'avviso</span>') + '</dd></div>' +
        '<div><dt>Offerta minima</dt><dd>' + (min ? U.eur(min) : '—') + '</dd></div>' +
        (st ? '<div><dt>Sconto stimato*</dt><dd><span class="pill p-' + st.giudizio.tono + '" title="Costo totale stimato al prezzo base: ' + U.eur(st.totale) + '">' + U.pct(st.sconto, 0) + ' · ' + st.giudizio.etichetta + '</span></dd></div>'
            : '<div><dt>Valore di mercato</dt><dd class="muted">non indicato</dd></div>') +
      '</dl>' +
      '<div class="links">' + (avviso ? '<a href="' + U.esc(avviso) + '" target="_blank" rel="noopener">Avviso originale ↗</a>' : '<span class="muted">Avviso mancante</span>') +
        (pdf ? '<a href="' + U.esc(pdf) + '" target="_blank" rel="noopener">Avviso PDF ↗</a>' : '') +
        (perizia ? '<a href="' + U.esc(perizia) + '" target="_blank" rel="noopener">Perizia ↗</a>' : (a.origine === 'raccolta' && !pdf ? '<span class="muted">Perizia tra gli allegati dell\'avviso</span>' : (pdf ? '' : '<span class="muted">Perizia non indicata</span>'))) + '</div>' +
        (Array.isArray(a.altriLink) && a.altriLink.length ? '<div class="links" style="font-size:13px"><span class="muted">Anche su:</span>' + a.altriLink.filter(function (l) { return U.linkSicuro(l[1]); }).map(function (l) { return '<a href="' + U.esc(l[1]) + '" target="_blank" rel="noopener">' + U.esc(l[0]) + ' ↗</a>'; }).join('') + '</div>' : '') +
      '<div class="actions">' +
        '<a class="btn small" href="calcolatore.html?id=' + encodeURIComponent(a.id) + '" data-passa="id:' + U.esc(a.id) + '">Conviene?</a>' +
        '<button class="btn small ghost" type="button" data-segui="' + U.esc(a.id) + '" aria-pressed="' + !!seg + '">' + (seg ? 'Seguita ✓' : 'Segui') + '</button>' +
        (a.origine === 'manuale' ? '<button class="btn small ghost" type="button" data-modifica="' + U.esc(a.id) + '">Modifica</button><button class="btn small danger" type="button" data-elimina="' + U.esc(a.id) + '">Elimina</button>' : '') +
      '</div></article>';
  }

  function ordina(lista) {
    var f = filtri.ordina;
    return lista.sort(function (a, b) {
      if (f === 'prezzo-asc') return (a.prezzoBase || 0) - (b.prezzoBase || 0);
      if (f === 'prezzo-desc') return (b.prezzoBase || 0) - (a.prezzoBase || 0);
      if (f === 'sconto') { var x = C.stimaRapida(a, T), y = C.stimaRapida(b, T); return (y ? y.sconto : -9) - (x ? x.sconto : -9); }
      return (a.dataAsta || '9999').localeCompare(b.dataAsta || '9999');
    });
  }

  function render(mantieni) {
    if (!mantieni) mostrate = PASSO;
    seguite = S.idSeguite();
    var tutte = S.aste();
    var lista = ordina(tutte.filter(filtro(filtri, nuoveDal)));
    renderRicerche(tutte);
    $('#conteggio').textContent = lista.length.toLocaleString('it-IT') + ' di ' + tutte.length.toLocaleString('it-IT') + (tutte.length === 1 ? ' asta' : ' aste');
    if (!tutte.length) {
      $('#elenco').innerHTML = '<div class="empty panel" style="grid-column:1/-1"><h2>Nessuna asta da mostrare</h2>' +
        '<p>Non ci sono aste raccolte dalle fonti ufficiali (la raccolta non è ancora stata eseguita o nessuna fonte ha restituito dati) e non hai inserito aste a mano. Qui non vengono mai mostrati dati di esempio o inventati.</p>' +
        '<p><a href="fonti.html">Vedi lo stato di ogni fonte</a> · oppure <a href="#boxAggiungi" id="apriAggiungi">aggiungi un\'asta da un avviso reale</a></p></div>';
      var ap = $('#apriAggiungi'); if (ap) ap.addEventListener('click', function () { $('#boxAggiungi').open = true; });
    } else if (!lista.length) {
      $('#elenco').innerHTML = '<div class="empty panel" style="grid-column:1/-1"><h2>Nessuna asta corrisponde ai filtri</h2><p>Allarga la ricerca o <button class="btn small ghost" type="button" id="azzera2">azzera i filtri</button>' +
        (!filtri.passate ? ' (le aste già concluse sono nascoste)' : '') + '.</p></div>';
      $('#azzera2').addEventListener('click', azzera);
    } else {
      var pagina = lista.slice(0, mostrate);
      $('#elenco').innerHTML = pagina.map(scheda).join('') +
        (lista.length > mostrate ? '<div style="grid-column:1/-1;text-align:center"><button class="btn ghost" type="button" id="altre">Mostra altre ' + Math.min(PASSO, lista.length - mostrate) + ' (ne restano ' + (lista.length - mostrate).toLocaleString('it-IT') + ')</button></div>' : '') +
        (pagina.some(function (a) { return C.stimaRapida(a, T); }) ? '<p class="note" style="grid-column:1/-1">* Sconto stimato al prezzo base con ipotesi prudenti (niente agevolazione prima casa, 1.500 € di spese di procedura, 3.000 € di liberazione se occupato). Per una stima vera usa "Conviene?".</p>' : '');
      var b = $('#altre'); if (b) b.addEventListener('click', function () { mostrate += PASSO; render(true); });
    }
    var trib = {}; tutte.forEach(function (a) { if (a.tribunale) trib[a.tribunale] = 1; });
    $('#listaTribunali').innerHTML = Object.keys(trib).sort().map(function (t) { return '<option value="' + U.esc(t) + '">'; }).join('');
  }

  function statoRaccolta() {
    var R = S.infoRaccolta();
    var attive = (R.fonti || []).filter(function (f) { return f.stato === 'attiva'; });
    var problemi = (R.fonti || []).filter(function (f) { return f.stato === 'bloccata' || (f.stato === 'errore' && f.ultimaRaccolta !== undefined); });
    var box = $('#statoRaccolta');
    if (attive.length && R.aggiornato) {
      box.innerHTML = '<p class="note" style="margin:0">Aste raccolte automaticamente da: ' + attive.map(function (f) { return U.esc(f.nome); }).join(', ') +
        ' · ultimo aggiornamento ' + U.dataIt(R.aggiornato.slice(0, 10)) + ' alle ' + new Date(R.aggiornato).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) + ' · <a href="fonti.html">stato delle fonti</a></p>' +
        (problemi.length ? '<div class="callout warn" style="margin-top:8px">Problemi con: ' + problemi.map(function (f) { return U.esc(f.nome); }).join(', ') + '. <a href="fonti.html">Dettagli</a></div>' : '');
    } else {
      box.innerHTML = '<div class="callout warn"><b>Nessuna asta raccolta automaticamente.</b> La raccolta dalle fonti ufficiali non è ancora stata eseguita su questa copia del sito (vedi README: <code>npm run raccogli</code>). <a href="fonti.html">Stato delle fonti</a>.</div>';
    }
  }

  function azzera() {
    var o = filtri.ordina; filtri = JSON.parse(JSON.stringify(VUOTI)); filtri.ordina = o;
    ricercaAperta = null; nuoveDal = R.visitaPrecedente();
    salvaFiltri(); sincronizzaControlli(); render();
  }

  /* ---------- Ricerche salvate ---------- */
  function renderRicerche(tutte) {
    var l = R.tutte(), box = $('#ricercheSalvate');
    if (!l.length) { box.innerHTML = '<span class="note" style="margin:0">Salva i filtri che usi spesso: vedrai quante aste nuove ci sono ogni volta che torni.</span>'; return; }
    box.innerHTML = l.map(function (r) {
      var n = tutte.filter(filtro(r.filtri, r.ultimaApertura)).filter(function (a) { return R.nuovaDa(a, r.ultimaApertura); }).length;
      return '<span class="ricerca' + (ricercaAperta === r.id ? ' attiva' : '') + '"><button class="chip" type="button" data-apri="' + r.id + '" aria-pressed="' + (ricercaAperta === r.id) + '">' + U.esc(r.nome) +
        (n ? ' <span class="pill p-good">' + n + ' nuove</span>' : '') + '</button><button class="x" type="button" data-togli="' + r.id + '" aria-label="Elimina la ricerca ' + U.esc(r.nome) + '">×</button></span>';
    }).join('');
  }

  /* ---------- Form aggiunta / modifica ---------- */
  var MAPPA = { aTitolo: 'titolo', aCategoria: 'categoria', aRegione: 'regione', aProvincia: 'provincia', aComune: 'comune', aIndirizzo: 'indirizzo',
    aTribunale: 'tribunale', aRge: 'rge', aPrezzoBase: 'prezzoBase', aOffertaMinima: 'offertaMinima', aData: 'dataAsta', aStato: 'stato',
    aMercato: 'valoreMercato', aFonte: 'fonte', aLinkAvviso: 'linkAvviso', aLinkPerizia: 'linkPerizia' };

  function riempiForm(d, soloVuoti) {
    if (d.regione) { $('#aRegione').value = d.regione; U.opzioniProvince($('#aProvincia'), d.regione); }
    Object.keys(MAPPA).forEach(function (id) {
      var v = d[MAPPA[id]], el = $('#' + id);
      if (v === undefined || v === null || v === '') return;
      if (soloVuoti && el.value && el.tagName !== 'SELECT') return;
      if (el.tagName === 'SELECT' && !el.querySelector('option[value="' + String(v).replace(/"/g, '') + '"]') && !Array.prototype.some.call(el.options, function (o) { return o.text === v; })) return;
      el.value = v;
    });
  }

  function datiForm() {
    var d = {}; Object.keys(MAPPA).forEach(function (id) { d[MAPPA[id]] = $('#' + id).value; }); return d;
  }

  function modalitaModifica(a) {
    $('#formAsta').reset(); $('#aId').value = a ? a.id : '';
    if (a) riempiForm(a);
    $('#salvaAsta').textContent = a ? 'Salva modifiche' : 'Aggiungi all\'elenco';
    $('#titoloForm').textContent = a ? 'Modifica: ' + a.titolo : 'Aggiungi un\'asta';
    $('#annullaModifica').hidden = !a;
    if (a) { $('#boxAggiungi').open = true; $('#boxAggiungi').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }

  /* ---------- Avvio ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    caricaFiltri();
    var pq = U.parametro('provincia');
    if (pq && window.GEO.province[pq]) { filtri.provincia = pq; filtri.regione = window.GEO.province[pq].regione; salvaFiltri(); }
    // sul telefono i filtri avanzati partono chiusi (si aprono da soli se ce n'è uno attivo)
    if (window.matchMedia('(max-width: 700px)').matches && !(filtri.regione || filtri.provincia || filtri.tribunale || filtri.min || filtri.max || filtri.dal || filtri.al || filtri.stato || filtri.passate)) $('#altriFiltri').open = false;
    U.opzioniRegioni($('#fRegione'), true);
    U.opzioniRegioni($('#aRegione')); U.opzioniProvince($('#aProvincia'), '');
    sincronizzaControlli(); statoRaccolta(); render();
    $('#colonneCsv').textContent = S.campi.join(';');

    $('#fCat').addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      filtri.cat = b.dataset.cat; salvaFiltri(); sincronizzaControlli(); render();
    });
    var attesa;
    $('#filtri').addEventListener('input', function (e) {
      if (e.target.id === 'fRegione') { U.opzioniProvince($('#fProvincia'), e.target.value, true); $('#fProvincia').value = ''; }
      clearTimeout(attesa);
      // la ricerca testuale aspetta che si smetta di scrivere; gli altri filtri sono immediati
      attesa = setTimeout(function () { leggiControlli(); salvaFiltri(); render(); }, e.target.id === 'fTesto' ? 150 : 0);
    });
    $('#filtri').addEventListener('submit', function (e) { e.preventDefault(); });
    $('#ordina').addEventListener('change', function () { leggiControlli(); salvaFiltri(); render(); });
    $('#azzera').addEventListener('click', azzera);

    $('#salvaRicerca').addEventListener('click', function () { $('#formRicerca').hidden = !$('#formRicerca').hidden; if (!$('#formRicerca').hidden) $('#nomeRicerca').focus(); });
    function salvaRicerca() {
      var nome = $('#nomeRicerca').value.trim();
      if (!nome) { $('#nomeRicerca').focus(); return; }
      leggiControlli(); var r = R.salva(nome, filtri); ricercaAperta = r.id;
      $('#nomeRicerca').value = ''; $('#formRicerca').hidden = true; render(true); U.toast('Ricerca salvata');
    }
    $('#confermaRicerca').addEventListener('click', salvaRicerca);
    $('#nomeRicerca').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); salvaRicerca(); } });
    $('#ricercheSalvate').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.togli) { U.conferma(b, 'Elimina?', function () { R.rimuovi(b.dataset.togli); if (ricercaAperta === b.dataset.togli) ricercaAperta = null; render(true); }); return; }
      var x = R.apri(b.dataset.apri); if (!x) return;
      var o = filtri.ordina; filtri = JSON.parse(JSON.stringify(VUOTI)); for (var k in x.ricerca.filtri) filtri[k] = x.ricerca.filtri[k]; filtri.ordina = o; filtri.nuove = false;
      ricercaAperta = x.ricerca.id; nuoveDal = x.dal;   // evidenzia le aste nuove dall'ultima apertura di questa ricerca
      salvaFiltri(); sincronizzaControlli(); render();
      U.toast('Evidenziate le aste nuove dal ' + U.dataIt(x.dal));
    });

    $('#elenco').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.segui) {
        var id = b.dataset.segui;
        if (S.seguita(id)) { S.smetti(id); U.toast('Rimossa da "Le mie aste"'); } else { S.segui(id); U.toast('Aggiunta a "Le mie aste"'); }
        render(true);
      } else if (b.dataset.modifica) modalitaModifica(S.asta(b.dataset.modifica));
      else if (b.dataset.elimina) {
        var a = S.asta(b.dataset.elimina);
        if (a) U.conferma(b, 'Conferma: elimina', function () { S.rimuovi(a.id); render(true); U.toast('Asta eliminata'); });
      }
    });

    $('#aRegione').addEventListener('change', function () { U.opzioniProvince($('#aProvincia'), this.value); });
    $('#aProvincia').addEventListener('change', function () {
      var p = window.GEO.province[this.value]; if (p && !$('#aRegione').value) { $('#aRegione').value = p.regione; U.opzioniProvince($('#aProvincia'), p.regione); this.value = p.sigla; }
    });
    $('#aPrezzoBase').addEventListener('input', function () {
      $('#aOffertaMinima').placeholder = this.value ? '75% = ' + U.eur(C.offertaMinima(this.value, T)) : '75% del prezzo base';
    });
    $('#aLinkAvviso').addEventListener('change', function () {
      var f = window.Parser.fonteDaLink(this.value); if (f && !$('#aFonte').value) $('#aFonte').value = f;
    });

    $('#analizza').addEventListener('click', function () {
      var testo = $('#incolla').value;
      if (!testo.trim()) { $('#esitoAnalisi').textContent = 'Incolla prima il testo dell\'avviso.'; return; }
      var d = window.Parser.analizza(testo, window.GEO);
      var n = Object.keys(d).length;
      riempiForm(d, true);
      $('#esitoAnalisi').textContent = n ? 'Ho compilato ' + n + ' campi: controllali prima di salvare.' : 'Non ho riconosciuto dati: compila i campi a mano.';
      if (!$('#aLinkAvviso').value) $('#esitoAnalisi').textContent += ' Manca il link all\'avviso originale.';
    });

    $('#formAsta').addEventListener('submit', function (e) {
      e.preventDefault();
      var d = datiForm(), id = $('#aId').value;
      if (!d.offertaMinima && d.prezzoBase) d.offertaMinima = C.offertaMinima(d.prezzoBase, T);
      try {
        if (id) { S.aggiorna(id, d); U.toast('Modifiche salvate'); }
        else { S.aggiungi(d); U.toast('Asta aggiunta'); }
      } catch (err) { U.toast(err.message, 5000); return; }
      $('#incolla').value = ''; $('#esitoAnalisi').textContent = '';
      modalitaModifica(null); render();
    });
    $('#annullaModifica').addEventListener('click', function () { modalitaModifica(null); });

    $('#fileImport').addEventListener('change', function () {
      var f = this.files[0]; if (!f) return;
      U.leggiFile(f).then(function (testo) {
        var esito;
        if (/\.json$/i.test(f.name) || /^\s*[\[{]/.test(testo)) {
          var j = JSON.parse(testo);
          esito = Array.isArray(j) ? S.importa(j) : S.ripristina(j);
        } else esito = S.importa(U.csvParse(testo));
        render();
        U.toast('Importate ' + esito.importate + ' aste.' + (esito.scartate ? ' Scartate ' + esito.scartate + ' righe senza link all\'avviso o senza titolo.' : ''), 5000);
      }).catch(function (err) { U.toast('Importazione non riuscita: ' + err.message, 5000); });
      this.value = '';
    });
    $('#esportaCsv').addEventListener('click', function () {
      var lista = ordina(S.aste().filter(filtro(filtri, nuoveDal)));
      U.offriFile('radar-aste.csv', U.csvStringify(lista, S.campi.concat(['origine'])), 'text/csv;charset=utf-8');
    });
    $('#esportaJson').addEventListener('click', function () {
      U.offriFile('radar-aste-backup.json', JSON.stringify(S.backup(), null, 2), 'application/json');
    });
    $('#modelloCsv').addEventListener('click', function () {
      U.offriFile('modello-aste.csv', U.csvStringify([], S.campi), 'text/csv;charset=utf-8');
    });
  });
})();
