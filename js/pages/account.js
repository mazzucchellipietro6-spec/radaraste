/* Pagina "Il mio account": email, piano e stato dell'abbonamento (prova, disdetta, pagamento non riuscito),
 * pagamenti e fatture (portale di Stripe), dati sincronizzati, "Scarica i miei dati", cancellazione dell'account,
 * uscita. Con ?pagamento=ok (ritorno dal pagamento) aspetta che il webhook di Stripe attivi l'abbonamento.
 * Senza configurazione o senza accesso: stato chiaro e collegamento ad accedi.html. */
(function () {
  'use strict';
  var U = window.UI, $ = U.$, A = window.Account, P = window.Piani;
  var GIORNO = 86400000;
  var NOMI_ACCESSO = { email: 'Email e password', google: 'Google' };

  function messaggio(testo, tipo) {
    var m = $('#acMsg');
    m.hidden = !testo;
    m.className = 'callout acc-msg' + (tipo === 'errore' ? ' acc-errore' : tipo === 'ok' ? ' acc-ok' : '');
    m.textContent = testo || '';
    if (testo && tipo === 'errore') { try { m.focus({ preventScroll: false }); } catch (e) { m.focus(); } }
  }
  function occupato(btn, si, testo) {
    if (si) { btn.dataset.testo = btn.textContent; btn.textContent = testo || 'Attendi…'; }
    else if (btn.dataset.testo) btn.textContent = btn.dataset.testo;
    btn.disabled = si;
    btn.setAttribute('aria-busy', si ? 'true' : 'false');
  }
  // data di un istante ISO nel fuso del browser ("19 ott 2026")
  function data(iso) { var d = iso ? new Date(iso) : null; return d && !isNaN(d) ? U.dataIt(U.oggi(d)) : '—'; }
  function dataOra(iso) {
    var d = iso ? new Date(iso) : null;
    return d && !isNaN(d) ? data(iso) + ', ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '—';
  }
  function nomePiano(id) { return (P && P.nome(id)) || (id ? id.charAt(0).toUpperCase() + id.slice(1) : 'Gratis'); }
  function pill(testo, cls) { return '<span class="pill ' + cls + '">' + U.esc(testo) + '</span>'; }
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

  /* ---- Abbonamento ---- */
  function prezzoDi(ab) { return P && ab.periodo ? P.prezzo(ab.piano, ab.periodo) : ''; }
  function periodoTesto(ab) { return ab.periodo === 'annuale' ? 'annuale' : ab.periodo === 'mensile' ? 'mensile' : ''; }
  function descrivi(ab) {
    ab = ab || { piano: 'gratis' };
    var nome = nomePiano(ab.piano), pr = prezzoDi(ab), per = periodoTesto(ab);
    var dettaglio = per ? ' · ' + per + (pr ? ' (' + pr + (P && P.config().ivaInclusa ? ', IVA inclusa' : '') + ')' : '') : '';
    var effettivo = P ? P.piano({ abbonamento: ab }) : ab.piano;
    var testa = function (etichetta, cls) {
      return '<div class="acc-piano"><span class="acc-piano-nome">' + U.esc(nome) + '</span>' + pill(etichetta, cls) + '</div>' +
        (dettaglio ? '<p class="note">Piano ' + U.esc(nome) + U.esc(dettaglio) + '</p>' : '');
    };
    if (ab.piano === 'gratis' || !ab.stato) {
      return '<div class="acc-piano"><span class="acc-piano-nome">Gratis</span>' + pill('Attivo', 'p-neutral') + '</div>' +
        '<p>' + (ab.stato === 'canceled' ? 'Il tuo abbonamento è terminato: ora usi il piano Gratis, senza scadenza.' : 'Usi il piano Gratis, senza scadenza. Con Base o Pro sblocchi tutti gli affari, le combinazioni, lo Stratega e le altre funzioni.') + '</p>';
    }
    if (ab.stato === 'trialing') {
      var g = P ? P.giorniProva(ab) : 0;
      return testa('In prova', 'p-info') +
        '<p>Prova gratuita: ' + (g === 1 ? 'ancora 1 giorno' : 'ancora ' + g + ' giorni') + ' (fino al ' + data(ab.fineProva) + ').</p>' +
        '<p>' + (ab.cancellaAllaFine ? 'Hai disdetto: alla fine della prova torni al piano Gratis senza addebiti.' : 'Alla fine della prova parte l\'abbonamento' + (pr ? ' a ' + U.esc(pr) : '') + ', salvo disdetta prima di quella data.') + '</p>';
    }
    if (ab.stato === 'active') {
      if (ab.cancellaAllaFine) return testa('Disdetto', 'p-warn') + '<p>Hai disdetto il rinnovo: il piano ' + U.esc(nome) + ' resta attivo fino al ' + data(ab.finePeriodo) + ', poi torni al piano Gratis.</p>';
      return testa('Attivo', 'p-good') + (ab.finePeriodo ? '<p>Prossimo rinnovo il ' + data(ab.finePeriodo) + '.</p>' : '');
    }
    if (ab.stato === 'past_due') {
      var fine = ab.finePeriodo ? new Date(new Date(ab.finePeriodo).getTime() + (P ? P.GIORNI_RITARDO : 7) * GIORNO).toISOString() : null;
      return testa('Pagamento non riuscito', 'p-bad') +
        '<p>L\'ultimo pagamento non è andato a buon fine. Aggiorna il metodo di pagamento da "Gestisci pagamenti e fatture"' +
        (effettivo !== 'gratis' && fine ? ': il piano ' + U.esc(nome) + ' resta attivo fino al ' + data(fine) + ', poi torni al piano Gratis.' : ': nel frattempo usi il piano Gratis.') + '</p>';
    }
    if (ab.stato === 'incomplete') return testa('Da completare', 'p-warn') + '<p>Il primo pagamento non è stato completato: riprova dalla pagina Prezzi o aggiorna il metodo di pagamento.</p>';
    if (ab.stato === 'unpaid' || ab.stato === 'paused') return testa('Sospeso', 'p-warn') + '<p>L\'abbonamento è sospeso per un pagamento mancante: nel frattempo usi il piano Gratis. Aggiorna il metodo di pagamento per riattivarlo.</p>';
    return testa('Terminato', 'p-neutral') + '<p>L\'abbonamento non è attivo: ora usi il piano Gratis.</p>';
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
    $('#acSync').textContent = (r.ultima ? 'Ultima sincronizzazione: ' + dataOra(r.ultima) + '.' : 'Dati di questo browser non ancora sincronizzati con l\'account.') +
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

    $('#acPortale').addEventListener('click', function () {
      var b = this;
      occupato(b, true, 'Apro il portale…');
      A.portale().then(function (d) { location.href = d.url; }, function (e) { occupato(b, false); messaggio(e.message, 'errore'); });
    });

    $('#acSincronizza').addEventListener('click', function () {
      var b = this;
      occupato(b, true, 'Sincronizzo…');
      A.caricaDati().then(function () { occupato(b, false); mostraDati(); U.toast('Dati sincronizzati'); }, function (e) { occupato(b, false); mostraDati(); messaggio(e.message, 'errore'); });
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
    });

    $('#acEsci').addEventListener('click', function () {
      var b = this;
      occupato(b, true, 'Uscita…');
      A.esci().then(function () { occupato(b, false); U.toast('Sei uscito dall\'account'); disegna(); }, function (e) { occupato(b, false); messaggio(e.message, 'errore'); });
    });

    $('#fPassword').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target, pw = f.elements.password.value, b = f.querySelector('[type=submit]');
      if (pw.length < A.MIN_PASSWORD) { messaggio('La password deve avere almeno ' + A.MIN_PASSWORD + ' caratteri.', 'errore'); f.elements.password.focus(); return; }
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
})();
