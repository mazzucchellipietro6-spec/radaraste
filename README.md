# Radar Aste Italia

Sito in italiano che ogni mattina raccoglie le aste pubbliche in Italia (immobili, auto, moto, beni mobili) dalle fonti ufficiali, calcola valore di mercato, costi e rischi, e mette al lavoro cinque assistenti che aiutano a capire se e quanto offrire.

> **Avvertenza.** Stime e simulazioni sono indicative: non sostituiscono il parere di un notaio, di un avvocato o di un commercialista, e non sono consulenza finanziaria. Prima di offrire leggi sempre avviso di vendita e perizia.

**Regola del progetto: nessun dato inventato.** Ogni numero ha la sua fonte e il suo livello di affidabilità. Se un dato manca, il sito lo dice invece di stimarlo.

---

## Cosa c'è nel sito

Il menu ha sei sezioni, uguali in tutte le pagine (su telefono: barra in basso con Home, Aste, Mappa, Assistenti e Menu).

| Sezione | Pagine | Cosa fa |
|---|---|---|
| **Home** | `index.html` | Domanda al consulente, Affari di oggi, stato degli assistenti, migliori affari in corso, aste nuove e in scadenza, tre passi per chi è nuovo. Legge solo i file piccoli del giorno: si apre subito. |
| **Aste** | `aste.html`, `scheda.html?id=…` | Elenco con filtri (categoria, testo, luogo, tribunale, prezzo, date, stato, zona della mappa), ricerche salvate. La scheda di ogni asta ha prezzi, date, valore di mercato con forchetta, fonte e affidabilità, costo totale, simulazione dell'offerta, rischi con la frase che li prova, storico dei tentativi, foto, documenti, promemoria in calendario. |
| **Mappa** | `mappa.html` | Mappa OpenStreetMap con le aste colorate per punteggio, raggruppate quando sono vicine; dati per regione, anteprima dell'asta, "Cerca in questa zona". Se lo sfondo è bloccato restano confini e nomi delle regioni. |
| | `radar3d.html` | **Radar 3D** (in lavorazione): colonne alte quanto lo sconto e colorate per punteggio, esagoni quando allontani la mappa, viaggio nel tempo mese per mese, il miglior affare con un clic. Sfondo OpenFreeMap con ripiego su OpenStreetMap; sotto 10 immagini al secondo il 3D si ferma. |
| **Assistenti** | `assistenti.html` | Indice dei cinque assistenti con lo stato di oggi e la spiegazione dei livelli di affidabilità. |
| | `affari.html` | **Cacciatore di affari**: ogni mattina analizza le aste nuove o ribassate, ricontrolla i numeri, cerca segnali di affare e di pericolo e sceglie 5-10 affari con perché conviene, rischi, offerta massima e scadenza. Preferenze personali (zona, budget, categoria, strategia) e storico delle segnalate. |
| | `consulente.html` | **Consulente d'asta**: chat che capisce domande in italiano e risponde con ricerca, filtri e calcoli del sito. Modalità AI preparata ma spenta (vedi `CONSULENTE.md`). |
| | `stratega.html` | **Stratega d'asta**: con il tuo capitale propone su quali aste puntare, quanto offrire e quando, con una simulazione Monte Carlo basata sugli esiti reali delle vendite passate. |
| | `combinazioni.html` | **Combinazioni d'oro**: lotti della stessa procedura che insieme valgono di più (casa e box, unità vicine, casa e terreno), con il risparmio fiscale "prima casa" sulle pertinenze. |
| | `arricchimento.html` | **Agente di arricchimento**: cosa legge ogni giorno (dettagli, foto, documenti, tentativi, zona OMI) e a che punto è. |
| **Strumenti** | `strumenti.html` | Indice degli strumenti. |
| | `calcolatore.html` | "Conviene?": costo totale con imposte, condominio, lavori e liberazione; sconto, giudizio, offerta massima, IMU, plusvalenza, tre strategie. Anche per auto, moto e beni. |
| | `mutuo.html` | Simulatore del mutuo: prezzo massimo con stipendio e risparmi, rata, "posso permettermi questa asta?". Il tasso lo inserisci tu. |
| | `confronta.html` | Fino a tre aste fianco a fianco. |
| | `guida.html` | Guida all'asta telematica passo per passo, con le fonti (le stesse risposte del consulente). |
| | `tariffe.html`, `fonti.html` | Aliquote con fonte e data; stato delle fonti dei dati. |
| **Le mie aste** | `mie-aste.html` | Aste seguite con note, stato, giudizio salvato, promemoria in calendario di tutte, backup. Tutto resta nel browser. |
| **Abbonamenti** (modalità test, spenti) | `prezzi.html`, `accedi.html`, `account.html`; pagine legali `termini.html`, `privacy.html`, `cookie.html`, `recesso.html`, `avvertenze.html` | Piani e prezzi proposti, accesso e pagina dell'account, bozze legali con i dati del titolare da completare. Finché non configuri gli account nessuna funzione è bloccata; anteprima con `?anteprima=abbonamenti`. Vedi `ABBONAMENTI.md`. |

