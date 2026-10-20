/* Account degli utenti (Supabase): accesso, sessione, abbonamento, dati sincronizzati e pagamenti (Stripe).
 *
 * SPENTO finché config/abbonamenti.js non ha l'indirizzo e la chiave anonima di Supabase: ogni chiamata rifiuta con
 * "Account non ancora attivo: configurazione mancante (modalità test)", non parte nessuna richiesta di rete e non si
 * registra nessun ascoltatore. Il sito resta esattamente quello di sempre.
 *
 * Solo fetch, nessuna libreria: GoTrue (/auth/v1: registrazione, accesso, rinnovo del token, link via email, Google),
 * PostgREST (/rest/v1: tabelle abbonamenti e dati_utente, protette dalla Row Level Security di supabase/schema.sql) e
 * le funzioni del sito (/api/...: pagamento, portale clienti, cancellazione) con Authorization: Bearer <token>.
 *
 * Nel browser (localStorage):
 *   radaraste.account               sessione { access_token, refresh_token, expires_at (secondi Unix), utente }
 *   radaraste.account.abbonamento   ultimo abbonamento letto { utente, letto, dati }
 *   radaraste.account.sync          registro della sincronizzazione: cosa è cambiato e quando, aste tolte
 *   radaraste.account.precedenti    copia dei dati di questo browser sostituiti dall'ultima sincronizzazione
 *
 * Sincronizzazione con la tabella dati_utente: unione prudente, i dati di questo browser non si perdono mai.
 *   aste seguite, aste inserite a mano    → unione per id; per la stessa asta vince la versione modificata per
 *                                           ultima (con la sua nota). Un'asta tolta su un dispositivo sparisce anche
 *                                           dagli altri solo se nessuno l'ha modificata dopo.
 *   preferenze, ricerche, profilo Stratega → vince il dato modificato per ultimo; quello sostituito resta in
 *                                           radaraste.account.precedenti (e nel file "Scarica i miei dati").
 * Salvataggio automatico 2 secondi dopo ogni modifica delle aste seguite (evento 'radaraste:seguite').
 * Evento 'radaraste:account' su document (detail.motivo) quando cambiano sessione, abbonamento o dati. */
