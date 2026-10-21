/* Pagina "Prezzi": piani e prezzi letti da config/abbonamenti.js (nell'HTML non c'è nessun prezzo), interruttore
 * Mensile/Annuale, tabella di confronto delle funzioni e pulsanti per abbonarsi.
 *
 * Cosa fa il pulsante di un piano a pagamento (funzione azione):
 *   abbonamenti spenti e niente anteprima      → disattivato, con la spiegazione
 *   attivi o in anteprima, nessun utente        → accedi.html?dopo=prezzi.html
 *   utente collegato con il piano Gratis        → Account.checkout(piano, periodo), poi la pagina di pagamento di Stripe
 *   utente con un piano a pagamento             → portale clienti di Stripe (Account.portale()) per cambiarlo o disdirlo
 *   abbonamento con un pagamento non riuscito   → portale clienti per aggiornare il pagamento (il server rifiuta un
 *                                                 secondo abbonamento finché quello vecchio è in corso)
 * La prova gratuita si mostra solo a chi non ha mai avuto un abbonamento (come functions/api/stripe/checkout.js).
 * Il controllo vero (chiavi solo di test, prezzi, chi può pagare) lo fanno le funzioni del server; prima di lasciare la
 * pagina si controlla comunque che il server non sia in pagamenti reali mentre la pagina dice "modalità test".
 * Le parti che non toccano la pagina sono esportate per i test in Node (tests/abbonamenti-pagine.test.mjs). */
