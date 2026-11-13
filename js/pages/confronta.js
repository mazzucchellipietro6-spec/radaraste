/* Pagina "Confronta": fino a 3 aste fianco a fianco (scelte con js/confronto.js, chiave radaraste.confronto).
 * Ogni asta arriva da js/asta.js (scheda a pezzi; l'elenco completo solo se serve) e si analizza con
 * Asta.analizza, come nella scheda. In ogni riga il migliore (.vince) si indica solo se il dato c'è per
 * almeno due aste e non è uguale per tutte. Nessun dato inventato: ciò che manca è detto. */
(function () {
  'use strict';
  var U = window.UI, A = window.Asta, T = window.TARIFFE, $ = U.$;
  var ICONE = { immobile: 'casa', auto: 'auto', moto: 'moto', beni: 'beni' };
  var DEMANIO = 'Agenzia del Demanio';
  var colonne = [];

  function esc(s) { return U.esc(s); }
  function cat(a) { return ICONE[a.categoria] ? a.categoria : 'beni'; }
  function letto(a) { return !!(a.letto || a.dettaglio || a.origine === 'manuale' || a._origine === 'manuale'); }
  function nd(testo) { return '<span class="cf-nd">' + testo + '</span>'; }
  function manca(a) { return nd(letto(a) ? 'non indicato nell\'avviso' : 'non ancora disponibile'); }
  function linkScheda(a, testo, cls) {
    return '<a' + (cls ? ' class="' + cls + '"' : '') + ' href="scheda.html?id=' + encodeURIComponent(a.id) + '" data-passa="id:' + esc(a.id) + '">' + testo + '</a>';
  }
  function mq(n) { return Number(n).toLocaleString('it-IT', { maximumFractionDigits: 0 }) + ' m²'; }
  function cella(val, nota) { return '<div class="cf-cella"><span class="valore">' + val + '</span>' + (nota ? '<small>' + nota + '</small>' : '') + '</div>'; }

  function colore(p) {
    if (p >= 75) return 'var(--s-100)';
    if (p >= 55) return 'color-mix(in srgb, var(--s-100) 60%, var(--s-50))';
    if (p >= 35) return 'var(--s-50)';
    return 'var(--s-0)';
  }
  // giorno dell'asta, o il termine per le offerte quando del Demanio si conosce solo quello (js/formato.js)
  function quando(a) {
    var D = window.Formato.date(a), x = D.asta || D.termine;
    var t = x && A.istante(x.data, x.ora);
    if (!t) return null;
    var g = Math.ceil((t - Date.now()) / 86400000);
    return { t: t, futura: t > Date.now(), giorni: g, data: x.data, ora: x.ora, soloTermine: !D.asta, termine: D.termine };
  }

  /* Righe: v = numero da confrontare (null se manca), meglio = 'min' | 'max', mostra = HTML della cella. */
  var RIGHE = [
    { et: 'Prezzo base', crit: 'il più basso', meglio: 'min',
      v: function (a, r) { return r.prezzoBase; },
      mostra: function (a, r) {
        if (!r.prezzoBase) return cella(a.fonte === DEMANIO ? nd('nel PDF dell\'avviso') : manca(a));
        return cella(U.eur(r.prezzoBase), a.prezzoPrecedente > r.prezzoBase ? 'ribassato da ' + U.eur(a.prezzoPrecedente) : '');
      } },
    { et: 'Offerta minima', crit: 'la più bassa', meglio: 'min',
      v: function (a, r) { return r.offertaMinima; },
      mostra: function (a, r) {
        if (!r.offertaMinima) return cella(manca(a));
        var nota = '';
        if (r.prezzoBase) nota = r.offertaMinima < r.prezzoBase ? U.pct(r.offertaMinima / r.prezzoBase, 0) + ' del prezzo base' : r.offertaMinima > r.prezzoBase ? 'più alta del prezzo base: verifica' : 'uguale al prezzo base';
        return cella(U.eur(r.offertaMinima), nota);
      } },
    { et: 'Valore di mercato', crit: 'il più alto', meglio: 'max',
      v: function (a, r) { return r.valore ? r.valore.centrale : null; },
      mostra: function (a, r) {
        var v = r.valore;
        if (!v) return cella(nd('non ancora disponibile'), 'serve la stima del perito o il prezzo della prima asta');
        var aff = v.affidabilita ? 'affidabilità ' + v.affidabilita : v.fonte === 'manuale' ? 'inserito da te' : '';
        return cella(U.eur(v.centrale), [v.min !== v.max ? U.eur(v.min) + ' – ' + U.eur(v.max) : '', aff].filter(Boolean).join(' · '));
      } },
    { et: 'Sconto sul valore', crit: 'il più alto', meglio: 'max',
      v: function (a, r) { return r.sconto; },
      mostra: function (a, r) {
        if (r.sconto == null) return cella(nd(r.valore ? 'manca il prezzo base' : 'serve il valore'));
        return cella(U.pct(r.sconto, 0), r.giudizio ? esc(r.giudizio.etichetta) + ', costi compresi' : 'costi compresi');
      } },
    { et: 'Costo totale', crit: 'il più basso', meglio: 'min',
      v: function (a, r) { return r.costo ? r.costo.totale : null; },
      mostra: function (a, r) {
        if (!r.costo) return cella(nd('manca il prezzo base'));
        return cella(U.eur(r.costo.totale), 'al prezzo base, ' + (a.categoria === 'immobile' ? 'imposte e spese' : 'diritti d\'asta e passaggio') + ' comprese');
      } },
    { et: 'Offerta massima consigliata', crit: 'più spazio sopra l\'offerta minima', meglio: 'max',
      v: function (a, r) { return r.offertaMax > 0 && r.offertaMinima ? r.offertaMax / r.offertaMinima - 1 : null; },
      mostra: function (a, r) {
        if (!(r.offertaMax > 0)) return cella(nd(r.valore ? (r.costo ? 'margine troppo stretto' : 'manca il prezzo base') : 'serve il valore'));
        var d = r.offertaMinima ? r.offertaMax / r.offertaMinima - 1 : null;
        return cella(U.eur(r.offertaMax), d == null ? '' : d >= 0 ? U.pct(d, 0) + ' sopra l\'offerta minima' : '<span class="sc-attenzione">sotto l\'offerta minima: non conviene</span>');
      } },
    { et: 'Punteggio affare', crit: 'il più alto', meglio: 'max',
      v: function (a, r) { return r.punteggio ? r.punteggio.valore : null; },
      mostra: function (a, r) {
        var p = r.punteggio;
        if (!p) return '<div class="cf-cella cf-mini"><div class="anello vuoto" role="img" aria-label="Senza punteggio"><b aria-hidden="true">n.d.</b></div><small>serve il valore di mercato</small></div>';
        var f = window.Punteggio ? Punteggio.fascia(p.valore).etichetta : '';
        return '<div class="cf-cella cf-mini"><div class="anello" style="--v:' + Math.max(0, Math.min(100, p.valore)) + ';--c:' + colore(p.valore) + '" role="img" aria-label="Punteggio ' + p.valore + ' su 100' + (f ? ': ' + esc(f) : '') + '"><b aria-hidden="true">' + p.valore + '</b></div>' +
          '<small>' + esc(f) + (p.completo ? '' : ' · parziale') + '</small></div>';
      } },
    { et: 'Superficie', crit: 'la più grande', meglio: 'max',
      v: function (a, r) { return a.categoria === 'immobile' ? r.mq : null; },
      mostra: function (a, r) {
        if (a.categoria !== 'immobile') return cella(nd('non si applica'));
        return r.mq ? cella(mq(r.mq), a.superficieDa === 'testo' ? 'letta dal testo' : '') : cella(manca(a));
      } },
    { et: '€/m² (prezzo base)', crit: 'il più basso', meglio: 'min',
      v: function (a, r) { return r.euroMq; },
      mostra: function (a, r) {
        if (a.categoria !== 'immobile') return cella(nd('non si applica'));
        if (r.euroMq) return cella(U.eur(r.euroMq) + '/m²');
        return cella(nd(r.mq ? 'manca il prezzo base' : 'manca la superficie'));
      } },
    { et: 'Stato', crit: 'libero prima di non indicato e occupato', meglio: 'max',
      v: function (a) { return a.categoria !== 'immobile' ? null : a.stato === 'libero' ? 2 : a.stato === 'occupato' ? 0 : 1; },
      mostra: function (a) {
        if (a.categoria !== 'immobile') return cella(nd('non si applica'));
        if (a.stato === 'libero') return cella('Libero', 'secondo l\'avviso');
        if (a.stato === 'occupato') return cella('Occupato', 'liberarlo costa tempo e denaro');
        return cella(nd('non indicato'), 'chiedi al custode');
      } },
    { et: 'Rischi trovati nel testo', crit: 'il minor numero', meglio: 'min',
      v: function (a, r) { return r.nRischi; },
      mostra: function (a, r) {
        if (r.nRischi === null) return cella(nd('non verificabile'), 'testo dell\'avviso non disponibile');
        var rossi = r.semafori.filter(function (s) { return s.colore === 'rosso'; }).map(function (s) { return s.titolo.toLowerCase(); });
        var gialli = r.semafori.filter(function (s) { return s.colore === 'giallo'; }).length;
        return cella(String(r.nRischi), (rossi.length ? esc(rossi.join(', ')) : 'nessuno su ' + r.nVerificati + ' controlli') + (gialli ? ' · ' + gialli + ' da verificare' : ''));
      } },
    { et: 'Tentativo', crit: 'più tentativi andati a vuoto', meglio: 'max',
      v: function (a) { return a.tentativo > 0 ? a.tentativo : null; },
      mostra: function (a) {
        if (!(a.tentativo > 0)) return cella(nd(a.fonte === DEMANIO ? 'non indicato' : 'non ancora disponibile'));
        return cella(a.tentativo + '°', a.tentativo === 1 ? 'prima asta' : a.deserte ? a.deserte + (a.deserte === 1 ? ' andata deserta' : ' andate deserte') : 'aste precedenti senza esito noto');
      } },
    { et: 'Data dell\'asta', crit: 'più tempo per prepararsi', meglio: 'max',
      v: function (a) { var q = quando(a); return q && q.futura ? q.giorni : null; }, // a giorni: un'ora di scarto non conta
      mostra: function (a) {
        var q = quando(a);
        if (!q) return cella(manca(a));
        var nota = !q.futura ? 'conclusa' : q.giorni <= 1 ? 'entro un giorno' : 'tra ' + q.giorni + ' giorni';
        if (q.soloTermine) nota = 'termine per le offerte · ' + nota;
        else if (a.fonte === DEMANIO && q.termine) nota += ' · offerte entro il ' + U.dataIt(q.termine.data) + (q.termine.ora ? ' ' + q.termine.ora : '');
        return cella(esc(U.dataIt(q.data)) + (q.ora ? ' · ' + q.ora : ''), nota);
      } }
  ];

  // indici delle colonne vincitrici di una riga ([] se il dato c'è per meno di due aste o è uguale per tutte)
  function vincitori(riga) {
    var vals = colonne.map(function (c) { if (!c.a) return null; var v = riga.v(c.a, c.r); return v == null || !isFinite(v) ? null : v; });
    var presenti = vals.filter(function (v) { return v !== null; });
    if (presenti.length < 2) return [];
    var best = riga.meglio === 'min' ? Math.min.apply(null, presenti) : Math.max.apply(null, presenti);
    var tutti = presenti.every(function (v) { return Math.abs(v - best) < 1e-9; });
    if (tutti) return [];
    return vals.map(function (v, i) { return v !== null && Math.abs(v - best) < 1e-9 ? i : -1; }).filter(function (i) { return i >= 0; });
  }

  /* ---------- disegno ---------- */

  function testaColonna(c) {
    var togli = '<button class="cf-togli" type="button" data-togli="' + esc(c.id) + '" aria-label="Togli dal confronto' + (c.a ? ': ' + esc(c.a.titolo || 'asta') : '') + '"><span class="cerchio">' + U.icona('chiudi') + '</span></button>';
    if (!c.a) {
      return '<div class="cf-testa" role="columnheader"><div class="cf-cop" data-cat="beni">' + U.icona('allerta') + togli + '</div>' +
        '<h2>Asta non più disponibile</h2><p class="cf-sparita">Il codice «' + esc(c.id) + '» non è nell\'elenco attuale: forse è conclusa. Toglila per liberare il posto.</p></div>';
    }
    var a = c.a, dove = window.Schede ? Schede.luogoBreve(a) : (a.comune || '');
    var ente = a.fonte === DEMANIO ? 'Agenzia del Demanio' : a.tribunale ? 'Trib. ' + a.tribunale : '';
    return '<div class="cf-testa" role="columnheader"><div class="cf-cop" data-cat="' + cat(a) + '">' + U.icona(ICONE[cat(a)]) + togli + '</div>' +
      '<h2>' + linkScheda(a, esc(a.titolo || 'Asta senza titolo')) + '</h2>' +
      '<p class="cf-dove">' + esc([dove, ente].filter(Boolean).join(' · ') || 'Luogo non indicato') + '</p>' +
      linkScheda(a, 'Apri la scheda', 'btn small ghost') + '</div>';
  }

  function aggiungi() {
    return '<div role="columnheader"><a class="cf-aggiungi" href="aste.html">' + U.icona('piu') + '<span>Aggiungi un\'asta</span><small class="muted">dall\'elenco, con la casella «Confronta»</small></a></div>';
  }

  function disegna() {
    var box = $('#confronto');
    box.setAttribute('aria-busy', 'false');
    var n = colonne.length;
    if (!n) return vuoto();
    var posti = n < 3 ? n + 1 : n; // una colonna in più per aggiungere un'asta
    var h = '<div class="cf-barra"><p><b>' + n + '</b> di ' + Confronto.MAX + ' aste nel confronto</p><span class="spacer"></span>' +
      (n < Confronto.MAX ? '<a class="btn small ghost" href="aste.html">' + U.icona('piu') + 'Aggiungi aste</a>' : '') +
      '<button class="btn small ghost" type="button" id="cfSvuota">' + U.icona('chiudi') + '<span>Svuota il confronto</span></button></div>';
    if (n === 1) h += '<div class="callout">Con una sola asta non c\'è niente da confrontare: aggiungine almeno un\'altra dall\'<a href="aste.html">elenco</a> o dalle <a href="mie-aste.html">aste che segui</a>.</div>';
    h += '<p class="cf-suggerimento" aria-hidden="true">' + U.icona('freccia') + 'Scorri di lato per vedere tutte le aste</p>';
    var righe = '<div class="riga cf-intestazione" role="row"><div role="columnheader"><span>Asta</span></div>' + colonne.map(testaColonna).join('') + (posti > n ? aggiungi() : '') + '</div>';
    RIGHE.forEach(function (riga) {
      var vince = vincitori(riga);
      righe += '<div class="riga" role="row"><div role="rowheader">' + riga.et + (vince.length ? '<span class="cf-criterio">migliore: ' + riga.crit + '</span>' : '') + '</div>' +
        colonne.map(function (c, i) {
          var cls = vince.indexOf(i) >= 0 ? ' class="vince"' : '';
          return '<div role="cell"' + cls + '>' + (c.a ? riga.mostra(c.a, c.r) : cella(nd('—'))) + '</div>';
        }).join('') + (posti > n ? '<div role="cell" aria-hidden="true"></div>' : '') + '</div>';
    });
    h += '<div class="confronto cf-tabella" role="table" aria-label="Confronto tra ' + n + (n === 1 ? ' asta' : ' aste') + '" style="--n:' + posti + '" tabindex="0">' + righe + '</div>';
    h += '<p class="note">Valore, costo totale e offerta massima sono calcolati come nella scheda: seconda casa da privato per gli immobili, prezzo base come offerta. ' +
      'Il «migliore» di ogni riga confronta solo i numeri: un immobile libero con meno rischi può valere più di uno sconto alto. Apri la scheda di ogni asta per i dettagli.</p>';
    h += '<div class="disclaimer sc-avvertenza" role="note">' + U.icona('allerta') + '<div><strong>Prima di offrire, fatti aiutare.</strong> Sono stime indicative ricavate dagli avvisi: non sostituiscono il parere di un <b>notaio</b>, di un <b>avvocato</b> o di un <b>commercialista</b>. Leggi sempre avviso e perizia per intero.</div></div>';
    box.innerHTML = h;
  }

  function vuoto() {
    var box = $('#confronto');
    box.setAttribute('aria-busy', 'false');
    box.innerHTML = '<div class="panel empty sc-vuota">' + U.icona('confronta', 'sc-vuota-icona') + '<h2>Nessuna asta da confrontare</h2>' +
      '<p>Scegli fino a ' + Confronto.MAX + ' aste: nell\'elenco spunta la casella <b>Confronta</b> sotto ogni asta, oppure premi <b>Confronta</b> nella sua scheda. Qui le vedrai affiancate, riga per riga: prezzo, valore, sconto, costo totale, punteggio, rischi e date.</p>' +
      '<div class="row-actions"><a class="btn" href="aste.html">Vai all\'elenco delle aste</a><a class="btn ghost" href="mie-aste.html">Le aste che segui</a></div></div>';
  }

  function carica() {
    var ids = Confronto.ids().slice(0, Confronto.MAX);
    if (!ids.length) { colonne = []; return vuoto(); }
    Promise.all(ids.map(function (id) {
      return A.carica(id).then(function (a) { return { id: id, a: a, r: a ? A.analizza(a) : null }; },
        function () { return { id: id, a: null, r: null }; });
    })).then(function (c) { colonne = c; disegna(); });
  }

  function togli(id) {
    var c = colonne.filter(function (x) { return x.id === id; })[0];
    Confronto.togli(id);
    colonne = colonne.filter(function (x) { return x.id !== id; });
    disegna();
    U.toast(c && c.a ? 'Tolta dal confronto' : 'Posto liberato');
    // il fuoco non deve perdersi: sul prossimo pulsante "togli" o sul titolo
    var prossimo = $('.cf-togli') || $('#contenuto');
    if (prossimo) prossimo.focus();
  }

  document.addEventListener('DOMContentLoaded', function () {
    carica();
    $('#confronto').addEventListener('click', function (e) {
      var b = e.target.closest('[data-togli]');
      if (b) { togli(b.dataset.togli); return; }
      if (e.target.closest('#cfSvuota')) {
        U.conferma($('#cfSvuota span'), 'Conferma: svuota', function () {
          Confronto.ids().forEach(function (id) { Confronto.togli(id); });
          colonne = []; vuoto(); U.toast('Confronto svuotato');
          $('#contenuto').focus();
        });
      }
    });
    // la scelta cambia in un'altra scheda del browser: si ricarica il confronto
    window.addEventListener('storage', function (e) { if (e.key === 'radaraste.confronto') carica(); });
  });
})();
