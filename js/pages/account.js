/* Pagina "Il mio account": email, piano e stato dell'abbonamento (prova, disdetta, pagamento non riuscito),
 * pagamenti e fatture (portale di Stripe), dati sincronizzati, "Scarica i miei dati", cancellazione dell'account,
 * uscita. Con ?pagamento=ok (ritorno dal pagamento) aspetta che il webhook di Stripe attivi l'abbonamento.
 * Senza configurazione o senza accesso: stato chiaro e collegamento ad accedi.html.
 * I messaggi si leggono con il lettore di schermo: gli errori di un campo spostano lì il fuoco (aria-invalid e
 * descrizione), gli altri errori sul riquadro del messaggio, le conferme in una zona role="status".
 * La descrizione dell'abbonamento è esportata per i test in Node (tests/account.test.js). */
(function (root) {
  'use strict';

  var NODE = typeof module !== 'undefined' && module.exports;
  var P = root.Piani || (NODE ? require('../piani.js') : null);
  var NOMI_ACCESSO = { email: 'Email e password', google: 'Google' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // data di un istante ISO nel fuso del browser ("19 ott 2026")
  function data(iso) {
    var d = iso ? new Date(iso) : null;
    return d && !isNaN(d) ? d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  }
  function dataOra(iso) {
    var d = iso ? new Date(iso) : null;
    return d && !isNaN(d) ? data(iso) + ', ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '—';
  }
  function nomePiano(id) { return (P && P.nome(id)) || (id ? id.charAt(0).toUpperCase() + id.slice(1) : 'Gratis'); }
  function pill(testo, cls) { return '<span class="pill ' + cls + '">' + esc(testo) + '</span>'; }

  /* ---- Abbonamento ---- */
  function prezzoDi(ab) { return P && ab.periodo ? P.prezzo(ab.piano, ab.periodo) : ''; }
  function periodoTesto(ab) { return ab.periodo === 'annuale' ? 'annuale' : ab.periodo === 'mensile' ? 'mensile' : ''; }
  // HTML della descrizione dell'abbonamento; adesso: per i test (istante ISO), altrimenti ora
  function descrivi(ab, adesso) {
    ab = ab || { piano: 'gratis' };
    var nome = nomePiano(ab.piano), pr = prezzoDi(ab), per = periodoTesto(ab);
    var dettaglio = per ? ' · ' + per + (pr ? ' (' + pr + (P && P.config().ivaInclusa ? ', IVA inclusa' : '') + ')' : '') : '';
    var effettivo = P ? P.piano({ abbonamento: ab }, adesso) : ab.piano;
    var testa = function (etichetta, cls) {
      return '<div class="acc-piano"><span class="acc-piano-nome">' + esc(nome) + '</span>' + pill(etichetta, cls) + '</div>' +
        (dettaglio ? '<p class="note">Piano ' + esc(nome) + esc(dettaglio) + '</p>' : '');
    };
    if (ab.piano === 'gratis' || !ab.stato) {
      return '<div class="acc-piano"><span class="acc-piano-nome">Gratis</span>' + pill('Attivo', 'p-neutral') + '</div>' +
        '<p>' + (ab.stato === 'canceled' ? 'Il tuo abbonamento è terminato: ora usi il piano Gratis, senza scadenza.' : 'Usi il piano Gratis, senza scadenza. Con Base o Pro sblocchi tutti gli affari, le combinazioni, lo Stratega e le altre funzioni.') + '</p>';
    }
    if (ab.stato === 'trialing') {
      var g = P ? P.giorniProva(ab, adesso) : 0;
      return testa('In prova', 'p-info') +
        '<p>Prova gratuita: ' + (g === 1 ? 'ancora 1 giorno' : 'ancora ' + g + ' giorni') + ' (fino al ' + data(ab.fineProva) + ').</p>' +
        '<p>' + (ab.cancellaAllaFine ? 'Hai disdetto: alla fine della prova torni al piano Gratis senza addebiti.' : 'Alla fine della prova parte l\'abbonamento' + (pr ? ' a ' + esc(pr) : '') + ', salvo disdetta prima di quella data.') + '</p>';
    }
    if (ab.stato === 'active') {
      if (ab.cancellaAllaFine) return testa('Disdetto', 'p-warn') + '<p>Hai disdetto il rinnovo: il piano ' + esc(nome) + ' resta attivo fino al ' + data(ab.finePeriodo) + ', poi torni al piano Gratis.</p>';
      return testa('Attivo', 'p-good') + (ab.finePeriodo ? '<p>Prossimo rinnovo il ' + data(ab.finePeriodo) + '.</p>' : '');
    }
    if (ab.stato === 'past_due') {
      // la stessa data di js/piani.js: una settimana dalla fine del periodo PAGATO (Stripe ha già spostato finePeriodo
      // alla fine del periodo nuovo, non pagato)
      var fine = P ? P.fineRitardo(ab) : null;
      return testa('Pagamento non riuscito', 'p-bad') +
        '<p>L\'ultimo pagamento non è andato a buon fine. Aggiorna il metodo di pagamento da "Gestisci pagamenti e fatture"' +
        (effettivo !== 'gratis' && fine ? ': il piano ' + esc(nome) + ' resta attivo fino al ' + data(fine) + ', poi torni al piano Gratis.' : ': nel frattempo usi il piano Gratis.') + '</p>';
    }
    if (ab.stato === 'incomplete') return testa('Da completare', 'p-warn') + '<p>Il primo pagamento non è stato completato: riprova dalla pagina Prezzi o aggiorna il metodo di pagamento.</p>';
    if (ab.stato === 'unpaid' || ab.stato === 'paused') return testa('Sospeso', 'p-warn') + '<p>L\'abbonamento è sospeso per un pagamento mancante: nel frattempo usi il piano Gratis. Aggiorna il metodo di pagamento per riattivarlo.</p>';
    return testa('Terminato', 'p-neutral') + '<p>L\'abbonamento non è attivo: ora usi il piano Gratis.</p>';
  }

  if (NODE) { module.exports = { descrivi: descrivi }; return; }

  var U = root.UI, $ = U.$, A = root.Account;

  /* ---- Messaggi ---- */
  var campoErrato = null;
  function pulisciCampo() {
    var e = document.getElementById('acErroreCampo');
    if (e) e.remove();
    if (!campoErrato) return;
    campoErrato.removeAttribute('aria-invalid');
    var prima = campoErrato.getAttribute('data-descritto');
    if (prima) campoErrato.setAttribute('aria-describedby', prima); else campoErrato.removeAttribute('aria-describedby');
    campoErrato.removeAttribute('data-descritto');
    campoErrato = null;
  }
  // testo per il lettore di schermo (errore: role="alert"); un attimo dopo, così anche lo stesso messaggio si rilegge
  function leggiAVoce(testo, errore) {
    var el = $(errore ? '#acAvviso' : '#acAnnuncio');
    $('#acAvviso').textContent = ''; $('#acAnnuncio').textContent = '';
    if (testo) setTimeout(function () { el.textContent = testo; }, 60);
  }
  /* campo: il campo sbagliato. L'errore compare sotto il campo (anche su telefono si vede dove si scrive) e ne diventa
   * la descrizione; il fuoco va lì. Gli altri errori nel riquadro in alto, con il fuoco; le conferme nel riquadro,
   * portato in vista, e lette dalla zona role="status". */
  function messaggio(testo, tipo, campo) {
    var m = $('#acMsg');
    pulisciCampo();
    m.hidden = !testo || !!campo;
    m.className = 'callout acc-msg' + (tipo === 'errore' ? ' acc-errore' : tipo === 'ok' ? ' acc-ok' : '');
    m.textContent = campo ? '' : testo || '';
    if (!testo) { leggiAVoce(''); return; }
    if (campo) {
      var e = document.createElement('p'), dove = campo.closest('label') || campo;
      e.id = 'acErroreCampo'; e.className = 'acc-errore-campo'; e.textContent = testo;
      dove.parentNode.insertBefore(e, dove.nextSibling);
      campoErrato = campo;
      campo.setAttribute('data-descritto', campo.getAttribute('aria-describedby') || '');
      campo.setAttribute('aria-invalid', 'true');
      campo.setAttribute('aria-describedby', ('acErroreCampo ' + (campo.getAttribute('data-descritto') || '')).trim());
      if (document.activeElement === campo) leggiAVoce(testo, true); else campo.focus();
      return;
    }
    if (tipo !== 'errore') {
      leggiAVoce(testo, false);
      try { m.scrollIntoView({ block: 'nearest' }); } catch (e) { /* niente */ }
      return;
    }
    try { m.focus({ preventScroll: false }); } catch (e) { m.focus(); }
  }
  function occupato(btn, si, testo) {
    if (si) { btn.dataset.testo = btn.textContent; btn.textContent = testo || 'Attendi…'; }
    else if (btn.dataset.testo) btn.textContent = btn.dataset.testo;
    btn.disabled = si;
    btn.setAttribute('aria-busy', si ? 'true' : 'false');
  }
  function riga(et, val) { return '<div><dt>' + U.esc(et) + '</dt><dd>' + val + '</dd></div>'; }

  /* ---- Senza account ---- */
  function fuori(tipo) {
    $('#acDentro').hidden = true;
    var box = $('#acFuori');
    if (tipo === 'spento') {
      box.innerHTML = '<div class="callout warn acc-spento"><p><strong>Account non ancora attivo (modalità test).</strong> Il proprietario del sito non ha ancora collegato il servizio degli account e dei pagamenti: per ora non ci sono account né abbonamenti e tutte le funzioni del sito restano disponibili come sempre. Le aste che segui, le note e le preferenze restano salvate in questo browser.</p>' +
        '<div class="row-actions"><a class="btn small ghost" href="accedi.html">Pagina di accesso</a><a class="btn small ghost" href="mie-aste.html">Le mie aste</a></div></div>';
      return;
    }
    box.innerHTML = '<section class="panel empty acc-vuoto" aria-labelledby="h-fuori"><h2 id="h-fuori">Non hai effettuato l\'accesso</h2>' +
      '<p>Entra per vedere abbonamento, pagamenti e dati salvati nell\'account. Senza account il sito funziona come sempre.</p>' +
      '<div class="row-actions"><a class="btn" href="accedi.html?dopo=account.html">Accedi o crea un account</a></div></section>';
  }

  /* ---- Profilo ---- */
  function profilo(u) {
    $('#acProfilo').innerHTML = riga('Email', U.esc(u.email || '—')) +
      riga('Accesso con', U.esc(NOMI_ACCESSO[u.provider] || (u.provider ? u.provider : '—'))) +
      riga('Account creato il', U.esc(u.creato ? data(u.creato) : '—'));
  }

  function mostraAbbonamento(ab) {
    $('#acAbbonamento').innerHTML = ab ? descrivi(ab) : '<p class="muted">Carico l\'abbonamento…</p>';
    var b = $('#acPortale'), nota = $('#acPortaleNota');
    var puo = !!(ab && ab.pagamenti);
    b.disabled = !puo;
    nota.textContent = puo ? 'Metodo di pagamento, fatture, cambio di piano e disdetta si gestiscono sul portale sicuro di Stripe.'
      : 'Disponibile dopo il primo abbonamento: metodo di pagamento e fatture si gestiscono sul portale sicuro di Stripe.';
    $('#acCambia').textContent = ab && ab.piano !== 'gratis' && ab.stato && ab.stato !== 'canceled' ? 'Cambia piano' : 'Scegli un piano';
  }
  function leggiAbbonamento() {
    return A.abbonamento().then(mostraAbbonamento, function (e) {
      var st = A.statoCorrente();
      mostraAbbonamento(st && st.abbonamento);
      if (!(st && st.abbonamento)) $('#acAbbonamento').innerHTML = '<p class="muted">' + U.esc(e.message) + '</p>';
    });
  }

  // ritorno dal pagamento: il webhook di Stripe può arrivare qualche secondo dopo, si riprova per circa 30 secondi
  function dopoPagamento() {
    var box = $('#acPagamento');
    box.hidden = false;
    box.textContent = 'Pagamento completato, grazie! L\'abbonamento si attiva appena Stripe ce lo conferma, di solito in pochi secondi.';
    try { history.replaceState(history.state, '', location.pathname); } catch (e) { /* resta il parametro */ }
    var tentativi = 0;
    (function prova() {
      A.abbonamento().then(function (ab) {
        mostraAbbonamento(ab);
        // attivo davvero solo quando Stripe conferma (in prova o pagato), non con un pagamento ancora in sospeso
        if (ab.piano !== 'gratis' && (ab.stato === 'active' || ab.stato === 'trialing')) {
          box.textContent = 'Abbonamento attivo: piano ' + nomePiano(ab.piano) + (ab.stato === 'trialing' ? ', in prova gratuita' : '') + '. Buone aste!';
          return;
        }
        if (++tentativi < 10) setTimeout(prova, 3000);
        else box.textContent = 'Pagamento ricevuto: l\'abbonamento non risulta ancora attivo. Ricarica la pagina tra qualche minuto; se non cambia scrivici indicando l\'email dell\'account.';
      }, function () { if (++tentativi < 10) setTimeout(prova, 3000); });
    })();
  }

  /* ---- Dati sincronizzati ---- */
  function tile(et, val, nota) { return '<div class="tile"><span class="t-et">' + U.esc(et) + '</span><span class="t-val">' + U.esc(val) + '</span>' + (nota ? '<span class="t-nota">' + U.esc(nota) + '</span>' : '') + '</div>'; }
  function mostraDati() {
    var r = A.riepilogoDati();
    $('#acConteggi').innerHTML = tile('Aste seguite', String(r.seguite), 'con note e stato') + tile('Aste inserite a mano', String(r.aste)) +
      tile('Ricerche salvate', String(r.ricerche)) + tile('Preferenze affari', r.preferenze ? 'Salvate' : 'Nessuna') +
      tile('Profilo Stratega', r.stratega ? 'Salvato' : 'Nessuno');
    // dati di questo browser collegati a un altro account: si uniscono solo se lo sceglie chi è entrato
    $('#acCollega').hidden = !r.daConfermare;
    $('#acSincronizza').hidden = !!r.daConfermare;
    $('#acSync').textContent = r.daConfermare ? 'In questo browser l\'account non si sincronizza finché non scegli se unire i dati.' :
      (r.ultima ? 'Ultima sincronizzazione: ' + dataOra(r.ultima) + '.' : 'Dati di questo browser non ancora sincronizzati con l\'account.') +
      (r.pendenti ? ' Ci sono modifiche da salvare: partono da sole dopo pochi secondi.' : '');
  }

  function disegna() {
    var ant = $('#acAnteprima');
    if (ant && P) ant.innerHTML = P.avvisoAnteprima();
    if (!A || !A.configurato()) { fuori('spento'); return false; }
    var u = A.utente();
    if (!u) { fuori('fuori'); return false; }
    $('#acFuori').innerHTML = '';
    $('#acDentro').hidden = false;
    profilo(u);
    var st = A.statoCorrente();
    mostraAbbonamento(st && st.abbonamento);
    mostraDati();
    return true;
  }

  function collega() {
    U.$$('[data-mostra]').forEach(function (c) {
      c.addEventListener('change', function () { var f = document.getElementById(c.getAttribute('data-mostra')); if (f) f.elements.password.type = c.checked ? 'text' : 'password'; });
    });
    document.addEventListener('input', function (e) { if (campoErrato && e.target === campoErrato) pulisciCampo(); });

    $('#acPortale').addEventListener('click', function () {
      var b = this;
      occupato(b, true, 'Apro il portale…');
      A.portale().then(function (d) { location.href = d.url; }, function (e) { occupato(b, false); messaggio(e.message, 'errore'); });
    });

    $('#acSincronizza').addEventListener('click', function () {
      var b = this;
      occupato(b, true, 'Sincronizzo…');
      A.caricaDati().then(function (r) {
        occupato(b, false); mostraDati();
        if (!r.daConfermare) messaggio('Dati sincronizzati.', 'ok');
      }, function (e) { occupato(b, false); mostraDati(); messaggio(e.message, 'errore'); });
    });

    $('#acUnisci').addEventListener('click', function () {
      var b = this;
      occupato(b, true, 'Unisco i dati…');
      A.caricaDati({ unisci: true }).then(function () {
        occupato(b, false); mostraDati();
        messaggio('Dati di questo browser uniti al tuo account e sincronizzati.', 'ok');
      }, function (e) { occupato(b, false); mostraDati(); messaggio(e.message, 'errore'); });
    });

    $('#acScarica').addEventListener('click', function () {
      var b = this;
      occupato(b, true, 'Preparo il file…');
      A.esportaDati().then(function (d) {
        occupato(b, false);
        U.offriFile('radar-aste-miei-dati-' + U.oggi() + '.json', JSON.stringify(d, null, 2), 'application/json');
      }, function (e) { occupato(b, false); messaggio(e.message, 'errore'); });
    });

    // conferma in due tempi: il primo clic arma il pulsante, il secondo (entro 4 secondi) cancella
    var etichettaCancella = $('#acCancella').textContent;
    $('#acCancella').addEventListener('click', function () {
      var b = this;
      if (b.disabled) return;
      U.conferma(b, 'Conferma: cancella per sempre', function () {
        occupato(b, true, 'Cancellazione in corso…');
        A.cancellaAccount().then(function (d) {
          b.dataset.testo = etichettaCancella; occupato(b, false);
          $('#acDentro').hidden = true;
          fuori('fuori');
          messaggio((d && d.messaggio) || 'Account cancellato.', 'ok');
        }, function (e) {
          // di nuovo "Cancella il mio account": un altro tentativo chiede ancora la conferma
          b.dataset.testo = etichettaCancella; occupato(b, false);
          messaggio(e.message, 'errore');
        });
      });
      // il cambio di etichetta non sempre viene letto: lo si dice a voce
      if (b.dataset.armato === '1') leggiAVoce('Premi di nuovo il pulsante entro 4 secondi per cancellare l\'account per sempre.', false);
    });

    $('#acEsci').addEventListener('click', function () {
      var b = this;
      occupato(b, true, 'Uscita…');
      A.esci().then(function () { occupato(b, false); disegna(); messaggio('Sei uscito dall\'account. I dati salvati in questo browser restano su questo dispositivo.', 'ok'); },
        function (e) { occupato(b, false); messaggio(e.message, 'errore'); });
    });

    $('#fPassword').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target, pw = f.elements.password.value, b = f.querySelector('[type=submit]');
      if (pw.length < A.MIN_PASSWORD) { messaggio('La password deve avere almeno ' + A.MIN_PASSWORD + ' caratteri.', 'errore', f.elements.password); return; }
      messaggio('');
      occupato(b, true, 'Salvataggio…');
      A.cambiaPassword(pw).then(function () { occupato(b, false); f.reset(); messaggio('Password cambiata.', 'ok'); }, function (err) { occupato(b, false); messaggio(err.message, 'errore'); });
    });
  }

  function avvia() {
    collega();
    var pagamento = U.parametro('pagamento') === 'ok';
    function abbonamentoDaLeggere() { if (pagamento) { pagamento = false; dopoPagamento(); } else leggiAbbonamento(); }
    if (disegna()) abbonamentoDaLeggere();
    // la sessione può arrivare un attimo dopo (ritorno da un'altra pagina, rinnovo del token)
    else if (A && A.configurato()) A.pronto().then(function () { if (disegna()) abbonamentoDaLeggere(); });
    if (!A || !A.configurato()) return;
    // sessione, abbonamento o dati cambiati (anche da un'altra scheda)
    document.addEventListener('radaraste:account', function (e) {
      var m = e.detail && e.detail.motivo;
      if (m === 'rinnovo') return;
      if (!A.utente()) { if (m !== 'cancellato') disegna(); return; }
      if (m === 'dati') { mostraDati(); return; }
      disegna();
    });
    document.addEventListener('radaraste:seguite', function () { if (A.utente()) mostraDati(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia); else avvia();
})(typeof window !== 'undefined' ? window : globalThis);
