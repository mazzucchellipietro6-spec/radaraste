# ROADMAP – Radar Aste Italia

Questo file dice **da dove ripartire**. Si aggiorna ogni volta che una voce cambia stato.

Legenda: ✅ fatto · 🔄 in corso · ⬜ da fare · ⏸ aspetta una tua decisione · ⛔ non si può fare (motivo indicato)

Ultimo aggiornamento: 13/10/2026, sera.

---

## In breve

**Fatto in questa sessione** (tutto salvato sul branch `claude/radar-aste-italia-9b0g40`):
- i **cinque assistenti** sono nel sito, ognuno con la sua pagina sotto "Assistenti": Cacciatore di affari, Consulente d'asta (chat), Stratega d'asta, Combinazioni d'oro, Agente di arricchimento;
- **menu nuovo** a sei sezioni (Home, Aste, Mappa, Assistenti, Strumenti, Le mie aste) e **stile "Classica"** in tutte le pagine;
- **home nuova** con la domanda al consulente in alto;
- valori di mercato **più prudenti**: con fonti discordanti si usa il valore più basso e il punteggio si ferma a "Da valutare";
- **README** e documentazione riscritti; **182 test** automatici.

**Per pubblicare:** premi Merge sulla pull request [#2](https://github.com/mazzucchellipietro6-spec/radaraste/pull/2): la spinta diretta su `main` è stata bloccata dai permessi di questa sessione.

**Resta da fare:** zona abbonamenti in modalità TEST (dopo il merge, senza attivare nulla), aste auto dall'estero, report PDF, Radar 3D, idee extra. Elenco completo sotto.

**Da decidere tu:** sezione "Da decidere" in fondo. Le più urgenti:
- il repository privato per i file OMI;
- il bot Telegram;
- il servizio AI del consulente;
- gli account per gli abbonamenti.

---

## Regole di lavoro (decise da te)

- Una cosa alla volta: realizzarla, provarla sui dati reali, controllare che il resto funzioni ancora, salvare su GitHub nel branch di lavoro, aggiornare questo file.
- Mai dati inventati: se una fonte è bloccata o vietata, fermarsi su quella voce e scriverlo in "Da decidere".
- Servizi a pagamento o chiavi API: mai attivarli senza il tuo via. Le chiavi solo nelle variabili d'ambiente, mai nel codice.
- Per le scelte normali decido io e lo scrivo qui; quello che spetta a te va in "Da decidere".
- Pubblicazione su `main` solo quando lo chiedi tu: il 13/10 hai chiesto di pubblicare a fine lavoro, con la pull request #2.

---

## Fatto ✅

### Il sito
- ✅ **Pubblicazione su GitHub Pages e raccolta automatica ogni mattina** (04:17 UTC): prima pubblicazione il 12/10.
- ✅ **Menu chiaro**, uguale in tutte le pagine.
  - Su computer: tendine per Assistenti e Strumenti.
  - Su telefono: barra in basso (Home, Aste, Mappa, Assistenti, Menu) e foglio "Menu" con tutto il resto.
  - Piè di pagina a colonne.
  - Nessuna pagina doppia: il test `tests/sito.test.mjs` lo controlla.
- ✅ **Design "Classica"** in tutte le pagine:
  - Source Serif 4 per i titoli, Inter per testi e numeri con cifre tabulari;
  - carta calda e un solo colore principale, il blu notte;
  - tema chiaro e scuro, nessun effetto vistoso.
- ✅ **Home**: domanda al consulente, Affari di oggi, stato dei cinque assistenti, migliori affari in corso, nuove nelle ultime 24 ore, in scadenza, "Nuovo alle aste? Tre passi".
- ✅ **Mappa interattiva**:
  - OpenStreetMap con cluster colorati per punteggio e dati per regione al passaggio;
  - anteprima dell'asta e "Cerca in questa zona";
  - su telefono fogli dal basso;
  - se lo sfondo è bloccato restano confini e nomi delle regioni.
  - Il foglio di stile della mappa mancava del tutto: ora c'è.
- ✅ **Scheda asta**:
  - valore con forchetta, fonte e affidabilità, controlli di coerenza;
  - costi e "Simula la tua offerta";
  - rischi con la frase che li prova, storico dei tentativi;
  - "Promemoria" (file per il calendario), "Chiedi al consulente", "Posso permettermela?".
- ✅ **Le mie aste**: note, stato, backup, promemoria in calendario di tutte le aste seguite.
- ✅ **Strumenti**:
  - calcolatore "Conviene?";
  - simulatore mutuo: tasso inserito da te, imposte dalle aliquote ufficiali;
  - confronto fino a tre aste;
  - guida all'asta in 15 passi con le norme;
  - tariffe e fonti.
- ✅ **Controllo su telefono**: nessuna delle 18 pagine è più larga dello schermo e nessuna ha errori JavaScript (controllo automatico del 13/10).

### I cinque assistenti
- ✅ **Cacciatore di affari** (`affari.html`, `js/cacciatore.js`, `scripts/cacciatore.mjs`).
  - Ogni mattina analizza le aste nuove o ribassate e scarta quelle con dati incoerenti.
  - Cerca segnali di affare (compresa la domanda di affitti dalla zona OMI) e di pericolo.
  - Sceglie al massimo 10 affari, con perché conviene, rischi, offerta massima e scadenza.
  - Preferenze personali: zona, budget, categoria, strategia.
  - Tiene lo storico delle segnalate, conservato da un giorno all'altro, e prepara il messaggio Telegram.
  - Il 13/10, su 1.138 aste nuove o ribassate, ne passano 3: le altre hanno un valore poco affidabile. Meglio pochi affari veri.
- ✅ **Consulente d'asta** (`consulente.html`, `js/consulente.js`).
  - Chat che capisce domande in italiano: luoghi, tipi, importi, date, domande di seguito.
  - Cerca, spiega un'asta, fa i conti (costi, mutuo, rendimento) e risponde sulle regole.
  - Fonti e affidabilità sotto ogni risposta.
  - Collegamento AI pronto ma **spento**: `functions/api/consulente.js` e `config/consulente.js`, costi e attivazione in `CONSULENTE.md`.
- ✅ **Stratega d'asta** (`stratega.html`, `js/stratega.js`, `scripts/lib/statistiche.mjs`).
  - Con capitale, mutuo, orizzonte, strategia e prudenza sceglie le aste e dice quanto offrire, la cauzione e quando pagare.
  - Non propone mai un piano che non si può pagare.
  - Simulazione Monte Carlo (5.000 giri, riproducibile) con le probabilità tratte dagli **esiti reali** delle vendite passate.
  - Istogramma delle aste vinte, ipotesi, cosa non sappiamo, avviso "simulazione, non consulenza".
- ✅ **Combinazioni d'oro** (`combinazioni.html`, `js/combinazioni.js`).
  - Lotti della stessa procedura che insieme valgono di più: casa e box, più abitazioni, casa e terreno, spazi per un'attività.
  - Somme dai lotti, risparmio fiscale "prima casa" sulle pertinenze calcolato con le aliquote, avvisi su quote e occupati.
  - Il 13/10: 1.042 combinazioni tra 2.106 procedure con più lotti.
- ✅ **Agente di arricchimento** (`arricchimento.html`).
  - Ogni giorno legge fino a 600 schede di dettaglio del Portale (descrizione, foto, documenti, stima, termine), ricostruisce i tentativi e legge rischi e metri quadri dal testo.
  - Collega la zona OMI.
  - La pagina mostra a che punto è e da dove vengono i valori.

### Dati e calcoli
- ✅ **Quotazioni OMI** (semestre 2025/2): valore e affitto per zona.
  - 3.728 immobili con quotazione, 514 con la zona riconosciuta dall'indirizzo.
  - Verifica su 42 aste reali: rapporto mediano 0,94 tra valore OMI e prezzo della prima asta.
- ✅ **Valore prudente** (`js/punteggio.js`).
  - L'OMI della zona e il perito (o la prima asta) si controllano a vicenda: se concordano l'affidabilità è alta, se no si usa il valore più basso.
  - Lotti con più unità e OMI oltre 3 volte il prezzo base senza conferma → affidabilità bassa.
  - Con affidabilità bassa il punteggio si ferma a 54 ("Da valutare").
- ✅ **`scripts/ricalcola.mjs`**: ricalcola valori, punteggi, combinazioni e statistiche senza nessuna richiesta in rete. Serve dopo l'aggiornamento OMI o un cambio di regole.
- ✅ **Workflow quotidiano**:
  - OMI da un repository privato (`vars.OMI_REPO` + `secrets.OMI_TOKEN`);
  - Cacciatore e Telegram dopo la raccolta;
  - storico del Cacciatore conservato;
  - cartella OMI e indice storico mai pubblicati.
- ✅ **Codice fiscale tolto** dai nomi dei file OMI e da tutta la storia di git (13/10). I file OMI originali sono fuori dal repository per le condizioni d'uso dell'Agenzia delle Entrate.

### Codice e documentazione
- ✅ 182 test automatici (`npm test`): calcoli, punteggio, OMI, raccolta, storico, assistenti, consulente, stratega, combinazioni, calendario, integrità del sito.
- ✅ README riscritto: cosa fa il sito, come si aggiorna, **come si aggiornano i file OMI ogni semestre**.
- ✅ Font vecchi, proposte di stile e regole CSS non usate eliminati; icona dell'app nei colori nuovi.

---

## In corso 🔄

- ✅ Anteprima privata su claude.ai aggiornata il 13/10 sera (stesso indirizzo di prima).
- ⏸ **Pubblicazione sul sito**: la spinta diretta su `main` è stata bloccata dai permessi di questa sessione, quindi è pronta la pull request [#2](https://github.com/mazzucchellipietro6-spec/radaraste/pull/2). Per pubblicare: apri la pull request e premi **Merge**. Parte il workflow e in circa 45 minuti il sito è aggiornato.
- ⬜ **Zona abbonamenti in modalità TEST**: la preparo dopo il merge della #2, così non entra nella pubblicazione senza che tu l'abbia vista (vedi "Da decidere", punto 2).

---

## Da fare ⬜ (in ordine)

1. ⬜ **Aste auto dall'estero**: solo siti che lo consentono (da verificare robots.txt e condizioni d'uso uno per uno).
2. ⬜ **Report PDF** dell'asta: versione stampabile della scheda, con valore, costi, rischi e fonti.
3. ⬜ **Dati di zona** nella scheda: compravendite OMI del comune, servizi vicini (OpenStreetMap). Rischio frane e alluvioni solo con il tuo via (punto 8 di "Da decidere").
4. ⬜ **Stratega su più anni**:
   - strategia in più mosse su 1-5 anni e grafico del patrimonio nel tempo;
   - reinvestimento di affitti e guadagni;
   - sforamento dei lavori e tempi di vendita nella simulazione.
   - Oggi l'orizzonte arriva a 12 mesi e la simulazione considera vittorie e cassa.
5. ⬜ **Consulente**: lettura delle perizie (serve il dominio `resource-pvp.giustizia.it`) e avvisi quando esce l'asta giusta.
6. ⬜ **Radar 3D** (MapLibre + deck.gl, colonne per sconto e punteggio, esagoni, "viaggio nel tempo", "Mostrami il miglior affare", ritorno al 2D sui dispositivi lenti). Le librerie si possono prendere dal registro npm. Lo sfondo vettoriale OpenFreeMap è bloccato da questo ambiente e i suoi termini sono da verificare.
7. ⬜ **Idee extra**:
   - s) storico delle aste concluse e "a quanto si vendono davvero" (il Portale non pubblica il prezzo di aggiudicazione: si può dire solo se è stata aggiudicata);
   - t) affitti: ✅ affitto OMI e rendimento lordo già nel punteggio e nella scheda; resta il rendimento netto;
   - u) mappa di calore degli sconti;
   - v) linea del tempo di ogni asta;
   - w) "Simula la tua offerta" con la probabilità di vincere (le probabilità dello Stratega sono pronte da riusare);
   - x) "Come funziona": ✅ tre passi in home e guida.
