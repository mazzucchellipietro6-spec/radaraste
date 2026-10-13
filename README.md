# Radar Aste Italia

Sito in italiano che raccoglie ogni giorno le aste in Italia (immobili, auto, moto, beni mobili) dalle fonti ufficiali e aiuta a capire se conviene partecipare.

> **Avvertenza.** I calcoli sono indicativi e non sostituiscono il parere di un notaio, di un avvocato o di un commercialista.

## Cosa fa

| Pagina | Contenuto |
|---|---|
| **Oggi** (`index.html`, la home) | I numeri del giorno (aste attive, nuove nelle ultime 24 ore, valore totale dei prezzi base, sconto medio quando il valore di mercato è disponibile), i 10 migliori affari per punteggio (solo se ci sono aste con il punteggio: altrimenti lo spiega), le aste nuove e quelle in scadenza questa settimana. Legge solo `data/riepilogo.js`, quindi si apre subito. |
| **Aste** (`aste.html`) | Elenco di tutte le aste raccolte con filtri: categoria, ricerca libera, regione/provincia/comune, tribunale, prezzo, data, stato (libero/occupato), solo nuove, zona scelta sulla mappa. Su telefono i filtri sono in un foglio dal basso (pulsante "Filtri" con il numero di filtri attivi). Ricerche salvate con il conteggio delle aste nuove. Puoi anche aggiungere a mano un'asta copiata da un avviso reale (link obbligatorio) e importare/esportare CSV o JSON. |
| **Scheda** (`scheda.html?id=…`) | Tutti i dati di un'asta: prezzi, date, valore e punteggio quando disponibili, descrizione, foto, documenti (perizia, avviso, ordinanza), storico dei tentativi, rischi con il pezzo di testo che li prova. I dati mancanti sono indicati come "non indicato nell'avviso" o "non ancora disponibile". |
| **Confronta** (`confronta.html`) | Fino a 3 aste fianco a fianco (si scelgono con la casella "Confronta" sulle schede). |
| **Mappa** (`mappa.html`) | Aste sulla mappa (OpenStreetMap) raggruppate e, avvicinando, i punti precisi (coordinate del Portale Vendite Pubbliche). Una zona della mappa si può aprire nell'elenco. |
| **Conviene?** (`calcolatore.html`) | Immobili: offerta + imposte + condominio arretrato (anno in corso e precedente) + lavori + liberazione + spese di procedura, confronto col mercato e giudizio (Affare ≥25%, Conviene 15–25%, Margine stretto 5–15%, Non conviene <5%), offerta massima per restare ~20% sotto mercato, IMU e plusvalenza, tre strategie (ci vivo, affitto, rivendo). Auto, moto e beni: aggiudicazione + diritti d'asta + IVA + passaggio di proprietà (IPT per provincia, ACI, bollo, Motorizzazione) + riparazioni + trasporto; bollo annuo. Su telefono un riepilogo fisso in basso (giudizio, sconto, costo totale) si aggiorna mentre scrivi. |
| **Le mie aste** (`mie-aste.html`) | Aste seguite (stella sulle schede) con note, stato ("Interessato", "Offerta presentata", …) e giudizio salvato. Salvate nel browser, con backup/ripristino JSON. |
| **Tariffe e tasse** (`tariffe.html`) | Tutte le aliquote con **fonte e data di verifica** accanto a ogni voce. |
| **Fonti** (`fonti.html`) | Stato di ogni fonte (attiva, vietata, non raggiungibile…), metodo di raccolta e data dell'ultima raccolta. |

Filtri da altre pagine o da un link: `aste.html?provincia=GE`, `?regione=Liguria`, `?comune=Genova`, `?filtri={"bbox":[sud,ovest,nord,est]}` (zona della mappa) o qualunque combinazione di filtri in `?filtri={…}`.

Ricerca istantanea in ogni pagina (pulsante Cerca, tasto `/` o Ctrl/Cmd+K): comuni, province, tribunali, tipologie e singole aste.

Tema chiaro/scuro (automatico o scelto), pensato per il telefono (barra in basso, bersagli da toccare di almeno 44 px), usabile da tastiera (link "Salta al contenuto", finestre che tengono il fuoco e si chiudono con Esc) e installabile come app con funzionamento offline (`sw.js`).

## Fonti dei dati

