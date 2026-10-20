/* Pagina "Accedi": accesso e registrazione con email e password, link di accesso via email, Google (js/account.js).
 * ?dopo=<pagina> riporta dove si era dopo l'accesso (solo pagine di questo sito). Senza configurazione degli account
 * il modulo resta disabilitato con l'avviso "Account non ancora attivo (modalità test)". */
(function () {
  'use strict';
  var U = window.UI, $ = U.$, A = window.Account, P = window.Piani;
  var dopo = A ? A.paginaSicura(U.parametro('dopo') || 'account.html') : 'account.html';

  // messaggio sopra i moduli; gli errori prendono il fuoco così il lettore di schermo li legge subito
  function messaggio(testo, tipo) {
    var m = $('#accMsg');
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
  function spegni() {
    U.$$('#accModuli input, #accModuli button, #accGoogle').forEach(function (el) { el.disabled = true; });
  }
  // dopo l'accesso: aspetta (al massimo 4 secondi) abbonamento e dati, poi torna alla pagina di prima
  function entrato(testo) {
    messaggio(testo + ' Ti riporto alla pagina ' + (dopo === 'account.html' ? 'del tuo account' : 'di prima') + '…', 'ok');
    spegni();
    A.attendi(4000).then(function () { location.href = dopo; });
  }
  function mostraDentro(u) {
    var d = $('#accDentro');
    d.hidden = false;
    d.innerHTML = '<p>Hai già effettuato l\'accesso come <b>' + U.esc(u.email || 'utente') + '</b>.</p>' +
      '<div class="row-actions"><a class="btn small" href="account.html">Vai al tuo account</a>' +
      (dopo !== 'account.html' ? '<a class="btn small ghost" href="' + U.esc(dopo) + '">Torna alla pagina di prima</a>' : '') +
      '<button class="btn small ghost" type="button" id="accEsci">Esci</button></div>';
    $('#accEsci').addEventListener('click', function () {
      var b = this;
      occupato(b, true, 'Uscita…');
      A.esci().then(function () { d.hidden = true; U.toast('Sei uscito dall\'account'); }, function (e) { occupato(b, false); messaggio(e.message, 'errore'); });
    });
  }
  function valori(form) { return { email: form.elements.email.value.trim(), password: form.elements.password ? form.elements.password.value : '' }; }
  function controllaEmail(form, v) {
    if (A.emailValida(v.email)) return true;
    messaggio(v.email ? 'Indirizzo email non valido: controlla di averlo scritto bene.' : 'Scrivi la tua email.', 'errore');
    form.elements.email.focus();
    return false;
  }
  function controllaConsenso(form) {
    if (form.elements.consenso.checked) return true;
    messaggio('Per creare l\'account devi accettare i Termini del servizio e confermare di aver letto l\'Informativa sulla privacy.', 'errore');
    form.elements.consenso.focus();
    return false;
  }

  function collega() {
    // mostra la password (campo del modulo indicato in data-mostra)
    U.$$('[data-mostra]').forEach(function (c) {
      c.addEventListener('change', function () {
        var f = document.getElementById(c.getAttribute('data-mostra'));
        if (f) f.elements.password.type = c.checked ? 'text' : 'password';
      });
    });

    $('#fAccedi').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target, v = valori(f), b = f.querySelector('[type=submit]');
      if (!controllaEmail(f, v)) return;
      if (!v.password) { messaggio('Scrivi la password, oppure ricevi un link di accesso via email.', 'errore'); f.elements.password.focus(); return; }
      messaggio('');
      occupato(b, true, 'Accesso in corso…');
      A.accedi(v.email, v.password).then(function (u) { entrato('Accesso eseguito come ' + (u.email || v.email) + '.'); }, function (err) {
        occupato(b, false); messaggio(err.message, 'errore');
      });
    });

    $('#accLink').addEventListener('click', function () {
      var f = $('#fAccedi'), v = valori(f), b = this;
      if (!controllaEmail(f, v)) return;
      occupato(b, true, 'Invio in corso…');
      A.linkMagico(v.email, dopo).then(function () {
        occupato(b, false);
        messaggio('Ti abbiamo inviato un link a ' + v.email + ': aprilo da questo dispositivo per entrare. Se non arriva entro qualche minuto controlla lo spam.', 'ok');
      }, function (err) { occupato(b, false); messaggio(err.message, 'errore'); });
    });

    $('#fRegistra').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target, v = valori(f), b = f.querySelector('[type=submit]');
      if (!controllaEmail(f, v)) return;
      if (v.password.length < A.MIN_PASSWORD) { messaggio('La password deve avere almeno ' + A.MIN_PASSWORD + ' caratteri.', 'errore'); f.elements.password.focus(); return; }
      if (!controllaConsenso(f)) return;
      messaggio('');
      occupato(b, true, 'Creazione in corso…');
      A.registrati(v.email, v.password, { consenso: true, dopo: dopo }).then(function (r) {
        occupato(b, false);
        if (r.accesso) { entrato('Account creato.'); return; }
        f.reset();
        messaggio('Ti abbiamo inviato un\'email a ' + v.email + ' per confermare l\'indirizzo: apri il link per entrare. Se non arriva entro qualche minuto controlla lo spam, oppure prova ad accedere: forse hai già un account con questa email.', 'ok');
      }, function (err) { occupato(b, false); messaggio(err.message, 'errore'); });
    });

    $('#accRegLink').addEventListener('click', function () {
      var f = $('#fRegistra'), v = valori(f), b = this;
      if (!controllaEmail(f, v) || !controllaConsenso(f)) return;
      occupato(b, true, 'Invio in corso…');
      A.linkMagico(v.email, dopo, { crea: true, consenso: true }).then(function () {
        occupato(b, false);
        messaggio('Ti abbiamo inviato un link a ' + v.email + ': aprilo per creare l\'account ed entrare, senza password.', 'ok');
      }, function (err) { occupato(b, false); messaggio(err.message, 'errore'); });
    });

    $('#accGoogle').addEventListener('click', function () {
      var b = this;
      occupato(b, true, 'Apro Google…');
      A.accediConGoogle(dopo).catch(function (err) { occupato(b, false); messaggio(err.message, 'errore'); });
    });
  }

  function avvia() {
    var ant = $('#accAnteprima');
    if (ant && P) ant.innerHTML = P.avvisoAnteprima();
    collega();
    if (!A || !A.configurato()) { $('#accSpento').hidden = false; spegni(); return; }
    A.pronto().then(function (r) {
      // ritorno dal link dell'email o da Google
      if (r && r.errore) messaggio(r.errore, 'errore');
      var u = A.utente();
      if (!u) return;
      if (r && r.accesso) { entrato(r.tipo === 'signup' ? 'Email confermata: sei dentro.' : 'Accesso eseguito.'); return; }
      mostraDentro(u);
    });
    document.addEventListener('radaraste:account', function (e) {
      if (e.detail && e.detail.motivo === 'rinnovo') return;
      if (!A.utente()) $('#accDentro').hidden = true;
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia); else avvia();
})();
