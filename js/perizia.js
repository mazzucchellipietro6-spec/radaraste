/* Lettore della perizia: dal testo di una perizia di stima ai punti critici, ognuno con la frase esatta e la pagina.
 *
 * Funzioni pure (Node e browser). La pagina js/pages/perizia.js legge il PDF con pdf.js nel browser e passa qui il
 * testo, pagina per pagina: il file non lascia mai il computer di chi lo apre e nulla viene salvato.
 *
 * Come legge (regole a parole chiave, come i semafori dell'avviso in js/estrai.js, ma pensate per il testo lungo):
 *  - divide ogni pagina in frasi e righe; le righe "Campo: valore" dello schema di perizia restano separate;
 *  - salta le domande del giudice all'esperto ("quesiti": "verifichi", "accerti", "indichi"...), l'indice e i titoli,
 *    che contengono le stesse parole dei problemi senza descriverne nessuno;
 *  - una frase negata ("non sono state riscontrate difformità", "Domande giudiziali: Nessuna", "€ 0,00") conta come
 *    rassicurante, non come problema;
 *  - ipoteche e pignoramento non sono problemi per chi compra: li cancella il decreto di trasferimento.
 * Nessun dato inventato: un tema che non compare nel testo è "non trovato", e ogni punto riporta la frase da cui viene,
 * da rileggere nella perizia. È un aiuto alla lettura, non un parere tecnico. */
