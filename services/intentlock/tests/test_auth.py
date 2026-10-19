"""Auth: email codes, Google exchange, sessions, signup and onboarding."""
from __future__ import annotations

import base64
import json
import time

import pytest

from app import auth
from app.config import settings
from app.models import AuthCode, User

EMAIL = "new.person@example.com"


@pytest.fixture(autouse=True)
def _auth_env(monkeypatch):
    monkeypatch.setattr(settings, "AUTH_SECRET", "test-secret-value")
    monkeypatch.setattr(settings, "WEB_ORIGIN", "http://localhost:3000")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "cid.apps.googleusercontent.com")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "gsecret")


@pytest.fixture()
def sent(monkeypatch):
    box: list[tuple[str, str]] = []
    monkeypatch.setattr(auth, "send_code_email", lambda e, c: box.append((e, c)))
    return box


def _age_codes(db, seconds=60):
    for row in db.query(AuthCode).all():
        row.created_at = row.created_at.__class__.fromtimestamp(row.created_at.timestamp() - seconds,
                                                                row.created_at.tzinfo)
    db.flush()


def _login(client, sent, email=EMAIL):
    assert client.post("/auth/email/start", json={"email": email}).status_code == 200
    code = sent[-1][1]
    r = client.post("/auth/email/verify", json={"email": email, "code": code})
    assert r.status_code == 200, r.text
    return r.json()


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def test_new_user_full_flow(client, sent, db):
    out = _login(client, sent, "  New.Person@Example.com ")
    assert out["is_new"] is True and out["next"] == "signup"
    assert sent[0][0] == EMAIL and len(sent[0][1]) == 6
    h = _bearer(out["token"])

    assert client.get("/auth/me", headers=h).json()["next"] == "signup"
    assert client.post("/auth/onboarding", headers=h, json={
        "use_case": "personal", "categories": ["groceries"], "monthly_budget": 300,
        "approval_mode": "every"}).status_code == 409

    r = client.post("/auth/signup", headers=h, json={
        "full_name": "New Person", "country": "in", "currency": "INR", "company": ""})
    assert r.status_code == 200 and r.json()["next"] == "onboarding"
    assert r.json()["country"] == "IN" and r.json()["company"] is None

    r = client.post("/auth/onboarding", headers=h, json={
        "use_case": "household", "categories": ["groceries", "household", "groceries"],
        "monthly_budget": 400, "approval_mode": "above_limit", "approval_limit": 50,
        "agents": ["chatgpt", "claude"]})
    assert r.status_code == 200, r.text
    me = r.json()
    assert me["next"] == "app" and me["onboarding"]["categories"] == ["groceries", "household"]

    assert client.post("/auth/logout", headers=h).status_code == 200
    assert client.get("/auth/me", headers=h).status_code == 401


def test_returning_user_goes_to_app(client, sent, db):
    first = _login(client, sent)
    h = _bearer(first["token"])
    client.post("/auth/signup", headers=h, json={"full_name": "A", "country": "US", "currency": "USD"})
    client.post("/auth/onboarding", headers=h, json={
        "use_case": "personal", "categories": ["electronics"], "monthly_budget": 0, "approval_mode": "every"})
    _age_codes(db)
    again = _login(client, sent)
    assert again["is_new"] is False and again["next"] == "app"
    assert again["user"]["id"] == first["user"]["id"]
    assert db.query(User).filter(User.email == EMAIL).count() == 1


def test_wrong_code_locks_after_five_attempts(client, sent):
    client.post("/auth/email/start", json={"email": EMAIL})
    good = sent[-1][1]
    bad = "000000" if good != "000000" else "111111"
    for _ in range(4):
        r = client.post("/auth/email/verify", json={"email": EMAIL, "code": bad})
        assert r.status_code == 400 and r.json()["error"] == "invalid_code"
    r = client.post("/auth/email/verify", json={"email": EMAIL, "code": bad})
    assert r.json()["error"] == "too_many_attempts"
    r = client.post("/auth/email/verify", json={"email": EMAIL, "code": good})
    assert r.status_code == 400 and r.json()["error"] == "code_expired"


def test_code_is_single_use_and_new_code_replaces_old(client, sent, db):
    client.post("/auth/email/start", json={"email": EMAIL})
    old = sent[-1][1]
    _age_codes(db)
    client.post("/auth/email/start", json={"email": EMAIL})
    new = sent[-1][1]
    if old != new:
        assert client.post("/auth/email/verify", json={"email": EMAIL, "code": old}).status_code == 400
    assert client.post("/auth/email/verify", json={"email": EMAIL, "code": new}).status_code == 200
    assert client.post("/auth/email/verify", json={"email": EMAIL, "code": new}).status_code == 400


def test_code_rate_limits(client, sent, db):
    assert client.post("/auth/email/start", json={"email": EMAIL}).status_code == 200
    r = client.post("/auth/email/start", json={"email": EMAIL})
    assert r.status_code == 429 and r.json()["error"] == "slow_down"
    for _ in range(4):
        _age_codes(db, 40)
        assert client.post("/auth/email/start", json={"email": EMAIL}).status_code == 200
    _age_codes(db, 40)
    assert client.post("/auth/email/start", json={"email": EMAIL}).json()["error"] == "too_many_codes"


def test_codes_stored_hashed(client, sent, db):
    client.post("/auth/email/start", json={"email": EMAIL})
    row = db.query(AuthCode).one()
    assert sent[-1][1] not in row.code_hash and len(row.code_hash) == 64


