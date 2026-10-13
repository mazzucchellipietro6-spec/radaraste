# ROADMAP – Radar Aste Italia

Questo file dice **da dove ripartire**. Si aggiorna ogni volta che una voce cambia stato.

Legenda: ✅ fatto · 🔄 in corso · ⬜ da fare · ⏸ in attesa di una decisione · ⛔ non si può fare (motivo indicato)

Ultimo aggiornamento: 13/10/2026, 09:30 UTC

---

## ☀️ Per domattina (aggiornato il 13/10 alle 09:30 UTC)

**Com'è andata la notte.** Gli agenti in parallelo si sono fermati due volte per il limite di sessione dell'account: dalle 22:30 alle 02:40 e dalle 04:55 alle 09:20 UTC. Il lavoro parziale è salvato su GitHub, i test passano (120 su 120) e alle 09:25 è ripartito dal punto in cui si era fermato.

**Fatto e salvato su GitHub (branch di lavoro, nessun merge su `main`):**
- ✅ Pubblicazione automatica: GitHub Pages funziona. La raccolta di stanotte (programmata alle 04:17 UTC, partita alle 04:39 per il solito ritardo di GitHub) è andata a buon fine.
- ✅ Controllo completo del sito, con l'elenco preciso dei problemi (sotto, "Problemi trovati").
- ✅ Punteggio affare 0-100 (`js/punteggio.js`): valore con forchetta, fonte e affidabilità, controlli di coerenza; 12 test.
- ✅ Agente Cacciatore di affari, la parte logica (`js/cacciatore.js`, `scripts/cacciatore.mjs`) con 8 test. Provato sui dati reali di ieri: senza stime del perito non propone nulla e lo dice ("valore non stimabile"), come deve.
- ✅ Moduli pronti per mutuo (`js/mutuo.js`), calendario `.ics` (`js/calendario.js`) e invio Telegram (`scripts/telegram.mjs`, spento finché non metti il token).
- ✅ `CONSULENTE.md`: progetto del consulente AI con 3 servizi a confronto e i costi per 10/100/1000 utenti. Nessun servizio attivato.

**In corso (ripartiti alle 09:25):**
- 🔄 Dati arricchiti: descrizioni, metri quadri, stime, foto, scadenze, storico dei tentativi e punteggio dentro i dati.
- 🔄 Correzioni del sito, più le nuove pagine Scheda asta e Confronta (oggi i link portano a pagine inesistenti).
- ⏳ Poi: mappa interattiva nuova (una parte del lavoro è già fatta), sezione "Affari di oggi" nella home, anteprima su claude.ai.

**Da decidere tu:** vedi la sezione "Da decidere" più sotto (domini da sbloccare, OMI, Astalegale/Fallco, Telegram, consulente AI, "Combinazioni d'oro").

---

## Regole di lavoro (decise dall'utente)

