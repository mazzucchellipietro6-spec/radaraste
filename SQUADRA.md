# La squadra di Radar Aste

Ogni mattina, dopo la raccolta automatica delle aste, una squadra di assistenti Claude controlla il sito e lo migliora. Questo file spiega chi fa cosa, con quali regole e come fermarla.

> La raccolta dei dati è un'altra cosa: la fa ogni giorno GitHub Actions (`.github/workflows/aggiorna-aste.yml`, alle 04:17 UTC) e pubblica il sito da sola. La squadra lavora **dopo** e sul codice: controlla, ripara e aggiunge le funzioni della [ROADMAP](ROADMAP.md).

---

## Quando lavora

- **Ogni giorno alle 08:13, ora italiana.** A quell'ora la raccolta del mattino è finita da almeno un'ora.
- Parte da sola con un'attività programmata del tuo account Claude, nella stessa sessione di Claude Code che ha costruito il sito, così ricorda tutto il lavoro fatto.
- **Consuma i limiti d'uso del tuo piano Claude.** Se un giorno il limite finisce a metà, il lavoro rimasto riparte il giorno dopo, prima di tutto il resto.

## Chi fa cosa

| Ruolo | Cosa controlla | Cosa può cambiare da solo |
|---|---|---|
| **Guardiano della raccolta** | La raccolta del mattino su GitHub: esito di ogni passo, aste lette per fonte, fonti bloccate, tempi, Cacciatore e messaggio Telegram. La confronta con i giorni precedenti: se una fonte cala di colpo, cerca il perché. | I lettori delle fonti (`scripts/fonti/`, `scripts/lib/`), sempre con un test su una risposta reale. Una fonte bloccata o vietata non si aggira: si segnala. |
| **Controllore dei dati** | Un campione di aste ogni giorno (tutte le categorie, regioni diverse, le migliori per punteggio, gli affari di oggi, le combinazioni): prezzi, date, luoghi, valori, sconti assurdi, doppioni, aste già passate. Li confronta con l'avviso originale. | Le regole dei calcoli (`js/punteggio.js`, `js/omi.js`, `js/estrai.js`, `js/cacciatore.js`, `js/combinazioni.js`), con un test sul caso reale. |
| **Collaudatore del sito** | Tutti i test automatici e tutte le pagine nel browser, su telefono e computer, in tema chiaro e scuro: errori, link rotti, pagine lente, testi che escono dallo schermo. Prova i percorsi principali (cerca, apri una scheda, segui un'asta, chiedi al consulente). | Le pagine (`*.html`, `js/pages/`, `assets/css/`), per i problemi piccoli e sicuri. |
| **Sviluppatore** | Prima ripara i problemi gravi trovati la mattina. Poi realizza **una voce della ROADMAP**: la prima di "In corso", altrimenti la prima di "Da fare" che non aspetta una tua decisione. | Quello che serve per quella voce, con i suoi test. |
| **Revisore indipendente** | Rilegge **tutte** le modifiche del giorno come un avversario: dati inventati, numeri senza fonte, errori, sicurezza, rispetto delle fonti, telefono e computer. | Corregge, oppure annulla le modifiche sbagliate. |
| **Capo squadra** (Claude, la sessione principale) | Prepara i dati, fa partire la squadra, mette insieme il lavoro, rifà tutti i test. | Salva sul branch, apre o aggiorna la pull request, aggiorna ROADMAP e diario e ti manda il resoconto. |

## Le regole (sono le tue)

1. **Mai dati inventati.** Ogni numero ha la sua fonte e il suo livello di affidabilità; se un dato manca, il sito lo dice.
2. **Fonti rispettate.** Se robots.txt o le condizioni d'uso vietano qualcosa, o una fonte è bloccata, la squadra si ferma su quella fonte e lo scrive in "Da decidere".
3. **Niente servizi a pagamento, chiavi o account** senza il tuo via. Le chiavi stanno solo nelle variabili d'ambiente, mai nel codice. Nessun pagamento reale.
4. **Una cosa alla volta**: realizzarla, provarla sui dati reali, controllare che il resto funzioni, salvarla, aggiornare la ROADMAP.
5. **La pubblicazione la decidi tu.** La squadra lavora sul branch `claude/radar-aste-italia-9b0g40` e tiene aperta una pull request verso `main`; il sito pubblicato cambia solo quando premi **Merge**. Se il sito pubblicato ha un guasto, il resoconto inizia con **URGENTE** e la correzione è già pronta nella pull request.
6. **Le scelte tue restano tue.** Quello che spetta a te va in "Da decidere" nella ROADMAP e nel resoconto; la squadra intanto va avanti con il resto.
7. Mai pubblicare i file OMI originali, l'indice completo delle quotazioni o dati personali.

## Il giro di ogni mattina

1. **Preparazione** (capo squadra):
   - legge le notifiche;
   - allinea il branch con `main` se nel frattempo hai pubblicato;
   - aggiorna i dati locali con la stessa raccolta del sito, se sono più vecchi di un giorno (`NODE_USE_ENV_PROXY=1 npm run raccogli -- --max-dettagli 300 --tempo-max 40`, poi `npm run cacciatore`: in questo ambiente Node deve passare dal proxy);
   - se il giorno prima qualcosa è rimasto a metà, lo riprende.
2. **Controlli** (in parallelo): Guardiano della raccolta, Controllore dei dati, Collaudatore del sito.
3. **Sviluppo**: lo Sviluppatore ripara i problemi gravi trovati, poi una voce della ROADMAP.
4. **Revisione**: il Revisore indipendente controlla tutto il lavoro del giorno.
5. **Chiusura** (capo squadra):
   - tutti i test;
   - salvataggio sul branch e pull request aggiornata;
   - ROADMAP e [diario](docs/diario-squadra.md) aggiornati;
   - resoconto in poche righe nella sessione: cosa va, cosa è stato fatto, cosa aspetta te.

Lo schema della squadra è in `.claude/workflows/squadra-quotidiana.js`.

## Come fermarla o cambiarla

- Scrivi nella sessione di Claude Code "**ferma la squadra**" (o "cambia l'orario della squadra alle …").
- Oppure apri le attività programmate del tuo account su claude.ai e disattiva "Squadra Radar Aste – giro del mattino".
