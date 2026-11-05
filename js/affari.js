/* Sezione "Affari di oggi" della home: i migliori del giorno scelti dall'Agente Cacciatore
 * (data/affari.js, scritto ogni mattina da scripts/cacciatore.mjs) e la selezione personale
 * secondo le preferenze salvate nel browser (zona, budget, categoria, strategia). */
(function (root) {
  'use strict';
  var U = root.UI, K = root.Cacciatore, G = root.GEO;
  var CHIAVE = 'radaraste.preferenze';
  var STRATEGIE = { '': 'Qualsiasi', vivo: 'Ci vado a vivere', affitto: 'Lo affitto', rivendo: 'Ristrutturo e rivendo' };
  var CATEGORIE = { '': 'Tutte', immobile: 'Immobili', auto: 'Auto', moto: 'Moto', beni: 'Beni mobili' };

  function preferenze() { try { return JSON.parse(localStorage.getItem(CHIAVE)) || null; } catch (e) { return null; } }
  function salva(p) { try { localStorage.setItem(CHIAVE, JSON.stringify(p)); } catch (e) { /* senza memoria del browser le preferenze valgono solo ora */ } }

  function anello(p) {
    if (p == null) return '<span class="aff-anello vuoto" title="Senza punteggio">—</span>';
    var f = root.Punteggio ? root.Punteggio.fascia(p).chiave : 'nd';
    return '<span class="aff-anello f-' + f + '" style="--p:' + Math.round(p) + '" title="Punteggio affare ' + Math.round(p) + ' su 100"><b>' + Math.round(p) + '</b></span>';
  }
  function luogo(a) { return [a.comune ? a.comune + (a.provincia ? ' (' + a.provincia + ')' : '') : a.provincia, a.tribunale ? 'Trib. ' + a.tribunale : ''].filter(Boolean).join(' · '); }
  function linkScheda(a, testo, cls) { return '<a' + (cls ? ' class="' + cls + '"' : '') + ' href="scheda.html?id=' + encodeURIComponent(a.id) + '" data-passa="id:' + U.esc(a.id) + '">' + testo + '</a>'; }

  function card(a, i) {
    var r = a.riassunto || {}, avviso = U.linkSicuro(a.linkAvviso);
    var motivo = { ribasso: 'Ribassata ieri', 'nuovo-tentativo': 'Nuovo tentativo', nuova: 'Nuova' }[a.motivo] || 'Nuova';
    return '<article class="aff-card rivela" style="--i:' + i + '">' +
      '<header class="aff-testa">' + anello(a.punteggio) + '<div class="aff-tit"><span class="aff-motivo">' + U.esc(motivo) + (a.affidabilita ? ' · affidabilità ' + U.esc(a.affidabilita) : '') + '</span>' +
        '<h3>' + linkScheda(a, U.esc(a.titolo)) + '</h3><p class="aff-luogo">' + U.esc(luogo(a)) + '</p></div></header>' +
      '<dl class="aff-numeri"><div><dt>Prezzo base</dt><dd>' + U.eur(a.prezzoBase) + '</dd></div>' +
        '<div><dt>Sconto reale</dt><dd class="buono">' + (a.sconto != null ? U.pct(a.sconto, 0) : '—') + '</dd></div>' +
        '<div><dt>Offerta massima</dt><dd>' + (a.offertaMax ? U.eur(a.offertaMax) : '—') + '</dd></div></dl>' +
      (r.perche && r.perche.length ? '<div class="aff-blocco"><h4>Perché conviene</h4><ul>' + r.perche.map(function (x) { return '<li>' + U.esc(x) + '</li>'; }).join('') + '</ul></div>' : '') +
      (r.rischi && r.rischi.length ? '<div class="aff-blocco rischi"><h4>Rischi principali</h4><ul>' + r.rischi.slice(0, 4).map(function (x) { return '<li>' + U.esc(x) + '</li>'; }).join('') + '</ul></div>' : '') +
      (r.scadenza ? '<p class="aff-scadenza">' + U.icona('calendario') + U.esc(r.scadenza.testo) + '</p>' : '') +
      (r.nonSappiamo && r.nonSappiamo.length ? '<details class="aff-non"><summary>Cosa non sappiamo (' + r.nonSappiamo.length + ')</summary><ul>' + r.nonSappiamo.map(function (x) { return '<li>' + U.esc(x) + '</li>'; }).join('') + '</ul></details>' : '') +
      (r.altriLotti ? '<p class="aff-nota">' + U.esc(r.altriLotti) + '</p>' : '') +
      '<div class="aff-azioni">' + linkScheda(a, 'Apri la scheda', 'btn small') + (avviso ? '<a class="btn small ghost" href="' + U.esc(avviso) + '" target="_blank" rel="noopener">Avviso originale ' + U.icona('esterno') + '</a>' : '') + '</div>' +
      '</article>';
  }

  function riepilogoGiro(A) {
    var sc = A.scartate || {}, parti = Object.keys(sc).sort(function (x, y) { return sc[y] - sc[x]; }).map(function (k) { return sc[k].toLocaleString('it-IT') + ' ' + k; });
    var n = (A.analizzate || 0), s = (A.migliori || []).length;
    return 'L\'agente ha analizzato <b>' + n.toLocaleString('it-IT') + '</b>' + (n === 1 ? ' asta nuova o ribassata' : ' aste nuove o ribassate') + ' nelle ultime 24 ore e ' +
      (!s ? 'non ne ha scelta nessuna.' : 'ne ha ' + (s === 1 ? 'scelta' : 'scelte') + ' <b>' + s + '</b>.') +
      (parti.length ? ' Scartate: ' + U.esc(parti.join(', ')) + '.' : '');
  }

  // con zero affari lo dice già il riquadro vuoto sotto
  function notaGiro(A) {
    var m = (A.migliori || []).length;
    if (!m) return '';
    var n = K && K.nota ? K.nota(m, A.criteri && A.criteri.minimi ? A.criteri : null) : A.nota;
    return n ? ' ' + U.esc(n) : '';
  }

  function formPreferenze(p) {
    p = p || {};
    var regioni = (G && G.regioni) || [];
    return '<form class="aff-pref" id="affPref" hidden>' +
      '<label>Regione<select name="regione"><option value="">Tutta Italia</option>' + regioni.map(function (r) { return '<option' + ((p.regioni || [])[0] === r ? ' selected' : '') + '>' + U.esc(r) + '</option>'; }).join('') + '</select></label>' +
      '<label>Budget massimo (costo totale)<input name="budget" type="number" inputmode="numeric" min="0" step="1000" placeholder="es. 120000" value="' + (p.budget || '') + '"></label>' +
      '<label>Categoria<select name="categoria">' + Object.keys(CATEGORIE).map(function (k) { return '<option value="' + k + '"' + (p.categoria === k ? ' selected' : '') + '>' + CATEGORIE[k] + '</option>'; }).join('') + '</select></label>' +
      '<label>Strategia<select name="strategia">' + Object.keys(STRATEGIE).map(function (k) { return '<option value="' + k + '"' + (p.strategia === k ? ' selected' : '') + '>' + STRATEGIE[k] + '</option>'; }).join('') + '</select></label>' +
      '<div class="aff-pref-azioni"><button class="btn small" type="submit">Mostra la mia selezione</button><button class="btn small quiet" type="button" id="affPrefAzzera">Azzera</button></div>' +
      '<p class="nota">Le preferenze restano solo in questo browser.</p></form>';
  }

  function personale(A, p) {
    var box = document.getElementById('affPersonale');
    if (!box) return;
    if (!p) { box.innerHTML = ''; return; }
    var l = K ? K.personale(A.piscina || [], p, 5) : [];
    var descr = [p.regioni && p.regioni[0], p.budget ? 'fino a ' + U.eur(p.budget) : '', p.categoria ? CATEGORIE[p.categoria] : '', p.strategia ? STRATEGIE[p.strategia] : ''].filter(Boolean).join(' · ') || 'nessun filtro';
    box.innerHTML = '<h3 class="aff-sottotitolo">La tua selezione <small>' + U.esc(descr) + '</small></h3>' +
      (l.length ? '<div class="aff-griglia">' + l.map(card).join('') + '</div>'
        : '<p class="aff-vuoto">Oggi nessuna asta nuova o ribassata corrisponde alle tue preferenze e supera i criteri dell\'agente. Torna domani: l\'agente riparte ogni mattina.</p>');
    if (U.osservaComparsa) U.osservaComparsa(box);
  }

  /* opz: { compatto: true (home: solo le prime "massimo" schede e il link alla pagina), massimo, titolo ('h1'|'h2') } */
  function disegna(sel, opz) {
    opz = opz || {};
    var el = document.querySelector(sel);
    if (!el) return;
    var A = root.AFFARI, tag = opz.titolo || 'h2';
    var testa = '<div class="aff-intesta"><div><p class="eyebrow">' + U.icona('mirino') + ' Agente Cacciatore di affari</p><' + tag + ' id="h-affari">Affari <em>di oggi</em></' + tag + '></div>' +
      (opz.compatto ? '<a class="link-sez" href="affari.html">Tutti gli affari di oggi ' + U.icona('freccia') + '</a>'
        : '<button class="btn small ghost" type="button" id="affPrefApri" aria-expanded="false" aria-controls="affPref">' + U.icona('filtro') + ' Le mie preferenze</button>') + '</div>';
    if (!A) {
      el.innerHTML = testa + '<p class="aff-vuoto">L\'agente gira ogni mattina dopo la raccolta delle aste: i risultati di oggi non sono ancora disponibili.</p>';
      return;
    }
    var p = opz.compatto ? null : preferenze();
    var lista = (A.migliori || []).slice(0, opz.massimo || 10);
    el.innerHTML = testa + (opz.compatto ? '' : formPreferenze(p)) +
      // la nota si riscrive con le regole di oggi (i file di dati vecchi possono avere la frase di prima)
      '<p class="aff-giro">' + riepilogoGiro(A) + notaGiro(A) + '</p>' +
      (lista.length ? '<div class="aff-griglia">' + lista.map(card).join('') + '</div>'
        : '<p class="aff-vuoto">Oggi nessuna asta nuova o ribassata supera tutti i criteri (valore stimabile e affidabile, sconto reale almeno del 15%, punteggio almeno 50). Meglio nessun consiglio che un consiglio incerto.</p>') +
      (opz.compatto ? '' : '<div id="affPersonale"></div>' +
      '<p class="aff-avvertenza">Riassunti scritti a regole dai dati degli avvisi, senza intelligenza artificiale. Le stime non sostituiscono notaio, avvocato o commercialista.</p>');
    if (opz.compatto) { if (U.osservaComparsa) U.osservaComparsa(el); return; }
    var form = document.getElementById('affPref'), apri = document.getElementById('affPrefApri');
    apri.addEventListener('click', function () { form.hidden = !form.hidden; apri.setAttribute('aria-expanded', String(!form.hidden)); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = new FormData(form), np = { regioni: f.get('regione') ? [f.get('regione')] : [], budget: Number(f.get('budget')) || 0, categoria: f.get('categoria') || '', strategia: f.get('strategia') || '' };
      salva(np); personale(A, np); U.toast('Preferenze salvate in questo browser');
    });
    document.getElementById('affPrefAzzera').addEventListener('click', function () { try { localStorage.removeItem(CHIAVE); } catch (e) { /* niente */ } form.reset(); personale(A, null); });
    if (p) personale(A, p);
    if (U.osservaComparsa) U.osservaComparsa(el);
  }

  root.Affari = { disegna: disegna, preferenze: preferenze };
})(window);
