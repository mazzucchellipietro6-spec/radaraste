# Piano dei lavori

Stato del progetto rispetto alle fasi richieste nel brief "WHITE CARRARA – Complete Website Development".

## Fatto

| # | Fase | Stato |
|---|---|---|
| 1–3 | Architettura, design system, homepage | ✅ Astro 7, Tailwind, tipografia Bodoni/Jost, apertura con statua in marmo 3D scolpita in tempo reale, seconda statua scolpita durante lo scorrimento |
| 4 | Catalogo marmi | ✅ Bianco Carrara, Statuario, Calacatta, Arabescato, Bardiglio; schede, zoom, schede tecniche solo se verificate |
| 5 | Digital Showroom | ✅ galleria, zoom, filtri per colore/tipo/finitura, confronto fino a 3, preferiti, raccolte, richiesta preventivo |
| 6 | Marble Matching AI | ✅ foto → analisi colori e venature → 3 proposte con spiegazione; AI facoltativa con alternativa locale; nessuna identificazione "certa" |
| 7 | Marble Concierge | ✅ tipo di progetto, colore, venature, materiale, quantità, finitura, destinazione, budget → proposte + richiesta |
| 8 | Experience Carrara | ✅ 9 esperienze, solo su richiesta, durata e prezzo solo se inseriti, conferma dopo verifica con operatori autorizzati |
| 9 | Italian Tours | ✅ 25 destinazioni per regione, viaggio su misura in più città |
| 10 | Prenotazioni | ✅ tutti i campi richiesti, email, stato, conferma dallo staff, partner, pagamento Stripe facoltativo |
| 11 | Database | ✅ Supabase con Row Level Security, registro modifiche, riferimenti progressivi |
| 12 | Area clienti | ✅ profilo, preferiti, raccolte, progetti, preventivi, richieste, prenotazioni, documenti, messaggi |
| 13 | Area B2B | ✅ registrazione, approvazione, prezzi riservati, documentazione tecnica, storico preventivi |
| 14 | Pannello | ✅ tutte le sezioni richieste, con aggiunta/modifica/disattivazione ed esportazione CSV |
| 15 | Trading e brokerage | ✅ trattative, margini, commissioni, ordini, spedizioni; fornitori visibili solo agli autorizzati |
| 16 | Pagamenti | ✅ Stripe Checkout solo per servizi confermati, webhook firmato |
| 17 | Multilingua | ✅ 16 lingue con indirizzi tradotti, RTL, selettore con ricerca, inglese completo a mano, traduzione automatica pronta, correzioni dal pannello |
| 18 | SEO | ✅ titoli e descrizioni per pagina, canonical, hreflang, mappe del sito per lingua, robots.txt, dati strutturati (Organization, Breadcrumb) |
| 19 | Sicurezza | ✅ vedi SECURITY.md: permessi, MFA, limiti, CSP, intestazioni, copie di sicurezza |
| 20 | Test | ✅ test end-to-end (desktop e telefono, it/en/ar/ja), percorsi completi con database, test dei permessi, test veloci |
| 21 | Documentazione | ✅ questi documenti |

## Serve dal committente

Il sito non inventa dati: finché mancano, compaiono segnaposto visibili.

**Dati aziendali**
- [ ] Ragione sociale, partita IVA, eventuale REA e PEC (in Keystatic → "Dati aziendali e contatti")
- [ ] Testi legali definitivi (privacy, cookie, termini, note legali) rivisti da un consulente
- [ ] Foro competente nei termini e condizioni

**Contenuti**
- [ ] Foto vere: elenco completo con nomi e dimensioni in IMMAGINI.md
- [ ] Per ogni esperienza: durata verificata, lingue, partecipanti, prezzo (se si vuole mostrarlo), punto d'incontro
- [ ] Schede tecniche dei marmi (solo da laboratorio, con data e fonte)
- [ ] Progetti realizzati, solo con il permesso del cliente
- [ ] Destinazioni reali delle spedizioni, se si vuole la mappa 3D delle rotte nella sezione export

**Account e chiavi** (procedura in DEPLOYMENT.md)
- [ ] Supabase, Vercel o Netlify, Resend con il dominio verificato, Cloudflare Turnstile
- [ ] Facoltativi: Stripe, Anthropic (AI), Google Cloud (traduzioni), Plausible o Google Analytics
- [ ] Dominio

## Dopo la pubblicazione (consigliato)

- Revisione delle traduzioni automatiche delle lingue più importanti per il mercato da parte di
  madrelingua, dal pannello Traduzioni.
- Registrazione su Google Search Console e invio della mappa del sito.
- Controllo delle prestazioni con PageSpeed Insights sulle pagine principali con le foto vere.
- Prima copia di sicurezza manuale (`npm run backup`) e prova di ripristino.