8. ⬜ Azioni di GitHub su Node 24 (oggi avviso di deprecazione, funzionano).

---

## Scelte fatte da me (puoi cambiarle)

- **Stile "Classica"** (proposta A) invece di "Istituzionale" (B): più riconoscibile, da rapporto finanziario. Cambiare è solo questione di colori e caratteri in `assets/css/style.css`.
- **Probabilità dello Stratega dalle ultime 4 settimane di esiti.** Nell'indice del Portale le vendite più vecchie perdono quasi sempre l'esito "aggiudicata": sull'intero periodo verrebbe un 3% falso, sulle ultime 4 settimane circa il 27%. Il metodo è spiegato nella pagina, con la forchetta minima e massima.
- **Combinazioni d'oro** = lotti della stessa procedura che insieme valgono di più, come hai scritto il 13/10. L'unico vantaggio in euro calcolato è quello fiscale; gli altri sono motivi scritti.
- **Probabilità di vincere con altri offerenti**: è un'ipotesi che sceglie l'utente (30% di partenza), perché nessun dato pubblico la misura.

---

## Da decidere ⏸ (per te)

1. **Repository privato per i file OMI.** Crea `radaraste-omi` privato, caricaci gli zip, poi aggiungi il secret `OMI_TOKEN` e la variabile `OMI_REPO`: passi esatti nel README, sezione "Quotazioni OMI". Senza, il sito pubblicato usa solo perizie e prima asta. Le quotazioni OMI ci sono solo nella mia copia locale e nell'anteprima.
2. **Abbonamenti.** Nel messaggio del 13/10 hai scritto prima "lascia stare gli abbonamenti" e poi "zona abbonamenti in modalità TEST".
   - Li preparo solo in TEST: nessun pagamento reale, nessun account creato, pagine non collegate al menu.
   - Per farli funzionare servono account e chiavi che puoi creare solo tu:
     - Cloudflare Pages;
     - Supabase (database utenti, piano gratuito);
     - Stripe in modalità test;
     - un servizio per le email.
   - Vanno approvati anche i prezzi che ti proporrò.