Verificate il 11/10/2026 (robots.txt e termini d'uso letti direttamente):

| Fonte | Stato | Perché |
|---|---|---|
| Portale Vendite Pubbliche | ✅ attiva | Nessun robots.txt; portale pubblico del Ministero della Giustizia (dati PA riutilizzabili, art. 52 CAD). Si usa il servizio JSON pubblico che il portale stesso interroga per la ricerca. Include le vendite giudiziarie di immobili, veicoli e beni mobili (anche quelle IVG). |
| Agenzia del Demanio | ✅ attiva | Nessun robots.txt, nessun limite nelle note legali; pagine pubbliche "Gare e aste". Il prezzo base è solo nel PDF dell'avviso (linkato). |
| Aste Giudiziarie Inlinea | ⛔ vietata | Le condizioni generali (artt. 5–6) vietano estrazione e riutilizzo della banca dati. Non viene letta. |
| Astalegale | ⏸ non attivata | robots.txt consente; nessun termine che lo vieti. Non attivata: pubblica le stesse vendite del PVP (doppioni) e la banca dati privata è tutelata (art. 102-bis L.d.A.). |
| Fallco Aste | ⏸ non attivata | Come Astalegale. |
| IVG (ivgitalia.it) | ❌ non raggiungibile | Errore 502 del server. Le vendite IVG sono comunque sul PVP. |

**Nessun dato inventato:** se una fonte blocca l'accesso o lo vieta, il programma si ferma per quella fonte e lo scrive nella pagina Fonti; se non ci sono aste, le pagine lo dicono chiaramente.

Il programma di raccolta (`scripts/raccogli.mjs`) si identifica con uno user-agent riconoscibile, rispetta robots.txt, fa una richiesta ogni 2,5–3 secondi e si interrompe su 401/403/429.

## Struttura del progetto

```
index.html                  home "Oggi"
aste.html, scheda.html, confronta.html, mappa.html, calcolatore.html, mie-aste.html, tariffe.html, fonti.html
sw.js, manifest.webmanifest app installabile e offline (la versione della cache la scrive scripts/artifact.mjs)
assets/css/style.css        design system (tema chiaro/scuro, componenti .copertina, .anello, .nastro, .tempi, .confronto…)
assets/css/pagine.css, assets/css/mappa.css   stili delle pagine scheda/confronto e della mappa
config/tariffe.js           ★ UNICO file con tutte le aliquote, fonti e date
config/fonti.js             registro delle fonti ed esito della verifica (robots.txt, termini d'uso)
data/geo.js                 regioni, province, coordinate dei capoluoghi
data/italia.js              confini delle regioni (ISTAT 2026 via openpolis, CC BY 4.0)
data/aste.js                aste raccolte (formato compatto, vedi js/formato.js): generato da scripts/raccogli.mjs, non è nel repository
data/riepilogo.js           numeri e piccole liste per la home (js/riepilogo.js), generato con le aste (non nel repository)
data/dettagli/XX.js         schede complete a pezzi (descrizione, foto, documenti, storico, rischi), lette da js/dettagli.js (generate, non nel repository)
js/calcoli.js               motore dei calcoli (funzioni pure, testate)
js/punteggio.js             valore di mercato, costo totale, sconto e punteggio affare (solo da dati reali)
js/formato.js, js/estrai.js formato compatto dei dati e lettura del testo degli avvisi (raccolta e sito)
js/parser.js                lettura del testo di un avviso incollato
js/store.js                 archivio (aste raccolte + inserite + seguite)
js/asta.js, js/dettagli.js  dati completi di un'asta per scheda e confronto
js/schede.js                scheda di un'asta in elenco (home, elenco, mappa)
js/cerca.js, js/ricerche.js ricerca istantanea; ricerche salvate e aste nuove dall'ultima visita
js/confronto.js             aste scelte per il confronto (barra "Confronta")
js/riepilogo.js             calcolo del riepilogo della home
js/cacciatore.js, js/affari.js   "Cacciatore di affari" (migliori del giorno) e sua sezione
js/mutuo.js, js/calendario.js    simulatore del mutuo, promemoria .ics
js/ui.js, js/icone.js       struttura comune (intestazione, barra in basso, finestre, tema), icone
js/pages/*.js               una per pagina
scripts/raccogli.mjs        programma di raccolta (Node ≥ 20, nessuna dipendenza)
scripts/fonti/*.mjs         un modulo per fonte (pvp, demanio, astalegale, fallco)
scripts/lib/*.mjs           doppioni tra fonti, correzioni, arricchimento e dettaglio PVP, storico dei tentativi, richieste HTTP
scripts/cacciatore.mjs, scripts/telegram.mjs   affari del mattino e invio Telegram (solo con i Secrets)
scripts/artifact.mjs        prepara la versione da pubblicare su claude.ai
.github/workflows/aggiorna-aste.yml   raccolta quotidiana + pubblicazione
tests/                      test (npm test)
```

Tecnologie: HTML, CSS e JavaScript senza framework né build; mappa con Leaflet 1.9.4 (inclusa in `assets/vendor/leaflet`) e sfondo OpenStreetMap. Il sito è statico: si pubblica ovunque.

## Avviarlo in locale

Serve [Node.js](https://nodejs.org) 20 o superiore (per la raccolta) e un server statico qualsiasi.

```bash
git clone https://github.com/mazzucchellipietro6-spec/radaraste.git
cd radaraste
npm run raccogli     # scarica le aste (circa 10 minuti, rispettando i tempi dei siti)
npm start            # avvia http://localhost:8080 (usa python3; in alternativa: npx serve .)
```

Apri <http://localhost:8080>. Le pagine funzionano anche aprendo `index.html` con doppio clic; lo sfondo della mappa (OpenStreetMap) richiede Internet. Senza `npm run raccogli` l'elenco è vuoto e lo dice: non ci sono dati di esempio.

Altri comandi:

```bash
npm test                               # test dei calcoli, del parser e della raccolta
npm run raccogli -- --solo demanio     # una sola fonte
npm run raccogli -- --max-pagine 2     # prova veloce del PVP
```

Se sei dietro a un proxy aziendale, aggiungi `NODE_USE_ENV_PROXY=1` davanti al comando di raccolta.

## Pubblicarlo online (con aggiornamento quotidiano)

Il workflow `.github/workflows/aggiorna-aste.yml` ogni giorno alle 04:17 UTC raccoglie le aste e ripubblica il sito su **GitHub Pages**:

1. Porta il codice sul branch `main` (merge della pull request).
2. Su GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Tab **Actions → "Aggiorna aste e pubblica il sito" → Run workflow** per la prima pubblicazione.
4. Il sito sarà su `https://mazzucchellipietro6-spec.github.io/radaraste/`.

Se una fonte fallisce, il sito viene pubblicato lo stesso con le aste reali del giorno prima per quella fonte e lo stato aggiornato nella pagina Fonti; GitHub ti avvisa per email se la raccolta fallisce del tutto.

### Versione su claude.ai (Artifact)

`node scripts/artifact.mjs` prepara in `_artifact/` una copia del sito pubblicabile come Artifact di claude.ai (pagina privata, condivisibile dal menu Condividi). In quella versione i download possono essere bloccati: backup ed esportazioni hanno anche il pulsante "Copia". Lo sfondo OpenStreetMap non si carica, ma la mappa mostra comunque i confini delle regioni (ISTAT) inclusi nel sito. I dati si aggiornano solo quando l'Artifact viene ripubblicato dopo una nuova raccolta.

In alternativa puoi pubblicare la cartella su Netlify, Cloudflare Pages o qualsiasi hosting statico, ma l'aggiornamento quotidiano va comunque eseguito da un job programmato che lanci `npm run raccogli`.

## Aggiornare le aliquote

Modifica solo `config/tariffe.js`: ogni voce ha `fonte`, `url`, `verificato` (data) e `stato` (`confermato` / `da-verificare`). La pagina Tariffe e il calcolatore si aggiornano da soli. Per la tua città aggiungi l'aliquota IMU in `imu.comuni` e, se la conosci, la maggiorazione IPT della tua provincia in `veicoli.ipt.province`.

Voci da ricontrollare (segnate "da verificare" nel sito): maggiorazione IPT delle province diverse da Aosta, Bolzano e Trento (predefinita +30%), bollo per classi Euro 0–3 e variazioni regionali, diritti d'asta (variabili per IVG), cauzione.

## Dati personali

Le aste seguite, le note e le aste inserite a mano restano nel browser (localStorage). Usa "Scarica backup" in Le mie aste per conservarle o spostarle su un altro dispositivo.
