/* Scheda di un'asta in elenco (home, elenco, mappa, confronto).
 * Componenti del design system: .copertina (sfumatura per categoria con icona), .corpo, .anello (punteggio),
 * .preferito (stella "Segui"). I campi arricchiti (punteggio, sconto, affidabilità, valore…) possono mancare:
 * in quel caso la scheda lo dice ("Senza punteggio", "non indicato nell'avviso") e non inventa nulla. */
(function (root) {
  'use strict';
  var U = root.UI, C = root.Calcoli, T = root.TARIFFE;
  var ICONE_CAT = { immobile: 'casa', auto: 'auto', moto: 'moto', beni: 'beni' };
  var AFFIDABILITA = { alta: ['p-good', 'Affidabilità alta'], media: ['p-info', 'Affidabilità media'], bassa: ['p-warn', 'Affidabilità bassa'] };
  var FONTE_VALORE = { omi: 'quotazioni OMI della zona', 'omi-comune': 'quotazioni OMI del comune', perizia: 'stima del perito', 'primo-prezzo': 'prezzo della prima asta', 'prima-asta': 'prezzo base della prima asta' };

  function luogoBreve(a) {
    var p = a.provincia && root.GEO && root.GEO.province[a.provincia];
    if (a.comune) return a.comune + (a.provincia ? ' (' + a.provincia + ')' : '');
    if (p) return 'Provincia di ' + p.nome;
    return a.regione || a.provincia || '';
  }
  function luogo(a) {
    return [luogoBreve(a), a.tribunale ? 'Trib. ' + a.tribunale : '', a.rge ? 'Proc. n. ' + a.rge : ''].filter(Boolean).join(' · ');
  }

  function statoPill(a) {
    if (a.stato === 'libero') return '<span class="pill p-good">Libero</span>';
    if (a.stato === 'occupato') return '<span class="pill p-warn">Occupato</span>';
    // per auto, moto e beni l'occupazione non ha senso: non si mostra nulla
    return a.categoria === 'immobile' ? '<span class="pill p-neutral" title="L\'avviso non dice se l\'immobile è libero o occupato: verificalo nella perizia">Occupazione non indicata</span>' : '';
  }

  function colorePunteggio(p) {
    if (p >= 75) return 'var(--s-100)';
    if (p >= 55) return 'color-mix(in srgb, var(--s-100) 60%, var(--s-50))';
    if (p >= 35) return 'var(--s-50)';
    return 'var(--s-0)';
  }
  function fascia(p) {
    if (root.Punteggio && root.Punteggio.fascia) return root.Punteggio.fascia(p).etichetta;
    return p >= 75 ? 'Ottimo affare' : p >= 55 ? 'Buon affare' : p >= 35 ? 'Da valutare' : 'Poco interessante';
  }

  /* Anello del punteggio affare (0-100) o stato vuoto "Senza punteggio" con la spiegazione nel title. */
  function anello(a, d) {
    var dim = d ? ' style="--d:' + d + 'px"' : '';
    if (a.punteggio == null || !isFinite(a.punteggio)) {
      var perche = 'Senza punteggio: per calcolarlo serve il valore di mercato (stima del perito o prezzo della prima asta), non ancora disponibile per questa asta. Non lo inventiamo.';
      return '<div class="anello-box" title="' + U.esc(perche) + '"><div class="anello vuoto"' + dim + ' role="img" aria-label="Senza punteggio: manca il valore di mercato"><b aria-hidden="true">n.d.</b></div>' +
        '<span class="fascia" aria-hidden="true">Senza punteggio</span></div>';
    }
    var p = Math.max(0, Math.min(100, Math.round(a.punteggio)));
    var parziale = a.punteggioCompleto === false;
    var spiega = 'Punteggio affare ' + p + ' su 100: ' + fascia(p).toLowerCase() + (parziale ? '. Punteggio parziale: alcuni dati mancano, verifica l\'avviso.' : '.');
    return '<div class="anello-box" title="' + U.esc(spiega) + '"><div class="anello" style="--v:' + p + ';--c:' + colorePunteggio(p) + (d ? ';--d:' + d + 'px' : '') + '" role="img" aria-label="' + U.esc(spiega) + '"><b aria-hidden="true">' + p + '</b></div>' +
      '<span class="fascia" aria-hidden="true">' + U.esc(fascia(p)) + (parziale ? '<small>parziale</small>' : '') + '</span></div>';
  }
  function punteggioPill(a) { return anello(a); }

  // sconto sul valore (dato della raccolta) o, per le aste inserite a mano con il valore di mercato, la stima rapida
  function metriche(a, opz) {
    var h = '';
    if (a.sconto != null && isFinite(a.sconto)) {
      var g = C.giudizio(a.sconto, T);
      var val = a.valore ? 'Valore stimato ' + U.eur(a.valore) + (FONTE_VALORE[a.fonteValore] ? ' (' + FONTE_VALORE[a.fonteValore] + ')' : '') + '. ' : '';
      h += '<span class="pill p-' + g.tono + '" title="' + U.esc(val + 'Sconto del costo totale al prezzo base rispetto al valore di mercato.') + '">Sconto ' + U.pct(a.sconto, 0) + '</span>';
    } else {
      var st = C.stimaRapida(a, T);
      if (st) h += '<span class="pill p-' + st.giudizio.tono + '" title="Stima rapida al prezzo base con il valore di mercato che hai inserito: costo totale ' + U.eur(st.totale) + '">Sconto stimato ' + U.pct(st.sconto, 0) + '</span>';
    }
    if (AFFIDABILITA[a.affidabilita]) h += '<span class="pill ' + AFFIDABILITA[a.affidabilita][0] + '" title="Quanto è affidabile il valore di mercato usato per lo sconto">' + AFFIDABILITA[a.affidabilita][1] + '</span>';
    if (!h && !opz.compatta) h = '<span class="nd">Valore di mercato: non ancora disponibile</span>';
    return h ? '<div class="metriche">' + h + '</div>' : '';
  }

  function quando(a) {
    // giorno dell'asta e termine per le offerte (js/formato.js): per il Demanio senza il giorno dell'asta la data è il termine
    var D = root.Formato.date(a), x = D.asta || D.termine, to = D.termine;
    var et = D.asta || (!D.termine && a.fonte !== 'Agenzia del Demanio') ? 'Asta' : 'Termine offerte';
    if (!x) return '<div class="quando">' + U.icona('calendario') + '<span>' + et + ': data non indicata nell\'avviso</span></div>';
    var q = U.quando(x.data), g = U.giorniA(x.data), presto = g !== null && g >= 0 && g <= 7;
    // solo il termine (Demanio senza il giorno dell'asta): la scritta si vede, altrimenti la data sembra il giorno dell'asta
    var prima = D.asta ? '<span class="sr-only">Asta: </span>' : 'Offerte entro ';
    return '<div class="quando">' + U.icona('calendario') + '<span>' + prima + U.dataIt(x.data) + (x.ora ? ', ' + U.esc(x.ora) : '') + '</span>' +
      (q ? '<b class="tra' + (presto ? ' presto' : '') + (g !== null && g < 0 ? ' finita' : '') + '">' + q + '</b>' : '') + '</div>' +
      // il termine sotto la data dell'asta, se è un altro giorno o ha l'ora (anche il giorno stesso dell'asta)
      (D.asta && to && (to.data !== D.asta.data || to.ora) ? '<div class="quando sub">' + U.icona('orologio') + '<span>Offerte entro il ' + U.dataIt(to.data) + (to.ora ? ', ' + U.esc(to.ora) : '') + '</span></div>' : '');
  }

  function linkEsterni(a, opz) {
    var avviso = U.linkSicuro(a.linkAvviso), perizia = U.linkSicuro(a.linkPerizia), pdf = U.linkSicuro(a.linkPdf);
    var nuova = ' target="_blank" rel="noopener"';
    var h = avviso ? '<a class="esterno" href="' + U.esc(avviso) + '"' + nuova + ' aria-label="Avviso originale (si apre in una nuova scheda)">Avviso originale ↗</a>' : '<span class="nd">Avviso mancante</span>';
    if (!opz.compatta) {
      if (pdf) h += '<a class="esterno" href="' + U.esc(pdf) + '"' + nuova + '>Avviso PDF ↗</a>';
      if (perizia) h += '<a class="esterno" href="' + U.esc(perizia) + '"' + nuova + '>Perizia ↗</a>';
      if (Array.isArray(a.altriLink)) a.altriLink.forEach(function (x) { var u = U.linkSicuro(x && x[1]); if (u) h += '<a class="esterno" href="' + U.esc(u) + '"' + nuova + '>' + U.esc(x[0]) + ' ↗</a>'; });
    }
    return '<div class="links">' + h + '</div>';
  }

  function stella(id, seguita) {
    return '<button class="preferito" type="button" data-segui="' + U.esc(id) + '" aria-pressed="' + !!seguita + '" aria-label="' + (seguita ? 'Seguita: smetti di seguire' : 'Segui questa asta') + '" title="' + (seguita ? 'Seguita' : 'Segui') + '">' + U.icona('stella') + '</button>';
  }
  // aggiorna la stella dopo un clic senza ridisegnare la scheda
  function aggiornaSegui(btn, seguita) {
    btn.setAttribute('aria-pressed', String(!!seguita));
    btn.setAttribute('aria-label', seguita ? 'Seguita: smetti di seguire' : 'Segui questa asta');
    btn.title = seguita ? 'Seguita' : 'Segui';
  }

  /* opz: { seguita, nuova, compatta, confronto (bool: mostra casella Confronta), selezionata } */
  function card(a, opz) {
    opz = opz || {};
    var id = U.esc(a.id), passa = ' data-passa="id:' + id + '"';
    var min = a.offertaMinima || (a.prezzoBase ? C.offertaMinima(a.prezzoBase, T) : null);
    var cat = ICONE_CAT[a.categoria] ? a.categoria : 'beni';
    var dove = luogoBreve(a);
    var manuale = a.origine === 'manuale';

    var copertina = '<div class="copertina">' + U.icona(ICONE_CAT[cat], 'icona-cat') + anello(a) +
      '<div class="luogo">' + U.icona('luogo') + '<span>' + (dove ? U.esc(dove) : 'Luogo non indicato') + '</span></div></div>';

    var top = '<div class="top">' + (opz.nuova ? '<span class="pill p-signal">Nuova</span>' : '') +
      '<span class="pill p-info">' + U.esc(U.CATEGORIE[a.categoria] || a.categoria || 'Altro') + '</span>' + statoPill(a) +
      (a.tipo && !opz.compatta ? '<span class="tag">' + U.esc(a.tipo) + '</span>' : '') +
      (manuale ? '<span class="tag" title="Copiata da te da un avviso">inserita da te</span>' : '') + '</div>';

    var sotto = [a.tribunale ? 'Trib. ' + a.tribunale : '', a.rge ? 'Proc. n. ' + a.rge : '', opz.compatta ? '' : a.fonte || ''].filter(Boolean).join(' · ');

    var prezzi = '<div class="prezzi"><div class="prezzo"><span class="et">Prezzo base</span>' +
      (a.prezzoBase ? '<b class="valore">' + U.eur(a.prezzoBase) + '</b>' : '<b class="valore nd">non indicato</b><span class="nd">vedi l\'avviso</span>') + '</div>' +
      '<div class="minima"><span class="et">Offerta minima</span>' + (min ? '<b>' + U.eur(min) + '</b>' : '<b class="nd">non indicata</b>') + '</div></div>';

    var azioni = '<div class="actions">' + stella(a.id, opz.seguita) +
      (opz.confronto ? '<label class="check confronta"><input type="checkbox" data-confronta="' + id + '"' + (opz.selezionata ? ' checked' : '') + '> Confronta</label>' : '') +
      '<span class="spacer"></span>' +
      (manuale && !opz.compatta ? '<button class="btn small ghost" type="button" data-modifica="' + id + '">Modifica</button><button class="btn small danger" type="button" data-elimina="' + id + '">Elimina</button>' : '') +
      '<a class="btn small ghost" href="calcolatore.html?id=' + encodeURIComponent(a.id) + '"' + passa + '>Conviene?</a></div>';

    return '<article class="card cat-' + cat + (opz.nuova ? ' nuova' : '') + (opz.compatta ? ' compatta' : '') + '">' + copertina +
      '<div class="corpo">' + top +
      // h3: le card stanno sotto un h2 (home, elenco aste); l'aspetto è quello di prima (.card-titolo in style.css)
      '<h3 class="card-titolo"><a href="scheda.html?id=' + encodeURIComponent(a.id) + '"' + passa + '>' + U.esc(a.titolo || 'Asta senza titolo') + '</a></h3>' +
      (sotto ? '<div class="where">' + U.esc(sotto) + '</div>' : '') +
      prezzi + quando(a) + metriche(a, opz) + linkEsterni(a, opz) + azioni + '</div></article>';
  }

  // segnaposto durante il caricamento dei dati
  function scheletri(n) { var h = ''; for (var i = 0; i < (n || 6); i++) h += '<div class="scheletro" aria-hidden="true"></div>'; return h; }

  root.Schede = { card: card, luogo: luogo, luogoBreve: luogoBreve, statoPill: statoPill, punteggioPill: punteggioPill, anello: anello, aggiornaSegui: aggiornaSegui, scheletri: scheletri };
})(window);