- Una cosa alla volta: realizzarla, provarla sui dati reali, controllare che il resto funzioni ancora, mandare screenshot da computer e telefono, salvare su GitHub nel branch di lavoro, aggiornare questo file.
- Mai dati inventati. Se una fonte è bloccata o vietata: fermarsi su quella voce, scriverlo in "Da decidere" e passare alla successiva.
- Servizi a pagamento o chiavi API: mai attivarli senza il via dell'utente.
- **Niente merge su `main`**: l'utente guarda l'anteprima prima di pubblicare.
- Abbonamenti: non iniziare finché l'utente non dà il via.
- Branch di lavoro: `claude/radar-aste-italia-9b0g40`, pull request [#1](https://github.com/mazzucchellipietro6-spec/radaraste/pull/1) (già unita a `main` dall'utente il 12/10).

---

## Ordine dei lavori

| # | Voce | Stato |
|---|---|---|
| 0 | Pubblicazione su GitHub Pages e raccolta automatica giornaliera | ✅ prima pubblicazione riuscita il 12/10 alle 22:11 UTC |
| 1 | Correggere ciò che è rotto o a metà (vedi "Problemi trovati") | 🔄 |
| 2a | Mappa interattiva OpenStreetMap perfetta | ⬜ |
| 2b | Design premium e interattivo (home d'impatto, schede, animazioni, grafici, calcolatore a cursori) | 🔄 base fatta (design system, icone, barra in basso, ricerca istantanea) |
| 2c | Velocità: apertura sotto i 2 secondi con migliaia di aste | ⬜ |
| 2d | Agente di arricchimento (foto e dettagli da avvisi e perizie, storico dei tentativi) | 🔄 in esecuzione |
| 2e | Agente Cacciatore di affari + sezione "Affari di oggi" | ⬜ (piano già approvato, vedi sotto) |
| 2f | Aste auto dall'estero (solo siti che lo consentono) | ⬜ |
| 2g | Simulatore mutuo, guida all'asta telematica, promemoria con calendario, dati di zona, report PDF | ⬜ |
| 2h | Notifiche Telegram | ⏸ serve il token del bot (gratuito, lo crei tu) |
| 7 | **Radar 3D** (MapLibre + deck.gl, colonne luminose, esagoni, viaggio nel tempo, "Mostrami il miglior affare") | ⬜ solo dopo mappa e design perfetti |
| 8 | **Consulente d'asta AI**: progetto in `CONSULENTE.md` + interfaccia chat e parti senza AI | ⬜ nessun servizio a pagamento attivato |
| 6 | Idee extra s–x (vedi sotto) | ⬜ dopo tutto il resto |
| 9 | **Stratega d'asta** (ottimizzatore con Monte Carlo) | ⬜ dopo tutto il resto |
| — | Abbonamenti | ⏸ non iniziare senza il via dell'utente |

### Dettaglio delle voci future

**2a – Mappa interattiva.** Leaflet con tile OpenStreetMap (nomi di regioni, province, città e strade; zoom e trascinamento; attribuzione OSM). Ogni asta un puntino colorato per punteggio affare, raggruppati in cluster. Passando su una regione: numero di aste, sconto medio, miglior affare. Clic su un puntino: anteprima con foto, prezzo, sconto, punteggio e link alla scheda. Filtri collegati alla lista e pulsante "Cerca in questa zona". Fluida con le dita e con migliaia di aste. Se le tile sono bloccate (es. dentro claude.ai): confini e nomi delle regioni.

**2e – Agente Cacciatore di affari** (piano mostrato all'utente il 12/10). Ogni mattina dopo raccolta e arricchimento:
- analizza le aste nuove o ribassate nelle ultime 24 ore;
- ricontrolla i numeri: valore, costo totale, punteggio, coerenza;
- cerca i segnali di affare e quelli di pericolo;
- sceglie i 5-10 migliori con un riassunto scritto a regole (gratis, nessuna AI a pagamento): perché conviene, rischi, offerta massima, scadenza, cosa non sappiamo.

Dove si vede: "Affari di oggi" in cima alla home, preferenze personali (zona, budget, categoria, strategia). Tiene uno storico delle aste segnalate con il loro esito e misura se ci ha preso.

**7 – Radar 3D.**
- Mappa 3D inclinabile e ruotabile, con MapLibre GL + deck.gl e tile vettoriali gratuite, OpenFreeMap: termini d'uso da verificare.
- Colonne luminose: altezza = sconto, colore = punteggio. Vista d'insieme a esagoni 3D, che zoomando si separano nelle singole aste.
- "Viaggio nel tempo" con una barra dei mesi.
- Clic su una colonna: la telecamera vola sul punto e si apre la scheda. Pulsante "Mostrami il miglior affare".
- Se il dispositivo è lento passa alla mappa 2D.

**8 – Consulente d'asta AI.**
- Chat da esperto. Capisce budget, obiettivo, zona e rischio accettato; sceglie 3-5 aste reali spiegando perché; legge le perizie; calcola costi, tasse, mutuo e rendimento.
- Indica l'offerta massima e guida fino all'invio dell'offerta. Ricorda le preferenze e avvisa quando esce l'asta giusta.
- Mai dati inventati, fonte per ogni numero.
- Stanotte solo `CONSULENTE.md`, con 2-3 servizi AI a confronto e i costi per 10/100/1000 utenti, più l'interfaccia della chat con ricerca, filtri, calcoli e schede, **senza AI a pagamento**.

**6 – Idee extra (solo dopo tutto il resto).**
- s) Storico delle aste concluse: esito, prezzo finale se pubblicato, "a quanto si vendono davvero" immobili simili nella stessa zona.
- t) Affitti: valori di locazione OMI → affitto mensile stimato, rendimento lordo e netto (serve OMI, vedi "Da decidere").
- u) Mappa di calore degli sconti medi per zona, attivabile sulla mappa.
- v) Linea del tempo di ogni asta: pubblicazione, ribassi, scadenze, esito.
- w) "Simula la tua offerta": probabilità di vincere e margine, in base allo storico.
- x) Pagina "Come funziona" in 3 passaggi.

