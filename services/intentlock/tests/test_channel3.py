"""Tests for app/channel3.py and GET /catalog.

Fixtures are defined inline (no conftest.py — that file is owned by P1-T12).
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock

import httpx
import pytest
import respx

from app.channel3 import _cache_key, _BASE_URL, _row_age, _TTL


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_product(pid: str = "prod_abc") -> dict[str, Any]:
    return {
        "id": pid,
        "title": "Test Product",
        "description": "A test product.",
        "brands": [],
        "images": [{"url": "https://example.com/img.jpg"}],
        "category": {"slug": "usb-cables", "title": "USB Cables", "path": [
            {"slug": "electronics"}, {"slug": "electronics-accessories"},
            {"slug": "cables"}, {"slug": "usb-cables"},
        ]},
        "key_features": ["feature one"],
        "offers": [
            {
                "url": "https://buy.example.com/test",
                "domain": "example.com",
                "price": {"price": 19.99, "compare_at_price": None, "currency": "USD"},
                "availability": "InStock",
                "condition": "new",
            }
        ],
        "variants": None,
    }


def _make_search_response(products: list[dict[str, Any]]) -> dict[str, Any]:
    return {"products": products}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def fake_db():
    """An in-memory fake Session that mimics get / add / commit for CatalogCache."""
    store: dict[str, Any] = {}

    class FakeRow:
        def __init__(self, key: str, payload: Any, fetched_at: datetime):
            self.key = key
            self.payload = payload
            self.fetched_at = fetched_at

    class FakeDB:
        _FakeRow = FakeRow

        def get(self, model, key):  # noqa: ANN001
            return store.get(key)

        def add(self, obj):  # noqa: ANN001
            store[obj.key] = obj

        def commit(self):
            pass

        def close(self):
            pass

        _store = store

    return FakeDB()


@pytest.fixture()
def patch_settings_key(monkeypatch: pytest.MonkeyPatch):
    """Patch settings.require so it returns a dummy API key."""
    monkeypatch.setattr(
        "app.channel3.settings",
        MagicMock(require=lambda _: "test-api-key"),
    )


# ---------------------------------------------------------------------------
# Tests — _row_age (TTL timezone handling)
# ---------------------------------------------------------------------------

class TestRowAge:
    def test_naive_datetime_treated_as_utc(self) -> None:
        """A naive fetched_at should be treated as UTC."""
        naive = datetime(2000, 1, 1, 0, 0, 0)  # naive, implicitly UTC
        age = _row_age(naive)
        # Should be many years old, not a negative or tiny duration
        assert age > timedelta(days=365 * 20)

    def test_aware_utc_datetime_is_young(self) -> None:
        """An aware UTC datetime 1 second ago should be ~1 s old."""
        recent = datetime.now(timezone.utc) - timedelta(seconds=1)
        age = _row_age(recent)
        assert timedelta(0) < age < timedelta(seconds=5)

    def test_aware_non_utc_datetime_expiry(self) -> None:
        """An aware non-UTC datetime past the TTL should register as expired.

        This was the bug: using .replace(tzinfo=utc) on an IST (+5:30) datetime
        would make it appear 5.5 hours younger than it really is.
        """
        import datetime as dt
        # Simulate a timestamp stored in IST (UTC+5:30)
        ist = dt.timezone(dt.timedelta(hours=5, minutes=30))
        # Set it to 25 h ago in IST terms (so it is definitely expired)
        old_ist = datetime.now(ist) - timedelta(hours=25)

        age = _row_age(old_ist)
        assert age > _TTL, (
            f"age={age} should exceed TTL={_TTL}; "
            "replace(tzinfo=utc) on an aware IST datetime would give a wrong (smaller) age"
        )


# ---------------------------------------------------------------------------
# Tests — search()
# ---------------------------------------------------------------------------

class TestSearch:
    @respx.mock
    def test_live_call_stores_in_cache(
        self,
        fake_db: Any,
        patch_settings_key: None,
    ) -> None:
        """A cold cache triggers a live HTTP call and stores the result."""
        product = _make_product("p1")
        route = respx.post(f"{_BASE_URL}/v1/search").mock(
            return_value=httpx.Response(200, json=_make_search_response([product]))
        )

        from app.channel3 import search
        result = search("milk", limit=2, db=fake_db)

        assert route.called, "Expected a live HTTP call"
        assert result["products"][0]["id"] == "p1"

        key = _cache_key("search", "milk", 2, {})
        assert fake_db.get(None, key) is not None, "Result not cached"

    @respx.mock
    def test_cache_hit_skips_live_call(
        self,
        fake_db: Any,
        patch_settings_key: None,
    ) -> None:
        """A warm cache returns the stored payload without calling Channel3."""
        route = respx.post(f"{_BASE_URL}/v1/search").mock(
            return_value=httpx.Response(200, json=_make_search_response([_make_product("p2")]))
        )

        from app.channel3 import search

        # Pre-populate the cache directly
        key = _cache_key("search", "eggs", 3, {})
        cached_payload = _make_search_response([_make_product("p_cached")])

        class FakeRow:
            def __init__(self):
                self.key = key
                self.payload = cached_payload
                self.fetched_at = datetime.now(timezone.utc)

        fake_db._store[key] = FakeRow()

        result = search("eggs", limit=3, db=fake_db)

        assert not route.called, "Should NOT call Channel3 on a cache hit"
        assert result["products"][0]["id"] == "p_cached"

    @respx.mock
    def test_search_twice_calls_api_once(
        self,
        fake_db: Any,
        patch_settings_key: None,
    ) -> None:
        """Calling search() twice with the same args should only hit the API once."""
        product = _make_product("p_double")
        route = respx.post(f"{_BASE_URL}/v1/search").mock(
            return_value=httpx.Response(200, json=_make_search_response([product]))
        )

        from app.channel3 import search

        search("coffee", limit=5, db=fake_db)
        search("coffee", limit=5, db=fake_db)

        assert route.call_count == 1, (
            f"Expected 1 live call, got {route.call_count}; second call should use cache"
        )

    @respx.mock
    def test_force_live_bypasses_cache(
        self,
        fake_db: Any,
        patch_settings_key: None,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """CHANNEL3_FORCE_LIVE=1 forces a live call even when cached."""
        monkeypatch.setenv("CHANNEL3_FORCE_LIVE", "1")

        product = _make_product("p3")
        route = respx.post(f"{_BASE_URL}/v1/search").mock(
            return_value=httpx.Response(200, json=_make_search_response([product]))
        )

        from app.channel3 import search

        # Pre-populate cache
        key = _cache_key("search", "bread", 5, {})

        class FakeRow:
            def __init__(self):
                self.key = key
                self.payload = _make_search_response([_make_product("p_old")])
                self.fetched_at = datetime.now(timezone.utc)

        fake_db._store[key] = FakeRow()

        result = search("bread", limit=5, db=fake_db)

        assert route.called, "CHANNEL3_FORCE_LIVE=1 should trigger a live call"
        assert result["products"][0]["id"] == "p3"

    @respx.mock
    def test_expired_ttl_triggers_new_call(
        self,
        fake_db: Any,
        patch_settings_key: None,
    ) -> None:
        """An expired cache entry (> 24 h old) should trigger a fresh live call."""
        import datetime as dt
        ist = dt.timezone(dt.timedelta(hours=5, minutes=30))
        # Simulate a cached entry from 25 hours ago stored with IST timezone
        old_ist = datetime.now(ist) - timedelta(hours=25)

        fresh_product = _make_product("p_fresh")
        route = respx.post(f"{_BASE_URL}/v1/search").mock(
            return_value=httpx.Response(200, json=_make_search_response([fresh_product]))
        )

        from app.channel3 import search

        key = _cache_key("search", "expired_query", 4, {})

        class FakeRow:
            def __init__(self):
                self.key = key
                self.payload = _make_search_response([_make_product("p_stale")])
                self.fetched_at = old_ist

        fake_db._store[key] = FakeRow()

        result = search("expired_query", limit=4, db=fake_db)

        assert route.called, "Expired cache should trigger a live call"
        assert result["products"][0]["id"] == "p_fresh"


# ---------------------------------------------------------------------------
# Tests — get_product()
# ---------------------------------------------------------------------------

class TestGetProduct:
    @respx.mock
    def test_live_call_stores_in_cache(
        self,
        fake_db: Any,
        patch_settings_key: None,
    ) -> None:
        product = _make_product("prod_xyz")
        route = respx.get(f"{_BASE_URL}/v1/products/prod_xyz").mock(
            return_value=httpx.Response(200, json=product)
        )

        from app.channel3 import get_product
        result = get_product("prod_xyz", db=fake_db)

        assert route.called
        assert result["id"] == "prod_xyz"

        key = _cache_key("get_product", "prod_xyz")
        assert fake_db.get(None, key) is not None

    @respx.mock
    def test_cache_hit_skips_live_call(
        self,
        fake_db: Any,
        patch_settings_key: None,
    ) -> None:
        route = respx.get(f"{_BASE_URL}/v1/products/prod_cached").mock(
            return_value=httpx.Response(200, json=_make_product("prod_cached"))
        )

        from app.channel3 import get_product

        key = _cache_key("get_product", "prod_cached")
        cached = _make_product("prod_cached")

        class FakeRow:
            def __init__(self):
                self.key = key
                self.payload = cached
                self.fetched_at = datetime.now(timezone.utc)

        fake_db._store[key] = FakeRow()

        result = get_product("prod_cached", db=fake_db)

        assert not route.called, "Cache hit should skip live call"
        assert result["id"] == "prod_cached"


# ---------------------------------------------------------------------------
# Tests — GET /catalog endpoint
# ---------------------------------------------------------------------------

class TestCatalogEndpointMocked:
    """Tests using a small in-memory catalog injected via monkeypatch."""

    @pytest.fixture()
    def client(self, tmp_path: Any, monkeypatch: pytest.MonkeyPatch):
        from fastapi.testclient import TestClient
        from app.main import app
        import app.api.catalog as catalog_mod

        catalog_data = [
            {
                "product_id": "p_fresh_1",
                "merchant": "freshmart",
                "category": "groceries",
                "title": "Organic Milk",
                "description": "Fresh organic milk",
                "key_features": [],
                "price": 3.99,
                "currency": "USD",
                "image_url": "",
                "variants": [],
                "offers": [{"merchant": "freshmart", "price": 3.99}],
            },
            {
                "product_id": "p_gadget_1",
                "merchant": "gadgethub",
                "category": "electronics_accessories",
                "title": "USB-C Cable",
                "description": "Fast charging cable",
                "key_features": [],
                "price": 12.99,
                "currency": "USD",
                "image_url": "",
                "variants": [{"name": "Size", "label": "1 m", "product_id": "p_gadget_1a"}],
                "offers": [{"merchant": "gadgethub", "price": 12.99}],
            },
            {
                "product_id": "p_deal_1",
                "merchant": "dealsdaily",
                "category": "gift_cards",
                "title": "Activity Gift Card",
                "description": "Digital gift card",
                "key_features": [],
                "price": 50.0,
                "currency": "USD",
                "image_url": "",
                "variants": [],
                "offers": [{"merchant": "dealsdaily", "price": 50.0}],
            },
        ]

        catalog_file = tmp_path / "catalog.json"
        catalog_file.write_text(json.dumps(catalog_data))

        monkeypatch.setattr(catalog_mod, "_CATALOG_PATH", catalog_file)
        catalog_mod._load_catalog.cache_clear()

        return TestClient(app)

    def test_returns_all_products(self, client: Any) -> None:
        resp = client.get("/catalog")
        assert resp.status_code == 200
        assert len(resp.json()) == 3

    def test_filter_by_merchant(self, client: Any) -> None:
        resp = client.get("/catalog?merchant=freshmart")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["merchant"] == "freshmart"

    def test_filter_by_category(self, client: Any) -> None:
        resp = client.get("/catalog?category=gift_cards")
        assert resp.status_code == 200
        data = resp.json()
        assert all(p["category"] == "gift_cards" for p in data)

    def test_text_search(self, client: Any) -> None:
        resp = client.get("/catalog?q=usb")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert "USB" in data[0]["title"]

    def test_no_results(self, client: Any) -> None:
        resp = client.get("/catalog?merchant=unknown_merchant")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_missing_catalog_raises(
        self, tmp_path: Any, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A missing catalog.json must raise RuntimeError, not return []."""
        from fastapi.testclient import TestClient
        from app.main import app
        import app.api.catalog as catalog_mod

        missing = tmp_path / "missing" / "catalog.json"
        monkeypatch.setattr(catalog_mod, "_CATALOG_PATH", missing)
        catalog_mod._load_catalog.cache_clear()

        with pytest.raises(RuntimeError, match="catalog.json not found"):
            catalog_mod._load_catalog()