Ricerca istantanea da ogni pagina (pulsante Cerca, tasto `/` o Ctrl/Cmd+K). Tema chiaro e scuro, pensato per il telefono, usabile da tastiera, installabile come app con funzionamento offline (`sw.js`).

### Valore di mercato e affidabilità

Per ogni immobile il valore viene, in quest'ordine, da: quotazione OMI della zona riconosciuta dall'indirizzo; stima del perito indicata nell'avviso; quotazione OMI tipica del comune; prezzo della prima asta (che di norma coincide con la stima). La fonte che non è principale serve da controllo.

- **Alta**: due fonti indipendenti concordano entro il 35%.
- **Media**: una sola fonte diretta (OMI della zona o perizia).
- **Bassa**: stima indiretta o fonti molto diverse. Il punteggio resta al massimo 54 ("Da valutare") e gli assistenti non propongono l'asta come affare.

Quando due fonti non concordano si usa sempre il valore più basso: lo sconto non viene mai gonfiato. Regole in `js/punteggio.js`, test in `tests/punteggio.test.js`.

---

## Fonti dei dati

| Fonte | Stato | Note |
|---|---|---|
| Portale delle Vendite Pubbliche (Ministero della Giustizia) | attiva | Servizio JSON pubblico che il portale usa per la ricerca; dettagli delle vendite; indice delle vendite passate per i tentativi e gli esiti. Nessun robots.txt. |
| Agenzia del Demanio | attiva | Pagine pubbliche "Gare e aste"; il prezzo è solo nel PDF dell'avviso. |
| Agenzia delle Entrate – OMI | attiva (file caricati dal proprietario) | Quotazioni di vendita e affitto per zona, due volte l'anno. Vedi "Quotazioni OMI". |
| Aste Giudiziarie Inlinea | vietata | Le condizioni d'uso vietano estrazione e riutilizzo. |
| Astalegale, Fallco | non attivate | Decisione aperta (vedi ROADMAP, "Da decidere"). |

Il programma di raccolta si identifica con uno user-agent riconoscibile, rispetta robots.txt, fa una richiesta ogni 2,5–3 secondi e si ferma su 401/403/429. Se una fonte blocca l'accesso lo scrive nella pagina Fonti.

---

## Come si aggiorna ogni giorno

Il workflow `.github/workflows/aggiorna-aste.yml` parte ogni giorno alle 04:17 UTC e:

1. esegue i test;
2. recupera i dati pubblicati il giorno prima e la cache dell'indice storico e delle schede;
3. se configurato, scarica le quotazioni OMI dal repository privato e ricostruisce l'indice;
4. raccoglie le aste (`scripts/raccogli.mjs`): fonti, arricchimento (fino a 600 schede di dettaglio al giorno), valore OMI, punteggio, riepilogo, stato degli assistenti, Combinazioni d'oro;
5. esegue il Cacciatore (`scripts/cacciatore.mjs`) e, se ci sono i secret, invia il messaggio Telegram;
6. pubblica il sito su GitHub Pages, senza indice storico, cartella OMI e file temporanei.

Prerequisito, una volta sola: **Settings → Pages → Source: GitHub Actions**. Per una pubblicazione immediata: tab **Actions → "Aggiorna aste e pubblica il sito" → Run workflow**.

### In locale

Serve Node.js 20 o superiore e un server statico.

