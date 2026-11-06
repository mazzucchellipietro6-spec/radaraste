# WHITE CARRARA — azienda AI

Sistema operativo dell'azienda: 25 agenti AI specializzati, coordinati da un AI CEO, che lavorano sui
dati reali del gestionale e riferiscono al fondatore. Questo documento descrive la mappa delle
funzionalità, l'architettura, le regole e l'avvio.

## 1. Mappa delle funzionalità

Legenda: **esisteva** (già nel gestionale, riusato), **nuovo** (costruito per l'azienda AI),
**esteso** (esisteva, ampliato).

| Area | Stato | Dove |
|---|---|---|
| Accesso, ruoli, MFA, permessi, registro modifiche | esisteva | Supabase Auth, `src/middleware.ts`, RLS |
| Fornitori | esteso: stato di verifica, certificazioni, storico acquisti | `suppliers`, `supplier_certifications`, `purchase_orders` |
| Catalogo e materiali | esteso: prova della disponibilità (fonte, data, scadenza), qualità del dato | `materials`, Keystatic |
| Trading (RESALE) e brokerage | esteso: modo di evasione (stock proprio, showroom, fornitore diretto) | `deals`, `commissions` |
| Preventivi | esteso: versioni, modo di evasione, approvazione prima dell'invio | `quotes`, `quote_versions`, `approvals` |
| Ordini, acconti, pagamenti, spedizioni | esteso: conferma fornitore, modo di evasione | `orders`, `payments`, `shipments` |
| Lead generation e CRM | nuovo | `leads`, `crm_activities`, `opportunities`, `suppression_list` |
| Pricing RESALE / BROKERAGE | nuovo | `pricing_simulations`, `agents/wc_agents/pricing.py`, `src/lib/pricing.ts` |
| Export e mercati | nuovo | `market_analyses` |
| Marketing | nuovo | `marketing_assets` |
| Finanza | nuovo (sui dati esistenti) | report da ordini, pagamenti, commissioni, trattative |
| Approvazioni del fondatore | nuovo | `approvals`, pannello `/admin/approvals/` |
| Agenti, incarichi, eventi, memoria, costi | nuovo | `ai_*`, servizio `agents/` |
| Sede virtuale 3D e control room | nuovo | `/admin/ai/` |

## 2. Architettura

```
  Fondatore ──► Pannello /admin (Astro, MFA)  ──┐
                 sede 3D, control room,          │  scrive incarichi, decide approvazioni
                 approvazioni, CRM               │  (identità dell'utente, RLS)
                                                 ▼
                                   PostgreSQL / Supabase  ◄──── stessi dati del sito
                                   ai_tasks (coda), ai_task_events,
                                   ai_memory, ai_usage, approvals, ...
                                                 ▲
                                                 │ LISTEN/NOTIFY + coda con SKIP LOCKED
  Servizio agenti (FastAPI, Python) ─────────────┘
   orchestratore ─ runtime agenti ─ strumenti autorizzati ─ API Claude (+ ricerca web)
   esecutore approvazioni ─ pianificazioni ─ WebSocket eventi
```

- **Coda nel database**: ogni incarico è una riga di `ai_tasks`. Il servizio agenti la prende con
  `FOR UPDATE SKIP LOCKED` (più servizi possono lavorare in parallelo senza prendere lo stesso incarico),
  la esegue, registra eventi, costi e risultato. Un incarico è "completato" solo quando l'agente ha
  consegnato il risultato strutturato.
- **Collaborazione**: un agente delega con `delegate_task` (crea incarichi figli, con dipendenze); il
  genitore resta in attesa e riparte da solo, con i risultati dei figli, quando tutti sono conclusi.
  Gli agenti si lasciano anche note (`ai_messages`) che il destinatario legge al prossimo incarico.
- **Memoria**: individuale (`ai_memory` con `agent_id`) e condivisa (aziendale, `agent_id` nullo).
- **Costi**: ogni chiamata a Claude è registrata in `ai_usage` con token e costo; budget mensile per
  agente e tetto giornaliero aziendale; superato il budget l'incarico si ferma con stato "bloccato".
- **Sede 3D**: i personaggi mostrano lo stato reale letto dal database; senza servizio agenti attivo
  tutti risultano "non collegati".

Scelte tecniche:
- la sede 3D e la control room sono nel pannello già esistente (React Three Fiber in Astro) invece che
  in una nuova applicazione Next.js: riusano accesso, verifica in due passaggi e permessi senza un
  secondo sistema di login;
- il servizio agenti è in Python con FastAPI, separato dal sito perché gli incarichi durano minuti e
  le funzioni serverless del sito hanno tempi limitati;
- runtime sull'API Claude con strumenti definiti da noi (non Claude Agent SDK, che è pensato per
  agenti di programmazione con accesso a file e terminale): ogni strumento è una funzione controllata
  sul database, con permessi per agente;
- n8n non è usato: le pianificazioni (report periodici, follow-up) sono nel servizio agenti.

## 3. Regole commerciali applicate dal sistema

- **RESALE** (acquisto e rivendita) e **BROKERAGE** (commissione) sono sempre separati: ricavi di
  rivendita, commissioni, valore della merce intermediata, margine e incassi sono voci distinte.
- **Evasione**: `own_stock`, `showroom_stock` (campionario, non automaticamente vendibile),
  `supplier_direct`.
- **Qualità del dato**: ogni informazione commerciale è `verified`, `estimated`, `assumed` o `unknown`.
  Gli agenti non possono segnare come verificato un dato senza fonte.
- **Disponibilità**: fonte, data del controllo, quantità, unità, lotto e data di ricontrollo.
- **Approvazione del fondatore obbligatoria** per: acquisti dai fornitori, pagamenti, contratti,
  impegni finanziari, preventivi vincolanti, sconti eccezionali, prenotazioni di stock, operazioni
  legali, invio di comunicazioni commerciali. Gli agenti preparano la richiesta; solo un amministratore
  la approva o la rifiuta; ogni decisione è registrata.
- **Comunicazioni**: nessun invio a contatti senza consenso o base giuridica registrata, mai a
  indirizzi nella lista di esclusione.

Il resto del documento (agenti, strumenti, avvio, costi, sicurezza) è nelle sezioni seguenti.