class TestCatalogEndpointReal:
    """Integration test loading the REAL data/seed/catalog.json."""

    @pytest.fixture()
    def client(self, monkeypatch: pytest.MonkeyPatch):
        from fastapi.testclient import TestClient
        from app.main import app
        import app.api.catalog as catalog_mod

        # Clear any cached data so it loads from the real file
        catalog_mod._load_catalog.cache_clear()
        # Restore real path (in case another test monkeypatched it)
        monkeypatch.setattr(catalog_mod, "_CATALOG_PATH", catalog_mod._REPO_ROOT / "data" / "seed" / "catalog.json")

        return TestClient(app)

    def test_at_least_140_products(self, client: Any) -> None:
        resp = client.get("/catalog")
        assert resp.status_code == 200
        assert len(resp.json()) >= 140, f"Expected ≥140 products, got {len(resp.json())}"

    def test_all_three_merchants(self, client: Any) -> None:
        resp = client.get("/catalog")
        merchants = {p["merchant"] for p in resp.json()}
        assert "freshmart" in merchants
        assert "gadgethub" in merchants
        assert "dealsdaily" in merchants

    def test_all_three_categories(self, client: Any) -> None:
        resp = client.get("/catalog")
        categories = {p["category"] for p in resp.json()}
        assert "groceries" in categories
        assert "electronics_accessories" in categories
        assert "gift_cards" in categories

    def test_filter_by_merchant_freshmart(self, client: Any) -> None:
        resp = client.get("/catalog?merchant=freshmart")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) > 0
        assert all(p["merchant"] == "freshmart" for p in data)

    def test_filter_by_category_groceries(self, client: Any) -> None:
        resp = client.get("/catalog?category=groceries")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) > 0
        assert all(p["category"] == "groceries" for p in data)

    def test_text_search_cable(self, client: Any) -> None:
        resp = client.get("/catalog?q=cable")
        assert resp.status_code == 200
        assert len(resp.json()) > 0

    def test_cable_has_length_variants(self, client: Any) -> None:
        """The Staples USB-C cable must be present with 1 m and 2 m variants."""
        resp = client.get("/catalog")
        products = resp.json()
        cable = next((p for p in products if p["product_id"] == "KW9jmp4"), None)
        assert cable is not None, "Staples USB-C cable (KW9jmp4) not found in catalog"
        variant_labels = [v["label"] for v in cable.get("variants", [])]
        assert "1 m" in variant_labels, f"Expected '1 m' variant, got {variant_labels}"
        assert "2 m" in variant_labels, f"Expected '2 m' variant, got {variant_labels}"

    def test_all_products_have_at_least_one_offer(self, client: Any) -> None:
        resp = client.get("/catalog")
        no_offers = [p["product_id"] for p in resp.json() if not p.get("offers")]
        assert no_offers == [], f"Products with no offers: {no_offers}"
