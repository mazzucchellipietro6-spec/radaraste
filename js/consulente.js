/* Consulente d'asta di Radar Aste Italia: risponde a domande scritte in italiano con regole fisse.
 * Nessuna AI e nessuna rete: usa solo le aste raccolte e i moduli del sito (Calcoli, Mutuo, Punteggio,
 * tariffe di config/tariffe.js). Ogni numero viene da un dato o da un calcolo e ha la sua fonte;
 * se un dato manca, la risposta lo dice.
 *
 *   Consulente.capisci(testo, ctx?, memoria?) → { intento, parametri }
 *   Consulente.rispondi(testo, ctx, memoria?) → { intento, parametri, blocchi, memoria }
 *     ctx = { aste, T, oggi: 'AAAA-MM-GG', affari (window.AFFARI o null),
 *             raccolta? (window.ASTE_RACCOLTE: data dei dati e semestre OMI) }
 *     memoria = il campo "memoria" della risposta precedente (per "e solo liberi?", "e se fosse prima casa?")
 *   Blocchi (solo testo semplice: la pagina fa l'escape):
 *     { tipo: 'testo', testo }
 *     { tipo: 'aste', titolo, totale, ids, filtri (formato della pagina Aste), nota, link? }
 *     { tipo: 'conti', titolo, righe: [[etichetta, importo]], totale: [etichetta, importo], affidabilita, perche, ipotesi }
 *         importo: numero in euro, oppure testo già scritto (es. '7,2%')
 *     { tipo: 'avviso', testo }
 *     { tipo: 'suggerimenti', voci }
 *     { tipo: 'fonti', voci: [{ nome, url?, data? }] }   sempre l'ultimo blocco se la risposta contiene numeri
 *   Consulente.ESEMPI (domande d'esempio), Consulente.GUIDA (guida all'asta passo passo, usata anche da guida.html) */
