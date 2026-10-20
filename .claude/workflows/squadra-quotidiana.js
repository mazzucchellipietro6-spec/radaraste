export const meta = {
  name: 'squadra-quotidiana',
  description: 'Giro del mattino della Squadra Radar Aste: controlli di raccolta, dati e sito, riparazioni e una voce della ROADMAP, revisione indipendente',
  whenToUse: 'Ogni mattina dopo la raccolta automatica delle aste (vedi SQUADRA.md). args: { oggi, base, esecuzione, dati }',
  phases: [
    { title: 'Controlli', detail: 'Guardiano della raccolta, Controllore dei dati, Collaudatore del sito' },
    { title: 'Sviluppo', detail: 'problemi gravi del mattino, poi una voce della ROADMAP' },
    { title: 'Revisione', detail: 'Revisore indipendente su tutte le modifiche del giorno' },
  ],
}

// args (preparati dal capo squadra): oggi 'AAAA-MM-GG'; base = commit di partenza del giorno;
// esecuzione = esito e link della raccolta del mattino su GitHub Actions; dati = stato dei dati locali
const A = args || {}
const OGGI = A.oggi || '(data non indicata)'
const BASE = A.base || 'HEAD'

const COMUNE = `
CONTESTO. Sei un membro della Squadra Radar Aste: leggi SQUADRA.md (ruoli e regole) e ROADMAP.md nella radice del repository /home/user/radaraste prima di iniziare. Oggi è il ${OGGI}.
Il repository è il sito "Radar Aste Italia": HTML/CSS/JS statico senza framework né build; moduli UMD (window.X / module.exports, ES5 nei file per il browser: var, function, niente arrow function né template literal); script Node >= 20 ESM senza dipendenze; test con "npm test". Testi per l'utente in italiano; nomi e commenti nel codice in italiano, brevi; stile come il codice che c'è già; design system in assets/css/style.css (solo i suoi token di colore, niente emoji).
Dati reali in locale (generati, non nel repository): data/aste.js (decodifica con require('./js/formato.js').decodifica), data/dettagli/XX.js, data/riepilogo.js, data/affari.js, data/combinazioni.js, data/statistiche.js, data/omi/ (privato: MAI pubblicarlo né copiarne parti nel repository). Stato dei dati di oggi: ${A.dati || 'non indicato'}.
Raccolta del mattino su GitHub Actions: ${A.esecuzione || 'non indicata'}.
Prove nel browser: server locale "python3 -m http.server 8099 --bind 0.0.0.0" nella radice (di solito già acceso), indirizzo http://192.0.2.2:8099/ (non localhost); Playwright con NODE_PATH=$(npm root -g) ed executablePath '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'.
REGOLE (dell'utente, assolute): nessun dato inventato, ogni numero con fonte e affidabilità; rispetta robots.txt e condizioni d'uso, non aggirare blocchi (se una fonte è bloccata o vietata fermati e scrivilo); niente servizi a pagamento, chiavi o account; nessun segreto nel codice; NON fare commit, push, merge né pull request (li fa il capo squadra); modifica solo i file del tuo ruolo indicati sotto; ogni correzione con un test che la dimostra, se possibile su un caso reale.`

const PROBLEMA = { type: 'object', properties: {
  gravita: { type: 'string', enum: ['urgente', 'importante', 'minore'], description: 'urgente = il sito pubblicato o la raccolta sono rotti, o ci sono dati sbagliati in vista' },
  descrizione: { type: 'string' }, file: { type: 'string' }, corretto: { type: 'boolean' }, proposta: { type: 'string', description: 'se non corretto: cosa fare' } },
  required: ['gravita', 'descrizione', 'corretto'] }
const CONTROLLO = { type: 'object', properties: {
  esito: { type: 'string', enum: ['tutto bene', 'problemi', 'guasto'] },
  numeri: { type: 'string', description: 'i numeri chiave controllati, ognuno con la sua fonte' },
  problemi: { type: 'array', items: PROBLEMA },
  file: { type: 'array', items: { type: 'string' }, description: 'file modificati' },
  test: { type: 'string' }, note: { type: 'string' } },
  required: ['esito', 'numeri', 'problemi', 'file', 'test', 'note'] }
