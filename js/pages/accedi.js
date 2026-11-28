/* Pagina "Accedi": accesso e registrazione con email e password, link di accesso via email, Google (js/account.js).
 * ?dopo=<pagina> riporta dove si era dopo l'accesso (solo pagine di questo sito). I moduli sono disattivati
 * nell'HTML e si accendono solo con gli account configurati; senza configurazione resta l'avviso
 * "Account non ancora attivo (modalità test)". I messaggi si leggono con il lettore di schermo: gli errori di un campo
 * spostano lì il fuoco (aria-invalid e descrizione), gli altri errori sul riquadro del messaggio, le conferme in una
 * zona role="status". */
(function () {
  'use strict';
  var U = window.UI, $ = U.$, A = window.Account, P = window.Piani;
  var dopo = A ? A.paginaSicura(U.parametro('dopo') || 'account.html') : 'account.html';

  /* ---- Messaggi ---- */
  var campoErrato = null;
  function pulisciCampo() {
    var e = document.getElementById('accErroreCampo');
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
    var el = $(errore ? '#accAvviso' : '#accAnnuncio');
    $('#accAvviso').textContent = ''; $('#accAnnuncio').textContent = '';
    if (testo) setTimeout(function () { el.textContent = testo; }, 60);
  }
  /* campo: il campo sbagliato. L'errore compare sotto il campo (anche su telefono si vede dove si scrive) e ne diventa
   * la descrizione; il fuoco va lì. Gli altri errori nel riquadro in alto, con il fuoco; le conferme nel riquadro,
   * portato in vista, e lette dalla zona role="status". */
  function messaggio(testo, tipo, campo) {
    var m = $('#accMsg');
    pulisciCampo();
    m.hidden = !testo || !!campo;
    m.className = 'callout acc-msg' + (tipo === 'errore' ? ' acc-errore' : tipo === 'ok' ? ' acc-ok' : '');
    m.textContent = campo ? '' : testo || '';
    if (!testo) { leggiAVoce(''); return; }
    if (campo) {
      var e = document.createElement('p'), dove = campo.closest('label') || campo;
      e.id = 'accErroreCampo'; e.className = 'acc-errore-campo'; e.textContent = testo;
      dove.parentNode.insertBefore(e, dove.nextSibling);
      campoErrato = campo;
      campo.setAttribute('data-descritto', campo.getAttribute('aria-describedby') || '');
      campo.setAttribute('aria-invalid', 'true');
      campo.setAttribute('aria-describedby', ('accErroreCampo ' + (campo.getAttribute('data-descritto') || '')).trim());
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
  // moduli e pulsanti di accesso: disattivati finché gli account non sono configurati (e durante il cambio di pagina)
  function accendi(si) {
    U.$$('#accModuli fieldset, #accLink, #accGoogle').forEach(function (el) { el.disabled = !si; });
  }
  // dopo l'accesso: aspetta (al massimo 4 secondi) abbonamento e dati, poi torna alla pagina di prima
  function entrato(testo) {
    messaggio(testo + ' Ti riporto alla pagina ' + (dopo === 'account.html' ? 'del tuo account' : 'di prima') + '…', 'ok');
    accendi(false);
    A.attendi(4000).then(function () { location.href = dopo; });
  }
  // con l'accesso già fatto i moduli non servono: tornano dopo l'uscita
  function moduli(visibili) { $('#accModuli').hidden = !visibili; $('#accGoogleBox').hidden = !visibili; }
  function mostraDentro(u) {
    var d = $('#accDentro');
    d.hidden = false;
    moduli(false);
    d.innerHTML = '<p>Hai già effettuato l\'accesso come <b>' + U.esc(u.email || 'utente') + '</b>.</p>' +
      '<div class="row-actions"><a class="btn small" href="account.html">Vai al tuo account</a>' +
      (dopo !== 'account.html' ? '<a class="btn small ghost" href="' + U.esc(dopo) + '">Torna alla pagina di prima</a>' : '') +
      '<button class="btn small ghost" type="button" id="accEsci">Esci</button></div>';
    $('#accEsci').addEventListener('click', function () {
      var b = this;
      occupato(b, true, 'Uscita…');
      A.esci().then(function () {
        d.hidden = true; moduli(true);
        messaggio('Sei uscito dall\'account. I dati salvati in questo browser restano su questo dispositivo.', 'ok');
      }, function (e) { occupato(b, false); messaggio(e.message, 'errore'); });
    });
  }
  function valori(form) { return { email: form.elements.email.value.trim(), password: form.elements.password ? form.elements.password.value : '' }; }
  function controllaEmail(form, v) {
    if (A.emailValida(v.email)) return true;
    messaggio(v.email ? 'Indirizzo email non valido: controlla di averlo scritto bene.' : 'Scrivi la tua email.', 'errore', form.elements.email);
    return false;
  }
  function controllaConsenso(form) {
    if (form.elements.consenso.checked) return true;
    messaggio('Per creare l\'account devi accettare le Condizioni d\'uso e di abbonamento e confermare di aver letto l\'Informativa sulla privacy.', 'errore', form.elements.consenso);
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
    // il campo corretto non è più segnato come sbagliato
    document.addEventListener('input', function (e) { if (campoErrato && e.target === campoErrato) pulisciCampo(); });
    document.addEventListener('change', function (e) { if (campoErrato && e.target === campoErrato) pulisciCampo(); });

    $('#fAccedi').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target, v = valori(f), b = f.querySelector('[type=submit]');
      if (!controllaEmail(f, v)) return;
      if (!v.password) { messaggio('Scrivi la password, oppure ricevi un link di accesso via email.', 'errore', f.elements.password); return; }
      messaggio('');
      occupato(b, true, 'Accesso in corso…');
      A.accedi(v.email, v.password).then(function (u) { entrato('Accesso eseguito come ' + (u.email || v.email) + '.'); }, function (err) {
        occupato(b, false); messaggio(err.message, 'errore');
      });
    });

    $('#accLink').addEventListener('click', function () {
      var f = $('#fAccedi'), v = valori(f), b = this;
      if (!controllaEmail(f, v)) return;
      messaggio('');
      occupato(b, true, 'Invio in corso…');
      A.linkMagico(v.email, dopo).then(function () {
        occupato(b, false);
        messaggio('Ti abbiamo inviato un link a ' + v.email + ': aprilo in questo stesso browser per entrare. Se non arriva entro qualche minuto controlla lo spam.', 'ok');
      }, function (err) { occupato(b, false); messaggio(err.message, 'errore'); });
    });

    $('#fRegistra').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target, v = valori(f), b = f.querySelector('[type=submit]');
      if (!controllaEmail(f, v)) return;
      if (v.password.length < A.MIN_PASSWORD) { messaggio('La password deve avere almeno ' + A.MIN_PASSWORD + ' caratteri.', 'errore', f.elements.password); return; }
      if (!controllaConsenso(f)) return;
      messaggio('');
      occupato(b, true, 'Creazione in corso…');
      A.registrati(v.email, v.password, { consenso: true, dopo: dopo }).then(function (r) {
        occupato(b, false);
        if (r.accesso) { entrato('Account creato.'); return; }
        f.reset();
        messaggio('Ti abbiamo inviato un\'email a ' + v.email + ' per confermare l\'indirizzo: apri il link in questo stesso browser per entrare. Se non arriva entro qualche minuto controlla lo spam, oppure prova ad accedere: forse hai già un account con questa email.', 'ok');
      }, function (err) { occupato(b, false); messaggio(err.message, 'errore'); });
    });

    $('#accRegLink').addEventListener('click', function () {
      var f = $('#fRegistra'), v = valori(f), b = this;
      if (!controllaEmail(f, v) || !controllaConsenso(f)) return;
      messaggio('');
      occupato(b, true, 'Invio in corso…');
      A.linkMagico(v.email, dopo, { crea: true, consenso: true }).then(function () {
        occupato(b, false);
        messaggio('Ti abbiamo inviato un link a ' + v.email + ': aprilo in questo stesso browser per creare l\'account ed entrare, senza password.', 'ok');
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
    if (!A || !A.configurato()) { $('#accSpento').hidden = false; accendi(false); return; }
    accendi(true);
    A.pronto().then(function (r) {
      // ritorno dal link dell'email o da Google
      if (r && r.errore) messaggio(r.errore, 'errore');
      var u = A.utente();
      if (!u) return;
      if (r && r.accesso) { entrato(r.tipo === 'signup' ? 'Email confermata: sei dentro.' : 'Accesso eseguito.'); return; }
      mostraDentro(u);
    });
    document.addEventListener('radaraste:account', function (e) {
      var motivo = e.detail && e.detail.motivo;
      if (motivo === 'rinnovo') return;
      if (!A.utente() && !$('#accDentro').hidden) { $('#accDentro').hidden = true; moduli(true); }
      // accesso fatto in un'altra scheda (per esempio aprendo il link dell'email): qui i moduli non servono più
      else if (motivo === 'altra-scheda' && A.utente() && $('#accDentro').hidden) { messaggio(''); mostraDentro(A.utente()); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia); else avvia();
})();