(function (root) {
  'use strict';

  var NODE = typeof module !== 'undefined' && module.exports;
  var K_SESSIONE = 'radaraste.account';
  var K_ABBONAMENTO = 'radaraste.account.abbonamento';
  var K_SYNC = 'radaraste.account.sync';
  var K_PRECEDENTI = 'radaraste.account.precedenti';
  var K_CARICATI = 'radaraste.account.caricati';     // sessionStorage: dati già caricati in questa sessione del browser
  var K_SEGUITE = 'radaraste.v1.seguite', K_ASTE = 'radaraste.v1.aste';
  // dati del sito che seguono l'account; le liste (voci con id) si uniscono voce per voce
  var CHIAVI = [K_SEGUITE, K_ASTE, 'radaraste.preferenze', 'radaraste.ricerche', 'radaraste.stratega'];
  var LISTE = {}; LISTE[K_SEGUITE] = true; LISTE[K_ASTE] = true;

  var NON_CONFIGURATO = 'Account non ancora attivo: configurazione mancante (modalità test)';
  var NON_AUTENTICATO = 'Accedi al tuo account per continuare.';
  var ANTICIPO = 60;                        // secondi: il token si rinnova un minuto prima che scada
  var ATTESA_SALVATAGGIO = 2000;            // millisecondi dopo l'ultima modifica
  var VALIDITA_ABBONAMENTO = 5 * 60000;     // l'abbonamento letto si rilegge dopo 5 minuti
  var DURATA_RIMOSSE = 180 * 86400000;      // per quanto si ricorda un'asta tolta (poi potrebbe ricomparire)
  var ATTESA_RETE = 15000;
  var MIN_PASSWORD = 8;
  var PIANI = ['gratis', 'base', 'pro'], A_PAGAMENTO = ['base', 'pro'], PERIODI = ['mensile', 'annuale'];
  var SPENTI = { supabase: {}, api: {} };

  function niente() { /* errore già gestito altrove */ }

  /* ---- Configurazione ---- */
  function cfg() {
    var c = root.ABBONAMENTI;
    if (!c && NODE) { try { c = require('../config/abbonamenti.js'); } catch (e) { c = null; } }
    return c || SPENTI;
  }
  // indirizzo del progetto Supabase senza barra finale ('' se manca o non è https; http solo in locale)
  function base() {
    var s = cfg().supabase || {}, u = String(s.url || '').trim().replace(/\/+$/, '');
    return /^https:\/\/[^\s/?#]+$/.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u) ? u : '';
  }
  function chiave() { var s = cfg().supabase || {}; return typeof s.chiaveAnonima === 'string' ? s.chiaveAnonima.trim() : ''; }
  function configurato() { return !!(base() && chiave()); }

  /* ---- Errori ---- */
  function errore(messaggio, codice, stato) {
    var e = new Error(messaggio);
    e.codice = codice || 'errore';
    if (stato) e.stato = stato;
    return e;
  }
  function rifiuta(messaggio, codice) { return Promise.reject(errore(messaggio, codice)); }
  function spento() { return rifiuta(NON_CONFIGURATO, 'non-configurato'); }

  // risposte di GoTrue (codici nuovi in error_code, vecchi in error) → messaggio in italiano
  var ERRORI = {
    invalid_credentials: 'Email o password non corretti.',
    email_not_confirmed: 'Devi prima confermare l\'indirizzo email: apri il link che ti abbiamo inviato (controlla anche lo spam).',
    user_already_exists: 'Esiste già un account con questa email: accedi, oppure ricevi un link di accesso via email.',
    email_exists: 'Esiste già un account con questa email: accedi, oppure ricevi un link di accesso via email.',
    weak_password: 'Password troppo debole: usa almeno ' + MIN_PASSWORD + ' caratteri, meglio con lettere, numeri e simboli.',
    over_email_send_rate_limit: 'Hai già chiesto un\'email da poco: attendi qualche minuto e riprova.',
    over_request_rate_limit: 'Troppi tentativi ravvicinati: attendi qualche minuto e riprova.',
    email_address_invalid: 'Indirizzo email non valido.',
    validation_failed: 'Controlla i dati inseriti: email o password non validi.',
    signup_disabled: 'Le nuove registrazioni sono chiuse in questo momento.',
    email_provider_disabled: 'L\'accesso con email non è attivo in questo momento.',
    provider_disabled: 'L\'accesso con Google non è ancora attivo.',
    otp_disabled: 'Nessun account con questa email: creane uno dalla sezione "Crea un account".',
    otp_expired: 'Il link è scaduto o è già stato usato: chiedine uno nuovo.',
    access_denied: 'Accesso annullato o non autorizzato: riprova.',
    same_password: 'La nuova password è uguale a quella attuale.',
    reauthentication_needed: 'Per sicurezza entra di nuovo (anche con il link via email) e poi cambia la password.',
    user_banned: 'Questo account è sospeso.',
    refresh_token_not_found: 'La sessione è scaduta: accedi di nuovo.',
    refresh_token_already_used: 'La sessione è scaduta: accedi di nuovo.',
    session_not_found: 'La sessione è scaduta: accedi di nuovo.',
    session_expired: 'La sessione è scaduta: accedi di nuovo.',
    bad_jwt: 'Accesso scaduto: entra di nuovo.',
    no_authorization: 'Accesso scaduto: entra di nuovo.'
  };
  function erroreAuth(r) {
    var d = (r && r.dati) || {}, stato = r ? r.stato : 0;
    var codice = typeof d.error_code === 'string' ? d.error_code : typeof d.error === 'string' ? d.error : '';
    var testo = String(d.msg || d.message || d.error_description || '').toLowerCase();
    if (codice === 'invalid_grant') codice = /refresh/.test(testo) ? 'refresh_token_not_found' : /not confirmed/.test(testo) ? 'email_not_confirmed' : 'invalid_credentials';
    if (!ERRORI[codice]) {
      if (/invalid login|credentials/.test(testo)) codice = 'invalid_credentials';
      else if (/already (been )?registered|already exists/.test(testo)) codice = 'user_already_exists';
      else if (/not confirmed/.test(testo)) codice = 'email_not_confirmed';
      else if (/signups not allowed for otp/.test(testo)) codice = 'otp_disabled';
      else if (/signups? (are )?not allowed|signup.*disabled/.test(testo)) codice = 'signup_disabled';
      else if (/password/.test(testo) && /(weak|short|least|characters)/.test(testo)) codice = 'weak_password';
      else if (/invalid.*email|email.*invalid/.test(testo)) codice = 'email_address_invalid';
      else if (stato === 429 || /rate limit|too many/.test(testo)) codice = 'over_request_rate_limit';
    }
    if (ERRORI[codice]) return errore(ERRORI[codice], codice, stato);
    if (stato >= 500) return errore('Il servizio degli account non risponde: riprova tra qualche minuto.', 'servizio', stato);
    return errore('Operazione non riuscita (errore ' + stato + '): riprova.', 'servizio', stato);
  }
  // risposte di PostgREST (tabelle)
  function erroreDati(r) {
    var d = r.dati || {};
    if (r.stato === 401 || r.stato === 403) return errore('Accesso scaduto: entra di nuovo nel tuo account.', 'non-autenticato', r.stato);
    // vincolo dati_utente_dimensione (circa 2 MB) dello schema, o corpo rifiutato perché troppo grande
    if (d.code === '23514' || r.stato === 413) {
      return errore('Troppi dati da salvare nell\'account (oltre 2 MB): restano salvati in questo browser ma non si sincronizzano. Smetti di seguire le aste che non ti servono più e riprova.', 'troppi-dati', r.stato);
    }
    if (r.stato >= 500) return errore('Il servizio degli account non risponde: riprova tra qualche minuto.', 'servizio', r.stato);
    return errore('Non riesco a leggere o salvare i dati dell\'account (errore ' + r.stato + '): riprova.', 'servizio', r.stato);
  }

  /* ---- Memoria del browser (sempre con try: in navigazione privata può mancare) ---- */
  function memoria(tipo) { try { return root[tipo || 'localStorage'] || null; } catch (e) { return null; } }
  function grezzo(k, tipo) { var m = memoria(tipo); if (!m) return null; try { return m.getItem(k); } catch (e) { return null; } }
  function leggi(k, tipo) { var s = grezzo(k, tipo); if (!s) return null; try { return JSON.parse(s); } catch (e) { return null; } }
  function scriviTesto(k, testo, tipo) { var m = memoria(tipo); if (!m) return false; try { m.setItem(k, testo); return true; } catch (e) { return false; } }
  function scrivi(k, v, tipo) { return scriviTesto(k, JSON.stringify(v), tipo); }
  function togli(k, tipo) { var m = memoria(tipo); if (!m) return; try { m.removeItem(k); } catch (e) { /* niente */ } }
  function copia(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function assegna(a, b) { for (var k in b) if (Object.prototype.hasOwnProperty.call(b, k)) a[k] = b[k]; return a; }
  function json(v) { return JSON.stringify(v === undefined ? null : v); }
  // testo con le chiavi in ordine: per confrontare dati che tornano dall'account (jsonb riordina le chiavi)
  function stabile(v) {
    if (Array.isArray(v)) return '[' + v.map(stabile).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; }).map(function (k) { return JSON.stringify(k) + ':' + stabile(v[k]); }).join(',') + '}';
    }
    return json(v);
  }
  // dato del sito: valore, null se manca, undefined se non è leggibile (in quel caso non si tocca)
  function leggiDato(k) {
    var s = grezzo(k);
    if (s == null) return null;
    try { return JSON.parse(s); } catch (e) { return undefined; }
  }

  /* ---- Rete ---- */
  // { stato, ok, dati } anche per le risposte di errore; rifiuta solo se la rete non risponde
  function richiesta(metodo, url, opz) {
    opz = opz || {};
    if (typeof root.fetch !== 'function') return rifiuta('Questo browser non permette di collegarsi al servizio degli account.', 'rete');
    var h = { Accept: 'application/json' };
    if (opz.corpo !== undefined) h['Content-Type'] = 'application/json';
    assegna(h, opz.intestazioni || {});
    var init = { method: metodo, headers: h };
    if (opz.corpo !== undefined) init.body = JSON.stringify(opz.corpo);
    var ac = typeof root.AbortController === 'function' ? new root.AbortController() : null, timer = null;
    if (ac) { init.signal = ac.signal; timer = setTimeout(function () { ac.abort(); }, ATTESA_RETE); }
    function fine() { if (timer) clearTimeout(timer); }
    return root.fetch(url, init).then(function (r) {
      return r.text().then(function (t) {
        fine();
        var dati = null;
        try { dati = t ? JSON.parse(t) : null; } catch (e) { dati = null; }
        return { stato: r.status, ok: !!r.ok, dati: dati };
      }, function () { fine(); return { stato: r.status, ok: !!r.ok, dati: null }; });
    }, function () {
      fine();
      throw errore('Connessione non riuscita: controlla la rete e riprova.', 'rete');
    });
  }
  // chiave anonima in apikey; le chiavi classiche (JWT) anche in Authorization quando manca il token dell'utente,
  // quelle nuove (sb_publishable_...) solo in apikey
  function intestazioni(token) {
    var k = chiave(), h = { apikey: k };
    if (token) h.Authorization = 'Bearer ' + token;
    else if (!/^sb_/.test(k)) h.Authorization = 'Bearer ' + k;
    return h;
  }
  function auth(metodo, percorso, corpo, token) {
    return richiesta(metodo, base() + '/auth/v1' + percorso, { intestazioni: intestazioni(token), corpo: corpo });
  }
  function tabella(metodo, percorso, token, opz) {
    opz = opz || {};
    return richiesta(metodo, base() + '/rest/v1/' + percorso, { intestazioni: assegna(intestazioni(token), opz.intestazioni || {}), corpo: opz.corpo });
  }

  /* ---- Sessione ---- */
  function sessione() {
    if (!configurato()) return null;
    var s = leggi(K_SESSIONE);
    if (!s || typeof s.access_token !== 'string' || typeof s.refresh_token !== 'string' || !s.utente || !s.utente.id) return null;
    return { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: Number(s.expires_at) || 0, utente: copia(s.utente) };
  }
  function utente() { var s = sessione(); return s ? s.utente : null; }

  // contenuto del token JWT (non verificato): serve solo a sapere subito chi è entrato, poi lo conferma GoTrue
  function leggiToken(jwt) {
    try {
      var p = String(jwt).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      while (p.length % 4) p += '=';
      var bin = root.atob(p), pct = '';
      for (var i = 0; i < bin.length; i++) pct += '%' + ('0' + bin.charCodeAt(i).toString(16)).slice(-2);
      return JSON.parse(decodeURIComponent(pct));
    } catch (e) { return null; }
  }
  function utenteDa(u, token, prima) {
    var t = token ? leggiToken(token) : null;
    u = u || {}; prima = prima || {};
    var id = u.id || (t && t.sub) || prima.id;
    if (!id) return null;
    var meta = u.app_metadata || (t && t.app_metadata) || {};
    return {
      id: String(id),
      email: u.email || (t && t.email) || prima.email || null,
      creato: u.created_at || prima.creato || null,
      provider: meta.provider || prima.provider || null
    };
  }
  // salva la risposta di GoTrue (token, scadenza, utente) e programma il rinnovo
  function salvaSessione(d, prima) {
    d = d || {};
    var ora = Math.floor(Date.now() / 1000);
    var u = utenteDa(d.user, d.access_token, prima);
    if (typeof d.access_token !== 'string' || typeof d.refresh_token !== 'string' || !d.access_token || !d.refresh_token || !u) {
      throw errore('Risposta non valida dal servizio degli account: riprova.', 'risposta');
    }
    var s = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Number(d.expires_at) || ora + (Number(d.expires_in) || 3600), utente: u };
    if (!scrivi(K_SESSIONE, s)) throw errore('Il browser non permette di salvare l\'accesso (memoria piena o navigazione privata).', 'memoria');
    programmaRinnovo();
    return s;
  }
  function annuncia(motivo) {
    var d = root.document;
    if (!d || typeof d.dispatchEvent !== 'function' || typeof root.CustomEvent !== 'function') return;
    try { d.dispatchEvent(new root.CustomEvent('radaraste:account', { detail: { motivo: motivo, utente: utente() } })); } catch (e) { /* niente */ }
  }
  function chiudiSessione(motivo) {
    togli(K_SESSIONE); togli(K_ABBONAMENTO); togli(K_CARICATI, 'sessionStorage');
    if (timerRinnovo) { clearTimeout(timerRinnovo); timerRinnovo = null; }
    if (timerSalva) { clearTimeout(timerSalva); timerSalva = null; }
    annuncia(motivo);
  }

  // lavori in sottofondo dopo l'accesso (abbonamento, dati): le pagine possono aspettarli prima di cambiare pagina
  var inSottofondo = [];
  function sottofondo(p) {
    function togliDallElenco() { var i = inSottofondo.indexOf(p); if (i >= 0) inSottofondo.splice(i, 1); }
    inSottofondo.push(p);
    p.then(togliDallElenco, togliDallElenco);
    return p;
  }
  function attendi(ms) {
    var tutti = Promise.all(inSottofondo.slice());
    if (!ms) return tutti.then(niente);
    return Promise.race([tutti, new Promise(function (ok) { var t = setTimeout(ok, ms); if (t && t.unref) t.unref(); })]).then(niente);
  }
  function dopoAccesso(motivo) {
    annuncia(motivo);
    sottofondo(Promise.all([abbonamento().catch(niente), caricaDati().catch(niente)]));
  }

  /* ---- Rinnovo del token ---- */
  var rinnovoInCorso = null, timerRinnovo = null, avviato = false;
  function aggiorna() {
    if (!configurato()) return spento();
    if (rinnovoInCorso) return rinnovoInCorso;
    var s = sessione();
    if (!s) return rifiuta(NON_AUTENTICATO, 'non-autenticato');
    rinnovoInCorso = auth('POST', '/token?grant_type=refresh_token', { refresh_token: s.refresh_token }).then(function (r) {
      rinnovoInCorso = null;
      if (r.ok) { var n = salvaSessione(r.dati, s.utente); annuncia('rinnovo'); return n; }
      // un'altra scheda del browser può averlo già rinnovato (il vecchio token di rinnovo non vale più)
      var att = sessione();
      if (att && att.refresh_token !== s.refresh_token) return att;
      if (r.stato === 400 || r.stato === 401 || r.stato === 403) {
        chiudiSessione('scaduta');
        throw errore('La sessione è scaduta: accedi di nuovo.', 'sessione-scaduta', r.stato);
      }
      throw erroreAuth(r);
    }, function (e) { rinnovoInCorso = null; throw e; });
    return rinnovoInCorso;
  }
  function inScadenza(s) { return s.expires_at - ANTICIPO <= Date.now() / 1000; }
  // token valido (rinnovato se sta per scadere)
  function token() {
    if (!configurato()) return spento();
    var s = sessione();
    if (!s) return rifiuta(NON_AUTENTICATO, 'non-autenticato');
    if (inScadenza(s)) return aggiorna().then(function (n) { return n.access_token; });
    return Promise.resolve(s.access_token);
  }
  // chiamata con il token; se il servizio lo rifiuta (401) si rinnova una volta e si riprova
  function conToken(fn) {
    return token().then(function (t) {
      return fn(t).then(function (r) {
        if (r.stato !== 401) return r;
        return aggiorna().then(function (n) { return fn(n.access_token); });
      });
    });
  }
  function timer(fn, ms) { var t = setTimeout(fn, ms); if (NODE && t && t.unref) t.unref(); return t; }
  function programmaRinnovo() {
    if (timerRinnovo) { clearTimeout(timerRinnovo); timerRinnovo = null; }
    if (!avviato) return;
    var s = sessione();
    if (!s) return;
    var ms = Math.max(0, Math.min(2147483647, (s.expires_at - ANTICIPO) * 1000 - Date.now()));
    timerRinnovo = timer(function () {
      timerRinnovo = null;
      // senza rete si riprova tra 30 secondi; con la sessione scaduta aggiorna() chiude da sé
      aggiorna().catch(function (e) { if (e && e.codice === 'rete' && sessione()) timerRinnovo = timer(programmaRinnovo, 30000); });
    }, ms);
  }
  function controllaToken() {
    var s = sessione();
    if (s && inScadenza(s)) aggiorna().catch(niente);
    else programmaRinnovo();
  }

  /* ---- Registrazione e accesso ---- */
  function emailValida(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim()); }
  // pagina del sito dove tornare (?dopo=): solo una pagina .html di questo sito, mai un indirizzo esterno
  function paginaSicura(p) {
    p = String(p || '').trim();
    if (!/^[a-z0-9][a-z0-9-]*\.html(?:[?#][^\s<>"'\\]*)?$/i.test(p) || /^accedi\.html/i.test(p)) return 'account.html';
    return p;
  }
  // indirizzo di ritorno da email e Google: accedi.html di questo sito, con la pagina dove andare dopo
  function indirizzoRitorno(dopo) {
    var l = root.location || {};
    var cartella = String(l.pathname || '/').replace(/[^/]*$/, '');
    return String(l.origin || '') + cartella + 'accedi.html' + (dopo ? '?dopo=' + encodeURIComponent(paginaSicura(dopo)) : '');
  }
  // consenso a termini e privacy dato nel modulo di registrazione (resta nei metadati dell'utente)
  function consenso(opz) { return opz && opz.consenso ? { consenso_termini: new Date().toISOString() } : undefined; }

  function registrati(email, password, opz) {
    if (!configurato()) return spento();
    email = String(email || '').trim();
    if (!emailValida(email)) return rifiuta(ERRORI.email_address_invalid, 'email_address_invalid');
    if (String(password || '').length < MIN_PASSWORD) return rifiuta('La password deve avere almeno ' + MIN_PASSWORD + ' caratteri.', 'weak_password');
    var corpo = { email: email, password: String(password) };
    if (consenso(opz)) corpo.data = consenso(opz);
    return auth('POST', '/signup?redirect_to=' + encodeURIComponent(indirizzoRitorno(opz && opz.dopo)), corpo).then(function (r) {
      if (!r.ok) throw erroreAuth(r);
      var d = r.dati || {};
      // con la conferma dell'email attiva (consigliata) non arriva la sessione: si entra dal link dell'email
      if (!d.access_token) return { accesso: false, confermaEmail: true, email: email };
      var s = salvaSessione(d);
      dopoAccesso('registrazione');
      return { accesso: true, utente: copia(s.utente) };
    });
  }

  function accedi(email, password) {
    if (!configurato()) return spento();
    email = String(email || '').trim();
    if (!emailValida(email)) return rifiuta(ERRORI.email_address_invalid, 'email_address_invalid');
    if (!password) return rifiuta('Scrivi la password.', 'password');
    return auth('POST', '/token?grant_type=password', { email: email, password: String(password) }).then(function (r) {
      if (!r.ok) throw erroreAuth(r);
      var s = salvaSessione(r.dati);
      dopoAccesso('accesso');
      return copia(s.utente);
    });
  }

  // porta a Google; al ritorno i token arrivano nel frammento dell'indirizzo di accedi.html
  function accediConGoogle(dopo) {
    if (!configurato()) return spento();
    var url = base() + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(indirizzoRitorno(dopo));
    try { root.location.assign(url); } catch (e) { return rifiuta('Non riesco ad aprire la pagina di Google: riprova.', 'navigazione'); }
    return Promise.resolve({ url: url });
  }

  // link di accesso via email; opz.crea: crea l'account se non c'è (solo con il consenso dato nel modulo)
  function linkMagico(email, dopo, opz) {
    if (!configurato()) return spento();
    email = String(email || '').trim();
    if (!emailValida(email)) return rifiuta(ERRORI.email_address_invalid, 'email_address_invalid');
    var crea = !!(opz && opz.crea), corpo = { email: email, create_user: crea };
    if (crea && consenso(opz)) corpo.data = consenso(opz);
    return auth('POST', '/otp?redirect_to=' + encodeURIComponent(indirizzoRitorno(dopo)), corpo).then(function (r) {
      if (!r.ok) throw erroreAuth(r);
      return { inviato: true, email: email };
    });
  }

  function cambiaPassword(nuova) {
    if (!configurato()) return spento();
    if (String(nuova || '').length < MIN_PASSWORD) return rifiuta('La password deve avere almeno ' + MIN_PASSWORD + ' caratteri.', 'weak_password');
    return conToken(function (t) { return auth('PUT', '/user', { password: String(nuova) }, t); }).then(function (r) {
      if (!r.ok) throw erroreAuth(r);
      return true;
    });
  }

  // esce da questo dispositivo: prima salva le modifiche in sospeso; i dati del sito restano nel browser
  function esci() {
    if (!configurato()) return spento();
    if (!sessione()) return Promise.resolve(false);
    var prima = pendenti() ? salvaDati().catch(niente) : Promise.resolve();
    return prima.then(function () {
      var s = sessione();
      if (s) return auth('POST', '/logout?scope=local', undefined, s.access_token).catch(niente);
    }).then(function () { chiudiSessione('uscita'); return true; });
  }

  /* ---- Ritorno da email o Google: #access_token=...&refresh_token=... (oppure #error=...) ---- */
  function leggiFrammento(hash) {
    var h = String(hash || '').replace(/^#/, '');
    if (!/(^|&)(access_token|error|error_code)=/.test(h)) return null;
    var p = {};
    h.split('&').forEach(function (parte) {
      var i = parte.indexOf('=');
      if (i <= 0) return;
      try { p[decodeURIComponent(parte.slice(0, i))] = decodeURIComponent(parte.slice(i + 1).replace(/\+/g, ' ')); } catch (e) { /* parte illeggibile */ }
    });
    if (p.error || p.error_code) return { errore: { codice: p.error_code || p.error, descrizione: p.error_description || '' }, tipo: p.type || null };
    if (!p.access_token || !p.refresh_token) return null;
    return {
      access_token: p.access_token, refresh_token: p.refresh_token,
      expires_at: Number(p.expires_at) || null, expires_in: Number(p.expires_in) || null,
      tipo: p.type || null
    };
  }
  var ultimoRitorno = null;
  function ritornoDaFrammento() {
    var l = root.location, f = l ? leggiFrammento(l.hash) : null;
    if (!f) return Promise.resolve(null);
    // i token non devono restare nell'indirizzo (cronologia, segnalibri, condivisione)
    try { root.history.replaceState(root.history.state, '', l.pathname + l.search); } catch (e) { try { l.hash = ''; } catch (e2) { /* niente */ } }
    if (f.errore) {
      ultimoRitorno = { tipo: f.tipo, errore: ERRORI[f.errore.codice] || 'Accesso non riuscito: riprova o chiedi un nuovo link.' };
      return Promise.resolve(ultimoRitorno);
    }
    var motivo = f.tipo === 'signup' ? 'registrazione' : 'accesso';
    function entra(u) {
      try { salvaSessione(assegna({ user: u }, f)); } catch (e) { ultimoRitorno = { tipo: f.tipo, errore: e.message }; return ultimoRitorno; }
      ultimoRitorno = { tipo: f.tipo || 'oauth', accesso: true };
      dopoAccesso(motivo);
      return ultimoRitorno;
    }
    // chi è davvero l'utente lo dice GoTrue (il contenuto del token non si verifica nel browser)
    return auth('GET', '/user', undefined, f.access_token).then(function (r) {
      if (r.stato === 401 || r.stato === 403) {
        ultimoRitorno = { tipo: f.tipo, errore: 'Il link di accesso non è più valido: chiedine uno nuovo.' };
        return ultimoRitorno;
      }
      return entra(r.ok && r.dati && r.dati.id ? r.dati : null);
    }, function () {
      // senza rete si entra con i dati del token: GoTrue lo verificherà alla prima richiesta
      return entra(null);
    });
  }

  /* ---- Abbonamento (tabella abbonamenti: il browser la legge soltanto) ---- */
  function daRiga(r) {
    r = r || {};
    return {
      piano: PIANI.indexOf(r.piano) >= 0 ? r.piano : 'gratis',
      periodo: PERIODI.indexOf(r.periodo) >= 0 ? r.periodo : null,
      stato: r.stato || null,
      fineProva: r.fine_prova || null,
      finePeriodo: r.fine_periodo || null,
      cancellaAllaFine: !!r.cancella_alla_fine,
      pagamenti: !!r.stripe_customer,          // c'è un cliente Stripe: il portale dei pagamenti si può aprire
      aggiornato: r.aggiornato || null
    };
  }
  var abbonamentoInCorso = null;
  function abbonamento() {
    if (!configurato()) return spento();
    if (abbonamentoInCorso) return abbonamentoInCorso;
    var s = sessione();
    if (!s) return rifiuta(NON_AUTENTICATO, 'non-autenticato');
    var id = s.utente.id;
    abbonamentoInCorso = conToken(function (t) {
      return tabella('GET', 'abbonamenti?utente=eq.' + encodeURIComponent(id) + '&select=piano,periodo,stato,fine_prova,fine_periodo,cancella_alla_fine,stripe_customer,aggiornato&limit=1', t);
    }).then(function (r) {
      abbonamentoInCorso = null;
      if (!r.ok) throw erroreDati(r);
      var ab = daRiga(Array.isArray(r.dati) ? r.dati[0] : null);
      var att = sessione();
      if (!att || att.utente.id !== id) return ab;      // uscito nel frattempo
      var prima = leggi(K_ABBONAMENTO);
      scrivi(K_ABBONAMENTO, { utente: id, letto: new Date().toISOString(), dati: ab });
      if (!prima || prima.utente !== id || json(prima.dati) !== json(ab)) annuncia('abbonamento');
      return copia(ab);
    }, function (e) { abbonamentoInCorso = null; throw e; });
    return abbonamentoInCorso;
  }
  // stato sincrono per js/piani.js: { utente, abbonamento } dall'ultima lettura, null senza accesso
  function statoCorrente() {
    var s = sessione();
    if (!s) return null;
    var c = leggi(K_ABBONAMENTO);
    return { utente: s.utente, abbonamento: c && c.utente === s.utente.id && c.dati ? c.dati : null };
  }

  /* ---- Sincronizzazione dei dati (tabella dati_utente) ---- */
  // impronta breve di un testo (per accorgersi dei cambiamenti senza conservare copie)
  function firma(testo) {
    testo = testo == null ? '' : String(testo);
    var h = 5381;
    for (var i = 0; i < testo.length; i++) h = ((h << 5) + h + testo.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36) + '.' + testo.length.toString(36);
  }
  function tempo(v) {
    if (v == null || v === '') return 0;
    var t = typeof v === 'number' ? v : Date.parse(v);
    return isFinite(t) && t > 0 ? t : 0;
  }
  function iso(t) { return t > 0 ? new Date(t).toISOString() : null; }
  function firmeVoci(lista) {
    var o = {};
    (Array.isArray(lista) ? lista : []).forEach(function (v) { if (v && typeof v === 'object' && v.id != null) o[String(v.id)] = firma(json(v)); });
    return o;
  }
  function registro() {
    var r = leggi(K_SYNC);
    if (!r || typeof r !== 'object' || r.versione !== 1) r = { versione: 1, chiavi: {}, sincronizzate: {} };
    if (!r.chiavi || typeof r.chiavi !== 'object') r.chiavi = {};
    if (!r.sincronizzate || typeof r.sincronizzate !== 'object') r.sincronizzate = {};
    return r;
  }

  /* Annota cosa è cambiato in questo browser dall'ultima occhiata, con l'ora: per le liste anche quali voci sono
   * cambiate e quali sono state tolte. La prima volta si fotografa senza ora (l'età di quei dati non si conosce). */
  function osserva(ora) {
    if (!configurato()) return [];
    ora = ora || new Date().toISOString();
    var reg = registro(), cambiate = [], daScrivere = false;
    CHIAVI.forEach(function (k) {
      var v = leggiDato(k);
      if (v === undefined) return;
      var f = firma(json(v)), m = reg.chiavi[k];
      if (!m) {
        m = reg.chiavi[k] = { firma: f, aggiornato: null };
        if (LISTE[k]) { m.firme = firmeVoci(v); m.orari = {}; m.rimosse = {}; }
        daScrivere = true;
        return;
      }
      if (m.firma === f) return;
      m.firma = f; m.aggiornato = ora; cambiate.push(k); daScrivere = true;
      if (LISTE[k]) {
        var nuove = firmeVoci(v), vecchie = m.firme || {};
        m.orari = m.orari || {}; m.rimosse = m.rimosse || {};
        Object.keys(nuove).forEach(function (id) { if (nuove[id] !== vecchie[id]) { m.orari[id] = ora; delete m.rimosse[id]; } });
        Object.keys(vecchie).forEach(function (id) { if (!(id in nuove)) { m.rimosse[id] = ora; delete m.orari[id]; } });
        m.firme = nuove;
      }
    });
    if (daScrivere) scrivi(K_SYNC, reg);
    return cambiate;
  }
  // ci sono modifiche di questo browser non ancora salvate nell'account?
  function pendenti() {
    if (!configurato()) return false;
    var reg = registro();
    return CHIAVI.some(function (k) {
      var m = reg.chiavi[k];
      if (!m || m.firma === reg.sincronizzate[k]) return false;
      return !(reg.sincronizzate[k] == null && m.firma === firma('null'));
    });
  }

  // ora dell'ultima modifica di una voce: annotata da osserva(), altrimenti quella scritta dal sito nella voce
  function tempoVoce(v, orari) {
    if (!v || typeof v !== 'object') return 0;
    return Math.max(tempo(orari && orari[v.id]), tempo(v.modificata), tempo(v.aggiunta), tempo(v.creata));
  }
  /* liste con id: l e r = { valore: [...], orari: { id: ora }, rimosse: { id: ora } } (questo browser e account).
   * Nessuna voce di questo browser si perde, salvo quelle tolte altrove dopo la loro ultima modifica. */
  function unisciLista(l, r, adesso) {
    l = l || {}; r = r || {};
    var limite = adesso - DURATA_RIMOSSE, rimosse = {}, orari = {}, perId = {}, ordine = [], senzaId = [], visti = {};
    [l.rimosse, r.rimosse].forEach(function (m) {
      Object.keys(m || {}).forEach(function (id) {
        var t = tempo(m[id]);
        if (t > limite && t > tempo(rimosse[id])) rimosse[id] = iso(t);
      });
    });
    function metti(v, orariLato) {
      if (!v || typeof v !== 'object' || v.id == null) {
        var f = stabile(v);
        if (!visti[f]) { visti[f] = true; senzaId.push(v); }
        return;
      }
      var id = String(v.id), t = tempoVoce(v, orariLato), c = perId[id];
      if (!c) { perId[id] = { v: v, t: t }; ordine.push(id); return; }
      if (stabile(c.v) !== stabile(v)) {
        // stessa voce cambiata in due posti: vince l'ultima modifica (con la sua nota); a parità vince questo browser.
        // I campi che mancano nella versione più recente si prendono dall'altra.
        c.v = t > c.t ? assegna(assegna({}, c.v), v) : assegna(assegna({}, v), c.v);
      }
      c.t = Math.max(c.t, t);
    }
    (Array.isArray(l.valore) ? l.valore : []).forEach(function (v) { metti(v, l.orari); });
    (Array.isArray(r.valore) ? r.valore : []).forEach(function (v) { metti(v, r.orari); });
    var valore = [];
    ordine.forEach(function (id) {
      var c = perId[id], tr = tempo(rimosse[id]);
      if (tr && tr >= c.t) return;                 // tolta dopo l'ultima modifica
      if (tr) delete rimosse[id];                  // ripresa dopo essere stata tolta
      valore.push(c.v);
      if (c.t > 0) orari[id] = iso(c.t);
    });
    valore = valore.concat(senzaId);
    var esiste = l.valore != null || r.valore != null;
    return { valore: esiste ? valore : null, aggiornato: iso(Math.max(tempo(l.aggiornato), tempo(r.aggiornato))), orari: orari, rimosse: rimosse };
  }
  // un solo valore: vince il più recente; senza ora (mai modificato da quando lo osserviamo) vale come il più vecchio
  function unisciValore(l, r) {
    l = l || {}; r = r || {};
    var hl = l.valore != null, hr = r.valore != null;
    if (!hr) return { valore: hl ? l.valore : null, aggiornato: l.aggiornato || null };
    if (!hl) return { valore: r.valore, aggiornato: r.aggiornato || null };
    if (stabile(l.valore) === stabile(r.valore)) return { valore: l.valore, aggiornato: iso(Math.max(tempo(l.aggiornato), tempo(r.aggiornato))) };
    return tempo(r.aggiornato) > tempo(l.aggiornato) ? { valore: r.valore, aggiornato: r.aggiornato || null } : { valore: l.valore, aggiornato: l.aggiornato || null };
  }
  /* Unione pura (usata anche dai test): locale e remoto = { chiave: { valore, aggiornato, orari?, rimosse? } }.
   * Restituisce le chiavi unite nello stesso formato (solo quelle con un valore). */
  function unisci(locale, remoto, adesso) {
    locale = locale || {}; remoto = remoto || {};
    var ora = tempo(adesso) || Date.now(), out = {};
    CHIAVI.forEach(function (k) {
      var l = locale[k], r = remoto[k];
      if (!l && !r) return;
      var u = LISTE[k] ? unisciLista(l, r, ora) : unisciValore(l, r);
      if (u.valore != null) out[k] = u;
    });
    return out;
  }
  // copia di sicurezza di ciò che la sincronizzazione sostituisce in questo browser (l'ultima per chiave)
  function conserva(k, valore, ora) {
    var p = leggi(K_PRECEDENTI) || {};
    p[k] = { valore: valore, sostituito: ora };
    scrivi(K_PRECEDENTI, p);
  }
  var scrivendo = false;
  function scriviDato(k, testo) {
    scrivendo = true;
    var ok = scriviTesto(k, testo);
    // le pagine (e il numero sulla barra in basso) si aggiornano come quando cambia il sito stesso
    if (ok && k === K_SEGUITE && root.document && typeof root.CustomEvent === 'function') {
      try { root.document.dispatchEvent(new root.CustomEvent('radaraste:seguite')); } catch (e) { /* niente */ }
    }
    scrivendo = false;
    return ok;
  }

  var syncInCorso = null;
  function sincronizza() {
    if (!configurato()) return spento();
    if (syncInCorso) return syncInCorso;
    var s = sessione();
    if (!s) return rifiuta('Accedi al tuo account per sincronizzare i dati.', 'non-autenticato');
    var id = s.utente.id, ripeti = false;
    if (timerSalva) { clearTimeout(timerSalva); timerSalva = null; }
    syncInCorso = conToken(function (t) {
      return tabella('GET', 'dati_utente?utente=eq.' + encodeURIComponent(id) + '&select=dati,aggiornato&limit=1', t);
    }).then(function (r) {
      if (!r.ok) throw erroreDati(r);
      var att = sessione();
      if (!att || att.utente.id !== id) throw errore('Sei uscito dall\'account durante la sincronizzazione.', 'non-autenticato');
      var ora = new Date().toISOString();
      osserva(ora);
      var riga = Array.isArray(r.dati) && r.dati[0] ? r.dati[0] : null;
      var remoto = riga && riga.dati && riga.dati.chiavi && typeof riga.dati.chiavi === 'object' ? riga.dati.chiavi : {};
      var reg = registro(), locale = {}, usati = {};
      // prima sincronizzazione di un altro account in questo browser: ciò che risultava già salvato e le aste tolte
      // valevano per l'account di prima (meglio tenere un'asta in più che toglierla dall'account sbagliato)
      if (reg.utente && reg.utente !== id) {
        reg.sincronizzate = {};
        delete reg.ultima;
        CHIAVI.forEach(function (k) { if (LISTE[k] && reg.chiavi[k]) reg.chiavi[k].rimosse = {}; });
      }
      CHIAVI.forEach(function (k) {
        var v = leggiDato(k), m = reg.chiavi[k];
        if (v === undefined) return;                 // illeggibile: non si tocca
        usati[k] = json(v);
        if (v == null && !m) return;
        locale[k] = { valore: v, aggiornato: m ? m.aggiornato : null, orari: m && m.orari, rimosse: m && m.rimosse };
      });
      var unito = unisci(locale, remoto, ora), entrate = {}, esito = {}, scritte = {}, cambiaRemoto = !riga;
      Object.keys(unito).forEach(function (k) {
        var u = unito[k], testo = json(u.valore), e = { valore: u.valore, aggiornato: u.aggiornato || null };
        if (LISTE[k]) { e.orari = u.orari; e.rimosse = u.rimosse; }
        entrate[k] = e;
        if (stabile(remoto[k]) !== stabile(e)) cambiaRemoto = true;
        if (!(k in usati)) return;
        if (usati[k] === testo) { esito[k] = 'invariato'; scritte[k] = testo; return; }
        // modificato mentre si scaricava: si salta e si riprova tra poco
        if (json(leggiDato(k)) !== usati[k]) { ripeti = true; esito[k] = 'rimandato'; return; }
        scritte[k] = testo;
        esito[k] = 'aggiornato';
      });
      // registro prima dei dati: le altre schede vedono subito che la modifica viene dall'account
      var vecchie = {};
      Object.keys(scritte).forEach(function (k) {
        vecchie[k] = reg.chiavi[k] ? copia(reg.chiavi[k]) : null;
        var m = reg.chiavi[k] = reg.chiavi[k] || {}, u = unito[k];
        m.firma = firma(scritte[k]);
        m.aggiornato = u.aggiornato || m.aggiornato || null;
        if (LISTE[k]) { m.firme = firmeVoci(u.valore); m.orari = u.orari; m.rimosse = u.rimosse; }
      });
      reg.utente = id;
      scrivi(K_SYNC, reg);
      var fallite = 0;
      Object.keys(scritte).forEach(function (k) {
        if (esito[k] !== 'aggiornato') return;
        var prima = leggiDato(k);
        if (prima != null) conserva(k, prima, ora);
        if (scriviDato(k, scritte[k])) return;
        // memoria piena: il dato di questo browser resta quello di prima, e così il registro
        esito[k] = 'non-salvato'; delete scritte[k]; fallite++;
        if (vecchie[k]) reg.chiavi[k] = vecchie[k]; else delete reg.chiavi[k];
      });
      if (fallite) scrivi(K_SYNC, reg);
      var fine = { sincronizzato: ora, esito: esito, caricato: !!riga, salvato: false };
      function segna() {
        var rg = registro();
        Object.keys(scritte).forEach(function (k) { if (rg.chiavi[k]) rg.sincronizzate[k] = rg.chiavi[k].firma; });
        rg.ultima = ora;
        scrivi(K_SYNC, rg);
        return fine;
      }
      if (!cambiaRemoto) return segna();
      // le chiavi che questa versione del sito non conosce restano com'erano
      var dati = { versione: 1, app: 'Radar Aste Italia', aggiornato: ora, chiavi: assegna(assegna({}, remoto), entrate) };
      return conToken(function (t) {
        return tabella('POST', 'dati_utente?on_conflict=utente', t, {
          intestazioni: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          corpo: { utente: id, dati: dati, aggiornato: ora }
        });
      }).then(function (r2) {
        if (!r2.ok) throw erroreDati(r2);
        fine.salvato = true;
        return segna();
      });
    }).then(function (fine) {
      syncInCorso = null;
      annuncia('dati');
      if (avviato && (ripeti || pendenti())) programmaSalvataggio();
      return fine;
    }, function (e) { syncInCorso = null; throw e; });
    return syncInCorso;
  }
  function caricaDati() {
    return sincronizza().then(function (fine) {
      var s = sessione();
      if (s) scriviTesto(K_CARICATI, s.utente.id, 'sessionStorage');
      return fine;
    });
  }
  function salvaDati() { return sincronizza(); }

  var timerSalva = null;
  function programmaSalvataggio() {
    if (timerSalva) clearTimeout(timerSalva);
    timerSalva = timer(function () { timerSalva = null; salvaDati().catch(niente); }, ATTESA_SALVATAGGIO);
  }
  function alCambio() {
    if (scrivendo || !configurato()) return;
    osserva();
    if (sessione()) programmaSalvataggio();
  }
  // per la pagina dell'account: quanti dati ci sono in questo browser e quando sono stati sincronizzati
  function riepilogoDati() {
    function lunghezza(k) { var v = leggiDato(k); return Array.isArray(v) ? v.length : 0; }
    function c(k) { var v = leggiDato(k); return v != null && !(typeof v === 'object' && !Object.keys(v).length); }
    var reg = configurato() ? registro() : null, u = utente();
    return {
      seguite: lunghezza(K_SEGUITE), aste: lunghezza(K_ASTE), ricerche: lunghezza('radaraste.ricerche'),
      preferenze: c('radaraste.preferenze'), stratega: c('radaraste.stratega'),
      // ultima sincronizzazione dell'account collegato (non di un altro account usato prima in questo browser)
      ultima: reg && u && reg.utente === u.id ? reg.ultima || null : null, pendenti: pendenti()
    };
  }

  /* ---- Dati personali (GDPR) ---- */
  function esportaDati() {
    if (!configurato()) return spento();
    var s = sessione();
    if (!s) return rifiuta(NON_AUTENTICATO, 'non-autenticato');
    var id = encodeURIComponent(s.utente.id);
    function leggiTab(percorso) { return conToken(function (t) { return tabella('GET', percorso, t); }); }
    return Promise.all([
      leggiTab('profili?id=eq.' + id + '&select=*'),
      leggiTab('abbonamenti?utente=eq.' + id + '&select=*'),
      leggiTab('dati_utente?utente=eq.' + id + '&select=*')
    ]).then(function (r) {
      r.forEach(function (x) { if (!x.ok) throw erroreDati(x); });
      function prima(x) { return Array.isArray(x.dati) && x.dati[0] ? x.dati[0] : null; }
      var locali = {};
      CHIAVI.forEach(function (k) { var v = leggiDato(k); if (v != null) locali[k] = v; });
      return {
        app: 'Radar Aste Italia',
        descrizione: 'Copia dei dati del tuo account (articoli 15 e 20 del GDPR): account, abbonamento, dati sincronizzati e dati salvati in questo browser.',
        esportato: new Date().toISOString(),
        modalita: cfg().modalita || 'test',
        account: { id: s.utente.id, email: s.utente.email, creato: s.utente.creato || null, accessoCon: s.utente.provider || null },
        profilo: prima(r[0]),
        abbonamento: prima(r[1]),
        datiSincronizzati: prima(r[2]),
        datiDiQuestoBrowser: locali,
        copieDiSicurezza: leggi(K_PRECEDENTI) || {}
      };
    });
  }

  /* ---- Funzioni del sito (Cloudflare Pages): pagamento, portale, cancellazione ---- */
  function chiamaApi(nome, corpo) {
    if (!configurato()) return spento();
    var percorso = (cfg().api || {})[nome];
    if (!percorso) return rifiuta('Funzione non disponibile: manca l\'indirizzo nella configurazione.', 'configurazione');
    return conToken(function (t) {
      return richiesta('POST', percorso, { intestazioni: { Authorization: 'Bearer ' + t }, corpo: corpo || {} });
    }).then(function (r) {
      var d = r.dati || {};
      if (!r.ok) throw errore(typeof d.errore === 'string' && d.errore ? d.errore : 'Il servizio non ha risposto correttamente (errore ' + r.stato + '): riprova tra qualche minuto.', 'api', r.stato);
      return d;
    });
  }
  function conUrl(d) {
    if (!d || typeof d.url !== 'string' || !/^https:\/\//.test(d.url)) throw errore('Il servizio di pagamento non ha restituito un indirizzo valido: riprova.', 'api');
    return d;
  }
  // pagina di pagamento di Stripe → { url, prova, modalita }
  function checkout(piano, periodo) {
    if (!configurato()) return spento();
    if (A_PAGAMENTO.indexOf(piano) < 0) return rifiuta('Piano non valido: scegli Base o Pro.', 'piano');
    if (PERIODI.indexOf(periodo) < 0) return rifiuta('Periodo non valido: scegli mensile o annuale.', 'periodo');
    return chiamaApi('checkout', { piano: piano, periodo: periodo }).then(conUrl);
  }
  // portale clienti di Stripe (metodo di pagamento, fatture, cambio piano, disdetta) → { url }
  function portale() { return chiamaApi('portale', {}).then(conUrl); }
  // cancella account e dati nell'account (art. 17 GDPR); i dati del sito in questo browser restano
  function cancellaAccount() {
    return chiamaApi('cancellaAccount', {}).then(function (d) {
      togli(K_SYNC);
      chiudiSessione('cancellato');
      return d;
    });
  }

  /* ---- Avvio nel browser ---- */
  var prontoP = null;
  function alloStorage(e) {
    if (!e || !e.key) return;
    if (e.key === K_SESSIONE) { programmaRinnovo(); annuncia('altra-scheda'); }
    else if (e.key === K_ABBONAMENTO) annuncia('abbonamento');
    else if (CHIAVI.indexOf(e.key) >= 0) osserva();
  }
  function avvia() {
    if (prontoP) return prontoP;
    // spento: nessun ascoltatore, nessuna rete
    if (!configurato()) { prontoP = Promise.resolve(null); return prontoP; }
    avviato = true;
    var d = root.document;
    if (d && typeof d.addEventListener === 'function') {
      d.addEventListener('radaraste:seguite', alCambio);
      d.addEventListener('visibilitychange', function () { if (d.visibilityState === 'hidden') osserva(); else controllaToken(); });
    }
    if (typeof root.addEventListener === 'function') {
      root.addEventListener('storage', alloStorage);
      root.addEventListener('pagehide', function () { osserva(); });
    }
    prontoP = ritornoDaFrammento().then(function () {
      var s = sessione();
      if (s && inScadenza(s)) return aggiorna().catch(niente);
    }).then(function () {
      osserva();
      programmaRinnovo();
      var s = sessione();
      if (!s) return;
      var c = leggi(K_ABBONAMENTO);
      if (!c || c.utente !== s.utente.id || Date.now() - tempo(c.letto) > VALIDITA_ABBONAMENTO) sottofondo(abbonamento().catch(niente));
      if (grezzo(K_CARICATI, 'sessionStorage') !== s.utente.id) sottofondo(caricaDati().catch(niente));
      else if (pendenti()) programmaSalvataggio();
    }).then(function () { return ultimoRitorno; }, function () { return ultimoRitorno; });
    return prontoP;
  }
  function pronto() { return prontoP || Promise.resolve(null); }
  function ritorno() { return ultimoRitorno ? copia(ultimoRitorno) : null; }

  var Account = {
    configurato: configurato, sessione: sessione, utente: utente, statoCorrente: statoCorrente,
    registrati: registrati, accedi: accedi, accediConGoogle: accediConGoogle, linkMagico: linkMagico, esci: esci, aggiorna: aggiorna,
    abbonamento: abbonamento, caricaDati: caricaDati, salvaDati: salvaDati, esportaDati: esportaDati, cancellaAccount: cancellaAccount,
    checkout: checkout, portale: portale,
    // di supporto per le pagine
    cambiaPassword: cambiaPassword, pronto: pronto, ritorno: ritorno, attendi: attendi, riepilogoDati: riepilogoDati,
    emailValida: emailValida, paginaSicura: paginaSicura, avvia: avvia,
    // di supporto per i test (funzioni pure o senza rete)
    unisci: unisci, leggiFrammento: leggiFrammento, osserva: osserva, pendenti: pendenti, firma: firma,
    CHIAVI: CHIAVI, NON_CONFIGURATO: NON_CONFIGURATO, MIN_PASSWORD: MIN_PASSWORD, ATTESA_SALVATAGGIO: ATTESA_SALVATAGGIO
  };

  if (NODE) module.exports = Account;
  else { root.Account = Account; avvia(); }
})(typeof window !== 'undefined' ? window : globalThis);
