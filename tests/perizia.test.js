// Lettore della perizia (js/perizia.js). Le frasi "reali" vengono da perizie pubblicate sul Portale delle Vendite
// Pubbliche e lette il 27/11/2026, riscritte senza nomi, date di nascita, codici fiscali e indirizzi: le perizie
// vere non si salvano nel repository (contengono dati personali).
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/perizia.js');

const tema = (r, k) => r.temi.find((t) => t.chiave === k);
const leggi = (...pagine) => P.analizza(pagine);

test('schema "Campo: valore": Nessuna, € 0,00 e importi', () => {
  const r = leggi([
    'Vincoli ed oneri giuridici che resteranno a carico dell\'acquirente:',
    '4.1.1 Domande giudiziali o altre trascrizioni pregiudizievoli: Nessuna.',
    '4.1.2 Convenzioni matrimoniali e provv. d\'assegnazione casa coniugale: Nessuna.',
    '4.1.3 Atti di asservimento urbanistico: Nessuno.',
    'Spese straordinarie di gestione immobile, già deliberate ma non ancora scadute al momento della perizia: € 0,00',
    'Spese condominiali scadute ed insolute alla data della perizia: € 3.450,00'
  ].join('\n'));
  assert.equal(tema(r, 'vincoli').esito, 'ok');
  assert.equal(tema(r, 'vincoli').nProblemi, 0);
  assert.equal(tema(r, 'occupazione').nProblemi, 0, 'casa coniugale: Nessuna non è un problema');
  const c = tema(r, 'condominio');
  assert.equal(c.esito, 'problema');
  assert.equal(c.problemi.length, 1);
  assert.equal(c.problemi[0].importo, 3450);
  assert.match(c.problemi[0].testo, /insolute alla data della perizia: € 3\.450,00/);
  assert.equal(c.problemi[0].pagina, 1);
});

test('domande del giudice, indice e titoli non sono problemi', () => {
  const r = leggi(
    'INDICE\n1. Identificazione del bene ........ 3\n5. Abusi edilizi e sanatorie ........ 12\nAbusi edilizi 18',
    'Il Giudice dispone che l\'esperto verifichi la regolarità urbanistica del bene e, in caso di opere abusive, controlli la possibilità di sanatoria.\n' +
    'ESISTENZA DI PARTI COMUNI E SERVITU’\nCome da relazione notarile non si evincono parti comuni e servitù.\n' +
    'QUANTO OGGETTO DI FALLIMENTO o PARTI COMUNI E SERVITU’ o ATTI PREGIUDIZIEVOLI o SITUAZIONE OCCUPAZIONALE'
  );
  assert.equal(tema(r, 'urbanistica').esito, 'assente');
  assert.equal(tema(r, 'vincoli').nProblemi, 0);
  assert.equal(tema(r, 'vincoli').esito, 'ok');
});

test('negazioni: rassicurante, non problema; la doppia negazione resta un rischio', () => {
  const r = leggi('Non sono state riscontrate difformità urbanistiche rispetto ai titoli edilizi. Non si ravvisano vincoli artistici, storici o paesaggistici. ' +
    'Stante l\'epoca di costruzione non si può escludere la presenza di elementi in eternit nella copertura del fabbricato.');
  assert.equal(tema(r, 'urbanistica').esito, 'ok');
  assert.equal(tema(r, 'vincoli').esito, 'ok');
  assert.equal(tema(r, 'conservazione').esito, 'problema');
});

test('abusi e catasto: frasi reali', () => {
  const r = leggi(
    'Lo stato di fatto rilevato nel corso dei sopralluoghi è sostanzialmente conforme alla rappresentazione grafica acclusa ai titoli abilitativi edilizi sopra elencati, a meno di parziali difformità che verranno evidenziate.\n' +
    'Sono invece presenti lievi difformità sulla planimetria catastale dell\'appartamento al piano terra che non riporta la legnaia al piano seminterrato.\n' +
    'Queste difformità sono sanabili a mezzo di pratica di variazione Docfa redatta da tecnico abilitato.'
  );
  assert.equal(tema(r, 'urbanistica').esito, 'problema');
  assert.equal(tema(r, 'urbanistica').nProblemi, 1, 'le difformità solo catastali vanno nel tema del catasto');
  assert.equal(tema(r, 'catasto').esito, 'problema');
  assert.equal(tema(r, 'catasto').nProblemi, 2);
});

