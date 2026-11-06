"""Avvio del servizio agenti.

    python -m wc_agents serve      API + orchestratore (un solo processo)
    python -m wc_agents worker     solo orchestratore (per avere più processi sulla stessa coda)
    python -m wc_agents sync       sincronizza il registro dei 25 agenti nel database ed esce
    python -m wc_agents check      verifica configurazione, database, registro e strumenti
    python -m wc_agents smoke      prima prova reale con Claude (un piccolo incarico, massimo 0,50 USD)
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import signal
import sys

from .config import get_settings


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="wc_agents")
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("serve")
    s.add_argument("--host", default="0.0.0.0")
    s.add_argument("--port", type=int, default=8787)
    sub.add_parser("worker")
    sub.add_parser("sync")
    sub.add_parser("check")
    sub.add_parser("smoke")
    args = p.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    settings = get_settings()

    if args.cmd == "serve":
        import uvicorn

        from .api import create_app

        uvicorn.run(create_app(settings), host=args.host, port=args.port, log_level="info")
        return 0
    return asyncio.run(_run(args.cmd, settings))


async def _run(cmd: str, settings) -> int:
    from .db import Database
    from .llm import ClaudeLLM
    from .orchestrator import Orchestrator
    from .registry import load_registry, sync_default_schedules, sync_registry
    from .tools import SERVER_TOOLS, TOOLS

    db = Database(settings.database_url, max_size=settings.worker_concurrency + 4)
    await db.open()
    agents = load_registry(settings.config_dir)
    try:
        if cmd == "sync":
            await sync_registry(db, agents, settings.ai_model)
            n = await sync_default_schedules(db, settings.config_dir)
            print(f"Registro sincronizzato: {len(agents)} agenti; attività ricorrenti consigliate aggiunte: {n} (disattivate)")
            return 0
        if cmd == "check":
            missing = {t for a in agents.values() for t in a.tools if t not in TOOLS and t not in SERVER_TOOLS}
            n = await db.fetchone("select count(*)::int as n from public.ai_agents")
            print(f"Agenti nel registro: {len(agents)} — nel database: {n['n'] if n else 0}")
            print(f"Strumenti: {len(TOOLS)} definiti, mancanti: {sorted(missing) or 'nessuno'}")
            print(f"Chiave Claude: {'configurata' if settings.llm_configured else 'NON configurata (gli agenti non lavorano)'}")
            print(f"Email: {'configurata' if settings.resend_api_key and settings.email_from else 'non configurata'}")
            print(f"API: token {'impostato' if settings.agents_api_token else 'NON impostato'}, "
                  f"WebSocket {'attivo' if settings.agents_ws_secret else 'disattivato'}")
            return 1 if missing else 0
        if cmd == "smoke":
            from .smoke import run_smoke

            if not settings.llm_configured:
                print("Manca ANTHROPIC_API_KEY: impostala nel .env o nelle variabili del servizio e riprova.")
                return 2
            out = await run_smoke(db, settings, agents, ClaudeLLM(settings.anthropic_api_key))
            print(f"Esito: {out['status']} — incarico {out['task_id']}")
            print(f"Chiamate a Claude: {out['calls']} ({out['models']}) — costo {out['cost_usd']:.4f} USD — "
                  f"token {out['input_tokens']} in ingresso, {out['output_tokens']} in uscita")
            print(f"Risultato: {out['summary'] or out['error']}")
            return 0 if out["status"] == "completed" else 1
        llm = ClaudeLLM(settings.anthropic_api_key) if settings.llm_configured else None
        orch = Orchestrator(db, settings, agents, llm)
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(sig, orch.stop)
            except NotImplementedError:
                pass
        await orch.serve()
        return 0
    finally:
        await db.close()


if __name__ == "__main__":
    sys.exit(main())
