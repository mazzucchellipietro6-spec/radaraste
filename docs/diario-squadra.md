# Diario della squadra

Un paragrafo per ogni giro del mattino, il più recente in alto: come sta il sito, cosa è stato fatto, cosa aspetta una decisione. Ruoli e regole in [SQUADRA.md](../SQUADRA.md).

---

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