```bash
npm test                    # tutti i test
npm run raccogli            # raccolta completa (circa 15 minuti, rispettando i tempi dei siti)
node scripts/cacciatore.mjs # affari di oggi sui dati raccolti
node scripts/ricalcola.mjs  # ricalcola valori, punteggi e combinazioni senza nessuna richiesta in rete
npm start                   # http://localhost:8080
```

Opzioni utili della raccolta: `--solo demanio`, `--max-pagine 2`, `--max-dettagli 200`, `--tempo-max 30` (minuti). Dietro a un proxy aggiungi `NODE_USE_ENV_PROXY=1`.

Senza raccolta le pagine sono vuote e lo dicono: non ci sono dati di esempio.

---

## Quotazioni OMI: aggiornamento ogni semestre

Le quotazioni dell'Osservatorio del Mercato Immobiliare danno, per ogni zona di ogni comune, valori di vendita e di affitto al metro quadro. Il sito le usa per il valore di mercato, l'affitto stimato e il rendimento.

**Perché i file non sono nel repository.** Le pagine dell'Agenzia delle Entrate indicano la licenza CC BY 4.0, ma le "Condizioni contrattuali e d'uso" della banca dati vietano di trasferire o cedere i contenuti. Per prudenza i file originali e l'indice completo **non si pubblicano**: nel sito vanno solo i valori calcolati per ogni asta, con l'attribuzione "Agenzia delle Entrate – OMI". `.gitignore` esclude `data/omi/grezzi/`, `data/omi/indice.json` e ogni `.zip`.

**Dove tenerli.** In un repository GitHub **privato** separato (per esempio `radaraste-omi`), che il workflow legge con un token in sola lettura:

1. crea il repository privato e caricaci i file `.zip`;
2. crea un token fine-grained (GitHub → Settings → Developer settings → Fine-grained tokens) con accesso **solo** a quel repository e permesso **Contents: Read-only**;
3. nel repository del sito: **Settings → Secrets and variables → Actions** → secret `OMI_TOKEN` (il token) e, nella scheda *Variables*, variabile `OMI_REPO` con il nome completo (es. `mazzucchellipietro6-spec/radaraste-omi`).

Senza `OMI_REPO` il workflow salta il passo e il sito usa perizie e prima asta.