const SVILUPPO = { type: 'object', properties: {
  riparati: { type: 'array', items: { type: 'string' } },
  voceRoadmap: { type: 'string', description: 'la voce della ROADMAP realizzata oggi (o perché nessuna)' },
  completata: { type: 'boolean' },
  fatto: { type: 'string', description: 'cosa è cambiato per l utente, in parole semplici' },
  resta: { type: 'string', description: 'cosa resta di quella voce' },
  daDecidere: { type: 'array', items: { type: 'string' }, description: 'decisioni che spettano all utente' },
  file: { type: 'array', items: { type: 'string' } }, test: { type: 'string' }, prove: { type: 'string' } },
  required: ['riparati', 'voceRoadmap', 'completata', 'fatto', 'resta', 'daDecidere', 'file', 'test', 'prove'] }
const VERDETTO = { type: 'object', properties: {
  problemi: { type: 'array', items: PROBLEMA },
  annullati: { type: 'array', items: { type: 'string' }, description: 'modifiche annullate e perché' },
  test: { type: 'string', description: 'esito finale di npm test con i numeri' },
  pronto: { type: 'boolean', description: 'il lavoro del giorno si può salvare e proporre per la pubblicazione' },
  note: { type: 'string' } },
  required: ['problemi', 'annullati', 'test', 'pronto', 'note'] }

const RUOLI = [
  { key: 'guardiano', nome: 'Guardiano della raccolta', compito: `Controlla la raccolta del mattino: con gli strumenti GitHub (carica con ToolSearch "select:mcp__github__actions_list,mcp__github__actions_get,mcp__github__get_job_logs"; repository mazzucchellipietro6-spec/radaraste, workflow aggiorna-aste.yml) leggi l'esecuzione di oggi e le 3-5 precedenti, con i registri (get_job_logs con return_content e tail_lines ampio). Per ogni fonte: aste lette, nuove, chiuse, schede lette, avvisi ed errori (401/403/429, FonteBloccata), tempi dei passi; Cacciatore, Telegram, pubblicazione. Segnala cali bruschi (oltre il 20%) rispetto ai giorni prima, passi lenti, avvisi nuovi. Se una fonte ha cambiato formato e il lettore sbaglia, trova la causa con una risposta reale (scaricala rispettando robots.txt e le pause di scripts/lib/http.mjs) e correggi il lettore con un test che usa quella risposta come fixture. File tuoi: scripts/fonti/*, scripts/lib/*, i test dei lettori in tests/. Il workflow .github/workflows/aggiorna-aste.yml non si tocca: se serve, proponi la modifica.` },
  { key: 'controllore', nome: 'Controllore dei dati', compito: `Controlla la qualità dei dati di oggi: un campione di almeno 40 aste (tutte le categorie, almeno 10 regioni, con e senza valore di mercato), le 10 con punteggio più alto, tutti gli affari di oggi (data/affari.js) e le prime 10 combinazioni (data/combinazioni.js). Per ognuna: prezzo, date, luogo, categoria, stato, valore con fonte e affidabilità coerenti con le regole di js/punteggio.js, sconti assurdi (oltre il 70%), doppioni, aste passate tra quelle in corso, testi tagliati o sporchi. Confronta almeno 10 aste con l'avviso originale quando raggiungibile (pagina dell'asta su pvp.giustizia.it, rispettando robots.txt e con calma). Se una regola sbaglia, correggila con un test sul caso reale. File tuoi: js/punteggio.js, js/omi.js, js/estrai.js, js/cacciatore.js, js/combinazioni.js, js/stratega.js, scripts/lib/derivati.mjs, scripts/lib/statistiche.mjs e i loro test.` },
  { key: 'collaudatore', nome: 'Collaudatore del sito', compito: `Collauda il sito: "npm test"; poi ogni pagina *.html con Playwright a 390 e 1366 px, in tema chiaro e scuro, con i dati reali: errori in console, barra orizzontale (scrollWidth > clientWidth), link interni rotti, immagini mancanti, testi sovrapposti o tagliati, tempo di caricamento (segnala oltre 3 secondi), accessibilità di base (titoli, etichette, focus). Prova i percorsi principali: cercare un comune, filtrare l'elenco, aprire una scheda, seguire un'asta, simulare un'offerta, chiedere al consulente, fare un piano con lo Stratega, aprire la mappa. Correggi i problemi piccoli e sicuri; gli altri descrivili con la proposta. File tuoi: *.html, js/pages/*, js/ui.js, assets/css/*, sw.js, tests/sito.test.mjs.` },
]

