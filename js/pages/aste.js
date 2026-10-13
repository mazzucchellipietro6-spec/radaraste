/* Pagina "Aste": elenco con filtri, inserimento da avviso reale, import/export. */
(function () {
  'use strict';
  var T = window.TARIFFE, U = window.UI, S = window.Store, C = window.Calcoli, $ = U.$, $$ = U.$$;
  var K_FILTRI = 'radaraste.filtri';
  // comune: comune esatto (dalla ricerca istantanea); bbox: [sud, ovest, nord, est], zona scelta sulla mappa
  var VUOTI = { cat: '', testo: '', regione: '', provincia: '', comune: '', tribunale: '', min: '', max: '', dal: '', al: '', stato: '', passate: false, nuove: false, bbox: null, ordina: 'data' };
  var ORDINI = ['data', 'prezzo-asc', 'prezzo-desc', 'punteggio', 'sconto'];
  var filtri = vuoti();
  var PASSO = 60, mostrate = PASSO, seguite = {};
  var R = window.Ricerche, nuoveDal = R.visitaPrecedente(), ricercaAperta = null;

  /* ---------- Filtri ---------- */
  function vuoti() { return JSON.parse(JSON.stringify(VUOTI)); }
  function bboxValido(v) {
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return null; } }
    if (!Array.isArray(v) || v.length !== 4) return null;
    var n = v.map(Number);
    if (!n.every(isFinite)) return null;
    var sud = Math.min(n[0], n[2]), nord = Math.max(n[0], n[2]), ovest = Math.min(n[1], n[3]), est = Math.max(n[1], n[3]);
    if (sud < -90 || nord > 90 || ovest < -180 || est > 180) return null;
    return [sud, ovest, nord, est];
  }
  // filtri da indirizzo, ricerca istantanea, mappa o memoria del browser: si tengono solo le chiavi note e valori sensati
  function applica(fx, base) {
    var f = base || vuoti();
    if (!fx || typeof fx !== 'object') return f;
    Object.keys(VUOTI).forEach(function (k) {
      if (!(k in fx) || fx[k] == null) return;
      if (k === 'bbox') f.bbox = bboxValido(fx.bbox);
      else if (typeof VUOTI[k] === 'boolean') f[k] = !!fx[k];
      else f[k] = String(fx[k]).trim();
    });
    var G = window.GEO;
    if (f.provincia && !G.province[f.provincia]) f.provincia = '';
    if (f.provincia && !f.regione) f.regione = G.province[f.provincia].regione;
    if (f.regione && G.regioni.indexOf(f.regione) < 0) { f.regione = ''; f.provincia = ''; }
    if (ORDINI.indexOf(f.ordina) < 0) f.ordina = 'data';
    return f;
  }
  function caricaFiltri() {
    try { var f = JSON.parse(localStorage.getItem(K_FILTRI) || 'null'); if (f) filtri = applica(f); } catch (e) {}
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

  var oggi = U.oggi();   // data locale, come quella delle etichette (non UTC)
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
    if (filtri.comune && a.comune !== filtri.comune) return false;
    if (filtri.bbox) {
      var b = filtri.bbox;   // [sud, ovest, nord, est]: solo aste con coordinate dentro il riquadro
      if (a.lat == null || a.lng == null || a.lat < b[0] || a.lat > b[2] || a.lng < b[1] || a.lng > b[3]) return false;
    }
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
    return window.Schede.card(a, { seguita: !!seguite[a.id], nuova: R.nuovaDa(a, nuoveDal), confronto: true, selezionata: window.Confronto.ha(a.id) });
  }

  // valore per l'ordinamento; null = dato mancante, che finisce sempre in fondo (qualunque sia il verso)
  function chiave(a, f) {
    if (f === 'prezzo-asc' || f === 'prezzo-desc') return a.prezzoBase > 0 ? a.prezzoBase : null;
    if (f === 'punteggio') return a.punteggio != null && isFinite(a.punteggio) ? a.punteggio : null;
    if (f === 'sconto') {
      if (a.sconto != null && isFinite(a.sconto)) return a.sconto;
      var st = C.stimaRapida(a, T); return st ? st.sconto : null;
    }
    return null;
  }
  function ordina(lista) {
    var f = filtri.ordina, verso = f === 'prezzo-asc' ? 1 : -1;
    function perData(a, b) { return (a.dataAsta || '9999').localeCompare(b.dataAsta || '9999'); }
    if (f === 'data') return lista.sort(perData);
    lista.forEach(function (a) { a._ord = chiave(a, f); });
    return lista.sort(function (a, b) {
      var x = a._ord, y = b._ord;
      if (x === null && y === null) return perData(a, b);
      if (x === null) return 1;
      if (y === null) return -1;
      return verso * (x - y) || perData(a, b);
    });
  }

  /* ---------- Filtri attivi, conteggio, foglio "Filtri" su telefono ---------- */
  function quantiFiltri() {
    var n = 0;
    ['provincia', 'comune', 'tribunale', 'min', 'max', 'dal', 'al', 'stato'].forEach(function (k) { if (filtri[k]) n++; });
    if (filtri.regione && !filtri.provincia) n++;
    if (filtri.passate) n++;
    if (filtri.nuove) n++;
    if (filtri.bbox) n++;
    return n;
  }
  // chip con ✕ per i filtri che non hanno un controllo visibile (comune, zona della mappa) e, su telefono, per quelli chiusi nel foglio
  function chipFiltri() {
    var c = [];
    function chip(testo, chiavi, sempre) { c.push('<button class="chip attivo' + (sempre ? '' : ' solo-tel') + '" type="button" data-togli="' + chiavi + '" aria-label="Togli il filtro: ' + U.esc(testo) + '">' + U.esc(testo) + ' <span aria-hidden="true">✕</span></button>'); }
    if (filtri.bbox) chip('Zona scelta sulla mappa', 'bbox', true);
    if (filtri.comune) chip('Comune: ' + filtri.comune, 'comune', true);
    if (filtri.provincia) { var p = window.GEO.province[filtri.provincia]; chip('Provincia di ' + (p ? p.nome : filtri.provincia), 'provincia,regione,comune'); }
    else if (filtri.regione) chip(filtri.regione, 'regione,provincia,comune');
    if (filtri.tribunale) chip('Tribunale: ' + filtri.tribunale, 'tribunale');
    if (filtri.min || filtri.max) chip('Prezzo ' + (filtri.min ? 'da ' + U.eur(filtri.min) + ' ' : '') + (filtri.max ? 'fino a ' + U.eur(filtri.max) : ''), 'min,max');
    if (filtri.dal || filtri.al) chip('Asta ' + (filtri.dal ? 'dal ' + U.dataIt(filtri.dal) + ' ' : '') + (filtri.al ? 'al ' + U.dataIt(filtri.al) : ''), 'dal,al');
    if (filtri.stato) chip(U.STATI[filtri.stato] || filtri.stato, 'stato');
    if (filtri.nuove) chip(R.primaVisita() && nuoveDal === R.visitaPrecedente() ? 'Solo nuove (ultime 24 ore)' : 'Solo nuove', 'nuove');
    if (filtri.passate) chip('Anche concluse', 'passate');
    $('#filtriAttivi').innerHTML = c.join('');
    var n = quantiFiltri(), nf = $('#nFiltri');
    nf.hidden = !n; nf.textContent = n;
    $('#apriFiltri').setAttribute('aria-label', 'Filtri' + (n ? ' (' + n + ' attivi)' : ''));
  }
  function testoNuove() {
    var prec = R.visitaPrecedente();
    $('#fNuoveTesto').textContent = R.primaVisita()
      ? 'Solo nuove nelle ultime 24 ore (è la tua prima visita)'
      : 'Solo nuove dall\'ultima visita (' + U.dataIt(prec) + ')';
  }

  var mqFoglio = window.matchMedia('(max-width: 899px)');
  function foglio() { return $('#pannelloFiltri'); }
  function apriFiltri() {
    var p = foglio(); if (!mqFoglio.matches || p.hasAttribute('data-aperto')) return;
    var v = $('#veloFiltri');
    if (!v) { v = document.createElement('div'); v.id = 'veloFiltri'; v.className = 'velo'; v.addEventListener('click', chiudiFiltri); document.body.appendChild(v); void v.offsetWidth; }
    v.setAttribute('data-aperto', ''); p.setAttribute('data-aperto', '');
    $('#apriFiltri').setAttribute('aria-expanded', 'true');
    document.documentElement.classList.add('foglio-aperto');
    U.apriFinestra(p, $('#chiudiFiltri'));
  }
  function chiudiFiltri() {
    var p = foglio(); if (!p.hasAttribute('data-aperto')) return;
    p.removeAttribute('data-aperto'); var v = $('#veloFiltri'); if (v) v.removeAttribute('data-aperto');
    $('#apriFiltri').setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('foglio-aperto');
    U.chiudiFinestra(p);
  }
  // su telefono il pannello è una finestra (chiusa = inert); su computer è un pannello normale
  function modoFiltri() {
    var p = foglio();
    if (mqFoglio.matches) {
      U.finestra(p, chiudiFiltri);
      if (!p.hasAttribute('data-aperto')) { p.inert = true; p.setAttribute('inert', ''); }
      $('#apriFiltri').setAttribute('aria-expanded', String(p.hasAttribute('data-aperto')));
    } else {
      chiudiFiltri();
      p.inert = false; p.removeAttribute('inert'); p.removeAttribute('role'); p.removeAttribute('aria-modal');
      $('#apriFiltri').removeAttribute('aria-expanded');
    }
  }

  function render(mantieni) {
    if (!mantieni) mostrate = PASSO;
    seguite = S.idSeguite();
    var tutte = S.aste();
    var lista = ordina(tutte.filter(filtro(filtri, nuoveDal)));
    renderRicerche(tutte);
    $('#conteggio').textContent = lista.length.toLocaleString('it-IT') + ' di ' + tutte.length.toLocaleString('it-IT') + (tutte.length === 1 ? ' asta' : ' aste');
    $('#mostraRisultati').textContent = lista.length ? 'Mostra ' + lista.length.toLocaleString('it-IT') + (lista.length === 1 ? ' asta' : ' aste') : 'Nessuna asta: cambia i filtri';
    $('#elenco').removeAttribute('aria-busy');
    chipFiltri();
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
        (pagina.some(function (a) { return a.sconto == null && C.stimaRapida(a, T); }) ? '<p class="note" style="grid-column:1/-1">"Sconto stimato": calcolato al prezzo base con il valore di mercato che hai inserito e ipotesi prudenti (niente agevolazione prima casa, 1.500 € di spese di procedura, 3.000 € di liberazione se occupato). Per una stima vera usa "Conviene?".</p>' : '') +
        (filtri.ordina !== 'data' && lista.some(function (a) { return a._ord === null; }) ? '<p class="note" style="grid-column:1/-1">Le aste senza il dato usato per ordinare (prezzo, punteggio o sconto) sono in fondo all\'elenco.</p>' : '');
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
      box.innerHTML = '<p class="note info-raccolta" style="margin:0">Aste raccolte automaticamente da: ' + attive.map(function (f) { return U.esc(f.nome); }).join(', ') +
        ' · ultimo aggiornamento ' + U.dataIt(R.aggiornato.slice(0, 10)) + ' alle ' + new Date(R.aggiornato).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) + ' · <a href="fonti.html">stato delle fonti</a></p>' +
        (problemi.length ? '<div class="callout warn" style="margin-top:8px">Problemi con: ' + problemi.map(function (f) { return U.esc(f.nome); }).join(', ') + '. <a href="fonti.html">Dettagli</a></div>' : '');
    } else {
      box.innerHTML = '<div class="callout warn"><b>Nessuna asta raccolta automaticamente.</b> La raccolta dalle fonti ufficiali non è ancora stata eseguita su questa copia del sito (vedi README: <code>npm run raccogli</code>). <a href="fonti.html">Stato delle fonti</a>.</div>';
    }
  }

  function azzera() {
    var o = filtri.ordina; filtri = vuoti(); filtri.ordina = o;
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
    // filtri arrivati da altre pagine (ricerca istantanea, mappa, home): ?provincia=, ?regione=, ?comune=, ?filtri={json}
    // (anche tramite data-passa, vedi UI.parametro). Es. zona della mappa: ?filtri={"bbox":[sud,ovest,nord,est]}
    var pq = U.parametro('provincia'), pr = U.parametro('regione'), pc = U.parametro('comune');
    if (pq || pr || pc) { filtri = applica({ provincia: pq || '', regione: pr || '', comune: pc || '' }); salvaFiltri(); }
    var pf = U.parametro('filtri');
    if (pf) { try { filtri = applica(JSON.parse(pf)); salvaFiltri(); } catch (e) { U.toast('Filtri nell\'indirizzo non validi: li ignoro'); } }
    var pz = U.parametro('filtro');
    if (pz === 'nuove') { filtri = vuoti(); filtri.nuove = true; nuoveDal = R.ultimeOre24(); salvaFiltri(); }
    if (pz === 'settimana') { filtri = vuoti(); filtri.dal = oggi; filtri.al = window.Riepilogo ? window.Riepilogo.piu(oggi, 7) : ''; salvaFiltri(); }
    U.opzioniRegioni($('#fRegione'), true);
    U.opzioniRegioni($('#aRegione')); U.opzioniProvince($('#aProvincia'), '');
    testoNuove();
    sincronizzaControlli(); statoRaccolta(); render();
    $('#colonneCsv').textContent = S.campi.join(';');

    modoFiltri();
    if (mqFoglio.addEventListener) mqFoglio.addEventListener('change', modoFiltri); else if (mqFoglio.addListener) mqFoglio.addListener(modoFiltri);
    $('#apriFiltri').addEventListener('click', apriFiltri);
    $('#chiudiFiltri').addEventListener('click', chiudiFiltri);
    $('#mostraRisultati').addEventListener('click', function () { chiudiFiltri(); $('#h-elenco').scrollIntoView({ block: 'start', behavior: U.menoMovimento() ? 'auto' : 'smooth' }); });
    $('#azzeraFoglio').addEventListener('click', azzera);
    $('#filtriAttivi').addEventListener('click', function (e) {
      var b = e.target.closest('[data-togli]'); if (!b) return;
      b.dataset.togli.split(',').forEach(function (k) { filtri[k] = VUOTI[k]; });
      if (b.dataset.togli === 'nuove') nuoveDal = R.visitaPrecedente();
      salvaFiltri(); sincronizzaControlli(); render();
      var dopo = $('#filtriAttivi .chip') || $('#fTesto'); if (dopo) dopo.focus();
    });

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
      var o = filtri.ordina; filtri = applica(x.ricerca.filtri); filtri.ordina = o; filtri.nuove = false;
      ricercaAperta = x.ricerca.id; nuoveDal = x.dal;   // evidenzia le aste nuove dall'ultima apertura di questa ricerca
      salvaFiltri(); sincronizzaControlli(); render();
      U.toast('Evidenziate le aste nuove dal ' + U.dataIt(x.dal));
    });

    $('#elenco').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.segui) {
        var id = b.dataset.segui, on = !S.seguita(id);
        if (on) S.segui(id); else S.smetti(id);
        seguite = S.idSeguite();
        window.Schede.aggiornaSegui(b, on);
        U.toast(on ? 'Aggiunta a "Le mie aste"' : 'Rimossa da "Le mie aste"');
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
        U.toast('Importate ' + esito.importate + (esito.importate === 1 ? ' asta' : ' aste') + '.' + (esito.seguite ? ' Ripristinate ' + esito.seguite + ' aste seguite.' : '') +
          (esito.scartate ? ' Scartate ' + esito.scartate + ' righe senza link all\'avviso o senza titolo.' : ''), 5000);
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
