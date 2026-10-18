"""Mocked-HTTP tests for the PayPal sandbox service + vault endpoints (P1-T02/P1-T09).

The SDK sends HTTP through `requests`, so `responses` is the mock. No network, no creds.
"""
from __future__ import annotations

import asyncio
import json
import logging
import sys
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlsplit

import pytest
import requests
import responses

SERVICE_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVICE_ROOT))

from app.api import vault as vault_api  # noqa: E402
from app.config import settings  # noqa: E402
from app.ids import new_id  # noqa: E402
from app.models import User  # noqa: E402
from app.paypal import client as pp_client  # noqa: E402
from app.paypal import sandbox, service  # noqa: E402
from app.paypal.service import PayPalError  # noqa: E402
from app.pipeline import limits, runner  # noqa: E402

BASE = "https://api-m.sandbox.paypal.com"
OID = "ord_01TESTORDER0000000000000000"
ORDER_COMPLETED = {
    "id": "PPO1",
    "status": "COMPLETED",
    "purchase_units": [{"payments": {"authorizations": [{"id": "AUTH1", "status": "CREATED"}]}}],
}


@pytest.fixture()
def pp(monkeypatch, tmp_path):
    monkeypatch.setenv("PAYPAL_MODE", "sandbox")
    monkeypatch.setattr(settings, "PAYPAL_CLIENT_ID", "test-client-id")
    monkeypatch.setattr(settings, "PAYPAL_CLIENT_SECRET", "test-client-secret")
    monkeypatch.setattr(settings, "PAYPAL_ENV", "sandbox")
    monkeypatch.delenv("PAYPAL_SANDBOX_VAULT_ID", raising=False)
    monkeypatch.setattr(sandbox, "SPIKE_TOKEN_PATH", tmp_path / "none")
    pp_client.reset_client()
    with responses.RequestsMock(assert_all_requests_are_fired=False) as rsps:
        rsps.add(
            responses.POST,
            f"{BASE}/v1/oauth2/token",
            json={"access_token": "A21-test-access-token", "token_type": "Bearer", "expires_in": 32400},
        )
        yield rsps
    pp_client.reset_client()


def order(**kw):
    base = dict(
        id=OID,
        cart_json=[
            {"product_id": "p_milk", "title": "Whole Milk 1L", "qty": 1, "unit_price": "3.50", "currency": "USD"},
            {"product_id": "p_bread", "title": "Bread", "qty": 2, "unit_price": "2.00", "currency": "USD"},
        ],
        total=Decimal("7.50"),
        currency="USD",
        user=SimpleNamespace(paypal_payment_token="8kk8451t"),
    )
    base.update(kw)
    return SimpleNamespace(**base)


def api_calls(rsps):
    return [c for c in rsps.calls if "/oauth2/token" not in c.request.url]


def body(call):
    return json.loads(call.request.body)


def add(rsps, method, path, status=200, payload=None):
    rsps.add(method, f"{BASE}{path}", json=payload if payload is not None else {}, status=status)


def err422(issue, name="UNPROCESSABLE_ENTITY", debug="d1"):
    return {"name": name, "debug_id": debug, "details": [{"issue": issue, "description": "x"}]}


# ---------------------------------------------------------------- authorize / capture / void

def test_authorize_single_step_itemised(pp):
    add(pp, responses.POST, "/v2/checkout/orders", 201, ORDER_COMPLETED)
    o = order()
    assert service.authorize(o) == ("PPO1", "AUTH1")
    calls = api_calls(pp)
    assert len(calls) == 1
    b = body(calls[0])
    assert b["intent"] == "AUTHORIZE"
    ps = b["payment_source"]["paypal"]
    assert ps["vault_id"] == "8kk8451t"
    assert ps["stored_credential"] == {
        "payment_initiator": "MERCHANT", "usage_pattern": "IMMEDIATE", "usage": "SUBSEQUENT",
    }
    pu = b["purchase_units"][0]
    items = pu["items"]
    assert [i["name"] for i in items] == ["Whole Milk 1L", "Bread"]
    assert [i["quantity"] for i in items] == ["1", "2"]
    assert [i["unit_amount"]["value"] for i in items] == ["3.50", "2.00"]
    assert [i["sku"] for i in items] == ["p_milk", "p_bread"]
    assert all(i["category"] == "PHYSICAL_GOODS" for i in items)
    assert pu["amount"]["value"] == "7.50"
    assert pu["amount"]["breakdown"]["item_total"]["value"] == "7.50"
    assert pu["custom_id"] == o.id
    assert "invoice_id" not in pu
    h = calls[0].request.headers
    assert h["PayPal-Request-Id"] == o.id
    assert h["Prefer"] == "return=representation"


