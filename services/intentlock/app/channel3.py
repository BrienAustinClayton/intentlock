"""Channel3 product-catalog client with Postgres cache.

Every live call is logged at INFO level with the marker ``channel3.live_call``
so judges can confirm real API usage.

Cache key = sha256(method + ":" + canonical-args including filters).
TTL = 24 h.  Set ``CHANNEL3_FORCE_LIVE=1`` to bypass the cache.

Note: uses httpx directly (no Channel3 SDK available at the time of writing).
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_engine
from app.models import CatalogCache

log = logging.getLogger(__name__)

_BASE_URL = "https://api.trychannel3.com"
_TTL = timedelta(hours=24)


# ---------------------------------------------------------------------------
# internal helpers
# ---------------------------------------------------------------------------

def _cache_key(method: str, *args: Any) -> str:
    raw = method + ":" + json.dumps(args, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode()).hexdigest()


def _row_age(fetched_at: datetime) -> timedelta:
    """Return age of a cache row, handling both naive and timezone-aware datetimes."""
    now = datetime.now(timezone.utc)
    if fetched_at.tzinfo is not None:
        # Aware datetime: convert to UTC correctly.
        return now - fetched_at.astimezone(timezone.utc)
    else:
        # Naive datetime: assume UTC.
        return now - fetched_at.replace(tzinfo=timezone.utc)


def _get_cached(db: Session, key: str) -> dict[str, Any] | None:
    """Return cached payload if it exists and is younger than TTL."""
    force_live = os.environ.get("CHANNEL3_FORCE_LIVE", "0") == "1"
    if force_live:
        return None
    row: CatalogCache | None = db.get(CatalogCache, key)
    if row is None:
        return None
    if _row_age(row.fetched_at) > _TTL:
        return None
    return row.payload  # type: ignore[return-value]


def _set_cached(db: Session, key: str, payload: dict[str, Any]) -> None:
    row = db.get(CatalogCache, key)
    if row is None:
        row = CatalogCache(key=key, payload=payload, fetched_at=datetime.now(timezone.utc))
        db.add(row)
    else:
        row.payload = payload
        row.fetched_at = datetime.now(timezone.utc)
    db.commit()


class Channel3Unavailable(Exception):
    """Channel3 can't be used right now: daily credit budget reached, circuit open, or the call failed."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason  # "budget" | "circuit_open" | "failed" | "bad_response" | "invalid_input"


# --------------------------------------------------------------------------- guard rails
# Credits are finite (hackathon grant), so every live call goes through _live():
#   - daily budget kept in Postgres (CHANNEL3_DAILY_LIMIT, default 300 for the API); browsing (search)
#     stops at BROWSE_SHARE of it so purchase price checks always have reserve,
#   - one retry on 429/5xx/timeouts (honours Retry-After up to 5 s),
#   - circuit breaker: after BREAKER_FAILURES straight failures, fail fast for BREAKER_COOLDOWN_S,
#   - 15 s timeout and a response-size cap; responses are checked before use or caching.
DEFAULT_DAILY_LIMIT = 300
BROWSE_SHARE = 0.8
TIMEOUT_S = 15
MAX_RESPONSE_BYTES = 2_000_000
BREAKER_FAILURES = 5
BREAKER_COOLDOWN_S = 60
MAX_QUERY_CHARS = 200
_PRODUCT_ID = re.compile(r"[A-Za-z0-9_-]{1,64}")

_lock = threading.Lock()
_breaker = {"failures": 0, "open_until": 0.0}
_sleep = time.sleep  # retry backoff (tests replace it)


def daily_limit() -> int:
    try:
        v = int(os.environ.get("CHANNEL3_DAILY_LIMIT", DEFAULT_DAILY_LIMIT))
    except ValueError:
        v = DEFAULT_DAILY_LIMIT
    return max(v, 0)


def spend_credit(kind: str, db: Session | None = None) -> int:
    """Count one live call for today (UTC) and enforce the budget. Returns today's count.
    Uses its own short session (committed at once) unless one is passed in."""
    from sqlalchemy import text

    own = db is None
    db = db or _make_db()
    try:
        cap = daily_limit() * (BROWSE_SHARE if kind == "search" else 1.0)
        # Count the call only if it fits (atomic, so concurrent callers can't overshoot); refused calls cost nothing.
        n = db.execute(text(
            "INSERT INTO channel3_usage AS u (day, calls) VALUES (:d, 1) "
            "ON CONFLICT (day) DO UPDATE SET calls = u.calls + 1 WHERE u.calls + 1 <= :cap RETURNING calls"
        ), {"d": datetime.now(timezone.utc).date(), "cap": cap}).scalar_one_or_none()
        db.commit()
    finally:
        if own:
            db.close()
    if n is None or n > cap:
        log.warning("channel3.budget_reached kind=%s limit=%d", kind, daily_limit())
        raise Channel3Unavailable("budget")
    return n


def _breaker_check() -> None:
    with _lock:
        if _breaker["open_until"] > time.monotonic():
            raise Channel3Unavailable("circuit_open")


def _breaker_record(ok: bool) -> None:
    with _lock:
        if ok:
            _breaker["failures"] = 0
            return
        _breaker["failures"] += 1
        if _breaker["failures"] >= BREAKER_FAILURES:
            _breaker["open_until"] = time.monotonic() + BREAKER_COOLDOWN_S
            _breaker["failures"] = 0
            log.warning("channel3.circuit_open cooldown_s=%d", BREAKER_COOLDOWN_S)