test('occupazione: affitto registrato, comodato, debitore; cose che occupano non contano', () => {
  const r = leggi(
    'Attualmente l\'appartamento risulta occupato a fronte di un contratto di locazione ad uso abitativo la cui prima scadenza è il 30/06/2030, regolarmente registrato presso l\'Agenzia delle Entrate.\n' +
    'La porzione al terzo piano è utilizzata da un familiare a titolo di comodato di cui si allega copia del contratto.\n' +
    'Anche la zona uffici è occupata da beni mobili di varia natura in condizioni di ammaloramento e valore nullo.\n' +
    'Una superficie residua di circa 1.800 mq, non direttamente occupata dall\'impianto, è interessata da vegetazione spontanea.\n' +
    'Lo scrivente ha inoltrato richiesta all\'Agenzia delle Entrate al fine di verificare l\'esistenza di contratti di locazione e/o di comodato.'
  );
  const o = tema(r, 'occupazione');
  assert.equal(o.esito, 'problema');
  assert.equal(o.nProblemi, 2);
  assert.match(o.problemi[0].testo, /contratto di locazione/);
  assert.match(o.problemi[1].testo, /comodato/);
  assert.equal(tema(leggi('L’immobile è attualmente libero.'), 'occupazione').esito, 'ok');
  // "libero" detto della zona, non del bene: non basta per dire che è libero
  assert.equal(tema(leggi('Molte delle poche case presenti nella frazione sono disabitate per la maggior parte dell\'anno.'), 'occupazione').esito, 'assente');
});

test('quota: frazioni vere sì, millesimi delle parti comuni no', () => {
  assert.equal(tema(leggi('Diritto: piena proprietà per la quota di 1/2.'), 'quota').esito, 'problema');
  assert.equal(tema(leggi('a) Quota indivisa di ½ di terreno così identificato al N.C.T.R.'), 'quota').esito, 'problema');
  assert.equal(tema(leggi('- una quota di 15,58/1000 di comproprietà sulle parti comuni e di concorso alle spese generali relative ai soli locali autorimessa (Tabella A).'), 'quota').esito, 'assente');
  assert.equal(tema(leggi('Diritto venduto: piena proprietà per l\'intero (quota 1/1).'), 'quota').esito, 'ok');
});

test('stato di conservazione: difetti sì, nomi di luogo e cantine al rustico no', () => {
  const r = leggi('Le condizioni manutentive dell\'immobile sono da ritenersi precarie, sono ben visibili tracce di muffa e umidità sulle pareti e sul soffitto.');
  assert.equal(tema(r, 'conservazione').esito, 'problema');
  assert.equal(tema(leggi('Trattasi di un lotto di area sito in località Creppo di forma trapezoidale, adibito a prato stabile.'), 'conservazione').esito, 'assente');
  assert.equal(tema(leggi('Completano il piano seminterrato locali atrio e ripostiglio cantina al rustico per una superficie di circa 70 mq.'), 'conservazione').esito, 'assente');
  assert.equal(tema(leggi('Cedimenti 0,990 0,970 0,950'), 'conservazione').esito, 'assente', 'tabella dei coefficienti di stima');
  assert.equal(tema(leggi('L\'appartamento si presenta in buone condizioni di conservazione.'), 'conservazione').esito, 'ok');
  // frase generica delle norme di piano, non sul bene
  assert.equal(tema(leggi('Gli interventi ammessi hanno lo scopo di mantenere gli edifici esistenti in buono stato di conservazione.'), 'conservazione').esito, 'assente');
});

test('agibilità e impianti', () => {
  const r = leggi('L\'immobile è privo del certificato di agibilità. Impianti elettrico e idrico privi di dichiarazione di conformità.');
  assert.equal(tema(r, 'agibilita').esito, 'problema');
  assert.equal(tema(r, 'impianti').esito, 'problema');
  assert.equal(tema(leggi('Il certificato di agibilità n. 45 è stato rilasciato dal Comune nel 1987.'), 'agibilita').esito, 'ok');
});