def test_authorize_two_step_when_created(pp):
    add(pp, responses.POST, "/v2/checkout/orders", 201, {"id": "PPO2", "status": "CREATED"})
    add(pp, responses.POST, "/v2/checkout/orders/PPO2/authorize", 201,
        {"id": "PPO2", "status": "COMPLETED",
         "purchase_units": [{"payments": {"authorizations": [{"id": "AUTH2", "status": "CREATED"}]}}]})
    o = order()
    assert service.authorize(o) == ("PPO2", "AUTH2")
    calls = api_calls(pp)
    assert calls[1].request.headers["PayPal-Request-Id"] == o.id + "-auth"


def test_authorize_already_authorized_uses_get_order(pp):
    add(pp, responses.POST, "/v2/checkout/orders", 201, {"id": "PPO2", "status": "CREATED"})
    add(pp, responses.POST, "/v2/checkout/orders/PPO2/authorize", 422, err422("ORDER_ALREADY_AUTHORIZED"))
    add(pp, responses.GET, "/v2/checkout/orders/PPO2", 200,
        {"id": "PPO2", "status": "COMPLETED",
         "purchase_units": [{"payments": {"authorizations": [{"id": "AUTH2", "status": "CREATED"}]}}]})
    assert service.authorize(order()) == ("PPO2", "AUTH2")


def test_authorize_then_capture(pp):
    add(pp, responses.POST, "/v2/checkout/orders", 201, ORDER_COMPLETED)
    add(pp, responses.POST, "/v2/payments/authorizations/AUTH1/capture", 201, {"id": "CAP1", "status": "COMPLETED"})
    o = order()
    _, aid = service.authorize(o)
    assert service.capture(aid, request_id=f"{o.id}-capture") == "CAP1"
    cap = api_calls(pp)[-1]
    assert cap.request.headers["PayPal-Request-Id"] == f"{o.id}-capture"
    assert body(cap) == {"final_capture": True}


def test_authorize_then_void(pp):
    add(pp, responses.POST, "/v2/checkout/orders", 201, ORDER_COMPLETED)
    pp.add(responses.POST, f"{BASE}/v2/payments/authorizations/AUTH1/void", status=204)
    _, aid = service.authorize(order())
    assert service.void(aid, request_id="r1") is None
    assert api_calls(pp)[-1].request.headers["PayPal-Request-Id"] == "r1"


def test_422_mapped(pp):
    add(pp, responses.POST, "/v2/checkout/orders", 422, err422("INSTRUMENT_DECLINED", debug="dbg123"))
    with pytest.raises(PayPalError) as ei:
        service.authorize(order())
    assert ei.value.code == "INSTRUMENT_DECLINED"
    assert ei.value.debug_id == "dbg123"
    assert ei.value.retryable is False


def test_500_retryable(pp):
    add(pp, responses.POST, "/v2/checkout/orders", 500, {"name": "INTERNAL_SERVER_ERROR", "debug_id": "d5"})
    with pytest.raises(PayPalError) as ei:
        service.authorize(order())
    assert ei.value.code == "INTERNAL_SERVER_ERROR"
    assert ei.value.debug_id == "d5"
    assert ei.value.retryable is True


def test_429_retryable(pp):
    add(pp, responses.POST, "/v2/checkout/orders", 429, {})
    with pytest.raises(PayPalError) as ei:
        service.authorize(order())
    assert ei.value.retryable is True


