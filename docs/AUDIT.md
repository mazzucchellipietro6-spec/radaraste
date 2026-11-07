# WHITE CARRARA — audit tecnico e di sicurezza (Fase A)

Data: 7 novembre 2026. Ambito: tutto il repository (sito Astro, pannello, database Supabase/PostgreSQL,
servizio agenti Python). Metodo: lettura del codice, test esistenti eseguiti prima di ogni modifica,
`npm audit`, `pip-audit`, ricerca di segreti, controllo di RLS, funzioni e permessi sul database di prova,
ricerca dei punti in cui contenuti diventano HTML o SQL.

## 1. Situazione di partenza (verificata)

Test eseguiti prima delle modifiche, tutti superati:

| Suite | Esito |
|---|---|
| `npm run test:unit` | 13/13 |
| `npm run test:db` (permessi del database) | tutti i controlli superati |
| `agents`: `python -m pytest` | 45/45 |
| `astro check` | 0 errori |
| e2e pubbliche e del pannello (ultima esecuzione) | 27 superate, 1 saltata; pannello AI superato |

Cosa funziona già: sito pubblico in 16 lingue; area clienti e B2B; pannello con verifica in due passaggi
e permessi per sezione; RLS attivo su tutte le tabelle `public` (verificato: nessuna tabella senza RLS);
funzioni `SECURITY DEFINER` tutte con `search_path` fisso; intestazioni di sicurezza (CSP, HSTS,
X-Frame-Options, ecc.); limiti di frequenza su accesso, registrazione, moduli, AI pubblica e MFA;
webhook Stripe con firma; servizio agenti con coda, deleghe, budget, approvazioni, registri; 25 agenti
con prompt e strumenti; sede 3D e control room.

## 2. Problemi di sicurezza trovati

| N. | Gravità | Problema | Dove | Correzione (Fase B) |
|---|---|---|---|---|
| S1 | **Alta** | XSS memorizzato: i testi in Markdown del catalogo e le correzioni delle traduzioni (modificabili dallo staff con permesso `content` dal pannello) diventano HTML senza filtro (`marked` e blocchi HTML grezzi accettati). Uno staff può inserire script che girano nel browser di un amministratore e usano la sua sessione (escalation di privilegi). | `src/i18n/index.ts` `renderMd`, `set:html` nelle viste | Filtro HTML con elenco di tag e attributi ammessi |
| S2 | Media | I dati strutturati JSON-LD sono scritti in `<script>` senza neutralizzare `</script>`: un testo con quella sequenza chiude lo script. | `src/layouts/Base.astro` | Escape di `<`, `>`, `&` nel JSON |
| S3 | Alta (dipendenza in esecuzione) | `zod` 4.6.7: esaurimento di memoria con collezioni enormi (usato nella validazione dei moduli). | `npm audit` | Aggiornamento non distruttivo |
| S4 | Media (solo build/pubblicazione) | Vulnerabilità note negli adattatori Vercel e Netlify e nei loro strumenti (`path-to-regexp`, `glob`, `minimatch`, `archiver`, `deepmerge`). Girano durante la build, non nel sito pubblicato. La "correzione" proposta è un declassamento di versione maggiore. | `npm audit` | Tracciate; da riverificare a ogni aggiornamento degli adattatori; controllo automatico in CI |
| S5 | Bassa (solo test) | `pytest` 8.4.2 con vulnerabilità nota. | `pip-audit` | Aggiornamento a 9.0.3 o successivo |
| S6 | Media | Il registro delle modifiche (`audit_log`) è protetto dagli utenti ma chi ha accesso diretto al database può modificarlo senza lasciare traccia. | database | Registro solo in aggiunta e concatenato con hash, funzione di verifica |
| S7 | Media | Il servizio agenti si collega al database come proprietario: i limiti per agente sono solo nel codice degli strumenti; un errore potrebbe toccare profili, pagamenti, prenotazioni. | `agents/` | Ruolo database dedicato con accesso solo alle tabelle necessarie |
| S8 | Media | Nessun registro degli eventi di sicurezza (accessi falliti, MFA fallite, strumenti non autorizzati, sospetti di manipolazione degli agenti) e nessuna vista per il proprietario. | sito, agenti | Tabella `security_events`, scrittura dai punti critici, sezione nella Control Room |
| S9 | Media | Prompt injection: pagine web e documenti allegati possono contenere istruzioni rivolte agli agenti. Gli agenti non hanno strumenti pericolosi e le azioni vincolanti richiedono approvazione, ma non c'è rilevamento né segnalazione. | `agents/` | Controllo dei testi salvati dagli agenti, segnalazione, regole rafforzate nel prompt |
| S10 | Media | Non esiste un arresto immediato dell'intero sistema; la disattivazione di un agente vale solo dall'incarico successivo. | `agents/`, pannello | Sospensione globale e per agente controllata a ogni passo |
| S11 | Bassa | Le API del pannello per incarichi e approvazioni non hanno limite di frequenza (sono già dietro MFA). | `src/pages/api/admin/ai` | Limite di frequenza |
| S12 | Bassa | Il servizio agenti non impone la cifratura TLS verso il database in produzione. | `agents/wc_agents/config.py` | `sslmode=require` obbligatorio fuori dallo sviluppo |
| S13 | Media | Backup: lo script esiste ma la copia non è cifrata e non c'è un test di ripristino automatico. | `scripts/backup.mjs` | Cifratura opzionale, script e flusso di prova di ripristino |
| S14 | Info | Nessuna CI: test, controllo delle dipendenze e dei segreti non girano automaticamente. | repository | Workflow GitHub Actions |
| S15 | Info | Nessun endpoint di salute del sito per il monitoraggio. | sito | `/api/health` |

