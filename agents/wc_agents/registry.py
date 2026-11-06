"""Registro dei 25 agenti: definizioni in config/agent-registry.json e prompt in config/agents/*.md.

All'avvio il servizio sincronizza il registro nella tabella ai_agents. Nel database restano
modificabili dal pannello: attivo/disattivo, modello, livello di ragionamento, budget e limiti.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from pathlib import Path

from .db import Database, jsonb


@dataclass
class AgentDef:
    id: str
    name: str
    department: str
    title: str
    prompt: str
    tools: list[str]
    can_delegate_to: list[str]
    objectives: list[str]
    kpis: list[str]
    effort: str = "medium"
    monthly_budget_usd: float = 20
    daily_task_limit: int = 40
    team: str | None = None
    # valori correnti dal database (pannello)
    enabled: bool = True
    model: str = ""
    extra: dict = field(default_factory=dict)

    def delegates(self, all_ids: list[str]) -> list[str]:
        if "*" in self.can_delegate_to:
            return [a for a in all_ids if a != self.id]
        return [a for a in self.can_delegate_to if a in all_ids and a != self.id]


def _strip_frontmatter(text: str) -> str:
    return re.sub(r"^---\n.*?\n---\n", "", text, flags=re.S).strip()


def load_registry(config_dir: Path) -> dict[str, AgentDef]:
    raw = json.loads((config_dir / "agent-registry.json").read_text(encoding="utf-8"))
    out: dict[str, AgentDef] = {}
    for a in raw:
        prompt = _strip_frontmatter((config_dir.parent / a["prompt_file"]).read_text(encoding="utf-8"))
        out[a["id"]] = AgentDef(
            id=a["id"], name=a["name"], department=a["department"], title=a["title"], prompt=prompt,
            tools=a["tools"], can_delegate_to=a.get("can_delegate_to", []), objectives=a.get("objectives", []),
            kpis=a.get("kpis", []), effort=a.get("effort", "medium"), monthly_budget_usd=a.get("monthly_budget_usd", 20),
            daily_task_limit=a.get("daily_task_limit", 40), team=a.get("team"),
        )
    return out


async def sync_registry(db: Database, agents: dict[str, AgentDef], default_model: str) -> None:
    """Registro → database. Non sovrascrive le scelte fatte dal pannello (attivo, modello, budget)."""
    for a in agents.values():
        h = hashlib.sha256(a.prompt.encode()).hexdigest()[:16]
        await db.execute(
            """insert into public.ai_agents (id, name, department, team, title, model, effort, monthly_budget_usd, daily_task_limit,
                                             tools, can_delegate_to, objectives, kpis, prompt_hash)
               values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               on conflict (id) do update set name = excluded.name, department = excluded.department, team = excluded.team,
                 title = excluded.title,
                 tools = excluded.tools, can_delegate_to = excluded.can_delegate_to, objectives = excluded.objectives,
                 kpis = excluded.kpis, prompt_hash = excluded.prompt_hash""",
            (a.id, a.name, a.department, a.team, a.title, default_model, a.effort, a.monthly_budget_usd, a.daily_task_limit,
             a.tools, a.can_delegate_to, a.objectives, jsonb(a.kpis), h),
        )


async def load_live(db: Database, agents: dict[str, AgentDef], agent_id: str) -> AgentDef | None:
    """Definizione dell'agente con i valori correnti del pannello."""
    a = agents.get(agent_id)
    if not a:
        return None
    row = await db.fetchone("select enabled, autonomy, model, effort, monthly_budget_usd, daily_task_limit from public.ai_agents where id = %s", (agent_id,))
    if row:
        a.enabled = row["enabled"] and row["autonomy"] != "disabled"
        a.model = row["model"]
        a.effort = row["effort"]
        a.monthly_budget_usd = float(row["monthly_budget_usd"])
        a.daily_task_limit = row["daily_task_limit"]
    return a