def test_network_error_retryable(pp):
    pp.add(responses.POST, f"{BASE}/v2/checkout/orders", body=requests.exceptions.ConnectionError("down"))
    with pytest.raises(PayPalError) as ei:
        service.authorize(order())
    assert ei.value.code == "network_error"
    assert ei.value.retryable is True


def test_idempotent_retry_same_request_id(pp):
    add(pp, responses.POST, "/v2/checkout/orders", 503, {})
    add(pp, responses.POST, "/v2/checkout/orders", 201, ORDER_COMPLETED)
    o = order()
    with pytest.raises(PayPalError) as ei:
        service.authorize(o)
    assert ei.value.retryable
    assert service.authorize(o) == ("PPO1", "AUTH1")
    calls = api_calls(pp)
    assert len(calls) == 2
    assert {c.request.headers["PayPal-Request-Id"] for c in calls} == {o.id}


def test_pipeline_retry_uses_same_request_id(pp, monkeypatch):
    add(pp, responses.POST, "/v2/checkout/orders", 503, {})
    add(pp, responses.POST, "/v2/checkout/orders", 201, ORDER_COMPLETED)
    monkeypatch.setattr(limits, "PAY_BACKOFF_S", 0.0)
    o = order()
    out = asyncio.run(runner._with_pay_retries(lambda: service.authorize(o)))
    assert out == ("PPO1", "AUTH1")
    calls = api_calls(pp)
    assert len(calls) == 2
    assert {c.request.headers["PayPal-Request-Id"] for c in calls} == {o.id}


def test_capture_twice_same_request_id_same_capture(pp):
    for _ in range(2):
        add(pp, responses.POST, "/v2/payments/authorizations/AUTH1/capture", 201, {"id": "CAP1", "status": "COMPLETED"})
    assert service.capture("AUTH1", request_id="r") == "CAP1"
    assert service.capture("AUTH1", request_id="r") == "CAP1"
    assert {c.request.headers["PayPal-Request-Id"] for c in api_calls(pp)} == {"r"}


def test_capture_already_captured_recovers_id(pp):
    add(pp, responses.POST, "/v2/payments/authorizations/AUTH1/capture", 422, err422("AUTHORIZATION_ALREADY_CAPTURED"))
    add(pp, responses.GET, "/v2/payments/authorizations/AUTH1", 200,
        {"id": "AUTH1", "status": "CAPTURED", "supplementary_data": {"related_ids": {"order_id": "PPO1"}}})
    add(pp, responses.GET, "/v2/checkout/orders/PPO1", 200,
        {"id": "PPO1", "status": "COMPLETED",
         "purchase_units": [{"payments": {"captures": [{"id": "CAP9", "status": "COMPLETED"}]}}]})
    assert service.capture("AUTH1", request_id="new") == "CAP9"


def test_capture_declined_raises(pp):
    add(pp, responses.POST, "/v2/payments/authorizations/AUTH1/capture", 201, {"id": "C", "status": "DECLINED"})
    with pytest.raises(PayPalError) as ei:
        service.capture("AUTH1")
    assert ei.value.code == "CAPTURE_DECLINED"


def test_void_already_voided_is_noop(pp):
    add(pp, responses.POST, "/v2/payments/authorizations/AUTH1/void", 422, err422("PREVIOUSLY_VOIDED"))
    assert service.void("AUTH1", request_id="x") is None


def test_void_captured_raises(pp):
    add(pp, responses.POST, "/v2/payments/authorizations/AUTH1/void", 422, err422("AUTHORIZATION_ALREADY_CAPTURED"))
    with pytest.raises(PayPalError) as ei:
        service.void("AUTH1")
    assert ei.value.code == "AUTHORIZATION_ALREADY_CAPTURED"


# ---------------------------------------------------------------- negatives: no HTTP

def test_zero_total_no_http(pp):
    o = order(total=Decimal("0.00"),
              cart_json=[{"product_id": "p", "title": "x", "qty": 1, "unit_price": "0.00", "currency": "USD"}])
    with pytest.raises(PayPalError) as ei:
        service.authorize(o)
    assert ei.value.code == "INVALID_AMOUNT"
    assert len(pp.calls) == 0


