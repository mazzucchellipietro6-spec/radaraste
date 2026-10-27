# Abbonamenti di Radar Aste Italia (modalità test)

Questa guida spiega la "zona abbonamenti" del sito: cosa è già pronto, quanto potrebbe costare a chi si abbona, come funziona dietro le quinte e cosa devi fare tu, passo per passo, per provarla. È scritta per chi non programma.

> **Oggi è tutto spento e in modalità test.** Il sito pubblicato funziona esattamente come prima: nessuna funzione è bloccata, nessuno vede prezzi o pulsanti di pagamento, non parte nessuna richiesta verso Stripe o Supabase. Nessun pagamento reale è possibile finché non lo decidi tu, e solo dopo la lista di controllo in fondo.

---

## 1. Cosa c'è e cosa no

**Già pronto (nel repository, spento):**

| Parte | File | Cosa fa |
|---|---|---|
| Piani e prezzi | `config/abbonamenti.js` | I tre piani, i prezzi proposti, quali funzioni sblocca ogni piano, i limiti del piano Gratis. L'interruttore generale è `attivi: false`. |
| Blocchi e limiti | `js/piani.js` | Decide se una funzione è disponibile per il piano dell'utente e mostra il riquadro "Sblocca con Base/Pro". Con l'interruttore spento non blocca nulla. |
| Account | `js/account.js` | Registrazione, accesso (email e password, link via email, Google), uscita, abbonamento, dati sincronizzati tra dispositivi, "Scarica i miei dati", cancellazione dell'account. |
| Pagine | `prezzi.html`, `accedi.html`, `account.html` | Prezzi, accesso, pagina del proprio account. |
| Bozze legali | `termini.html`, `privacy.html`, `cookie.html`, `recesso.html`, `avvertenze.html` | **Bozze**: i tuoi dati di titolare sono segnaposto `[DA COMPLETARE: ...]` e vanno fatte verificare da un professionista. |
| Funzioni del server | `functions/api/stripe/checkout.js`, `portale.js`, `webhook.js`, `functions/api/account/cancella.js`, con il codice comune in `servizi/` | Creano la pagina di pagamento di Stripe, aprono il portale clienti, ricevono le notifiche di Stripe, cancellano l'account. Senza configurazione rispondono "non configurati". |
| Database | `supabase/schema.sql` | Tabelle degli utenti, degli abbonamenti, dei dati sincronizzati e delle notifiche di Stripe, con le regole di sicurezza. |
| Pubblicazione | `wrangler.toml`, `_headers`, passo "Pubblica su Cloudflare Pages" del workflow | Sito su Cloudflare Pages con le funzioni e le intestazioni di sicurezza. Parte solo quando lo configuri. |
| Test | `tests/piani.test.js`, `tests/account.test.js`, `tests/funzioni.test.mjs`, `tests/abbonamenti-pagine.test.mjs`, `tests/cloudflare.test.mjs` | Provano tutto con servizi finti: nessuna chiamata vera a Stripe, Supabase o servizi email. |

**Non c'è (serve te):**

- gli account su Cloudflare, Supabase, Stripe e Resend, e le loro chiavi;
- l'approvazione dei prezzi (quelli qui sotto sono una **proposta**);
- i tuoi dati di titolare, la partita IVA e le scelte fiscali;
- un dominio tuo, se vuoi inviare email agli utenti (vedi passo 4);
- alcune funzioni elencate nei piani sono segnate "(in arrivo)": avvisi sulle aste nuove, consulente con intelligenza artificiale, statistiche avanzate. Non si possono vendere finché non esistono davvero.

**Anteprima solo per te.** Aggiungi `?anteprima=abbonamenti` all'indirizzo di una pagina (per esempio `prezzi.html?anteprima=abbonamenti`): vedi blocchi e prezzi con la fascia "Anteprima abbonamenti – modalità test: nessun pagamento reale". Resta attiva finché tieni aperta la scheda del browser; `?anteprima=no` la spegne. Gli altri visitatori non vedono nulla.