(function (root) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;
  var FILE = { Calcoli: './calcoli.js', Mutuo: './mutuo.js', Punteggio: './punteggio.js', GEO: '../data/geo.js', Estrai: './estrai.js' };
  var moduli = {};
  // nel browser i moduli si leggono al momento dell'uso (gli script possono arrivare dopo questo)
  function modulo(nome) {
    if (moduli[nome]) return moduli[nome];
    var m = null;
    if (NODE) { try { m = require(FILE[nome]); } catch (e) { m = null; } if (m) moduli[nome] = m; }
    else m = root[nome] || null;
    return m;
  }

  /* ---------- Testo ---------- */

  var ACCENTI = { 'à': 'a', 'á': 'a', 'â': 'a', 'ä': 'a', 'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e', 'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
    'ò': 'o', 'ó': 'o', 'ô': 'o', 'ö': 'o', 'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u', 'ç': 'c', 'ñ': 'n' };
  function norm(t) {
    var s = String(t == null ? '' : t).toLowerCase();
    if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    else s = s.replace(/[àáâäèéêëìíîïòóôöùúûüçñ]/g, function (c) { return ACCENTI[c]; });
    return s.replace(/[’‘`´]/g, '\'');
  }
  // solo lettere e cifre, separate da uno spazio (per luoghi e parole chiave)
  function piatto(t) { return norm(t).replace(/[^a-z0-9]+/g, ' ').replace(/^ | $/g, ''); }
  function num(x) { var n = Number(x); return isFinite(n) ? n : 0; }
  function tondo2(n) { return Math.round(n * 100) / 100; }
  function copia(o) { var c = {}; if (o) for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) c[k] = o[k]; return c; }
  function unici(l) { return l.filter(function (x, i) { return x != null && x !== '' && l.indexOf(x) === i; }); }

  function migliaia(s) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function eur(n) {
    n = Number(n);
    if (!isFinite(n)) return 'n.d.';
    var neg = n < 0, a = Math.abs(n), s;
    if (a < 100 && Math.round(a * 100) % 100 !== 0) { var c = Math.round(a * 100); s = String(Math.floor(c / 100)) + ',' + ('0' + (c % 100)).slice(-2); }
    else s = migliaia(String(Math.round(a)));
    return (neg ? '-' : '') + s + ' €';
  }
  function pct(f) { return String(Math.round(f * 1000) / 10).replace('.', ',') + '%'; }
  function dataIt(iso) { if (!iso) return ''; var p = String(iso).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(iso); }
  function due(n) { return (n < 10 ? '0' : '') + n; }
  function piu(data, giorni) { var d = new Date(data + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + giorni); return d.toISOString().slice(0, 10); }
  function fineMese(anno, mese) { return new Date(Date.UTC(anno, mese, 0, 12)).toISOString().slice(0, 10); }   // mese 1-12
  function piuMesi(data, mesi) { var d = new Date(data + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + mesi); return d.toISOString().slice(0, 10); }
  function giorniTra(a, b) { return Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000); }
  function oggiLocale() { var d = new Date(); return d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate()); }
  function maiuscola(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  /* ---------- Fonti ---------- */

  var URL_PVP = 'https://pvp.giustizia.it/pvp/';
  var URL_OMI = 'https://www.agenziaentrate.gov.it/portale/web/guest/schede/fabbricatiterreni/omi/banche-dati/quotazioni-immobiliari';
  function cpc(art) { return 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:regio.decreto:1940-10-28;1443~art' + art; }
  var F = {
    pvpFaq: { nome: 'Portale delle Vendite Pubbliche – Domande frequenti (Ministero della Giustizia)', url: 'https://pvp.giustizia.it/pvp/it/faq.page' },
    manualeOfferta: { nome: 'Ministero della Giustizia – Manuale utente per l\'invio dell\'offerta telematica (Portale dei Servizi Telematici)', url: 'https://pst.giustizia.it/PST/it/paginadettaglio.page?contentId=ACC567' },
    manualeVisita: { nome: 'Ministero della Giustizia – Manuale utente per la richiesta di visita dell\'immobile', url: 'https://pst.giustizia.it/PST/it/paginadettaglio.page?contentId=ACC565' },
    pagamenti: { nome: 'Ministero della Giustizia – Pagamenti telematici (bollo digitale) sul Portale dei Servizi Telematici', url: 'https://pst.giustizia.it/PST/it/paginadettaglio.page?contentId=ACC569' },
    dm32: { nome: 'D.M. Giustizia 26 febbraio 2015, n. 32 – regole tecniche delle vendite telematiche (Normattiva)', url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:ministero.giustizia:decreto:2015-02-26;32' },
    cc2923: { nome: 'Codice civile, art. 2923 – locazioni e pignoramento (Normattiva)', url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:regio.decreto:1942-03-16;262~art2923' },
    att63: { nome: 'Disposizioni di attuazione del codice civile, art. 63 (condominio)', url: 'https://www.brocardi.it/disposizioni-per-attuazione-del-codice-civile/capo-i/sezione-iii/art63.html' },
    aeImposte: { nome: 'Agenzia delle Entrate – "L\'acquisto di una casa: le imposte"', url: 'https://www.agenziaentrate.gov.it/portale/acquisto-di-una-casa-le-imposte' }
  };
  function fCpc(art, tema) { return { nome: 'Codice di procedura civile, art. ' + art.replace('bis', '-bis') + (tema ? ' – ' + tema : '') + ' (Normattiva)', url: cpc(art) }; }
  function fTariffa(x, nome) { return x ? { nome: nome || x.fonte, url: x.url, data: x.verificato } : null; }

  /* ---------- Guida all'asta: poche voci, solo cose certe; vale sempre l'avviso di vendita ---------- */

  var GUIDA = [
    { id: 'documenti', fase: 'Prima dell\'asta', titolo: 'Avviso, perizia e ordinanza',
      domande: ['Cosa devo leggere prima di partecipare?', 'avviso di vendita', 'perizia', 'ordinanza di vendita', 'documenti dell asta', 'cosa leggere'],
      testo: 'Ogni vendita giudiziaria è pubblicata sul Portale delle Vendite Pubbliche del Ministero della Giustizia (art. 490 c.p.c.) con l\'avviso di vendita e, di solito, l\'ordinanza del giudice e la perizia di stima. ' +
        'L\'avviso indica prezzo base, offerta minima, cauzione, rilancio minimo, termine e modalità per le offerte. ' +
        'La perizia descrive lo stato dell\'immobile, eventuali abusi edilizi, chi lo occupa, vincoli e spese condominiali: leggila tutta prima di offrire.',
      fonti: [fCpc('490', 'pubblicità sul Portale delle Vendite Pubbliche'), { nome: 'Portale delle Vendite Pubbliche (Ministero della Giustizia)', url: URL_PVP }] },
    { id: 'visita', fase: 'Prima dell\'asta', titolo: 'Visitare l\'immobile',
      domande: ['Posso visitare l\'immobile?', 'visita', 'visitare', 'vedere l immobile', 'vedere la casa', 'prenotare la visita', 'sopralluogo'],
      testo: 'Puoi chiedere di vedere l\'immobile gratis con il pulsante di prenotazione della visita nella scheda dell\'asta sul Portale delle Vendite Pubbliche. ' +
        'La richiesta arriva al custode giudiziario (o a chi la procedura ha incaricato delle visite), che ti contatta. ' +
        'La legge prevede che gli interessati possano esaminare il bene entro 15 giorni dalla richiesta fatta tramite il portale (art. 560 c.p.c.).',
      fonti: [fCpc('560', 'custodia e visita dei beni'), F.manualeVisita, F.pvpFaq] },
    { id: 'chi-puo', fase: 'Prima dell\'asta', titolo: 'Chi può partecipare',
      domande: ['Chi può partecipare a un\'asta?', 'chi puo partecipare', 'chi puo comprare', 'chi puo offrire', 'tramite avvocato', 'persona da nominare', 'debitore'],
      testo: 'Può offrire chiunque, tranne il debitore (art. 571 c.p.c.). ' +
        'Puoi offrire di persona oppure tramite un avvocato, che può anche fare l\'offerta per persona da nominare (art. 579 c.p.c.). ' +
        'Se volete comprare in più persone, l\'offerta deve indicarle tutte: le modalità sono nell\'avviso di vendita.',
      fonti: [fCpc('571', 'offerte d\'acquisto'), fCpc('579', 'persone ammesse a offrire')] },
    { id: 'costi', fase: 'Prima dell\'asta', titolo: 'Imposte e spese oltre al prezzo',
      domande: ['Quali tasse si pagano all\'asta?', 'quali tasse', 'quali imposte', 'agevolazioni prima casa all asta', 'prezzo valore', 'spese oltre al prezzo'],
      testo: 'Oltre al prezzo paghi le imposte di trasferimento: di solito registro, ipotecaria e catastale come in un acquisto da privato, oppure l\'IVA se vende un\'impresa; le agevolazioni prima casa valgono anche all\'asta se hai i requisiti. ' +
        'Se compri un\'abitazione come persona fisica puoi chiedere che le imposte si calcolino sul valore catastale (prezzo-valore), prima della registrazione del decreto di trasferimento. ' +
        'Si aggiungono le spese per trasferimento e cancellazioni (chi le paga lo dice l\'avviso) e gli eventuali arretrati condominiali. Per un conto preciso chiedimi per esempio "quanto costa in totale un\'asta da 100.000 € prima casa".',
      fonti: [F.aeImposte, { nome: 'Agenzia delle Entrate – Guida "L\'acquisto della casa: le imposte e le agevolazioni fiscali"', url: 'https://www.agenziaentrate.gov.it/portale/documents/d/guest/guida_acquisto_casa_le_imposte_e_le_agevolazioni' }] },
    { id: 'condominio', fase: 'Prima dell\'asta', titolo: 'Spese condominiali arretrate',
      domande: ['Devo pagare le spese condominiali arretrate?', 'spese condominiali', 'condominio arretrato', 'arretrati del condominio', 'debiti condominiali'],
      testo: 'Chi compra risponde, insieme al vecchio proprietario, dei contributi condominiali dell\'anno in corso e di quello precedente (art. 63 disp. att. c.c.). ' +
        'Chiedi all\'amministratore o al custode l\'importo degli arretrati prima di offrire e mettilo nel conto dei costi.',
      fonti: [F.att63] },
    { id: 'mutuo', fase: 'Prima dell\'asta', titolo: 'Comprare con un mutuo',
      domande: ['Posso comprare all\'asta con un mutuo?', 'mutuo per l asta', 'mutuo all asta', 'comprare con il mutuo', 'finanziamento per l asta', 'banca per l asta'],
      testo: 'Si può pagare il saldo con un mutuo: la banca versa la somma direttamente alla procedura e l\'ipoteca viene iscritta insieme alla trascrizione del decreto di trasferimento (art. 585 c.p.c.). ' +
        'Il termine per il saldo è breve (lo fissa l\'avviso, di solito 120 giorni dall\'aggiudicazione), quindi chiedi alla banca la valutazione del mutuo prima di fare l\'offerta.',
      fonti: [fCpc('585', 'versamento del prezzo, anche con mutuo'), fCpc('569', 'termine per il versamento del prezzo')] },
    { id: 'offerta', fase: 'L\'offerta', titolo: 'Come si presenta l\'offerta',
      domande: ['Come si presenta l\'offerta?', 'come si partecipa', 'come partecipare', 'come si fa un offerta', 'come faccio un offerta', 'offerta telematica', 'come funziona un asta', 'come funziona l asta', 'busta chiusa', 'gestore della vendita'],
      testo: 'Di solito l\'offerta si presenta online: dalla scheda dell\'asta sul Portale delle Vendite Pubbliche si passa al sito del gestore della vendita telematica e da lì al modulo di offerta del Ministero della Giustizia. ' +
        'Il modulo prepara il file dell\'offerta, che va inviato via PEC come spiega il manuale del Ministero, entro il termine indicato nell\'avviso. ' +
        'Alcune vendite ammettono anche l\'offerta cartacea in busta chiusa presso il delegato: quali modalità valgono lo dice l\'avviso di vendita.',
      fonti: [F.pvpFaq, F.manualeOfferta, F.dm32, fCpc('569', 'modalità telematiche della vendita')] },
    { id: 'requisiti', fase: 'L\'offerta', titolo: 'PEC, firma digitale e bollo',
      domande: ['Cosa serve per l\'offerta telematica?', 'firma digitale', 'pec', 'posta certificata', 'marca da bollo', 'bollo digitale', 'cosa serve per offrire'],
      testo: 'Per l\'offerta telematica servono una casella PEC e, di solito, la firma digitale: le regole tecniche prevedono anche l\'invio da una apposita "PEC per la vendita telematica" senza firma (D.M. 32/2015). ' +
        'Con l\'offerta si paga online il bollo digitale di 16 € sul Portale dei Servizi Telematici del Ministero della Giustizia, salvo esenzioni, e si versa la cauzione con bonifico. ' +
        'Tieni pronti un documento d\'identità e il codice fiscale degli offerenti da allegare.',
      fonti: [F.dm32, F.manualeOfferta, F.pagamenti] },
    { id: 'cauzione', fase: 'L\'offerta', titolo: 'La cauzione',
      domande: ['Come funziona la cauzione?', 'cauzione', 'deposito cauzionale', 'quanto devo versare', 'bonifico della cauzione'],
      testo: 'Con l\'offerta versi una cauzione non inferiore al 10% del prezzo che offri (art. 571 c.p.c.): importo esatto e conto per il bonifico sono nell\'avviso. ' +
        'Di solito il bonifico deve risultare accreditato entro il termine per le offerte: verifica l\'avviso e fallo con qualche giorno di anticipo. ' +
        'Se non vinci la cauzione ti viene restituita; se vinci vale come acconto sul prezzo; se poi non paghi il saldo la perdi (art. 587 c.p.c.).',
      fonti: [fCpc('571', 'cauzione non inferiore a un decimo'), fCpc('587', 'decadenza dell\'aggiudicatario')] },
    { id: 'offerta-minima', fase: 'L\'offerta', titolo: 'Prezzo base e offerta minima',
      domande: ['Quanto posso offrire meno del prezzo base?', 'offerta minima', 'prezzo base', 'meno del prezzo base', 'sotto il prezzo base', 'ribasso del 25'],
      testo: 'L\'offerta è valida anche sotto il prezzo base, purché non oltre un quarto in meno: l\'offerta minima è il 75% del prezzo base (art. 571 c.p.c.). ' +
        'Se c\'è una sola offerta pari o superiore al prezzo base viene accolta; se è tra l\'offerta minima e il prezzo base il giudice o il delegato possono non aggiudicare se ritengono probabile un prezzo migliore con una nuova vendita o se ci sono istanze di assegnazione (art. 572 c.p.c.).',
      fonti: [fCpc('571', 'offerta minima'), fCpc('572', 'deliberazione sull\'offerta')] },
    { id: 'irrevocabile', fase: 'L\'offerta', titolo: 'L\'offerta non si può ritirare',
      domande: ['Posso ritirare l\'offerta?', 'ritirare l offerta', 'irrevocabile', 'cambiare idea', 'annullare l offerta'],
      testo: 'Una volta presentata, l\'offerta è irrevocabile (art. 571 c.p.c.), salvo i casi previsti dalla legge, per esempio se non è stata accolta entro 120 giorni dalla presentazione. ' +
        'Se la tua è l\'unica offerta valida, di solito l\'immobile ti viene aggiudicato anche se il giorno dell\'asta non sei collegato o presente: verifica l\'avviso di vendita.',
      fonti: [fCpc('571', 'irrevocabilità dell\'offerta'), fCpc('572', 'unica offerta')] },
    { id: 'gara', fase: 'La gara', titolo: 'La gara tra più offerenti',
      domande: ['Cosa succede se ci sono più offerte?', 'gara', 'piu offerte', 'piu offerenti', 'rilancio', 'rilanci', 'asincrona', 'sincrona'],
      testo: 'Se ci sono più offerte valide, il giudice o il delegato apre una gara tra gli offerenti sull\'offerta più alta (art. 573 c.p.c.); ogni rilancio deve essere almeno pari al rilancio minimo indicato nell\'avviso. ' +
        'Nelle vendite telematiche la gara può essere sincrona (tutti collegati nello stesso momento), asincrona (rilanci online in un periodo stabilito) o mista (D.M. 32/2015). ' +
        'Se nessuno rilancia vince la migliore offerta, valutando prezzo, cauzione e tempi di pagamento (art. 573 c.p.c.).',
      fonti: [fCpc('573', 'gara tra gli offerenti'), F.dm32] },
    { id: 'saldo', fase: 'Dopo l\'aggiudicazione', titolo: 'Il saldo del prezzo',
      domande: ['Entro quando devo pagare il saldo?', 'saldo', 'saldo prezzo', 'pagare il resto', 'dopo l aggiudicazione', 'ho vinto l asta', 'se vinco', 'aggiudicazione', 'fondo spese'],
      testo: 'Se vinci devi versare il resto del prezzo, tolta la cauzione, entro il termine fissato nell\'avviso: di solito 120 giorni dall\'aggiudicazione (artt. 569 e 585 c.p.c.). ' +
        'Insieme al saldo il delegato chiede di solito un fondo per le imposte e le spese di trasferimento. ' +
        'Se non paghi in tempo il giudice dichiara la decadenza e perdi la cauzione (art. 587 c.p.c.).',
      fonti: [fCpc('569', 'termine per il versamento'), fCpc('585', 'versamento del prezzo'), fCpc('587', 'decadenza dell\'aggiudicatario')] },
    { id: 'decreto', fase: 'Saldo e decreto', titolo: 'Il decreto di trasferimento',
      domande: ['Quando divento proprietario?', 'decreto di trasferimento', 'quando divento proprietario', 'ipoteche', 'ipoteca', 'pignoramento', 'cancellazione', 'trascrizione'],
      testo: 'Diventi proprietario con il decreto di trasferimento che il giudice emette dopo il saldo, non con l\'aggiudicazione (art. 586 c.p.c.). ' +
        'Il decreto ordina la cancellazione delle ipoteche e dei pignoramenti; non cancella invece servitù, vincoli e gli altri pesi che la perizia indica come non cancellabili. ' +
        'Registrazione, trascrizione e cancellazioni le cura di solito il delegato (art. 591-bis c.p.c.): chi paga le spese di cancellazione lo dice l\'avviso.',
      fonti: [fCpc('586', 'decreto di trasferimento'), fCpc('591bis', 'compiti del delegato')] },
    { id: 'liberazione', fase: 'Liberazione', titolo: 'Se l\'immobile è occupato',
      domande: ['Chi libera l\'immobile se è occupato?', 'liberazione', 'liberare l immobile', 'occupato', 'occupante', 'inquilino', 'sfratto', 'custode'],
      testo: 'Se l\'immobile è occupato dal debitore o da chi non ha un titolo valido, la liberazione la cura il custode giudiziario su ordine del giudice (art. 560 c.p.c.), senza che tu debba avviare una causa: chiedi al custode tempi e modalità. ' +
        'Un contratto d\'affitto con data certa anteriore al pignoramento è invece opponibile: l\'inquilino può restare fino alla scadenza e il canone spetta a te (art. 2923 c.c.). ' +
        'Leggi in perizia e nell\'avviso chi occupa l\'immobile e a che titolo.',
      fonti: [fCpc('560', 'liberazione dell\'immobile'), F.cc2923] }
  ];
  var AVVISO_GUIDA = 'Le regole della singola vendita sono nell\'avviso di vendita e nell\'ordinanza del giudice: se qualcosa è diverso da quanto scritto qui, vale l\'avviso.';

  var ESEMPI = [
    'Appartamenti a Bari sotto 150.000 €, solo liberi',
    'Buoni affari in Lombardia entro novembre',
    'Quali sono gli affari di oggi?',
    'Quanto costa in totale un\'asta da 100.000 € come prima casa?',
    'Rata per 120.000 € in 25 anni al 3,5%',
    'Quanto posso spendere con 2.000 € di stipendio e 30.000 € di risparmi al 3% in 30 anni?',
    'Affitto 600 € al mese su 100.000 €: che rendimento?',
    'Come funziona la cauzione?'
  ];

  /* ---------- Parole: tipi di immobile, categorie, regole ---------- */

  var CONCETTI = {
    appartamento: { re: /\b(appartament\w*|bilocal\w*|trilocal\w*|quadrilocal\w*|monolocal\w*|attic[oi]|mansard\w*|alloggi\w*)\b/, testo: 'appartament', nomi: ['appartamento', 'appartamenti'] },
    villa: { re: /\b(vill[ae]|villett[ae]|villin[oi])\b/, testo: 'villa', nomi: ['villa', 'ville'], femminile: true },
    casa: { re: /\b(cas[ae]|abitazion[ei]|residenzial[ei])\b/, tipo: /residenzial/i, testo: 'residenziale', nomi: ['casa', 'case'], femminile: true },
    box: { re: /\b(box|garage|autorimess[ae]|posti? auto)\b/, testo: 'box', nomi: ['box o garage', 'box e garage'] },
    terreno: { re: /\b(terren[oi]|appezzament[oi])\b/, testo: 'terren', nomi: ['terreno', 'terreni'] },
    negozio: { re: /\b(negoz[io]|locali? commercial[ei]|botteg[ah]e?)\b/, testo: 'negozi', nomi: ['negozio', 'negozi'] },
    capannone: { re: /\bcapannon[ei]\b/, testo: 'capannon', nomi: ['capannone', 'capannoni'] },
    magazzino: { re: /\b(magazzin[oi]|deposit[oi])\b/, testo: 'magazzin', nomi: ['magazzino', 'magazzini'] },
    ufficio: { re: /\buffic[io]\b/, testo: 'uffic', nomi: ['ufficio', 'uffici'] },
    rustico: { re: /\b(rustic[oi]|casal[ei]|cascin[ae]|masseri[ae]|casolar[ei])\b/, testo: 'rustic', nomi: ['rustico o casale', 'rustici e casali'] },
    commerciale: { re: /\bcommercial[ei]\b/, tipo: /commercial/i, testo: 'commerciale', nomi: ['immobile commerciale', 'immobili commerciali'] },
    industriale: { re: /\bindustrial[ei]\b/, tipo: /industrial/i, testo: 'industriale', nomi: ['immobile industriale', 'immobili industriali'] }
  };
  var ORDINE_CONCETTI = ['appartamento', 'villa', 'box', 'terreno', 'negozio', 'capannone', 'magazzino', 'ufficio', 'rustico', 'commerciale', 'industriale', 'casa'];
  var NON_ABITATIVI = ['box', 'negozio', 'capannone', 'magazzino', 'ufficio', 'commerciale', 'industriale'];
  var CATEGORIE = {
    auto: /\b(auto|automobil[ei]|autovettur[ae]|macchin[ae]|veicol[oi]|furgon[ei]|camion|autocarr[oi]|suv)\b/,
    moto: /\b(moto|motocicl\w*|scooter|motorin[oi]|ciclomotor\w*)\b/,
    beni: /\b(beni mobili|macchinari|attrezzatur\w*|arred\w*|gioiell\w*|orolog\w*|opere d arte|merci|imbarcazion\w*|barc[ah]e?)\b/,
    immobile: /\b(immobil[ei]|immobiliar[ei])\b/
  };
  var NOMI_CATEGORIA = { immobile: 'immobili', auto: 'auto', moto: 'moto', beni: 'beni mobili' };
  var STATI = { libero: 'libero', occupato: 'occupato', nd: 'non indicato' };
  var ETICHETTE_VALORE = {
    perizia: 'Stima del perito indicata nell\'avviso (PVP)',
    'primo-prezzo': 'Prezzo base della prima asta, che di norma coincide con la stima del perito',
    'prima-asta': 'È la prima asta: il prezzo base di norma coincide con la stima del perito',
    omi: 'Quotazioni OMI della zona (Agenzia delle Entrate – OMI) per la superficie indicata',
    'omi-comune': 'Quotazioni OMI tipiche del comune (zona OMI non riconosciuta dall\'indirizzo) per la superficie indicata'
  };
  var RISCHI_RISERVA = { abusi: 'Abusi o difformità edilizie', quota: 'Si vende solo una quota o un diritto parziale', superficie: 'Diritto di superficie',
    condominio: 'Spese condominiali arretrate', vincoli: 'Vincoli, servitù o edilizia convenzionata', degrado: 'Immobile al grezzo, inagibile o degradato',
    occupazione: 'Occupato o locato', agricolo: 'Terreno agricolo o fabbricato rurale', chiavi: 'Veicolo senza chiavi', documenti: 'Veicolo senza documenti',
    marcia: 'Non marciante, incidentato o da rottamare' };
  function etichettaRischio(k) {
    var E = modulo('Estrai');
    var r = E && E.RISCHI ? E.RISCHI.filter(function (x) { return x.chiave === k; })[0] : null;
    return r ? r.etichetta : RISCHI_RISERVA[k] || k;
  }

  /* ---------- Luoghi ---------- */

  // nomi di comuni che sono anche parole comuni: valgono solo con "a", "in", "comune di"... (es. "a Rende", non "quanto rende")
  var PAROLE_COMUNI = ('fondi fonte posta paese opera norma quadri zone viale trovo vinci rende cento trenta quarto terzo nove sale rosa rose rossa lana noci pero erba ' +
    'arco nave cave ala mira toro mori malo dolo rive patti serre segni grado grosso massa fermo prato como noto naso bella dolce bianco bianchi colonna canale ' +
    'camino chiusa chiusi chiari maglie noli taverna cascina vasto calci calco candida cicala mele mango momo pizzo preci rea signa sospiro susa uscio vicoli visco ' +
    'volla tortora ceto dello diso fallo bomba bono grotte limina monta popoli russi riposto spinete stilo urbana lauro marche oggi asta aste').split(' ');
  var PREPOSIZIONI = ['a', 'ad', 'in', 'presso', 'zona', 'verso'];
  var ALIAS_COMUNI = { 'reggio emilia': 'Reggio nell\'Emilia', 'reggio nell emilia': 'Reggio nell\'Emilia', 'reggio calabria': 'Reggio di Calabria',
    'laquila': 'L\'Aquila', 'forli': 'Forlì', 'cantu': 'Cantù' };
  var ALIAS_PROVINCE = { 'pesaro urbino': 'PU', 'monza brianza': 'MB', 'massa carrara': 'MS', 'bat': 'BT', 'vco': 'VB', 'alto adige': 'BZ', 'sudtirolo': 'BZ', 'laquila': 'AQ' };
  var ALIAS_REGIONI = { 'emilia': 'Emilia-Romagna', 'romagna': 'Emilia-Romagna', 'friuli': 'Friuli-Venezia Giulia', 'trentino': 'Trentino-Alto Adige',
    'val d aosta': 'Valle d\'Aosta', 'valle aosta': 'Valle d\'Aosta', 'puglie': 'Puglia', 'abruzzi': 'Abruzzo' };

  var cacheLuoghi = { aste: null, n: -1, indice: null };
  function indiceLuoghi(aste) {
    aste = aste || [];
    if (cacheLuoghi.aste === aste && cacheLuoghi.n === aste.length) return cacheLuoghi.indice;
    var G = modulo('GEO') || { regioni: [], province: {} };
    var mappa = {}, maxParole = 1, perNome = {};
    function aggiungi(chiave, voce) {
      chiave = piatto(chiave); if (!chiave) return;
      var l = mappa[chiave] || (mappa[chiave] = []);
      if (l.indexOf(voce) < 0) l.push(voce);
      maxParole = Math.max(maxParole, chiave.split(' ').length);
    }
    var com = {};
    aste.forEach(function (a) {
      if (!a.comune) return;
      var k = a.comune + '|' + (a.provincia || '');
      var c = com[k] || (com[k] = { tipo: 'comune', nome: a.comune, provincia: a.provincia || '', regione: a.regione || '', n: 0 });
      c.n++;
    });
    Object.keys(com).forEach(function (k) { aggiungi(com[k].nome, com[k]); (perNome[com[k].nome] = perNome[com[k].nome] || []).push(com[k]); });
    Object.keys(ALIAS_COMUNI).forEach(function (al) { (perNome[ALIAS_COMUNI[al]] || []).forEach(function (c) { aggiungi(al, c); }); });
    var prov = {};
    Object.keys(G.province).forEach(function (s) {
      var p = G.province[s], v = { tipo: 'provincia', sigla: s, nome: p.nome, regione: p.regione };
      prov[s] = v; aggiungi(p.nome, v);
    });
    Object.keys(ALIAS_PROVINCE).forEach(function (al) { if (prov[ALIAS_PROVINCE[al]]) aggiungi(al, prov[ALIAS_PROVINCE[al]]); });
    var reg = {};
    G.regioni.forEach(function (r) { reg[r] = { tipo: 'regione', nome: r }; aggiungi(r, reg[r]); });
    Object.keys(ALIAS_REGIONI).forEach(function (al) { if (reg[ALIAS_REGIONI[al]]) aggiungi(al, reg[ALIAS_REGIONI[al]]); });
    var ind = { mappa: mappa, maxParole: Math.min(maxParole, 7), province: prov, regioni: reg };
    cacheLuoghi = { aste: aste, n: aste.length, indice: ind };
    return ind;
  }

  /* Luogo nel testo: comune, provincia o regione. "Bari" è sia comune sia provincia: vince il comune se ha aste,
   * "provincia di Bari" o "Bari e provincia" vuol dire la provincia. Restituisce anche le parole usate (da togliere). */
  function trovaLuoghi(testoGrezzo, w, ind) {
    var parole = w.split(' '), trovati = [];
    var siglaTesto = null, ms = String(testoGrezzo).match(/\(([A-Za-z]{2})\)|\bprov(?:incia|\.)?\s+(?:di\s+)?([A-Z]{2})\b/);
    if (ms) { var sg = (ms[1] || ms[2]).toUpperCase(); if (ind.province[sg]) siglaTesto = sg; }
    for (var i = 0; i < parole.length; i++) {
      for (var len = Math.min(ind.maxParole, parole.length - i); len >= 1; len--) {
        var chiave = parole.slice(i, i + len).join(' '), voci = ind.mappa[chiave];
        if (!voci) continue;
        var prima = parole[i - 1] || '', prima2 = parole.slice(Math.max(0, i - 2), i).join(' '), dopo = parole.slice(i + len, i + len + 2).join(' ');
        var conPreposizione = PREPOSIZIONI.indexOf(prima) >= 0 || /\b(comune|provincia|regione|prov) (di|del|della)$/.test(prima2) || prima === 'nelle' || prima === 'nella';
        var comune = len === 1 && (PAROLE_COMUNI.indexOf(chiave) >= 0 || chiave.length <= 3);
        if (comune && !conPreposizione) continue;
        if (chiave === 'marche' && /^(da bollo|di)/.test(dopo)) continue;
        if (/^(mila|anni|giorni|mq|euro|per cento)/.test(dopo) && len === 1) continue;
        var vuoleProvincia = /\b(provincia|prov)( di| del| della)?$/.test(prima2) || /^(e provincia|provincia)\b/.test(dopo);
        var vuoleRegione = /\bregione$/.test(prima) || /\bregione (di|del|della)$/.test(prima2);
        var c = voci.filter(function (v) { return v.tipo === 'comune'; }), p = voci.filter(function (v) { return v.tipo === 'provincia'; }),
          r = voci.filter(function (v) { return v.tipo === 'regione'; });
        var scelta = null;
        if (vuoleRegione && r.length) scelta = r[0];
        else if (vuoleProvincia && p.length) scelta = p[0];
        else if (c.length) {
          var nelProv = siglaTesto ? c.filter(function (x) { return x.provincia === siglaTesto; }) : [];
          scelta = (nelProv.length ? nelProv : c).slice().sort(function (x, y) { return y.n - x.n; })[0];
        } else if (p.length) scelta = p[0];
        else if (r.length) scelta = r[0];
        if (!scelta) continue;
        trovati.push({ voce: scelta, i: i, len: len + (vuoleProvincia && /^(e provincia|provincia)\b/.test(dopo) ? (/^e /.test(dopo) ? 2 : 1) : 0) });
        i += len - 1;
        break;
      }
    }
    if (!trovati.length && siglaTesto) trovati.push({ voce: ind.province[siglaTesto], i: -1, len: 0 });
    return trovati;
  }

  function luogoDa(voce) {
    if (!voce) return {};
    if (voce.tipo === 'comune') return { comune: voce.nome, provincia: voce.provincia, regione: voce.regione };
    if (voce.tipo === 'provincia') return { provincia: voce.sigla, regione: voce.regione };
    return { regione: voce.nome };
  }
  function nomeLuogo(p) {
    var G = modulo('GEO') || { province: {} };
    if (p.comune) return 'a ' + p.comune + (p.provincia ? ' (' + p.provincia + ')' : '');
    if (p.provincia) return 'in provincia di ' + (G.province[p.provincia] ? G.province[p.provincia].nome : p.provincia);
    if (p.regione) return (p.regione === 'Marche' ? 'nelle ' : 'in ') + p.regione;
    return '';
  }

  /* ---------- Date ---------- */

  var MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  var RE_MESE = '(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)';
  var NUMERI_PAROLA = { un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, quindici: 15, venti: 20,
    venticinque: 25, trenta: 30, quaranta: 40, sessanta: 60, novanta: 90 };
  var RE_QUANTI = '(\\d+|un|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|quindici|venti|trenta|sessanta|novanta)';
  function quanti(s) { return /^\d+$/.test(s) ? +s : NUMERI_PAROLA[s] || 0; }

  function annoDelMese(m, anno, oggi) {
    if (anno) return +anno;
    var y = +oggi.slice(0, 4), mm = +oggi.slice(5, 7);
    return m < mm ? y + 1 : y;
  }
  function dataValida(y, m, d) {
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    if (y < 100) y += 2000;
    var s = y + '-' + due(m) + '-' + due(d);
    return fineMese(y, m) >= s ? s : null;
  }

  /* periodo dell'asta: { dal, al, entroGiorni, oggi (solo "oggi"), spazi: [[i, j]] da non leggere come importi } */
  function leggiDate(n, oggi) {
    var out = { dal: null, al: null, entroGiorni: null, oggi: false, spazi: [] }, m;
    function segna(mm) { out.spazi.push([mm.index, mm.index + mm[0].length]); }
    function primoDi(y, mese) { var d = y + '-' + due(mese) + '-01'; return d < oggi ? oggi : d; }
    if ((m = n.match(new RegExp('\\b(?:entro|fino) (?:al |il |l )?(\\d{1,2}) ' + RE_MESE + '(?: (\\d{4}))?')))) {
      var me = MESI.indexOf(m[2]) + 1; out.al = dataValida(annoDelMese(me, m[3], oggi), me, +m[1]); segna(m);
    } else if ((m = n.match(new RegExp('\\b(?:dal|a partire dal) (\\d{1,2}) ' + RE_MESE + '(?: (\\d{4}))?')))) {
      var md = MESI.indexOf(m[2]) + 1; out.dal = dataValida(annoDelMese(md, m[3], oggi), md, +m[1]); segna(m);
    } else if ((m = n.match(new RegExp('\\b(?:il|del|per il) (\\d{1,2}) ' + RE_MESE + '(?: (\\d{4}))?')))) {
      var mg = MESI.indexOf(m[2]) + 1; out.dal = out.al = dataValida(annoDelMese(mg, m[3], oggi), mg, +m[1]); segna(m);
    } else if ((m = n.match(new RegExp('\\bentro (?:la )?(?:fine )?(?:di |del mese di )?' + RE_MESE + '(?: (\\d{4}))?')))) {
      var mf = MESI.indexOf(m[1]) + 1; out.al = fineMese(annoDelMese(mf, m[2], oggi), mf); segna(m);
    } else if ((m = n.match(new RegExp('\\b(?:a|ad|in|di|nel|per|durante|tutto|nel mese di|il mese di) ' + RE_MESE + '(?: (\\d{4}))?')))) {
      var mi = MESI.indexOf(m[1]) + 1, yi = annoDelMese(mi, m[2], oggi);
      out.dal = primoDi(yi, mi); out.al = fineMese(yi, mi); segna(m);
    }
    var y = +oggi.slice(0, 4), mo = +oggi.slice(5, 7);
    if (!out.al) {
      if ((m = n.match(/\b(?:entro (?:la )?fine (?:del )?mese|questo mese|entro il mese|entro fine mese)\b/))) { out.al = fineMese(y, mo); segna(m); }
      else if ((m = n.match(/\b(?:il |a |nel )?(?:mese prossimo|prossimo mese)\b/)) && !/\bnel prossimo mese\b/.test(n)) {
        var ny = mo === 12 ? y + 1 : y, nm = mo === 12 ? 1 : mo + 1; out.dal = ny + '-' + due(nm) + '-01'; out.al = fineMese(ny, nm); segna(m);
      } else if ((m = n.match(new RegExp('\\b(?:nei |nelle |nel )?prossim[ieo] ' + RE_QUANTI + ' (giorni|settimane|mesi)\\b|\\b(?:entro|tra|fra) ' + RE_QUANTI + ' (giorni|giorno|settimane|settimana|mesi|mese)\\b')))) {
        var q = quanti(m[1] || m[3]), u = m[2] || m[4];
        out.al = /^mes/.test(u) ? piuMesi(oggi, q) : piu(oggi, /^settiman/.test(u) ? q * 7 : q); segna(m);
      } else if ((m = n.match(/\bnel prossimo mese\b|\bentro un mese\b/))) { out.al = piuMesi(oggi, 1); segna(m); }
      else if ((m = n.match(/\b(?:questa settimana|entro (?:la )?fine (?:della )?settimana|entro domenica)\b/))) {
        var gs = new Date(oggi + 'T12:00:00Z').getUTCDay(); out.al = piu(oggi, (7 - gs) % 7); segna(m);
      } else if ((m = n.match(/\b(?:la )?settimana prossima\b|\bprossima settimana\b/))) {
        var g2 = new Date(oggi + 'T12:00:00Z').getUTCDay(), lun = piu(oggi, ((8 - g2) % 7) || 7); out.dal = lun; out.al = piu(lun, 6); segna(m);
      } else if ((m = n.match(/\bdopodomani\b/))) { out.dal = out.al = piu(oggi, 2); segna(m); }
      else if ((m = n.match(/\bdomani\b/))) { out.dal = out.al = piu(oggi, 1); segna(m); }
      else if ((m = n.match(/\b(?:entro (?:la )?fine (?:dell')?anno|entro l'anno|quest'anno)\b/))) { out.al = y + '-12-31'; segna(m); }
      else if ((m = n.match(/\b(?:entro il|nel) (20\d\d)\b/))) { out.al = m[1] + '-12-31'; if (/^nel/.test(m[0]) && m[1] > oggi.slice(0, 4)) out.dal = m[1] + '-01-01'; segna(m); }
      else if ((m = n.match(/\b(?:entro (?:il )?|fino al |entro l')(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/))) { out.al = dataValida(m[3] ? +m[3] : annoDelMese(+m[2], null, oggi), +m[2], +m[1]); segna(m); }
      else if ((m = n.match(/\b(?:dal )(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/))) { out.dal = dataValida(m[3] ? +m[3] : annoDelMese(+m[2], null, oggi), +m[2], +m[1]); segna(m); }
    }
    if (!out.dal && !out.al && (m = n.match(/\b(?:di |per |con asta |asta )?oggi\b/))) { out.oggi = true; }
    // date scritte in cifre o con il mese: non sono importi
    var re = new RegExp('\\b\\d{1,2}[\\/.-]\\d{1,2}[\\/.-]\\d{2,4}\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b|\\b\\d{1,2} ' + RE_MESE + '|' + RE_MESE + ' \\d{4}\\b', 'g');
    while ((m = re.exec(n))) segna(m);
    if (out.al && out.al < oggi) out.al = null;
    if (out.al) out.entroGiorni = giorniTra(oggi, out.al);
    return out;
  }

  /* ---------- Numeri e importi ---------- */

  function maschera(s, spazi) {
    var a = s.split('');
    spazi.forEach(function (sp) { for (var k = sp[0]; k < sp[1] && k < a.length; k++) a[k] = ' '; });
    return a.join('');
  }
  function valoreCifre(s) {
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return parseFloat(s.replace(/\./g, '').replace(',', '.'));
    if (/^\d+,\d+$/.test(s)) return parseFloat(s.replace(',', '.'));
    return parseFloat(s);
  }
  var RE_NUMERO = /(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)(\s*(?:mila|mln|milioni|milione|k)(?![a-z]))?(\s*(?:€|euro|eur)(?![a-z0-9]))?/g;
  var UNITA = [
    ['pct', /^\s*(%|per ?cento\b)/], ['anni', /^\s*ann[oi]\b/], ['mesi', /^\s*mes[ei]\b/], ['giorni', /^\s*(giorni|giorno|gg)\b/],
    ['settimane', /^\s*settiman[ae]\b/], ['mq', /^\s*(mq|m2|m²|metri quadr\w*|metri\b|mt\b)/], ['kw', /^\s*(kw|kilowatt)\b/], ['cv', /^\s*cv\b/],
    ['ordinale', /^\s*(°|º|esim[oa]\b)/], ['rate', /^\s*rate\b/]
  ];

  /* tutti i numeri: { v, i, j, unita: 'euro'|'pct'|'anni'|...|null, periodo: 'mese'|'anno'|null, prima, dopo } */
  function numeri(n) {
    var out = [], m;
    RE_NUMERO.lastIndex = 0;
    while ((m = RE_NUMERO.exec(n))) {
      var i = m.index, j = i + m[0].length;
      if (i > 0 && /[a-z0-9]/.test(n.charAt(i - 1))) continue;
      var v = valoreCifre(m[1]), mult = (m[2] || '').trim(), valuta = !!m[3] || /€\s*$/.test(n.slice(Math.max(0, i - 3), i));
      if (mult === 'mila' || mult === 'k') v *= 1000; else if (mult) v *= 1000000;
      var dopo = n.slice(j, j + 40), prima = n.slice(Math.max(0, i - 40), i).replace(/€\s*$/, '');
      var unita = null;
      if (valuta || mult) unita = 'euro';
      else for (var k = 0; k < UNITA.length; k++) if (UNITA[k][1].test(dopo)) { unita = UNITA[k][0]; break; }
      var periodo = null;
      if (/^\s*(?:€|euro)?\s*(?:netti\s+)?(?:al mese|mensil\w*|\/\s*mese|a mese|ogni mese)/.test(dopo) || /\b(mensil\w*|al mese)\s*(?:di|da)?\s*$/.test(prima)) periodo = 'mese';
      else if (/^\s*(?:€|euro)?\s*(?:all'anno|l'anno|annu\w*|\/\s*anno|ogni anno|annui)/.test(dopo)) periodo = 'anno';
      out.push({ v: v, i: i, j: j, unita: unita, mult: !!mult, valuta: valuta, periodo: periodo, prima: prima, dopo: dopo, testo: m[0] });
    }
    // "tra 50 e 80 mila": il "mila" vale anche per il primo numero
    for (var a = 0; a + 1 < out.length; a++) {
      var x = out[a], y = out[a + 1], mezzo = n.slice(x.j, y.i);
      if (/^\s*(e|ed|a|-)\s*(i\s*)?$/.test(mezzo) && (/(tra|fra|da|dai)\s*(i\s*)?$/.test(x.prima) || /^\s*-\s*$/.test(mezzo))) {
        x.coppia = y; y.coppiaDi = x;
        if (!x.unita && y.unita === 'euro') {
          x.unita = 'euro';
          if (y.mult && !x.mult) { var f = /mila|k/.test(y.testo) ? 1000 : 1000000; if (x.v * f <= y.v * 1.0001 || x.v < y.v / f) x.v *= f; }
        }
      }
    }
    return out;
  }

  // ruolo di un importo dalle parole vicine ("2.000 € di stipendio", "risparmi di 30.000", "affitto 600", "su 100.000")
  var RUOLI = [
    ['stipendio', /(stipendio|reddito|entrate|guadagn\w*|netto mensile|busta paga)/], ['risparmi', /(risparmi\w*|anticipo|da parte|liquidit\w*|contanti|ho messo via)/],
    ['altreRate', /(altre rate|altra rata|gia una rata|rata gia|finanziament\w* in corso|prestit\w* in corso)/], ['lavori', /(lavori|ristruttura\w*)/],
    ['condominio', /(condomini\w*|arretrat\w*)/], ['imu', /\b(imu|tasse annue)\b/], ['canone', /(canone|affitt\w*|locazione|pigione)/],
    ['spese', /(spese|costi annui|costi all'anno|manutenzione)/], ['rendita', /(rendita catastale)/], ['valore', /(valore|vale|valgono|stima\w*|perizia|valutat\w*)/],
    ['offerta', /(offr\w*|offerta|rilancio|aggiudicat\w*)/], ['base', /(prezzo base|base d'asta|base d asta|base|asta da|all'asta da|asta di)/],
    ['mutuo', /(mutuo|finanziament\w*|prestito|capitale|rata per|rata di un|rata su)/], ['prezzo', /(\bsu\b|prezzo|pagat\w*|pago|costo|costa|comprat\w*|acquist\w*|investiment\w*|investo|spendo)/]
  ];
  function ruolo(x) {
    var d = x.dopo.replace(/^\s*(?:€|euro)?\s*(?:netti\s+)?(?:al mese\s+|mensili\s+|all'anno\s+|annui\s+)?/, '');
    var md = d.match(/^(?:di|de[il]|d'|per|come|in)\s*(\w+(?: \w+)?)/);
    if (md) for (var k = 0; k < RUOLI.length; k++) if (RUOLI[k][1].test(md[1]) && RUOLI[k][0] !== 'prezzo' && RUOLI[k][0] !== 'base') return RUOLI[k][0];
    var p = x.prima.replace(/\s+$/, '');
    var coda = p.split(/[,;:?!]|\be\b|\bed\b|\bcon\b|\bpiu\b/).pop();
    var migliore = null, pos = -1;
    for (var r = 0; r < RUOLI.length; r++) {
      var re = new RegExp(RUOLI[r][1].source, 'g'), mm;
      while ((mm = re.exec(coda))) if (mm.index >= pos) { pos = mm.index; migliore = RUOLI[r][0]; }
    }
    return migliore;
  }

  // importi in euro: valuta/mila esplicita, oppure numeri senza unità ≥ 1.000, oppure piccoli con una parola di soldi accanto
  function importi(nums) {
    return nums.filter(function (x) {
      if (x.unita === 'euro') return true;
      if (x.unita) return false;
      var r = ruolo(x);
      if (x.v >= 1000) return true;
      return r && ['stipendio', 'risparmi', 'altreRate', 'canone', 'spese', 'condominio', 'imu', 'lavori', 'rendita'].indexOf(r) >= 0;
    }).map(function (x) { x.ruolo = ruolo(x); return x; });
  }

  function limitiPrezzo(lista) {
    var out = { min: null, max: null };
    lista.forEach(function (x) {
      if (x.coppiaDi) return;
      if (x.coppia) { out.min = Math.min(x.v, x.coppia.v); out.max = Math.max(x.v, x.coppia.v); return; }
      var p = x.prima;
      if (/(sopra|oltre|piu di|almeno|minimo|min|a partire da|superiore a|dai)\s*(?:i|ai|a|di|il|l'|dei)?\s*$/.test(p)) out.min = x.v;
      else out.max = x.v;  // "sotto i", "fino a", "massimo", "budget di", "da 100 mila" e importo senza parole: è il tetto
    });
    return out;
  }

  /* ---------- Capire la domanda ---------- */

  function idDa(testo, ctx) {
    var s = String(testo), m = s.match(/\bpvp[-\s]?(\d{4,})\b/i);
    if (m) return 'pvp-' + m[1];
    m = s.match(/\b(?:asta|lotto|annuncio|inserzione|id)\s*(?:n\.?|n°|nr\.?|numero)?\s*(\d{5,})\b/i);
    if (m) return 'pvp-' + m[1];
    m = s.match(/\b(dem-[A-Za-z0-9-]{6,}|m[a-z0-9]{9,})\b/);
    if (m && ctx && trovaAsta(m[1], ctx.aste)) return m[1];
    m = s.match(/(?:^|\s)(\d{6,8})(?:\s|$|[?.!])/);
    if (m && ctx && trovaAsta('pvp-' + m[1], ctx.aste)) return 'pvp-' + m[1];
    return null;
  }
  var cacheId = { aste: null, n: -1, indice: null };
  function trovaAsta(id, aste) {
    if (!id || !aste) return null;
    if (cacheId.aste !== aste || cacheId.n !== aste.length) {
      var ind = {}; aste.forEach(function (a) { if (a && a.id) ind[a.id] = a; });
      cacheId = { aste: aste, n: aste.length, indice: ind };
    }
    return cacheId.indice[id] || null;
  }

  var RE = {
    saluto: /^\s*(ciao|salve|buongiorno|buonasera|buon pomeriggio|hey|ehi|ehila|hello|hi|buondi)\b/,
    grazie: /\b(grazie|ti ringrazio)\b/,
    aiuto: /\b(aiuto|help|cosa (sai|puoi) fare|che cosa (sai|puoi) fare|cosa fai|come funzioni|chi sei|che domande|esempi|istruzioni|come ti uso)\b/,
    mutuo: /\b(mutu[oi]|rata|finanziament\w*|stipendio|reddito|prestito|quanto posso spendere|posso permettermi|quanto posso permettermi|budget massimo)\b/,
    budget: /\b(quanto posso (spendere|permettermi|comprare|offrire)|posso permettermi|che prezzo posso|budget massimo|fino a quanto posso)\b|\bstipendio\b|\breddito\b/,
    rendimento: /\b(rendimento|rendimenti|rendita|rende|rendono|redditivita|resa|affitto|affittare|affittarl[oa]|canone|locazione|cedolare)\b/,
    costi: /\b(cost[oaie]|costano|quanto (si )?spende|quanto spendo|spese|tass[ae]|impost[ae]|totale|prima casa|seconda casa|notaio|registro|iva|conviene|passaggio di proprieta)\b/,
    affari: /\b(affari|affare|occasioni|occasione|cacciatore)\b/,
    ottimi: /\b(ottim[ioae] (affar[ei]|occasion[ei])|affar[ei] ottim\w*|super affar[ei]|affaroni|affarone)\b/,
    oggi: /\b(oggi|del giorno|di giornata|odiern\w*)\b/,
    cerca: /\b(cerc\w*|trov\w*|mostra\w*|fammi vedere|ci sono|elenco|lista|quali aste|aste|asta|vendite|in vendita|comprare|acquistare|compro)\b/,
    libere: /\b(liber[oaie]|non occupat\w*|sgombr\w*|disponibil\w* subito)\b/,
    occupate: /\b(anche|pure) (occupat\w*|non liber\w*)\b|\b(qualsiasi|ogni) stato\b|\bnon solo liber\w*\b|\banche se occupat\w*\b/,
    domanda: /\b(come|cos e|cosa e|cosa sono|che cos|chi|quando|perche|posso|devo|serve|servono|bisogna|funziona|cosa succede|si puo|e possibile|entro quando|quanto tempo|cosa devo)\b/,
    seguito: /^\s*(e|ed|e se|e invece|invece|anche|solo|soltanto|ma|pero|allora|mentre|e per|e con|e nel|e in|e a|e al|e su|e tra|e sotto|e sopra|e fino|e senza|se fosse|e da|e di)\b/,
    dopo: /^\s*(e )?(poi|dopo|e dopo|e poi|passo successivo|avanti|continua|prossimo passo|e adesso)\s*\??\s*$/
  };

  function regimeDa(w) {
    var o = {};
    if (/\b(prima casa|prime case|come prima|abitazione principale|ci vado a vivere|per viverci|ci vivo)\b/.test(w)) o.primaCasa = true;
    if (/\b(seconda casa|seconde case|non prima casa|senza agevolazion\w*|come investimento|non e prima casa)\b/.test(w)) o.primaCasa = false;
    if (/\b(da|dall|di|un|una) (impresa|azienda|costruttore|societa|ditta)\b|\bcon (l )?iva\b|\bsoggett\w* (a|ad) iva\b/.test(w)) o.conIva = true;
    if (/\bsenza iva\b|\bda privato\b|\bda un privato\b/.test(w)) o.conIva = false;
    if (/\blusso\b/.test(w)) o.lusso = true;
    if (/\bedificabil\w*\b/.test(w)) o.terreno = 'edificabile';
    else if (/\bagricol\w*\b/.test(w)) o.terreno = 'agricolo';
    if (/\b(coltivatore diretto|coltivatori diretti|iap|imprenditore agricolo)\b/.test(w)) o.coltivatore = true;
    if (/\b(non abitativ\w*|strumentale)\b/.test(w)) o.nonAbitativo = true;
    if (/\b(occupat[oa]|con inquilin\w*|affittat[oa])\b/.test(w) && !/\bnon occupat/.test(w)) o.occupato = true;
    else if (/\b(liber[oa]|non occupat[oa])\b/.test(w)) o.occupato = false;
    if (/\b(il minimo|offerta minima|offro il minimo|offrendo il minimo|al minimo)\b/.test(w)) o.alMinimo = true;
    return o;
  }

  function concettiDa(w) {
    var l = [];
    var t = w.replace(/\bposti? auto\b/g, ' box ');
    ORDINE_CONCETTI.forEach(function (k) {
      if (!CONCETTI[k].re.test(t)) return;
      if (k === 'casa' && /\b(prima|seconda) casa\b/.test(t) && !/\b(cas[ae]|abitazion\w*)\b/.test(t.replace(/\b(prima|seconda) casa\b/g, ' '))) return;
      if (k === 'commerciale' && l.indexOf('negozio') >= 0) return;
      l.push(k);
    });
    // "casa" è generica: se c'è un tipo più preciso (appartamento, villa...) vale quello
    if (l.length > 1 && l.indexOf('casa') >= 0) l.splice(l.indexOf('casa'), 1);
    return l;
  }
  function categoriaDa(w, concetti) {
    var t = w.replace(/\bposti? auto\b/g, ' ').replace(/\bauto(rimess\w*|veicol\w*)\b/g, ' ');
    if (concetti.length) return 'immobile';
    if (CATEGORIE.moto.test(t)) return 'moto';
    if (CATEGORIE.auto.test(t)) return 'auto';
    if (CATEGORIE.beni.test(t)) return 'beni';
    if (CATEGORIE.immobile.test(t)) return 'immobile';
    return null;
  }

  function voceGuida(w) {
    var migliore = null, punti = 0;
    GUIDA.forEach(function (g) {
      g.domande.forEach(function (d) {
        var k = piatto(d);
        if (k && (' ' + w + ' ').indexOf(' ' + k + ' ') >= 0 && k.length > punti) { punti = k.length; migliore = g; }
      });
    });
    return migliore;
  }

  /* Analisi completa del testo: tutti i parametri che si riconoscono, a prescindere dall'intento. */
  function analizza(testo, ctx, memoria) {
    ctx = ctx || {};
    var oggi = ctx.oggi || oggiLocale();
    var grezzo = String(testo == null ? '' : testo);
    var n = norm(grezzo).replace(/\bun milione\b/g, '1 milione').replace(/\bmezzo milione\b/g, '0,5 milioni');
    var date = leggiDate(n, oggi);
    var spazi = date.spazi.slice(), m, re;
    re = /\bpvp[-\s]?\d+|\b(?:asta|lotto|annuncio|inserzione|id)\s*(?:n\.?|n°|nr\.?|numero)?\s*\d{5,}|\bart(?:icol[oi])?\.?\s*\d+(?:\s*-?\s*(?:bis|ter))?|\b(?:euro|classe)\s*[0-6]\b|\b(?:asta|tentativo)\s+n\.?\s*\d\b/g;
    while ((m = re.exec(n))) spazi.push([m.index, m.index + m[0].length]);
    var n2 = maschera(n, spazi);
    var tutti = numeri(n2), soldi = importi(tutti);
    var w = piatto(n2);
    var ind = indiceLuoghi(ctx.aste);
    var luoghi = trovaLuoghi(grezzo, w, ind);
    // le parole del luogo non contano per tipi e categorie ("Villa Literno", "Casale Monferrato")
    var parole = w.split(' ');
    luoghi.forEach(function (l) { for (var k = l.i; k >= 0 && k < l.i + l.len; k++) parole[k] = ''; });
    var w2 = ' ' + parole.join(' ').replace(/\s+/g, ' ').trim() + ' ';
    var concetti = concettiDa(w2), categoria = categoriaDa(w2, concetti);
    function primo(unita, max) { var x = tutti.filter(function (y) { return y.unita === unita && (!max || y.v <= max); })[0]; return x ? x.v : null; }
    var tasso = primo('pct', 25);
    if (tasso == null && (m = w.match(/\btasso (?:del |di |al |fisso (?:del |al )?|variabile (?:del |al )?)?(\d+(?: \d+)?)\b/))) { var tv = parseFloat(m[1].replace(' ', '.')); if (tv < 25) tasso = tv; }
    var anni = primo('anni', 50);
    if (anni == null && (m = w.match(/\b(dieci|quindici|venti|venticinque|trenta|quaranta) anni\b/))) anni = NUMERI_PAROLA[m[1]];
    if (anni == null && (m = w.match(/\b(ventennale|trentennale|quindicennale|decennale)\b/))) anni = { decennale: 10, quindicennale: 15, ventennale: 20, trentennale: 30 }[m[1]];
    var mq = tutti.filter(function (x) { return x.unita === 'mq'; })[0];
    var kw = primo('kw'), cv = primo('cv');
    var pMin = null;
    if ((m = w.match(/\bpunteggio (?:almeno |minimo |sopra |oltre |di almeno |superiore a |maggiore di |da )?(\d{1,3})\b/))) pMin = Math.min(100, +m[1]);
    else if (RE.ottimi.test(w)) pMin = 75;
    else if (/\b(buon[ie]? affar[ei]|affar[ei]|buon[ei] occasion[ei]|occasion[ei]|conveniente|convenienti|affare)\b/.test(w)) pMin = 55;
    var ordina = null;
    if (/\b(piu economic\w*|meno car\w*|prezzo piu basso|prezzi piu bassi|ordina\w* per prezzo|dal prezzo piu basso|costano meno)\b/.test(w)) ordina = 'prezzo';
    else if (/\b(piu vicin\w* (nel tempo|come data)|per data|prima data|ordina\w* per data|in scadenza|scadono prima|le prossime aste)\b/.test(w)) ordina = 'data';
    else if (/\b(piu scontat\w*|sconto maggiore|sconto piu alto|maggiore sconto|per sconto|ordina\w* per sconto)\b/.test(w)) ordina = 'sconto';
    else if (/\b(per punteggio|ordina\w* per punteggio|punteggio piu alto|le migliori)\b/.test(w)) ordina = 'punteggio';
    var ordinale = null;
    if ((m = w.match(/\b(?:la|il|l)\s+(prima|primo|seconda|secondo|terza|terzo|quarta|quarto|quinta|quinto|sesta|sesto|ultima|ultimo)\b(?!\s+(casa|asta|offerta|rata))/))) ordinale = m[1];
    else if ((m = w.match(/\b(?:numero|n)\s*([1-6])\b/))) ordinale = +m[1];
    return {
      grezzo: grezzo, n: n2, w: ' ' + w + ' ', w2: w2, oggi: oggi, date: date, numeri: tutti, soldi: soldi, luoghi: luoghi,
      concetti: concetti, categoria: categoria, tasso: tasso != null ? tasso / 100 : null, anni: anni, mq: mq, kw: kw != null ? kw : cv != null ? Math.round(cv * 0.7355) : null,
      daCv: kw == null && cv != null, punteggioMin: pMin, ordina: ordina, regime: regimeDa(' ' + w + ' '), id: idDa(grezzo, ctx), ordinale: ordinale
    };
  }

  function parametriCerca(x) {
    var p = {};
    if (x.categoria) p.categoria = x.categoria;
    if (x.concetti.length) p.parole = x.concetti.slice();
    if (x.luoghi.length) { var l = luogoDa(x.luoghi[0].voce); for (var k in l) if (l[k]) p[k] = l[k]; }
    var lim = limitiPrezzo(x.soldi);
    if (lim.min) p.prezzoMin = lim.min;
    if (lim.max) p.prezzoMax = lim.max;
    if (RE.libere.test(x.w2) && !RE.occupate.test(x.w2)) p.soloLibere = true;
    if (x.punteggioMin) p.punteggioMin = x.punteggioMin;
    if (x.date.dal) p.dal = x.date.dal;
    if (x.date.al) { p.al = x.date.al; p.entroGiorni = x.date.entroGiorni; }
    if (x.date.oggi && !RE.affari.test(x.w)) { p.dal = p.al = x.oggi; p.entroGiorni = 0; }
    if (x.ordina) p.ordina = x.ordina;
    if (x.mq) {
      if (/(fino a|sotto|meno di|massimo|max|al massimo|non oltre)\s*(i\s*)?$/.test(x.mq.prima)) p.mqMax = x.mq.v; else p.mqMin = x.mq.v;
    }
    if (x.luoghi.length > 1) p.altriLuoghi = x.luoghi.slice(1).map(function (l) { return l.voce.nome; });
    return p;
  }

  // richieste di allargare la ricerca precedente ("e anche occupati?", "e senza limite di prezzo?")
  function allarga(w) {
    var o = {};
    if (RE.occupate.test(w)) o.soloLibere = true;
    if (/\b(senza|nessun) limit\w* di prezzo\b|\b(qualsiasi|ogni) prezzo\b|\bsenza (budget|limite)\b/.test(w)) o.prezzo = true;
    if (/\b(qualsiasi|ogni|senza) punteggio\b|\banche (con )?punteggio bass\w*\b|\banche senza punteggio\b/.test(w)) o.punteggio = true;
    if (/\b(qualsiasi|ogni) data\b|\bsenza (limit\w* di )?data\b|\bin qualsiasi momento\b/.test(w)) o.data = true;
    if (/\b(qualsiasi|ogni) (superficie|metratura|dimensione)\b/.test(w)) o.mq = true;
    if (/\btutta la provincia\b/.test(w)) o.provincia = true;
    if (/\btutta la regione\b/.test(w)) o.regione = true;
    if (/\b(tutta italia|in italia|ovunque|qualsiasi zona|ogni zona|in tutta italia)\b/.test(w)) o.luogo = true;
    if (/\b(qualsiasi|ogni) tipo\b|\btutti i tipi\b/.test(w)) o.tipo = true;
    return o;
  }
  function vuoto(o) { for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) return false; return true; }

  function unisciCerca(vecchi, nuovi, w) {
    var p = copia(vecchi), k;
    var al = allarga(w);
    if (nuovi.comune || nuovi.provincia || nuovi.regione) { delete p.comune; delete p.provincia; delete p.regione; }
    if (nuovi.parole) delete p.categoria;
    if (nuovi.prezzoMin || nuovi.prezzoMax) { delete p.prezzoMin; delete p.prezzoMax; }
    if (nuovi.dal || nuovi.al) { delete p.dal; delete p.al; delete p.entroGiorni; }
    if (nuovi.mqMin || nuovi.mqMax) { delete p.mqMin; delete p.mqMax; }
    for (k in nuovi) if (k !== 'altriLuoghi') p[k] = nuovi[k];
    if (al.soloLibere) delete p.soloLibere;
    if (al.prezzo) { delete p.prezzoMin; delete p.prezzoMax; }
    if (al.punteggio) delete p.punteggioMin;
    if (al.data) { delete p.dal; delete p.al; delete p.entroGiorni; }
    if (al.mq) { delete p.mqMin; delete p.mqMax; }
    if (al.provincia && p.comune) delete p.comune;
    if (al.regione) { delete p.comune; delete p.provincia; }
    if (al.luogo) { delete p.comune; delete p.provincia; delete p.regione; }
    if (al.tipo) delete p.parole;
    return p;
  }

  function intentoForte(x) {
    if (x.id) return true;
    if (RE.mutuo.test(x.w) || RE.affari.test(x.w)) return true;
    if (voceGuida(x.w) && RE.domanda.test(x.w)) return true;
    if (RE.rendimento.test(x.w2) && x.soldi.length) return true;
    return false;
  }

  /* Intento e parametri. memoria: quella della risposta precedente (domande di seguito). */
  function capisci(testo, ctx, memoria) {
    ctx = ctx || {};
    memoria = memoria || {};
    var x = analizza(testo, ctx, memoria);
    var w = x.w, segue = RE.seguito.test(w), out;
    function esito(intento, parametri, extra) { var o = { intento: intento, parametri: parametri || {} }; if (extra) for (var k in extra) o[k] = extra[k]; o.analisi = x; return o; }
    var soldi = x.soldi;
    if (!w.trim()) return esito('aiuto');

    // 1. un'asta precisa
    if (x.id) {
      if (RE.costi.test(w) || /\bquanto costa\b/.test(w)) return esito('costi', costiDa(x, { id: x.id }));
      if (RE.rendimento.test(x.w2)) return esito('rendimento', rendimentoDa(x, { id: x.id }));
      return esito('spiega', { id: x.id });
    }
    // "spiegami la prima" dopo una ricerca
    if (x.ordinale && memoria.ids && memoria.ids.length && !soldi.length) {
      var ord = { prima: 0, primo: 0, seconda: 1, secondo: 1, terza: 2, terzo: 2, quarta: 3, quarto: 3, quinta: 4, quinto: 4, sesta: 5, sesto: 5 };
      var k = typeof x.ordinale === 'number' ? x.ordinale - 1 : x.ordinale.indexOf('ultim') === 0 ? memoria.ids.length - 1 : ord[x.ordinale];
      if (memoria.ids[k]) return esito('spiega', { id: memoria.ids[k] });
    }
    // 2. domande che completano una richiesta lasciata a metà (tasso e durata del mutuo, kW dell'auto, importo)
    if (memoria.attesa === 'mutuo' && (x.tasso != null || x.anni != null || soldi.length) && !x.id) {
      return esito('mutuo', mutuoDa(x, memoria.mutuo), { seguito: true });
    }
    if (memoria.attesa === 'veicolo' && (x.kw != null || x.luoghi.length)) return esito('costi', costiDa(x, memoria.costi), { seguito: true });
    if (memoria.attesa === 'costi' && soldi.length) return esito('costi', costiDa(x, memoria.costi), { seguito: true });
    if (memoria.attesa === 'rendimento' && soldi.length) return esito('rendimento', rendimentoDa(x, memoria.rendimento), { seguito: true });
    if (memoria.intento === 'guida' && memoria.guida && RE.dopo.test(w)) {
      var pos = GUIDA.map(function (g) { return g.id; }).indexOf(memoria.guida);
      if (pos >= 0 && pos + 1 < GUIDA.length) return esito('guida', { voce: GUIDA[pos + 1].id });
    }

    // 3. guida alla procedura (domande sul "come", senza importi; cauzione e offerta minima anche con un importo)
    var g = voceGuida(w);
    if (g && (RE.domanda.test(w) || !soldi.length) && !(memoria.intento === 'costi' && segue && soldi.length)) {
      var conImporto = (g.id === 'cauzione' || g.id === 'offerta-minima') && soldi.length;
      if (!soldi.length || conImporto) {
        if (!(g.id === 'mutuo' && x.tasso != null) && !(g.id === 'costi' && soldi.length)) return esito('guida', { voce: g.id, importo: conImporto ? soldi[0].v : null });
      }
    }
    // 4. seguiti di un calcolo
    if (memoria.intento === 'costi' && memoria.costi && (segue || !intentoForte(x)) &&
        (!vuoto(x.regime) || soldi.length || x.kw != null) && !RE.mutuo.test(w) && !(x.concetti.length && x.luoghi.length)) {
      return esito('costi', costiDa(x, memoria.costi), { seguito: true });
    }
    if (memoria.intento === 'mutuo' && memoria.mutuo && (segue || !intentoForte(x)) && (x.tasso != null || x.anni != null || soldi.length) && !RE.costi.test(w)) {
      return esito('mutuo', mutuoDa(x, memoria.mutuo), { seguito: true });
    }
    if (memoria.intento === 'rendimento' && memoria.rendimento && segue && (soldi.length || /\bcedolare\b/.test(w))) {
      return esito('rendimento', rendimentoDa(x, memoria.rendimento), { seguito: true });
    }
    if (memoria.ultimaAsta && (segue || /^\s*(quanto costa|e quanto costa|quanto costerebbe|costi)\b/.test(w)) && (RE.costi.test(w) || !vuoto(x.regime)) && !soldi.length) {
      return esito('costi', costiDa(x, { id: memoria.ultimaAsta }), { seguito: true });
    }

    // 5. mutuo
    if (RE.mutuo.test(w) && !(RE.cerca.test(w) && x.luoghi.length && !x.tasso)) return esito('mutuo', mutuoDa(x, null));
    // 6. rendimento da affitto (con importi e senza luogo: altrimenti è una ricerca)
    if (RE.rendimento.test(x.w2) && soldi.length && !x.luoghi.length) return esito('rendimento', rendimentoDa(x, null));
    // 7. costi
    var cercaP = parametriCerca(x);
    if ((RE.costi.test(w) || /\bquanto (costa|viene)\b/.test(w)) && (soldi.length || !(x.luoghi.length || x.concetti.length)) && !(RE.affari.test(w) && !soldi.length)) {
      return esito('costi', costiDa(x, null));
    }
    // 8. affari di oggi
    if (RE.affari.test(w) && (RE.oggi.test(w) || /\b(cacciatore|migliori affari|del giorno)\b/.test(w) || (!x.luoghi.length && !x.concetti.length && !x.categoria && !soldi.length && !x.date.al))) {
      var la = x.luoghi.length ? luogoDa(x.luoghi[0].voce) : {};
      return esito('affari', la);
    }
    // 9. ricerca (anche come seguito di quella precedente)
    var haCerca = !vuoto(cercaP) || RE.cerca.test(w) || RE.libere.test(w);
    var base = memoria.intento === 'cerca' ? memoria.cerca : memoria.intento === 'affari' ? { punteggioMin: 55 } : null;
    var al = allarga(w);
    // è un seguito se lo dice ("e…", "solo…", "anche…"), se allarga un filtro, oppure se è una frase breve senza un
    // nuovo oggetto ("sotto i 100 mila", "a Lecce"); una domanda completa con luogo o altri filtri è una ricerca nuova
    var breve = String(testo || '').trim().split(/\s+/).length <= 4;   // sulla frase originale: date e importi letti escono da w
    var senzaOggetto = !cercaP.parole && !cercaP.categoria && (breve || !x.luoghi.length);
    if (base && (segue || !vuoto(al) || senzaOggetto) && (!vuoto(cercaP) || !vuoto(al))) {
      out = unisciCerca(base, cercaP, w);
      return esito('cerca', out, { seguito: true });
    }
    if (haCerca && !vuoto(cercaP)) return esito('cerca', cercaP);
    if (RE.aiuto.test(w)) return esito('aiuto');
    if (RE.saluto.test(w) || RE.grazie.test(w)) return esito('saluto');
    if (RE.cerca.test(w)) return esito('cerca', cercaP);
    if (g) return esito('guida', { voce: g.id });
    return esito('non-capito');
  }

  function costiDa(x, prec) {
    var p = copia(prec);
    delete p.mancano;
    var r = x.regime, k;
    for (k in r) p[k] = r[k];
    if (r.terreno && !p.nonAbitativo) p.tipoImmobile = 'terreno';
    if (x.concetti.length) {
      if (x.concetti.indexOf('terreno') >= 0) p.tipoImmobile = 'terreno';
      else if (x.concetti.some(function (c) { return NON_ABITATIVI.indexOf(c) >= 0; })) { p.tipoImmobile = 'non-abitativo'; p.nonAbitativo = true; }
      else p.tipoImmobile = 'abitazione';
    }
    if (x.categoria && x.categoria !== p.categoria && !(x.categoria === 'immobile' && p.categoria)) p.categoria = x.categoria;
    if (x.kw != null) { p.kw = x.kw; p.daCv = x.daCv; }
    if (x.luoghi.length) { var l = luogoDa(x.luoghi[0].voce); if (l.provincia) p.provincia = l.provincia; }
    var resto = [];
    x.soldi.forEach(function (s) {
      if (s.ruolo === 'offerta') p.offerta = s.v;
      else if (s.ruolo === 'lavori') p.lavori = s.v;
      else if (s.ruolo === 'condominio') p.condominio = s.v;
      else if (s.ruolo === 'valore') p.valoreMercato = s.v;
      else if (s.ruolo === 'rendita') p.rendita = s.v;
      else if (s.ruolo === 'spese' && /procedura|delegato|notaio/.test(s.prima + s.dopo)) p.speseProcedura = s.v;
      else resto.push(s);
    });
    if (resto.length) {
      // nuovo importo dell'asta: sostituisce il precedente (anche l'offerta, se non indicata a parte)
      var b = resto.filter(function (s) { return s.ruolo === 'base'; })[0] || resto[0];
      p.prezzoBase = b.v;
      if (!x.soldi.some(function (s) { return s.ruolo === 'offerta'; })) delete p.offerta;
      if (p.id && !x.id) delete p.id;
    }
    if (r.alMinimo) p.alMinimo = true;
    else if (resto.length || x.soldi.some(function (s) { return s.ruolo === 'offerta'; })) delete p.alMinimo;
    return p;
  }

  function mutuoDa(x, prec) {
    var p = copia(prec);
    delete p.mancano;
    if (x.tasso != null) p.tasso = x.tasso;
    if (x.anni != null) p.anni = x.anni;
    if (x.regime.primaCasa != null) p.primaCasa = x.regime.primaCasa;
    var resto = [];
    x.soldi.forEach(function (s) {
      if (s.ruolo === 'stipendio') p.stipendio = s.v;
      else if (s.ruolo === 'risparmi') p.risparmi = s.v;
      else if (s.ruolo === 'altreRate') p.altreRate = s.v;
      else if (s.periodo === 'mese' && !p.stipendio && RE.budget.test(x.w)) p.stipendio = s.v;
      else resto.push(s);
    });
    if (resto.length) p.capitale = resto[0].v;
    if (RE.budget.test(x.w) || p.stipendio) p.tipo = 'budget';
    else if (resto.length || !p.tipo) p.tipo = 'rata';
    return p;
  }

  function rendimentoDa(x, prec) {
    var p = copia(prec);
    var resto = [], spese = 0, conSpese = false;
    x.soldi.forEach(function (s) {
      if (s.ruolo === 'canone' || (s.periodo === 'mese' && s.ruolo !== 'spese' && s.ruolo !== 'condominio' && s.ruolo !== 'imu')) {
        if (s.periodo === 'anno') { p.canoneAnno = s.v; delete p.canone; } else { p.canone = s.v; delete p.canoneAnno; }
      } else if (s.ruolo === 'spese' || s.ruolo === 'condominio' || s.ruolo === 'imu') { spese += s.periodo === 'mese' ? s.v * 12 : s.v; conSpese = true; }
      else resto.push(s);
    });
    if (conSpese) p.speseAnnue = spese;
    if (/\bcedolare\b/.test(x.w)) p.cedolare = /\bconcordat\w*\b/.test(x.w) ? 'concordato' : 'libero';
    if (/\bsenza (cedolare|tasse)\b/.test(x.w)) delete p.cedolare;
    if (resto.length) {
      resto.sort(function (a, b) { return a.v - b.v; });
      if (p.canone == null && p.canoneAnno == null && resto.length >= 2) { p.canone = resto[0].v; resto.shift(); }
      p.prezzo = resto[resto.length - 1].v;
      if (p.id && !x.id) delete p.id;
    }
    if (x.id) p.id = x.id;
    return p;
  }

  /* ---------- Risposte ---------- */

  function blocco(tipo, campi) { var b = { tipo: tipo }; for (var k in campi) b[k] = campi[k]; return b; }
  function testo(t) { return blocco('testo', { testo: t }); }
  function avviso(t) { return blocco('avviso', { testo: t }); }
  // chiude la risposta: suggerimenti prima delle fonti, fonti sempre per ultime e senza doppioni
  function chiudi(blocchi, fonti, suggerimenti) {
    var out = blocchi.filter(Boolean);
    if (suggerimenti && suggerimenti.length) out.push(blocco('suggerimenti', { voci: unici(suggerimenti).slice(0, 6) }));
    var visti = {}, voci = [];
    (fonti || []).forEach(function (f) {
      if (!f || !f.nome) return;
      var k = f.nome + '|' + (f.url || '');
      if (visti[k]) return;
      visti[k] = 1;
      var v = { nome: f.nome }; if (f.url) v.url = f.url; if (f.data) v.data = String(f.data).slice(0, 10);
      voci.push(v);
    });
    if (voci.length) out.push(blocco('fonti', { voci: voci }));
    return out;
  }

  function raccoltaDi(ctx) { return ctx.raccolta || (!NODE && root.ASTE_RACCOLTE) || null; }
  function dataDati(ctx) {
    var r = raccoltaDi(ctx);
    var d = ctx.aggiornato || (r && r.aggiornato) || (ctx.affari && ctx.affari.datiDel) || null;
    return d ? String(d).slice(0, 10) : null;
  }
  // fonte che l'ultima raccolta non ha aggiornato (errore o blocco): data dell'ultima raccolta riuscita, non quella del file
  function voceFonte(ctx, nome, etichetta, url) {
    var r = raccoltaDi(ctx), d = dataDati(ctx);
    var f = ((r && r.fonti) || []).filter(function (x) { return x.nome === nome; })[0];
    if (!f || (f.stato !== 'errore' && f.stato !== 'bloccata') || !f.ultimaRaccolta || isNaN(new Date(f.ultimaRaccolta))) return { nome: etichetta, url: url, data: d };
    var quando = d && d === ctx.oggi ? 'oggi' : d ? 'il ' + dataIt(d) : 'nell\'ultima raccolta';
    return { nome: etichetta + ' – ' + quando + ' nessun aggiornamento, aste dell\'ultima raccolta riuscita', url: url, data: String(f.ultimaRaccolta).slice(0, 10) };
  }
  function fontiAste(ctx, lista) {
    var f = [], fonti = {};
    (lista || []).forEach(function (a) { fonti[a.fonte || 'Portale Vendite Pubbliche'] = 1; });
    if (!lista || !lista.length || fonti['Portale Vendite Pubbliche']) f.push(voceFonte(ctx, 'Portale Vendite Pubbliche', 'Portale delle Vendite Pubbliche (Ministero della Giustizia)', URL_PVP));
    if (fonti['Agenzia del Demanio']) f.push(voceFonte(ctx, 'Agenzia del Demanio', 'Agenzia del Demanio – Gare e aste', 'https://www.agenziademanio.it/it/gare-aste/'));
    Object.keys(fonti).forEach(function (k) { if (k !== 'Portale Vendite Pubbliche' && k !== 'Agenzia del Demanio') f.push({ nome: k + ' (avviso indicato nella scheda)' }); });
    return f;
  }
  function fonteValore(chiave, ctx) {
    var r = raccoltaDi(ctx), sem = r && r.punteggio && r.punteggio.omi && r.punteggio.omi.semestre;
    if (chiave === 'omi' || chiave === 'omi-comune') {
      return { nome: 'Agenzia delle Entrate – Osservatorio del Mercato Immobiliare (OMI)' + (sem ? ', semestre ' + sem : '') + ', licenza CC BY 4.0' + (chiave === 'omi-comune' ? ' (valori tipici del comune)' : ''), url: URL_OMI };
    }
    if (ETICHETTE_VALORE[chiave]) return { nome: 'Valore di mercato: ' + ETICHETTE_VALORE[chiave] };
    return null;
  }
  function fontiValori(lista, ctx) {
    var f = [];
    lista.forEach(function (a) { if (a.fonteValore) f.push(fonteValore(a.fonteValore, ctx)); });
    return f;
  }
  function regimeT(id, T) { return (T.immobili.regimi || []).filter(function (r) { return r.id === id; })[0] || null; }
  function fonteRegime(id, T, perche) { var r = regimeT(id, T); return r ? { nome: (perche ? perche + ': ' : 'Imposte (' + nomeRegime(r) + '): ') + r.fonte, url: r.url, data: r.verificato } : null; }
  function nomeRegime(r) { return r.nome.charAt(0).toLowerCase() + r.nome.slice(1) + ' – ' + r.gruppo.charAt(0).toLowerCase() + r.gruppo.slice(1); }

  var SUGGERIMENTI_BASE = ['Appartamenti a Bari sotto 150.000 €, solo liberi', 'Quali sono gli affari di oggi?', 'Quanto costa in totale un\'asta da 100.000 € come prima casa?',
    'Rata per 120.000 € in 25 anni al 3,5%', 'Come funziona la cauzione?', 'Affitto 600 € al mese su 100.000 €: che rendimento?'];

  /* --- Ricerca --- */

  function testoAsta(a) {
    if (a._consulente === undefined) a._consulente = ' ' + piatto([a.titolo, a.tipo, a.descrizione].join(' ')) + ' ';
    return a._consulente;
  }
  function passa(a, p, oggi) {
    if (a.dataAsta && a.dataAsta < oggi) return false;
    if ((p.dal || p.al) && !a.dataAsta) return false;
    if (p.categoria && a.categoria !== p.categoria) return false;
    if (p.regione && a.regione !== p.regione) return false;
    if (p.provincia && a.provincia !== p.provincia) return false;
    if (p.comune && a.comune !== p.comune) return false;
    if (p.prezzoMin && !(a.prezzoBase >= p.prezzoMin)) return false;
    if (p.prezzoMax && !(a.prezzoBase <= p.prezzoMax)) return false;
    if (p.soloLibere && a.stato !== 'libero') return false;
    if (p.punteggioMin && !(a.punteggio >= p.punteggioMin)) return false;
    if (p.dal && !(a.dataAsta >= p.dal)) return false;
    if (p.al && !(a.dataAsta <= p.al)) return false;
    if (p.mqMin && !(a.superficieMq >= p.mqMin)) return false;
    if (p.mqMax && !(a.superficieMq <= p.mqMax)) return false;
    if (p.parole) for (var i = 0; i < p.parole.length; i++) {
      var c = CONCETTI[p.parole[i]];
      if (!c) continue;
      if (c.tipo ? !(c.tipo.test(a.tipo || '') || (p.parole[i] === 'casa' && c.re.test(testoAsta(a)) && a.categoria === 'immobile')) : !c.re.test(testoAsta(a))) return false;
    }
    return true;
  }
  function filtra(aste, p, oggi) { return (aste || []).filter(function (a) { return a && passa(a, p, oggi); }); }
  // 0 = valore affidabile (media/alta), 1 = valore poco affidabile, 2 = senza punteggio
  function gruppo(a) { return a.punteggio == null || !isFinite(a.punteggio) ? 2 : (a.affidabilita === 'media' || a.affidabilita === 'alta') ? 0 : 1; }
  function cmp(x, y) { return x < y ? -1 : x > y ? 1 : 0; }
  function ordinaAste(lista, ordina) {
    function perData(a, b) { return cmp(a.dataAsta || '9999', b.dataAsta || '9999'); }
    function sc(a) { return a.sconto != null && isFinite(a.sconto) ? a.sconto : -Infinity; }
    function fine(a, b) { return perData(a, b) || cmp(a.id, b.id); }
    return lista.slice().sort(function (a, b) {
      if (ordina === 'prezzo') { var pa = a.prezzoBase > 0 ? a.prezzoBase : Infinity, pb = b.prezzoBase > 0 ? b.prezzoBase : Infinity; return cmp(pa, pb) || fine(a, b); }
      if (ordina === 'data') return perData(a, b) || gruppo(a) - gruppo(b) || (b.punteggio || 0) - (a.punteggio || 0) || cmp(a.id, b.id);
      if (ordina === 'sconto') { var na = a.sconto == null ? 1 : 0, nb = b.sconto == null ? 1 : 0; return na - nb || gruppo(a) - gruppo(b) || sc(b) - sc(a) || fine(a, b); }
      return gruppo(a) - gruppo(b) || (b.punteggio || 0) - (a.punteggio || 0) || sc(b) - sc(a) || fine(a, b);
    });
  }
  function filtriPagina(p) {
    var f = {};
    if (p.categoria) f.cat = p.categoria;
    var t = (p.parole || []).map(function (k) { return CONCETTI[k] ? CONCETTI[k].testo : ''; }).filter(Boolean).join(' ');
    if (t) f.testo = t;
    if (p.regione) f.regione = p.regione;
    if (p.provincia) f.provincia = p.provincia;
    if (p.comune) f.comune = p.comune;
    if (p.prezzoMin) f.min = p.prezzoMin;
    if (p.prezzoMax) f.max = p.prezzoMax;
    if (p.soloLibere) f.stato = 'libero';
    if (p.punteggioMin) { f.punteggioMin = p.punteggioMin; f.soloConPunteggio = true; }
    if (p.dal) f.dal = p.dal;
    if (p.al) f.al = p.al;
    f.ordina = { punteggio: 'punteggio', prezzo: 'prezzo-asc', data: 'data', sconto: 'sconto' }[p.ordina || 'punteggio'];
    return f;
  }
  function soggetto(p) {
    if (p.parole && p.parole.length) {
      var l = p.parole.map(function (k) { return CONCETTI[k].nomi[1]; });
      return l.length > 1 ? l[0] + ' con ' + l.slice(1).join(' e ') : l[0];
    }
    return p.categoria ? NOMI_CATEGORIA[p.categoria] : 'aste';
  }
  function femminile(p) { return p.parole && p.parole.length ? !!CONCETTI[p.parole[0]].femminile : !p.categoria; }
  function descriviCerca(p) {
    var parti = [soggetto(p)];
    var luogo = nomeLuogo(p); if (luogo) parti[0] += ' ' + luogo;
    if (p.prezzoMin && p.prezzoMax) parti.push('con prezzo base da ' + eur(p.prezzoMin) + ' a ' + eur(p.prezzoMax));
    else if (p.prezzoMax) parti.push('sotto ' + eur(p.prezzoMax));
    else if (p.prezzoMin) parti.push('sopra ' + eur(p.prezzoMin));
    if (p.mqMin) parti.push('di almeno ' + p.mqMin + ' mq');
    if (p.mqMax) parti.push('fino a ' + p.mqMax + ' mq');
    if (p.soloLibere) parti.push(femminile(p) ? 'solo libere' : 'solo liberi');
    if (p.punteggioMin) parti.push('con punteggio di almeno ' + p.punteggioMin + ' (' + modulo('Punteggio').fascia(p.punteggioMin).etichetta.toLowerCase() + ' o meglio)');
    if (p.dal && p.al && p.dal === p.al) parti.push('con asta il ' + dataIt(p.al));
    else if (p.dal && p.al) parti.push('con asta dal ' + dataIt(p.dal) + ' al ' + dataIt(p.al));
    else if (p.al) parti.push('con asta entro il ' + dataIt(p.al));
    else if (p.dal) parti.push('con asta dal ' + dataIt(p.dal));
    var ord = { prezzo: 'ordinate dal prezzo più basso', data: 'ordinate per data dell\'asta', sconto: 'ordinate per sconto', punteggio: 'ordinate per punteggio' }[p.ordina || 'punteggio'];
    return 'Ho capito: ' + parti.join(', ') + '; ' + ord + '.';
  }

  function rispondiCerca(p, ctx, mem, seguito) {
    var oggi = ctx.oggi, aste = ctx.aste || [];
    var lista = ordinaAste(filtra(aste, p, oggi), p.ordina);
    var top = lista.slice(0, 6), blocchi = [testo(descriviCerca(p))], sugg = [];
    if (p.altriLuoghi && p.altriLuoghi.length) blocchi.push(testo('Ho usato solo il primo luogo che hai scritto. Per gli altri chiedimi per esempio "e ' + nomeLuogo(luogoDa(indiceLuoghi(aste).mappa[piatto(p.altriLuoghi[0])] ? indiceLuoghi(aste).mappa[piatto(p.altriLuoghi[0])][0] : null)).replace(/^in provincia di /, 'in provincia di ') + '?".'));
    var nuovaMem = { intento: 'cerca', cerca: p, ids: top.map(function (a) { return a.id; }) };
    if (!aste.length) {
      blocchi.push(testo('Non ho le aste da consultare: il file delle aste raccolte non è stato caricato. Riprova tra poco o apri la pagina Aste.'));
      return { blocchi: chiudi(blocchi, [], SUGGERIMENTI_BASE), memoria: nuovaMem };
    }
    if (!lista.length) {
      blocchi.push(testo('Non ho trovato aste future con questi filtri.'));
      var prove = [], k;
      function prova(etichetta, mod, domanda) {
        var q = copia(p); mod(q);
        var n = filtra(aste, q, oggi).length;
        if (n) { prove.push(etichetta + ': ' + n + (n === 1 ? ' asta' : ' aste')); sugg.push(domanda); }
      }
      if (p.soloLibere) prova('Anche occupate o con stato non indicato', function (q) { delete q.soloLibere; }, 'E anche occupati?');
      if (p.prezzoMin || p.prezzoMax) prova('Senza limite di prezzo', function (q) { delete q.prezzoMin; delete q.prezzoMax; }, 'E senza limite di prezzo?');
      if (p.punteggioMin) prova('Con qualsiasi punteggio', function (q) { delete q.punteggioMin; }, 'E con qualsiasi punteggio?');
      if (p.dal || p.al) prova('In qualsiasi data', function (q) { delete q.dal; delete q.al; delete q.entroGiorni; }, 'E in qualsiasi data?');
      if (p.mqMin || p.mqMax) prova('Di qualsiasi superficie', function (q) { delete q.mqMin; delete q.mqMax; }, 'E di qualsiasi superficie?');
      if (p.comune) prova('In tutta la provincia', function (q) { delete q.comune; }, 'E in tutta la provincia?');
      else if (p.provincia) prova('In tutta la regione', function (q) { delete q.provincia; }, 'E in tutta la regione?');
      if (p.parole) prova('Con qualsiasi tipo di immobile', function (q) { delete q.parole; }, 'E di qualsiasi tipo?');
      if (prove.length) blocchi.push(testo('Allargando un filtro alla volta: ' + prove.join('; ') + '.'));
      else blocchi.push(testo('Nessuna asta nemmeno allargando un filtro alla volta: prova un\'altra zona o un altro tipo di bene.'));
      blocchi.push(blocco('aste', { titolo: 'Nessuna asta trovata', totale: 0, ids: [], filtri: filtriPagina(p), nota: 'Apri la pagina Aste con questi filtri per cambiarli a mano.' }));
      return { blocchi: chiudi(blocchi, fontiAste(ctx, []), sugg.concat(['Quali sono gli affari di oggi?'])), memoria: nuovaMem };
    }
    var conAff = lista.filter(function (a) { return gruppo(a) === 0; }).length, bassa = lista.filter(function (a) { return gruppo(a) === 1; }).length, senza = lista.length - conAff - bassa;
    var frase = lista.length === 1 ? 'Ne ho trovata una. Eccola.'
      : 'Ne ho trovate ' + migliaia(String(lista.length)) + '. ' + (top.length < lista.length ? 'Ecco le prime ' + top.length : 'Eccole') + (p.ordina && p.ordina !== 'punteggio' ? '.' : ': prima quelle con il punteggio più alto e un valore di mercato affidabile.');
    blocchi.push(testo(frase));
    var note = [];
    if (!p.ordina || p.ordina === 'punteggio' || p.ordina === 'sconto') {
      if (bassa) note.push(migliaia(String(bassa)) + ' hanno un valore di mercato poco affidabile e sono messe dopo le altre');
      if (senza) note.push(migliaia(String(senza)) + ' sono senza punteggio (valore di mercato non stimabile) e sono in fondo');
    }
    if (p.mqMin || p.mqMax) note.push('il filtro sui metri quadri non c\'è nella pagina Aste: lì vedrai anche le aste di altre superfici');
    if (p.prezzoMax || p.prezzoMin) note.push('il limite vale sul prezzo base; l\'offerta minima è il 75% del prezzo base');
    blocchi.push(blocco('aste', { titolo: top.length < lista.length ? 'Le prime ' + top.length + ' di ' + migliaia(String(lista.length)) : (lista.length === 1 ? 'L\'asta trovata' : 'Le ' + lista.length + ' aste trovate'),
      totale: lista.length, ids: top.map(function (a) { return a.id; }), filtri: filtriPagina(p), nota: note.length ? maiuscola(note.join('; ')) + '.' : '' }));
    if (top.some(function (a) { return a.punteggio != null; })) blocchi.push(avviso('Punteggi, sconti e costi sono stime indicative del sito (offerta al prezzo base, seconda casa da privato, ' + eur(modulo('Punteggio').IPOTESI.speseProcedura) + ' di spese di procedura): verifica sempre avviso e perizia.'));
    var fonti = fontiAste(ctx, top).concat(fontiValori(top, ctx));
    if (top.some(function (a) { return a.costoTotale != null; })) fonti.push(fonteRegime(modulo('Punteggio').IPOTESI.regime, ctx.T, 'Costo totale e sconto, imposte'));
    sugg = [];
    if (!p.soloLibere && (!p.categoria || p.categoria === 'immobile')) sugg.push('E solo liberi?');
    if (!p.prezzoMax) sugg.push('E sotto i 100 mila?');
    sugg.push('Spiegami la prima');
    if (p.ordina !== 'prezzo') sugg.push('Ordinale dalla più economica');
    if (!p.punteggioMin) sugg.push('E solo buoni affari?');
    if (p.comune) sugg.push('E in tutta la provincia?');
    return { blocchi: chiudi(blocchi, fonti, sugg), memoria: nuovaMem };
  }

  /* --- Un'asta --- */

  function perchéSenzaValore(a) {
    if (!(num(a.prezzoBase) > 0)) return 'nell\'avviso non c\'è il prezzo base';
    var motivi = ['nell\'avviso non c\'è la stima del perito', num(a.tentativo) >= 2 ? 'non conosciamo il prezzo della prima asta' : !a.tentativo ? 'non sappiamo se è la prima asta (in quel caso il prezzo base di norma coincide con la stima)' : null];
    if (a.categoria === 'immobile') motivi.push(num(a.superficieMq) > 0 ? 'non ci sono quotazioni OMI utilizzabili per questa zona o tipologia' : 'mancano i metri quadri, che servono per usare le quotazioni OMI');
    else motivi.push('per veicoli e beni mobili non esistono quotazioni ufficiali come l\'OMI');
    return motivi.filter(Boolean).join(', ');
  }

  function rispondiSpiega(p, ctx) {
    var a = trovaAsta(p.id, ctx.aste), T = ctx.T, P = modulo('Punteggio'), C = modulo('Calcoli');
    if (!a) {
      return { blocchi: chiudi([testo('Non trovo l\'asta ' + p.id + ' tra quelle in archivio: forse è già conclusa, è stata tolta dal portale o il numero è sbagliato. Puoi cercarla sul Portale delle Vendite Pubbliche.')],
        [voceFonte(ctx, 'Portale Vendite Pubbliche', 'Portale delle Vendite Pubbliche (Ministero della Giustizia)', URL_PVP)], ['Quali sono gli affari di oggi?', 'Appartamenti a Bari sotto 150.000 €, solo liberi']),
        memoria: { intento: 'spiega' } };
    }
    var b = [], fonti = fontiAste(ctx, [a]);
    if (a.linkAvviso) fonti.unshift({ nome: 'Avviso di vendita dell\'asta ' + a.id, url: a.linkAvviso, data: a.vista || dataDati(ctx) });
    var dove = [a.comune, a.provincia ? '(' + a.provincia + ')' : ''].filter(Boolean).join(' ');
    b.push(testo(a.titolo + (dove ? ' – ' + dove : '') + (a.tribunale ? ', Tribunale di ' + a.tribunale : '') + (a.rge ? ', procedura R.G.E. ' + a.rge + (a.annoProcedura ? '/' + a.annoProcedura : '') : '') + '.'));
    var quando = a.dataAsta ? 'Asta il ' + dataIt(a.dataAsta) + (a.ora ? ' alle ' + a.ora : '') : 'Data dell\'asta non indicata';
    if (a.termineOfferte) { var to = String(a.termineOfferte).split('T'); quando += '; offerte entro il ' + dataIt(to[0]) + (to[1] ? ' alle ' + to[1].slice(0, 5) : '') + ' (dall\'avviso)'; }
    else quando += '; il termine per le offerte è nell\'avviso (di solito il giorno prima)';
    if (a.tentativo) quando += '. È il ' + a.tentativo + '° tentativo di vendita' + (num(a.primoPrezzo) > 0 && num(a.prezzoBase) > 0 && a.tentativo >= 2 ? ': prezzo sceso del ' + pct(1 - a.prezzoBase / a.primoPrezzo) + ' dalla prima asta' : '');
    b.push(testo(quando + '.'));
    var righe = [];
    var offMin = num(a.offertaMinima) > 0 ? a.offertaMinima : num(a.prezzoBase) > 0 ? C.offertaMinima(a.prezzoBase, T) : null;
    if (num(a.prezzoBase) > 0) righe.push(['Prezzo base', a.prezzoBase]);
    else b.push(testo('Prezzo base non indicato nei dati raccolti: leggilo nell\'avviso.'));
    if (offMin) righe.push(['Offerta minima' + (num(a.offertaMinima) > 0 ? ' (dall\'avviso)' : ' (75% del prezzo base)'), offMin]);
    if (num(a.rialzo) > 0) righe.push(['Rilancio minimo in caso di gara', a.rialzo]);
    var haValore = num(a.valore) > 0;
    if (haValore) {
      righe.push(['Valore di mercato stimato (centrale)', a.valore]);
      if (num(a.valoreMin) > 0 && num(a.valoreMax) > 0) righe.push(['Forchetta del valore', eur(a.valoreMin) + ' – ' + eur(a.valoreMax)]);
      if (a.offertaMax != null) righe.push(['Offerta massima consigliata', a.offertaMax]);
    }
    var tot = haValore && num(a.costoTotale) > 0 ? ['Costo totale stimato al prezzo base', a.costoTotale] : null;
    var I = P.IPOTESI;
    var ipotesi = ['Offerta pari al prezzo base', 'Imposte da seconda casa da privato (nessuna agevolazione)', 'Spese di procedura ' + eur(I.speseProcedura) + ' (ipotesi del sito)'];
    if (a.stato === 'occupato') ipotesi.push('Costi di liberazione ' + eur(I.liberazioneOccupato) + ' perché risulta occupato (ipotesi del sito)');
    if (a.categoria !== 'immobile') ipotesi = ['Offerta pari al prezzo base', 'Diritti d\'asta, IVA e passaggio di proprietà con le ipotesi del calcolatore (' + I.kw + ' kW per i veicoli)'];
    var perche = haValore ? (ETICHETTE_VALORE[a.fonteValore] || 'Valore stimato dal sito') + '.' : '';
    if (haValore && a.affidabilita === 'bassa') perche += ' Affidabilità bassa: ' + (a.categoria === 'beni' ? 'per un bene mobile c\'è solo la stima del perito, senza una seconda fonte che la confermi' : 'fonte indiretta o fonti in disaccordo') + ', per prudenza il punteggio resta al massimo ' + P.TETTO_INCERTO + '.';
    else if (haValore && a.affidabilita === 'media') perche += ' Affidabilità media: una sola fonte o fonti non del tutto concordi.';
    else if (haValore && a.affidabilita === 'alta') perche += ' Affidabilità alta: due fonti indipendenti concordano.';
    b.push(blocco('conti', { titolo: 'I numeri dell\'asta', righe: righe, totale: tot, affidabilita: haValore ? a.affidabilita || 'bassa' : 'bassa',
      perche: haValore ? perche : 'Senza valore di mercato non si possono stimare costo totale, sconto e offerta massima.', ipotesi: haValore ? ipotesi : [] }));
    if (haValore) {
      var frasi = [];
      if (a.sconto != null) frasi.push('Sconto reale stimato: ' + pct(a.sconto) + ' rispetto al valore di mercato, imposte e spese comprese (' + C.giudizio(a.sconto, T).etichetta.toLowerCase() + ')');
      if (a.punteggio != null) frasi.push('punteggio ' + a.punteggio + '/100 (' + P.fascia(a.punteggio).etichetta + ')');
      if (a.rendimento != null && num(a.omiAffMin) > 0) frasi.push('con l\'affitto tipico della zona (' + eur(a.omiAffMin) + '–' + eur(a.omiAffMax) + ' al mese, OMI) il rendimento lordo sul costo totale è circa ' + pct(a.rendimento));
      if (frasi.length) b.push(testo(maiuscola(frasi.join('; ')) + '.'));
      fonti = fonti.concat([fonteValore(a.fonteValore, ctx)]);
      if (a.categoria === 'immobile') fonti.push(fonteRegime(I.regime, T, 'Costo totale, imposte'));
      else fonti.push(fTariffa(T.veicoli.dirittiAsta, 'Diritti d\'asta: ' + T.veicoli.dirittiAsta.fonte));
    } else {
      b.push(testo('Valore di mercato non disponibile: ' + perchéSenzaValore(a) + '. Per questo mancano costo totale, sconto, offerta massima consigliata e punteggio.'));
    }
    if (!num(a.offertaMinima) && offMin) fonti.push(fTariffa(T.asta.offertaMinima, 'Offerta minima: ' + T.asta.offertaMinima.fonte));
    var stato = a.categoria === 'immobile' ? 'Stato: ' + (STATI[a.stato] || 'non indicato') + (a.stato === 'occupato' ? ' (servono tempo e spese per la liberazione)' : a.stato === 'nd' || !a.stato ? ' nei dati raccolti: verificalo in perizia' : '') : '';
    var info = [stato, num(a.superficieMq) > 0 ? 'superficie ' + a.superficieMq + ' mq (letta dall\'avviso)' : ''].filter(Boolean);
    if (info.length) b.push(testo(maiuscola(info.join('; ')) + '.'));
    if (Array.isArray(a.rischi)) {
      b.push(testo(a.rischi.length ? 'Segnali di rischio trovati nel testo dell\'avviso: ' + unici(a.rischi).map(etichettaRischio).join('; ') + '.' : 'Nel testo dell\'avviso non ho trovato segnali di rischio (abusi, quote, vincoli...): leggi comunque la perizia.'));
    } else b.push(testo('Il testo dell\'avviso non è stato controllato per i rischi: leggi avviso e perizia.'));
    if (haValore && a.affidabilita === 'bassa') b.push(avviso('Valore poco affidabile: ' + (ETICHETTE_VALORE[a.fonteValore] || 'fonte indiretta') + '. Prima di offrire controlla la stima nella perizia.'));
    if (a.anomalia === 'offerta-minima-sopra-base') b.push(avviso('Nei dati l\'offerta minima risulta più alta del prezzo base: verifica l\'avviso.'));
    b.push(blocco('aste', { titolo: 'Apri la scheda dell\'asta', totale: 1, ids: [a.id], filtri: {}, nota: 'Nella scheda trovi avviso, perizia, mappa e calcolo dei costi.', link: 'scheda.html?id=' + encodeURIComponent(a.id) }));
    b.push(avviso('Stima indicativa: verifica sempre avviso di vendita e perizia prima di offrire.'));
    var sugg = a.categoria === 'immobile' ? ['Quanto costa come prima casa?', 'Come funziona la cauzione?', 'Posso visitare l\'immobile?'] : ['Come funziona la cauzione?', 'Come si presenta l\'offerta?'];
    if (offMin) sugg.push('E se offro il minimo?');
    return { blocchi: chiudi(b, fonti, sugg), memoria: { intento: 'spiega', ultimaAsta: a.id } };
  }

  /* --- Costi --- */

  function scegliRegime(p, T) {
    var ids = (T.immobili.regimi || []).map(function (r) { return r.id; });
    function c(id) { return ids.indexOf(id) >= 0 ? id : null; }
    var iva = !!p.conIva, scelto = null;
    if (p.tipoImmobile === 'terreno' || p.terreno) {
      scelto = p.terreno === 'edificabile' ? c('terreno-edificabile') : p.coltivatore ? c('terreno-agricolo-cd') : c('terreno-agricolo');
    } else if (p.nonAbitativo || p.tipoImmobile === 'non-abitativo') scelto = iva ? c('strumentale-iva') : c('non-abitativo-privato');
    else if (p.lusso && iva) scelto = c('lusso-iva');
    else if (p.primaCasa) scelto = iva ? c('prima-iva') : c('prima-privato');
    else scelto = iva ? c('seconda-iva') : c('seconda-privato');
    return scelto || c('seconda-privato') || ids[0];
  }

  function rispondiCosti(p, ctx) {
    var T = ctx.T, C = modulo('Calcoli'), P = modulo('Punteggio'), I = C.IPOTESI_RAPIDE;
    var a = p.id ? trovaAsta(p.id, ctx.aste) : null;
    if (p.id && !a) return rispondiSpiega({ id: p.id }, ctx);
    var q = copia(p), fonti = [], ipotesi = [], b = [];
    if (a) {
      q.categoria = a.categoria;
      if (!p.prezzoBase) q.prezzoBase = a.prezzoBase;
      if (!p.valoreMercato && num(a.valore) > 0) { q.valoreMercato = a.valore; q.valoreMin = a.valoreMin; q.fonteValore = a.fonteValore; }
      if (p.occupato == null) q.occupato = a.stato === 'occupato';
      if (!q.provincia) q.provincia = a.provincia;
      if (!q.tipoImmobile && a.categoria === 'immobile') q.tipoImmobile = /commercial|industrial/i.test(a.tipo || '') ? 'non-abitativo' : /\bterren/i.test(a.titolo || '') && !/residenzial/i.test(a.tipo || '') ? 'terreno' : 'abitazione';
      fonti = fonti.concat(fontiAste(ctx, [a]));
    }
    var cat = q.categoria || 'immobile';
    var base = num(q.prezzoBase), offerta = q.alMinimo && base ? C.offertaMinima(base, T) : num(q.offerta) || base;
    var mem = { intento: 'costi', costi: q };
    if (a) mem.ultimaAsta = a.id;
    if (!(offerta > 0)) {
      mem.attesa = 'costi';
      return { blocchi: chiudi([testo(a ? 'Per questa asta il prezzo base non è indicato nei dati raccolti: dimmi tu l\'importo dell\'offerta.' : 'Di che importo è l\'asta? Scrivimi il prezzo base o la tua offerta, per esempio "100.000 €" oppure "quanto costa un\'asta da 80 mila come prima casa".')],
        a ? fonti : [], ['Quanto costa un\'asta da 100.000 € come prima casa?', 'Quanto costa un\'auto da 5.000 € con 70 kW a Milano?']), memoria: mem };
    }
    var valore = num(q.valoreMercato), fonteVal = q.fonteValore ? fonteValore(q.fonteValore, ctx) : valore ? { nome: 'Valore di mercato indicato da te' } : null;
    var r, righe = [['Offerta' + (base && offerta === base ? ' (pari al prezzo base)' : q.alMinimo ? ' minima (75% del prezzo base)' : ''), offerta]], aff, perche;

    if (cat === 'immobile') {
      var regime = scegliRegime(q, T), RT = regimeT(regime, T);
      var input = { prezzoBase: base || offerta, offerta: offerta, valoreMercato: valore, regime: regime, rendita: q.rendita,
        condominioCorrente: q.condominio, lavori: q.lavori, liberazione: q.occupato ? I.liberazioneOccupato : 0,
        speseProcedura: q.speseProcedura != null ? q.speseProcedura : I.speseProcedura };
      r = C.costoImmobile(input, T);
      r.imposte.voci.forEach(function (v) { righe.push([v.voce, tondo2(v.importo)]); });
      r.extra.forEach(function (v) { if (v.importo) righe.push([v.voce, tondo2(v.importo)]); });
      ipotesi.push('Regime fiscale: ' + nomeRegime(RT) + (q.primaCasa == null && !q.tipoImmobile && !q.terreno ? ' (se è la tua prima casa chiedimi "e se fosse prima casa?")' : ''));
      if (r.imposte.prezzoValore) ipotesi.push('Imposte sul valore catastale (prezzo-valore): rendita ' + eur(q.rendita) + ' × ' + String(1 + T.immobili.prezzoValore.rivalutazione).replace('.', ',') + ' × ' + RT.prezzoValore + ' = ' + eur(r.imposte.base));
      else if (RT.prezzoValore && !(num(q.rendita) > 0)) ipotesi.push('Imposte calcolate sul prezzo: con la rendita catastale (in perizia) potresti pagarle sul valore catastale, spesso più basso');
      ipotesi.push('Spese di procedura ' + eur(input.speseProcedura) + (q.speseProcedura != null ? ' (indicate da te)' : ' (ipotesi del sito: trasferimento, trascrizione e cancellazioni variano per tribunale)'));
      if (q.occupato) ipotesi.push('Costi di liberazione ' + eur(I.liberazioneOccupato) + ' perché occupato (ipotesi del sito)');
      var mancano = [];
      if (!num(q.condominio)) mancano.push('arretrati condominiali');
      if (!num(q.lavori)) mancano.push('lavori');
      if (mancano.length) ipotesi.push('Non compresi: ' + mancano.join(' e ') + ' (dimmeli se li conosci)');
      fonti.push({ nome: 'Imposte (' + nomeRegime(RT) + '): ' + RT.fonte, url: RT.url, data: RT.verificato });
      if (r.imposte.prezzoValore) fonti.push(fTariffa(T.immobili.prezzoValore, 'Prezzo-valore: ' + T.immobili.prezzoValore.fonte));
      if (num(q.condominio)) fonti.push(fTariffa(T.asta.condominio, 'Condominio arretrato: ' + T.asta.condominio.fonte));
      aff = RT.stato === 'confermato' ? 'media' : 'bassa';
      perche = 'Le imposte vengono dalle aliquote ufficiali (' + RT.fonte + ', verificate il ' + dataIt(RT.verificato) + '); le spese di procedura sono una stima: l\'importo esatto lo comunica il delegato.';
      if (q.primaCasa && !q.conIva) perche += ' Le agevolazioni prima casa spettano solo se hai i requisiti di legge.';
      var frase = 'Con un\'offerta di ' + eur(offerta) + ' (' + RT.nome.toLowerCase() + ', ' + RT.gruppo.toLowerCase() + ') il costo totale stimato è circa ' + eur(r.totale) + ': ' + eur(r.imposte.totale) + ' di imposte' +
        (r.totale - offerta - r.imposte.totale > 0 ? ' e ' + eur(r.totale - offerta - r.imposte.totale) + ' di altre spese' : '') + '.';
      b.push(testo(frase));
      var offMin = base ? C.offertaMinima(base, T) : null;
      if (base && offerta === base && !q.alMinimo) {
        var rMin = C.costoImmobile(copiaCon(input, { offerta: offMin }), T);
        b.push(testo('L\'offerta minima valida per un prezzo base di ' + eur(base) + ' è ' + eur(offMin) + ' (un quarto in meno, art. 571 c.p.c.): offrendo il minimo il totale scende a circa ' + eur(rMin.totale) + ', se non ci sono altri offerenti.'));
        fonti.push(fTariffa(T.asta.offertaMinima, 'Offerta minima: ' + T.asta.offertaMinima.fonte));
      } else if (q.alMinimo) fonti.push(fTariffa(T.asta.offertaMinima, 'Offerta minima: ' + T.asta.offertaMinima.fonte));
      if (base && offerta < offMin) b.push(avviso('L\'offerta di ' + eur(offerta) + ' è sotto l\'offerta minima (' + eur(offMin) + '): non sarebbe valida.'));
      if (valore > 0) {
        var vMin = num(q.valoreMin) > 0 ? q.valoreMin : valore;
        var om = C.offertaMassima(C.costoImmobile, copiaCon(input, { valoreMercato: vMin }), T, T.giudizio.scontoObiettivo);
        b.push(testo('Rispetto al valore di mercato di ' + eur(valore) + ' lo sconto reale è ' + pct(r.sconto) + ' (' + r.giudizio.etichetta.toLowerCase() + '). ' +
          (om > 0 ? 'Offerta massima consigliata: ' + eur(om) + ', per restare almeno ' + pct(T.giudizio.scontoObiettivo) + ' sotto il valore' + (vMin !== valore ? ' minimo stimato (' + eur(vMin) + ')' : '') + ' con imposte e spese.' : 'Nemmeno un\'offerta molto bassa resta ' + pct(T.giudizio.scontoObiettivo) + ' sotto il valore con imposte e spese.')));
        if (fonteVal) fonti.push(fonteVal);
        if (q.fonteValore && a && a.affidabilita === 'bassa') b.push(avviso('Valore poco affidabile: ' + (ETICHETTE_VALORE[q.fonteValore] || 'fonte indiretta') + '. Lo sconto potrebbe essere molto diverso.'));
      }
      mem.costi.regime = regime;
    } else {
      // veicoli e beni mobili
      if (cat === 'auto' && !(num(q.kw) > 0)) {
        mem.attesa = 'veicolo';
        return { blocchi: chiudi([testo('Per il passaggio di proprietà di un\'auto mi servono la potenza in kW (sul libretto, voce P.2) e la provincia di residenza, che decide la maggiorazione dell\'imposta provinciale. Scrivimi per esempio "70 kW, provincia di Milano".')],
          [], ['70 kW, provincia di Milano']), memoria: mem };
      }
      var V = T.veicoli;
      r = C.costoVeicolo({ tipo: cat, offerta: offerta, valoreMercato: valore, kw: q.kw, provincia: q.provincia, riparazioni: q.lavori }, T);
      r.voci.forEach(function (v) { if (v.importo) righe.push([v.voce, tondo2(v.importo)]); });
      ipotesi.push('Diritti d\'asta ' + pct(V.dirittiAsta.quota) + ' + IVA ' + pct(V.dirittiAsta.ivaSuDiritti) + ': ' + V.dirittiAsta.nota);
      ipotesi.push('Acquisto da procedura senza IVA sul prezzo');
      fonti.push(fTariffa(V.dirittiAsta, 'Diritti d\'asta: ' + V.dirittiAsta.fonte));
      fonti.push(fTariffa(V.ivaOrdinaria, 'IVA: ' + V.ivaOrdinaria.fonte));
      if (cat === 'auto') {
        var m = r.passaggio.ipt;
        ipotesi.push('Potenza ' + q.kw + ' kW' + (q.daCv ? ' (convertita dai CV: 1 CV = 0,7355 kW)' : '') + '; IPT con maggiorazione ' + pct(m.maggiorazione) + (q.provincia ? ' (provincia ' + q.provincia + ')' : ' (provincia non indicata: uso il massimo di legge)') + (m.statoMaggiorazione === 'da-verificare' ? ', da verificare per la tua provincia' : ''));
        ipotesi.push('Esclusi il compenso dell\'agenzia di pratiche auto e il bollo annuo');
        fonti.push(fTariffa(V.ipt, 'IPT: ' + V.ipt.fonte));
        fonti.push(fTariffa(V.passaggio.emolumentiAci, 'Passaggio di proprietà: ' + V.passaggio.emolumentiAci.fonte));
      } else if (cat === 'moto') {
        ipotesi.push('IPT esclusa: ' + V.ipt.notaMoto);
        fonti.push(fTariffa(V.passaggio.emolumentiAci, 'Passaggio di proprietà: ' + V.passaggio.emolumentiAci.fonte));
      }
      aff = 'bassa';
      perche = 'I diritti d\'asta li fissa ogni istituto vendite o gestore (' + V.dirittiAsta.stato + '): leggi le condizioni di vendita del lotto.';
      b.push(testo('Con un\'offerta di ' + eur(offerta) + ' il costo totale stimato è circa ' + eur(r.totale) + (cat === 'moto' ? ' (IPT esclusa)' : '') + '.'));
      if (valore > 0) { b.push(testo('Rispetto al valore di ' + eur(valore) + ' lo sconto reale è ' + pct(r.sconto) + ' (' + r.giudizio.etichetta.toLowerCase() + ').')); if (fonteVal) fonti.push(fonteVal); }
    }
    b.push(blocco('conti', { titolo: 'Costo totale ' + (cat === 'immobile' ? 'dell\'immobile' : cat === 'beni' ? 'del bene' : 'del veicolo') + ' all\'asta', righe: righe,
      totale: ['Costo totale stimato' + (cat === 'moto' ? ' (IPT esclusa)' : ''), tondo2(r.totale)], affidabilita: aff, perche: perche, ipotesi: ipotesi }));
    b.push(avviso('Stima indicativa: verifica avviso e perizia e chiedi al delegato le spese esatte. ' + T.avvertenza));
    if (a) b.push(blocco('aste', { titolo: 'L\'asta', totale: 1, ids: [a.id], filtri: {}, nota: '', link: 'scheda.html?id=' + encodeURIComponent(a.id) }));
    var sugg = [];
    if (cat === 'immobile') {
      var reg = mem.costi.regime;
      if (reg === 'seconda-privato' || reg === 'seconda-iva') sugg.push('E se fosse prima casa?');
      if (reg === 'prima-privato' || reg === 'prima-iva') sugg.push('E se fosse seconda casa?');
      if (!q.conIva && /^(prima|seconda)/.test(reg)) sugg.push('E se vende un\'impresa con IVA?');
      if (!q.alMinimo && base) sugg.push('E se offro il minimo?');
      if (!num(q.lavori)) sugg.push('E con 20.000 € di lavori?');
    }
    sugg.push('Come funziona la cauzione?');
    return { blocchi: chiudi(b, fonti, sugg), memoria: mem };
  }
  function copiaCon(o, extra) { var c = copia(o); for (var k in extra) c[k] = extra[k]; return c; }

  /* --- Mutuo --- */

  var FONTE_MUTUO = { nome: 'Calcolo con ammortamento alla francese su tasso e durata indicati da te' };
  function rispondiMutuo(p, ctx) {
    var M = modulo('Mutuo'), C = modulo('Calcoli'), T = ctx.T;
    var mem = { intento: 'mutuo', mutuo: p };
    var serve = [];
    if (p.tipo === 'budget') { if (!p.stipendio) serve.push('lo stipendio netto mensile'); if (p.risparmi == null) serve.push('i risparmi che puoi usare per anticipo e spese'); }
    else if (!p.capitale) serve.push('l\'importo del mutuo');
    if (p.tasso == null) serve.push('il tasso annuo');
    if (p.anni == null) serve.push('la durata in anni');
    if (serve.length) {
      mem.attesa = 'mutuo';
      var capito = [];
      if (p.capitale) capito.push('mutuo di ' + eur(p.capitale));
      if (p.stipendio) capito.push('stipendio di ' + eur(p.stipendio) + ' al mese');
      if (p.risparmi != null) capito.push('risparmi di ' + eur(p.risparmi));
      if (p.tasso != null) capito.push('tasso ' + pct(p.tasso));
      if (p.anni != null) capito.push('durata ' + p.anni + ' anni');
      var t = (capito.length ? 'Ho capito: ' + capito.join(', ') + '. ' : '') + 'Per fare il conto mi servono ' + serve.join(', ').replace(/, ([^,]*)$/, ' e $1') + '.';
      if (p.tasso == null) t += ' Il sito non inventa tassi: usa quello dell\'offerta della tua banca o di un comparatore di mutui.';
      var es = p.tipo === 'budget' ? 'Esempio: "2.000 € di stipendio e 30.000 € di risparmi al 3% in 30 anni".' : 'Esempio: "al 3,5% in 25 anni".';
      return { blocchi: chiudi([testo(t + ' ' + es)], capito.length ? [{ nome: 'Dati indicati da te' }] : [], p.tipo === 'budget' ? [] : ['Al 3,5% in 25 anni', 'Al 3% in 30 anni']), memoria: mem };
    }
    var b = [], fonti = [FONTE_MUTUO], n = Math.round(p.anni * 12);
    var ipotesi = ['Tasso fisso ' + pct(p.tasso) + ' annuo (indicato da te)', 'Durata ' + p.anni + ' anni: ' + n + ' rate mensili (indicata da te)', 'Ammortamento alla francese: rata costante',
      'Esclusi spese di istruttoria e perizia, assicurazioni e imposta sostitutiva'];
    var avvisoAsta = 'All\'asta il saldo va pagato entro il termine dell\'avviso (di solito 120 giorni dall\'aggiudicazione): chiedi alla banca la valutazione del mutuo prima di offrire.';
    var sugg;
    if (p.tipo === 'budget') {
      var regime = p.primaCasa ? 'prima-privato' : 'seconda-privato', sp = C.IPOTESI_RAPIDE.speseProcedura;
      // imposte e spese d'acquisto calcolate con le tariffe al prezzo trovato (poche iterazioni bastano)
      var quota = 0, bud = null;
      for (var i = 0; i < 8; i++) {
        bud = M.budget({ stipendio: p.stipendio, altreRate: p.altreRate, risparmi: p.risparmi, tasso: p.tasso, anni: p.anni, speseAcquisto: quota });
        if (!(bud.prezzoMax > 0)) break;
        var nuova = (C.costoImmobile({ prezzoBase: bud.prezzoMax, offerta: bud.prezzoMax, regime: regime, speseProcedura: sp }, T).totale - bud.prezzoMax) / bud.prezzoMax;
        if (Math.abs(nuova - quota) < 0.0001) { quota = nuova; break; }
        quota = nuova;
      }
      bud = M.budget({ stipendio: p.stipendio, altreRate: p.altreRate, risparmi: p.risparmi, tasso: p.tasso, anni: p.anni, speseAcquisto: quota });
      var RT = regimeT(regime, T);
      if (!(bud.prezzoMax > 0)) {
        b.push(testo('Con questi numeri la banca non finanzierebbe un acquisto: ' + (bud.rataMax <= 0 ? 'la rata sostenibile (un terzo dello stipendio, tolte le altre rate) è zero.' : 'servono risparmi per l\'anticipo (almeno il ' + pct(1 - M.IPOTESI.ltvMassimo) + ' del prezzo) e per imposte e spese.')));
        return { blocchi: chiudi(b, [FONTE_MUTUO], ['Rata per 120.000 € in 25 anni al 3,5%']), memoria: mem };
      }
      b.push(testo('Con ' + eur(p.stipendio) + ' di stipendio netto e ' + eur(p.risparmi) + ' di risparmi, al ' + pct(p.tasso) + ' in ' + p.anni + ' anni, puoi puntare a un immobile fino a circa ' + eur(bud.prezzoMax) +
        ', con un mutuo di ' + eur(bud.mutuo) + ' e una rata di circa ' + eur(bud.rata) + ' al mese. Il limite è dato da: ' + bud.limitatoDa + '.'));
      b.push(blocco('conti', { titolo: 'Quanto puoi spendere', righe: [
        ['Rata massima (un terzo dello stipendio' + (p.altreRate ? ', tolte le altre rate' : '') + ')', bud.rataMax], ['Mutuo', bud.mutuo], ['Rata del mutuo', bud.rata],
        ['Anticipo (dai risparmi)', bud.anticipo], ['Imposte e spese d\'acquisto (dai risparmi)', bud.spese]],
        totale: ['Prezzo massimo dell\'immobile', bud.prezzoMax], affidabilita: 'media',
        perche: 'È una regola prudente usata dalle banche (rata fino a un terzo del reddito, mutuo fino all\'80% del valore); la banca valuta anche età, contratto di lavoro e altre spese.',
        ipotesi: ['Stipendio netto ' + eur(p.stipendio) + ' al mese e risparmi ' + eur(p.risparmi) + ' (indicati da te)' + (p.altreRate ? '; altre rate ' + eur(p.altreRate) + ' al mese' : ''),
          'Rata fino a ' + String(Math.round(M.IPOTESI.quotaReddito * 100)) + '% del reddito netto; mutuo fino al ' + pct(M.IPOTESI.ltvMassimo) + ' del prezzo'].concat(ipotesi.slice(0, 3))
          .concat(['Imposte d\'acquisto da ' + RT.nome.toLowerCase() + ' (' + RT.gruppo.toLowerCase() + ') e ' + eur(sp) + ' di spese di procedura, pagate con i risparmi']) }));
      fonti.push({ nome: 'Imposte (' + nomeRegime(RT) + '): ' + RT.fonte, url: RT.url, data: RT.verificato });
      sugg = [p.primaCasa ? 'E se fosse seconda casa?' : 'E se fosse prima casa?', 'E in 20 anni?', 'Appartamenti sotto ' + migliaia(String(Math.floor(bud.prezzoMax / 1000))) + ' mila'];
    } else {
      var rata = M.rata(p.capitale, p.tasso, p.anni), totale = rata * n;
      b.push(testo('Per un mutuo di ' + eur(p.capitale) + ' al ' + pct(p.tasso) + ' in ' + p.anni + ' anni la rata è di circa ' + eur(rata) + ' al mese; in tutto restituisci circa ' + eur(totale) + ', di cui ' + eur(totale - p.capitale) + ' di interessi.'));
      if (p.stipendio) b.push(testo('La rata è il ' + pct(rata / p.stipendio) + ' del tuo stipendio: le banche di solito non superano un terzo.'));
      b.push(blocco('conti', { titolo: 'Rata del mutuo', righe: [['Importo del mutuo', p.capitale], ['Interessi totali', tondo2(totale - p.capitale)], ['Totale da restituire', tondo2(totale)]],
        totale: ['Rata mensile', tondo2(rata)], affidabilita: 'alta', perche: 'È la formula esatta della rata a tasso fisso con i numeri che hai indicato; la rata vera dipende dall\'offerta della banca.', ipotesi: ipotesi }));
      sugg = ['E in 20 anni?', 'E al 4%?', 'Quanto posso spendere con 2.000 € di stipendio e 30.000 € di risparmi al 3% in 30 anni?'];
    }
    b.push(avviso(avvisoAsta));
    fonti.push(fCpc('569', 'termine per il saldo prezzo'));
    fonti.push(fCpc('585', 'saldo con mutuo'));
    return { blocchi: chiudi(b, fonti, sugg.concat(['Posso comprare all\'asta con un mutuo?'])), memoria: mem };
  }

  /* --- Rendimento da affitto --- */

  function rispondiRendimento(p, ctx) {
    var T = ctx.T, A = T.affitto, a = p.id ? trovaAsta(p.id, ctx.aste) : null;
    if (p.id && !a) return rispondiSpiega({ id: p.id }, ctx);
    var mem = { intento: 'rendimento', rendimento: p }, fonti = [], b = [], prezzo = num(p.prezzo), fontePrezzo = 'indicato da te';
    if (a) {
      mem.ultimaAsta = a.id;
      fonti = fontiAste(ctx, [a]);
      if (!prezzo) {
        if (num(a.costoTotale) > 0) { prezzo = a.costoTotale; fontePrezzo = 'costo totale stimato dal sito per l\'asta ' + a.id; fonti.push(fonteRegime(modulo('Punteggio').IPOTESI.regime, T, 'Costo totale, imposte')); }
        else if (num(a.prezzoBase) > 0) { prezzo = a.prezzoBase; fontePrezzo = 'prezzo base dell\'asta ' + a.id + ' (costo totale non stimabile)'; }
      }
    }
    var canoneAnno = p.canoneAnno != null ? num(p.canoneAnno) : p.canone != null ? num(p.canone) * 12 : 0;
    if (!canoneAnno && a && num(a.omiAffMin) > 0 && prezzo) {
      var lo = a.omiAffMin * 12 / prezzo, hi = a.omiAffMax * 12 / prezzo;
      b.push(testo('Con l\'affitto tipico della zona (' + eur(a.omiAffMin) + '–' + eur(a.omiAffMax) + ' al mese secondo l\'OMI) il rendimento lordo sul ' + fontePrezzo + ' (' + eur(prezzo) + ') va da ' + pct(lo) + ' a ' + pct(hi) + ' all\'anno.'));
      b.push(blocco('conti', { titolo: 'Rendimento lordo con l\'affitto della zona', righe: [['Affitto annuo (OMI, minimo)', a.omiAffMin * 12], ['Affitto annuo (OMI, massimo)', a.omiAffMax * 12], ['Costo dell\'immobile', prezzo]],
        totale: ['Rendimento lordo', pct(lo) + ' – ' + pct(hi)], affidabilita: a.affidabilita === 'media' || a.affidabilita === 'alta' ? 'media' : 'bassa',
        perche: 'L\'affitto è la quotazione OMI della zona, non un contratto reale; il costo è una stima del sito.', ipotesi: ['12 mesi affittati', 'Costo: ' + fontePrezzo, 'Nessuna spesa né tassa tolta (rendimento lordo)'] }));
      fonti.push(fonteValore('omi', ctx));
      b.push(avviso('Per il rendimento netto dimmi le spese annue (IMU, condominio, manutenzione) e se applichi la cedolare secca.'));
      return { blocchi: chiudi(b, fonti, ['E con la cedolare secca e 1.000 € di spese all\'anno?']), memoria: mem };
    }
    if (!canoneAnno || !prezzo) {
      mem.attesa = 'rendimento';
      return { blocchi: chiudi([testo('Per il rendimento mi servono ' + (!canoneAnno && !prezzo ? 'l\'affitto mensile e il prezzo (o costo totale) dell\'immobile' : !canoneAnno ? 'l\'affitto mensile' : 'il prezzo o il costo totale dell\'immobile') + '. Esempio: "affitto 600 € al mese su 100.000 €".')],
        a ? fonti : [], ['Affitto 600 € al mese su 100.000 €']), memoria: mem };
    }
    var lordo = canoneAnno / prezzo, righe = [['Affitto annuo', canoneAnno], ['Prezzo / costo dell\'immobile', prezzo]];
    var ipotesi = ['Affitto ' + (p.canoneAnno != null ? 'annuo' : eur(p.canone) + ' al mese per 12 mesi') + ' (indicato da te)', 'Prezzo: ' + fontePrezzo];
    b.push(testo('Con ' + (p.canoneAnno != null ? eur(canoneAnno) + ' di affitto all\'anno' : eur(p.canone) + ' di affitto al mese') + ' su ' + eur(prezzo) + ' il rendimento lordo è ' + pct(lordo) + ' all\'anno.'));
    var totale = ['Rendimento lordo annuo', pct(lordo)], conNetto = p.speseAnnue != null || p.cedolare;
    fonti.push({ nome: 'Calcolo: affitto annuo diviso per il prezzo, con i numeri indicati da te' });
    if (conNetto) {
      var ced = p.cedolare === 'concordato' ? A.cedolareConcordato : p.cedolare ? A.cedolareLibero : null;
      var tassa = ced ? canoneAnno * ced.aliquota : 0, spese = num(p.speseAnnue), netto = canoneAnno - tassa - spese;
      if (ced) { righe.push(['Cedolare secca ' + pct(ced.aliquota) + (p.cedolare === 'concordato' ? ' (canone concordato)' : ' (canone libero)'), -tondo2(tassa)]); fonti.push(fTariffa(ced, 'Cedolare secca: ' + ced.fonte)); ipotesi.push(ced.nota); }
      else ipotesi.push('Tasse sull\'affitto non tolte (non hai indicato la cedolare secca)');
      if (spese) { righe.push(['Spese annue (indicate da te)', -spese]); }
      else ipotesi.push('Spese annue non indicate: non tolte');
      righe.push(['Affitto netto annuo', tondo2(netto)]);
      totale = ['Rendimento netto annuo', pct(netto / prezzo)];
      b.push(testo('Tolte ' + [ced ? 'la cedolare secca' : '', spese ? 'le spese' : ''].filter(Boolean).join(' e ') + ' resta ' + eur(netto) + ' all\'anno: rendimento netto ' + pct(netto / prezzo) + '.'));
    } else {
      b.push(testo('Per il rendimento netto dimmi le spese annue (IMU, condominio non ripetibile, manutenzione) e se applichi la cedolare secca (' + pct(A.cedolareLibero.aliquota) + ' a canone libero, ' + pct(A.cedolareConcordato.aliquota) + ' a canone concordato).'));
      fonti.push(fTariffa(A.cedolareLibero, 'Cedolare secca: ' + A.cedolareLibero.fonte));
      ipotesi.push('Nessuna spesa né tassa tolta (rendimento lordo)');
    }
    ipotesi.push('Nessun mese senza inquilino');
    b.push(blocco('conti', { titolo: 'Rendimento da affitto', righe: righe, totale: totale, affidabilita: 'media',
      perche: 'Il calcolo è esatto con i numeri indicati; il rendimento reale dipende da mesi sfitti, morosità e spese straordinarie.', ipotesi: ipotesi }));
    b.push(avviso('Stima indicativa: per il prezzo di un\'asta usa il costo totale (imposte e spese comprese), non solo il prezzo base.'));
    return { blocchi: chiudi(b, fonti, conNetto ? ['E con il canone concordato?', 'Quanto costa in totale un\'asta da 100.000 €?'] : ['E con la cedolare secca e 1.000 € di spese all\'anno?', 'Quanto costa in totale un\'asta da 100.000 €?']), memoria: mem };
  }

  /* --- Affari di oggi --- */

  function rispondiAffari(p, ctx) {
    var A = ctx.affari, mem = { intento: 'affari' };
    if (!A || !Array.isArray(A.migliori)) {
      var r = rispondiCerca(copiaCon(p, { punteggioMin: 55 }), ctx, null, false);
      r.blocchi.unshift(testo('La selezione degli affari di oggi non è disponibile in questa pagina. Intanto cerco tra tutte le aste quelle con punteggio da buon affare.'));
      return r;
    }
    var lista = A.migliori.filter(function (x) {
      return (!p.regione || x.regione === p.regione) && (!p.provincia || x.provincia === p.provincia) && (!p.comune || x.comune === p.comune);
    });
    var dove = nomeLuogo(p), b = [];
    var intro = 'Affari di oggi' + (A.oggi ? ' (' + dataIt(A.oggi) + ')' : '') + ': il Cacciatore di affari ha analizzato ' + migliaia(String(A.analizzate || 0)) + ' aste nuove o ribassate nelle ultime 24 ore; ' +
      A.migliori.length + ' superano tutti i criteri (sconto reale almeno ' + pct(A.criteri ? A.criteri.scontoMinimo : 0.15) + ', valore di mercato affidabile, punteggio almeno ' + (A.criteri ? A.criteri.punteggioMinimo : 50) + ').';
    b.push(testo(intro));
    if (!lista.length) {
      b.push(testo(A.migliori.length ? 'Nessuno degli affari di oggi è ' + dove + '. Ti propongo di cercare tra tutte le aste ' + dove + ' quelle con punteggio da buon affare.' : 'Oggi nessuna asta supera i criteri: meglio aspettare che proporre affari incerti.'));
      return { blocchi: chiudi(b, fontiAste(ctx, []).concat([{ nome: 'Cacciatore di affari di Radar Aste Italia (regole in js/cacciatore.js)', data: A.aggiornato }]),
        dove ? ['Buoni affari ' + dove, 'Quali sono gli affari di oggi?'] : ['Buoni affari in Lombardia', 'Appartamenti a Bari sotto 150.000 €, solo liberi']), memoria: copiaCon(mem, { cerca: copiaCon(p, { punteggioMin: 55 }) }) };
    }
    var top = lista.slice(0, 6);
    b.push(blocco('aste', { titolo: dove ? 'Affari di oggi ' + dove : 'Gli affari di oggi', totale: lista.length, ids: top.map(function (x) { return x.id; }), filtri: { punteggioMin: 50, soloConPunteggio: true, ordina: 'punteggio' }, nota: A.nota || '' }));
    var fonti = fontiAste(ctx, top).concat([{ nome: 'Cacciatore di affari di Radar Aste Italia (regole in js/cacciatore.js, nessuna AI)', data: A.aggiornato }]);
    top.slice(0, 3).forEach(function (x, i) {
      var r = x.riassunto || {}, P = modulo('Punteggio');
      var righe = [(i + 1) + '. ' + x.titolo + (x.comune ? ' – ' + x.comune + (x.provincia ? ' (' + x.provincia + ')' : '') : '') + ': punteggio ' + x.punteggio + '/100 (' + P.fascia(x.punteggio).etichetta + '), prezzo base ' + eur(x.prezzoBase) + (x.sconto != null ? ', sconto reale ' + pct(x.sconto) : '') + '.'];
      if (r.perche && r.perche.length) righe.push('Perché: ' + r.perche.slice(0, 3).join('; ') + '.');
      if (r.rischi && r.rischi.length) righe.push('Rischi: ' + r.rischi.slice(0, 2).join('; ') + '.');
      if (r.offertaMassima && r.offertaMassima.testo) righe.push(r.offertaMassima.testo + '.');
      var sc = x.termineOfferte ? String(x.termineOfferte).split('T') : null;
      righe.push(sc ? 'Offerte entro il ' + dataIt(sc[0]) + (sc[1] ? ' alle ' + sc[1].slice(0, 5) : '') + ' (dall\'avviso).' : r.scadenza && r.scadenza.testo ? r.scadenza.testo + '.' : 'Asta il ' + dataIt(x.dataAsta) + '.');
      b.push(testo(righe.join(' ')));
      if (x.valore && x.valore.fonte) fonti.push({ nome: 'Valore di mercato: ' + x.valore.fonte });
    });
    fonti.push(fonteRegime(modulo('Punteggio').IPOTESI.regime, ctx.T, 'Costo totale e sconto, imposte'));
    b.push(avviso('Stime indicative calcolate a regole sui dati degli avvisi: leggi sempre avviso e perizia prima di offrire.'));
    mem.ids = top.map(function (x) { return x.id; });
    return { blocchi: chiudi(b, fonti, ['Spiegami la prima', 'Buoni affari in Lombardia', 'Come si presenta l\'offerta?']), memoria: mem };
  }

  /* --- Guida --- */

  function rispondiGuida(p, ctx) {
    var T = ctx.T, C = modulo('Calcoli');
    var pos = 0;
    GUIDA.forEach(function (g, i) { if (g.id === p.voce) pos = i; });
    var g = GUIDA[pos], b = [testo(g.titolo + '. ' + g.testo)], fonti = g.fonti.slice();
    if (p.importo && g.id === 'cauzione') {
      b.push(testo('Su un\'offerta di ' + eur(p.importo) + ' la cauzione è di almeno ' + eur(p.importo * T.asta.cauzione.quota) + ' (' + pct(T.asta.cauzione.quota) + ' del prezzo offerto): l\'importo preciso è nell\'avviso.'));
      fonti.push(fTariffa(T.asta.cauzione, 'Cauzione: ' + T.asta.cauzione.fonte));
    }
    if (p.importo && g.id === 'offerta-minima') {
      b.push(testo('Con un prezzo base di ' + eur(p.importo) + ' l\'offerta minima valida è ' + eur(C.offertaMinima(p.importo, T)) + '.'));
      fonti.push(fTariffa(T.asta.offertaMinima, 'Offerta minima: ' + T.asta.offertaMinima.fonte));
    }
    b.push(avviso(AVVISO_GUIDA));
    var sugg = [];
    if (GUIDA[pos + 1]) sugg.push(GUIDA[pos + 1].domande[0]);
    if (g.id === 'costi' || g.id === 'offerta-minima') sugg.push('Quanto costa in totale un\'asta da 100.000 € come prima casa?');
    if (g.id === 'mutuo') sugg.push('Rata per 120.000 € in 25 anni al 3,5%');
    sugg.push('E poi?');
    if (pos > 0) sugg.push(GUIDA[0].domande[0]);
    return { blocchi: chiudi(b, fonti, sugg), memoria: { intento: 'guida', guida: g.id } };
  }

  function rispondiSemplice(intento) {
    var t = {
      saluto: 'Ciao! Sono il consulente d\'asta di Radar Aste Italia, in modalità semplice: capisco domande con regole fisse, senza intelligenza artificiale. Cerco tra le aste raccolte dal Portale delle Vendite Pubbliche, faccio i conti di costi, mutuo e rendimento e ti spiego come funziona l\'asta. Prova con una di queste domande.',
      aiuto: 'Posso: cercare aste per zona, tipo, prezzo, stato e data; mostrarti gli affari di oggi; spiegarti un\'asta (scrivi il codice, per esempio pvp-1234567); calcolare il costo totale, la rata del mutuo, quanto puoi spendere e il rendimento da affitto; rispondere sulla procedura (offerta, cauzione, gara, saldo, decreto, liberazione). Non invento numeri: se un dato manca te lo dico.',
      'non-capito': 'Non ho capito la domanda: funziono con regole semplici. Prova a scrivere zona, tipo di immobile e prezzo, oppure un calcolo o una domanda sulla procedura, come negli esempi qui sotto.'
    }[intento];
    return { blocchi: chiudi([testo(t)], [], ESEMPI.slice(0, 6)), memoria: {} };
  }

  /* Risposta completa. ctx = { aste, T, oggi, affari, raccolta? }; memoria = risposta.memoria precedente. */
  function rispondi(domanda, ctx, memoria) {
    ctx = copia(ctx);
    if (!ctx.oggi) ctx.oggi = oggiLocale();
    if (!ctx.T) ctx.T = root.TARIFFE || null;
    if (!ctx.aste) ctx.aste = [];
    var c = capisci(domanda, ctx, memoria || {});
    var r;
    if (!ctx.T && ['costi', 'mutuo', 'rendimento', 'spiega', 'guida'].indexOf(c.intento) >= 0) {
      r = { blocchi: [testo('Le tariffe del sito (config/tariffe.js) non sono caricate: non posso fare calcoli.')], memoria: {} };
    } else if (c.intento === 'cerca') r = rispondiCerca(c.parametri, ctx, memoria, c.seguito);
    else if (c.intento === 'spiega') r = rispondiSpiega(c.parametri, ctx);
    else if (c.intento === 'costi') r = rispondiCosti(c.parametri, ctx);
    else if (c.intento === 'mutuo') r = rispondiMutuo(c.parametri, ctx);
    else if (c.intento === 'rendimento') r = rispondiRendimento(c.parametri, ctx);
    else if (c.intento === 'affari') r = rispondiAffari(c.parametri, ctx);
    else if (c.intento === 'guida') r = rispondiGuida(c.parametri, ctx);
    else r = rispondiSemplice(c.intento);
    var mem = r.memoria || {};
    // le aste mostrate e l'ultima asta restano in memoria per "spiegami la prima" e "quanto costa?"
    if (!mem.ids && memoria && memoria.ids && c.intento !== 'cerca' && c.intento !== 'affari') mem.ids = memoria.ids;
    if (!mem.ultimaAsta && memoria && memoria.ultimaAsta && c.intento !== 'spiega') mem.ultimaAsta = memoria.ultimaAsta;
    return { intento: c.intento, parametri: pulisci(c.parametri), seguito: !!c.seguito, blocchi: r.blocchi, memoria: mem };
  }
  function pulisci(p) { var o = {}; for (var k in p) if (p[k] != null && k !== 'mancano') o[k] = Array.isArray(p[k]) ? p[k].slice() : p[k]; return o; }

  function capisciPubblico(testo, ctx, memoria) {
    var c = capisci(testo, ctx, memoria);
    return { intento: c.intento, parametri: pulisci(c.parametri), seguito: !!c.seguito };
  }

  var Consulente = { capisci: capisciPubblico, rispondi: rispondi, ESEMPI: ESEMPI, GUIDA: GUIDA,
    // per i test e per altre pagine
    _interni: { numeri: function (t) { return importi(numeri(norm(t))); }, leggiDate: leggiDate, ordinaAste: ordinaAste, filtra: filtra, eur: eur, pct: pct } };
  if (NODE) module.exports = Consulente;
  else root.Consulente = Consulente;
})(typeof window !== 'undefined' ? window : globalThis);