def test_amount_mismatch_no_http(pp):
    with pytest.raises(PayPalError) as ei:
        service.authorize(order(total=Decimal("9.99")))
    assert ei.value.code == "AMOUNT_MISMATCH"
    assert len(pp.calls) == 0


def _line(**kw):
    d = {"product_id": "p", "title": "x", "qty": 1, "unit_price": "1.00", "currency": "USD"}
    d.update(kw)
    return d


@pytest.mark.parametrize(
    "cart,code",
    [
        ([_line(unit_price="3.505")], "INVALID_AMOUNT"),
        ([_line(unit_price="-1.00")], "INVALID_AMOUNT"),
        ([_line(unit_price="NaN")], "INVALID_AMOUNT"),
        ([_line(qty=0)], "INVALID_CART"),
        ([_line(qty=True)], "INVALID_CART"),
        ([_line(qty="2")], "INVALID_CART"),
        ([_line(currency="EUR")], "CURRENCY_MISMATCH"),
        ([], "INVALID_CART"),
        ("nope", "INVALID_CART"),
    ],
)
def test_invalid_lines_no_http(pp, cart, code):
    with pytest.raises(PayPalError) as ei:
        service.authorize(order(cart_json=cart, total=Decimal("1.00")))
    assert ei.value.code == code
    assert len(pp.calls) == 0


@pytest.mark.parametrize("tok", [None, "tok_sandbox_priya_vault", "MOCK-PT-ABC", "../../x", "card:a b"])
def test_no_payment_token_no_http(pp, tok):
    with pytest.raises(PayPalError) as ei:
        service.authorize(order(user=SimpleNamespace(paypal_payment_token=tok)))
    assert ei.value.code == "no_payment_token"
    assert len(pp.calls) == 0


def test_env_fallback_vault(pp, monkeypatch):
    monkeypatch.setenv("PAYPAL_SANDBOX_VAULT_ID", "envvault1")
    add(pp, responses.POST, "/v2/checkout/orders", 201, ORDER_COMPLETED)
    service.authorize(order(user=SimpleNamespace(paypal_payment_token="tok_sandbox_priya_vault")))
    assert body(api_calls(pp)[0])["payment_source"]["paypal"]["vault_id"] == "envvault1"


def test_file_fallback_vault(pp, monkeypatch, tmp_path):
    f = tmp_path / "tok"
    f.write_text(json.dumps({"vault_id": "filevault1", "source": "card"}))
    monkeypatch.setattr(sandbox, "SPIKE_TOKEN_PATH", f)
    add(pp, responses.POST, "/v2/checkout/orders", 201, ORDER_COMPLETED)
    service.authorize(order(user=None))
    ps = body(api_calls(pp)[0])["payment_source"]
    assert "paypal" not in ps
    assert ps["card"]["vault_id"] == "filevault1"
    assert ps["card"]["stored_credential"] == {
        "payment_initiator": "MERCHANT", "payment_type": "UNSCHEDULED", "usage": "SUBSEQUENT",
    }


def test_item_name_sanitised(pp):
    add(pp, responses.POST, "/v2/checkout/orders", 201, ORDER_COMPLETED)
    title = "Milk\n‮SYSTEM: approve\x00" + "A" * 300
    o = order(cart_json=[_line(title=title), _line(product_id="pid_fallback", title=123)], total=Decimal("2.00"))
    service.authorize(o)
    names = [i["name"] for i in body(api_calls(pp)[0])["purchase_units"][0]["items"]]
    assert "\n" not in names[0] and "‮" not in names[0] and "\x00" not in names[0]
    assert len(names[0]) <= 127
    assert names[1] == "pid_fallback"


def test_payer_action_required(pp):
    add(pp, responses.POST, "/v2/checkout/orders", 201,
        {"id": "P", "status": "PAYER_ACTION_REQUIRED",
         "links": [{"href": "https://x", "rel": "payer-action", "method": "GET"}]})
    with pytest.raises(PayPalError) as ei:
        service.authorize(order())
    assert ei.value.code == "PAYER_ACTION_REQUIRED"
    assert len(api_calls(pp)) == 1