test('costi: sanatoria e deprezzamento sì, ribasso della vendita giudiziaria no', () => {
  const r = leggi('Costi di regolarizzazione: € 2.500,00. Per la presenza del contratto di affitto l\'immobile verrà deprezzato del 15%.');
  const c = tema(r, 'costi');
  assert.equal(c.esito, 'info');
  assert.equal(c.nProblemi, 2);
  assert.equal(c.problemi[0].importo, 2500);
  assert.equal(tema(leggi('Valore ridotto del 20% dovuto all\'immediatezza della vendita giudiziaria e per assenza di garanzia per vizi occulti.'), 'costi').esito, 'assente');
});

test('cifre: valore, superficie, classe energetica', () => {
  const r = leggi('Superficie commerciale: 95,40 mq.\nClasse energetica: G.\nValore di mercato dell\'immobile: € 120.000,00.');
  assert.deepEqual(r.cifre.valori.map((v) => v.importo), [120000]);
  assert.deepEqual(r.cifre.superfici.map((s) => s.mq), [95.4]);
  assert.equal(r.cifre.classe.classe, 'G');
});

test('perizia scansionata (senza testo) e tema non trovato', () => {
  const r = P.analizza(['', ' ', '', '']);
  assert.equal(r.scansione, true);
  assert.ok(r.temi.every((t) => t.esito === 'assente'));
  assert.equal(r.sintesi.assenti, r.temi.length);
  assert.equal(P.analizza([]).scansione, false);
});

test('righe: frase spezzata a capo si riunisce, "Campo:" va con il suo valore', () => {
  assert.deepEqual(P.righe('L\'immobile risulta occupato dal\ndebitore e dalla sua famiglia.\nStato di possesso:\nLibero'),
    ['L\'immobile risulta occupato dal debitore e dalla sua famiglia.', 'Stato di possesso: Libero']);
  assert.deepEqual(P.righe('irregolarità sana-\nbili con SCIA'), ['irregolarità sanabili con SCIA']);
});

test('importi: i prezzi al metro quadro non sono costi', () => {
  assert.equal(P.importoIn('all\'immobile si attribuisce un valore che deprezzato del 15% risulterà pari a 385,50€/mq.'), null);
  assert.equal(P.importoIn('appartamento mq.137 x €/mq.650 = € 89.050,00').valore, 89050);
  assert.equal(P.importoIn('Costi di regolarizzazione: € 2.500,00').valore, 2500);
  assert.equal(P.importoIn('Spese ordinarie annue: Euro 0,00').valore, 0);
});

// Revisione del 28/11/2026: frasi inventate, scritte come quelle tipiche delle perizie.
test('frase rassicurante negata: mai «Rassicurante»; le forme «non è / non risulta conforme» sono problemi', () => {
  const casi = [
    ['catasto', 'La planimetria catastale non è conforme allo stato dei luoghi.', 'problema'],
    ['catasto', 'L\'immobile non risulta conforme alla planimetria catastale.', 'problema'],
    ['urbanistica', 'Lo stato di fatto non risulta conforme ai titoli edilizi.', 'problema'],
    ['urbanistica', 'Gli abusi non sono sanabili.', 'problema'],
    ['impianti', 'Gli impianti non sono a norma.', 'problema'],
    ['impianti', 'Gli impianti non risultano conformi alla normativa vigente.', 'problema'],
    ['agibilita', 'Non è presente il certificato di agibilità.', 'problema'],
    ['agibilita', 'Non risulta rilasciata l\'agibilità.', 'problema'],
    ['agibilita', 'L\'unità non è dotata di certificato di abitabilità.', 'problema'],
    // negata ma senza le parole di un problema: "non trovato", non "rassicurante"
    ['occupazione', 'L\'immobile non è libero.', 'assente'],
    ['conservazione', 'L\'immobile non si presenta in buono stato di conservazione.', 'assente'],
    ['conservazione', 'Il bene non è in buone condizioni di manutenzione.', 'assente'],
    ['urbanistica', 'La conformità urbanistica non sussiste.', 'assente'],
    ['agibilita', 'Il certificato di agibilità del fabbricato non è stato rilasciato.', 'assente'],
    // le affermative restano rassicuranti
    ['catasto', 'La planimetria catastale è conforme allo stato dei luoghi.', 'ok'],
    ['impianti', 'Gli impianti sono conformi alla normativa.', 'ok'],
    ['urbanistica', 'Lo stato dei luoghi è conforme al progetto approvato.', 'ok'],
    ['condominio', 'Non ci sono impianti condominiali, non è recintato e non vi è condominio.', 'ok'],
    // una negazione dopo che non tocca la frase rassicurante
    ['catasto', 'La planimetria catastale è conforme allo stato dei luoghi e non sono necessari aggiornamenti.', 'ok'],
    ['conservazione', 'L\'immobile si presenta in buono stato di conservazione e non necessita di lavori.', 'ok']
  ];
  for (const [k, frase, esito] of casi) assert.equal(tema(leggi(frase), k).esito, esito, frase);
});

