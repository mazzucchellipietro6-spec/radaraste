"""Accesso al database condiviso con il sito (PostgreSQL / Supabase)."""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

from psycopg import AsyncConnection
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import AsyncConnectionPool


def jsonb(value: Any) -> Jsonb:
    return Jsonb(value, dumps=lambda v: json.dumps(v, ensure_ascii=False, default=str))


class Database:
    def __init__(self, url: str, max_size: int = 8):
        self.url = url
        self.pool = AsyncConnectionPool(url, min_size=1, max_size=max_size, open=False, kwargs={"row_factory": dict_row, "autocommit": False})

    async def open(self) -> None:
        await self.pool.open(wait=True)

    async def close(self) -> None:
        await self.pool.close()

    @asynccontextmanager
    async def tx(self, actor: str = "sistema:agenti") -> AsyncIterator[AsyncConnection]:
        """Una transazione; `actor` finisce nel registro delle modifiche (audit_log)."""
        async with self.pool.connection() as conn:
            async with conn.transaction():
                await conn.execute("select set_config('app.actor', %s, true)", (actor,))
                yield conn

    async def fetch(self, sql: str, params: Any = None, actor: str = "sistema:agenti") -> list[dict]:
        async with self.tx(actor) as c:
            cur = await c.execute(sql, params)
            return list(await cur.fetchall()) if cur.description else []

    async def fetchone(self, sql: str, params: Any = None, actor: str = "sistema:agenti") -> dict | None:
        rows = await self.fetch(sql, params, actor)
        return rows[0] if rows else None

    async def execute(self, sql: str, params: Any = None, actor: str = "sistema:agenti") -> None:
        async with self.tx(actor) as c:
            await c.execute(sql, params)

    async def listen_connection(self) -> AsyncConnection:
        """Connessione dedicata per LISTEN (notifiche di nuovi incarichi ed eventi)."""
        return await AsyncConnection.connect(self.url, autocommit=True)
