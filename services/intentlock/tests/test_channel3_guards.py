"""Guard rails on live Channel3 calls: daily credit budget, retry, circuit breaker, response checks."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import httpx
import pytest
import respx

from app import channel3
from app.channel3 import _BASE_URL, Channel3Unavailable, _cache_key, get_product, search

P = {"id": "p1", "title": "Cable", "offers": []}


class MemDB:
    def __init__(self):
        self.rows = {}

    def get(self, model, key):
        return self.rows.get(key)

    def add(self, row):
        self.rows[row.key] = row

    def commit(self):
        pass

    def close(self):
        pass


@pytest.fixture(autouse=True)
def key(monkeypatch):
    monkeypatch.setattr("app.channel3.settings", MagicMock(require=lambda _: "test-api-key"))


@pytest.fixture()
def memdb():
    return MemDB()


@respx.mock
def test_retry_once_on_503_then_success(memdb):
    route = respx.get(f"{_BASE_URL}/v1/products/p1").mock(
        side_effect=[httpx.Response(503), httpx.Response(200, json=P)])
    assert get_product("p1", db=memdb)["id"] == "p1"
    assert route.call_count == 2


@respx.mock
def test_circuit_opens_after_repeated_failures_and_fails_fast(memdb):
    route = respx.get(f"{_BASE_URL}/v1/products/p1").mock(return_value=httpx.Response(500))
    for _ in range(channel3.BREAKER_FAILURES):
        with pytest.raises(Channel3Unavailable) as e:
            get_product("p1", db=memdb)
        assert e.value.reason == "failed"
    calls = route.call_count
    with pytest.raises(Channel3Unavailable) as e:
        get_product("p1", db=memdb)
    assert e.value.reason == "circuit_open" and route.call_count == calls  # no call spent


@respx.mock
def test_404_is_an_answer_not_an_outage(memdb):
    respx.get(f"{_BASE_URL}/v1/products/gone").mock(return_value=httpx.Response(404))
    for _ in range(channel3.BREAKER_FAILURES + 1):
        with pytest.raises(httpx.HTTPStatusError):
            get_product("gone", db=memdb)


@respx.mock
def test_response_for_another_product_is_rejected(memdb):
    respx.get(f"{_BASE_URL}/v1/products/p1").mock(return_value=httpx.Response(200, json={**P, "id": "p999"}))
    with pytest.raises(Channel3Unavailable) as e:
        get_product("p1", db=memdb)
    assert e.value.reason == "bad_response"
    assert memdb.get(None, _cache_key("get_product", "p1")) is None  # never cached


@respx.mock
def test_oversized_or_non_object_response_is_rejected(memdb):
    respx.get(f"{_BASE_URL}/v1/products/p1").mock(
        return_value=httpx.Response(200, content=b"[" + b"1," * 1_100_000 + b"1]"))
    with pytest.raises(Channel3Unavailable) as e:
        get_product("p1", db=memdb)
    assert e.value.reason == "bad_response"


def test_bad_inputs_never_reach_channel3(memdb):
    for bad in ("../search", "p1/../../x", "", "a" * 65, "p 1"):
        with pytest.raises(ValueError):
            get_product(bad, db=memdb)
    with pytest.raises(Channel3Unavailable):
        search("x" * 500, db=memdb)
    with pytest.raises(Channel3Unavailable):
        search("   ", db=memdb)


@respx.mock
def test_price_checks_reuse_a_copy_for_two_minutes(memdb):
    route = respx.get(f"{_BASE_URL}/v1/products/p1").mock(return_value=httpx.Response(200, json=P))
    get_product("p1", db=memdb, fresh=True)
    get_product("p1", db=memdb, fresh=True)
    assert route.call_count == 1
    memdb.rows[_cache_key("get_product", "p1")].fetched_at = datetime.now(timezone.utc) - timedelta(minutes=3)
    get_product("p1", db=memdb, fresh=True)
    assert route.call_count == 2
    get_product("p1", db=memdb)  # browsing accepts the 24 h cache
    assert route.call_count == 2


@respx.mock
def test_search_serves_an_older_answer_when_channel3_is_unavailable(memdb):
    k = _cache_key("search", "cable", 5, {})
    memdb.rows[k] = SimpleNamespace(key=k, payload={"products": [P]},
                                 fetched_at=datetime.now(timezone.utc) - timedelta(days=3))
    respx.post(f"{_BASE_URL}/v1/search").mock(return_value=httpx.Response(503))
    assert search("cable", limit=5, db=memdb)["products"] == [P]


@respx.mock
def test_price_checks_never_use_an_old_copy_on_failure(memdb):
    k = _cache_key("get_product", "p1")
    memdb.rows[k] = SimpleNamespace(key=k, payload=P, fetched_at=datetime.now(timezone.utc) - timedelta(hours=3))
    respx.get(f"{_BASE_URL}/v1/products/p1").mock(return_value=httpx.Response(503))
    with pytest.raises(Channel3Unavailable):
        get_product("p1", db=memdb, fresh=True)


def test_daily_budget_keeps_a_reserve_for_purchase_checks(monkeypatch, db):
    """Real counter in Postgres (the test transaction): searches stop at 80% of the limit, price checks go on
    to 100%."""
    pg = db
    monkeypatch.setenv("CHANNEL3_DAILY_LIMIT", "5")
    assert [_SPEND("search", db=pg) for _ in range(4)] == [1, 2, 3, 4]
    with pytest.raises(Channel3Unavailable) as e:
        _SPEND("search", db=pg)  # 5 > 4.0 (80% of 5)
    assert e.value.reason == "budget"
    assert _SPEND("product", db=pg) == 5  # the refused search wasn't counted: purchase checks keep the reserve
    with pytest.raises(Channel3Unavailable):
        _SPEND("product", db=pg)  # 6 > 5


_SPEND = channel3.spend_credit  # captured at import, before the autouse fixture swaps it for an in-memory count