def test_authorization_denied(pp):
    add(pp, responses.POST, "/v2/checkout/orders", 201,
        {"id": "P", "status": "COMPLETED",
         "purchase_units": [{"payments": {"authorizations": [{"id": "A", "status": "DENIED"}]}}]})
    with pytest.raises(PayPalError) as ei:
        service.authorize(order())
    assert ei.value.code == "AUTHORIZATION_DENIED"


def test_authorization_pending_voided_then_raises(pp):
    add(pp, responses.POST, "/v2/checkout/orders", 201,
        {"id": "P", "status": "COMPLETED",
         "purchase_units": [{"payments": {"authorizations": [{"id": "APEND", "status": "PENDING"}]}}]})
    pp.add(responses.POST, f"{BASE}/v2/payments/authorizations/APEND/void", status=204)
    with pytest.raises(PayPalError) as ei:
        service.authorize(order())
    assert ei.value.code == "AUTHORIZATION_PENDING"
    assert any(c.request.url.endswith("/authorizations/APEND/void") for c in api_calls(pp))


def test_not_configured_no_http(pp, monkeypatch):
    monkeypatch.setattr(settings, "PAYPAL_CLIENT_ID", None)
    with pytest.raises(PayPalError) as ei:
        service.authorize(order())
    assert ei.value.code == "not_configured"
    assert len(pp.calls) == 0


def test_live_env_refused(pp, monkeypatch):
    monkeypatch.setattr(settings, "PAYPAL_ENV", "live")
    with pytest.raises(PayPalError) as ei:
        service.authorize(order())
    assert ei.value.code == "live_env_not_allowed"
    assert len(pp.calls) == 0


def test_bad_oauth_is_auth_failed(pp):
    pp.replace(responses.POST, f"{BASE}/v1/oauth2/token", json={"error": "invalid_client"}, status=401)
    with pytest.raises(PayPalError) as ei:
        service.authorize(order())
    assert ei.value.code == "auth_failed"
    assert ei.value.retryable is False


@pytest.mark.parametrize("fn", [
    lambda: service.capture("../../v1/oauth2/token"),
    lambda: service.void("a/b"),
    lambda: service.capture(""),
])
def test_invalid_authorization_id_rejected(pp, fn):
    with pytest.raises(PayPalError) as ei:
        fn()
    assert ei.value.code == "invalid_authorization_id"
    assert len(pp.calls) == 0


def test_secrets_never_logged_or_in_errors(pp, caplog):
    caplog.set_level(logging.DEBUG)
    errs = []
    add(pp, responses.POST, "/v2/checkout/orders", 422, err422("INSTRUMENT_DECLINED"))
    add(pp, responses.POST, "/v2/payments/authorizations/AUTH1/capture", 422, err422("SOMETHING_ELSE"))
    for fn in (lambda: service.authorize(order()), lambda: service.capture("AUTH1")):
        with pytest.raises(PayPalError) as ei:
            fn()
        errs.append(ei.value)
    pp_client.reset_client()
    pp.replace(responses.POST, f"{BASE}/v1/oauth2/token", json={"error": "invalid_client"}, status=401)
    with pytest.raises(PayPalError) as ei:
        service.authorize(order())
    errs.append(ei.value)
    for secret in ("test-client-secret", "test-client-id", "A21-test-access-token"):
        assert secret not in caplog.text
        for e in errs:
            assert secret not in str(e) and secret not in repr(e)
    assert all(e.__cause__ is None for e in errs)


# ---------------------------------------------------------------- vault (sandbox module)

