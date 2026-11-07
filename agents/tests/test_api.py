"""API del servizio: salute, autenticazione, incarichi, token del WebSocket."""

from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from wc_agents.api import check_ws_token, create_app, ws_token


def test_ws_token():
    t = ws_token("s3cret", ttl=60)
    assert check_ws_token("s3cret", t)
    assert not check_ws_token("altro", t)
    assert not check_ws_token("s3cret", t.replace(".", ".0"))
    assert not check_ws_token("s3cret", ws_token("s3cret", ttl=60, now=time.time() - 3600))
    assert not check_ws_token(None, t)


def test_api(settings, db):  # db: registro già sincronizzato
    app = create_app(settings, llm=None, run_worker=False)
    with TestClient(app) as c:
        h = c.get("/health").json()
        assert h["ok"] and h["agents"] == 25 and h["llm_configured"] is False
        assert c.get("/agents").status_code == 401
        assert c.get("/agents", headers={"Authorization": "Bearer sbagliato"}).status_code == 401
        auth = {"Authorization": "Bearer test-token"}
        agents = c.get("/agents", headers=auth).json()["agents"]
        assert len(agents) == 25 and any(a["department"] == "advisory" for a in agents)
        assert c.post("/tasks", headers=auth, json={"agent_id": "99-nessuno", "title": "Prova", "instructions": "x"}).status_code == 404
        r = c.post("/tasks", headers=auth, json={"agent_id": "21-operations-manager", "title": "Analisi processi", "instructions": "Misura i tempi"})
        assert r.status_code == 201
        tid = r.json()["id"]
        t = c.get(f"/tasks/{tid}", headers=auth).json()
        assert t["task"]["status"] == "queued" and t["events"] == []
        assert c.post(f"/tasks/{tid}/retry", headers=auth).status_code == 409
        assert c.post(f"/tasks/{tid}/cancel", headers=auth).json()["ok"]
        assert c.get("/tasks/non-un-uuid", headers=auth).status_code == 404
        with pytest.raises(WebSocketDisconnect) as e:
            with c.websocket_connect("/ws/events?token=sbagliato") as ws:
                ws.receive_json()
        assert e.value.code == 4401
