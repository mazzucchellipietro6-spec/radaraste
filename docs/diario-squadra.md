# Diario della squadra

Un paragrafo per ogni giro del mattino, il più recente in alto: come sta il sito, cosa è stato fatto, cosa aspetta una decisione. Ruoli e regole in [SQUADRA.md](../SQUADRA.md).

---

## 12-13/11/2026 – URGENTE: raccolta ferma da 11 giorni

- **Sito pubblicato:** fermo alle aste del 2/11. Anche la raccolta n. 36 (12/11) è fallita per lo stesso test su `main`. Il giro della squadra del 12/11 non è partito: la notifica non è arrivata.
- **Agenti:** nessuno. Serve il Merge della pull request #4.

## 11/11/2026 – URGENTE: raccolta ferma da 9 giorni

- **Sito pubblicato:** fermo alle aste del 2/11 (raccolta n. 35 fallita per lo stesso test su `main`).
- **Agenti:** nessuno. Serve il Merge della pull request #4.

## 10/11/2026 – URGENTE: raccolta ferma da 8 giorni

- **Sito pubblicato:** fermo alle aste del 2/11 (raccolta n. 34 fallita per lo stesso test su `main`).
- **Agenti:** nessuno. Serve il Merge della pull request #4.

## 8-9/11/2026 – URGENTE: raccolta ferma da 7 giorni

- **Sito pubblicato:** fermo alle aste del 2/11. Le raccolte n. 32 e 33 sono fallite per lo stesso test su `main`. Il giro dell'8/11 non è partito: la notifica è arrivata solo il 9/11.
- **Agenti:** nessuno, finché la raccolta non riparte con il Merge della pull request #4.

## 7/11/2026 – URGENTE: raccolta ferma da 5 giorni

- **Sito pubblicato:** fermo alle aste del 2/11 (raccolta n. 31 fallita per lo stesso test su `main`). Serve il Merge della pull request #4.
- **Revisore:** pronto sulle foto di copertina. Ha corretto:
  - il controllo dell'indirizzo della foto, ora fatto comunque arrivi;
  - la stessa regola nella mappa;
  - l'alt delle foto, ora vuoto;
  - il clic sulla foto degli affari.
- **Test:** 470 su 470, anche con l'orologio avanti di 90 giorni.

## 6/11/2026 – URGENTE: raccolta ferma da 4 giorni

- **Sito pubblicato:** visibile ma fermo alle aste del 2/11 (raccolta n. 30 fallita per lo stesso test). Serve il Merge della pull request #4.
- **Agenti oggi:** nessuno.

## 5/11/2026 – URGENTE: raccolta ferma da 3 giorni

- **Sito pubblicato:** visibile ma fermo alle aste del 2/11. La raccolta n. 29 è fallita per lo stesso test su `main`. Serve il Merge della pull request #4, oppure la richiesta di una correzione piccola.
- **Agenti oggi:** nessuno.

## 4/11/2026 – URGENTE: raccolta ancora ferma

- **Sito pubblicato:** visibile ma fermo alle aste del 2/11. Anche la raccolta n. 28 è fallita per lo stesso test con data fissa su `main`.
- **Cosa serve:** il Merge della pull request #4, oppure una pull request con la sola correzione del test (va chiesta: la squadra lavora solo sul suo branch).
- **Agenti oggi:** nessuno, finché la raccolta non riparte.

## 3/11/2026 – URGENTE: raccolta ferma

- **Sito pubblicato:** visibile, ma fermo alle aste del 2/11. La raccolta n. 27 su GitHub è fallita al primo passo, i test.
  - **Causa:** un test degli abbonamenti su `main` aveva una data fissa (abbonamento di prova che scade il 2/11) e dal 3/11 fallisce da solo. Con i test rossi il workflow non raccoglie e non pubblica.
  - **Rimedio:** sul branch quel test era già corretto. Il Merge della #4 fa ripartire tutto.
- **Lavoro:** cercati gli altri test con lo stesso difetto spostando l'orologio avanti. Ne è uscito uno che sarebbe scaduto tra un anno: corretto. Nuovo comando `npm run test:futuro`. Ora tutti i test passano anche con l'orologio avanti di 3 mesi, 1 anno e 2 anni.
- **Test:** 460 su 460.
- **Agenti oggi:** nessuno, per non ingrandire ancora la pull request e per risparmiare i limiti d'uso.

## 2/11/2026 – ripresa dopo il limite settimanale

- **Sito pubblicato:** funziona. Le raccolte su GitHub dal 30/10 al 2/11 sono tutte riuscite (n. 23-26). La raccolta locale di oggi: 23.368 aste, 1 affare (Canicattì).
- **Giro saltato l'1/11:** il limite settimanale era finito il 31/10 (3 agenti al giorno più i 3 lavori in più del 28/10). Da oggi al massimo 2 agenti al giorno.
- **Lavori:**
  - Collaudatore ripreso e finito: 412 caricamenti senza errori. La scheda dice "almeno il N° tentativo (stima)" quando i prezzi lo dimostrano, e le card della home non sono più tagliate.
  - Revisore: pronto. La stima ora guarda anche i prezzi dello storico (129 aste) e la regola dei terreni riconosce più fabbricati.
- **Test:** 460 su 460.

## 31/10/2026

- Revisione del 30/10 completata. Cinque correzioni:
  - porzioni di nuovo come più unità;
  - complessi aziendali come più beni;
  - niente metri quadri dell'area esterna;
  - niente superficie del terreno sotto un fabbricato;
  - tentativo minimo con i ribassi massimi di legge.
- Regola nuova: nessun valore OMI per i lotti di solo terreno (22 lotti, nessuna casa toccata).
- Il Collaudatore si è fermato a metà sul limite settimanale.

