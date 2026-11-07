# Servizio agenti — WHITE CARRARA

I 25 agenti AI dell'azienda: ricevono incarichi dalla coda nel database, ragionano con Claude, usano solo
gli strumenti autorizzati (funzioni sul gestionale e ricerca web), collaborano tra loro, salvano memoria,
costi e registri, e consegnano risultati strutturati all'AI CEO e al fondatore.
Architettura, regole e agenti: [`docs/AI-COMPANY.md`](../docs/AI-COMPANY.md).

## Avvio in locale

Requisiti: Python 3.11+, lo stesso database del sito con le migrazioni applicate
(`supabase/migrations/20261101000000_init.sql` e poi `20261106000000_ai_company.sql`).

```bash
cd agents
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
python -m wc_agents check      # configurazione, database, registro, strumenti
python -m wc_agents smoke      # prima prova reale con Claude (massimo 0,50 USD)
python -m wc_agents serve      # API su http://localhost:8787 + orchestratore
```

Le variabili si leggono dal `.env` del sito (radice del repository) o da `agents/.env`:

| Variabile | Serve a |
|---|---|
| `DATABASE_URL` / `AGENTS_DATABASE_URL` | connessione Postgres; su Supabase la modalità **session** (porta 5432), non transaction |
| `ANTHROPIC_API_KEY` | senza chiave gli incarichi restano in coda e la sede mostra gli agenti "non collegati" |
| `AGENTS_MODEL` | modello predefinito (`claude-opus-5-5`); per agente si cambia dal pannello |
| `AGENTS_API_TOKEN` | token Bearer per l'API da server a server |
| `AGENTS_WS_SECRET` | segreto condiviso con il pannello per il WebSocket degli eventi |
| `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` | invio delle sole email approvate dal fondatore |
| `WORKER_CONCURRENCY`, `MAX_TURNS_PER_TASK`, `MAX_COST_PER_TASK_USD` | limiti di esecuzione e spesa |

Più processi possono lavorare sulla stessa coda (`python -m wc_agents worker`): gli incarichi si prendono
con `FOR UPDATE SKIP LOCKED`, quindi nessun incarico viene eseguito due volte.

## In produzione

```bash
docker build -f agents/Dockerfile -t white-carrara-agents .   # dalla radice del repository
docker run --env-file .env -p 8787:8787 white-carrara-agents
```

Qualsiasi servizio che esegua un container sempre acceso va bene (Railway, Fly.io, Render, una VM).
Non usate funzioni serverless: un incarico può durare diversi minuti.

## Test

Servono un Postgres di prova (mai quello di produzione) e `psql`. I test usano un modello finto: non
chiamano Claude e non spendono nulla.

```bash
TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres python -m pytest
```

## Struttura

```
config/agent-registry.json   25 agenti: reparto, ruolo, strumenti, deleghe, obiettivi, KPI, budget
config/agents/*.md           prompt specializzati (in italiano, con flusso di lavoro e strumenti)
config/schedules.json        attività ricorrenti consigliate, inserite disattivate
wc_agents/orchestrator.py    coda, dipendenze, risveglio dei genitori, recupero, pianificazioni
wc_agents/runtime.py         esecuzione di un incarico: budget, ciclo degli strumenti, registri, esito
wc_agents/llm.py             chiamata a Claude (streaming, cache, fallback lato server, costi)
wc_agents/tools/             strumenti autorizzati per agente
wc_agents/approvals.py       esecuzione delle decisioni del fondatore
wc_agents/api.py             API FastAPI e WebSocket degli eventi
```