**9 – Stratega d'asta.** Ottimizzatore che, dati capitale, entrate mensili, mutuo possibile e rischio accettato, costruisce il miglior piano di partecipazione alle aste reali.
- Vincoli di cassa: cauzioni bloccate fino all'esito, scadenze del saldo, tempi del mutuo, costi di lavori e liberazione. **Non deve mai proporre un piano che non si può pagare.**
- Probabilità di aggiudicazione stimata dallo storico. Mette in relazione l'offerta con la probabilità di vincere, conta i ribassi già avvenuti e stima la probabilità che l'asta vada deserta, cioè quando conviene aspettare.
- Simulazione Monte Carlo di migliaia di scenari (vinco o perdo, ribassi, sforamento dei lavori, tempi di affitto o vendita). Risultati: valore atteso, caso peggiore al 5%, caso migliore.
- Strategia in più mosse su 1-5 anni: cosa comprare, quando, quanto offrire, come reinvestire affitti e guadagni. Comprende le "Combinazioni d'oro" (da definire con l'utente, vedi "Da decidere").
- Grafico interattivo del patrimonio nel tempo con la forchetta di rischio. Cambiando i parametri il piano si ricalcola.
- Ogni numero con fonte e affidabilità, più un avviso chiaro: è una simulazione, non consulenza finanziaria.

---

## Problemi trovati (registro)

Controllo completo del 12/10, sera (agenti per area, poi verifica incrociata dei difetti). Ogni riga diventa ✅ quando è corretta.

### Raccolta e pubblicazione
- ✅ Il workflow quotidiano non era mai partito (main vuoto): l'utente ha unito la PR e attivato Pages, prima pubblicazione riuscita.
- ⬜ Azioni GitHub su Node 20 (avviso di deprecazione, girano forzate su Node 24): aggiornare le versioni.
- ⬜ Coordinate sbagliate dal PVP: 14 aste a (1,1), una a Washington, una in Ungheria → scartare le coordinate fuori dall'Italia.
- ⬜ Biciclette classificate come "auto" (36 aste) → metterle tra i beni; 49 "beni" che sono veicoli.
- ⬜ Prezzo base 0 € salvato come numero (387 aste) → trattarlo come mancante.
- ⬜ Aste di oggi già chiuse tenute in elenco (si guarda solo la data, non l'ora).
- ⬜ Titoli tagliati a 110 caratteri (69%), in maiuscolo (7%), con prefissi "(Lotto n.1) -".
- ⬜ Offerta minima più alta del prezzo base in 97 aste (dato della fonte): segnalarlo.
- 🔄 Descrizione completa del PVP non salvata (0 aste con descrizione) → in corso con l'arricchimento.
- 🔄 Numero del lotto e anno della procedura non salvati → in corso con l'arricchimento.
- ⬜ Nome del file di riepilogo sbagliato con `--output prova-aste.js`.
- ⬜ Service worker: elenco dei file in cache incompleto (cerca.js, pagine, icone); nella versione Artifact la versione della cache non cambia.
- ⬜ README non aggiornato (elenco in aste.html, nuovi file).
- ⏸ Astalegale e Fallco: moduli scritti ma con problemi aperti, e attivarli è una decisione legale tua (vedi "Da decidere").

### Sito
_(in compilazione: risultati del controllo di pagine e design)_

---

## Da decidere (per l'utente)

1. **Dominio del sito pubblicato bloccato da qui.** La rete di questo ambiente non raggiunge `mazzucchellipietro6-spec.github.io`, quindi controllo il sito servendo in locale lo stesso codice di `main`. Per controllarlo davvero online: impostazioni dell'ambiente → Network access → aggiungi il dominio.
2. **Foto e perizie del PVP**: stanno su `resource-pvp.giustizia.it`, bloccato dalla rete di questo ambiente. Il sito salva i link, e nel browser degli utenti le foto si vedono. Per leggere le perizie in automatico (abusi, spese condominiali, metri quadri) va aggiunto quel dominio alla rete dell'ambiente.
3. **Valori OMI** (valore di mercato e affitti per zona). Servono le tue credenziali SPID/CIE per scaricarli dall'Agenzia delle Entrate due volte l'anno; non c'è un'API. Senza OMI il valore si basa sulla stima del perito e il rendimento da affitto non è stimabile.
4. **Astalegale e Fallco**: attivarle o no? Robots.txt lo consente, ma sono banche dati private tutelate (art. 102-bis L.d.A.) e duplicano il PVP.
5. **Telegram**: crea il bot con @BotFather (gratis) e metti il token nei Secrets del repository. Le istruzioni passo passo arriveranno con la funzione.
6. **Consulente AI**: quale servizio usare e se attivarlo (vedi `CONSULENTE.md`).
7. **"Combinazioni d'oro"** dello Stratega: cosa intendi esattamente? Non l'ho trovato definito.
8. **Frane e alluvioni (ISPRA IdroGEO), verificato il 13/10.**
   - Cosa c'è: l'API pubblica dà per ogni comune le aree e la popolazione a rischio frana (P1-P4) e alluvione (P1-P3). Esempio: Genova ha il 2,7% della superficie a pericolosità idraulica elevata.
   - Il blocco: il `robots.txt` di idrogeo.isprambiente.it **vieta ai programmi automatici** sia `/api/` sia `/opendata/`. Per questo non li uso in automatico: mi sono fermato dopo 6 richieste di prova.
   - Alternativa: scarichi tu una volta il file dei dati per comune dal sito ISPRA (licenza da verificare sulla pagina, di solito CC BY 4.0) e lo inseriamo nel sito con l'attribuzione.
   - Oppure chiediamo il permesso a ISPRA.
9. **Domini bloccati da questo ambiente** che serviranno più avanti:
   - `tiles.openfreemap.org` (sfondo vettoriale del Radar 3D);
   - `unpkg.com` e `cdn.jsdelivr.net` (librerie: in alternativa le scarico dal registro npm, che è raggiungibile);
   - `pst.giustizia.it` (manuali ufficiali dell'offerta telematica);
   - `www.istat.it` (codici dei comuni).

   Overpass (servizi vicini da OpenStreetMap) risponde.

---

## Fatto (storico)

- ✅ Elenco delle aste reali con filtri (PVP + Agenzia del Demanio), link all'avviso originale, nessun dato inventato.
- ✅ Calcolatore "Conviene?" per immobili e veicoli, tre strategie (ci vivo / affitto / rivendo), offerta massima.
- ✅ Tariffe e tasse in un unico file con fonte e data (`config/tariffe.js`).
- ✅ Le mie aste (seguite, note, backup), ricerche salvate con le nuove dall'ultima visita.
- ✅ App installabile (manifest, service worker, icone), tema chiaro/scuro/automatico.
- ✅ Design system nuovo: font e icone propri, barra in basso su telefono, ricerca istantanea (/ o Ctrl+K).
- ✅ Estrattori dai testi: superficie, stato di conservazione, dati dei veicoli, rischi.
- ✅ Punteggio affare 0-100 (`js/punteggio.js`): valore con forchetta, fonte e affidabilità; controlli di coerenza; 12 test.
- ✅ Pubblicazione automatica giornaliera su GitHub Pages (04:17 UTC).