3. **Telegram**: crea il bot con @BotFather (gratis) e metti `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` nei Secrets (passi nel README). Il messaggio del mattino è già pronto ogni giorno.
4. **Consulente AI**: se attivarlo, con quale servizio (consiglio Claude Sonnet 5.5) e con quale tetto di spesa. Costi per 10/100/1000 utenti in `CONSULENTE.md`. Serve anche Cloudflare Pages (punto 2).
5. **Astalegale e Fallco**: attivarle o no? Il robots.txt lo consente, ma sono banche dati private tutelate (art. 102-bis L.d.A.) e duplicano il PVP.
6. **Domini bloccati da questo ambiente** (impostazioni dell'ambiente → accesso alla rete):
   - `mazzucchellipietro6-spec.github.io`, per controllare il sito pubblicato da qui;
   - `resource-pvp.giustizia.it`, per leggere le perizie in automatico; le foto nel browser degli utenti si vedono già;
   - `tiles.openfreemap.org`, per il Radar 3D;
   - `pst.giustizia.it`, per i manuali dell'offerta telematica;
   - `www.istat.it`.
7. **Perimetri delle zone OMI (KML)**: se li scarichi insieme alle quotazioni, la zona si riconosce dalle coordinate dell'asta (51% delle aste le hanno) e non solo dall'indirizzo. Oggi si riconosce per il 14% degli immobili con quotazione.
8. **Frane e alluvioni (ISPRA IdroGEO)**: il robots.txt vieta i programmi automatici su `/api/` e `/opendata/`. Due strade:
   - scarichi tu una volta il file per comune (licenza da verificare);
   - chiediamo il permesso a ISPRA.

---

## Registro dei controlli

### Verifica delle stime OMI (13/10/2026, 42 aste reali)
- Valore OMI / prezzo della prima asta: mediana 0,94 su 25 aste, 12 su 25 entro ±35%.
- Perito / OMI:
  - 0,96 a San Severino Marche e 1,00 a Gualdo Tadino;
  - 0,61 per un capannone a Lecce;
  - 3,22 per il villino di Augusta (metri quadri parziali);
  - 6,6 per la tenuta di Santa Croce Camerina (lotto con più unità letto come box).
- Da questi casi sono nate le regole su lotti con più unità, box e superfici diverse.
- Casi reali del 13/10 corretti con il valore prudente:
  - Bonea, fabbricato antico: OMI 117.000 € contro 51.770 € della prima asta;
  - Albosaggia, quattro unità: perizia 36.600 € contro OMI 68.880 €;
  - Agrigento: OMI 6 volte il prezzo base senza perizia.

### Problemi trovati e risolti
- ✅ Foglio di stile della mappa mancante (la pagina era senza impaginazione).
- ✅ Termine delle offerte con l'ora (`AAAA-MM-GGTHH:MM`) letto male da Cacciatore e calendario.
- ✅ Il ricalcolo sostituiva le descrizioni complete delle schede con quelle brevi: corretto e verificato.
- ✅ Sul telefono la riga di esempi della chat allargava la pagina.
- ✅ Coordinate fuori dall'Italia, biciclette tra le auto, prezzi base a zero, aste di oggi già iniziate, titoli tagliati, offerte minime sopra il prezzo base: corretti nella raccolta del 12-13/10.
- ⬜ Azioni di GitHub su Node 20 (avviso di deprecazione).
