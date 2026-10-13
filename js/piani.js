/* Piani e funzioni a pagamento: chi può usare cosa (config/abbonamenti.js).
 *
 * Abbonamenti spenti (attivi: false, o account non configurati) = sito come sempre: puo() è sempre vero e limite()
 * è Infinity. L'anteprima per il proprietario (?anteprima=abbonamenti nell'indirizzo, ricordata per la sessione del
 * browser; ?anteprima=no la spegne) mostra blocchi e prezzi in modalità test, solo a chi la apre.
 *
 * Lo stato dell'account viene da window.Account.statoCorrente() → { utente, abbonamento } (abbonamento come nella
 * tabella abbonamenti: { piano, periodo, stato, fineProva, finePeriodo, cancellaAllaFine }). Il piano lo decide
 * lo stato di Stripe:
 *   active, trialing     → il suo piano, finché non è passata la fine del periodo (della prova, se c'è)
 *   past_due             → il suo piano ancora per 7 giorni dalla fine del periodo (pagamento in ritardo)
 *   tutti gli altri      → gratis (canceled, incomplete, incomplete_expired, unpaid, paused…)
 * Il controllo vero lo fanno le funzioni del server: qui si decide solo cosa mostrare. */
(function (root) {
  'use strict';

  var NODE = typeof module !== 'undefined' && module.exports;
  var GIORNO = 86400000;
  var GIORNI_RITARDO = 7;            // pagamento non riuscito: il piano resta per una settimana dalla fine del periodo
  var CHIAVE_ANTEPRIMA = 'radaraste.anteprima-abbonamenti';
  // senza config/abbonamenti.js: tutto spento
  var SPENTI = { attivi: false, modalita: 'test', piani: [], funzioni: {}, nomiFunzioni: {}, limitiGratis: {}, prova: null, supabase: {} };
  var contatore = 0;

  function cfg() {
    var c = root.ABBONAMENTI;
    if (!c && NODE) { try { c = require('../config/abbonamenti.js'); } catch (e) { c = null; } }
    return c || SPENTI;
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // istante in millisecondi da Date, numero (secondi Unix come in Stripe, o millisecondi) o testo ISO; null se manca
  function ms(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v.getTime();
    if (typeof v === 'number') return isFinite(v) ? (v < 1e12 ? v * 1000 : v) : null;
    var t = Date.parse(v);
    return isNaN(t) ? null : t;
  }
  // AAAA-MM-GG nel fuso del browser (quello che l'utente vede sul calendario)
  function dataLocale(d) {
    function due(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate());
  }
  function giornoUTC(iso) { return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)); }

  /* ---- Anteprima per il proprietario ---- */
  function memoria() { try { return root.sessionStorage || null; } catch (e) { return null; } }
  function anteprima() {
    var v = null;
    try { v = root.location && root.location.search ? new URLSearchParams(root.location.search).get('anteprima') : null; } catch (e) { v = null; }
    var m = memoria();
    if (v === 'abbonamenti') { try { if (m) m.setItem(CHIAVE_ANTEPRIMA, '1'); } catch (e) { /* senza memoria vale solo per questa pagina */ } return true; }
    if (v === 'no') { try { if (m) m.removeItem(CHIAVE_ANTEPRIMA); } catch (e) { /* niente */ } return false; }
    try { return !!m && m.getItem(CHIAVE_ANTEPRIMA) === '1'; } catch (e) { return false; }
  }

  // account collegati: senza indirizzo e chiave anonima di Supabase nessuno potrebbe abbonarsi, quindi niente blocchi
  function configurati() { var s = cfg().supabase || {}; return !!(s.url && s.chiaveAnonima); }
  function attivo() { return (cfg().attivi === true && configurati()) || anteprima(); }

  /* ---- Stato dell'account e piano ---- */
  function stato() {
    var A = root.Account;
    if (!A || typeof A.statoCorrente !== 'function') return null;
    try { return A.statoCorrente() || null; } catch (e) { return null; }
  }
  // accetta { utente, abbonamento } oppure direttamente l'abbonamento
  function abbonamentoDi(s) {
    if (!s || typeof s !== 'object') return null;
    if ('abbonamento' in s) return s.abbonamento || null;
    if ('piano' in s) return s;
    return null;
  }
  function dati(id) {
    var l = cfg().piani || [];
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }
  function nome(id) { var p = dati(id); return p ? p.nome : ''; }
  // posizione del piano nell'elenco (gratis 0, base 1, pro 2); -1 se non esiste
  function livello(id) {
    var l = cfg().piani || [];
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return i;
    return -1;
  }

  // s: stato dell'account (assente = quello corrente, null = nessun account); adesso: per i test (Date, ms o ISO)
  function piano(s, adesso) {
    if (s === undefined) s = stato();
    var ab = abbonamentoDi(s);
    var id = ab && ab.piano ? String(ab.piano).toLowerCase() : 'gratis';
    if (id === 'gratis' || livello(id) < 1) return 'gratis';
    var ora = ms(adesso); if (ora == null) ora = Date.now();
    var fine = ms(ab.finePeriodo);
    if (ab.stato === 'active' || ab.stato === 'trialing') {
      if (ab.stato === 'trialing' && ms(ab.fineProva) != null) fine = ms(ab.fineProva);
      return fine == null || ora <= fine ? id : 'gratis';
    }
    if (ab.stato === 'past_due') return fine != null && ora <= fine + GIORNI_RITARDO * GIORNO ? id : 'gratis';
    return 'gratis';
  }

  function pianoMinimo(funzione) { return (cfg().funzioni || {})[funzione] || 'gratis'; }

  function puo(funzione, s, adesso) {
    if (!attivo()) return true;
    var min = pianoMinimo(funzione);
    if (min === 'gratis') return true;
    return livello(piano(s, adesso)) >= livello(min);
  }

  // quante voci si vedono (affari, combinazioni, seguite): Infinity se gli abbonamenti sono spenti o il piano è a pagamento
  function limite(nomeLimite, s, adesso) {
    if (!attivo() || piano(s, adesso) !== 'gratis') return Infinity;
    var n = (cfg().limitiGratis || {})[nomeLimite];
    return typeof n === 'number' && isFinite(n) && n >= 0 ? n : Infinity;
  }

  /* ---- Prezzi ---- */
  // 24 → "24", 9.5 → "9,50", 1200 → "1.200"
  function cifra(n) {
    n = Number(n) || 0;
    var s = Math.round(n * 100) % 100 === 0 ? String(Math.round(n)) : n.toFixed(2).replace('.', ',');
    var parti = s.split(',');
    parti[0] = parti[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return parti.join(',');
  }
  function importo(id, periodo) {
    var p = dati(id);
    if (!p || !p.prezzi) return null;
    var v = Number(p.prezzi[periodo === 'annuale' ? 'annuale' : 'mensile']);
    return isFinite(v) ? v : null;
  }
  // "24 € al mese", "240 € all'anno", "Gratis"; '' se il piano non esiste
  function prezzo(id, periodo) {
    var v = importo(id, periodo);
    if (v == null) return '';
    if (v <= 0) return 'Gratis';
    return cifra(v) + ' € ' + (periodo === 'annuale' ? 'all\'anno' : 'al mese');
  }
  // euro risparmiati in un anno scegliendo l'annuale invece di dodici mensilità
  function risparmioAnnuale(id) {
    var m = importo(id, 'mensile'), a = importo(id, 'annuale');
    if (m == null || a == null) return 0;
    return Math.max(0, Math.round((m * 12 - a) * 100) / 100);
  }

  // giorni di prova rimasti (0 se non è in prova); oggiISO: AAAA-MM-GG (giorni di calendario) o istante ISO
  function giorniProva(abbonamento, oggiISO) {
    var ab = abbonamentoDi(abbonamento) || abbonamento;
    if (!ab || typeof ab !== 'object' || (ab.stato && ab.stato !== 'trialing')) return 0;
    var fine = ms(ab.fineProva);
    if (fine == null) return 0;
    var oggi = oggiISO || dataLocale(new Date());
    if (/^\d{4}-\d{2}-\d{2}$/.test(oggi)) return Math.max(0, Math.round((giornoUTC(dataLocale(new Date(fine))) - giornoUTC(oggi)) / GIORNO));
    var t = ms(oggi);
    return t == null ? 0 : Math.max(0, Math.ceil((fine - t) / GIORNO));
  }

  /* ---- Riquadri ---- */
  function icona(n) { return root.Icone && typeof root.Icone.svg === 'function' ? root.Icone.svg(n) : ''; }
  // prima lettera minuscola per i nomi dentro una frase ("Report PDF" → "report PDF")
  function minuscola(s) { return /^[A-ZÀ-Ý][a-zà-ÿ']/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
  function primoAPagamento() {
    var l = cfg().piani || [];
    for (var i = 0; i < l.length; i++) if (l[i].prezzi && Number(l[i].prezzi.mensile) > 0) return l[i].id;
    return 'base';
  }

  /* Riquadro al posto di una funzione bloccata. opz: { funzione, titolo?, testo?, livello? (titolo h2…h4, predefinito h2) }
   * Tutti i testi sono protetti: niente HTML dai parametri. */
  function blocco(opz) {
    opz = opz || {};
    var c = cfg(), id = pianoMinimo(opz.funzione);
    if (livello(id) < 1) id = primoAPagamento();
    var nomePiano = nome(id) || id, nomeF = (c.nomiFunzioni || {})[opz.funzione] || '';
    var h = Math.min(4, Math.max(2, parseInt(opz.livello, 10) || 2));
    var idTitolo = 'blocco-piano-' + (++contatore);
    var titolo = opz.titolo || 'Disponibile con il piano ' + nomePiano;
    var testo = opz.testo || (nomeF ? 'Con il piano ' + nomePiano + ' sblocchi: ' + minuscola(nomeF) + '.' : 'Questa funzione fa parte del piano ' + nomePiano + '.');
    // prezzo e prova gratuita
    var info = '';
    if (importo(id, 'mensile') > 0) {
      var r = risparmioAnnuale(id);
      info = nomePiano + ': ' + prezzo(id, 'mensile') + ' oppure ' + prezzo(id, 'annuale') + (r > 0 ? ' (risparmi ' + cifra(r) + ' €)' : '') + (c.ivaInclusa ? ', IVA inclusa.' : '.');
    }
    var pr = c.prova;
    if (pr && pr.giorni > 0 && livello(pr.piano) >= livello(id)) {
      info += (info ? ' ' : '') + (pr.piano === id ? 'Puoi provarlo gratis per ' + pr.giorni + ' giorni.'
        : 'Il piano ' + (nome(pr.piano) || pr.piano) + ', che comprende anche questa funzione, si può provare gratis per ' + pr.giorni + ' giorni.');
    }
    var s = stato();
    return '<section class="blocco-piano" aria-labelledby="' + idTitolo + '" data-funzione="' + esc(opz.funzione || '') + '" data-piano="' + esc(id) + '">' +
      '<h' + h + ' class="blocco-piano-titolo" id="' + idTitolo + '">' + icona('occupato') + '<span>' + esc(titolo) + '</span></h' + h + '>' +
      '<p class="blocco-piano-testo">' + esc(testo) + '</p>' +
      (info ? '<p class="blocco-piano-testo note">' + esc(info) + '</p>' : '') +
      '<div class="row-actions"><a class="btn" href="prezzi.html#' + esc(id) + '">Sblocca con ' + esc(nomePiano) + '</a>' +
        '<a class="btn ghost" href="prezzi.html">Confronta i piani</a></div>' +
      (s && s.utente ? '' : '<p class="blocco-piano-testo note"><a href="accedi.html">Hai già un abbonamento? Accedi</a></p>') +
      '</section>';
  }

  // fascia in cima alla pagina durante l'anteprima ('' fuori dall'anteprima)
  function avvisoAnteprima() {
    if (!anteprima()) return '';
    var esci = '?anteprima=no';
    try { var q = new URLSearchParams(root.location.search); q.set('anteprima', 'no'); esci = '?' + q.toString(); } catch (e) { /* resta il link semplice */ }
    var test = cfg().modalita === 'test';
    return '<div class="avviso-anteprima" role="note">' +
      '<p><strong>' + (test ? 'Anteprima abbonamenti – modalità test: nessun pagamento reale.' : 'Anteprima abbonamenti – attenzione: i pagamenti sono reali.') + '</strong> ' +
      'Vedi blocchi e prezzi come saranno con gli abbonamenti attivi; gli altri visitatori vedono il sito di sempre. ' +
      '<a href="' + esc(esci) + '">Esci dall\'anteprima</a></p></div>';
  }

  var Piani = {
    attivo: attivo, anteprima: anteprima, stato: stato, piano: piano, puo: puo, limite: limite, pianoMinimo: pianoMinimo,
    prezzo: prezzo, risparmioAnnuale: risparmioAnnuale, giorniProva: giorniProva, blocco: blocco, avvisoAnteprima: avvisoAnteprima,
    // di supporto per le pagine
    dati: dati, nome: nome, livello: livello, config: cfg,
    CHIAVE_ANTEPRIMA: CHIAVE_ANTEPRIMA, GIORNI_RITARDO: GIORNI_RITARDO
  };

  // ricorda subito l'anteprima chiesta nell'indirizzo, anche se la pagina non la usa
  anteprima();

  if (NODE) module.exports = Piani;
  else root.Piani = Piani;
})(typeof window !== 'undefined' ? window : globalThis);
