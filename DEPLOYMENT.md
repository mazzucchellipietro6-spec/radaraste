# Mettere il sito online

Guida passo per passo. Tempo indicativo: mezza giornata, la prima volta.
Il sito funziona sia su **Vercel** sia su **Netlify**: scegliete uno dei due.

## 1. Database e accesso: Supabase

1. Create un progetto su [supabase.com](https://supabase.com), regione **Europa** (per il GDPR).
2. **SQL Editor** → incollate ed eseguite `supabase/migrations/20261101000000_init.sql`.
   Crea tabelle, permessi (Row Level Security), funzioni, registro modifiche e lo spazio file `documents`.
   Lo script si può rieseguire senza danni.
3. **Authentication → URL Configuration**
   - *Site URL*: `https://www.vostrodominio.com`
   - *Redirect URLs*: `https://www.vostrodominio.com/auth/confirm/**`
4. **Authentication → Providers → Email**: attivo, con "Confirm email" attivo.
   Le email di conferma e recupero password le invia il sito (tradotte, dal vostro dominio), non Supabase.
5. **Authentication → Multi-Factor**: lasciate attivo **TOTP** (app di autenticazione). È obbligatorio
   per staff e amministratori.
6. **Project Settings → API**: copiate URL, chiave `anon` e chiave `service_role`.
   **Project Settings → Database → Connection string → Transaction pooler** (porta 6543): è il `DATABASE_URL`.

## 2. Email: Resend

1. Account su [resend.com](https://resend.com) → **Domains** → aggiungete il vostro dominio e inserite
   i record DNS indicati (SPF, DKIM). Attendete la verifica.
2. **API Keys** → create una chiave con permesso di invio → `RESEND_API_KEY`.
3. `EMAIL_FROM` deve usare il dominio verificato, per esempio `WHITE CARRARA <noreply@vostrodominio.com>`.

## 3. Protezione anti-bot: Cloudflare Turnstile

[dash.cloudflare.com](https://dash.cloudflare.com) → **Turnstile** → *Add site* con il vostro dominio,
modalità "Managed". Copiate *Site key* (`PUBLIC_TURNSTILE_SITE_KEY`) e *Secret key* (`TURNSTILE_SECRET_KEY`).

## 4. Hosting

### Vercel
1. [vercel.com](https://vercel.com) → *Add New Project* → importate il repository GitHub.
2. Framework: Astro (rilevato da solo). Build command: `npm run build`. Node.js: 24.
3. **Settings → Environment Variables**: inserite le voci di `.env.example` che usate.
4. *Deploy*. Le intestazioni di sicurezza arrivano da `vercel.json`.

### Netlify
1. [netlify.com](https://netlify.com) → *Add new site* → *Import from Git*.
2. Build command e cartella sono già in `netlify.toml`. Node.js: impostate `NODE_VERSION=24`.
3. **Site configuration → Environment variables**: le voci di `.env.example`.
4. *Deploy*.

Il sito sceglie da solo l'adattatore giusto (Vercel, Netlify o server Node).

## 5. Dominio

Collegate il dominio dal pannello dell'hosting (Domains) e aggiornate `PUBLIC_SITE_URL` con l'indirizzo
definitivo (con `https://`, senza barra finale). Ripubblicate: mappa del sito e link nelle email lo usano.

## 6. Primo amministratore

1. Il vostro indirizzo deve essere in `ADMIN_EMAILS`.
2. Registratevi dal sito (`/it/account/register/`) e confermate l'email.
3. Aprite `/admin/`: il sito chiede di configurare l'app di autenticazione (Google Authenticator,
   Microsoft Authenticator, 1Password...). Da quel momento ogni accesso al pannello chiede il codice.
4. Dal pannello potete dare accesso allo staff con permessi separati (trading, tour, clienti, contenuti).

## 7. Pannello contenuti (Keystatic) online

In sviluppo `/keystatic` salva i file sul computer. Online va collegato a GitHub:
1. impostate `KEYSTATIC_GITHUB_REPO=proprietario/repository` e ripubblicate;
2. aprite `/keystatic` e seguite la procedura che crea la GitHub App;
3. copiate nelle variabili d'ambiente i valori che Keystatic vi mostra (`KEYSTATIC_GITHUB_CLIENT_ID`,
   `KEYSTATIC_GITHUB_CLIENT_SECRET`, `KEYSTATIC_SECRET`, `PUBLIC_KEYSTATIC_GITHUB_APP_SLUG`).

Ogni salvataggio diventa una modifica nel repository e l'hosting ripubblica il sito.
Per il pulsante **Pubblica** del pannello create un *Deploy Hook* (Vercel: Settings → Git → Deploy Hooks;
Netlify: Build & deploy → Build hooks) e mettetelo in `DEPLOY_HOOK_URL`.

## 8. Facoltativi

- **Stripe**: chiave segreta in `STRIPE_SECRET_KEY`; in Stripe → Developers → Webhooks aggiungete
  `https://vostrodominio.com/api/stripe/webhook` con gli eventi `checkout.session.completed`,
  `checkout.session.async_payment_succeeded`, `checkout.session.expired` e copiate il segreto in
  `STRIPE_WEBHOOK_SECRET`. Provate prima con le chiavi di test e la carta `4242 4242 4242 4242`:
  dal pannello aprite una prenotazione confermata, create il link di pagamento, pagate, e verificate
  che lo stato diventi "pagato".
- **AI**: `ANTHROPIC_API_KEY` da [console.anthropic.com](https://console.anthropic.com). I limiti
  `AI_MATCH_PER_HOUR` e `AI_DAILY_LIMIT` contengono i costi.
- **Traduzioni automatiche**: `GOOGLE_TRANSLATE_API_KEY` (vedi TRANSLATIONS.md). La prima traduzione
  completa delle 14 lingue costa pochi euro; le successive solo i testi cambiati.
- **Statistiche**: `PUBLIC_PLAUSIBLE_DOMAIN` e/o `PUBLIC_GA4_ID`. Si attivano solo dopo il consenso.

## 9. Controlli dopo la pubblicazione

- [ ] La home si apre in italiano, inglese, arabo (da destra a sinistra) e giapponese.
- [ ] `https://vostrodominio.com/sitemap.xml` e `/robots.txt` mostrano il vostro dominio.
- [ ] Un preventivo di prova arriva a `ADMIN_NOTIFY_EMAIL` e il cliente riceve la conferma.
- [ ] Una prenotazione di prova compare nel pannello con riferimento `WC-B-...`.
- [ ] Il pannello chiede il codice dell'app di autenticazione.
- [ ] Inviate il sito a Google Search Console con la mappa del sito.
- [ ] [securityheaders.com](https://securityheaders.com) e [PageSpeed Insights](https://pagespeed.web.dev) sul dominio.

## Aggiornamenti

Ogni modifica caricata su GitHub ripubblica il sito da sola. Prima di aggiornare le dipendenze:
`npm run check`, `npm run test:unit`, `npm test`.
