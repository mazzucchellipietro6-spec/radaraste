# Consulente d'asta AI – progetto

**Stato:** solo progettazione. Nessun servizio a pagamento attivato e nessuna chiave API usata. Decidi tu se e quale servizio usare, dopo aver letto questo documento.

> **Avvertenza.** I prezzi dei servizi AI di OpenAI, Google, Groq, OpenRouter e Mistral vengono da estratti di ricerca. La rete di questo ambiente non ha permesso di aprire le pagine ufficiali dei listini: **vanno ricontrollati a mano prima di decidere** (link nella tabella). I prezzi di Claude vengono dalla documentazione ufficiale di Anthropic (listino al 06/10/2026).

---

## 1. Cosa fa (in breve)

Parli con il consulente come con un esperto di aste. Per esempio: *"Ho 60.000 €, voglio una rendita in Liguria, posso fare piccoli lavori"*. Il consulente:

1. **Capisce la richiesta:** budget, obiettivo (vivere / affittare / rivendere), zona, rischio che accetti, lavori che puoi fare. Se manca qualcosa, chiede (una domanda alla volta).
2. **Cerca tra le aste reali** del sito, le stesse 24.000+ raccolte ogni giorno dalle fonti ufficiali, e sceglie le **3-5 più adatte**, spiegando perché.
3. **Legge la perizia** e segnala rischi e costi nascosti: abusi, occupazione, quote, spese condominiali, vincoli, stato dell'immobile. Ogni segnalazione riporta la frase esatta e la pagina della perizia.
4. **Fa i calcoli:** costo totale, tasse, mutuo, rendimento da affitto o guadagno da rivendita. Li fanno le funzioni già testate del sito (`js/calcoli.js`, `js/punteggio.js`), mai l'AI "a mente".
5. **Indica l'offerta massima consigliata** e ti guida passo passo fino all'invio dell'offerta: PEC, firma digitale, cauzione, offerta sul PVP, giorno dell'asta, saldo.
6. **Ricorda le tue preferenze** (nel tuo browser) e ti avvisa quando esce un'asta adatta a te. Gli avvisi usano le ricerche salvate e il Cacciatore di affari: non servono AI né costi.
7. **Non inventa mai dati.** Ogni numero ha la sua fonte (avviso PVP, perizia, tariffe di legge con data). Se un dato manca, lo dice.

---

## 2. Come funziona (architettura)

```
 Browser (sito statico)                    Piccolo server "ponte"                Servizio AI
 ┌──────────────────────────┐   domanda   ┌──────────────────────────┐  API   ┌───────────────┐
 │ consulente.html (chat)   │ ──────────▶ │ tiene la chiave segreta  │ ─────▶ │ modello       │
 │ preferenze nel browser   │ ◀────────── │ esegue gli STRUMENTI:    │ ◀───── │ (sceglie gli  │
 │ schede delle aste in chat│   risposta  │  cerca_aste, scheda_asta,│        │  strumenti e  │
 └──────────────────────────┘ + fonti     │  calcola_costi, mutuo,   │        │  spiega)      │
                                          │  leggi_perizia, guida    │        └───────────────┘
                                          │ limiti di spesa e uso    │
                                          └──────────────────────────┘
```

- **La chiave API non può stare nel sito pubblico.** Serve un piccolo "ponte" (una funzione serverless) che la custodisce. Opzioni con piano gratuito: Cloudflare Workers, Netlify o Vercel Functions. I limiti dei piani gratuiti **sono da verificare**: non li ho potuti aprire da qui.
- **L'AI non tocca mai direttamente i numeri.** Sceglie quali strumenti usare e spiega i risultati. Gli strumenti lavorano sui dati veri:

| Strumento | Cosa fa | Fonte dei dati |
|---|---|---|
| `cerca_aste(filtri)` | cerca per zona, budget, tipo, stato, punteggio | `data/aste.js` (raccolta giornaliera) |
| `scheda_asta(id)` | tutti i dati di un'asta, compresi storico dei tentativi e link | schede a pezzi `data/dettagli/` |
| `calcola_costi(id, offerta, regime)` | costo totale, imposte, sconto, offerta massima | `js/calcoli.js` + `config/tariffe.js` (fonte e data per ogni aliquota) |
| `simula_mutuo(importo, anni, tasso)` | rata, anticipo, sostenibilità | formula della rata francese; il tasso lo inserisci tu |
| `rendimento(id, canone)` | rendita lorda e netta (cedolare 21% o 10%) | canone: valori OMI quando li avremo, altrimenti chiesto a te |
| `leggi_perizia(id)` | testo della perizia con numero di pagina | PDF dal PVP (serve l'accesso a `resource-pvp.giustizia.it`) |
| `guida_offerta(id)` | i passi dell'offerta telematica, con le date dell'avviso | Portale dei Servizi Telematici del Ministero della Giustizia |

---

## 3. Come evitare errori e risposte inventate

1. **Numeri solo dagli strumenti.** Le istruzioni del modello vietano di scrivere importi, percentuali o date che non arrivino da un risultato degli strumenti.
2. **Controllo automatico della risposta.** Prima di mostrarla, il server cerca ogni numero della risposta (€, %, date, mq) nei risultati degli strumenti di quella conversazione. Un numero che non si trova lì viene tolto e sostituito con "dato non disponibile", e la conversazione lo registra.
3. **Fonte accanto a ogni numero.** La risposta ha un formato fisso (dati strutturati): per ogni numero ci sono la fonte e il link (avviso, perizia, tariffa con data). Il sito mostra un'icona "fonte" accanto a ciascuno.
4. **"Non lo so" è una risposta valida.** Le istruzioni chiedono di dirlo e di indicare dove verificare (perizia, delegato, notaio).
5. **Le aste proposte esistono davvero.** Ogni asta ha un `id` che il server verifica nei dati. Un'asta senza `id` valido non viene mostrata.
6. **Niente consulenza legale o finanziaria.** Avvertenza fissa: le stime non sostituiscono notaio, avvocato e commercialista.
7. **Test prima di partire.** Un insieme di 30-50 domande vere, con controlli automatici: nessun numero inventato, aste esistenti, rispetto del budget, rischi citati con la frase della perizia. Si ripete a ogni modifica.
8. **Limiti di spesa.** Tetto mensile sul conto del servizio AI, limite di messaggi per utente al giorno, conversazioni brevi (la storia vecchia si riassume).
9. **Privacy.** Al servizio AI va solo quello che scrivi nella chat. Niente nomi o dati personali delle procedure: i dati raccolti non li contengono. Serve scegliere un servizio con contratto per il trattamento dei dati (DPA) e possibilmente con elaborazione nell'UE.

---

## 4. Quale servizio AI: confronto

Ipotesi di una **conversazione tipo**:
- 8 domande, con ricerca, 3-5 schede, calcoli e la lettura di 1-2 perizie;
- 90.000 token di input nuovi e 150.000 letti dalla cache (istruzioni e definizioni degli strumenti ripetute);
- 10.000 token di output, compreso il "ragionamento".

È una stima prudente: una conversazione semplice costa molto meno, una con molte perizie di più.

| Opzione | Prezzo input / output per milione di token | Costo per conversazione | Qualità per questo uso | Note |
|---|---|---|---|---|
| **Claude Sonnet 5.5** (Anthropic) | 2 $ / 10 $ (cache 0,20 $) | **≈ 0,31 $** | molto buona: usa bene gli strumenti, buon italiano | prezzo dalla documentazione Anthropic |
| Claude Haiku 5.5 (Anthropic) | 0,10 $ / 0,50 $ | ≈ 0,02 $ | buona per richieste semplici, meno solida sui ragionamenti lunghi | prezzo valido per richieste fino a 100.000 token |
| Claude Opus 5.5 (Anthropic) | 4 $ / 20 $ (cache 0,20 $) | ≈ 0,59 $ | la più alta di Anthropic per i ragionamenti difficili | |
| GPT-6.1 Sol (OpenAI) | 2 $ / 10 $ (cache 0,10 $) | ≈ 0,30 $ | fascia simile a Sonnet | prezzo da estratti, **da verificare** |
| GPT-6 Luna (OpenAI) | 0,10 $ / 0,50 $ | ≈ 0,02 $ | economico | da verificare; il function calling ha dei limiti |
| Gemini 3.8 Flash (Google) | 0,75 $ / 3,75 $ fino al 31/12/2026, poi 1,50 $ / 7,50 $ | ≈ 0,12 $ (≈ 0,23 $ dal 2027) | buona | da verificare. Il piano gratuito **non si può usare** per un servizio a utenti nell'UE (termini Gemini) |
| Modelli aperti nel browser (WebLLM) | gratis | 0 $ | **insufficiente**: memoria di 4.000 token, function calling sperimentale, servono 5-6 GB di memoria video | non adatto |
| Groq / OpenRouter (piani gratuiti) | gratis con limiti | 0 $ | variabile | limiti bassi (es. 50 richieste al giorno); alcuni modelli gratuiti usano i dati per l'addestramento: **non adatti a un servizio pubblico** |

Fonti: Claude dal listino Anthropic (06/10/2026); gli altri da estratti di ricerca del 12/10/2026 sulle pagine ufficiali (openai.com, ai.google.dev, console.groq.com, openrouter.ai, docs.mistral.ai), **non aperte direttamente**.

### Costo al mese

Ipotesi: ogni utente fa **4 conversazioni al mese**. Gli utenti molto attivi ne fanno di più e il tetto per utente serve proprio a questo.

| Utenti | Conversazioni/mese | Claude Haiku 5.5 | Claude Sonnet 5.5 | Claude Opus 5.5 | Gemini 3.8 Flash (2026) |
|---|---|---|---|---|---|
| 10 | 40 | ≈ 0,60 $ | ≈ 12 $ | ≈ 24 $ | ≈ 5 $ |
| 100 | 400 | ≈ 6 $ | ≈ 124 $ | ≈ 236 $ | ≈ 47 $ |
| 1.000 | 4.000 | ≈ 62 $ | ≈ 1.240 $ | ≈ 2.360 $ | ≈ 465 $ |

A questo si aggiunge il ponte serverless, gratuito nei piani base fino a un certo numero di richieste (da verificare). Gli avvisi delle aste nuove non costano nulla: non usano l'AI.

### Raccomandazione

- **Per partire: Claude Sonnet 5.5** con tetto di spesa mensile (es. 30 $) e limite di 10 messaggi al giorno per utente. Ha il miglior equilibrio tra qualità del ragionamento con gli strumenti, italiano e costo. Fra 10 e 100 utenti la spesa resta fra 12 e 124 $ al mese.
- **Se il costo conta più della qualità:** Claude Haiku 5.5 per le domande semplici (ricerca e spiegazione) e Sonnet 5.5 solo quando serve leggere una perizia o fare un piano. È più complesso da gestire: da valutare dopo i primi test.
- **Da evitare per un servizio pubblico:** i piani gratuiti (limiti, uso dei dati, divieto UE per Gemini) e i modelli nel browser (troppo deboli).
- Con gli abbonamenti (quando deciderai) il consulente può essere una funzione riservata agli abbonati, che ne copre il costo.

---

## 5. Cosa è già pronto senza AI (da costruire stanotte)

- **Interfaccia della chat** (`consulente.html`): conversazione, suggerimenti di domande, schede delle aste dentro la chat, calcoli, fonti accanto ai numeri.
- **Modalità senza AI** (gratuita, già utile): capisce frasi semplici con regole, cioè importi in euro, regioni, province e comuni, obiettivi ("vivere", "affittare", "rendita", "rivendere", "ristrutturare"), rischio e lavori. Poi cerca, calcola e mostra 3-5 aste con il "perché" scritto a regole, partendo dai numeri. Dichiara sempre che è una modalità semplice.
- Quando attiverai un servizio AI, la stessa interfaccia passerà le domande al ponte. Gli strumenti saranno quelli già usati dalla modalità senza AI.

## 6. Cosa devi decidere

1. Se attivare il consulente AI e con quale servizio (raccomandato: Claude Sonnet 5.5).
2. Tetto di spesa mensile e limite di messaggi per utente.
3. Se renderlo gratuito, solo per abbonati o con una prova gratuita.
4. Se aprire l'accesso a `resource-pvp.giustizia.it`, necessario per leggere le perizie in automatico.
