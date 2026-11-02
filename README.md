# WHITE CARRARA — sito web

**From Carrara to the World.** Marmo italiano di pregio, commercio internazionale ed esperienze di viaggio.

Questo repository contiene il sito completo: pagine pubbliche in 16 lingue (più quelle automatiche),
catalogo dei marmi, Digital Showroom, Marble Matching AI, Marble Concierge, Experience Carrara,
Italian Tours, prenotazioni, area clienti, area B2B e pannello di amministrazione con trading,
brokerage, ordini, spedizioni e pagamenti.

## Documenti

| Documento | Che cosa contiene |
|---|---|
| [README.md](README.md) | Questa guida: avvio, struttura, comandi, test |
| [.env.example](.env.example) | Tutte le impostazioni, spiegate una per una |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Come mettere il sito online, passo per passo |
| [DATABASE.md](DATABASE.md) | Tabelle, ruoli e permessi, copie di sicurezza |
| [SECURITY.md](SECURITY.md) | Protezioni attive e controlli da fare |
| [TRANSLATIONS.md](TRANSLATIONS.md) | Come funzionano e come si correggono le traduzioni |
| [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) | Cosa è stato fatto, cosa resta, cosa serve dal committente |
| [IMMAGINI.md](IMMAGINI.md) | Elenco delle foto da scattare, con nomi e dimensioni |

## Tecnologie

- **Astro 7** (pagine statiche veloci + pagine dinamiche dove servono), **TypeScript**, **Tailwind CSS 4**
- **Preact** per le parti interattive (showroom, matching, concierge, selezione)
- **Supabase** (PostgreSQL con Row Level Security, accesso con email, verifica in due passaggi)
- **Keystatic** per i testi di marmi, esperienze, destinazioni e pagine legali
- **Resend** (email), **Stripe** (pagamenti facoltativi), **Cloudflare Turnstile** (anti-bot)
- **Anthropic Claude** per Marble Matching AI e Concierge (facoltativo, con alternativa locale)
- **Google Cloud Translation** per le lingue automatiche (facoltativo)
- **Playwright** per i test

## Avvio sul proprio computer

Serve **Node.js 22.23.4 o più recente** (consigliato Node 24).

```bash
npm install
cp .env.example .env      # poi compilate le voci che vi servono
npm run dev               # http://localhost:4321
```

Senza nessuna chiave il sito funziona già: pagine, showroom, Marble Matching con analisi locale,
selezione e confronto. I moduli rispondono che il servizio non è ancora configurato, senza perdere dati.

## Modificare i contenuti

- **Marmi, esperienze, destinazioni, glossario, pagine legali, dati aziendali**: pannello
  `/keystatic` (in sviluppo è sempre attivo; online va collegato a GitHub, vedi DEPLOYMENT.md).
- **Clienti, richieste, preventivi, prenotazioni, fornitori, trading, ordini, traduzioni**:
  pannello `/admin` (solo staff e amministratori, con verifica in due passaggi).
- **Foto**: sostituite i file in `src/assets/images/` con lo stesso nome. L'elenco completo è in
  [IMMAGINI.md](IMMAGINI.md). Oggi sono segnaposto illustrati con la scritta "SEGNAPOSTO".

Il sito non mostra mai prezzi, disponibilità, durate o dati legali inventati: dove mancano compare un
segnaposto visibile (per esempio `[DA INSERIRE]`) finché non li inserite.

## Comandi

| Comando | A cosa serve |
|---|---|
| `npm run dev` | Sito in sviluppo con aggiornamento automatico |
| `npm run build` | Traduzioni automatiche (se c'è la chiave) + sito pronto per la pubblicazione |
| `npm run build:only` | Solo la build, senza traduzioni |
| `npm run preview` | Prova locale della build |
| `npm run translate` | Traduzioni automatiche con Google (vedi TRANSLATIONS.md) |
| `node scripts/i18n-status.mjs` | Stato delle traduzioni a mano per lingua |
| `npm run placeholders` | Ricrea le immagini segnaposto mancanti e aggiorna IMMAGINI.md |
| `npm run headers` | Aggiorna `vercel.json` e `netlify.toml` dalle intestazioni di sicurezza |
| `npm run backup` | Copia di sicurezza del database (vedi DATABASE.md) |
| `npm run check` | Controllo dei tipi TypeScript |
| `npm test` | Test end-to-end nel browser |
| `npm run test:unit` | Test veloci senza browser |
| `npm run test:db` | Test dei permessi del database su un Postgres di prova |

## Struttura

```
src/
  pages/            indirizzi del sito: [lang]/[...path] (pagine pubbliche), account, admin, api
  views/            una vista per ogni pagina pubblica (Home, Marbles, Showroom, ...)
  components/       intestazione, piè di pagina, moduli, selettore lingua, banner cookie, ...
  islands/          parti interattive in Preact (Showroom, Matching, Concierge, Selection)
  scripts/          codice del browser (statue 3D, moduli, selezione, schede inclinabili)
  lib/server/       codice solo server: database, accesso, email, AI, Stripe, pannello
  i18n/             lingue, indirizzi tradotti, traduzioni (locales = a mano, auto = Google)
  content/          contenuti modificabili da Keystatic (JSON)
  assets/images/    fotografie (oggi segnaposto)
supabase/           schema del database e test dei permessi
scripts/            traduzioni, segnaposto, intestazioni, backup
tests/              test end-to-end (e2e), veloci (unit), strumenti di prova (support)
```

## Test

```bash
npm run test:unit                       # pochi secondi
npm test                                # pagine pubbliche, desktop e telefono
```

I test completi (prenotazione, registrazione con email, area clienti, pannello con verifica in due
passaggi) usano un ambiente di prova locale, **mai il database vero**:

1. un PostgreSQL locale con lo schema: `psql "$DATABASE_URL" -f supabase/tests/local-auth-stub.sql -f supabase/migrations/20261101000000_init.sql`
2. nel `.env`: `DATABASE_URL` del Postgres locale, `PUBLIC_SUPABASE_URL=http://localhost:54330`,
   chiavi Supabase di prova qualsiasi, `EMAIL_OUTBOX_DIR=./outbox`
3. `E2E_DB=1 npm test` (Playwright avvia da solo il finto servizio di accesso `tests/support/mock-gotrue.mjs`)

Il test di Stripe parte solo con una chiave di test (`sk_test_...`).

## Prima della pubblicazione

La lista completa è in [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md). In breve servono: account
Supabase, Vercel o Netlify, Resend e (se volete) Stripe, Google Cloud e Anthropic; il dominio; ragione
sociale e partita IVA; le foto vere; prezzi e durate verificati delle esperienze.