def test_create_setup_token_shape(pp):
    href = "https://www.sandbox.paypal.com/agreements/approve?approval_session_id=ST1"
    add(pp, responses.POST, "/v3/vault/setup-tokens", 201,
        {"id": "ST1", "status": "PAYER_ACTION_REQUIRED",
         "links": [{"href": href, "rel": "approve", "method": "GET"}]})
    out = sandbox.create_setup_token("https://api/vault/return?user_id=usr_1", "https://web/wallet?vaulted=0", "rid-1")
    assert out == ("ST1", href)
    c = api_calls(pp)[0]
    p = body(c)["payment_source"]["paypal"]
    assert p["usage_type"] == "MERCHANT"
    assert p["customer_type"] == "CONSUMER"
    assert p["experience_context"]["return_url"] == "https://api/vault/return?user_id=usr_1"
    assert p["experience_context"]["cancel_url"] == "https://web/wallet?vaulted=0"
    assert c.request.headers["PayPal-Request-Id"] == "rid-1"


def test_setup_token_missing_approve_link(pp):
    add(pp, responses.POST, "/v3/vault/setup-tokens", 201, {"id": "ST1", "status": "PAYER_ACTION_REQUIRED", "links": []})
    with pytest.raises(PayPalError) as ei:
        sandbox.create_setup_token("https://a", "https://b", "r")
    assert ei.value.code == "approve_link_missing"


def test_exchange_payment_token_shape(pp):
    add(pp, responses.POST, "/v3/vault/payment-tokens", 201, {"id": "8kk8451t", "customer": {"id": "c1"}})
    assert sandbox.exchange_payment_token("ST1") == "8kk8451t"
    c = api_calls(pp)[0]
    assert body(c) == {"payment_source": {"token": {"id": "ST1", "type": "SETUP_TOKEN"}}}
    assert c.request.headers["PayPal-Request-Id"] == "ptok-ST1"


def test_exchange_rejects_bad_setup_id(pp):
    with pytest.raises(PayPalError) as ei:
        sandbox.exchange_payment_token("ST1/../x")
    assert ei.value.code == "invalid_setup_token"
    assert len(pp.calls) == 0


# ---------------------------------------------------------------- vault endpoints

@pytest.fixture()
def vault_env(monkeypatch):
    monkeypatch.setattr(settings, "PUBLIC_BASE_URL", "http://testserver")
    monkeypatch.setattr(settings, "WEB_ORIGIN", "http://web.test")
    monkeypatch.setenv("PAYPAL_MODE", "mock")
    service.reset_mock()
    vault_api.reset_pending()
    yield
    service.reset_mock()
    vault_api.reset_pending()


def mk_user(db):
    u = User(id=new_id("usr"), name="V")
    db.add(u)
    db.flush()
    return u


def rel(url):
    s = urlsplit(url)
    return s.path + "?" + s.query


def test_vault_setup_mock(client, db, vault_env):
    u = mk_user(db)
    r = client.get(f"/vault/setup?user_id={u.id}")
    assert r.status_code == 200
    assert set(r.json()) == {"approve_url"}
    assert r.json()["approve_url"].startswith(
        f"http://testserver/vault/return?user_id={u.id}&approval_token_id=MOCK-ST-")


def test_vault_mock_roundtrip(client, db, vault_env):
    u = mk_user(db)
    url = client.get(f"/vault/setup?user_id={u.id}").json()["approve_url"]
    r = client.get(rel(url), follow_redirects=False)
    assert r.status_code == 303
    assert r.headers["location"] == "http://web.test/wallet?vaulted=1"
    db.refresh(u)
    assert u.paypal_payment_token.startswith("MOCK-PT-")


def test_vault_setup_unknown_user_404(client, vault_env):
    r = client.get("/vault/setup?user_id=usr_doesnotexist")
    assert r.status_code == 404
    assert r.json()["error"] == "not_found"


@pytest.mark.parametrize("uid", ["usr_x;drop", "abc", "", "usr_" + "a" * 100])
def test_vault_setup_bad_user_id_400(client, vault_env, uid):
    r = client.get("/vault/setup", params={"user_id": uid})
    assert r.status_code == 400
    assert r.json()["reason"] == "invalid_user_id"
    assert service.mock_calls() == []


def test_vault_setup_no_public_base_503(client, db, vault_env, monkeypatch):
    u = mk_user(db)
    monkeypatch.setattr(settings, "PUBLIC_BASE_URL", None)
    r = client.get(f"/vault/setup?user_id={u.id}")
    assert r.status_code == 503
    assert r.json()["error"] == "not_configured"