phase('Controlli')
const controlli = await parallel(RUOLI.map((r) => () =>
  agent(COMUNE + '\n\nSEI IL ' + r.nome.toUpperCase() + '.\n' + r.compito + '\n\nAlla fine restituisci il rapporto (problemi trovati, se li hai corretti, numeri controllati con la fonte).',
    { label: r.nome, phase: 'Controlli', schema: CONTROLLO })
    .then((x) => (x ? { ruolo: r.nome, ...x } : null))))

const fatti = controlli.filter(Boolean)
const mancati = RUOLI.filter((r, i) => !controlli[i]).map((r) => r.nome)
if (mancati.length) log('Controlli non riusciti oggi: ' + mancati.join(', '))
const aperti = fatti.flatMap((c) => c.problemi.filter((p) => !p.corretto && p.gravita !== 'minore').map((p) => ({ ruolo: c.ruolo, ...p })))
log(fatti.length + ' controlli fatti, ' + aperti.length + ' problemi urgenti o importanti ancora aperti')

phase('Sviluppo')
const sviluppo = await agent(COMUNE + `

SEI LO SVILUPPATORE. Rapporti dei controlli di stamattina:
${JSON.stringify(fatti)}
${mancati.length ? 'Controlli non riusciti oggi (segnalalo, non rifarli tu): ' + mancati.join(', ') : ''}

1) Prima ripara i problemi urgenti e importanti ancora aperti (${aperti.length}): ${JSON.stringify(aperti)}.
2) Poi realizza UNA voce della ROADMAP: la prima di "In corso", altrimenti la prima di "Da fare" che non aspetta una decisione dell'utente e non richiede servizi a pagamento, chiavi, account o domini bloccati da questo ambiente. Se è troppo grande per un giorno, fanne una parte completa e utile da sola e scrivi cosa resta.
Per ogni cosa: realizza, aggiungi i test, prova sui dati reali e nel browser (telefono e computer), controlla con "npm test" che il resto funzioni. Le decisioni che spettano all'utente non prenderle: elencale. Non modificare ROADMAP.md, README.md né SQUADRA.md (li aggiorna il capo squadra con il tuo rapporto).`,
  { label: 'Sviluppatore', phase: 'Sviluppo', schema: SVILUPPO })

phase('Revisione')
const revisione = await agent(COMUNE + `

SEI IL REVISORE INDIPENDENTE. Il lavoro di oggi parte dal commit ${BASE}. Guarda TUTTE le modifiche del giorno ("git diff ${BASE}" e i file nuovi di "git status") con occhio avversario: correttezza, dati inventati, numeri senza fonte, sicurezza (nessuna chiave o segreto, nessun dato privato o file OMI nel repository), rispetto di robots.txt e delle condizioni d'uso, telefono e computer, test che provano davvero quello che dicono.
Rapporti dei controlli: ${JSON.stringify(fatti)}
Rapporto dello sviluppatore: ${JSON.stringify(sviluppo)}
Esegui "npm test" e prova nel browser le pagine toccate. Correggi tu i problemi che trovi, con un test. Se una modifica è sbagliata e non si può sistemare, annullala ("git checkout ${BASE} -- <file>"; i file nuovi rimuovili) e scrivilo. Restituisci il verdetto: pronto = true solo se npm test passa tutto e nulla viola le regole.`,
  { label: 'Revisore indipendente', phase: 'Revisione', schema: VERDETTO })

return { oggi: OGGI, base: BASE, controlli: fatti, controlliMancati: mancati, sviluppo, revisione }
