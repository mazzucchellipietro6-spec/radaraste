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
| Team Executive & Professional Advisory (5 agenti) | nuovo | `advisory_documents`, `agents/wc_agents/tools/advisory.py` |
| Simulatore prezzi nel pannello | nuovo | `/admin/ai/pricing/`, stesso motore del servizio |
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

- **Professionisti**: gli agenti legale e fiscale sono assistenti AI, non professionisti abilitati. I loro
  documenti sono bozze con revisione professionale obbligatoria (vincolo anche nel database).

## 4. I 25 agenti

Definizioni in `agents/config/agent-registry.json`, prompt in `agents/config/agents/*.md`, regole comuni in
`agents/wc_agents/prompts.py`. Strumenti comuni a tutti: `submit_result`, `memory_search`, `memory_save`,
`send_note`, `request_approval`; chi può delegare ha anche `delegate_task` e `wait_for_delegates`.

| N. | Agente | Reparto | Ruolo | Strumenti specifici | Delega a | Ragionamento · budget/mese |
|---|---|---|---|---|---|---|
| 01 | **AI CEO** | Direzione | Amministratore delegato AI | `list_agents`, `company_overview`, `finance_summary`, `pipeline_summary`, `approvals_list`, `ai_stats`, `advisory_doc_search`, `process_metrics` | tutti | high · 40 $ |
| 02 | **Chief Sales Officer** | Vendite | Direttore commerciale | `lead_search`, `opportunity_save`, `pipeline_summary`, `crm_add_activity`, `quote_draft`, `material_search`, `catalog_search` | 03, 04, 05, 13, 16, 17, 18 | medium · 25 $ |
| 03 | **Lead Generation Agent** | Vendite | Ricerca nuovi clienti | `web_search`, `web_fetch`, `lead_search`, `lead_save`, `lead_update`, `suppression_check` | — | medium · 25 $ |
| 04 | **Export Manager** | Vendite | Responsabile export | `web_search`, `web_fetch`, `market_analysis_save`, `market_analysis_search`, `shipment_search`, `lead_search` | 14, 24, 25 | medium · 20 $ |
| 05 | **CRM & Follow-up Agent** | Vendite | Gestione CRM e follow-up | `lead_search`, `lead_update`, `crm_add_activity`, `opportunity_save`, `pipeline_summary`, `email_draft`, `suppression_check` | — | low · 15 $ |
| 06 | **Marketing Director** | Marketing | Direttore marketing | `marketing_asset_save`, `marketing_search`, `web_search`, `catalog_search`, `market_analysis_search` | 07, 08, 09 | medium · 20 $ |
| 07 | **Content Creator** | Marketing | Contenuti | `marketing_asset_save`, `marketing_search`, `catalog_search` | — | low · 15 $ |
| 08 | **SEO & Website Manager** | Marketing | SEO e sito | `web_search`, `web_fetch`, `marketing_asset_save`, `marketing_search`, `catalog_search` | — | low · 15 $ |
| 09 | **Advertising Agent** | Marketing | Pubblicità | `web_search`, `marketing_asset_save`, `marketing_search` | — | low · 15 $ |
| 10 | **Product Manager** | Prodotto e fornitori | Catalogo e prodotto | `catalog_search`, `material_search`, `supplier_search` | — | low · 15 $ |
| 11 | **Supplier Manager** | Prodotto e fornitori | Fornitori e acquisti | `supplier_search`, `supplier_detail`, `material_search`, `certification_list`, `purchase_order_draft` | — | medium · 20 $ |
| 12 | **Quality Control Agent** | Prodotto e fornitori | Controllo qualità | `material_search`, `supplier_detail`, `certification_list`, `supplier_search` | — | low · 15 $ |
| 13 | **Pricing Manager** | Prodotto e fornitori | Prezzi e margini | `pricing_simulate`, `material_search`, `supplier_detail`, `catalog_search`, `tax_simulate` | 23, 25 | medium · 20 $ |
| 14 | **Logistics Manager** | Operazioni e logistica | Logistica | `shipment_search`, `order_search`, `web_search` | — | low · 15 $ |
| 15 | **Order Manager** | Operazioni e logistica | Ordini | `order_search`, `order_detail`, `shipment_search`, `purchase_order_draft`, `supplier_detail` | — | low · 15 $ |
| 16 | **Customer Success Agent** | Vendite | Assistenza clienti | `lead_search`, `order_search`, `crm_add_activity`, `opportunity_save` | — | low · 15 $ |
| 17 | **Sample Kit Manager** | Operazioni e logistica | Campionature | `catalog_search`, `material_search`, `crm_add_activity`, `lead_search` | — | low · 10 $ |
| 18 | **CFO / Controller** | Direzione | Finanza | `finance_summary`, `pricing_simulate`, `order_search`, `commission_search`, `pipeline_summary`, `tax_simulate`, `advisory_doc_search` | 13, 23, 25 | high · 25 $ |
| 19 | **Business Intelligence Analyst** | Direzione | Analisi dati | `finance_summary`, `pipeline_summary`, `company_overview`, `ai_stats`, `lead_search`, `process_metrics` | — | medium · 15 $ |
| 20 | **Compliance & Risk Manager** | Direzione | Conformità e rischi | `approvals_list`, `web_search`, `web_fetch`, `market_analysis_search`, `lead_search`, `suppression_check`, `advisory_doc_search` | 24, 25 | high · 20 $ |
| 21 | **Operations Manager** | Executive & Professional Advisory · Ingegneria gestionale | Processi e coordinamento dei reparti | `process_metrics`, `process_doc_save`, `advisory_doc_search`, `schedule_propose`, `order_search`, `shipment_search`, `supplier_search`, `company_overview`, `list_agents`, `ai_stats` | 11, 14, 15, 17, 22, 23 | medium · 20 $ |
| 22 | **Business Process Engineer** | Executive & Professional Advisory · Ingegneria gestionale | Flussi, procedure e KPI | `process_metrics`, `process_doc_save`, `advisory_doc_search`, `schedule_propose`, `company_overview`, `ai_stats` | 23 | medium · 15 $ |
| 23 | **Business Analyst** | Executive & Professional Advisory · Ingegneria gestionale | Ricavi, costi, margini e previsioni | `finance_summary`, `revenue_history`, `revenue_forecast`, `profitability_analysis`, `sales_performance`, `pricing_simulate`, `pipeline_summary`, `process_doc_save`, `advisory_doc_search`, `commission_search` | 13, 19 | medium · 20 $ |
| 24 | **Legal Counsel Agent** | Executive & Professional Advisory · Avvocato aziendale AI | Contratti, normativa e rischi legali | `web_search`, `web_fetch`, `legal_doc_save`, `advisory_doc_search`, `supplier_detail`, `order_detail`, `market_analysis_search`, `approvals_list` | 20, 25 | high · 25 $ |
| 25 | **Tax & Accounting Advisor** | Executive & Professional Advisory · Commercialista AI | IVA, fiscalità, contabilità e cash flow | `web_search`, `web_fetch`, `tax_simulate`, `tax_doc_save`, `advisory_doc_search`, `finance_summary`, `revenue_history`, `revenue_forecast`, `profitability_analysis`, `pricing_simulate`, `commission_search`, `order_search` | 23, 24 | high · 25 $ |