---

## 2. I tre piani: PROPOSTA da approvare

Prezzi in euro, IVA inclusa. L'annuale costa come 10 mesi: due mesi gratis.

| Piano | Al mese | All'anno | Per chi | Cosa include |
|---|---|---|---|---|
| **Gratis** | 0 € | 0 € | Chi cerca aste e fa i conti | Elenco, mappa, schede, calcolatore, mutuo, confronto, guida, consulente con le regole del sito. I primi 3 affari di oggi, le prime 3 combinazioni d'oro, fino a 10 aste seguite. |
| **Base** | 9 € | 90 € (risparmio 18 €) | Chi segue le aste con costanza | Tutti gli affari di oggi e la selezione personale, tutte le combinazioni d'oro, aste seguite senza limite, report PDF di ogni asta; avvisi (in arrivo). |
| **Pro** (consigliato) | 24 € | 240 € (risparmio 48 €) | Chi investe con un piano | Tutto il Base, lo Stratega d'asta; consulente con intelligenza artificiale e statistiche avanzate (in arrivo). |

**Prova gratuita:** 14 giorni del piano Pro, una sola volta per persona (solo a chi non ha mai avuto un abbonamento). Si inserisce la carta all'inizio; chi disdice prima della fine non paga nulla, e tre giorni prima della scadenza Stripe manda l'avviso che il sito trasforma in un'email.

I limiti del piano Gratis (3 affari, 3 combinazioni, 10 aste seguite) si cambiano in `config/abbonamenti.js`.

### Perché questi prezzi

Il sito costa pochissimo da tenere acceso: i calcoli li fa il browser o la raccolta del mattino. I costi veri sono tre.

**1. Il pagamento con Stripe.** Per le carte europee standard circa **1,5% + 0,25 €** a pagamento (*da verificare sul listino di Stripe Italia*; la parte che gestisce gli abbonamenti, Stripe Billing, può aggiungere una piccola percentuale: da verificare). Il costo fisso pesa molto sui pagamenti piccoli, per questo conviene spingere l'annuale.

**2. L'IVA.** Con i prezzi IVA inclusa, su 9 € l'IVA italiana al 22% è 1,62 €. Per i clienti di altri Paesi dell'Unione si applica l'IVA del loro Paese: da chiarire con il commercialista.

**3. Il consulente con intelligenza artificiale (solo Pro, quando lo attiverai).** Secondo `CONSULENTE.md`, con Claude Sonnet 5.5 una conversazione tipo costa **circa 0,31 $** (prezzo in dollari). Con 4 conversazioni al mese, l'ipotesi di `CONSULENTE.md`, sono circa 1,24 $ per utente; un utente molto attivo con 30 conversazioni ne costa circa 9,30 $. Per questo il Pro costa di più e il consulente va dato con un tetto (in `CONSULENTE.md` si propone 10 messaggi al giorno per utente e un tetto di spesa mensile).

**Conto d'esempio** (con i numeri sopra; Stripe da verificare, consulente escluso):

| | Prezzo | Senza IVA (22%) | Stripe circa | Resta circa |
|---|---|---|---|---|
| Base mensile | 9 € | 7,38 € | 0,39 € | 6,99 € |
| Base annuale | 90 € | 73,77 € | 1,60 € | 72,17 € |
| Pro mensile | 24 € | 19,67 € | 0,61 € | 19,06 € (meno il consulente) |
| Pro annuale | 240 € | 196,72 € | 3,85 € | 192,87 € (meno il consulente) |

Dal "resta" vanno tolte anche le tasse sul reddito e il commercialista: dipendono dalla tua situazione.

**Supabase, Cloudflare e Resend** hanno piani gratuiti che dovrebbero bastare ai primi utenti. I limiti esatti (utenti al mese, spazio del database, richieste alle funzioni, email al giorno, eventuale sospensione dei progetti gratuiti inattivi) cambiano nel tempo: **da verificare** sui loro siti prima di partire.

