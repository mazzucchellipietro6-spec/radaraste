# Database

Il database è PostgreSQL su **Supabase**. Lo schema completo è in
`supabase/migrations/20261101000000_init.sql` (rieseguibile); i test dei permessi in
`supabase/tests/rls.test.sql` (`npm run test:db` su un Postgres di prova).

I **contenuti editoriali** (marmi, esperienze, destinazioni, glossario, pagine legali) non sono nel
database: sono file in `src/content/` modificati da Keystatic e pubblicati con il sito. Nel database ci
sono solo i dati **commerciali e personali**.

## Ruoli

| Ruolo | Chi è | Che cosa vede |
|---|---|---|
| `customer` | cliente registrato | solo i propri dati: profilo, preferiti, raccolte, progetti, richieste, preventivi, prenotazioni, documenti, messaggi |
| `professional` | cliente B2B approvato | come il cliente, più i prezzi riservati B2B |
| `staff` | collaboratore | solo le sezioni dei permessi assegnati (vedi sotto) |
| `admin` | amministratore | tutto |

Permessi dello staff: `customers` (clienti, richieste, preventivi, messaggi, documenti), `trade`
(fornitori, materiali, costi, trading e brokerage, commissioni, ordini, spedizioni), `tours`
(prenotazioni, partner turistici, note interne), `content` (traduzioni, pubblicazione), `ai` (sede degli
agenti, incarichi, approvazioni in lettura), `advisory` (documenti legali e fiscali del reparto advisory, per
chi li rivede). Le tabelle dell'azienda AI (`ai_*`, `approvals`, `leads`, `opportunities`, `crm_activities`,
`market_analyses`, `marketing_assets`, `pricing_simulations`, `supplier_certifications`, `purchase_orders`,
`quote_versions`, `advisory_documents`) sono descritte in [docs/AI-COMPANY.md](docs/AI-COMPANY.md).

**Staff e amministratori valgono solo dopo la verifica in due passaggi** (livello `aal2` di Supabase):
anche con la password giusta, senza codice dell'app di autenticazione il database non mostra nulla.

## Riservatezza dei fornitori

WHITE CARRARA non possiede necessariamente i materiali: li reperisce da fornitori e partner. Per
questo i dati sui fornitori sono separati in tabelle che **solo chi ha il permesso `trade`** può leggere:

- `suppliers` — fornitori;
- `quote_item_costs` — costi d'acquisto e margini delle righe di preventivo;
- `deals`, `deal_events`, `commissions` — trattative di trading e brokerage, margini e commissioni.

Allo stesso modo `booking_internal` (note interne e costi dei partner turistici) è visibile solo con il
permesso `tours`. Il cliente vede il preventivo e la prenotazione, mai queste tabelle.

## Tabelle

| Tabella | Contenuto |
|---|---|
| `profiles` | dati dell'utente, ruolo, permessi, stato B2B (si crea da sola alla registrazione) |
| `favorites`, `collections` | marmi preferiti e raccolte personali |
| `projects` | progetti del cliente |
| `requests` | richieste dai moduli (preventivo, concierge, viaggio su misura); riferimento `WC-R-2026-00001` |
| `quotes`, `quote_items` | preventivi e righe (totale calcolato dal database); riferimento `WC-Q-...` |
| `quote_item_costs` | costi e margini, riservati |
| `messages`, `documents` | messaggi cliente-staff e documenti (file nello spazio `documents`) |
| `b2b_prices` | prezzi riservati ai professionisti approvati |
| `suppliers`, `materials` | fornitori e materiali disponibili presso di loro, riservati |
| `deals`, `deal_events`, `commissions` | trading e brokerage; riferimento `WC-D-...` |
| `orders`, `shipments` | ordini e spedizioni; riferimento `WC-O-...` |
| `tour_partners` | operatori turistici autorizzati |
| `bookings`, `booking_internal` | prenotazioni (riferimento `WC-B-...`) e note interne |
| `payments` | pagamenti Stripe (aggiornati dal webhook firmato) |
| `internal_notes` | note interne su qualsiasi elemento |
| `translation_overrides` | correzioni delle traduzioni fatte dal pannello |
| `email_log` | registro delle email inviate (o non inviate, con il motivo) |
| `audit_log` | registro di ogni inserimento, modifica ed eliminazione: chi, cosa, quando |
| `rate_limits` | contatori per limitare gli invii ripetuti dei moduli |
| `counters` | numerazione progressiva dei riferimenti per anno |

## Registro delle modifiche (audit)

Le tabelle commerciali hanno un trigger che scrive in `audit_log` ogni modifica con l'autore (email
dell'utente collegato), la tabella, l'operazione e i valori. Il registro si consulta dal pannello
(sezione Registro) ed è in sola lettura.

## Copie di sicurezza

1. **Supabase**: sui piani a pagamento fa copie giornaliere automatiche (Project Settings → Database →
   Backups), con ripristino a un punto nel tempo sul piano Pro e superiori.
2. **Copia vostra**: `npm run backup` crea `backups/white-carrara-AAAAMMGG-HHMM.sql.gz` con `pg_dump`
   (servono `DATABASE_URL` e i client PostgreSQL installati). Tiene le ultime 30 copie (`BACKUP_KEEP`),
   cartella cambiabile con `BACKUP_DIR`. Conservate le copie fuori dal computer (disco esterno o cloud).
3. **File caricati** (documenti dei clienti): Supabase → Storage → `documents`, scaricabili dal pannello
   di Supabase.

Ripristino di una copia su un database vuoto:
```bash
gunzip -c backups/white-carrara-AAAAMMGG-HHMM.sql.gz | psql "$DATABASE_URL"
```
Provate il ripristino almeno una volta su un progetto Supabase di prova.

## Dati personali (GDPR)

- Il cliente può scaricare i propri dati e cancellare l'account dalla pagina Profilo dell'area clienti.
- I moduli salvano solo i dati necessari alla richiesta, con il consenso alla privacy registrato.
- Il progetto Supabase va creato in una regione europea.
- Il registro delle email conserva destinatario, oggetto e stato dell'invio, non il testo dei messaggi.