## 30/10/2026

- **Aste estere:** nessuna fonte consentita e raggiungibile da qui (`docs/fonti-estere.md`).
- **Controllore dei dati:** 7 regole corrette, tra cui:
  - capannoni stimati come uffici;
  - metri quadri non letti;
  - veicoli senza documento unico;
  - falsi risparmi "prima casa".
- Il Revisore si è fermato sul limite di 5 ore ed è stato completato il giorno dopo.

## 29/10/2026 – Radar 3D e Cloudflare

- **Sito pubblicato:** funziona, la raccolta n. 22 su GitHub è riuscita.
- **Lavori rimasti a metà:** i tre rilanciati la sera del 28/10 si erano fermati subito sul limite d'uso di 5 ore. Oggi ne sono ripartiti due:
  - **Radar 3D finito:** funziona con WebGL, con i ripieghi dello sfondo e al 2D;
  - **preparazione per Cloudflare riveduta:** le intestazioni di sicurezza avrebbero bloccato il Radar 3D; corrette e provate su 27 pagine.
- **Revisore:** pronto.
  - Il caso sospetto di Sant'Elpidio a Mare (sconto 62%) è vero: il valore è confermato da OMI e perito, e lo sconto viene da 4 ribassi.
  - Ha trovato due valori OMI gonfiati e li ha corretti:
    - Perugia, "Fraz. Villa Pitignano" letto come villa;
    - San Severino Marche, lotto con più unità.
- **Test:** 436 su 436.
- **Aste estere:** ancora da fare.
- **Per te:** Merge della pull request #4 e due decisioni nuove in ROADMAP (offerta massima dopo molte aste deserte, OpenFreeMap).

## 28/10/2026 – Stratega su più anni e collaudo

- **Sito pubblicato:** funziona, la raccolta n. 21 su GitHub è riuscita. La raccolta locale funziona di nuovo: 24.023 aste del 28/10.
- **Collaudatore** (turno del mercoledì): 256 caricamenti di pagina, percorsi principali tutti funzionanti, nessun errore. Ha corretto 4 problemi minori: livelli dei titoli, luogo tagliato nelle card, data nella mappa, anteprima degli abbonamenti che non restava aperta.
- **Lavoro:** fatta la pagina dello Stratega su più anni, con il grafico. La proiezione è stata corretta in 3 punti.
- **Revisore:** pronto. Ha corretto anche:
  - il calcolatore "Conviene?", che aperto da un'asta non riceveva il valore di mercato del sito;
  - la doppia cifra degli affitti nello Stratega;
  - la scritta "Offerte entro" nelle card del Demanio;
  - le categorie del Demanio.
- **Test:** 416 su 416.
- **Per te:** Merge della pull request #4 e tre decisioni nuove in ROADMAP, nessuna urgente.

## 27/10/2026 – zona abbonamenti riveduta

- **Sito pubblicato:** funziona, la raccolta n. 20 su GitHub è riuscita. La pull request #4 aspetta il tuo Merge.
- **Controllo del giorno** (Controllore dei dati): saltato, perché i dati locali non sono di oggi.
- **Lavori:** riviste la pagina prezzi e le bozze legali (testi come il server, segnaposto dove i dati non sono certi, servizi esterni in privacy e cookie) e l'account con il database. In quest'ultimo, due falle gravi chiuse:
  - un link poteva far entrare qualcuno nell'account di un altro (ora c'è l'accesso con PKCE);
  - i dati di una persona potevano finire nell'account di un'altra.
- **Revisore indipendente:** pronto. Ha corretto lo schema perché si possa rieseguire e un caso con due link chiesti di seguito.
- **Test:** 395 su 395.
- **Per te:** nuove decisioni sugli abbonamenti in ROADMAP (rimborsi, IVA, recesso, prova gratuita); niente di urgente, gli abbonamenti restano spenti.

## 26/10/2026 – giro leggero, correzioni rivedute

- **Sito pubblicato:** funziona. Le raccolte su GitHub del 23, 24, 25 e 26/10 sono tutte riuscite.
- **Giri saltati:** il 23, 24 e 25/10 la squadra non ha lavorato. Il giro del 22/10, con 5 agenti, aveva esaurito il limite d'uso settimanale. Da oggi lavora leggera: al massimo 3 agenti al giorno.
- **Oggi:**
  - risolti gli 8 problemi aperti dei controlli del 22/10;
  - sigle di provincia OMI corrette: 252 immobili in più con il valore;
  - il Revisore indipendente ha controllato tutto dal 22/10, ha corretto altri 6 problemi (il più importante: le date del Demanio in scheda, mappa e calendario) e ha dato via libera.
  - Test: 373 su 373.
- **Per te:**
  - Merge della pull request;
  - due decisioni nuove in ROADMAP: limiti d'uso, fonti concordi.
- **Dati locali:** da questo ambiente il Portale va spesso in timeout, quindi le prove usano le aste del 13/10 ancora in corso.

## 22/10/2026 – controlli

- Guardiano, Controllore e Collaudatore hanno trovato e corretto problemi veri sul sito pubblicato (vedi il 26/10). Sviluppatore e Revisore si sono fermati sul limite d'uso settimanale.

---

## 20/10/2026 – nasce la squadra

- Squadra creata su tua richiesta: giro ogni mattina alle 08:13, dopo la raccolta automatica.
- Stato del sito: pubblicato e aggiornato ogni giorno (raccolte del 13-19/10 riuscite). La scheda dell'asta, rotta dal 13/10, è stata corretta e pubblicata il 19/10 (#3).
- In lavorazione: zona abbonamenti in modalità test e rifiniture (Stratega su più anni, Radar 3D, aste auto dall'estero). Erano state interrotte dai limiti d'uso e sono ripartite oggi.
