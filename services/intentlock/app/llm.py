"""Groq (OpenAI-compatible) client: JSON, text and prompt-injection guard.

Sync, blocking functions. Pipeline callers wrap them in ``asyncio.to_thread``.
Shared cache / usage helpers also serve ``app.jev``. Never log SDK exception
strings, headers or bodies (they can carry secrets): class names only.
"""
from __future__ import annotations

import hashlib
import json
import logging
import math
import threading
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from decimal import Decimal
from typing import Any

import openai
from openai import OpenAI
from pydantic import BaseModel, ValidationError
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import settings
from app.ids import new_id
from app.models import LLMCache, LLMUsage
from app.signing import canonical_json

log = logging.getLogger("intentlock.llm")

GROQ_BACKOFF_S: float = 0.5
GUARD_CHUNK_CHARS = 1500
GUARD_MAX_CHUNKS = 4

_client: OpenAI | None = None
_lock = threading.Lock()


class LLMUnavailable(Exception):
    """Raised when the LLM engine cannot give a usable answer."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


class _InvalidOutput(Exception):
    pass


# --------------------------------------------------------------------------- #
# Shared cache / usage / session helpers
# --------------------------------------------------------------------------- #
def cache_key(engine: str, model: str, kind: str, payload: Any) -> str:
    return hashlib.sha256(
        canonical_json({"engine": engine, "model": model, "kind": kind, "payload": payload})
    ).hexdigest()


@contextmanager
def session_scope(db: Session | None) -> Iterator[Session]:
    if db is not None:
        yield db
        return
    from app.db import _get_session_factory

    s = _get_session_factory()()
    try:
        yield s
    finally:
        s.close()


def cache_get(s: Session, key: str) -> dict | None:
    try:
        row = s.get(LLMCache, key)
        return row.response if row else None
    except SQLAlchemyError as e:
        s.rollback()
        log.warning("llm db cache_get failed: %s", type(e).__name__)
        return None


def cache_put(s: Session, key: str, profile: str, model: str, response: dict) -> None:
    try:
        s.execute(
            pg_insert(LLMCache)
            .values(key=key, profile=profile, model=model, response=response)
            .on_conflict_do_nothing(index_elements=["key"])
        )
        s.commit()
    except SQLAlchemyError as e:
        s.rollback()
        log.warning("llm db cache_put failed: %s", type(e).__name__)


def log_usage(
    s: Session,
    *,
    profile: str,
    model: str,
    step: str,
    input_tokens: int,
    output_tokens: int,
    cost_usd: Decimal,
    cached: bool,
) -> None:
    try:
        s.add(
            LLMUsage(
                id=new_id("llm"),
                profile=profile,
                model=model,
                step=step[:200],
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cost_usd=cost_usd,
                cached=cached,
            )
        )
        s.commit()
    except SQLAlchemyError as e:
        s.rollback()
        log.warning("llm db log_usage failed: %s", type(e).__name__)


# --------------------------------------------------------------------------- #
# Client
# --------------------------------------------------------------------------- #
def _missing(v: Any) -> bool:
    return not v or v == "__FILL_ME__"


def _fast_config() -> tuple[str, str, str]:
    base, key, model = (
        settings.LLM_FAST_BASE_URL,
        settings.LLM_FAST_API_KEY,
        settings.LLM_FAST_MODEL,
    )
    if _missing(base) or _missing(key) or _missing(model):
        raise LLMUnavailable("not_configured")
    return base, key, model  # type: ignore[return-value]


def _build_client(http_client: Any = None) -> OpenAI:
    base, key, _ = _fast_config()
    return OpenAI(api_key=key, base_url=base, max_retries=0, timeout=10.0, http_client=http_client)


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        with _lock:
            if _client is None:
                _client = _build_client()
    return _client


def _is_reasoning(model: str) -> bool:
    return model.startswith("openai/gpt-oss")


def _chat(**kw: Any) -> tuple[Any, int, int]:
    last: tuple[str, Exception] | None = None
    for attempt in (0, 1):
        try:
            r = _get_client().chat.completions.create(**kw)
            u = r.usage
            return r, (u.prompt_tokens if u else 0) or 0, (u.completion_tokens if u else 0) or 0
        except openai.APITimeoutError as e:
            raise LLMUnavailable("timeout") from e
        except openai.APIConnectionError as e:
            last = ("connection", e)
        except openai.RateLimitError as e:
            last = ("rate_limited", e)
        except openai.APIStatusError as e:
            if e.status_code >= 500:
                last = ("server_error", e)
            elif getattr(e, "code", None) == "json_validate_failed":
                raise _InvalidOutput() from e
            else:
                raise LLMUnavailable("bad_request") from e
        if attempt == 0:
            time.sleep(min(GROQ_BACKOFF_S, 1.0))
    assert last is not None
    log.warning("groq unavailable: %s", last[0])
    raise LLMUnavailable(last[0]) from last[1]


def _reasoning_kw(model: str) -> dict[str, Any]:
    if _is_reasoning(model):
        return {"reasoning_effort": "low", "extra_body": {"include_reasoning": False}}
    return {}


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #
def complete_json(
    system: str,
    user: str,
    schema: type[BaseModel],
    timeout_s: float = 3.0,
    step: str = "unspecified",
    *,
    check: Callable[[BaseModel], None] | None = None,
    profile: str = "fast",
    usage_step: str | None = None,
    db: Session | None = None,
) -> BaseModel:
    _, _, model = _fast_config()
    schema_json = schema.model_json_schema()
    key = cache_key("groq", model, "json", {"system": system, "user": user, "schema": schema_json})
    ustep = usage_step or step
    with session_scope(db) as s:
        hit = cache_get(s, key)
        if hit:
            try:
                obj = schema.model_validate(hit)
                if check:
                    check(obj)
            except (ValidationError, ValueError):
                pass
            else:
                log_usage(
                    s, profile=profile, model=model, step=ustep, input_tokens=0,
                    output_tokens=0, cost_usd=Decimal("0"), cached=True,
                )
                return obj

        sys_full = (
            system
            + "\n\nReply with exactly one JSON object and nothing else. It must validate against this JSON Schema:\n"
            + json.dumps(schema_json, separators=(",", ":"))
        )
        messages = [
            {"role": "system", "content": sys_full},
            {"role": "user", "content": user},
        ]
        kw: dict[str, Any] = dict(
            model=model,
            response_format={"type": "json_object"},
            temperature=0,
            max_completion_tokens=1024,
            timeout=timeout_s,
            **_reasoning_kw(model),
        )
        tin = tout = 0
        msgs = messages
        for attempt in (0, 1):
            try:
                r, pi, po = _chat(messages=msgs, **kw)
                tin += pi
                tout += po
                content = r.choices[0].message.content or ""
                obj = schema.model_validate(json.loads(content))
                if check:
                    check(obj)
            except (_InvalidOutput, json.JSONDecodeError, ValidationError, ValueError, TypeError, IndexError):
                if attempt == 0:
                    msgs = messages + [
                        {
                            "role": "user",
                            "content": "Your previous reply was not a valid JSON object for the schema. Reply again with only the JSON object.",
                        }
                    ]
                continue
            log_usage(
                s, profile=profile, model=model, step=ustep, input_tokens=tin,
                output_tokens=tout, cost_usd=Decimal("0"), cached=False,
            )
            cache_put(s, key, "fast", model, obj.model_dump(mode="json"))
            return obj
        raise LLMUnavailable("invalid_output")


def complete_text(
    system: str,
    user: str,
    timeout_s: float = 5.0,
    step: str = "graph_ask",
    *,
    max_tokens: int = 600,
    db: Session | None = None,
) -> str:
    _, _, model = _fast_config()
    key = cache_key("groq", model, "text", {"system": system, "user": user, "max_tokens": max_tokens})
    with session_scope(db) as s:
        hit = cache_get(s, key)
        if hit and isinstance(hit.get("text"), str) and hit["text"]:
            log_usage(
                s, profile="fast", model=model, step=step, input_tokens=0,
                output_tokens=0, cost_usd=Decimal("0"), cached=True,
            )
            return hit["text"]
        try:
            r, pi, po = _chat(
                model=model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                temperature=0.2,
                max_completion_tokens=max_tokens,
                timeout=timeout_s,
                **_reasoning_kw(model),
            )
            text = ((r.choices[0].message.content) or "").strip()
        except (_InvalidOutput, IndexError) as e:
            raise LLMUnavailable("invalid_output") from e
        if not text:
            raise LLMUnavailable("invalid_output")
        log_usage(
            s, profile="fast", model=model, step=step, input_tokens=pi,
            output_tokens=po, cost_usd=Decimal("0"), cached=False,
        )
        cache_put(s, key, "fast", model, {"text": text})
        return text


def guard_score(
    text: str,
    timeout_s: float = 2.0,
    step: str = "scan_injection",
    *,
    db: Session | None = None,
) -> float:
    if not text or not text.strip():
        return 0.0
    _, _, fast_model = _fast_config()
    guard_model = settings.LLM_GUARD_MODEL
    if _missing(guard_model):
        raise LLMUnavailable("not_configured")
    key = cache_key("groq", guard_model, "guard", {"text": text})
    with session_scope(db) as s:
        hit = cache_get(s, key)
        if hit and isinstance(hit.get("score"), (int, float)) and 0 <= hit["score"] <= 1:
            log_usage(
                s, profile="fast", model=guard_model, step=step, input_tokens=0,
                output_tokens=0, cost_usd=Decimal("0"), cached=True,
            )
            return float(hit["score"])
        chunks = [
            text[i : i + GUARD_CHUNK_CHARS] for i in range(0, len(text), GUARD_CHUNK_CHARS)
        ][:GUARD_MAX_CHUNKS]
        values: list[float] = []
        tin = tout = 0
        for chunk in chunks:
            try:
                r, pi, po = _chat(
                    model=guard_model,
                    messages=[{"role": "user", "content": chunk}],
                    temperature=0,
                    timeout=timeout_s,
                )
                v = float((r.choices[0].message.content or "").strip())
            except (_InvalidOutput, ValueError, TypeError, IndexError) as e:
                raise LLMUnavailable("invalid_output") from e
            if not math.isfinite(v) or v < 0 or v > 1:
                raise LLMUnavailable("invalid_output")
            values.append(v)
            tin += pi
            tout += po
        result = max(values)
        log_usage(
            s, profile="fast", model=guard_model, step=step, input_tokens=tin,
            output_tokens=tout, cost_usd=Decimal("0"), cached=False,
        )
        cache_put(s, key, "fast", guard_model, {"score": result})
        return result