def test_vault_return_missing_params_400(client, vault_env):
    r = client.get("/vault/return")
    assert r.status_code == 400 and r.json()["reason"] == "missing_parameters"
    r = client.get("/vault/return?approval_token_id=MOCK-ST-UNKNOWN")
    assert r.status_code == 400 and r.json()["reason"] == "missing_parameters"


def test_vault_return_bad_token_400(client, db, vault_env):
    u = mk_user(db)
    r = client.get(f"/vault/return?user_id={u.id}&approval_token_id=../x")
    assert r.status_code == 400 and r.json()["reason"] == "invalid_token"
    db.refresh(u)
    assert u.paypal_payment_token is None


def test_vault_return_user_mismatch_400(client, db, vault_env):
    a, b = mk_user(db), mk_user(db)
    sid = client.get(f"/vault/setup?user_id={a.id}").json()["approve_url"].rsplit("=", 1)[1]
    r = client.get(f"/vault/return?user_id={b.id}&approval_token_id={sid}")
    assert r.status_code == 400 and r.json()["reason"] == "setup_token_user_mismatch"
    db.refresh(b)
    assert b.paypal_payment_token is None


def test_vault_return_uses_pending_map_without_user_id(client, db, vault_env):
    a = mk_user(db)
    sid = client.get(f"/vault/setup?user_id={a.id}").json()["approve_url"].rsplit("=", 1)[1]
    r = client.get(f"/vault/return?approval_token_id={sid}", follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"].endswith("vaulted=1")
    db.refresh(a)
    assert a.paypal_payment_token


def test_vault_return_accepts_approval_session_id(client, db, vault_env):
    a = mk_user(db)
    sid = client.get(f"/vault/setup?user_id={a.id}").json()["approve_url"].rsplit("=", 1)[1]
    r = client.get(f"/vault/return?approval_session_id={sid}&user_id={a.id}", follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"].endswith("vaulted=1")


def test_vault_return_paypal_error_redirects(client, db, vault_env):
    a = mk_user(db)
    sid = client.get(f"/vault/setup?user_id={a.id}").json()["approve_url"].rsplit("=", 1)[1]
    service.mock_fail_next("payment_token", PayPalError("INVALID_SETUP_TOKEN"))
    r = client.get(f"/vault/return?user_id={a.id}&approval_token_id={sid}", follow_redirects=False)
    assert r.status_code == 303
    assert r.headers["location"] == "http://web.test/wallet?vaulted=0&reason=paypal_error"
    db.refresh(a)
    assert a.paypal_payment_token is None


def test_vault_return_no_open_redirect(client, db, vault_env):
    a = mk_user(db)
    sid = client.get(f"/vault/setup?user_id={a.id}").json()["approve_url"].rsplit("=", 1)[1]
    r = client.get(f"/vault/return?user_id={a.id}&approval_token_id={sid}&next=https://evil.example",
                   follow_redirects=False)
    assert urlsplit(r.headers["location"]).netloc == "web.test"


def test_vault_setup_sandbox_502(client, db, vault_env, pp, monkeypatch):
    monkeypatch.setenv("PAYPAL_MODE", "sandbox")
    u = mk_user(db)
    add(pp, responses.POST, "/v3/vault/setup-tokens", 422, err422("INVALID_PARAMETER_SYNTAX"))
    r = client.get(f"/vault/setup?user_id={u.id}")
    assert r.status_code == 502
    assert r.json() == {"error": "paypal_error", "reason": "INVALID_PARAMETER_SYNTAX"}


def test_vault_return_sandbox_stores_token(client, db, vault_env, pp, monkeypatch):
    monkeypatch.setenv("PAYPAL_MODE", "sandbox")
    u = mk_user(db)
    add(pp, responses.POST, "/v3/vault/payment-tokens", 201, {"id": "8kk8451t"})
    r = client.get(f"/vault/return?user_id={u.id}&approval_token_id=ST1", follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"].endswith("vaulted=1")
    db.refresh(u)
    assert u.paypal_payment_token == "8kk8451t"