---

## 3. Come funziona

```
  Utente ──► sito su Cloudflare Pages (pagine come oggi + funzioni /api/...)
               │                         │
               │ accesso e dati          │ pagamento, portale, cancellazione
               ▼                         ▼
           Supabase                    Stripe ──(notifica firmata)──► /api/stripe/webhook
     (utenti, abbonamenti,          (Checkout e                          │
      dati sincronizzati,            portale clienti)                    ├─► aggiorna l'abbonamento su Supabase
      regole di sicurezza)                                               └─► email con Resend
```

- **Sito: Cloudflare Pages.** Lo stesso sito di oggi, più le funzioni della cartella `functions/` che rispondono agli indirizzi `/api/...`. Il codice comune delle funzioni sta in `servizi/`. Il workflow di ogni mattina continua a pubblicare su GitHub Pages come sempre e, se lo configuri, pubblica anche su Cloudflare. Su GitHub Pages le funzioni non esistono: gli abbonamenti funzionano solo dall'indirizzo di Cloudflare.
- **Utenti e dati: Supabase**, con i server nell'Unione Europea. Gestisce registrazione, password e accessi. Le tabelle hanno la "Row Level Security": ognuno legge solo il proprio abbonamento e legge e scrive solo i propri dati; l'abbonamento lo scrivono solo le funzioni del sito, mai il browser.
- **Pagamenti: Stripe.** L'utente paga su una pagina di Stripe (Checkout) e gestisce carta, fatture e disdetta nel portale clienti di Stripe. Il sito non vede mai i dati della carta.
- **Notifiche di Stripe (webhook).** Quando un abbonamento nasce, cambia, finisce o un pagamento non riesce, Stripe chiama `/api/stripe/webhook`. La funzione controlla la firma, non elabora due volte la stessa notifica, aggiorna la tabella e manda l'email giusta.
- **Email: Resend.** Benvenuto, prova in scadenza, pagamento non riuscito, abbonamento disdetto, account cancellato. Senza chiave di Resend le email semplicemente non partono.
- **Chiavi.** Nel sito (e quindi nel browser) vanno solo le due chiavi **pubbliche per natura**: la chiave anonima di Supabase e la chiave pubblicabile di Stripe. Tutte le altre stanno **solo** nelle variabili d'ambiente di Cloudflare, mai nel codice.
- **Sicurezza in più.** Le funzioni accettano solo chiavi Stripe di **test** (`sk_test_`). Una chiave reale viene rifiutata finché non imposti tu a mano `PAGAMENTI_REALI=si` su Cloudflare.

---

## 4. Passo per passo (tutto in modalità test, costo zero)

Segui l'ordine. Tieni le chiavi in un gestore di password: non incollarle in chat, email o file del repository.

### Passo 1 – Cloudflare Pages

1. Crea un account gratuito su cloudflare.com.
2. Crea il progetto: **Workers e Pages → Crea → Pages → carica i file direttamente** ("Direct Upload"). Nome: **`radaraste`** (lo stesso scritto in `wrangler.toml`; se scegli un altro nome, cambialo anche lì), ramo di produzione `main`. Non serve caricare nulla adesso: lo fa il workflow.
3. Crea un token: **icona del profilo → Profilo → Token API → Crea token → Token personalizzato**, con il permesso **Account → Cloudflare Pages → Modifica**, limitato al tuo account.
4. Copia l'**ID account** (pagina principale dell'account o "Workers e Pages", colonna a destra).
5. Su GitHub, nel repository del sito: **Settings → Secrets and variables → Actions**:
   - secret `CLOUDFLARE_API_TOKEN` = il token;
   - secret `CLOUDFLARE_ACCOUNT_ID` = l'ID account;
   - nella scheda *Variables*, variabile `CF_PAGES_PROGETTO` = `radaraste`.
