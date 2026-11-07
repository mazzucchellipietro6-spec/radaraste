"""Modello finto per i test: segue un copione per agente e registra ciò che riceve.

Non simula l'intelligenza del modello: serve a verificare che runtime, strumenti, deleghe, registri,
costi e approvazioni funzionino davvero sul database.
"""

from __future__ import annotations

import itertools
import re
from dataclasses import dataclass, field
from typing import Any, Callable

from wc_agents.llm import LLMResponse, TransientLLMError, Usage

_ids = itertools.count(1)


def tool_use(name: str, **inp: Any) -> dict:
    return {"type": "tool_use", "id": f"toolu_{next(_ids):05d}", "name": name, "input": inp}


def text(t: str) -> dict:
    return {"type": "text", "text": t}


@dataclass
class Call:
    agent: str
    turn: int
    messages: list
    tools: list[dict]
    system: str
    effort: str


@dataclass
class FakeLLM:
    """scripts: nome dell'agente → funzione(call) che restituisce i blocchi della risposta (o un'eccezione)."""

    scripts: dict[str, Callable[[Call], list[dict] | Exception]]
    calls: list[Call] = field(default_factory=list)
    input_tokens: int = 1000
    output_tokens: int = 200

    async def create(self, *, model: str, system: str, messages: list, tools: list[dict], effort: str, max_tokens: int) -> LLMResponse:
        m = re.search(r"## Il tuo ruolo: (.+?) \(", system)
        agent = m.group(1) if m else "?"
        turn = sum(1 for c in self.calls if c.agent == agent and c.messages is messages) + 1
        call = Call(agent, turn, messages, tools, system, effort)
        self.calls.append(call)
        script = self.scripts.get(agent)
        if script is None:
            raise AssertionError(f"Nessun copione per {agent}")
        blocks = script(call)
        if isinstance(blocks, Exception):
            raise blocks
        stop = "tool_use" if any(b["type"] == "tool_use" for b in blocks) else "end_turn"
        return LLMResponse(content=blocks, blocks=blocks, stop_reason=stop,
                           usage=[Usage(model=model, input_tokens=self.input_tokens, output_tokens=self.output_tokens)],
                           model=model, request_id=f"req_test_{len(self.calls)}")


def last_tool_results(call: Call) -> list[dict]:
    last = call.messages[-1]
    if last["role"] != "user" or isinstance(last["content"], str):
        return []
    return [b for b in last["content"] if b.get("type") == "tool_result"]


def first_text(call: Call) -> str:
    return call.messages[0]["content"]


def transient(msg: str = "overloaded") -> Exception:
    return TransientLLMError(msg)