Nessun segreto trovato nel repository (ricerca di chiavi Anthropic, Stripe, Resend, AWS, GitHub, JWT,
chiavi private e password nelle stringhe di connessione); `.env` è escluso da git.
SQL: tutte le query usano parametri (postgres.js e psycopg); gli unici `unsafe()` usano valori fissi
nel codice. CSRF: `checkOrigin` di Astro attivo per i moduli; le API JSON richiedono la stessa origine
(nessun CORS). SSRF: il server chiama solo indirizzi fissi (Resend, Turnstile, Anthropic, hook di
pubblicazione da variabile d'ambiente); la lettura di pagine web degli agenti avviene sui server di
Anthropic, non dal nostro server.

## 3. Lacune funzionali rispetto alla nuova richiesta

| Area | Stato | Intervento |
|---|---|---|
| Organizzazione in 5 divisioni | 6 reparti | Campo `division` e sede 3D per divisioni |
| Tour, prenotazioni, partner, itinerari | gli agenti non hanno strumenti | Nuovi strumenti e tabelle |
| Ricerca fornitori | gli agenti leggono ma non registrano nuovi fornitori | `supplier_save`, `tour_partner_save` |
| Offerte e catalogo dei servizi | assenti | `supplier_offers`, `service_catalog` |
| Autonomia con soglie | ogni email richiede approvazione | Politica con limiti modificabili |
| Approvazioni | mancano rischio, effetti, motivazione | Nuovi campi e pannello |
| AI CEO: report giornalieri, scadenze, escalation | parziale | Report giornaliero calcolato, strumenti di controllo, escalation |
| Control Room | stato agenti, costi, ricavi | Lead, fornitori, prenotazioni, preventivi, campagne, margini, sicurezza, report, sospensione |
| Infrastruttura | documentata, non automatizzata | CI/CD, ambienti, migrazioni versionate, backup, rollback |
| Test | buoni ma senza ciclo completo, carico, ripristino | Nuovi test |

## 4. Piano con priorità e dipendenze

1. **Fase B** (prima di tutto il resto): S1, S2, S3, S5, S6, S7, S8, S9, S10, S11, S12, S15.
2. **Fase C/D** (dipende da B per il ruolo database e gli eventi): divisioni, strumenti, autonomia, CEO.
3. **Fase E** (dipende da C/D): Control Room e sospensione.
4. **Fase F** (indipendente, dopo B): CI/CD, ambienti, migrazioni, backup cifrati, monitoraggio.
5. **Fase G**: ciclo completo simulato, carico, recupero, ripristino, autorizzazioni.
6. **Fasi H, I, L**: servono account e autorizzazioni del proprietario (vedi `docs/GO-LIVE.md`).
