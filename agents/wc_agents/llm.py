"""Chiamate al modello Claude per gli agenti: streaming, prompt caching, fallback lato server, costi.

Il ciclo degli strumenti è nel runtime (runtime.py): qui c'è solo la singola chiamata e la contabilità
dei token. Nei test si usa un modello finto (tests/fake_llm.py) che segue lo stesso protocollo.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

import anthropic

# Prezzi di listino in USD per milione di token: (input, output, lettura dalla cache).
# Scrittura in cache (5 minuti) = 1,25 × input. Ricerca web = 10 USD ogni 1.000 ricerche.
PRICES: dict[str, tuple[float, float, float]] = {
    "claude-opus-5-5": (4.0, 20.0, 0.20),
    "claude-sonnet-5-5": (2.0, 10.0, 0.20),
    "claude-haiku-5-5": (0.10, 0.50, 0.01),
    "claude-opus-5": (5.0, 25.0, 0.50),
    "claude-opus-4-8": (5.0, 25.0, 0.50),
    "claude-fable-5-1": (10.0, 50.0, 0.25),
}
UNKNOWN_PRICE = (10.0, 50.0, 1.0)  # modello non in tabella: stima prudente (per eccesso)
CACHE_WRITE_FACTOR = 1.25
WEB_SEARCH_USD = 0.01
FALLBACK_BETA = "server-side-fallback-2026-07-01"


class LLMError(Exception):
    """Errore del modello."""


class TransientLLMError(LLMError):
    """Errore temporaneo (limiti di frequenza, sovraccarico, rete): l'incarico si riprova più tardi."""


class FatalLLMError(LLMError):
    """Errore che richiede una persona (chiave non valida, permessi, richiesta non valida)."""


@dataclass
class Usage:
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    web_searches: int = 0

    @property
    def cost_usd(self) -> float:
        inp, out, read = PRICES.get(self.model, UNKNOWN_PRICE)
        return (self.input_tokens * inp + self.output_tokens * out + self.cache_read_tokens * read
                + self.cache_write_tokens * inp * CACHE_WRITE_FACTOR) / 1_000_000 + self.web_searches * WEB_SEARCH_USD


@dataclass
class LLMResponse:
    content: list[Any]  # blocchi da rimandare al modello così come sono arrivati
    blocks: list[dict]  # gli stessi blocchi come dizionari, per leggerli
    stop_reason: str | None
    usage: list[Usage]
    model: str
    request_id: str | None = None
    stop_details: dict | None = None
    fallback_used: bool = False

    @property
    def cost_usd(self) -> float:
        return sum(u.cost_usd for u in self.usage)


class LLM(Protocol):
    async def create(self, *, model: str, system: str, messages: list, tools: list[dict], effort: str,
                     max_tokens: int) -> LLMResponse: ...


def _dump(block: Any) -> dict:
    if isinstance(block, dict):
        return block
    return block.model_dump(mode="json", exclude_none=True)


def _usage(resp: Any, requested: str) -> list[Usage]:
    u = resp.usage
    searches = 0
    stu = getattr(u, "server_tool_use", None)
    if stu is not None:
        searches = int(getattr(stu, "web_search_requests", 0) or 0)
    iterations = getattr(u, "iterations", None) or []
    if iterations:
        out = []
        for it in iterations:
            out.append(Usage(model=getattr(it, "model", None) or requested, input_tokens=it.input_tokens or 0,
                             output_tokens=it.output_tokens or 0, cache_read_tokens=getattr(it, "cache_read_input_tokens", 0) or 0,
                             cache_write_tokens=getattr(it, "cache_creation_input_tokens", 0) or 0))
        out[-1].web_searches = searches
        return out
    return [Usage(model=getattr(resp, "model", None) or requested, input_tokens=u.input_tokens or 0, output_tokens=u.output_tokens or 0,
                  cache_read_tokens=getattr(u, "cache_read_input_tokens", 0) or 0,
                  cache_write_tokens=getattr(u, "cache_creation_input_tokens", 0) or 0, web_searches=searches)]


TRANSIENT = tuple(getattr(anthropic, n) for n in ("RateLimitError", "OverloadedError", "InternalServerError", "APIConnectionError",
                                                   "APITimeoutError", "ServiceUnavailableError", "GatewayTimeoutError",
                                                   "DeadlineExceededError", "RequestTimeoutError") if hasattr(anthropic, n))
FATAL = tuple(getattr(anthropic, n) for n in ("AuthenticationError", "PermissionDeniedError", "BadRequestError", "NotFoundError",
                                               "UnprocessableEntityError", "RequestTooLargeError", "EnforcedSpendLimitReachedError",
                                               "OrganizationOnHoldError") if hasattr(anthropic, n))


@dataclass
class ClaudeLLM:
    api_key: str
    max_retries: int = 3
    _client: anthropic.AsyncAnthropic | None = field(default=None, init=False, repr=False)

    @property
    def client(self) -> anthropic.AsyncAnthropic:
        if self._client is None:
            self._client = anthropic.AsyncAnthropic(api_key=self.api_key, max_retries=self.max_retries)
        return self._client

    async def create(self, *, model: str, system: str, messages: list, tools: list[dict], effort: str,
                     max_tokens: int = 16000) -> LLMResponse:
        params = dict(
            model=model,
            max_tokens=max_tokens,
            # il prompt di sistema e gli strumenti non cambiano durante l'incarico: punto di cache esplicito
            system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            messages=messages,
            tools=tools,
            tool_choice={"type": "auto"},
            thinking={"type": "adaptive"},
            output_config={"effort": effort},
            cache_control={"type": "ephemeral"},  # cache automatica della conversazione che cresce
            betas=[FALLBACK_BETA],
            fallbacks="default",
        )
        json_retries = 0
        while True:
            try:
                async with self.client.beta.messages.stream(**params) as stream:
                    resp = await stream.get_final_message()
                break
            except ValueError as e:  # JSON di uno strumento illeggibile: si ripete la chiamata (al massimo 2 volte)
                json_retries += 1
                if json_retries > 2:
                    raise TransientLLMError(f"Risposta del modello illeggibile: {e}") from e
            except TRANSIENT as e:
                raise TransientLLMError(f"{type(e).__name__}: {e}") from e
            except FATAL as e:
                raise FatalLLMError(f"{type(e).__name__}: {e}") from e
            except anthropic.APIStatusError as e:
                if e.status_code >= 500 or e.status_code == 429:
                    raise TransientLLMError(f"{type(e).__name__}: {e}") from e
                raise FatalLLMError(f"{type(e).__name__}: {e}") from e
        blocks = [_dump(b) for b in resp.content]
        sd = getattr(resp, "stop_details", None)
        usage = _usage(resp, model)
        return LLMResponse(
            content=list(resp.content), blocks=blocks, stop_reason=resp.stop_reason, usage=usage,
            model=getattr(resp, "model", model), request_id=getattr(resp, "_request_id", None),
            stop_details=_dump(sd) if sd is not None else None,
            fallback_used=any(b.get("type") == "fallback" for b in blocks)
            or any(getattr(it, "type", "") == "fallback_message" for it in (getattr(resp.usage, "iterations", None) or [])),
        )