test('negazioni: il pronome «ne», «mai» e una frase nuova dopo la negazione non tolgono il problema', () => {
  assert.equal(tema(leggi('Ne consegue che le opere realizzate sono abusive.'), 'urbanistica').esito, 'problema');
  assert.equal(tema(leggi('La veranda, mai autorizzata, costituisce un abuso edilizio.'), 'urbanistica').esito, 'problema');
  assert.equal(tema(leggi('Il fabbricato non è recintato e presenta infiltrazioni dal tetto.'), 'conservazione').esito, 'problema');
  assert.equal(tema(leggi('Senza contare la tettoia, sono presenti difformità edilizie.'), 'urbanistica').esito, 'problema');
  assert.equal(tema(leggi('Non sono presenti vincoli, è presente una servitù di passaggio.'), 'vincoli').esito, 'problema');
  // le negazioni vere valgono ancora, anche su un elenco
  assert.equal(tema(leggi('Non sono presenti né vincoli né servitù.'), 'vincoli').esito, 'ok');
  assert.equal(tema(leggi('Non risultano iscrizioni, trascrizioni o servitù.'), 'vincoli').esito, 'ok');
  assert.equal(tema(leggi('Non si rilevano infiltrazioni e muffe.'), 'conservazione').esito, 'ok');
});

test('«libero da pesi, vincoli e servitù» non dice chi abita il bene e non è un vincolo', () => {
  for (const frase of ['Il bene è libero da pesi, vincoli e servitù.', 'L\'immobile è libero da iscrizioni e trascrizioni pregiudizievoli.']) {
    const r = leggi(frase);
    assert.equal(tema(r, 'vincoli').esito, 'ok', frase);
    assert.equal(tema(r, 'occupazione').esito, 'assente', frase);
  }
  assert.equal(tema(leggi('Il bene risulta libero da persone e cose.'), 'occupazione').esito, 'ok');
});

test('occupazione: «occupato» senza dire da chi e contratto non opponibile sono problemi', () => {
  assert.equal(tema(leggi('Stato di possesso: Occupato.'), 'occupazione').esito, 'problema');
  assert.equal(tema(leggi('L\'immobile risulta occupato.'), 'occupazione').esito, 'problema');
  assert.equal(tema(leggi('Il contratto di locazione non è opponibile alla procedura.'), 'occupazione').esito, 'problema');
  assert.equal(tema(leggi('L\'immobile non risulta occupato.'), 'occupazione').esito, 'ok');
  // "e occupate" (congiunzione) nel testo piatto è uguale a "è occupate": parla della frazione, non del bene
  assert.equal(tema(leggi('Molte case della frazione sono disabitate per gran parte dell\'anno e occupate solo d\'estate.'), 'occupazione').esito, 'assente');
});

test('quota: date e numeri di repertorio non sono frazioni di proprietà', () => {
  assert.equal(tema(leggi('Con atto in data 3/5/2001 l\'esecutato acquistava la piena proprietà.'), 'quota').esito, 'assente');
  assert.equal(tema(leggi('Atto rep. 1234/5678, piena proprietà del bene.'), 'quota').esito, 'assente');
  assert.equal(tema(leggi('Diritto: piena proprietà per la quota di 1/2.'), 'quota').esito, 'problema');
});

test('costi: l\'importo è quello della voce, non il valore di stima citato dopo nella frase', () => {
  const c = tema(leggi('Riduzione del 10% per tenere conto dei costi di regolarizzazione edilizia, con una stima finale di € 12.000,00.'), 'costi');
  assert.equal(c.esito, 'info');
  assert.equal(c.problemi[0].importo, undefined);
  assert.equal(c.importi, undefined, 'nessuna somma di costi inventata');
});