Dal pannello (Azienda AI → scheda dell'agente → Impostazioni) l'amministratore cambia per ogni agente:
attivo/disattivo, modello, livello di ragionamento, budget mensile, incarichi al giorno. Il servizio legge
questi valori a ogni incarico e non li sovrascrive al riavvio.

## 5. Reparto Executive & Professional Advisory

Cinque agenti che lavorano con AI CEO, CFO, Pricing Manager, Export Manager, Logistica e Ordini,
Compliance & Risk Manager (che possono delegare a loro, e viceversa dove ha senso):

| Team | Agente | Cosa fa | Cosa produce |
|---|---|---|---|
| Ingegneria gestionale | Operations Manager | organizza i processi, coordina i reparti, individua inefficienze | `process_metrics` (tempi reali), proposte di miglioramento, report operativi, automazioni proposte |
| Ingegneria gestionale | Business Process Engineer | mappa i flussi, scrive procedure, definisce KPI, automatizza | mappe di processo, procedure, definizioni di KPI, attività ricorrenti proposte (`schedule_propose`) |
| Ingegneria gestionale | Business Analyst | ricavi, costi, margini, redditività, performance, previsioni | `profitability_analysis`, `sales_performance`, `revenue_history`, `revenue_forecast`, report per il CEO |
| Avvocato aziendale AI | Legal Counsel Agent | contratti con fornitori e clienti, distribuzione, intermediazione, commissione, vendita internazionale, normativa, privacy, compliance, rischi | `legal_doc_save`: analisi e bozze con giurisdizione, legge applicabile, fonti normative (indirizzo e data) e punti da verificare |
| Commercialista AI | Tax & Accounting Advisor | contabilità, IVA, fiscalità italiana e internazionale, costi, bilancio, pianificazione, cash flow, previsioni, redditività RESALE e BROKERAGE | `tax_simulate`, `tax_doc_save`: ogni numero è `actual` (registrato), `estimate` o `simulation` |

Controllo e responsabilità, applicati dal sistema e non solo dichiarati:

- ogni documento legale o fiscale nasce con `review_required = true` e stato di revisione «da fare»; il
  database rifiuta un documento legale senza giurisdizione o senza punti da verificare;
- il testo è preceduto da un avviso («non è un parere legale/una consulenza fiscale professionale»);
- dal pannello si registra solo la revisione: chi l'ha fatta (nome e qualifica), l'esito e la nota; il testo
  dell'agente non si modifica e un documento diventa «definitivo» solo dopo una revisione approvata;
- i documenti legali e fiscali sono visibili solo all'amministratore e a chi ha il permesso `advisory`
  (per esempio l'avvocato o il commercialista esterno che li rivede con un account staff);
- `tax_simulate` dà un trattamento IVA indicativo con i riferimenti da verificare (DPR 633/1972 artt. 7-ter,
  8, 9, 16, 21; DL 331/1993 art. 41; Direttiva 2006/112/CE) e stima le imposte sul margine con parametri
  modificabili (`ai_settings.tax_parameters`, preimpostati come ipotesi: IVA 22%, IRES 24%, IRAP 3,9%);
- firme, invii di contratti, adempimenti e impegni passano sempre da `request_approval` e dal fondatore.

Esempio: prima di un'operazione internazionale importante il fondatore incarica l'AI CEO, che delega al
Legal Counsel Agent l'analisi del contratto, al Tax & Accounting Advisor le conseguenze fiscali (dopo
l'analisi legale, con una dipendenza), al Business Analyst la redditività e all'Operations Manager
l'efficienza operativa; poi riunisce i risultati in una sintesi con fatti verificati, stime, ipotesi,
rischi e le approvazioni necessarie. Il flusso è coperto da `agents/tests/test_flow.py`.

## 6. Come lavora un incarico

1. Il fondatore (o un collega agente, o un'attività ricorrente) crea una riga in `ai_tasks`.
2. Il servizio la prende con `FOR UPDATE SKIP LOCKED` se l'agente è attivo e le dipendenze sono completate.
3. Controlli prima di spendere: agente attivo, budget mensile dell'agente, tetto giornaliero aziendale,
   limite di incarichi al giorno; se uno non va, l'incarico è «bloccato» con il motivo.
4. Il prompt contiene le regole aziendali, il ruolo, gli obiettivi, i colleghi, le note ricevute e la
   memoria pertinente. Il modello usa solo gli strumenti del suo registro: ogni chiamata è validata
   (schema pydantic), eseguita sul database con l'identità `agente:<id>` (registro modifiche) e registrata.
5. Se delega, chiama `wait_for_delegates`: l'incarico va «in attesa» e riparte da solo in fase di sintesi
   quando tutti i figli sono conclusi, con i loro risultati. Profondità massima delle deleghe 3, massimo 8
   figli per incarico (in `ai_settings`).
6. Si chiude solo con `submit_result` valido (un «fatto verificato» senza fonte viene rifiutato). Se il modello
   si ferma senza risultato, l'incarico fallisce. Errori temporanei: nuovo tentativo con attesa crescente
   (massimo 3); un servizio fermo durante l'esecuzione viene rilevato e l'incarico rimesso in coda.

## 7. Avvio

1. Database: applicare `supabase/migrations/20261106000000_ai_company.sql` dopo quella iniziale
   (Supabase → SQL Editor, oppure `psql`). È rieseguibile.
2. Permessi: nel pannello, Clienti → scheda dello staff → Permessi: `ai` (sede, incarichi, approvazioni in
   lettura) e, solo per chi rivede, `advisory`. Le decisioni sulle approvazioni restano all'amministratore.
3. Servizio agenti: vedi [`agents/README.md`](../agents/README.md) (Python, `python -m wc_agents serve`, o
   il container `agents/Dockerfile`). Variabili: `ANTHROPIC_API_KEY`, `AGENTS_DATABASE_URL` (Supabase in
   modalità session, porta 5432), `AGENTS_API_TOKEN`, `AGENTS_WS_SECRET`; per le email approvate
   `RESEND_API_KEY` ed `EMAIL_FROM`.
4. Sito: `AGENTS_WS_SECRET` (lo stesso del servizio) e `AGENTS_PUBLIC_URL` per il tempo reale; senza, la
   sede si aggiorna ogni 4 secondi.
5. Verifica: `python -m wc_agents check`, poi `python -m wc_agents smoke` (prima prova reale con Claude: un
   piccolo incarico al Business Intelligence Analyst, massimo 4 passi e 0,50 USD; mostra esito, costo e
   risultato). Poi Azienda AI → Sede 3D: con servizio e chiave attivi gli agenti risultano «Disponibile».
6. Attività ricorrenti: al primo avvio il servizio aggiunge 7 attività consigliate (`agents/config/schedules.json`:
   follow-up giornaliero, pipeline settimanale, controllo disponibilità e certificazioni, misure dei processi,
   rapporto economico, nota IVA e cash flow, indicatori mensili), tutte **disattivate**: si attivano da
   Azienda AI → Attività ricorrenti.

## 8. Costi e limiti

- Ogni chiamata a Claude è registrata in `ai_usage` (token, cache, ricerche web, costo a prezzi di listino,
  identificativo della richiesta). Prezzi in `agents/wc_agents/llm.py`.
- Modello predefinito `claude-opus-5-5` (4 $/20 $ per milione di token in ingresso/uscita); si può scegliere
  un modello diverso per agente. La scelta del modello è una decisione di costo del fondatore.
- Limiti: budget mensile per agente (totale preimpostato 480 $/mese se tutti lo esaurissero), tetto giornaliero
  aziendale (25 $), 3 $ e 14 passi massimi per incarico, 6 ricerche web per richiesta.
- Il prompt di sistema e la conversazione usano la cache di Claude; streaming e fallback lato server
  (`fallbacks: "default"`) sono attivi.

## 9. Sicurezza

- Pannello: accesso con verifica in due passaggi; ogni lettura e scrittura del pannello gira con l'identità
  dell'utente (RLS). Le approvazioni le decide solo l'amministratore (anche nel database).
- Il pannello non può segnare un incarico come completato né scriverne il risultato (trigger
  `ai_tasks_guard`); un ordine al fornitore non diventa approvato senza un'approvazione del fondatore
  (`purchase_orders_guard`); i documenti advisory accettano solo la registrazione della revisione.
- Il servizio agenti usa una connessione dedicata al database; i permessi per agente sono nel codice
  (registro degli strumenti) e ogni modifica porta l'attore `agente:<id>` nel registro modifiche.
- Le email partono solo dopo l'approvazione; consenso e lista di esclusione si ricontrollano al momento
  dell'invio. I contenuti del web sono dati: gli agenti non hanno strumenti per pagare, firmare, inviare
  ordini o pubblicare.
- API del servizio protetta da token (`AGENTS_API_TOKEN`); il WebSocket accetta solo token firmati dal
  pannello (HMAC, validi 10 minuti); la CSP del pannello permette solo l'indirizzo del servizio.

## 10. Test

- `agents/`: `python -m pytest` — 44 test con Postgres reale e un modello finto (flusso CEO → colleghi →
  sintesi, deleghe e dipendenze, strumenti non autorizzati, budget, tentativi, approvazioni ed email,
  strumenti advisory, IVA, redditività, API e WebSocket).
- `npm run test:db` — permessi del database, comprese approvazioni, ordini ai fornitori e documenti advisory.
- `npm run test:unit` — simulatore prezzi del pannello sugli stessi casi del servizio.
- `E2E_DB=1 npm test` — `tests/e2e/ai-company.spec.ts`: sede e control room con i 25 agenti, stato «non
  collegato», incarico assegnato, approvazione, simulatore, sezioni commerciali.

## 11. Cosa serve dal fondatore

- La chiave API di Claude (`ANTHROPIC_API_KEY`) sul servizio agenti: senza, nessun agente lavora. Le
  chiamate reali a Claude non sono state verificate in sviluppo (non c'era una chiave); la richiesta è stata
  verificata fino all'autenticazione (risposta 401 con chiave non valida).
- Dove ospitare il servizio agenti (container sempre acceso) e i budget da assegnare.
- Resend configurato per le email approvate.
- Un avvocato e un commercialista abilitati per rivedere i documenti del reparto advisory.