@pytest.mark.parametrize("email", ["", "nope", "a@b", "x" * 260 + "@example.com"])
def test_invalid_email_rejected(client, sent, email):
    assert client.post("/auth/email/start", json={"email": email}).status_code == 422
    assert sent == []


def test_me_requires_valid_bearer(client):
    assert client.get("/auth/me").status_code == 401
    assert client.get("/auth/me", headers=_bearer("forged")).status_code == 401


def test_missing_auth_secret_is_503(client, sent, monkeypatch):
    monkeypatch.setattr(settings, "AUTH_SECRET", "__FILL_ME__")
    assert client.post("/auth/email/start", json={"email": EMAIL}).status_code == 503


# --------------------------------------------------------------------------- #
# Google
# --------------------------------------------------------------------------- #

def _id_token(**over):
    claims = {"iss": "https://accounts.google.com", "aud": "cid.apps.googleusercontent.com",
              "exp": int(time.time()) + 300, "sub": "g-123", "email": "G.User@Gmail.com",
              "email_verified": True, "name": "G User", "picture": "https://lh3.example/p.png"}
    claims.update(over)
    seg = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b"=").decode()
    return f"{seg({'alg': 'RS256'})}.{seg(claims)}.sig"


class _Resp:
    def __init__(self, status, body):
        self.status_code, self._body, self.text = status, body, json.dumps(body)

    def json(self):
        return self._body


def _mock_google(monkeypatch, status=200, **claims):
    calls = []

    def fake_post(url, **kw):
        calls.append((url, kw))
        return _Resp(status, {"id_token": _id_token(**claims)} if status == 200 else {"error": "invalid_grant"})

    monkeypatch.setattr(auth.httpx, "post", fake_post)
    return calls


VERIFIER = "v" * 43


def test_google_url_uses_fixed_redirect(client):
    r = client.post("/auth/google/url", json={"state": "s" * 32, "code_challenge": "c" * 43})
    url = r.json()["url"]
    assert "redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Fgoogle%2Fcallback" in url
    assert "code_challenge_method=S256" in url and "client_id=cid.apps.googleusercontent.com" in url
    assert client.post("/auth/google/url", json={"state": "short", "code_challenge": "c" * 43}).status_code == 422


def test_google_new_user_then_returning(client, monkeypatch):
    calls = _mock_google(monkeypatch)
    r = client.post("/auth/google", json={"code": "abc", "code_verifier": VERIFIER})
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["is_new"] and out["next"] == "signup"
    assert out["user"]["email"] == "g.user@gmail.com" and out["user"]["avatar_url"]
    assert calls[0][1]["data"]["code_verifier"] == VERIFIER
    assert calls[0][1]["data"]["redirect_uri"] == "http://localhost:3000/api/auth/google/callback"
    again = client.post("/auth/google", json={"code": "def", "code_verifier": VERIFIER}).json()
    assert again["is_new"] is False and again["user"]["id"] == out["user"]["id"]


def test_google_links_existing_email_account(client, sent, monkeypatch):
    first = _login(client, sent, "g.user@gmail.com")
    _mock_google(monkeypatch)
    out = client.post("/auth/google", json={"code": "abc", "code_verifier": VERIFIER}).json()
    assert out["user"]["id"] == first["user"]["id"] and out["is_new"] is False


@pytest.mark.parametrize("claims", [
    {"aud": "someone-else"}, {"iss": "https://evil.example"}, {"email_verified": False},
    {"exp": int(time.time()) - 10}, {"sub": ""},
])
def test_google_rejects_bad_claims(client, monkeypatch, claims):
    _mock_google(monkeypatch, **claims)
    r = client.post("/auth/google", json={"code": "abc", "code_verifier": VERIFIER})
    assert r.status_code == 400 and r.json()["error"] == "google_exchange_failed"


def test_google_exchange_failure(client, monkeypatch):
    _mock_google(monkeypatch, status=400)
    assert client.post("/auth/google", json={"code": "abc", "code_verifier": VERIFIER}).status_code == 400


def test_google_not_configured(client, monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", None)
    r = client.post("/auth/google/url", json={"state": "s" * 32, "code_challenge": "c" * 43})
    assert r.status_code == 503


def test_send_code_email_default_from(monkeypatch):
    monkeypatch.setattr(settings, "RESEND_API_KEY", "re_test_key")
    monkeypatch.setattr(settings, "RESEND_FROM", None)
    posted = []

    class DummyResponse:
        status_code = 200

    monkeypatch.setattr("httpx.post", lambda url, json, headers, timeout: (posted.append(json), DummyResponse())[1])
    auth.send_code_email("alice@example.com", "123456")
    assert len(posted) == 1
    assert posted[0]["from"] == "Sepilo <support@sepilo.space>"
    assert posted[0]["to"] == ["alice@example.com"]


def test_send_security_notice_default_from(monkeypatch):
    monkeypatch.setattr(settings, "RESEND_API_KEY", "re_test_key")
    monkeypatch.setattr(settings, "RESEND_FROM", None)
    posted = []

    class DummyResponse:
        status_code = 200

    monkeypatch.setattr("httpx.post", lambda url, json, headers, timeout: (posted.append(json), DummyResponse())[1])
    auth.send_security_notice("alice@example.com", "Security Alert", "Someone signed in")
    assert len(posted) == 1
    assert posted[0]["from"] == "Sepilo <support@sepilo.space>"
    assert posted[0]["to"] == ["alice@example.com"]

