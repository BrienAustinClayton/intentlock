"""Live PayPal Sandbox tests. Run: RUN_SANDBOX=1 uv run pytest -m sandbox -q

Needs sandbox creds in .env and a vaulted buyer (scripts/paypal_spike.py setup + token).
"""
from __future__ import annotations

import os
import sys
import uuid
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

import pytest

SERVICE_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(SERVICE_ROOT))

from app.config import settings  # noqa: E402
from app.ids import new_id  # noqa: E402
from app.paypal import client as pp_client  # noqa: E402
from app.paypal import sandbox  # noqa: E402
from app.paypal.service import PayPalError  # noqa: E402

pytestmark = [
    pytest.mark.sandbox,
    pytest.mark.skipif(os.environ.get("RUN_SANDBOX") != "1", reason="RUN_SANDBOX=1 required"),
]


@pytest.fixture()
def live(monkeypatch):
    monkeypatch.setenv("PAYPAL_MODE", "sandbox")
    pp_client.reset_client()
    if settings.PAYPAL_CLIENT_ID in (None, "", "__FILL_ME__"):
        pytest.skip("PAYPAL_CLIENT_ID missing")
    if sandbox._fallback_vault() is None:
        pytest.skip("run scripts/paypal_spike.py setup+token first")
    yield
    pp_client.reset_client()


def _order(amount="3.00"):
    total = Decimal(amount)
    first = (total / 3).quantize(Decimal("0.01"))
    second = total - first
    return SimpleNamespace(
        id=new_id("ord"),
        cart_json=[
            {"product_id": "live_a", "title": "Live test item A", "qty": 1, "unit_price": f"{first:.2f}", "currency": "USD"},
            {"product_id": "live_b", "title": "Live test item B", "qty": 1, "unit_price": f"{second:.2f}", "currency": "USD"},
        ],
        total=total.quantize(Decimal("0.01")),
        currency="USD",
        user=None,
    )


def test_live_authorize_capture(live):
    o = _order()
    _, aid = sandbox.authorize(o)
    cid = sandbox.capture(aid, request_id=f"{o.id}-capture")
    assert cid
    assert sandbox.get_authorization_status(aid) == "CAPTURED"


def test_live_authorize_void_twice(live):
    o = _order()
    _, aid = sandbox.authorize(o)
    sandbox.void(aid, request_id=f"{o.id}-void")
    sandbox.void(aid, request_id=f"{o.id}-void-again")
    assert sandbox.get_authorization_status(aid) == "VOIDED"


def test_live_authorize_idempotent(live):
    o = _order()
    a = sandbox.authorize(o)
    b = sandbox.authorize(o)
    assert a == b
    sandbox.void(a[1])


def test_live_capture_after_void_raises(live):
    o = _order()
    _, aid = sandbox.authorize(o)
    sandbox.void(aid)
    with pytest.raises(PayPalError) as ei:
        sandbox.capture(aid, request_id=f"{o.id}-cap-after-void")
    assert ei.value.code


def test_live_capture_twice_same_request_id(live):
    o = _order()
    _, aid = sandbox.authorize(o)
    rid = f"{o.id}-capture"
    assert sandbox.capture(aid, request_id=rid) == sandbox.capture(aid, request_id=rid)


def test_live_setup_token_has_approve_link(live):
    base = (settings.PUBLIC_BASE_URL or "https://example.com").rstrip("/")
    _, url = sandbox.create_setup_token(f"{base}/vault/return", f"{base}/vault/return?c=1", f"t-{uuid.uuid4().hex}")
    host = url.split("/")[2]
    assert host.endswith("paypal.com") and "sandbox" in host