**Ogni semestre** (l'Agenzia pubblica di solito a marzo e a ottobre):

1. dall'area riservata dell'Agenzia delle Entrate (servizi → Osservatorio del Mercato Immobiliare → Forniture) scarica per tutta Italia: le **quotazioni** (file `QI_…zip`, con `VALORI.csv` e `ZONE.csv`) e, se vuoi, le **compravendite** (`VCN_…zip`) e i **perimetri delle zone** (KML, per collegare le aste alle zone con le coordinate: oggi la zona si riconosce dall'indirizzo);
2. **rinomina i file togliendo il codice fiscale** che l'Agenzia mette nel nome, per esempio `QI_2026_1.zip` e `VCN_2026.zip`;
3. caricali nel repository privato (puoi lasciare anche i vecchi: si usa il più recente per nome);
4. il giorno dopo il workflow ricostruisce l'indice e ricalcola tutto. In locale: copia gli zip in `data/omi/grezzi/` e lancia `node scripts/omi.mjs` e poi `node scripts/ricalcola.mjs`.

Verifica fatta il 13/10/2026 su 42 aste reali: valore OMI e prezzo della prima asta hanno un rapporto mediano di 0,94; le differenze grandi venivano da lotti con più unità o da superfici parziali, ora riconosciuti e segnalati. Dettagli in ROADMAP.

---

## Struttura del progetto

```
*.html                       una pagina per voce del menu (vedi tabella sopra)
assets/css/style.css         design system "Classica": token, componenti, menu, schede, tabelle, home
assets/css/pagine.css        scheda asta e confronto
assets/css/mappa.css         mappa
assets/css/assistenti.css    pagine degli assistenti e degli strumenti, chat del consulente
assets/css/affari.css        sezione Affari di oggi
assets/fonts/                Source Serif 4 e Inter (licenza OFL)
assets/vendor/               Leaflet e Supercluster (con licenze)
config/tariffe.js            ★ unico file delle aliquote, con fonte e data per ogni voce
config/fonti.js              registro delle fonti e verifica di robots.txt e condizioni d'uso
config/consulente.js         collegamento AI del consulente (spento)
data/geo.js, data/italia.js  regioni e province; confini delle regioni (ISTAT, CC BY)
data/aste.js …               file del giorno, generati dalla raccolta (non nel repository): aste.js, riepilogo.js,
                             dettagli/XX.js, affari.js, combinazioni.js, statistiche.js
js/                          moduli condivisi dal sito e dagli script (funzioni pure, testate):
  calcoli.js, punteggio.js, omi.js, estrai.js        costi, valore e punteggio, quotazioni OMI, lettura dei testi
  cacciatore.js, combinazioni.js, stratega.js, consulente.js   logica dei quattro assistenti
  mutuo.js, calendario.js, riepilogo.js, formato.js, dettagli.js, store.js …
  ui.js, icone.js, schede.js, cerca.js, agenti.js, affari.js   interfaccia comune
js/pages/*.js                uno script per pagina
scripts/raccogli.mjs         raccolta quotidiana (Node ≥ 20, nessuna dipendenza)
scripts/cacciatore.mjs, ricalcola.mjs, omi.mjs, telegram.mjs, artifact.mjs
scripts/fonti/*.mjs          un modulo per fonte
scripts/lib/*.mjs            arricchimento, storico, correzioni, doppioni, statistiche, dati derivati, HTTP
functions/api/consulente.js  ponte verso il servizio AI (Cloudflare Pages Functions, spento senza chiave)
tests/                       test (npm test)
```

Tecnologie: HTML, CSS e JavaScript senza framework né passaggi di build. Il sito è statico.

---

## Notifiche Telegram (facoltative)

1. Su Telegram scrivi a @BotFather, comando `/newbot`: ricevi il token del bot.
2. Aggiungi il bot a un canale o scrivigli un messaggio, poi ricava l'id della chat.
3. Nel repository: **Settings → Secrets and variables → Actions** → `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`.

Il token non va mai scritto nel codice. Senza i due secret il workflow non invia nulla e lo scrive nel log.

---

## Abbonamenti (modalità test)

Piani Gratis, Base e Pro con prezzi **proposti** (da approvare), account con Supabase, pagamenti con Stripe e email con Resend, su Cloudflare Pages con le funzioni di `functions/`. È tutto **spento e in modalità test**: con `attivi: false` in `config/abbonamenti.js` il sito funziona come sempre e nessun pagamento reale è possibile (le funzioni rifiutano le chiavi reali di Stripe se su Cloudflare manca `PAGAMENTI_REALI=si`). Le chiavi segrete stanno solo nelle variabili d'ambiente di Cloudflare.

Il workflow pubblica anche su Cloudflare Pages solo se nel repository ci sono la variabile `CF_PAGES_PROGETTO` e i secret `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`. Lo fa **dopo** GitHub Pages, che resta com'è anche se Cloudflare non risponde; la versione di wrangler è fissata (4.151.2). Intestazioni di sicurezza e cache in `_headers` (valgono solo su Cloudflare), progetto in `wrangler.toml`.

File: `config/abbonamenti.js` (piani, prezzi, interruttore), `js/piani.js`, `js/account.js`, le pagine della tabella sopra, `functions/api/stripe/` e `functions/api/account/` (funzioni del server) con il codice comune in `servizi/`, `supabase/schema.sql` (database), `wrangler.toml`, `_headers`.

Guida completa per il proprietario (prezzi e perché, come funziona, account da creare passo per passo, carte di test, lista di controllo prima dei pagamenti reali): **[ABBONAMENTI.md](ABBONAMENTI.md)**.

---

## Anteprima su claude.ai

`node scripts/artifact.mjs` prepara in `_artifact/` una copia del sito da pubblicare come pagina privata su claude.ai. Lì i download possono essere bloccati: backup ed esportazioni hanno anche "Copia".

## Aggiornare le aliquote

Modifica solo `config/tariffe.js`: ogni voce ha `fonte`, `url`, `verificato` e `stato` (`confermato` / `da-verificare`). Pagina Tariffe, calcolatore, punteggio e assistenti si aggiornano da soli.

## Dati personali

Aste seguite, note, preferenze, conversazioni del consulente e aste inserite a mano restano nel browser. Il sito non ha account e non manda dati a nessuno (la modalità AI del consulente, se un giorno verrà attivata, lo dirà chiaramente).
