"""Impostazioni del servizio agenti, lette dalle variabili d'ambiente (o dal file .env del sito)."""

from __future__ import annotations

import os
import socket
from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[1]  # cartella agents/
REPO = ROOT.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(REPO / ".env", ROOT / ".env"), extra="ignore", populate_by_name=True)

    # Connessione diretta a Postgres. Su Supabase usate la modalità "session" (porta 5432): la modalità
    # "transaction" (porta 6543) non supporta LISTEN/NOTIFY. AGENTS_DATABASE_URL ha la precedenza su DATABASE_URL.
    database_url: str = Field(validation_alias=AliasChoices("AGENTS_DATABASE_URL", "DATABASE_URL", "database_url"))
    anthropic_api_key: str | None = None
    # Modello predefinito degli agenti; ogni agente può averne uno diverso (pannello → Agenti)
    ai_model: str = Field("claude-opus-5-5", validation_alias=AliasChoices("AGENTS_MODEL", "ai_model"))
    app_env: str = "development"  # development | test | production

    worker_id: str = Field(default_factory=lambda: f"{socket.gethostname()}-{os.getpid()}")
    worker_concurrency: int = 3
    poll_seconds: float = 5.0
    heartbeat_seconds: float = 10.0
    max_turns_per_task: int = 14
    max_cost_per_task_usd: float = 3.0
    lock_timeout_seconds: int = 1800
    web_search_max_uses: int = 6

    # API del servizio: token per le chiamate da server a server e segreto per i token WebSocket
    agents_api_token: str | None = None
    agents_ws_secret: str | None = None

    # Email (solo per comunicazioni approvate dal fondatore)
    resend_api_key: str | None = None
    email_from: str | None = None
    email_reply_to: str | None = None

    content_dir: Path = REPO / "src" / "content"
    config_dir: Path = ROOT / "config"

    @property
    def llm_configured(self) -> bool:
        return bool(self.anthropic_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
