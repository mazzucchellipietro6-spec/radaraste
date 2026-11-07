"""Test del servizio agenti su un Postgres reale (database temporaneo) con un modello finto.

    TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres python -m pytest
"""

from __future__ import annotations

import os
import subprocess
import time
from pathlib import Path
from urllib.parse import urlparse, urlunparse

import psycopg
import pytest

from wc_agents.config import Settings
from wc_agents.db import Database
from wc_agents.registry import load_registry, sync_registry

REPO = Path(__file__).resolve().parents[2]
BASE = os.environ.get("TEST_DATABASE_URL", "postgres://postgres@localhost:54329/postgres")


def _with_db(url: str, name: str) -> str:
    u = urlparse(url)
    return urlunparse(u._replace(path=f"/{name}"))


@pytest.fixture(scope="session")
def database_url():
    try:
        psycopg.connect(BASE, connect_timeout=3).close()
    except Exception as e:
        pytest.skip(f"Postgres di prova non raggiungibile ({BASE}): {e}")
    name = f"wc_agents_test_{int(time.time() * 1000)}"
    with psycopg.connect(BASE, autocommit=True) as c:
        c.execute(f"create database {name}")
    url = _with_db(BASE, name)
    try:
        for f in ["supabase/tests/local-auth-stub.sql", "supabase/migrations/20261101000000_init.sql",
                  "supabase/migrations/20261106000000_ai_company.sql", "supabase/migrations/20261107000000_security.sql"]:
            subprocess.run(["psql", url, "-q", "-v", "ON_ERROR_STOP=1", "-f", str(REPO / f)], check=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        yield url
    finally:
        with psycopg.connect(BASE, autocommit=True) as c:
            c.execute(f"drop database if exists {name} with (force)")


AGENT_ROLE = "wc_agents_pytest"


@pytest.fixture(scope="session")
def agent_database_url(database_url):
    """Il servizio agenti nei test usa il ruolo limitato wc_agents_runtime, come in produzione."""
    with psycopg.connect(database_url, autocommit=True) as c:
        c.execute(f"do $$ begin create role {AGENT_ROLE} login; exception when duplicate_object then null; end $$")
        c.execute(f"grant wc_agents_runtime to {AGENT_ROLE}")
    u = urlparse(database_url)
    return urlunparse(u._replace(netloc=f"{AGENT_ROLE}@{u.hostname}:{u.port or 5432}"))


@pytest.fixture(scope="session")
def settings(agent_database_url):
    return Settings(_env_file=None, database_url=agent_database_url, anthropic_api_key=None, app_env="test", worker_id="test-worker",
                    worker_concurrency=3, poll_seconds=0.2, heartbeat_seconds=1, max_turns_per_task=10, max_cost_per_task_usd=3.0,
                    agents_api_token="test-token", agents_ws_secret="test-ws-secret")


@pytest.fixture(scope="session")
def agents(settings):
    return load_registry(settings.config_dir)


@pytest.fixture(scope="session")
async def db(settings, agents):
    """Connessione del servizio agenti (ruolo limitato)."""
    d = Database(settings.database_url, max_size=10)
    await d.open()
    await sync_registry(d, agents, settings.ai_model)
    yield d
    await d.close()


@pytest.fixture(scope="session")
async def owner(database_url):
    """Connessione del proprietario: solo per preparare e controllare i dati dei test."""
    d = Database(database_url, max_size=4)
    await d.open()
    yield d
    await d.close()


TABLES = ["security_events", "ai_task_events", "ai_usage", "ai_messages", "ai_memory", "approvals", "ai_tasks", "ai_schedules", "ai_runtime",
          "advisory_documents", "pricing_simulations", "market_analyses", "marketing_assets", "crm_activities", "opportunities",
          "leads", "suppression_list", "purchase_orders", "supplier_certifications", "email_log", "commissions", "shipments",
          "payments", "orders", "quote_versions", "quote_items", "quotes", "deals", "materials", "suppliers"]


@pytest.fixture
async def clean(db, owner, agents, settings):
    """Database pulito. Restituisce la connessione del proprietario; `clean.agent` è quella del servizio."""
    # il registro delle modifiche è solo in aggiunta: nei test non si svuota
    await owner.execute("truncate " + ", ".join(f"public.{t}" for t in TABLES) + " cascade")
    await owner.execute("update public.ai_agents set enabled = true, autonomy = 'draft_and_analyze'")
    for a in agents.values():
        a.enabled = True
    await sync_registry(db, agents, settings.ai_model)
    await owner.execute("update public.ai_agents a set monthly_budget_usd = 20, daily_task_limit = 40")
    await owner.execute("""update public.ai_settings set value = '{"amount": 25}' where key = 'daily_budget_usd'""")
    await owner.execute("""update public.ai_settings set value = '{"paused": false, "reason": null}' where key = 'system_status'""")
    owner.agent = db
    yield owner


async def new_task(db, agent_id: str, title: str, instructions: str = "Svolgi l'incarico", **kw) -> str:
    row = await db.fetchone(
        "insert into public.ai_tasks (agent_id, title, instructions, priority) values (%s, %s, %s, %s) returning id",
        (agent_id, title, instructions, kw.get("priority", 5)),
    )
    return str(row["id"])