6. Lancia il workflow a mano (**Actions → "Aggiorna aste e pubblica il sito" → Run workflow**). Alla fine il sito è anche su `https://radaraste.pages.dev` (o l'indirizzo che Cloudflare ti mostra). Cloudflare mostra le pagine senza ".html" (per esempio `/prezzi`): è normale.

Senza la variabile `CF_PAGES_PROGETTO` il passo non parte; se fallisce, GitHub Pages viene pubblicato lo stesso.

### Passo 2 – Supabase (utenti e dati)

1. Crea un account su supabase.com e un progetto nuovo. **Regione: Unione Europea** (per esempio Francoforte). Scegli una password del database robusta e salvala.
2. **SQL Editor → New query**: incolla tutto il file `supabase/schema.sql` e premi **Run**. Si può rieseguire senza perdere dati.
3. **Authentication → URL Configuration**:
   - *Site URL*: l'indirizzo del sito su Cloudflare (es. `https://radaraste.pages.dev`);
   - *Redirect URLs*: `https://radaraste.pages.dev/accedi.html**` (con il tuo indirizzo).
4. **Authentication → Providers**: Email con "Confirm email" attivo. Google solo se lo vuoi (servono ID e segreto client da Google Cloud).
5. **Authentication → Email Templates**: traduci i testi in italiano, senza cambiare il link `{{ .ConfirmationURL }}` dei modelli.
6. Email agli utenti veri: secondo le regole attuali di Supabase (da verificare), il servizio email incluso manda le email solo agli indirizzi del tuo team e con pochi invii all'ora. Per le prove va bene; per gli utenti veri imposta un servizio SMTP tuo (**Authentication → Emails → SMTP Settings**), per esempio quello di Resend.
7. Da **Project Settings → API** copia:
   - l'indirizzo del progetto (`https://<id>.supabase.co`): pubblico;
   - la chiave **anon** o **publishable** (`sb_publishable_...`): pubblica per natura;
   - la chiave **service_role** o **secret** (`sb_secret_...`): **SEGRETISSIMA**, scavalca tutte le regole di sicurezza. Va solo su Cloudflare.

**Link via email: vanno aperti nello stesso browser.** Il sito usa l'accesso con PKCE: chi chiede un link di accesso, crea un account o sceglie Google tiene nel proprio browser un codice segreto, valido 24 ore, e al ritorno sul sito l'accesso si completa solo con quel codice. Così un link aperto altrove, o mandato da un'altra persona, non fa entrare nessuno in un account. Di conseguenza:

- il link dell'email va aperto **nello stesso browser** (stesso dispositivo, stessa app) in cui è stato chiesto. Attenzione alle app di posta del telefono che aprono i link in un loro browser interno: lì il codice non c'è. Il sito in quel caso dice di aprire il link nel browser giusto o di chiederne uno nuovo; per chi si è registrato con la password l'email risulta comunque confermata e si entra con email e password;
- gli **inviti** e i **link di accesso mandati dal pannello di Supabase** (pagina degli utenti) **non funzionano**: non hanno il codice del browser e il sito li rifiuta. Per le prove crea gli account e chiedi i link sempre da `accedi.html`.

### Passo 3 – Stripe in modalità test

1. Crea un account su stripe.com. Lavora **sempre in modalità test** (interruttore "Modalità test" o ambiente di prova in alto). Non serve attivare l'account per i pagamenti reali.
2. **Catalogo prodotti → Aggiungi prodotto**, due prodotti con due prezzi ricorrenti ciascuno (i quattro prezzi della proposta):
   - "Radar Aste Base": 9 € al mese e 90 € all'anno;
   - "Radar Aste Pro": 24 € al mese e 240 € all'anno.
   Valuta EUR. Se Stripe chiede se il prezzo include le tasse, scegli "sì" (i prezzi proposti sono IVA inclusa). La prova di 14 giorni **non** va impostata sul prezzo: la aggiunge il sito.
3. Copia i quattro **ID dei prezzi** (iniziano con `price_`).
4. **Impostazioni → Fatturazione → Portale clienti**: attiva aggiornamento del metodo di pagamento, fatture, disdetta (alla fine del periodo) e, se vuoi, il cambio tra Base e Pro con i quattro prezzi. Salva.
5. **Sviluppatori → Chiavi API**: copia la **chiave segreta di test** (`sk_test_...`) e la **chiave pubblicabile di test** (`pk_test_...`).
6. **Sviluppatori → Webhook → Aggiungi destinazione/endpoint**:
   - indirizzo: `https://radaraste.pages.dev/api/stripe/webhook` (con il tuo indirizzo);
   - eventi: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.trial_will_end`, `invoice.payment_failed`;
   - copia il **segreto di firma** (`whsec_...`).

### Passo 4 – Resend (email)

1. Crea un account su resend.com e una **chiave API** (`re_...`) con permesso di solo invio.
2. Per scrivere agli utenti serve un **dominio tuo verificato** (si aggiungono alcuni record DNS presso chi ti ha venduto il dominio). Secondo le regole attuali di Resend (da verificare), senza dominio si possono fare solo invii di prova al tuo indirizzo.
3. Scegli il mittente, per esempio `Radar Aste Italia <avvisi@tuodominio.it>`.

Puoi saltare questo passo all'inizio: senza Resend tutto funziona, solo le email non partono.

### Passo 5 – Variabili d'ambiente su Cloudflare

Su Cloudflare: **Workers e Pages → radaraste → Impostazioni → Variabili e segreti**, ambiente **Produzione**. Aggiungile **tutte di tipo "Segreto"**, anche quelle non segrete: con `wrangler.toml` nel repository le variabili in chiaro del pannello non sono modificabili, i segreti sì. In alternativa, dal tuo computer: `npx wrangler@4.151.2 pages secret put NOME --project-name radaraste`.

| Variabile | Valore | A cosa serve | Segreta? |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_...` | Le funzioni parlano con Stripe. | **Sì** |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Controlla che le notifiche vengano davvero da Stripe. | **Sì** |
| `STRIPE_PREZZO_BASE_MENSILE` | `price_...` | Prezzo Base al mese. | No |
| `STRIPE_PREZZO_BASE_ANNUALE` | `price_...` | Prezzo Base all'anno. | No |
| `STRIPE_PREZZO_PRO_MENSILE` | `price_...` | Prezzo Pro al mese. | No |
| `STRIPE_PREZZO_PRO_ANNUALE` | `price_...` | Prezzo Pro all'anno. | No |
| `SUPABASE_URL` | `https://<id>.supabase.co` | Indirizzo del progetto Supabase. | No |
| `SUPABASE_ANON_KEY` | chiave anon / publishable | Riconosce l'utente che fa la richiesta. | No (pubblica) |
| `SUPABASE_SERVICE_ROLE_KEY` | chiave service_role / secret | Scrive gli abbonamenti e cancella gli account. | **Sì, la più delicata** |
| `SITO_URL` | `https://radaraste.pages.dev` | Pagine di ritorno da Stripe, link nelle email, controllo dell'origine delle richieste. | No |
| `RESEND_API_KEY` | `re_...` | Invio delle email. | **Sì** |
| `EMAIL_MITTENTE` | `Radar Aste Italia <avvisi@tuodominio.it>` | Mittente delle email. | No |
| `PAGAMENTI_REALI` | **non impostarla** | Solo il valore `si` permette le chiavi reali di Stripe. In modalità test deve mancare. | — |

Facoltative, per il consulente con intelligenza artificiale (vedi `CONSULENTE.md`): `ANTHROPIC_API_KEY` (segreta), `CONSULENTE_MODELLO`, `ORIGINE`, `MAX_TOKEN`.

Le variabili valgono dalla pubblicazione successiva: rilancia il workflow (o aspetta il giro del mattino).

### Passo 6 – Accendere il sito in modalità test

In `config/abbonamenti.js` vanno **solo** le tre informazioni pubbliche e l'interruttore:

```js
supabase: { url: 'https://<id>.supabase.co', chiaveAnonima: '<chiave anon o publishable>' },
stripe: { chiavePubblicabile: 'pk_test_...' },
attivi: true,
```

Mai la chiave service_role / secret di Supabase, mai `sk_...`. Puoi chiedere alla squadra di Claude di fare la modifica: la propone nella pull request e il sito cambia solo quando premi **Merge**.

Da quel momento gli abbonamenti si vedono a tutti sull'indirizzo di Cloudflare, sempre in modalità test (nessun pagamento reale è possibile con le chiavi di test). Su GitHub Pages compaiono anch'essi, ma i pulsanti di pagamento danno errore perché lì le funzioni non esistono: vedi "Cosa resta da decidere". Per tornare indietro basta rimettere `attivi: false`.

### Passo 7 – Provare tutto con le carte di test

Con le chiavi di test Stripe non addebita nulla. Carte di prova (qualunque data di scadenza futura, qualunque CVC, qualunque CAP):

| Carta | Risultato |
|---|---|
| `4242 4242 4242 4242` | Pagamento riuscito. |
| `4000 0000 0000 0341` | La carta si salva, ma l'addebito viene rifiutato: serve a provare il pagamento non riuscito. |

Percorso da provare:

1. Crea un account da `accedi.html` con una tua email e confermala aprendo il link **nello stesso browser** in cui hai creato l'account (vedi "Link via email" al passo 2).
2. Da `prezzi.html` scegli **Pro**: si apre la pagina di Stripe, paghi con 4242..., torni su `account.html?pagamento=ok` e vedi il piano Pro in prova. Su Stripe, in **Webhook**, le notifiche devono risultare consegnate (stato 200); su Supabase, nella tabella `abbonamenti`, compare la tua riga.
3. Con un secondo account prova il piano Base con la carta 4000 0000 0000 0341: il pagamento viene rifiutato e l'abbonamento non parte.
4. Da `account.html` apri **Gestisci pagamenti e fatture** (portale clienti di Stripe) e disdici: l'abbonamento resta fino alla fine del periodo già pagato.
5. **Scarica i miei dati** e poi **Cancella il mio account**: l'abbonamento viene annullato, i dati spariscono da Supabase, Stripe conserva solo le fatture.

Con lo strumento a riga di comando di Stripe (`stripe login`, poi per esempio `stripe trigger invoice.payment_failed` o `stripe trigger customer.subscription.trial_will_end`) puoi mandare al sito notifiche di prova senza aspettare. Queste notifiche riguardano clienti finti, non collegati a un utente del sito: nel registro della funzione risultano "ignorate", ed è giusto così. Servono a controllare che firma e consegna funzionino.

---

## 5. Un giorno, i pagamenti reali: lista di controllo

**La decisione è solo tua.** La squadra di Claude non attiva mai i pagamenti reali (regola 3 di `SQUADRA.md`). Prima di farlo:

- [ ] tutte le prove del passo 7 riuscite in modalità test;
- [ ] bozze legali (`termini.html`, `privacy.html`, `cookie.html`, `recesso.html`, `avvertenze.html`) **verificate e completate da un professionista**, nessun `[DA COMPLETARE]` rimasto;
- [ ] i tuoi dati di titolare nelle pagine legali e su Stripe (nome o ragione sociale, indirizzo, email o PEC);
- [ ] **partita IVA**, regime fiscale, fatture o corrispettivi e IVA per i clienti degli altri Paesi UE decisi con il commercialista;
- [ ] prezzi approvati; funzioni "(in arrivo)" realizzate oppure tolte dai piani in vendita;
- [ ] account Stripe attivato per i pagamenti reali (identità, conto per gli accrediti, descrizione sull'estratto conto);
- [ ] in modalità reale: prodotti e quattro prezzi ricreati (gli ID cambiano: aggiorna le quattro `STRIPE_PREZZO_...`), portale clienti configurato, nuovo webhook con il suo nuovo `STRIPE_WEBHOOK_SECRET`;
- [ ] su Cloudflare `STRIPE_SECRET_KEY` reale (`sk_live_...` o una chiave limitata `rk_live_...`) e in `config/abbonamenti.js` la chiave pubblicabile reale (`pk_live_...`);
- [ ] **`PAGAMENTI_REALI=si`** su Cloudflare, solo in Produzione: è l'interruttore finale, senza il quale le funzioni rifiutano le chiavi reali;
- [ ] email di Supabase e di Resend dal tuo dominio, con testi in italiano;
- [ ] un primo pagamento vero con la tua carta, poi rimborsato dal pannello di Stripe.

Per tornare subito alla modalità test: togli `PAGAMENTI_REALI` (o rimetti le chiavi di test) e rilancia il workflow; per spegnere tutto, `attivi: false`.

---

## 6. Dati personali e sicurezza, in breve

- **Dati trattati:** email e password (gestite da Supabase, la password non è mai leggibile), piano e stato dell'abbonamento con l'identificativo cliente di Stripe, i dati che l'utente sincronizza (aste seguite, note, preferenze, ricerche, profilo dello Stratega). I dati della carta li vede solo Stripe.
- **Dove:** Supabase nell'Unione Europea. Stripe, Cloudflare e Resend sono fornitori che trattano dati per tuo conto: accetta i loro accordi per il trattamento dei dati (DPA) e fai verificare i trasferimenti fuori dall'UE nell'informativa.
- **Diritti degli utenti:** "Scarica i miei dati" (copia completa in un file) e "Cancella l'account" (annulla l'abbonamento, cancella dati e utente; restano presso Stripe solo fatture e pagamenti, per gli obblighi fiscali).
- **Regole del database:** ognuno vede solo i propri dati; l'abbonamento si scrive solo dalle funzioni del sito, dopo una notifica firmata di Stripe.
- **Chiavi:** segrete solo su Cloudflare, mai nel codice; i test controllano che nel repository non ci siano chiavi.
- **Intestazioni di sicurezza** (`_headers`): il browser carica script solo dal sito, immagini solo dal sito, dalle tile di OpenStreetMap e dal Portale Vendite Pubbliche, e si collega solo al sito, alla ricerca dei luoghi di OpenStreetMap e a Supabase. Il sito non può essere mostrato dentro altri siti.
- **Cookie:** il sito non usa cookie di profilazione; la sessione dell'account resta nella memoria del browser (strumento tecnico). Dettagli nella bozza `cookie.html`.
- Se usi Cloudflare Web Analytics o un dominio Supabase personalizzato, vanno aggiunti alla `Content-Security-Policy` in `_headers` (il test `tests/cloudflare.test.mjs` aiuta a non dimenticarlo).

---

## 7. Cosa resta da decidere

1. **Prezzi e prova:** approvare o cambiare 9 € / 24 € al mese, 90 € / 240 € all'anno, 14 giorni di prova Pro, i limiti del piano Gratis.
2. **Consulente con intelligenza artificiale nel Pro:** se attivarlo, con quale tetto per utente e quale tetto di spesa mensile (`CONSULENTE.md`).
3. **Indirizzo del sito:** dominio tuo (serve anche per le email) e cosa fare di GitHub Pages quando gli abbonamenti saranno accesi (tenerlo come copia senza abbonamenti, rimandare a Cloudflare o spegnerlo).
4. **Accesso con Google:** sì o no.
5. **Aspetti legali e fiscali:** titolare, partita IVA, fatturazione, IVA per l'estero, verifica delle bozze legali da parte di un professionista.
6. **Quando passare ai pagamenti reali:** solo tu, dopo la lista del punto 5.
