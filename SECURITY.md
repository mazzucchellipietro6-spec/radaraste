# Sicurezza

Che cosa protegge il sito, dove si trova nel codice e che cosa controllare periodicamente.
Per segnalare un problema di sicurezza: mazzucchellipietro6@gmail.com.

## Protezioni attive

### Dati e permessi
- **Row Level Security** su tutte le tabelle (vedi DATABASE.md): ogni lettura e scrittura passa dai
  permessi del database con l'identità di chi è collegato. Anche un errore nel codice del sito non può
  mostrare a un cliente i dati di un altro.
- **Fornitori, costi e margini** in tabelle separate leggibili solo con il permesso `trade`.
- **Ruoli e permessi** per lo staff (clienti, trading, tour, contenuti), assegnati dall'amministratore.
- **Registro delle modifiche** (`audit_log`) con autore, data e valori di ogni operazione.

### Accesso
- Account gestiti da **Supabase Auth**; password mai salvate dal sito.
- Cookie di sessione `httpOnly`, `secure` in produzione, `sameSite=lax`.
- **Verifica in due passaggi obbligatoria** (app di autenticazione, TOTP) per staff e amministratori:
  controllata sia dal sito (`src/middleware.ts`) sia dal database (livello `aal2`).
- Promozione ad amministratore solo per gli indirizzi in `ADMIN_EMAILS`.
- Redirect dopo l'accesso solo verso pagine interne (`safeNext` in `src/lib/server/auth-flow.ts`).
- Risposte identiche per "email esistente" e "email inesistente" nel recupero password.

### Moduli e API
- **Cloudflare Turnstile** sui moduli pubblici (se configurato).
- **Campo trappola** invisibile e **controllo dei tempi** (invii in meno di 2 secondi scartati).
- **Limiti di frequenza** salvati nel database (`rate_limits`): accesso (10 tentativi ogni 15 minuti per
  indirizzo IP, 8 per email), recupero password e link magico (5 ogni 15 minuti), codice MFA (8 ogni
  15 minuti), messaggi (20 l'ora), AI (12 l'ora per IP e 300 al giorno in totale, regolabili).
- **Validazione** di tutti i dati in arrivo sul server, con lunghezze massime e liste di valori ammessi.
- **Controllo dell'origine** delle richieste POST (`security.checkOrigin` in `astro.config.mjs`).
- **Webhook Stripe** accettato solo con firma valida (`STRIPE_WEBHOOK_SECRET`).
- File caricati dai clienti in uno spazio privato, scaricabili solo dal proprietario e dallo staff
  autorizzato.

### Browser
Intestazioni definite una sola volta in `src/lib/security-headers.mjs`, applicate dal middleware alle
pagine dinamiche e da `vercel.json` / `netlify.toml` a quelle statiche (`npm run headers` le rigenera):
- **Content Security Policy**: script solo dal sito e dai servizi usati (Turnstile, Plausible, Google
  Analytics), nessun incorporamento in altri siti (`frame-ancestors 'none'`), nessun plugin, moduli
  inviabili solo al sito e a Stripe Checkout;
- **HSTS** (solo HTTPS, 2 anni), `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`, `Cross-Origin-Opener-Policy`;
- pannello e area clienti con `Cache-Control: no-store` e `noindex`.

Se aggiungete un servizio esterno (per esempio Plausible su un vostro dominio, una mappa, un video)
aggiungetelo in `src/lib/security-headers.mjs` e lanciate `npm run headers`.

### Segreti
- Tutte le chiavi sono variabili d'ambiente (vedi `.env.example`), mai nel codice.
- Solo le voci `PUBLIC_` arrivano al browser: URL e chiave pubblica di Supabase, chiave pubblica di
  Turnstile, identificativi delle statistiche. Le chiavi segrete restano sul server.
- `.env` è escluso da git (`.gitignore`).

### Privacy e cookie
- Banner dei cookie con scelta "Accetta tutti", "Solo necessari" e "Personalizza"; le statistiche si
  caricano **solo dopo il consenso**, che si può cambiare dal piè di pagina.
- Esportazione e cancellazione dei dati dall'area clienti.

### Intelligenza artificiale
- Il Marble Matching non dichiara mai con certezza l'identità geologica di un marmo da una foto:
  mostra somiglianze e invita a verificare su campioni reali.
- Le foto inviate all'AI non vengono salvate dal sito.
- Limiti di frequenza e di spesa giornalieri.

## Copie di sicurezza
Vedi DATABASE.md, sezione "Copie di sicurezza" (`npm run backup` più le copie automatiche di Supabase).

## Controlli periodici

**Ogni mese**
- [ ] `npm audit` e aggiornamento delle dipendenze, poi `npm run check`, `npm run test:unit`, `npm test`.
- [ ] Pannello → Registro: accessi e modifiche insolite.
- [ ] Elenco di staff e amministratori: togliere chi non collabora più.
- [ ] Prova di ripristino di una copia del database su un progetto di prova (almeno ogni tre mesi).

**A ogni modifica importante**
- [ ] `npm run test:db` se cambiano tabelle o permessi.
- [ ] [securityheaders.com](https://securityheaders.com) sul dominio.

**Se una chiave viene esposta per errore**
1. revocatela subito nel servizio (Supabase, Stripe, Resend, Google, Anthropic, Cloudflare);
2. createne una nuova e aggiornate le variabili d'ambiente nell'hosting;
3. ripubblicate il sito e controllate il registro delle modifiche.