(function (root) {
  'use strict';

  var NODE = typeof module !== 'undefined' && module.exports;
  var P = root.Piani || (NODE ? require('../piani.js') : null);
  var ACCEDI = 'accedi.html?dopo=prezzi.html';
  // funzioni che il sito non ha ancora (nei vantaggi dei piani sono segnate "(in arrivo)"); config.inArrivo, se c'è, vince.
  // Il report PDF c'è già ("Stampa o salva in PDF" nella scheda dell'asta): non è in arrivo.
  var IN_ARRIVO = ['avvisi', 'consulente-ai', 'statistiche-avanzate'];
  // stati di Stripe di un abbonamento ancora in corso ma non pagato: si sistema dal portale clienti
  var DA_SISTEMARE = ['past_due', 'unpaid', 'paused'];
  // stati di Stripe: chi ne ha uno ha già avuto un abbonamento, quindi niente nuova prova (come servizi/stripe.js)
  var STATI_STRIPE = ['incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused'];
  // funzione a pagamento → limite del piano Gratis che la riguarda (config.limitiGratis)
  var LIMITE_DI = { 'affari-tutti': 'affari', 'combinazioni-tutte': 'combinazioni', 'seguite-illimitate': 'seguite' };
  var PRIMA_DEL_LIMITE = { affari: 'I primi ', combinazioni: 'Le prime ', seguite: 'Fino a ' };
  var SFINALE_ARRIVO = /\s*\(in arrivo\)\s*$/i;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function icona(n) { return root.Icone && typeof root.Icone.svg === 'function' ? root.Icone.svg(n) : ''; }
  function cfg() { return (P && P.config()) || root.ABBONAMENTI || { piani: [], funzioni: {} }; }

  /* ---- Prezzi ---- */
  // 24 → "24", 7.5 → "7,50", 1200 → "1.200" (come js/piani.js)
  function cifra(n) {
    n = Number(n) || 0;
    var s = Math.round(n * 100) % 100 === 0 ? String(Math.round(n)) : n.toFixed(2).replace('.', ',');
    var parti = s.split(',');
    parti[0] = parti[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return parti.join(',');
  }
  function euro(n) { return cifra(n) + ' €'; }
  function importo(piano, periodo) { var v = Number(((piano && piano.prezzi) || {})[periodo]); return isFinite(v) && v > 0 ? v : 0; }
  function aPagamento(piano) { return importo(piano, 'mensile') > 0 || importo(piano, 'annuale') > 0; }
  // euro risparmiati in un anno con l'annuale invece di dodici mensilità (stessa formula di Piani.risparmioAnnuale)
  function risparmio(piano) {
    var m = importo(piano, 'mensile'), a = importo(piano, 'annuale');
    return m > 0 && a > 0 ? Math.max(0, Math.round((m * 12 - a) * 100) / 100) : 0;
  }
  // mesi regalati dall'annuale (2 con 90 € invece di 12 × 9 €); 0 se il conto non dà un numero intero di mesi
  function mesiGratis(piano) {
    var m = importo(piano, 'mensile'), r = risparmio(piano);
    if (!(m > 0) || !(r > 0)) return 0;
    var mesi = r / m;
    return Math.abs(mesi - Math.round(mesi)) < 0.05 ? Math.round(mesi) : 0;
  }
  function percentualeRisparmio(piano) { var m = importo(piano, 'mensile'); return m > 0 ? Math.round(risparmio(piano) / (m * 12) * 100) : 0; }
  // etichetta accanto ad "Annuale": "2 mesi gratis" se vale per tutti i piani a pagamento, altrimenti "fino al 17% in meno"
  function etichettaAnnuale(c) {
    var paganti = (c.piani || []).filter(aPagamento);
    if (!paganti.length) return '';
    var mesi = paganti.map(mesiGratis);
    if (mesi[0] > 0 && mesi.every(function (x) { return x === mesi[0]; })) return mesi[0] === 1 ? '1 mese gratis' : mesi[0] + ' mesi gratis';
    var max = Math.max.apply(null, paganti.map(percentualeRisparmio));
    return max > 0 ? 'fino al ' + max + '% in meno' : '';
  }

  function livello(id, c) {
    var l = c.piani || [];
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return i;
    return -1;
  }
  // giorni di prova gratuita del piano (0 se il piano non ha la prova)
  function provaDi(piano, c) { var p = c.prova; return p && p.piano === piano.id && p.giorni > 0 && aPagamento(piano) ? p.giorni : 0; }
  function inArrivo(funzione, c) { return (c.inArrivo || IN_ARRIVO).indexOf(funzione) >= 0; }
  function attiviDavvero(c) { var s = c.supabase || {}; return c.attivi === true && !!(s.url && s.chiaveAnonima); }

  /* ---- Abbonamento dell'utente (riga della tabella abbonamenti: { piano, stato, fineProva, … }) ---- */
  function idPiano(ab) { return ab && typeof ab.piano === 'string' ? ab.piano.toLowerCase() : ''; }
  // ha già avuto un abbonamento o una prova: il server non dà una seconda prova gratuita
  function provaGiaUsata(ab) {
    if (P && typeof P.provaGiaUsata === 'function') return P.provaGiaUsata({ abbonamento: ab || null });
    return !!(ab && (ab.fineProva || STATI_STRIPE.indexOf(ab.stato) >= 0));
  }
  // id del piano a pagamento con il pagamento da sistemare, altrimenti null
  function daSistemare(ab, c) {
    var id = idPiano(ab);
    return ab && DA_SISTEMARE.indexOf(ab.stato) >= 0 && livello(id, c) >= 1 ? id : null;
  }

  /* Risposta di Account.checkout() o Account.portale() → indirizzo dove andare, oppure errore.
   * Solo https; e se la pagina dice "modalità test: nessun pagamento reale" il server deve essere davvero in test. */
  function destinazione(r, c) {
    var url = r && typeof r.url === 'string' ? r.url : '';
    if (!/^https:\/\/[^\s\/?#]+/i.test(url)) throw new Error('Il server non ha indicato la pagina di pagamento. Riprova tra poco.');
    if (c && c.modalita === 'test' && r.modalita != null && r.modalita !== 'test') {
      throw new Error('Pagamento fermato: il server è impostato per pagamenti reali, ma il sito è in modalità test. Avvisa il proprietario del sito.');
    }
    return url;
  }

  /* ---- Pulsante di un piano ----
   * ctx: { cfg, periodo, vendita (abbonamenti attivi o anteprima), configurato (account), utente, piano (id del piano dell'utente),
   *        provaUsata (niente prova gratuita), daSistemare (id del piano con il pagamento non riuscito) }
   * → { tipo: 'link' | 'accedi' | 'disattivato' | 'checkout' | 'portale' | 'attuale', testo, href?, nota?, attuale? } */
  function azione(piano, ctx) {
    var c = ctx.cfg, nome = piano.nome || piano.id, giorni = ctx.provaUsata ? 0 : provaDi(piano, c);
    var scegli = giorni ? 'Prova ' + nome + ' gratis per ' + giorni + ' giorni' : 'Scegli ' + nome;
    if (!aPagamento(piano)) {
      if (ctx.vendita && ctx.configurato && ctx.utente && ctx.piano === piano.id) return { tipo: 'attuale', testo: 'Il tuo piano' };
      return { tipo: 'link', testo: 'Cerca le aste', href: 'aste.html' };
    }
    if (!ctx.vendita) return { tipo: 'disattivato', testo: scegli, nota: 'Abbonamenti non ancora attivi: per ora tutto il sito è libero.' };
    if (!ctx.configurato || !ctx.utente) return { tipo: 'accedi', testo: scegli, href: ACCEDI, nota: 'Prima accedi o crea un account.' };
    if (ctx.daSistemare) {
      if (ctx.daSistemare !== piano.id) return { tipo: 'portale', testo: 'Cambia piano dal portale clienti' };
      return { tipo: 'portale', testo: 'Aggiorna il pagamento', attuale: ctx.piano === piano.id, nota: 'L\'ultimo pagamento non è riuscito: aggiorna il metodo di pagamento dal portale clienti.' };
    }
    if (ctx.piano === piano.id) return { tipo: 'portale', testo: 'Gestisci l\'abbonamento', attuale: true };
    if (ctx.piano && ctx.piano !== 'gratis') return { tipo: 'portale', testo: 'Cambia piano dal portale clienti' };
    return { tipo: 'checkout', testo: scegli };
  }

  function htmlAzione(piano, az) {
    var id = esc(piano.id), cls = 'btn' + (piano.consigliato ? '' : ' ghost');
    var idNota = 'pz-nota-' + id, nota = az.nota ? '<p class="note" id="' + idNota + '">' + esc(az.nota) + '</p>' : '';
    if (az.tipo === 'attuale') return '<p class="pz-attuale">' + icona('ok') + '<span>' + esc(az.testo) + '</span></p>';
    if (az.tipo === 'link' || az.tipo === 'accedi') return '<a class="' + cls + '" href="' + esc(az.href) + '">' + esc(az.testo) + '</a>' + nota;
    if (az.tipo === 'disattivato') return '<button class="' + cls + '" type="button" disabled aria-describedby="' + idNota + '">' + esc(az.testo) + '</button>' + nota;
    return '<button class="' + (az.attuale ? 'btn ghost' : cls) + '" type="button" data-azione="' + esc(az.tipo) + '" data-piano="' + id + '"' +
      (nota ? ' aria-describedby="' + idNota + '"' : '') + '>' + esc(az.testo) + '</button>' + nota;
  }

  // riga sotto il prezzo: l'alternativa (mensile/annuale) e il risparmio
  function dettaglioPrezzo(piano, ctx) {
    var c = ctx.cfg, iva = c.ivaInclusa ? ' IVA inclusa.' : '';
    if (!aPagamento(piano)) return 'Senza abbonamento e senza carta di pagamento.';
    var m = importo(piano, 'mensile'), a = importo(piano, 'annuale'), r = risparmio(piano), mesi = mesiGratis(piano);
    if (ctx.periodo === 'annuale') {
      if (!a) return 'Solo mensile.' + iva;
      return 'Pari a ' + euro(a / 12) + ' al mese' + (r > 0 ? ': <b>risparmi ' + euro(r) + '</b> rispetto al mensile.' : '.') + iva;
    }
    if (!m) return 'Solo annuale.' + iva;
    return a ? 'Oppure ' + euro(a) + ' all\'anno' + (mesi ? ' (' + (mesi === 1 ? '1 mese' : mesi + ' mesi') + ' gratis).' : '.') + iva : 'Pagamento mensile.' + iva;
  }

  function htmlVantaggio(t) {
    var arrivo = SFINALE_ARRIVO.test(t);
    return '<li>' + icona('ok') + '<span>' + esc(String(t).replace(SFINALE_ARRIVO, '')) + (arrivo ? ' <span class="pill p-neutral">in arrivo</span>' : '') + '</span></li>';
  }

  function htmlPiano(piano, ctx) {
    var c = ctx.cfg, id = esc(piano.id), paga = aPagamento(piano), az = azione(piano, ctx);
    // chi ha già un piano a pagamento cambia dal portale clienti, e chi ha già avuto un abbonamento o una prova non ne
    // ha un'altra (functions/api/stripe/checkout.js): non la promettiamo
    var giorni = az.tipo === 'portale' || ctx.provaUsata ? 0 : provaDi(piano, c);
    var periodo = ctx.periodo === 'annuale' && importo(piano, 'annuale') ? 'annuale' : (importo(piano, 'mensile') ? 'mensile' : 'annuale');
    var attuale = az.tipo === 'attuale' || az.attuale;
    var bollino = attuale ? '<span class="pz-bollino attuale">Il tuo piano</span>' : (piano.consigliato ? '<span class="pz-bollino">Consigliato</span>' : '');
    // la prova è in evidenza sopra il pulsante (o non vale per chi è già abbonato): non la ripeto tra i vantaggi
    var conProva = provaDi(piano, c) > 0;
    var vantaggi = (piano.vantaggi || []).filter(function (v) { return !(conProva && /giorni di prova gratuita/i.test(v)); });
    return '<article class="pz-piano' + (piano.consigliato ? ' consigliato' : '') + (attuale ? ' attuale' : '') + '" id="' + id + '" aria-labelledby="pz-nome-' + id + '">' + bollino +
      '<header><h2 class="pz-nome" id="pz-nome-' + id + '">' + esc(piano.nome) + '</h2>' + (piano.sottotitolo ? '<p class="pz-sotto">' + esc(piano.sottotitolo) + '</p>' : '') + '</header>' +
      '<p class="pz-prezzo"><span class="pz-cifra">' + euro(paga ? importo(piano, periodo) : 0) + '</span><span class="pz-per">' + (!paga ? 'senza costi' : periodo === 'annuale' ? 'all\'anno' : 'al mese') + '</span></p>' +
      '<p class="pz-dettaglio">' + dettaglioPrezzo(piano, ctx) + '</p>' +
      // sempre presente (anche vuota): su computer tiene allineati i pulsanti dei tre piani
      '<p class="pz-prova">' + (giorni ? '<span class="pill p-good">' + giorni + ' giorni di prova gratuita</span>' : '') + '</p>' +
      '<div class="pz-azione">' + htmlAzione(piano, az) + '</div>' +
      (vantaggi.length ? '<ul class="pz-vantaggi" aria-label="Che cosa comprende ' + esc(piano.nome) + '">' + vantaggi.map(htmlVantaggio).join('') + '</ul>' : '') +
      '</article>';
  }

  /* ---- Confronto delle funzioni (config.funzioni e config.nomiFunzioni) ----
   * cella: { incluso: true } | { incluso: false } | { testo } (limite del piano Gratis, giorni di prova) */
  function righeConfronto(c) {
    var piani = c.piani || [], righe = [];
    righe.push({ nome: 'Aste con filtri, mappa e schede, calcolatore, mutuo, guida e tariffe', celle: piani.map(function () { return { incluso: true }; }) });
    Object.keys(c.funzioni || {}).forEach(function (f) {
      var min = livello(c.funzioni[f], c), lim = LIMITE_DI[f];
      righe.push({ funzione: f, nome: (c.nomiFunzioni || {})[f] || f, inArrivo: inArrivo(f, c), celle: piani.map(function (p, i) {
        if (min >= 0 && i >= min) return { incluso: true };
        var n = lim ? (c.limitiGratis || {})[lim] : null;
        if (!aPagamento(p) && typeof n === 'number' && isFinite(n)) return { testo: PRIMA_DEL_LIMITE[lim] + n };
        return { incluso: false };
      }) });
    });
    if (c.prova && c.prova.giorni > 0) {
      righe.push({ nome: 'Prova gratuita', celle: piani.map(function (p) { var g = provaDi(p, c); return g ? { testo: g + ' giorni' } : { incluso: false }; }) });
    }
    return righe;
  }
  function htmlCella(cel) {
    if (cel.testo) return '<span>' + esc(cel.testo) + '</span>';
    if (cel.incluso) return icona('ok') + '<span class="sr-only">Incluso</span>';
    return '<span class="pz-no" aria-hidden="true">–</span><span class="sr-only">Non incluso</span>';
  }
  function htmlConfronto(ctx) {
    var c = ctx.cfg, piani = c.piani || [];
    var col = function (p) { return p.consigliato ? ' class="pz-col-consigliato"' : ''; };
    var prezzoBreve = function (p) {
      if (!aPagamento(p)) return euro(0);
      var annuale = ctx.periodo === 'annuale' && importo(p, 'annuale');
      return euro(importo(p, annuale ? 'annuale' : 'mensile')) + (annuale ? ' all\'anno' : ' al mese');
    };
    return '<table class="pz-confronto"><caption class="sr-only">Funzioni comprese in ciascun piano</caption>' +
      '<thead><tr><th scope="col">Funzione</th>' + piani.map(function (p) { return '<th scope="col"' + col(p) + '>' + esc(p.nome) + '<span class="pz-th-prezzo">' + prezzoBreve(p) + '</span></th>'; }).join('') + '</tr></thead>' +
      '<tbody>' + righeConfronto(c).map(function (r) {
        return '<tr><th scope="row" class="pz-f">' + esc(r.nome) + (r.inArrivo ? ' <span class="pill p-neutral">in arrivo</span>' : '') + '</th>' +
          r.celle.map(function (cel, i) { return '<td data-label="' + esc(piani[i].nome) + '"' + col(piani[i]) + '>' + htmlCella(cel) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table>';
  }

  var Prezzi = {
    azione: azione, htmlPiano: htmlPiano, htmlConfronto: htmlConfronto, righeConfronto: righeConfronto, dettaglioPrezzo: dettaglioPrezzo,
    etichettaAnnuale: etichettaAnnuale, mesiGratis: mesiGratis, risparmio: risparmio, attiviDavvero: attiviDavvero,
    provaGiaUsata: provaGiaUsata, daSistemare: daSistemare, destinazione: destinazione, ACCEDI: ACCEDI, IN_ARRIVO: IN_ARRIVO
  };
  if (NODE) { module.exports = Prezzi; return; }

  /* ---- Pagina ---- */
  var U = root.UI, $ = U.$;
  var periodo = 'mensile', letto = null, inCorso = false, primoGiro = true;

  function account() { return root.Account || null; }
  function contesto() {
    var c = cfg(), A = account(), s = P ? P.stato() : null, configurato = false, utente = null;
    try { configurato = !!(A && typeof A.configurato === 'function' && A.configurato()); } catch (e) { configurato = false; }
    utente = (s && s.utente) || null;
    if (!utente && configurato && typeof A.utente === 'function') { try { utente = A.utente() || null; } catch (e) { utente = null; } }
    // abbonamento appena letto dal database (Account.abbonamento): più fresco di quello in cache
    if (utente && letto) s = { utente: utente, abbonamento: letto };
    var ab = utente && s ? s.abbonamento || null : null;
    return {
      cfg: c, periodo: periodo, attivi: attiviDavvero(c), anteprima: P ? P.anteprima() : false, vendita: P ? P.attivo() : false,
      configurato: configurato, utente: utente, piano: utente && P ? P.piano(s) : 'gratis',
      provaUsata: provaGiaUsata(ab), daSistemare: daSistemare(ab, c)
    };
  }

  // messaggio sotto i piani: problema (avviso giallo) o semplice informazione
  function esito(msg, info) {
    var el = $('#pzEsito');
    el.innerHTML = msg ? '<p class="callout' + (info ? '' : ' warn') + '">' + esc(msg) + '</p>' : '';
  }

  // testi della pagina che dipendono dalla configurazione (prova, IVA)
  function testiConfig(c) {
    var pr = c.prova, piano = null;
    (c.piani || []).forEach(function (p) { if (pr && p.id === pr.piano) piano = p; });
    var faq = $('#pzFaqProva');
    if (faq) faq.hidden = !(piano && pr.giorni > 0);
    U.$$('[data-cfg="prova-giorni"]').forEach(function (el) { el.textContent = pr && pr.giorni > 0 ? String(pr.giorni) : ''; });
    U.$$('[data-cfg="prova-piano"]').forEach(function (el) { el.textContent = piano ? piano.nome : ''; });
    U.$$('[data-cfg="iva"]').forEach(function (el) {
      if (!c.ivaInclusa) el.textContent = 'I prezzi sono indicati senza IVA: l\'importo finale con l\'IVA compare sulla pagina di pagamento prima della conferma.';
    });
  }

  function rendi() {
    var ctx = contesto(), c = ctx.cfg;
    $('#pzAnteprima').innerHTML = P ? P.avvisoAnteprima() : '';
    $('#pzTest').hidden = c.modalita !== 'test';
    $('#pzTestCarta').hidden = !ctx.vendita;
    $('#pzSpenti').hidden = ctx.attivi;
    $('#pzSpentiPulsanti').textContent = ctx.anteprima
      ? 'Stai vedendo l\'anteprima per il proprietario: i prezzi sono una proposta e i pulsanti portano alla pagina di accesso, con pagamenti solo di prova. Gli altri visitatori vedono tutte le funzioni libere.'
      : 'I prezzi qui sotto sono una proposta: i pulsanti per abbonarsi restano disattivati finché gli abbonamenti non partono.';
    U.$$('[data-periodo]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-periodo') === periodo)); });
    var et = etichettaAnnuale(c), pill = $('#pzRisparmio');
    pill.textContent = et; pill.hidden = !et;
    $('#pzPiani').innerHTML = (c.piani || []).length ? c.piani.map(function (p) { return htmlPiano(p, ctx); }).join('') : '<p class="muted">Nessun piano configurato.</p>';
    $('#pzConfronto').innerHTML = htmlConfronto(ctx);
    testiConfig(c);
    // arrivando da "Sblocca con Pro" (prezzi.html#pro) porta al piano, che prima di adesso non esisteva
    if (primoGiro) {
      primoGiro = false;
      var dest = null;
      try { dest = root.location.hash ? document.getElementById(decodeURIComponent(root.location.hash.slice(1))) : null; } catch (e) { dest = null; }
      if (dest && dest.classList.contains('pz-piano')) dest.scrollIntoView({ block: 'start' });
    }
  }

  function clic(e) {
    var b = e.target.closest && e.target.closest('button[data-azione]');
    var A = account();
    if (!b || inCorso) return;
    if (!A) { esito('Gli account non sono disponibili in questa pagina.'); return; }
    var tipo = b.getAttribute('data-azione'), testo = b.textContent, c = cfg();
    inCorso = true; b.disabled = true; esito('');
    b.textContent = tipo === 'checkout' ? 'Apro la pagina di pagamento…' : 'Apro il portale clienti…';
    new Promise(function (ok) { ok(tipo === 'checkout' ? A.checkout(b.getAttribute('data-piano'), periodo) : A.portale()); }).then(function (r) {
      root.location.assign(destinazione(r, c));
    }).catch(function (err) {
      inCorso = false; b.disabled = false; b.textContent = testo;
      esito((err && err.message) || 'Non è stato possibile aprire la pagina di pagamento. Riprova tra poco.');
    });
  }

  function avvia() {
    var q = null, pagamento = null;
    try { q = new URLSearchParams(root.location.search); pagamento = q.get('pagamento'); q = q.get('periodo'); } catch (e) { q = null; }
    if (q === 'annuale') periodo = 'annuale';
    U.$$('[data-periodo]').forEach(function (b) {
      b.addEventListener('click', function () { periodo = b.getAttribute('data-periodo') === 'annuale' ? 'annuale' : 'mensile'; rendi(); });
    });
    $('#pzPiani').addEventListener('click', clic);
    document.addEventListener('radaraste:account', function () { letto = null; if (!inCorso) rendi(); });
    // tornando indietro dalla pagina di Stripe il browser può ripresentare la pagina com'era: pulsanti di nuovo attivi
    root.addEventListener('pageshow', function (e) { if (e.persisted) { inCorso = false; rendi(); } });
    rendi();
    // ritorno dalla pagina di Stripe con "Indietro" (cancel_url di functions/api/stripe/checkout.js)
    if (pagamento === 'annullato') esito('Pagamento annullato: non ti è stato addebitato nulla. Puoi scegliere di nuovo quando vuoi.', true);
    // piano dell'utente collegato, letto una volta dal database (solo con gli account configurati)
    var ctx = contesto(), A = account();
    if (ctx.configurato && ctx.utente && A && typeof A.abbonamento === 'function') {
      try {
        A.abbonamento().then(function (ab) { if (ab) { letto = ab; if (!inCorso) rendi(); } }, function () { /* resta il piano in cache */ });
      } catch (e) { /* resta il piano in cache */ }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia); else avvia();
})(typeof window !== 'undefined' ? window : globalThis);