def reset_guards() -> None:  # tests
    with _lock:
        _breaker.update(failures=0, open_until=0.0)


def _retry_after(resp: httpx.Response) -> float:
    try:
        return min(max(float(resp.headers.get("retry-after", "1")), 0.0), 5.0)
    except ValueError:
        return 1.0


def _live(kind: str, method: str, url: str, **kw: Any) -> dict[str, Any]:
    """One guarded live call to Channel3. Never logs the API key."""
    _breaker_check()
    spend_credit(kind)
    last: Exception | None = None
    for attempt in range(2):
        try:
            resp = httpx.request(method, url, headers=_headers(), timeout=TIMEOUT_S, **kw)
        except httpx.HTTPError as e:
            last = e
            if attempt == 0:
                _sleep(0.5)
                continue
            break
        if resp.status_code == 429 or resp.status_code >= 500:
            last = httpx.HTTPStatusError(f"HTTP {resp.status_code}", request=resp.request, response=resp)
            if attempt == 0:
                _sleep(_retry_after(resp))
                continue
            break
        if len(resp.content) > MAX_RESPONSE_BYTES:
            _breaker_record(False)
            raise Channel3Unavailable("bad_response")
        if resp.status_code >= 400:  # 404 etc.: a real answer, not an outage
            _breaker_record(True)
            resp.raise_for_status()
        try:
            data = resp.json()
        except ValueError:
            _breaker_record(False)
            raise Channel3Unavailable("bad_response") from None
        if not isinstance(data, dict):
            _breaker_record(False)
            raise Channel3Unavailable("bad_response")
        _breaker_record(True)
        return data
    _breaker_record(False)
    log.warning("channel3.call_failed kind=%s error=%s", kind, type(last).__name__)
    raise Channel3Unavailable("failed")


def _headers() -> dict[str, str]:
    return {
        "x-api-key": settings.require("CHANNEL3_API_KEY"),
        "Content-Type": "application/json",
    }


def _make_db() -> Session:
    from sqlalchemy.orm import sessionmaker
    factory = sessionmaker(autocommit=False, autoflush=False, bind=get_engine())
    return factory()


# ---------------------------------------------------------------------------
# public API
# ---------------------------------------------------------------------------

def _get_any_age(db: Session, key: str) -> dict[str, Any] | None:
    row = db.get(CatalogCache, key)
    return row.payload if row is not None else None  # type: ignore[return-value]


def search(
    query: str,
    limit: int = 20,
    filters: dict[str, Any] | None = None,
    db: Session | None = None,
) -> dict[str, Any]:
    """Search Channel3 for products matching *query*.

    Optional *filters* are passed through to the Channel3 API unchanged
    (e.g. ``{"category_ids": ["gift-giving"]}``).

    Returns the raw Channel3 response dict ``{"products": [...]}``. Results are cached in ``catalog_cache``
    for 24 h; when Channel3 can't be used (budget, outage) an older cached answer is served if there is one.
    """
    query = " ".join(str(query or "").split())
    if not query or len(query) > MAX_QUERY_CHARS:
        raise Channel3Unavailable("invalid_input")
    limit = min(max(int(limit), 1), 50)
    key = _cache_key("search", query, limit, filters or {})
    _own_db = db is None
    if _own_db:
        db = _make_db()
    try:
        cached = _get_cached(db, key)
        if cached is not None:
            return cached

        log.info("channel3.live_call method=search query=%r limit=%d filters=%r",
                 query, limit, filters)
        body: dict[str, Any] = {"query": query, "limit": limit}
        if filters:
            body["filters"] = filters
        try:
            payload = _live("search", "POST", f"{_BASE_URL}/v1/search", json=body)
        except Channel3Unavailable:
            stale = _get_any_age(db, key)
            if stale is not None:
                log.info("channel3.stale_served method=search")
                return stale
            raise
        if not isinstance(payload.get("products", []), list):
            raise Channel3Unavailable("bad_response")
        _set_cached(db, key, payload)
        return payload
    finally:
        if _own_db:
            db.close()


PRICE_CHECK_MAX_AGE = timedelta(minutes=2)  # the cart check and the checkout seconds later share one call


def get_product(product_id: str, db: Session | None = None, fresh: bool = False) -> dict[str, Any]:
    """Fetch a single product by Channel3 ID.

    Returns the raw product dict. Cached for 24 h; ``fresh`` (price and stock checks before buying) only
    accepts a copy younger than PRICE_CHECK_MAX_AGE, and never falls back to an older one.
    """
    if not _PRODUCT_ID.fullmatch(product_id or ""):
        raise ValueError("invalid product id")
    key = _cache_key("get_product", product_id)
    _own_db = db is None
    if _own_db:
        db = _make_db()
    try:
        row = db.get(CatalogCache, key)
        max_age = PRICE_CHECK_MAX_AGE if fresh else _TTL
        if row is not None and os.environ.get("CHANNEL3_FORCE_LIVE", "0") != "1" and _row_age(row.fetched_at) <= max_age:
            return row.payload  # type: ignore[return-value]

        log.info("channel3.live_call method=get_product product_id=%r", product_id)
        payload = _live("product", "GET", f"{_BASE_URL}/v1/products/{product_id}")
        if str(payload.get("id") or payload.get("product_id") or "") != product_id:
            raise Channel3Unavailable("bad_response")  # not the product we asked for
        _set_cached(db, key, payload)
        return payload
    finally:
        if _own_db:
            db.close()
