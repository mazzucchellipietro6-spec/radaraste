/* Pagina "Consulente d'asta": chat che risponde con le regole di js/consulente.js (ricerca, filtri e calcoli del sito).
 * Le aste (data/aste.js, circa 8 MB) si caricano in background appena si apre la pagina.
 * Modalità AI: solo se config/consulente.js indica un "ponte" (functions/api/consulente.js); oggi è spenta.
 * La conversazione resta in questa scheda del browser (sessionStorage). Nessun dato esce dal browser in modalità regole. */
(function () {
  'use strict';
  var U = window.UI, $ = U.$, K = window.Consulente, CFG = window.CONSULENTE_CONFIG || {};
  var K_CONV = 'radaraste.consulente';
  var aste = null, caricamento = null, memoria = null, conversazione = [], occupato = false;

  /* ---------- dati ---------- */
  function caricaAste() {
    if (aste) return Promise.resolve(aste);
    if (caricamento) return caricamento;
    caricamento = new Promise(function (ok) {
      var s = document.createElement('script'); s.src = 'data/aste.js'; s.async = true;
      s.onload = function () { aste = window.Store ? window.Store.aste() : []; ok(aste); };
      s.onerror = function () { aste = []; ok(aste); };
      document.head.appendChild(s);
    }).then(function (l) {
      var R = window.ASTE_RACCOLTE;
      $('#csStato').textContent = l.length ? 'Pronto · ' + l.length.toLocaleString('it-IT') + ' aste' + (R && R.aggiornato ? ', dati del ' + U.dataIt(R.aggiornato.slice(0, 10)) : '') + ' · modalità regole'
        : 'Nessuna asta disponibile: posso comunque fare i conti e spiegare le regole.';
      return l;
    });
    return caricamento;
  }
  function contesto() { return { aste: aste || [], T: window.TARIFFE, oggi: U.oggi(), affari: window.AFFARI || null }; }
  function perId(id) {
    if (!aste) return null;
    if (!perId.indice || perId.n !== aste.length) { perId.indice = {}; perId.n = aste.length; aste.forEach(function (a) { perId.indice[a.id] = a; }); }
    return perId.indice[id] || null;
  }

  /* ---------- disegno dei blocchi della risposta ---------- */
  function luogo(a) { return [a.comune ? a.comune + (a.provincia ? ' (' + a.provincia + ')' : '') : a.regione, a.dataAsta ? 'asta ' + U.dataIt(a.dataAsta) : ''].filter(Boolean).join(' · '); }
  function rigaAsta(a) {
    var p = a.punteggio, fa = window.Punteggio ? window.Punteggio.fascia(p == null ? null : p).chiave : 'nd';
    return '<a class="cs-asta" href="scheda.html?id=' + encodeURIComponent(a.id) + '" data-passa="id:' + U.esc(a.id) + '">' +
      '<span class="m-voto f-' + fa + '" title="Punteggio affare">' + (p == null ? '–' : Math.round(p)) + '</span>' +
      '<span class="cs-asta-t"><b>' + U.esc(a.titolo) + '</b><small>' + U.esc(luogo(a)) + '</small></span>' +
      '<span class="cs-asta-n">' + (a.prezzoBase ? U.eur(a.prezzoBase) : '—') +
      (a.sconto != null && a.affidabilita !== 'bassa' ? '<small>sconto ' + U.pct(a.sconto, 0) + '</small>' : '<small class="no">' + (a.affidabilita === 'bassa' ? 'valore incerto' : 'valore non stimato') + '</small>') + '</span></a>';
  }
  function linkElenco(f) { var j = JSON.stringify(f || {}); return 'aste.html?filtri=' + encodeURIComponent(j); }
  function blocco(b) {
    switch (b.tipo) {
      case 'testo': return '<p>' + U.esc(b.testo) + '</p>';
      case 'avviso': return '<p class="cs-avviso">' + U.esc(b.testo) + '</p>';
      case 'aste': {
        var righe = (b.ids || []).map(perId).filter(Boolean).map(rigaAsta).join('');
        return '<div class="cs-aste">' + (b.titolo ? '<p class="cs-aste-tit">' + U.esc(b.titolo) + '</p>' : '') + righe +
          (b.totale > (b.ids || []).length ? '<a class="link-sez" href="' + U.esc(linkElenco(b.filtri)) + '">Apri tutte le ' + Number(b.totale).toLocaleString('it-IT') + ' aste nell\'elenco ' + U.icona('freccia') + '</a>' : '') +
          (b.nota ? '<p class="note">' + U.esc(b.nota) + '</p>' : '') + '</div>';
      }
      case 'conti': {
        var aff = { alta: 'p-good', media: 'p-info', bassa: 'p-warn' }[b.affidabilita];
        return '<div class="cs-conti"><h3>' + U.esc(b.titolo || 'Conti') + (aff ? ' <span class="pill ' + aff + '">Affidabilità ' + U.esc(b.affidabilita) + '</span>' : '') + '</h3>' +
          (b.righe || []).map(function (r) { return '<div class="line"><span>' + U.esc(r[0]) + '</span><b>' + (typeof r[1] === 'number' ? U.eur(r[1]) : U.esc(r[1])) + '</b></div>'; }).join('') +
          (b.totale ? '<div class="line total"><span>' + U.esc(b.totale[0]) + '</span><b>' + (typeof b.totale[1] === 'number' ? U.eur(b.totale[1]) : U.esc(b.totale[1])) + '</b></div>' : '') +
          (b.perche ? '<p class="note">' + U.esc(b.perche) + '</p>' : '') +
          (b.ipotesi && b.ipotesi.length ? '<ul class="cs-ipotesi">' + b.ipotesi.map(function (x) { return '<li>' + U.esc(x) + '</li>'; }).join('') + '</ul>' : '') + '</div>';
      }
      case 'fonti': return '<p class="cs-fonti"><span>Fonti:</span>' + (b.voci || []).map(function (f) {
        var t = U.esc(f.nome) + (f.data ? ' (' + U.esc(/^\d{4}-\d\d-\d\d/.test(f.data) ? U.dataIt(f.data.slice(0, 10)) : f.data) + ')' : '');
        return f.url && U.linkSicuro(f.url) ? '<a href="' + U.esc(f.url) + '" target="_blank" rel="noopener">' + t + '</a>' : '<span>' + t + '</span>';
      }).join('') + '</p>';
      case 'suggerimenti': return '<div class="cs-sugg" role="group" aria-label="Domande successive">' + (b.voci || []).map(function (v) { return '<button class="chip" type="button" data-chiedi="' + U.esc(v) + '">' + U.esc(v) + '</button>'; }).join('') + '</div>';
      default: return '';
    }
  }
  function messaggio(m) {
    if (m.chi === 'io') return '<div class="cs-msg io"><div class="cs-bolla">' + U.esc(m.testo) + '</div></div>';
    return '<div class="cs-msg lui"><div class="cs-corpo">' + (m.blocchi || []).map(blocco).join('') + '</div></div>';
  }
  function disegna(scorri) {
    var box = $('#csMessaggi');
    box.innerHTML = conversazione.map(messaggio).join('') + (occupato ? '<div class="cs-msg lui"><div class="cs-corpo"><span class="cs-attesa" aria-label="Sto rispondendo"><i></i><i></i><i></i></span></div></div>' : '');
    if (scorri !== false) box.scrollTop = box.scrollHeight;
  }
  function salva() { try { sessionStorage.setItem(K_CONV, JSON.stringify({ c: conversazione.slice(-40), m: memoria })); } catch (e) {} }

  /* ---------- domanda e risposta ---------- */
  function chiedi(testo) {
    testo = String(testo || '').trim();
    if (!testo || occupato) return;
    conversazione.push({ chi: 'io', testo: testo });
    occupato = true; disegna();
    var ai = CFG.ponte && ($('input[name="csModo"]:checked') || {}).value === 'ai';
    if (ai) {
      caricaAste().then(function () { return chiediAI(testo); }).then(function (blocchi) {
        conversazione.push({ chi: 'lui', blocchi: blocchi.concat([{ tipo: 'avviso', testo: 'Risposta scritta da un servizio di intelligenza artificiale con i dati del sito: controlla i numeri nei riquadri e nelle schede.' }]) });
      }, function (e) {
        conversazione.push({ chi: 'lui', blocchi: [{ tipo: 'avviso', testo: 'Modalità AI non disponibile (' + (e && e.message || 'errore') + '): rispondo con le regole del sito.' }].concat(K.rispondi(testo, contesto(), memoria).blocchi) });
      }).then(function () { occupato = false; disegna(); salva(); });
      return;
    }
    caricaAste().then(function () {
      var r;
      try { r = K.rispondi(testo, contesto(), memoria); }
      catch (e) { r = { blocchi: [{ tipo: 'avviso', testo: 'Non sono riuscito a rispondere: ' + (e && e.message || 'errore') + '. Prova a riformulare la domanda.' }] }; }
      memoria = r.memoria || memoria;
      conversazione.push({ chi: 'lui', blocchi: r.blocchi || [] });
      occupato = false; disegna(); salva();
    });
  }
  /* ---------- modalità AI (solo con un ponte configurato in config/consulente.js) ----------
   * Il servizio AI non vede i dati: chiede al browser di usare gli strumenti del sito (le stesse regole della modalità
   * gratuita) e scrive la risposta con quei risultati. I blocchi con aste, conti e fonti vengono mostrati sotto. */
  var storiaAI = [];
  function strumento(nome, input) {
    if (nome === 'consulente_regole') {
      var r = K.rispondi(String(input && input.domanda || ''), contesto(), memoria);
      memoria = r.memoria || memoria;
      return { blocchi: r.blocchi, mostra: r.blocchi.filter(function (b) { return b.tipo !== 'testo' && b.tipo !== 'suggerimenti'; }) };
    }
    if (nome === 'scheda_asta') {
      var a = perId(String(input && input.id || ''));
      if (!a) return { blocchi: [{ tipo: 'testo', testo: 'Asta non trovata.' }], mostra: [] };
      var campi = {}; ['id', 'titolo', 'categoria', 'tipo', 'comune', 'provincia', 'tribunale', 'prezzoBase', 'offertaMinima', 'dataAsta', 'termineOfferte', 'stato', 'tentativo', 'superficieMq',
        'valore', 'valoreMin', 'valoreMax', 'fonteValore', 'affidabilita', 'costoTotale', 'sconto', 'offertaMax', 'punteggio', 'rischi', 'rendimento', 'linkAvviso'].forEach(function (k) { if (a[k] != null) campi[k] = a[k]; });
      return { blocchi: [{ tipo: 'dati', asta: campi }], mostra: [{ tipo: 'aste', ids: [a.id], totale: 1 }] };
    }
    return { blocchi: [{ tipo: 'testo', testo: 'Strumento sconosciuto: ' + nome }], mostra: [] };
  }
  function chiediAI(testo) {
    var mostra = [], turni = 0;
    storiaAI.push({ role: 'user', content: testo });
    function giro() {
      return fetch(CFG.ponte, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messaggi: storiaAI.slice(-24) }) })
        .then(function (r) { if (!r.ok) throw new Error('il servizio AI ha risposto ' + r.status); return r.json(); })
        .then(function (j) {
          storiaAI.push({ role: 'assistant', content: j.contenuto });
          var usi = (j.contenuto || []).filter(function (c) { return c.type === 'tool_use'; });
          if (j.stop === 'tool_use' && usi.length && ++turni < (CFG.maxTurni || 5)) {
            storiaAI.push({ role: 'user', content: usi.map(function (u) { var e = strumento(u.name, u.input); mostra = mostra.concat(e.mostra); return { type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(e.blocchi) }; }) });
            return giro();
          }
          var testi = (j.contenuto || []).filter(function (c) { return c.type === 'text'; }).map(function (c) { return { tipo: 'testo', testo: c.text }; });
          return testi.concat(mostra);
        });
    }
    return giro();
  }

  function benvenuto() {
    return { chi: 'lui', blocchi: [
      { tipo: 'testo', testo: 'Ciao, sono il consulente d\'asta di Radar Aste. Rispondo con i dati delle aste in corso e con i calcoli del sito: per ogni numero ti dico da dove viene e quanto è affidabile.' },
      { tipo: 'testo', testo: 'Puoi chiedermi di cercare aste, spiegarne una, fare i conti di un acquisto o del mutuo, oppure come funziona un\'asta.' },
      { tipo: 'suggerimenti', voci: (K && K.ESEMPI || []).slice(0, 4) }
    ] };
  }

  function avvia() {
    if (!K) { $('#csMessaggi').innerHTML = '<p class="cs-avviso">Il motore del consulente non si è caricato (js/consulente.js).</p>'; return; }
    try { var s = JSON.parse(sessionStorage.getItem(K_CONV) || 'null'); if (s && s.c && s.c.length) { conversazione = s.c; memoria = s.m || null; } } catch (e) {}
    if (!conversazione.length) conversazione.push(benvenuto());
    $('#csEsempi').innerHTML = (K.ESEMPI || []).map(function (q) { return '<button class="chip" type="button" data-chiedi="' + U.esc(q) + '">' + U.esc(q) + '</button>'; }).join('');
    disegna();
    caricaAste();
    // modalità AI: disponibile solo con un ponte configurato (oggi no)
    if (CFG.ponte) { $('#csModoAi').disabled = false; $('#csNotaAi').textContent = 'Collegata a ' + (CFG.modello || 'un servizio AI') + ': le domande passano dal servizio esterno.'; }
    var area = $('#csDomanda');
    function altezza() { area.style.height = 'auto'; area.style.height = Math.min(160, area.scrollHeight) + 'px'; }
    area.addEventListener('input', altezza);
    area.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#csForm').requestSubmit ? $('#csForm').requestSubmit() : $('#csInvia').click(); } });
    $('#csForm').addEventListener('submit', function (e) { e.preventDefault(); var t = area.value; area.value = ''; altezza(); chiedi(t); area.focus(); });
    document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-chiedi]'); if (b) chiedi(b.getAttribute('data-chiedi')); });
    $('#csNuova').addEventListener('click', function () { conversazione = [benvenuto()]; memoria = null; salva(); disegna(); area.focus(); });
    // domanda arrivata dalla home o da una scheda (?q=…)
    var q = U.parametro('q');
    if (q) { try { history.replaceState(null, '', location.pathname); } catch (e) {} chiedi(q); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia); else avvia();
})();
