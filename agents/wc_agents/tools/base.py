"""Infrastruttura degli strumenti: ogni strumento ha uno schema (pydantic), un'attività per la sede 3D
e una funzione che lavora sul database. Un agente può usare solo gli strumenti del suo registro."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Literal

from pydantic import BaseModel, ConfigDict

from ..db import Database
from ..registry import AgentDef

DataStatus = Literal["verified", "estimated", "assumed", "unknown"]
Activity = Literal["research", "analysis", "writing", "calculation", "coordination", "crm", "review", "reporting"]


class Args(BaseModel):
    model_config = ConfigDict(extra="forbid")


@dataclass
class ToolContext:
    db: Database
    settings: Any
    agent: AgentDef
    task: dict
    agents: dict[str, AgentDef]
    delegated: list[str] = field(default_factory=list)
    finished: bool = False
    waiting: bool = False
    result: dict | None = None
    created: list[dict] = field(default_factory=list)  # record creati, per il riepilogo

    @property
    def actor(self) -> str:
        return f"agente:{self.agent.id}"

    def note_created(self, table: str, record_id: Any, label: str = "") -> None:
        self.created.append({"table": table, "id": str(record_id), "label": label})


Handler = Callable[[ToolContext, Any], Awaitable[dict]]


@dataclass
class Tool:
    name: str
    description: str
    args: type[Args]
    handler: Handler
    activity: Activity = "analysis"

    def schema(self) -> dict:
        return {"name": self.name, "description": self.description, "input_schema": _inline(self.args.model_json_schema())}


class ToolError(Exception):
    """Errore spiegato all'agente (finisce in un tool_result con is_error)."""


TOOLS: dict[str, Tool] = {}

# Strumenti eseguiti sui server di Anthropic (ricerca e lettura di pagine web)
SERVER_TOOLS = {
    "web_search": lambda s: {"type": "web_search_20260209", "name": "web_search", "max_uses": s.web_search_max_uses},
    "web_fetch": lambda s: {"type": "web_fetch_20260209", "name": "web_fetch", "max_uses": s.web_search_max_uses},
}


def tool(name: str, description: str, args: type[Args], activity: Activity = "analysis"):
    def deco(fn: Handler) -> Handler:
        TOOLS[name] = Tool(name, description, args, fn, activity)
        return fn

    return deco


def _inline(schema: dict) -> dict:
    """Schema JSON senza $ref né titoli (più compatto per il modello)."""
    defs = schema.pop("$defs", {})

    def walk(node: Any) -> Any:
        if isinstance(node, dict):
            if "$ref" in node:
                return walk(dict(defs[node["$ref"].split("/")[-1]]))
            return {k: walk(v) for k, v in node.items() if k != "title"}
        if isinstance(node, list):
            return [walk(x) for x in node]
        return node

    return walk(schema)


def as_json(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, default=str)
