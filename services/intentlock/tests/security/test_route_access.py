"""Every route needs a user session, an agent signature or the operator key, except a short public list.

Adding a new open route fails this test until it is added to PUBLIC on purpose.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.main import app  # noqa: E402

# Public on purpose: health, sign-in, PayPal redirects, public agent keys, shop catalog, shareable proofs.
PUBLIC = {
    ("GET", "/health"),
    ("POST", "/auth/email/start"),
    ("POST", "/auth/email/verify"),
    ("POST", "/auth/google/url"),
    ("POST", "/auth/google"),
    ("GET", "/vault/return"),
    ("GET", "/paypal/return"),
    ("GET", "/.well-known/agent-keys"),
    ("GET", "/catalog"),
    ("GET", "/orders/{order_id}/proof"),
    ("POST", "/proofs/verify"),
    ("POST", "/webhooks/paypal"),
}


def _routes():
    def walk(routes, prefix=""):
        for r in routes:
            if isinstance(r, APIRoute):
                for m in r.methods - {"HEAD", "OPTIONS"}:
                    yield m, prefix + r.path
            elif hasattr(r, "original_router"):
                ctx = getattr(r, "include_context", None)
                yield from walk(r.original_router.routes, prefix + (getattr(ctx, "prefix", "") or ""))
            elif hasattr(r, "routes"):
                yield from walk(r.routes, prefix)
    return sorted(set(walk(app.routes)))


ROUTES = [r for r in _routes() if r not in PUBLIC and r[1] not in ("/openapi.json", "/docs", "/redoc",
                                                                       "/docs/oauth2-redirect")]


def test_public_list_is_current():
    assert PUBLIC <= set(_routes()), sorted(PUBLIC - set(_routes()))


@pytest.mark.parametrize("method,path", ROUTES, ids=[f"{m} {p}" for m, p in ROUTES])
def test_route_rejects_anonymous(method, path):
    url = re.sub(r"\{[^}]+\}", "x_probe", path)
    r = TestClient(app, raise_server_exceptions=False).request(method, url, json={})
    assert r.status_code in (401, 403), f"{method} {path} answered {r.status_code} without credentials"


def test_wrong_operator_key_is_rejected():
    c = TestClient(app, raise_server_exceptions=False, headers={"X-Admin-Key": "wrong-key-0123456789"})
    assert c.get("/orders").status_code == 401
    assert c.post("/mandates", json={}).status_code == 401


def test_operator_routes_closed_when_no_key_configured(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "ADMIN_API_KEY", None)
    c = TestClient(app, raise_server_exceptions=False, headers={"X-Admin-Key": ""})
    assert c.get("/orders").status_code == 401
    assert c.post("/lab/reset").status_code == 401


def test_api_schema_is_private_by_default():
    c = TestClient(app, raise_server_exceptions=False)
    assert c.get("/openapi.json").status_code == 404
    assert c.get("/docs").status_code == 404
