/* Account degli utenti (Supabase): accesso, sessione, abbonamento, dati sincronizzati e pagamenti (Stripe).
 *
 * SPENTO finché config/abbonamenti.js non ha l'indirizzo e la chiave anonima di Supabase: ogni chiamata rifiuta con
 * "Account non ancora attivo: configurazione mancante (modalità test)", non parte nessuna richiesta di rete e non si
 * registra nessun ascoltatore (si toglie solo dall'indirizzo un eventuale codice di accesso). Il sito resta quello di sempre.
 *
 * Solo fetch, nessuna libreria: GoTrue (/auth/v1: registrazione, accesso, rinnovo del token, link via email, Google),
 * PostgREST (/rest/v1: tabelle abbonamenti e dati_utente, protette dalla Row Level Security di supabase/schema.sql) e
 * le funzioni del sito (/api/...: pagamento, portale clienti, cancellazione) con Authorization: Bearer <token>.
 *
 * Accesso via email e Google con PKCE: chi chiede il link tiene in questo browser un codice segreto (verificatore) e
 * manda a GoTrue solo la sua impronta; al ritorno su accedi.html?code=... il codice si scambia con la sessione solo
 * insieme al verificatore. Nell'indirizzo non passano mai i token, e un link di un altro (o aperto in un altro browser)
 * non fa entrare in un account che non è il tuo. I ritorni con #access_token=... (flusso vecchio) si ripuliscono e
 * non si accettano: chiunque potrebbe mandarli in un link per farti entrare nel suo account e prendersi i tuoi dati.
 *
 * Nel browser (localStorage):
 *   radaraste.account               sessione { access_token, refresh_token, expires_at (secondi Unix, contati dal nostro
 *                                   orologio), utente }; durante un accesso via email o Google anche attesa
 *                                   { verificatore, tipo, chiesto } (al massimo 24 ore)
 *   radaraste.account.abbonamento   ultimo abbonamento letto { utente, letto, dati }
 *   radaraste.account.sync          registro della sincronizzazione: cosa è cambiato e quando, aste tolte, account collegato
 *   radaraste.account.precedenti    { versione: 2, voci }: le ultime versioni sostituite dalle sincronizzazioni, per account
 *
 * Sincronizzazione con la tabella dati_utente: unione prudente, nessun dato si perde.
 *   aste seguite, aste inserite a mano    → unione per id; per la stessa asta vince la versione modificata per
 *                                           ultima (con la sua nota). Un'asta tolta su un dispositivo sparisce dagli
 *                                           altri solo se lì è ancora identica alla versione tolta: si confrontano le
 *                                           versioni, non gli orologi. Se nel frattempo è stata modificata o seguita di
 *                                           nuovo, resta.
 *   preferenze, ricerche, profilo Stratega → vince il dato modificato per ultimo.
 *   La versione che perde (di questo browser o dell'account) resta in radaraste.account.precedenti (le ultime 100) e nel
 *   file "Scarica i miei dati"; se il browser non riesce a conservarla, la sincronizzazione si ferma senza cambiare nulla.
 *   I dati di questo browser si uniscono da soli solo con l'account a cui sono già collegati (o se non lo sono ancora):
 *   se erano sincronizzati con un altro account serve la conferma (caricaDati({ unisci: true })), per non mescolare i
 *   dati di persone diverse.
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
  var LINK_ALTROVE = 'Non riesco a completare l\'accesso con questo link: aprilo nello stesso browser in cui l\'hai chiesto, oppure chiedine uno nuovo da qui. Se stavi confermando la registrazione, l\'email è già confermata: puoi entrare con email e password.';
  var ANTICIPO = 60;                        // secondi: il token si rinnova un minuto prima che scada
  var DURATA_MASSIMA = 7 * 86400;           // secondi: durata più lunga di un token di GoTrue
  var DURATA_ATTESA = 86400000;             // millisecondi: validità del verificatore di un accesso via email o Google
  var ATTESA_SALVATAGGIO = 2000;            // millisecondi dopo l'ultima modifica
  var VALIDITA_ABBONAMENTO = 5 * 60000;     // l'abbonamento letto si rilegge dopo 5 minuti
  var DURATA_RIMOSSE = 180 * 86400000;      // per quanto si ricorda un'asta tolta (poi potrebbe ricomparire)
  var MAX_COPIE = 100;                      // versioni sostituite tenute in radaraste.account.precedenti
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
    flow_state_expired: 'Il link è scaduto o è già stato usato: chiedine uno nuovo.',
    flow_state_not_found: LINK_ALTROVE,
    bad_code_verifier: LINK_ALTROVE,
    bad_oauth_state: 'Accesso con Google non riuscito: riprova.',
    bad_oauth_callback: 'Accesso con Google non riuscito: riprova.',
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
  function messaggioErrore(codice) { return typeof codice === 'string' && propria(ERRORI, codice) ? ERRORI[codice] : null; }
  function erroreAuth(r) {
    var d = (r && r.dati) || {}, stato = r ? r.stato : 0;
    var codice = typeof d.error_code === 'string' ? d.error_code : typeof d.error === 'string' ? d.error : '';
    var testo = String(d.msg || d.message || d.error_description || '').toLowerCase();
    if (codice === 'invalid_grant') codice = /refresh/.test(testo) ? 'refresh_token_not_found' : /not confirmed/.test(testo) ? 'email_not_confirmed' : 'invalid_credentials';
    if (!messaggioErrore(codice)) {
      if (/invalid login|credentials/.test(testo)) codice = 'invalid_credentials';
      else if (/already (been )?registered|already exists/.test(testo)) codice = 'user_already_exists';
      else if (/not confirmed/.test(testo)) codice = 'email_not_confirmed';
      else if (/signups not allowed for otp/.test(testo)) codice = 'otp_disabled';
      else if (/signups? (are )?not allowed|signup.*disabled/.test(testo)) codice = 'signup_disabled';
      else if (/password/.test(testo) && /(weak|short|least|characters)/.test(testo)) codice = 'weak_password';
      else if (/invalid.*email|email.*invalid/.test(testo)) codice = 'email_address_invalid';
      else if (stato === 429 || /rate limit|too many/.test(testo)) codice = 'over_request_rate_limit';
    }
    if (messaggioErrore(codice)) return errore(ERRORI[codice], codice, stato);
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
  function propria(o, k) { return !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k); }
  // "__proto__" nei dati (un id di un file importato, una chiave dell'account) non deve cambiare il prototipo degli oggetti
  function assegna(a, b) { for (var k in b) if (propria(b, k) && k !== '__proto__') a[k] = b[k]; return a; }
  // elenco per id senza prototipo: qualunque id, anche "__proto__", è una voce come le altre
  function mappa() { return Object.create(null); }
  function imposta(o, k, v) { Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true }); }
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
  // c'è qualcosa? (null, [] e {} non contano)
  function pieno(v) { return v != null && !(typeof v === 'object' && !Object.keys(v).length); }
  function datiLocali() { return CHIAVI.some(function (k) { var v = leggiDato(k); return v !== undefined && pieno(v); }); }

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

  // contenuto del token JWT (non verificato): solo per l'id e l'email se GoTrue non manda l'utente con la sessione
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
  /* durata del token in secondi, contata dal nostro orologio (expires_in). expires_at è l'ora del servizio: con
   * l'orologio del dispositivo avanti di un'ora il token sembrerebbe già scaduto e si rinnoverebbe a ripetizione.
   * Valori assurdi → un'ora (se scade prima, il servizio risponde 401 e si rinnova). */
  function durata(d, ora) {
    var n = Number(d.expires_in);
    if (!(n > 0)) n = Number(d.expires_at) - ora;
    return n >= 2 * ANTICIPO && n <= DURATA_MASSIMA ? n : 3600;
  }
  // salva la risposta di GoTrue (token, scadenza, utente) e programma il rinnovo; toglie l'eventuale attesa
  function salvaSessione(d, prima) {
    d = d || {};
    var ora = Math.floor(Date.now() / 1000);
    var u = utenteDa(d.user, d.access_token, prima);
    if (typeof d.access_token !== 'string' || typeof d.refresh_token !== 'string' || !d.access_token || !d.refresh_token || !u) {
      throw errore('Risposta non valida dal servizio degli account: riprova.', 'risposta');
    }
    var s = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: ora + durata(d, ora), utente: u };
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
      var att = sessione();
      // uscito (o entrato con un altro account) mentre si rinnovava: il token nuovo non si salva, l'uscita resta
      if (!att || att.utente.id !== s.utente.id) throw errore(NON_AUTENTICATO, 'non-autenticato');
      // un'altra scheda del browser l'ha già rinnovato (il vecchio token di rinnovo non vale più): si tiene il suo
      if (att.refresh_token !== s.refresh_token) return att;
      if (r.ok) { var n = salvaSessione(r.dati, s.utente); annuncia('rinnovo'); return n; }
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

  /* ---- PKCE: codice segreto di questo browser per completare l'accesso via email o Google ---- */
  function base64url(byte) {
    var s = '';
    for (var i = 0; i < byte.length; i++) s += String.fromCharCode(byte[i]);
    return root.btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  // { verificatore, sfida, metodo }: sfida = SHA-256 del verificatore; senza crypto.subtle (pagina non https) 'plain'
  function codiciPkce() {
    var c = root.crypto;
    if (!c || typeof c.getRandomValues !== 'function' || typeof root.btoa !== 'function') {
      return rifiuta('Questo browser non permette un accesso sicuro: aggiornalo o usane un altro.', 'browser');
    }
    var v = base64url(c.getRandomValues(new Uint8Array(32))), semplice = { verificatore: v, sfida: v, metodo: 'plain' };
    if (!c.subtle || typeof c.subtle.digest !== 'function') return Promise.resolve(semplice);
    var b = new Uint8Array(v.length);
    for (var i = 0; i < v.length; i++) b[i] = v.charCodeAt(i);
    return Promise.resolve().then(function () { return c.subtle.digest('SHA-256', b); }).then(function (h) {
      return { verificatore: v, sfida: base64url(new Uint8Array(h)), metodo: 's256' };
    }, function () { return semplice; });
  }
  // accesso via email o Google in arrivo: tiene il verificatore (sostituisce quello di una richiesta precedente) e
  // restituisce i campi da mandare a GoTrue. tipo: 'signup', 'magiclink' o 'oauth'
  function preparaAttesa(tipo) {
    return codiciPkce().then(function (p) {
      var s = leggi(K_SESSIONE);
      if (!s || typeof s !== 'object' || Array.isArray(s)) s = {};
      s.attesa = { verificatore: p.verificatore, tipo: tipo, chiesto: new Date().toISOString() };
      if (!scrivi(K_SESSIONE, s)) throw errore('Il browser non permette di salvare l\'accesso (memoria piena o navigazione privata).', 'memoria');
      return { code_challenge: p.sfida, code_challenge_method: p.metodo };
    });
  }
  function togliAttesa() {
    var s = leggi(K_SESSIONE);
    if (!s || !s.attesa) return;
    delete s.attesa;
    if (typeof s.access_token === 'string') scrivi(K_SESSIONE, s); else togli(K_SESSIONE);
  }
  function attesa() {
    var s = leggi(K_SESSIONE), a = s && s.attesa;
    if (!a || typeof a.verificatore !== 'string' || !a.verificatore) return null;
    var t = tempo(a.chiesto);
    if (!t || Date.now() - t > DURATA_ATTESA) { togliAttesa(); return null; }
    return a;
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
    return preparaAttesa('signup').then(function (pk) {
      var corpo = assegna({ email: email, password: String(password) }, pk);
      if (consenso(opz)) corpo.data = consenso(opz);
      return auth('POST', '/signup?redirect_to=' + encodeURIComponent(indirizzoRitorno(opz && opz.dopo)), corpo);
    }).then(function (r) {
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

  // porta a Google; al ritorno su accedi.html?code=... il codice si scambia con la sessione (vedi ritornoDaIndirizzo)
  function accediConGoogle(dopo) {
    if (!configurato()) return spento();
    return preparaAttesa('oauth').then(function (pk) {
      var url = base() + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(indirizzoRitorno(dopo)) +
        '&code_challenge=' + encodeURIComponent(pk.code_challenge) + '&code_challenge_method=' + pk.code_challenge_method;
      try { root.location.assign(url); } catch (e) { throw errore('Non riesco ad aprire la pagina di Google: riprova.', 'navigazione'); }
      return { url: url };
    });
  }

  // link di accesso via email; opz.crea: crea l'account se non c'è (solo con il consenso dato nel modulo)
  function linkMagico(email, dopo, opz) {
    if (!configurato()) return spento();
    email = String(email || '').trim();
    if (!emailValida(email)) return rifiuta(ERRORI.email_address_invalid, 'email_address_invalid');
    var crea = !!(opz && opz.crea);
    return preparaAttesa(crea ? 'signup' : 'magiclink').then(function (pk) {
      var corpo = assegna({ email: email, create_user: crea }, pk);
      if (crea && consenso(opz)) corpo.data = consenso(opz);
      return auth('POST', '/otp?redirect_to=' + encodeURIComponent(indirizzoRitorno(dopo)), corpo);
    }).then(function (r) {
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

  /* esce da questo dispositivo: prima salva le modifiche in sospeso, poi chiude la sessione anche sul servizio (con un
   * token valido, rinnovato se serve: altrimenti il token di rinnovo resterebbe buono). I dati del sito restano nel browser. */
  function esci() {
    if (!configurato()) return spento();
    if (!sessione()) return Promise.resolve(false);
    var prima = pendenti() ? salvaDati().catch(niente) : Promise.resolve();
    return prima.then(function () {
      if (sessione()) return conToken(function (t) { return auth('POST', '/logout?scope=local', undefined, t); }).catch(niente);
    }).then(function () { chiudiSessione('uscita'); return true; });
  }

  /* ---- Ritorno da email o Google: ?code=... (PKCE), oppure ?error=... / #error=... ---- */
  // "a=1&b=2" → { a: '1', b: '2' }, senza prototipo
  function coppie(testo) {
    var p = mappa();
    String(testo || '').split('&').forEach(function (parte) {
      var i = parte.indexOf('=');
      if (i <= 0) return;
      try { p[decodeURIComponent(parte.slice(0, i).replace(/\+/g, ' '))] = decodeURIComponent(parte.slice(i + 1).replace(/\+/g, ' ')); } catch (e) { /* parte illeggibile */ }
    });
    return p;
  }
  var PARAMETRI_RITORNO = ['code', 'error', 'error_code', 'error_description'];
  var FRAMMENTO_ACCESSO = /(^#|&)(access_token|refresh_token|provider_token|error|error_code)=/;
  // parametri del ritorno nell'indirizzo → { codice } | { errore } | { implicito: true }; null se non ce ne sono
  function leggiRitorno(search, hash) {
    var q = coppie(String(search || '').replace(/^\?/, '')), h = coppie(String(hash || '').replace(/^#/, ''));
    var e = q.error || q.error_code ? q : h.error || h.error_code ? h : null;
    if (e) return { errore: e.error_code || e.error, descrizione: e.error_description || '' };
    if (q.code) return { codice: q.code };
    if (h.access_token || h.refresh_token) return { implicito: true };
    return null;
  }
  // toglie codici, token ed errori dall'indirizzo e dalla cronologia; resta il resto (?dopo=, ?anteprima=)
  function pulisciIndirizzo(l) {
    var resto = String(l.search || '').replace(/^\?/, '').split('&').filter(function (parte) {
      if (!parte) return false;
      var k = parte.split('=')[0];
      try { k = decodeURIComponent(k); } catch (e) { /* resta com'è */ }
      return PARAMETRI_RITORNO.indexOf(k) < 0;
    }).join('&');
    var h = String(l.hash || ''), daTogliere = FRAMMENTO_ACCESSO.test(h);
    try { root.history.replaceState(root.history.state, '', String(l.pathname || '') + (resto ? '?' + resto : '') + (daTogliere ? '' : h)); }
    catch (e) { try { if (daTogliere) l.hash = ''; } catch (e2) { /* niente */ } }
  }
  var ultimoRitorno = null;
  function ritornoDaIndirizzo() {
    var l = root.location, r = l ? leggiRitorno(l.search, l.hash) : null;
    if (!r) return Promise.resolve(null);
    // il codice e gli eventuali token non devono restare nell'indirizzo (cronologia, segnalibri, condivisione)
    pulisciIndirizzo(l);
    if (!configurato()) return Promise.resolve(null);
    var a = attesa(), tipo = a ? a.tipo : null;
    function esito(o) { ultimoRitorno = assegna({ tipo: tipo }, o); return ultimoRitorno; }
    if (r.errore) return Promise.resolve(esito({ errore: messaggioErrore(r.errore) || 'Accesso non riuscito: riprova o chiedi un nuovo link.' }));
    // token nell'indirizzo: chiunque potrebbe mandarli in un link per farti entrare nel suo account
    if (r.implicito) return Promise.resolve(esito({ errore: 'Questo link di accesso non è valido: chiedine uno nuovo da questa pagina.' }));
    // nessun accesso chiesto da questo browser: il codice da solo non basta
    if (!a) return Promise.resolve(esito({ errore: LINK_ALTROVE }));
    return auth('POST', '/token?grant_type=pkce', { auth_code: r.codice, code_verifier: a.verificatore }).then(function (x) {
      if (!x.ok) { var e = erroreAuth(x); return esito({ errore: e.codice === 'servizio' && x.stato < 500 ? LINK_ALTROVE : e.message }); }
      try { salvaSessione(x.dati); } catch (e) { return esito({ errore: e.message }); }
      dopoAccesso(tipo === 'signup' ? 'registrazione' : 'accesso');
      return esito({ accesso: true });
    }, function (e) { return esito({ errore: e.message }); });
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
  // impronta di una voce, uguale anche con le chiavi in un altro ordine (jsonb le riordina)
  function impronta(v) { return firma(stabile(v)); }
  function tempo(v) {
    if (v == null || v === '') return 0;
    var t = typeof v === 'number' ? v : Date.parse(v);
    return isFinite(t) && t > 0 ? t : 0;
  }
  function iso(t) { return t > 0 ? new Date(t).toISOString() : null; }
  function firmeVoci(lista) {
    var o = mappa();
    (Array.isArray(lista) ? lista : []).forEach(function (v) { if (v && typeof v === 'object' && v.id != null) o[String(v.id)] = impronta(v); });
    return copia(o);
  }
  function registro() {
    var r = leggi(K_SYNC);
    if (!r || typeof r !== 'object' || r.versione !== 1) r = { versione: 1, chiavi: {}, sincronizzate: {} };
    if (!r.chiavi || typeof r.chiavi !== 'object') r.chiavi = {};
    if (!r.sincronizzate || typeof r.sincronizzate !== 'object') r.sincronizzate = {};
    return r;
  }

  /* Annota cosa è cambiato in questo browser dall'ultima occhiata, con l'ora: per le liste anche quali voci sono
   * cambiate e quali sono state tolte (con l'impronta della versione tolta). La prima volta si fotografa senza ora
   * (l'età di quei dati non si conosce). */
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
        var nuove = firmeVoci(v), vecchie = m.firme && typeof m.firme === 'object' ? m.firme : {};
        if (!m.orari || typeof m.orari !== 'object') m.orari = {};
        if (!m.rimosse || typeof m.rimosse !== 'object') m.rimosse = {};
        Object.keys(nuove).forEach(function (id) { if (!propria(vecchie, id) || nuove[id] !== vecchie[id]) { imposta(m.orari, id, ora); delete m.rimosse[id]; } });
        Object.keys(vecchie).forEach(function (id) { if (!propria(nuove, id)) { imposta(m.rimosse, id, { t: ora, f: vecchie[id] }); delete m.orari[id]; } });
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
    return Math.max(tempo(propria(orari, String(v.id)) ? orari[String(v.id)] : null), tempo(v.modificata), tempo(v.aggiunta), tempo(v.creata));
  }
  // ogni campo di v è uguale in fin (v non ha nulla che fin abbia perso)
  function inclusa(v, fin) {
    return Object.keys(v).every(function (k) { return v[k] === undefined || (propria(fin, k) && stabile(v[k]) === stabile(fin[k])); });
  }
  // asta tolta: { t: quando, f: impronta della versione tolta } (i registri di prima avevano solo l'ora)
  function rimozione(x) {
    if (x && typeof x === 'object') return { t: tempo(x.t), f: typeof x.f === 'string' && x.f ? x.f : null };
    return { t: tempo(x), f: null };
  }
  /* liste con id: l e r = { valore: [...], orari: { id: ora }, rimosse: { id: { t, f } } } (questo browser e account).
   * Nessuna voce si perde: una voce sparisce solo se altrove è stata tolta proprio quella versione; quando due versioni
   * della stessa voce sono diverse, quella che perde finisce in perse. */
  function unisciLista(l, r, adesso, perse, k) {
    l = l || {}; r = r || {};
    var limite = adesso - DURATA_RIMOSSE, rimosse = mappa(), orari = mappa(), perId = mappa(), ordine = [], senzaId = [], visti = mappa();
    [l.rimosse, r.rimosse].forEach(function (m) {
      if (!m || typeof m !== 'object') return;
      Object.keys(m).forEach(function (id) {
        var x = rimozione(m[id]);
        if (x.t > limite && (!rimosse[id] || x.t > rimosse[id].t)) rimosse[id] = x;
      });
    });
    function metti(v, orariLato, lato) {
      if (!v || typeof v !== 'object' || v.id == null) {
        var f = stabile(v);
        if (!visti[f]) { visti[f] = true; senzaId.push(v); }
        return;
      }
      var id = String(v.id), t = tempoVoce(v, orariLato), c = perId[id];
      if (!c) { perId[id] = { v: v, t: t, versioni: [{ v: v, lato: lato }] }; ordine.push(id); return; }
      if (stabile(c.v) !== stabile(v)) {
        // stessa voce cambiata in due posti: vince l'ultima modifica (con la sua nota); a parità vince questo browser.
        // I campi che mancano nella versione più recente si prendono dall'altra.
        c.versioni.push({ v: v, lato: lato });
        c.v = t > c.t ? assegna(assegna({}, c.v), v) : assegna(assegna({}, v), c.v);
      }
      c.t = Math.max(c.t, t);
    }
    (Array.isArray(l.valore) ? l.valore : []).forEach(function (v) { metti(v, l.orari, 'browser'); });
    (Array.isArray(r.valore) ? r.valore : []).forEach(function (v) { metti(v, r.orari, 'account'); });
    // versioni che la voce finale non contiene per intero (soloBrowser: tutte quelle di questo browser, voce tolta)
    function perdi(c, id, soloBrowser) {
      var viste = mappa();
      c.versioni.forEach(function (x) {
        var s = stabile(x.v);
        if (viste[s] || (soloBrowser ? x.lato !== 'browser' : inclusa(x.v, c.v))) return;
        viste[s] = true;
        if (perse) perse.push({ chiave: k, id: id, valore: x.v, da: x.lato });
      });
    }
    var valore = [];
    ordine.forEach(function (id) {
      var c = perId[id], x = rimosse[id];
      // tolta altrove: sparisce solo se è ancora la versione tolta (senza impronta, registri vecchi: se tolta dopo
      // l'ultima modifica). La copia di questo browser resta tra le versioni sostituite.
      if (x && (x.f ? impronta(c.v) === x.f : x.t >= c.t)) { perdi(c, id, true); return; }
      if (x) delete rimosse[id];                   // modificata o ripresa dopo essere stata tolta: resta
      perdi(c, id, false);
      valore.push(c.v);
      if (c.t > 0) orari[id] = iso(c.t);
    });
    valore = valore.concat(senzaId);
    var esiste = l.valore != null || r.valore != null;
    var fuori = mappa();
    Object.keys(rimosse).forEach(function (id) { fuori[id] = { t: iso(rimosse[id].t), f: rimosse[id].f }; });
    return { valore: esiste ? valore : null, aggiornato: iso(Math.max(tempo(l.aggiornato), tempo(r.aggiornato))), orari: copia(orari), rimosse: copia(fuori) };
  }
  // un solo valore: vince il più recente; senza ora (mai modificato da quando lo osserviamo) vale come il più vecchio
  function unisciValore(l, r, perse, k) {
    l = l || {}; r = r || {};
    var hl = l.valore != null, hr = r.valore != null;
    if (!hr) return { valore: hl ? l.valore : null, aggiornato: l.aggiornato || null };
    if (!hl) return { valore: r.valore, aggiornato: r.aggiornato || null };
    if (stabile(l.valore) === stabile(r.valore)) return { valore: l.valore, aggiornato: iso(Math.max(tempo(l.aggiornato), tempo(r.aggiornato))) };
    var vinceAccount = tempo(r.aggiornato) > tempo(l.aggiornato);
    if (perse) perse.push({ chiave: k, id: null, valore: vinceAccount ? l.valore : r.valore, da: vinceAccount ? 'browser' : 'account' });
    return vinceAccount ? { valore: r.valore, aggiornato: r.aggiornato || null } : { valore: l.valore, aggiornato: l.aggiornato || null };
  }
  /* Unione pura (usata anche dai test): locale e remoto = { chiave: { valore, aggiornato, orari?, rimosse? } }.
   * Restituisce le chiavi unite nello stesso formato (solo quelle con un valore). perse (facoltativo): elenco dove
   * aggiungere le versioni che perdono { chiave, id, valore, da: 'browser' | 'account' }. */
  function unisci(locale, remoto, adesso, perse) {
    locale = locale || {}; remoto = remoto || {};
    var ora = tempo(adesso) || Date.now(), out = {};
    CHIAVI.forEach(function (k) {
      var l = propria(locale, k) ? locale[k] : null, r = propria(remoto, k) ? remoto[k] : null;
      if (!l && !r) return;
      var u = LISTE[k] ? unisciLista(l, r, ora, perse, k) : unisciValore(l, r, perse, k);
      if (u.valore != null) out[k] = u;
    });
    return out;
  }

  // versioni sostituite (radaraste.account.precedenti): { versione: 2, voci: [{ chiave, id, valore, da, sostituito, utente }] }
  function copie() {
    var p = leggi(K_PRECEDENTI);
    if (p && p.versione === 2 && Array.isArray(p.voci)) return p;
    var voci = [];
    // formato di prima { chiave: { valore, sostituito } }: si tiene, senza account
    if (p && typeof p === 'object' && !Array.isArray(p)) {
      Object.keys(p).forEach(function (k) { if (p[k] && typeof p[k] === 'object' && 'valore' in p[k]) voci.push({ chiave: k, id: null, valore: p[k].valore, da: 'browser', sostituito: p[k].sostituito || null, utente: null }); });
    }
    return { versione: 2, voci: voci };
  }
  // aggiunge le versioni perse (le ultime MAX_COPIE); false se il browser non riesce a salvarle
  function conserva(perse, utenteId, ora) {
    if (!perse.length) return true;
    var p = copie(), viste = mappa();
    function segno(x) { return x.chiave + '|' + x.id + '|' + impronta(x.valore); }
    p.voci.forEach(function (x) { viste[segno(x)] = true; });
    perse.forEach(function (x) {
      if (viste[segno(x)]) return;
      viste[segno(x)] = true;
      p.voci.push({ chiave: x.chiave, id: x.id, valore: x.valore, da: x.da, sostituito: ora, utente: utenteId });
    });
    if (p.voci.length > MAX_COPIE) p.voci = p.voci.slice(p.voci.length - MAX_COPIE);
    return scrivi(K_PRECEDENTI, p);
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
  // i dati di questo browser sono collegati a un altro account (e ce ne sono): si uniscono solo con la conferma
  function altroAccount(id) { var reg = registro(); return !!(reg.utente && reg.utente !== id && datiLocali()); }

  var syncInCorso = null;
  // opz.unisci: conferma di unire i dati di questo browser anche se erano collegati a un altro account
  function sincronizza(opz) {
    if (!configurato()) return spento();
    if (syncInCorso) return syncInCorso;
    var s = sessione();
    if (!s) return rifiuta('Accedi al tuo account per sincronizzare i dati.', 'non-autenticato');
    var id = s.utente.id, ripeti = false;
    if (timerSalva) { clearTimeout(timerSalva); timerSalva = null; }
    // dati di un'altra persona? Niente rete e niente unione finché non lo conferma chi è entrato
    if (!(opz && opz.unisci) && altroAccount(id)) return Promise.resolve({ sincronizzato: null, esito: {}, caricato: false, salvato: false, daConfermare: true });
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
      // dati di un altro account uniti con la conferma: ciò che risultava già salvato e le aste tolte valevano per
      // l'account di prima (meglio tenere un'asta in più che toglierla dall'account sbagliato)
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
      var perse = [], unito = unisci(locale, remoto, ora, perse), entrate = {}, esito = {}, scritte = {}, cambiaRemoto = !riga;
      // prima di sostituire qualcosa se ne tiene una copia: se il browser non ci riesce, non si cambia nulla
      if (!conserva(perse, id, ora)) {
        throw errore('La memoria del browser è piena: non posso sincronizzare senza rischiare di perdere dati. Libera spazio (per esempio smetti di seguire le aste che non ti servono più) e riprova.', 'memoria');
      }
      Object.keys(unito).forEach(function (k) {
        var u = unito[k], testo = json(u.valore), e = { valore: u.valore, aggiornato: u.aggiornato || null };
        if (LISTE[k]) { e.orari = u.orari; e.rimosse = u.rimosse; }
        entrate[k] = e;
        if (stabile(propria(remoto, k) ? remoto[k] : null) !== stabile(e)) cambiaRemoto = true;
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
  function caricaDati(opz) {
    return sincronizza(opz).then(function (fine) {
      var s = sessione();
      if (s && !fine.daConfermare) scriviTesto(K_CARICATI, s.utente.id, 'sessionStorage');
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
    function c(k) { var v = leggiDato(k); return v !== undefined && pieno(v); }
    var reg = configurato() ? registro() : null, u = utente();
    return {
      seguite: lunghezza(K_SEGUITE), aste: lunghezza(K_ASTE), ricerche: lunghezza('radaraste.ricerche'),
      preferenze: c('radaraste.preferenze'), stratega: c('radaraste.stratega'),
      // ultima sincronizzazione dell'account collegato (non di un altro account usato prima in questo browser)
      ultima: reg && u && reg.utente === u.id ? reg.ultima || null : null, pendenti: pendenti(),
      // dati di questo browser collegati a un altro account: aspettano la conferma per unirsi a questo
      daConfermare: !!(u && altroAccount(u.id))
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
      // dati di questo browser collegati a un altro account: non sono di chi scarica il file
      var altro = altroAccount(s.utente.id), locali = {};
      if (!altro) CHIAVI.forEach(function (k) { var v = leggiDato(k); if (v != null) locali[k] = v; });
      return {
        app: 'Radar Aste Italia',
        descrizione: 'Copia dei dati del tuo account (articoli 15 e 20 del GDPR): account, abbonamento, dati sincronizzati e dati salvati in questo browser.',
        esportato: new Date().toISOString(),
        modalita: cfg().modalita || 'test',
        account: { id: s.utente.id, email: s.utente.email, creato: s.utente.creato || null, accessoCon: s.utente.provider || null },
        profilo: prima(r[0]),
        abbonamento: prima(r[1]),
        datiSincronizzati: prima(r[2]),
        datiDiQuestoBrowser: altro ? null : locali,
        notaBrowser: altro ? 'I dati salvati in questo browser sono collegati a un altro account e non sono inclusi: uniscili al tuo account dalla pagina "Il mio account" se sono tuoi.' : null,
        // solo le versioni sostituite sincronizzando questo account (non quelle di altri account usati in questo browser)
        copieDiSicurezza: copie().voci.filter(function (x) { return x && x.utente === s.utente.id; })
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
  /* cancella account e dati nell'account (art. 17 GDPR); i dati del sito in questo browser restano, ancora legati
   * all'account cancellato: un altro account che entra qui non li prende senza conferma */
  function cancellaAccount() {
    return chiamaApi('cancellaAccount', {}).then(function (d) {
      var s = sessione(), reg = registro();
      if (s) { reg.utente = s.utente.id; reg.sincronizzate = {}; delete reg.ultima; scrivi(K_SYNC, reg); }
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
    // spento: nessun ascoltatore, nessuna rete; si toglie solo dall'indirizzo un eventuale codice di accesso
    if (!configurato()) { prontoP = ritornoDaIndirizzo().then(function () { return null; }); return prontoP; }
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
    prontoP = ritornoDaIndirizzo().then(function () {
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
    unisci: unisci, leggiRitorno: leggiRitorno, osserva: osserva, pendenti: pendenti, firma: firma, impronta: impronta,
    CHIAVI: CHIAVI, NON_CONFIGURATO: NON_CONFIGURATO, MIN_PASSWORD: MIN_PASSWORD, ATTESA_SALVATAGGIO: ATTESA_SALVATAGGIO, MAX_COPIE: MAX_COPIE
  };

  if (NODE) module.exports = Account;
  else { root.Account = Account; avvia(); }
})(typeof window !== 'undefined' ? window : globalThis);