(function (root) {
  'use strict';

  /* ---------- utilità ---------- */
  // Le regole lavorano su una copia "piatta" della frase, lunga uguale: lettere accentate senza accento, apostrofi tipografici
  // dritti, accento scritto con l'apostrofo ("e'", "PIU’") reso come lettera e spazio. Così "servitù.", "agibilità n." e
  // "è stato" valgono come "servitu", "agibilita", "e stato" (in JavaScript \\b e \\w non conoscono le lettere accentate);
  // gli estratti si tagliano dalla frase originale con gli stessi indici.
  var ACCENTI = { 'à': 'a', 'á': 'a', 'â': 'a', 'ä': 'a', 'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e', 'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
    'ò': 'o', 'ó': 'o', 'ô': 'o', 'ö': 'o', 'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u', 'ç': 'c', '’': "'", '‘': "'", '`': "'", '´': "'" };
  function senzaAccenti(t) {
    return String(t || '').replace(/[àáâäèéêëìíîïòóôöùúûüç’‘`´ÀÁÂÄÈÉÊËÌÍÎÏÒÓÔÖÙÚÛÜÇ]/g, function (c) {
      var l = c.toLowerCase(), b = ACCENTI[l] || c;
      return c === l ? b : b.toUpperCase();
    });
  }
  function piatto(t) { return senzaAccenti(t).replace(/([aeiouAEIOU])'(?=[\s.,;:)"»]|$)/g, '$1 '); }
  // regola scritta con gli accenti → regola per il testo piatto
  function R(re) { return re ? new RegExp(senzaAccenti(re.source), re.flags) : re; }
  function spazi(s) { return String(s || '').replace(/[  -​  　\t]+/g, ' ').replace(/ {2,}/g, ' ').trim(); }
  function numero(s) {
    var t = String(s).replace(/\s/g, '');
    if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    else t = t.replace(',', '.');
    var n = parseFloat(t);
    return isFinite(n) ? n : null;
  }
  // "€ 1.234,56", "euro 1.234", "1.234,56 €", "Euro 0,00" → numero (o null)
  var IMPORTO = R(/(?:€|\beuro\b|\beur\b\.?)\s*(\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)|(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+,\d{2})\s*(?:€|\beuro\b)/i);
  // il primo importo vero: "450 €/mq" o "€ 650 al mq" sono prezzi al metro quadro, non costi
  function importoIn(t) {
    var testo = String(t || ''), re = new RegExp(IMPORTO.source, 'gi'), m;
    while ((m = re.exec(testo))) {
      var dopo = testo.slice(m.index + m[0].length, m.index + m[0].length + 14);
      if (/^\s*(?:\/|al|per|a)\s*(?:mq|m2|m²|m\.q|metr|ettar|ha\b|anno|mese)/i.test(dopo) || /\/\s*(?:mq|m2|m²)\s*$/i.test(testo.slice(Math.max(0, m.index - 6), m.index + 2))) continue;
      var n = numero((m[1] || m[2]).replace(/\s/g, '.'));
      if (n != null) return { valore: n, indice: m.index, fine: m.index + m[0].length };
    }
    return null;
  }

  /* ---------- da testo di pagina a frasi ---------- */
  var INIZIO_VOCE = /^\s*(?:\(?\d{1,2}(?:\.\d{1,2}){0,3}[.)]?\s+|[a-z]\)\s+|[-–•·▪►✓*]\s+|[IVX]{1,4}[.)]\s+)/;
  // divide una riga lunga in frasi al punto (o ; ! ?) seguito da spazio e maiuscola, senza lookbehind (vecchi Safari)
  function frasiDiRiga(r) {
    var out = [], inizio = 0, re = /[.;!?]["»)]?\s+(?=["«(]?[A-ZÀ-Ý0-9])/g, m;
    while ((m = re.exec(r))) {
      var pezzo = r.slice(inizio, m.index + m[0].length).trim();
      // "art. 63", "n. 12", "pag. 3", "Sig. Rossi", "f. 12": abbreviazioni, non fine frase
      if (/(?:\b(?:art|artt|n|nn|pag|pagg|sig|sigg|dott|ing|geom|arch|avv|f|fg|sub|mapp|part|p\.lla|prot|rep|racc|reg|vol|lett|co|c\.c|c\.p\.c|d\.p\.r|d\.lgs|l|cfr|ecc|es|s\.p\.a|s\.r\.l|tel|int|sc|cap|civ)\.)\s*$/i.test(r.slice(Math.max(0, m.index - 8), m.index + 1))) continue;
      if (pezzo) out.push(pezzo);
      inizio = m.index + m[0].length;
    }
    var resto = r.slice(inizio).trim();
    if (resto) out.push(resto);
    return out;
  }
  var CONTINUA = /(?:\b(?:di|del|dello|della|dei|degli|delle|e|ed|o|od|che|a|ad|in|con|per|tra|fra|il|lo|la|le|i|gli|un|uno|una|al|allo|alla|ai|agli|alle|dal|dallo|dalla|dai|dagli|dalle|nel|nello|nella|nei|negli|nelle|sul|sullo|sulla|sui|sugli|sulle|da|su|come|cui|quale|quali|non|è|sono|n\.|sig\.|sig\.ra|via|viale|piazza|corso|località|comune|foglio|mappale|particella|sub\.?|art\.?|pari|circa)|[,(\-–/]|\b(?:l|dell|all|dall|nell|sull|un|quest|quell|tutt|c|d|s|n|po)['’])$/i;
  // testo di una pagina → righe logiche (le righe spezzate a metà frase si riuniscono)
  function righe(testoPagina) {
    var grezze = String(testoPagina || '').replace(/\r\n?/g, '\n').split('\n').map(spazi), out = [], cur = '';
    for (var i = 0; i < grezze.length; i++) {
      var r = grezze[i];
      if (!r) { if (cur) { out.push(cur); cur = ''; } continue; }
      if (!cur) { cur = r; continue; }
      // parola spezzata con il trattino a fine riga: "sana-" + "bile"
      if (/[a-zà-ÿ]-$/.test(cur) && /^[a-zà-ÿ]/.test(r)) { cur = cur.slice(0, -1) + r; continue; }
      var voce = INIZIO_VOCE.test(r), minuscola = /^[a-zà-ÿ(,;]/.test(r);
      // "Stato di possesso:" + "Occupato" / "Nessuna" / "€ 0,00": il valore breve va con il suo campo
      if (/:$/.test(cur) && !voce && r.length <= 50 && !/:\s*$/.test(r)) { cur += ' ' + r; continue; }
      // la frase continua: riga dopo in minuscolo, riga prima che finisce con una preposizione, un articolo o una virgola,
      // importo o numero a capo ("pari a" + "€ 3.000"); altrimenti riga nuova (voce di elenco, "Campo: valore", titolo)
      var continua = !voce && (minuscola || CONTINUA.test(cur) || (/^(?:€|euro\b|\d)/i.test(r) && !/[.;!?:]["»)]?$/.test(cur) && !/(?:€|euro)\s*[\d.,]+$|\d,\d{2}$/i.test(cur)));
      if (!continua) { out.push(cur); cur = r; continue; }
      cur += ' ' + r;
    }
    if (cur) out.push(cur);
    return out;
  }
  function frasi(testoPagina) {
    var out = [];
    righe(testoPagina).forEach(function (r) { frasiDiRiga(r).forEach(function (f) { out.push(f); }); });
    return out;
  }

  /* ---------- frasi da non leggere come fatti ---------- */
  // domande del giudice all'esperto (congiuntivo esortativo): "verifichi la regolarità urbanistica...", "in caso di opere
  // abusive, controlli la possibilità di sanatoria". L'esperto risponde all'indicativo ("si precisa", "si rileva").
  var QUESITO = R(/\b(?:verifichi|accerti|indichi|precisi|provveda|descriva|riferisca|segnali|predisponga|alleghi|individui|determini|controlli|acquisisca|rediga|specifichi|evidenzi|quantifichi|identifichi|elenchi|illustri|formuli|proceda|rilevi|stimi|effettui|chiarisca|esamini|depositi|invii|trasmetta|sospenda|informi|comunichi|accerterà|verificherà|indicherà|l'esperto\s+(?:dovr[àa]|deve|dovrà\s+inoltre)|quesit[oi])\b/i);
  // indice: puntini di guida o numero di pagina in fondo alla riga corta
  var INDICE = R(/\.{4,}|…{2,}|_{4,}|\bpag(?:ina|\.)?\s*\d{1,3}\s*$/i);
  function daSaltare(f) {
    if (f.length < 8) return true;
    if (QUESITO.test(f)) return true;
    if (INDICE.test(f) && f.length < 140 && !/[€]|\beuro\b/i.test(f)) return true;
    // voce di indice senza puntini: "Abusi edilizi 18"
    if (f.length < 60 && /\s\d{1,3}$/.test(f) && !/[:€]|\beuro\b/i.test(f)) return true;
    // elenco degli allegati in fondo alla perizia: "39) Istanza del CTU... per accatastamento"
    if (/^\(?\d{1,3}[.)]\s*(?:allegat|istanz|e-?mail|mail|pec\b|foto|visur|planimetri|estratt|copia|verbal|nota\b|comunicazion|richiest|letter|certificat|ricevut|ispezion|elaborat|documentazion|atto\b|contratt)/i.test(f)) return true;
    // titolo senza valore ("VINCOLI ED ONERI GIURIDICI", "Vincoli ed oneri ... a carico dell'acquirente:")
    if (/:\s*$/.test(f)) return true;
    var lettere = f.replace(/[^A-Za-zÀ-ÿ]/g, ''), maiuscole = f.replace(/[^A-ZÀ-Ý]/g, '').length;
    if (lettere.length >= 6 && maiuscole / lettere.length > 0.8 && !/\b(?:NON|NESSUN\w*|LIBER[OA]|OCCUPAT\w*|CONFORME|LOCAT\w*)\b/.test(f)) return true;
    return false;
  }

  /* ---------- negazioni ---------- */
  // Parole che negano. Non "mai" ("veranda mai autorizzata" è un abuso) né "né" da solo: nel testo piatto "né" e il
  // pronome "ne" ("Ne consegue che le opere sono abusive") sono uguali; vale solo la coppia "né... né".
  var NEG_PAROLA = R(/\bnon\b|\bnessun\w*|\bassenz\w*|\bsenza\b|\bne\s+(?:[\w']+[\s,]+){0,4}?ne\b|\bniente\b|\besclus[oaie]\b|\binesistent\w*/i);
  // dopo la negazione comincia un'altra frase, che la negazione non tocca: "non è recintato e presenta infiltrazioni",
  // "non è abitato, ma presenta muffa", "senza contare la tettoia, sono presenti difformità"
  var STACCO = R(/\b(?:ma|però|tuttavia|mentre|bensì|eccetto|salvo)\b|\b(?:e|ed)\s+(?:si\s+)?(?:presenta\w*|rilev\w*|riscontr\w*|evidenzi\w*|mostra\w*|risult\w*|ha|hanno|sono)\b|\bed\s+è\b|,\s*(?:è|sono|risulta\w*)\s+(?:stat[aoie]\s+)?(?:present|rilevat|riscontrat|evidenziat)\w*|,\s*si\s+(?:rilev|riscontr|evidenzi|segnal|precisa)\w*/i);
  // negazione nella stessa frase, prima della parola del problema (al massimo 70 caratteri, senza . ; : in mezzo)
  function negataPrima(prima) {
    var seg = prima.slice(Math.max(prima.lastIndexOf('.'), prima.lastIndexOf(';'), prima.lastIndexOf(':')) + 1);
    var re = new RegExp(NEG_PAROLA.source, 'gi'), x, ultima = null;
    while ((x = re.exec(seg))) ultima = x;
    return !!ultima && !STACCO.test(seg.slice(ultima.index + ultima[0].length));
  }
  // doppia negazione: "non si può escludere la presenza di amianto" segnala un rischio, non lo esclude
  var NON_ESCLUDE = R(/\bnon\s+(?:si\s+)?(?:pu[òo]|possa|potrebbe|potendo|può\s+essere|è\s+possibile)\s+(?:essere\s+)?esclud\w*|\bnon\s+(?:è|sia|risulta)\s+(?:da\s+)?esclud\w*|\bnon\s+esclud\w*|\bnon\s+(?:si\s+)?(?:conosc|sa|sapere|verificabil|accertabil|determinabil)\w*/i);
  // subito dopo la parola: "difformità non riscontrate", "abusi: nessuno"
  var NEG_SUBITO = R(/^\s{0,2}(?:[:=–-]\s*)?(?:nessun\w*|non\s+(?:sono|è|risult\w*|present\w*|rilevat\w*|riscontrat\w*|si\s+rilev\w*|esist\w*|emers\w*|vi\s+sono|ce\s+ne\s+sono)|assent\w*|inesistent\w*|esclus[oaie]\b|nulla\b|niente\b|negativ\w*)/i);
  // riga "Campo: valore" dello schema di perizia: "Domande giudiziali o altre trascrizioni pregiudizievoli: Nessuna."
  var NEG_CAMPO = R(/^[^.;:]{0,90}[:=]\s*(?:nessun\w*|non\s+(?:sono\s+|risult\w*\s+|present\w*|rilevat\w*|riscontrat\w*)|assent\w*|inesistent\w*|esclus[oaie]\b|nulla\b|niente\b|negativ\w*|no\b)/i);
  // negata davanti (solo i temi "negabili") o dopo (tutti): la parola del problema descrive un'assenza
  function negata(f, m, davanti) {
    var prima = f.slice(Math.max(0, m.index - 70), m.index), dopo = f.slice(m.index + m[0].length, m.index + m[0].length + 140);
    // "€ 0,00" subito dopo un'etichetta di costo o di debito
    var imp = importoIn(dopo);
    if (imp && imp.indice < 25 && imp.valore === 0) return true;
    if (NEG_SUBITO.test(dopo) || NEG_CAMPO.test(dopo)) return true;
    // "non direttamente occupata dall'impianto", "non è abusivo": negazione subito prima, vale per tutti i temi
    if (/\bnon\s+(?:[\wàèéìòù'’]+\s+){0,2}$/i.test(f.slice(Math.max(0, m.index - 30), m.index)) && !NON_ESCLUDE.test(f.slice(Math.max(0, m.index - 40), m.index + 12))) return true;
    // "liberi da pesi, vincoli e servitù", "libero da iscrizioni e trascrizioni pregiudizievoli": formula di assenza
    if (LIBERO_DA.test(prima)) return true;
    return !!davanti && negataPrima(prima) && !NON_ESCLUDE.test(prima);
  }
  // "libero da" seguito solo da nomi di pesi e formalità fino alla parola del problema
  var LIBERO_DA = R(/\bliber[oaie]\s+da\s+(?:(?:pesi|oneri|vincoli|servitù|gravami|iscrizioni|trascrizioni|ipoteche|formalità|diritti|privilegi|reali|di|terzi|pregiudizievoli|e|ed|o|ovvero)[\s,]+)*$/i);

  /* ---------- temi ---------- */
  // Ogni tema: problemi (parole dei problemi), ok (frasi rassicuranti esplicite), ambito (la frase deve riguardare il
  // tema, per le parole generiche come "difformità"), fuori (frasi di un altro tema), negabile (una negazione davanti
  // trasforma il problema in segnale rassicurante: no per i temi le cui parole contengono già la negazione).
  var URB = R(/urbanistic|edilizi|abus|sanatori|condon|permess\w*\s+di\s+costruire|concession\w*|licenz\w*\s+edilizi|titol\w*\s+(?:edilizi|abilitativ)|\bs\.?c\.?i\.?a\b|\bc\.?i\.?l\.?a\b|\bd\.?i\.?a\b|progett\w*\s+(?:approvat|assentit|autorizzat)|stato\s+legittim|demoli/i);
  var CAT = R(/catast|planimetri|visur|docfa|accatast|n\.?c\.?e\.?u|subaltern|mappal/i);
  var TEMI = [
    { chiave: 'urbanistica', titolo: 'Abusi edilizi e conformità urbanistica', gravita: 'alta',
      spiegazione: 'Le opere senza titolo edilizio vanno sanate (costi e tempi a carico di chi compra) o, se non sanabili, demolite. Un abuso non sanabile può rendere difficile anche il mutuo.',
      dove: 'capitolo sulla regolarità urbanistica (o "conformità edilizia")',
      problemi: /\babusiv\w*|\babus[oi]\b|\bdifformit\w*|\bnon\s+(?:(?:è|sono|risulta|risultano|appare|appaiono|sia|siano)\s+)?(?:(?:pienamente|completamente|perfettamente|totalmente|interamente|del\s+tutto)\s+)?conform\w*|\bnon\s+(?:(?:è|sono|risulta|risultano|appare|appaiono|sia|siano)\s+)?sanabil\w*|\binsanabil\w*|\bnon\s+(?:(?:è|sono|risulta|risultano|appare|appaiono|sia|siano)\s+)?regolarizzabil\w*|\birregolarit\w*|\bda\s+sanare\b|\bsanabil\w*|\bfiscalizzazion\w*|\bordinanz\w*\s+di\s+demolizion\w*|\bda\s+demolire\b|\bripristin\w*\s+(?:dello\s+)?stato\s+dei\s+luoghi|\bin\s+assenza\s+di\s+titol\w*|\bsenza\s+(?:alcun\s+)?(?:titol\w*|permess\w*|licenz\w*|concession\w*)\s+edilizi\w*|\bdomand\w*\s+di\s+condono\s+(?:non\s+(?:ancora\s+)?definit\w*|pendent\w*|in\s+corso)/i,
      ok: /\b(?:conformit\w*\s+(?:urbanistic\w*|edilizi\w*)(?:[-\s]\w+)?|regolarit\w*\s+(?:urbanistic\w*|edilizi\w*))[^.;]{0,50}?\b(?:conform\w*|sussist\w*|regolar\w*|verificat\w*\s+positiv)|\b(?:è|risulta|risultano|si\s+presenta)\s+(?:urbanisticamente\s+)?(?:conform\w*|regolar\w*)\s+(?:sotto\s+il\s+profilo\s+|dal\s+punto\s+di\s+vista\s+|al(?:le|lo)?\s+|all'\s*|ai\s+|agli\s+)?(?:urbanistic|edilizi|titol|progett|licenz|concession|permess)/i,
      ambito: URB, fuori: /\boccup\w*\s+abusiv|abusivamente\s+occupat|occupant\w*\s+abusiv/i, catastoEscluso: true, negabile: true },
    { chiave: 'catasto', titolo: 'Conformità catastale', gravita: 'media',
      spiegazione: 'Se la planimetria catastale non corrisponde allo stato dei luoghi serve un aggiornamento (pratica DOCFA): di solito poche centinaia di euro, ma senza conformità catastale non si stipula il rogito di un eventuale mutuo.',
      dove: 'capitolo sulla conformità catastale',
      problemi: /\bdifformit\w*|\bnon\s+(?:(?:è|sono|risulta|risultano|appare|appaiono|sia|siano)\s+)?(?:(?:pienamente|completamente|perfettamente|totalmente|interamente|del\s+tutto)\s+)?(?:conform|corrispond)\w*|\bdiscrepanz\w*|\bincongruenz\w*|\bnon\s+(?:è\s+|risulta\s+)?(?:accatastat|censit|aggiornat)\w*|\bmancat\w*\s+accatastament\w*|\bnon\s+(?:è\s+|risulta\s+|sono\s+)?(?:riportat|rappresentat|indicat|inserit|graficizzat)\w*\s+(?:nella|nelle|in|sulla|sulle)\s+(?:planimetri|mappa|scheda)\w*|\bplanimetri\w*\s+(?:catastal\w*\s+)?(?:non\s+(?:conform|corrispond|aggiornat|present|reperit|depositat)\w*|assent\w*|mancant\w*|errat\w*|difform\w*)|\b(?:necessari\w*|occorre|occorrerà|si\s+rende\s+necessari\w*)\s+(?:una?\s+|l[ao']\s*)?(?:pratica\s+)?(?:docfa|variazion\w*\s+catastal\w*|aggiornament\w*\s+catastal\w*)/i,
      ok: /\b(?:conformit\w*\s+catastal\w*|planimetri\w*\s+catastal\w*|dati\s+catastal\w*)[^.;]{0,60}?\b(?:conform\w*|corrispond\w*|sussist\w*|regolar\w*|coeren\w*)|\b(?:conform\w*|corrispond\w*)\b[^.;]{0,40}\bplanimetri\w*\s+catastal\w*/i,
      ambito: CAT, negabile: true },
    { chiave: 'occupazione', titolo: 'Chi abita l\'immobile', gravita: 'alta',
      spiegazione: 'Un immobile occupato dal debitore viene di solito liberato dal custode, ma servono mesi. Un contratto di affitto registrato prima del pignoramento (opponibile) va rispettato fino alla scadenza; anche l\'assegnazione della casa coniugale può esserlo.',
      dove: 'capitolo "stato di possesso" (o "stato di occupazione")',
      problemi: /\bcontratt\w*\s+di\s+(?:locazione|affitt\w*|comodato)[^.;]{0,40}?\bnon\s+(?:(?:è|risulta)\s+)?(?:(?:stat[oa]|ancora)\s+)?(?:opponibil|registrat)\w*|\boccupat\w*\s+(?:dal(?:l[ao'’])?|dai|dagli|da|con|senza)\b(?!\s*(?:[\w'’]+\s+){0,2}?(?:beni|cose|mobili|material|masseriz|arred|rifiut|macerie|attrezzatur|merc[ie]|veicol|automezz|suppellettil|oggett|vegetazion|sterpaglie|acqua|detriti|impiant|struttur|costruzion|fabbricat|manufatt|edific|pannell|serr[ae]|tettoi|piazzal|strad))|\boccupant\w*\s+(?:senza\s+titolo|abusiv\w*|non\s+autorizzat\w*)|\butilizzat\w*\s+(?:dal|dalla|dai)\s+[^.;]{0,60}?\ba\s+titolo\s+di\b|\bocc?upazione\s+(?:abusiv|senza\s+titol)\w*|\babusivamente\s+occupat\w*|\blocat\w*\s+(?:a|al|alla|ai|con)\b|\bcontratt\w*\s+di\s+(?:locazione|affitt\w*|comodato)|\bconcess\w*\s+in\s+(?:locazione|affitt\w*|comodato)|\bin\s+affitto\b|\bcomodato\b|\bassegnat\w*\s+(?:al|alla)\s+(?:coniuge|ex\s+coniuge|moglie|marito)|\bcasa\s+(?:familiare|coniugale)|\bsenza\s+titolo\b|\bopponibil\w*|\bstato\s+di\s+(?:possesso|occupazione)\s*[:.-]?\s*occupat\w*|\b(?:risulta|risultano|risultava|appare|appaiono|si\s+presenta|attualmente|tuttora)\s+(?:attualmente\s+|ancora\s+|tuttora\s+)?occupat[oaie]\b(?!\s*(?:da|dal|dall|dalla|dallo|dai|dagli|dalle|con|senza)\b)/i,
      ok: /\b(?:è|risulta|risultava|appare|si\s+presenta|si\s+trova|trovato|trovata|attualmente)\s+(?:attualmente\s+|ancora\s+|oggi\s+)?liber[oa]\b(?!\s+da\s+(?:pesi|oneri|vincol|servit|gravam|iscrizion|trascrizion|ipotec|formalit|diritt|privileg))|\bliber[oa]\s+(?:da\s+persone|e\s+disponibil|da\s+cose|e\s+sgombr)|\bstato\s+di\s+(?:possesso|occupazione)\s*[:.-]?\s*liber[oa]\b|\bnon\s+(?:è\s+|risulta\s+)?(?:occupat|abitat|locat)\w*|\bdisabitat\w*|\bnella\s+(?:piena\s+)?disponibilit\w*\s+della\s+procedura/i,
      soggetto: /immobil|appartament|unit[àa]|\bben[ei]\b|fabbricat|abitazion|villa|alloggi|local[ei]\b|lott[oi]\b|\bbox\b|garage|negozi|capannon|possesso|occupazion|porzion|edifici/i,
      fuori: /verific\w*\s+(?:l['’]\s*)?esistenza|esistenza\s+di\s+(?:eventuali\s+)?contratt|\beventual\w*\s+contratt|richiest\w*\s+(?:formal\w*\s+)?(?:all['’]\s*|alla\s+|di\s+)?(?:agenzia|ufficio|anagrafe)|\binterrogazion\w*/i,
      negabile: false, okNegato: true },
    { chiave: 'vincoli', titolo: 'Vincoli, servitù e diritti di altri', gravita: 'alta',
      spiegazione: 'Servitù, usufrutto, diritto di abitazione, edilizia convenzionata (prezzo massimo di rivendita), vincoli paesaggistici o storici e domande giudiziali restano a carico di chi compra: il decreto di trasferimento non li cancella.',
      dove: 'capitolo "vincoli ed oneri giuridici" (formalità che resteranno a carico dell\'acquirente)',
      problemi: /\bservit[uù]\b|\busufrutt\w*|\bdiritt\w*\s+di\s+(?:abitazione|uso|superficie)|\bpropriet\w*\s+superficiari\w*|\busi\s+civic\w*|\buso\s+civico|\blivell\w*\s+(?:a\s+favore|enfiteutic)|\benfiteus\w*|\bvincol\w*\s+(?:paesaggistic|paesistic|storic|artistic|archeologic|idrogeologic|monumental|cimiterial|di\s+inedificabilit|di\s+destinazione|di\s+(?:non\s+)?alienabilit|ambiental|forestal|ex\s+lege|ai\s+sensi\s+del\s+d\.?\s*lgs)\w*|\bprelazion\w*|\bediliz\w*\s+(?:residenziale\s+)?(?:convenzionat|economica\s+e\s+popolare|agevolat|sovvenzionat|residenziale\s+pubblica)\w*|\bp\.?e\.?e\.?p\.?\b|\bprezzo\s+massimo\s+di\s+(?:cessione|vendita)|\bconvenzion\w*\s+(?:urbanistic\w*|edilizi\w*|con\s+il\s+comune|ex\s+art|ai\s+sensi)|\batt\w*\s+d\w*\s+asserviment\w*|\bdomand\w*\s+giudizial\w*|\bsequestr\w*|\bfondo\s+patrimonial\w*|\btrascrizion\w*\s+(?:\w+\s+){0,2}pregiudizievol\w*|\b(?:non\s+saranno|non\s+verranno|non\s+potranno\s+essere)\s+cancellat\w*/i,
      ok: /\b(?:non\s+(?:risultano|sussistono|esistono|gravano|sono\s+(?:presenti|stati\s+(?:rilevati|riscontrati)))|nessun\w*|assenza\s+di|libero\s+da)\s+(?:\w+\s+){0,3}?(?:vincol|servit|oner|gravam|diritt|trascrizion|domand|formalit)\w*/i,
      fuori: /\bipotec\w*|\bpignorament\w*|\bsaranno\s+cancellat\w*|\bcancellazion\w*\s+(?:delle\s+)?formalit|a\s+cura\s+e\s+spese\s+della\s+procedura/i, negabile: true, okNegato: true },
    { chiave: 'condominio', titolo: 'Spese condominiali arretrate', gravita: 'media',
      spiegazione: 'Chi compra risponde con il debitore delle spese condominiali dell\'anno in corso e di quello precedente (art. 63 disp. att. c.c.). Le spese straordinarie già deliberate possono pesare molto.',
      dove: 'capitolo sulle spese condominiali (o "oneri condominiali")',
      problemi: /\b(?:spes\w*|oner\w*|quot\w*|rat\w*)\s+condominial\w*\s+(?:\w+\s+){0,5}?(?:insolut\w*|arretrat\w*|scadut\w*|non\s+(?:pagat|versat|saldat|corrispost)\w*|da\s+pagare|morosit\w*)|\b(?:debit\w*|morosit\w*|insolut\w*|arretrat\w*|pendenz\w*|esposizion\w*)\s+(?:\w+\s+){0,5}?(?:condomin\w*)|\b(?:spes\w*|lavor\w*|interventi?)\s+(?:\w+\s+){0,3}?straordinar\w*\s+(?:\w+\s+){0,4}?(?:deliberat|approvat)\w*/i,
      ok: /\bnon\s+(?:è\s+|risulta\s+)?costituit\w*\s+(?:alcun\s+|il\s+)?condomini\w*|\bnon\s+(?:esiste|vi\s+è|c'è)\s+(?:alcun\s+|un\s+)?condomini\w*|\b(?:non\s+risultano|nessun\w*)\s+(?:\w+\s+){0,3}?(?:spes|debit|insolut|morosit|arretrat)\w*\s+(?:\w+\s+){0,2}condomin\w*/i,
      ambito: /condomin|straordinar/i, negabile: true, okNegato: true, importi: true },
    { chiave: 'agibilita', titolo: 'Agibilità (abitabilità)', gravita: 'media',
      spiegazione: 'Senza certificato o segnalazione di agibilità l\'immobile si può comprare, ma alcune banche non danno il mutuo e per ottenerla possono servire lavori e pratiche.',
      dove: 'capitolo sulla regolarità urbanistica, alla voce agibilità o abitabilità',
      problemi: /\b(?:privo|priva|privi|prive|sprovvist\w*|senza|mancan\w*|assenza)\s+(?:del(?:l[a'’]|la)?\s*|di\s+)?(?:certificat\w*\s+(?:di\s+)?|segnalazion\w*\s+(?:certificata\s+)?(?:di\s+|per\s+l'\s*)?|dichiarazion\w*\s+(?:di\s+)?)?(?:agibilit|abitabilit)\w*|\b(?:agibilit|abitabilit)\w*\s*[:.-]?\s*(?:non\s+(?:è\s+stat[oa]\s+)?(?:rilasciat|present|reperit|risulta|richiest|depositat)\w*|assent\w*|mancant\w*|non\s+presente)|\bnon\s+(?:(?:risulta|risultano|è|sono)\s+)?(?:(?:stat[oaie]|mai|ancora)\s+)*(?:rilasciat\w*|richiest\w*|presentat\w*|depositat\w*|reperit\w*|present[ei]|dotat\w*\s+d\w*|in\s+possesso\s+d\w*)\s+(?:(?:il|la|i|le|alcun[oa]?)\s+|l'\s*)?(?:(?:certificat\w*|segnalazion\w*|dichiarazion\w*|attestazion\w*)\s+(?:certificata\s+)?)?(?:di\s+|d'\s*|per\s+l'\s*)?(?:agibilit|abitabilit)\w*/i,
      ok: /\b(?:certificat\w*|dichiarazion\w*|segnalazion\w*|attestazion\w*)\s+(?:certificata\s+)?(?:di\s+|d'\s*)?(?:agibilit|abitabilit)\w*\s+(?:n\.|n°|numero|rilasciat|del\s+\d|prot|in\s+data|è\s+stat[oa]\s+rilasciat|presentat|depositat)|\b(?:agibilit|abitabilit)\w*\s+(?:è\s+stat[oa]\s+|risulta\s+)?(?:rilasciat|attestat)\w*/i,
      negabile: false },
    { chiave: 'impianti', titolo: 'Impianti', gravita: 'bassa',
      spiegazione: 'Impianti senza dichiarazione di conformità o da adeguare sono un costo in più da mettere in conto prima dell\'offerta.',
      dove: 'descrizione dell\'immobile, alla voce impianti',
      problemi: /\bimpiant\w*\s+(?:[\w'’]+\s+){0,4}?(?:non\s+(?:(?:è|sono|risulta|risultano|appare|appaiono|sia|siano)\s+)?(?:a\s+norma|conform\w*|certificat\w*|funzionant\w*|adeguat\w*|collaudat\w*|verificabil\w*)|priv[oiae]\s+(?:di|della|delle|dei)\s+(?:dichiarazion|certificazion|certificat)\w*|da\s+(?:adeguare|rifare|revisionare|sostituire|ripristinare|mettere\s+a\s+norma)|obsolet\w*|fatiscent\w*|vetust\w*|fuori\s+norma|dismess\w*|distaccat\w*|scollegat\w*|assent\w*|inesistent\w*|non\s+presenti)|\b(?:dichiarazion|certificazion)\w*\s+di\s+conformit\w*\s+(?:degli\s+impianti\s+|dell'impianto\s+)?[:\s-]*(?:non\s+(?:è\s+stat[ae]\s+|sono\s+stat[ei]\s+)?(?:reperit|present|rilasciat|disponibil|fornit|prodott)\w*|assent\w*|mancant\w*)/i,
      ok: /\bimpiant\w*\s+(?:[\w'’]+\s+){0,4}?(?:a\s+norma|conformi\b|certificat\w*|dotat\w*\s+di\s+(?:dichiarazione|certificazione)|in\s+buono\s+stato|funzionant\w*)/i,
      negabile: false },
    { chiave: 'conservazione', titolo: 'Stato di conservazione', gravita: 'media',
      spiegazione: 'Infiltrazioni, umidità, crepe, amianto o un immobile da ristrutturare sono costi da stimare con un tecnico prima dell\'offerta.',
      dove: 'descrizione dell\'immobile e stato di manutenzione',
      problemi: /\binfiltrazion\w*|\bumidit[aà]\b|\bmuff\w*|\bcondens\w*\s+(?:sulle|alle|nelle|di)\s+(?:paret|mur|soffitt)|\bcrep(?:a|e|at\w*|olat\w*|olatur\w*)\b|\blesion\w*|\bfessur\w*|\bcediment\w*|\bdistacc\w*\s+(?:di\s+|dell[e']\s*|degli\s+)?(?:intonac|pavimentaz|rivestiment|piastrell|frontalin|calcestruzz|copriferro)\w*|\bamianto\b|\beternit\b|\bfibrocemento\b|\bfatiscent\w*|\b(?:pessim|scadent|mediocr|precari|cattiv)\w*\s+(?:stato|condizion\w*)|\b(?:stato|condizion\w*)\s+(?:di\s+)?(?:manutenzione|conservazione)\s*[:.-]?\s*(?:pessim|scadent|mediocr|precari|cattiv)\w*|\bda\s+ristrutturar\w*|\bnecessit\w*\s+di\s+(?:importanti\s+|ingenti\s+|radicali\s+|consistenti\s+|urgenti\s+)?(?:lavori|interventi|opere)|\bristrutturazion\w*\s+(?:complet|integral|radical|total)\w*|\binagibil\w*|\bnon\s+agibil\w*|\bdegrad\w*|\bin\s+stato\s+di\s+abbandon\w*|\bvandalizzat\w*|\bal\s+grezzo\b|\bal\s+rustico\b|\bnon\s+ultimat\w*|\bdanneggiat\w*|\bcrollat\w*|\bpericolant\w*|\brude(?:re|ri)\b|\bdirut\w*|\bcollabent\w*/i,
      ok: /\b(?:buon|ottim|discret|normal|sufficient)\w*\s+(?:stato|condizion\w*)\s+(?:di\s+|d'\s*)?(?:manutenzione|conservazione|uso|d'uso)|\b(?:stato|condizion\w*)\s+(?:di\s+)?(?:manutenzione|conservazione)\s*[:.-]?\s*(?:buon|ottim|discret|normal|sufficient)\w*|\b(?:recentemente|di\s+recente)\s+ristrutturat\w*/i,
      soggetto: /immobil|appartament|unit[àa]|\bben[ei]\b|fabbricat|abitazion|villa|alloggi|local[ei]\b|edifici|stabile\b|palazzin|box\b|garage|capannon|negozi|interni|finiture|facciat/i,
      // cantine, box e soffitte "al rustico" o "al grezzo" sono la norma, non un difetto (caso reale: "ripostiglio cantina al rustico")
      scarta: function (f, m) { return /^al\s+(?:rustico|grezzo)/i.test(m[0]) && /(?:cantin|box\b|garage|autorimess|ripostigl|deposit|soffitt|sottotett|locale\s+tecnico|legnai|magazzin)\w*[^.;]{0,40}$/i.test(f.slice(Math.max(0, m.index - 60), m.index)); },
      okFuori: /mantener\w*|interventi\s+ammess\w*|normativ\w*|norme\s+tecnich\w*|piano\s+regolator\w*|\bp\.?r\.?g\b|\bp\.?g\.?t\b|\bdevono\b|\bdovranno\b|\bdeve\s+essere\b|consentit\w*/i,
      fuori: /\bumidit[aà]\s+relativ|\blesion\w*\s+personal|\bdegrado\s+(?:urbano|sociale)\b(?!.*immobil)|(?:\d+,\d{2,3}\s+){2,}/i, negabile: true },
    { chiave: 'quota', titolo: 'Si vende solo una parte del diritto', gravita: 'alta',
      spiegazione: 'Comprare una quota (per esempio 1/2) o la sola nuda proprietà significa condividere il bene con altri o non poterlo usare: rivendere e ottenere un mutuo è molto più difficile.',
      dove: 'prima parte della perizia, alla voce "diritto reale" o "quota"',
      problemi: null, test: quota,
      ok: /\b(?:piena\s+propriet\w*|propriet\w*\s+piena)\s+(?:per\s+)?(?:l'intero|la\s+quota\s+(?:di\s+)?(?:1\s*\/\s*1|100\s*%|intera))|\bquota\s+(?:di\s+|pari\s+a\s+)?(?:1\s*\/\s*1|1000\s*\/\s*1000|100\s*%|l'intero)\b|\bper\s+l'intero\b/i,
      negabile: false },
    { chiave: 'costi', titolo: 'Costi indicati dal perito', gravita: 'info',
      spiegazione: 'Sanatorie, ripristini, aggiornamenti catastali e altre spese che il perito mette a carico di chi compra, spesso già tolte dal valore di stima. Vanno sommati al prezzo.',
      dove: 'capitolo sulla stima, alla voce "adeguamenti e correzioni" o "deprezzamenti"',
      problemi: /\b(?:cost\w*|spes\w*|oner\w*|import\w*)\s+(?:[\w']+\s+){0,8}?(?:regolarizzazion|sanatori|ripristin|demolizion|messa\s+in\s+pristino|aggiornament\w*\s+catastal|docfa|pratic\w*\s+edilizi|adeguament|bonifica|smaltiment|rimozion)\w*|\b(?:deprezzament|decurtazion|abbattiment|riduzion)\w*\s+(?:\w+\s+){0,4}?(?:per|del|dovut)\w*\s+(?:\w+\s+){0,4}?(?:regolarizzazion|sanatori|ripristin|stato|vizi|occupazion|oneri|spese|lavori|difformit|mancanz)\w*|\bdetratt\w*\s+(?:dal|al)\s+valore|\b(?:deprezzat|svalutat|ridott|abbattut|decurtat|riduzion|deprezzament|abbattiment|decurtazion)\w*\s+(?:del|di\s+un|nella\s+misura\s+del|pari\s+al)\s+\d{1,2}(?:,\d+)?\s*%|\ba\s+carico\s+dell\w*\s+(?:aggiudicatari|acquirent)\w*/i,
      fuori: /immediatezza|vendita\s+(?:giudiziaria|forzata|coattiva)|assenza\s+(?:della\s+|di\s+)?garanzi|mancanza\s+(?:della\s+|di\s+)?garanzi|vizi\s+occulti/i,
      ok: null, negabile: false, importi: true }
  ];

  TEMI.forEach(function (t) { ['problemi', 'ok', 'ambito', 'fuori', 'soggetto', 'okFuori'].forEach(function (k) { if (t[k]) t[k] = R(t[k]); }); });

  // quota parziale (1/2, 500/1000, ½) o diritto parziale venduto da solo. I millesimi delle parti comuni ("quota di
  // 15,58/1000 di comproprietà sulle parti comuni", caso reale) non sono una vendita parziale.
  var COMUNI = R(/parti\s+comuni|spazi\s+comuni|enti\s+comuni|beni\s+comuni|millesim|condomin|supercondomin|concorso\s+alle\s+spese|tabella|comproprietà\s+(?:delle|sulle|degli)/i);
  function quota(f) {
    if (COMUNI.test(f)) return null;
    var re = /(\d{1,4})\s*\/\s*(\d{1,4})|([½⅓⅔¼¾⅕⅙⅛])/g, m;
    while ((m = re.exec(f))) {
      if (m[3]) {
        if (/quota|propriet|diritt|indivis/i.test(f.slice(Math.max(0, m.index - 40), m.index + 40))) return m;
        continue;
      }
      var a = +m[1], b = +m[2], intorno = f.slice(Math.max(0, m.index - 50), m.index + m[0].length + 50);
      if (/[\d,.]$/.test(f.slice(Math.max(0, m.index - 1), m.index))) continue;   // "15,58/1000": decimale, non una frazione di proprietà
      // data ("in data 3/5/2001") o numero di repertorio ("rep. 1234/5678"): non una frazione
      if (/^\s*\/\s*\d/.test(f.slice(m.index + m[0].length)) || /\/\s*$/.test(f.slice(Math.max(0, m.index - 2), m.index))) continue;
      if (b > 0 && a > 0 && a < b && b <= 10000 && /quota|propriet|diritt|usufrutt|indivis/i.test(intorno) &&
        !/foglio|particella|mappale|\bsub\b|p\.f\.|p\.ed|civ|n\.\s*$|n°\s*$|del\s*$|data\s*$|legge|l\.\s*$|d\.?p\.?r|art|\brep\b|\brep\.|\bracc|\bprot|\breg\.|\bvol\./i.test(f.slice(Math.max(0, m.index - 14), m.index))) return m;
    }
    var nuda = /\bnuda\s+propriet\w*/i.exec(f);
    if (nuda && !/usufrutt\w*\s+e\s+(?:la\s+)?nuda|nuda\s+propriet\w*\s+e\s+(?:l['’]\s*)?usufrutt/i.test(f)) return nuda;
    return /\bquota\s+indivisa\b/i.exec(f);
  }

  /* ---------- cifre utili ---------- */
  var VALORE = R(/\b(?:valore\s+(?:di\s+(?:stima|mercato)|commerciale|venale|finale|complessivo|dell'immobile|del\s+(?:bene|lotto))|prezzo\s+(?:a\s+)?base(?:\s+d['’]asta)?|valore\s+a\s+base\s+d['’]asta|stima\s+(?:finale|complessiva))\b/i);
  var SUPERFICIE = R(/\bsuperficie\s+(?:commerciale|convenzionale|lorda|complessiva|vendibile)\b[^.;€]{0,40}?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d{1,5}(?:,\d{1,2})?)\s*(?:mq\b|m\.q\.?|m2\b|m²|metri\s+quadr\w*)/i);
  var CLASSE = R(/\bclasse\s+(?:energetica\s*)?(?:energetica)?\s*[:"«]?\s*([A-G](?:\s?[1-4]|\+{1,4})?)\b(?=[^a-z]|$)/i);

  /* ---------- lettura ---------- */
  function estratto(f, m) {
    var MAX = 320;
    if (f.length <= MAX) return f;
    var i = Math.max(0, m.index - 140), j = Math.min(f.length, i + MAX);
    return (i > 0 ? '…' : '') + f.slice(i, j).trim() + (j < f.length ? '…' : '');
  }
  function chiaveFrase(f) { return f.toLowerCase().replace(/[^a-zà-ÿ0-9]+/g, ' ').trim().slice(0, 160); }

  // tutte le corrispondenze di una regola (copia globale, così lastIndex non resta sporco tra le frasi)
  function tutte(re, f) {
    var g = new RegExp(re.source, re.flags.indexOf('g') < 0 ? re.flags + 'g' : re.flags), out = [], m;
    while ((m = g.exec(f))) { out.push(m); if (m[0] === '') g.lastIndex++; }
    return out;
  }
  function analizzaFrase(tema, f) {
    if (tema.fuori && tema.fuori.test(f)) return null;
    var lista = tema.test ? [tema.test(f)].filter(Boolean) : tema.problemi ? tutte(tema.problemi, f) : [];
    if (lista.length && tema.ambito && !tema.ambito.test(f)) lista = [];
    // abusi: una frase solo catastale ("difformità tra planimetria catastale e stato dei luoghi") è del tema catasto
    if (lista.length && tema.catastoEscluso && CAT.test(f) && !URB.test(f.replace(new RegExp(CAT.source, 'gi'), ''))) lista = [];
    var negate = null;
    for (var i = 0; i < lista.length; i++) {
      var m = lista[i];
      if (tema.scarta && tema.scarta(f, m)) continue;
      var imp = tema.importi ? importoIn(f.slice(m.index)) : null;
      if (negata(f, m, tema.negabile) || (imp && imp.valore === 0 && imp.indice < 90)) { negate = negate || m; continue; }
      // l'importo è quello della voce, non il valore di stima citato dopo ("... con una stima finale di € 12.000,00")
      var tra = imp ? f.slice(m.index + m[0].length, m.index + imp.indice) : '';
      return { tipo: 'problema', m: m, importo: imp && imp.indice < 160 && !VALORE_PRIMA.test(tra) ? imp.valore : null };
    }
    if (negate) return { tipo: 'ok', m: negate };
    var ok = tema.ok && tema.ok.exec(f);
    if (ok && tema.ambito && !tema.ambito.test(f)) ok = null;
    if (ok && tema.soggetto && !tema.soggetto.test(f)) ok = null;
    if (ok && tema.okFuori && tema.okFuori.test(f)) ok = null;
    if (ok && okRovesciato(tema, f, ok)) ok = null;
    return ok ? { tipo: 'ok', m: ok } : null;
  }
  // Una frase rassicurante negata non è rassicurante: "non è libero", "non si presenta in buono stato" (negazione
  // subito prima), "gli impianti non sono a norma", "la planimetria catastale non è conforme" (dentro, dove la regola
  // salta qualche parola), "il certificato di agibilità n. 45 non è stato rinvenuto" (subito dopo, nella stessa frase).
  // Dentro e dopo non valgono per i temi le cui frasi rassicuranti sono già negazioni ("non risultano vincoli").
  var NON_DOPO = R(/^[^.;:,]{0,60}?\bnon\s+(?:(?:(?:è|sono|risulta|risultano|sia|siano|appare|appaiono)\s+)(?:stat[oaie]\s+)?(?:(?:mai|ancora|più)\s+)?(?:conform|corrispond|regolar|rilasciat|reperit|rinvenut|present[ei]\b|depositat|aggiornat|a\s+norma|valid|in\s+buon)|sussist|corrispond)/i);
  function okRovesciato(tema, f, ok) {
    var negativa = /^(?:non|nessun\w*|assenza|senza|liber[oaie]\s+da)\b/i.test(ok[0]);
    if (!negativa && /\bnon\s+(?:[\w']+\s+){0,4}$/i.test(f.slice(Math.max(0, ok.index - 45), ok.index))) return true;
    if (tema.okNegato) return false;
    return /\bnon\b/i.test(ok[0]) || NON_DOPO.test(f.slice(ok.index + ok[0].length));
  }

  var VALORE_PRIMA = R(/\b(?:valore|stima\s+(?:finale|complessiva)|prezzo\s+(?:a\s+)?base|base\s+d'asta|sommano|totale|arrotondat\w*)\b[^€]{0,30}$/i);

  /* pagine: array di stringhe (testo di ogni pagina, nell'ordine) → risultato della lettura */
  function analizza(pagine) {
    pagine = (pagine || []).map(function (p) { return String(p || ''); });
    var caratteri = pagine.reduce(function (s, p) { return s + p.replace(/\s+/g, '').length; }, 0);
    var temi = TEMI.map(function (t) { return { chiave: t.chiave, titolo: t.titolo, gravita: t.gravita, spiegazione: t.spiegazione, dove: t.dove, problemi: [], ok: [], visti: {} }; });
    var cifre = { valori: [], superfici: [], classe: null };
    var vistiValori = {};
    pagine.forEach(function (testoPagina, ip) {
      var n = ip + 1;
      frasi(testoPagina).forEach(function (originale) {
        var f = piatto(originale);
        if (daSaltare(f)) return;
        var k = chiaveFrase(f);
        TEMI.forEach(function (tema, it) {
          var r = analizzaFrase(tema, f);
          if (!r) return;
          var out = temi[it];
          if (out.visti[k]) return;
          out.visti[k] = 1;
          var voce = { testo: estratto(originale, r.m), pagina: n };
          if (r.importo != null) voce.importo = r.importo;
          (r.tipo === 'problema' ? out.problemi : out.ok).push(voce);
        });
        // cifre: valore di stima / prezzo base, superficie commerciale, classe energetica
        var v = VALORE.exec(f);
        if (v) {
          var imp = importoIn(f.slice(v.index));
          if (imp && imp.valore >= 1000 && imp.indice < 120 && !vistiValori[imp.valore]) {
            vistiValori[imp.valore] = 1;
            cifre.valori.push({ importo: imp.valore, testo: estratto(originale, v), pagina: n });
          }
        }
        var s = SUPERFICIE.exec(f);
        if (s && cifre.superfici.length < 6) {
          var mq = numero(s[1]);
          if (mq && mq >= 5 && mq <= 100000) cifre.superfici.push({ mq: mq, testo: estratto(originale, s), pagina: n });
        }
        var c = !cifre.classe && /energetic|\bA\.?P\.?E\b|prestazione/i.test(f) && CLASSE.exec(f);
        if (c) cifre.classe = { classe: c[1].toUpperCase().replace(/\s/g, ''), testo: estratto(originale, c), pagina: n };
      });
    });
    temi.forEach(function (t) {
      delete t.visti;
      t.nProblemi = t.problemi.length;
      t.problemi = t.problemi.slice(0, 6);
      t.ok = t.ok.slice(0, 3);
      t.esito = t.nProblemi ? (t.gravita === 'info' ? 'info' : 'problema') : t.ok.length ? 'ok' : 'assente';
      var somma = 0, conImporto = 0;
      t.problemi.forEach(function (p) { if (p.importo > 0) { somma += p.importo; conImporto++; } });
      if (conImporto) t.importi = { somma: Math.round(somma * 100) / 100, voci: conImporto };
    });
    var pagineConTesto = pagine.filter(function (p) { return p.replace(/\s+/g, '').length >= 200; }).length;
    return {
      pagine: pagine.length,
      caratteri: caratteri,
      // perizia scansionata: immagini senza testo (serve l'OCR, qui non c'è)
      scansione: pagine.length > 0 && pagineConTesto < Math.max(1, Math.ceil(pagine.length * 0.3)),
      temi: temi,
      cifre: cifre,
      sintesi: {
        problemi: temi.filter(function (t) { return t.esito === 'problema'; }).length,
        ok: temi.filter(function (t) { return t.esito === 'ok'; }).length,
        assenti: temi.filter(function (t) { return t.esito === 'assente'; }).length
      }
    };
  }

  var Perizia = {
    analizza: analizza, frasi: frasi, righe: righe, importoIn: importoIn, numero: numero, piatto: piatto,
    TEMI: TEMI.map(function (t) { return { chiave: t.chiave, titolo: t.titolo, gravita: t.gravita, spiegazione: t.spiegazione, dove: t.dove }; })
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Perizia;
  else root.Perizia = Perizia;
})(typeof window !== 'undefined' ? window : globalThis);
