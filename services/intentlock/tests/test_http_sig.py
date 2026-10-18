"""P1-T05: agent registry + RFC 9421 signature verification."""

from __future__ import annotations

import json
import os
import sys
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config as AlembicConfig
from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException as StarletteHTTPException

SERVICE_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVICE_ROOT))

from app.crypto.http_sig import (  # noqa: E402
    COMPONENTS,
    AgentVerificationError,
    SignatureParams,
    build_signature_base,
    content_digest,
    parse_signature_input,
    serialize_signature_params,
    sign_request,
)
from app.crypto.keys import (  # noqa: E402
    b64std_encode,
    b64url_decode,
    b64url_encode,
    generate_keypair_b64,
    load_private_key,
    load_public_key,
    public_key_b64,
)
from app.crypto.vector import build_vector  # noqa: E402
from app.db import get_db  # noqa: E402
from app.deps import require_agent  # noqa: E402
from app.errors import http_exception_handler  # noqa: E402
from app.ids import new_id  # noqa: E402
from app.models import Agent, Nonce, User  # noqa: E402

TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://localhost:5432/intentlock_test"
)
MIGRATION_LOCK_ID = 912345
RFC_PRIV = "n4Ni-HpISpVObnQMW0wOhCKROaIKqKtW_2ZYb2p9KcU"
RFC_PUB = "JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs"
PROBE_URI = "http://testserver/probe"
BODY = b'{"cart":[],"intent_id":"int_test","merchant":"freshmart"}'


@pytest.fixture(scope="session")
def sig_engine():
    url = make_url(TEST_DB_URL)
    # Advisory locks are per-database: lock on the `postgres` DB so this serialises with
    # P1-T06's fixture (same key, same DB) around CREATE DATABASE + alembic upgrade.
    admin = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    try:
        with admin.connect() as c:
            c.execute(text("SELECT pg_advisory_lock(:k)"), {"k": MIGRATION_LOCK_ID})
            try:
                if not c.execute(
                    text("SELECT 1 FROM pg_database WHERE datname=:n"), {"n": url.database}
                ).scalar():
                    c.execute(text(f'CREATE DATABASE "{url.database}"'))
                old = os.environ.get("DATABASE_URL")
                os.environ["DATABASE_URL"] = TEST_DB_URL
                try:
                    command.upgrade(AlembicConfig(str(SERVICE_ROOT / "alembic.ini")), "head")
                finally:
                    if old is None:
                        os.environ.pop("DATABASE_URL", None)
                    else:
                        os.environ["DATABASE_URL"] = old
            finally:
                c.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": MIGRATION_LOCK_ID})
    except OperationalError as e:
        pytest.fail(f"Postgres not reachable via TEST_DATABASE_URL: {type(e).__name__}")
    finally:
        admin.dispose()
    engine = create_engine(TEST_DB_URL, pool_pre_ping=True)
    yield engine
    engine.dispose()


@pytest.fixture
def sig_db(sig_engine):
    conn = sig_engine.connect()
    trans = conn.begin()
    session = Session(bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False)
    try:
        yield session
    finally:
        session.close()
        trans.rollback()
        conn.close()


@pytest.fixture(autouse=True)
def _public_base(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "PUBLIC_BASE_URL", "http://testserver")


def _probe_app(db):
    probe = FastAPI()
    probe.add_exception_handler(StarletteHTTPException, http_exception_handler)
    probe.add_exception_handler(HTTPException, http_exception_handler)

    @probe.post("/probe")
    async def probe_route(agent: Agent = Depends(require_agent)):
        return {"agent_id": agent.id}

    probe.dependency_overrides[get_db] = lambda: db
    return probe


@pytest.fixture
def probe(sig_db):
    return TestClient(_probe_app(sig_db), raise_server_exceptions=False)


@pytest.fixture
def api(sig_db):
    from app.main import app

    app.dependency_overrides[get_db] = lambda: sig_db
    try:
        yield TestClient(app, raise_server_exceptions=False)
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def agent(sig_db):
    u = User(id=new_id("usr"), name="Sig Test")
    sig_db.add(u)
    sig_db.flush()
    a = Agent(
        id=new_id("agt"), user_id=u.id, name="t", public_key=RFC_PUB, device_id="d1", verified=False
    )
    sig_db.add(a)
    sig_db.commit()
    return a


def _post(probe, body, headers):
    return probe.post("/probe", content=body, headers=headers)


def _reason(r):
    assert r.status_code == 401, r.text
    return r.json()["reason"]


def _sign_custom(method, target, body, priv, params, components=COMPONENTS):
    digest = content_digest(body)
    sp = SignatureParams(tuple(components), tuple(params))
    base = build_signature_base(method, target, {"content-digest": digest}, sp)
    sig = load_private_key(priv).sign(base.encode("ascii"))
    return {
        "Content-Type": "application/json",
        "Content-Digest": digest,
        "Signature-Input": "sig1=" + serialize_signature_params(sp),
        "Signature": "sig1=:" + b64std_encode(sig) + ":",
    }


def _std_params(keyid, *, created=None, nonce=None, alg="ed25519", tag="intentlock-agent"):
    import uuid

    created = int(time.time()) if created is None else created
    nonce = str(uuid.uuid4()) if nonce is None else nonce
    return [
        ("created", created),
        ("expires", created + 300),
        ("nonce", nonce),
        ("keyid", keyid),
        ("alg", alg),
        ("tag", tag),
    ]


def _sign(agent, body=BODY, **kw):
    return sign_request("POST", PROBE_URI, body, RFC_PRIV, agent.id, **kw)


# --- pure tests ---------------------------------------------------------------


def test_content_digest_rfc9530_example():
    assert (
        content_digest(b'{"hello": "world"}')
        == "sha-256=:X48E9qOokqqrvdts8nOJRJN3OWDUoyWxBf7kbu9DBPE=:"
    )


def test_rfc9421_b26_signature_base_and_signature():
    sp = SignatureParams(
        ("date", "@method", "@path", "@authority", "content-type", "content-length"),
        (("created", 1618884473), ("keyid", "test-key-ed25519")),
    )
    headers = {
        "Date": "Tue, 20 Apr 2021 02:07:55 GMT",
        "Content-Type": "application/json",
        "Content-Length": "18",
    }
    base = build_signature_base(
        "POST", "https://example.com/foo?param=Value&Pet=dog", headers, sp
    )
    assert base == (
        '"date": Tue, 20 Apr 2021 02:07:55 GMT\n"@method": POST\n"@path": /foo\n'
        '"@authority": example.com\n"content-type": application/json\n"content-length": 18\n'
        '"@signature-params": ("date" "@method" "@path" "@authority" "content-type" '
        '"content-length");created=1618884473;keyid="test-key-ed25519"'
    )
    assert (
        b64std_encode(load_private_key(RFC_PRIV).sign(base.encode("ascii")))
        == "wqcAqbmYJ2ji2glfAMaRy4gruYYnx2nEFN2HN6jrnDnQCK1u02Gb04v9EDgwUPiu4A0w6vuQv5lIp5WPpBKRCw=="
    )


def test_vector_file_matches_reference():
    path = SERVICE_ROOT.parents[1] / "data" / "eval" / "http_sig_vector.json"
    assert json.loads(path.read_text()) == build_vector()


def test_vector_known_values():
    v = build_vector()
    e = v["expected"]
    assert e["content_digest"] == "sha-256=:eQ5dDfitnWJSM5jV/0yWiYS3bWoYFgjDJjwAqoRL+M4=:"
    assert (
        e["signature_b64"]
        == "u0bikFQBMdu0osIycuc3G1XXSLggBK4Ky8vAg+OTtlDZEaq8aEocrLU5wNQp8nTacPa8u0u1Ecbrk4lsaJp5DA=="
    )
    assert (
        e["signature_base_sha256"]
        == "4f9dc03cae9b1c70d605ff5953f3085d887bd95710d7c8207234cdb8ebb46443"
    )
    assert e["headers"]["Signature"] == "sig1=:" + e["signature_b64"] + ":"
    assert e["signature_base"].endswith('"@signature-params": ' + e["signature_params"])
    assert not e["signature_base"].endswith("\n")
    import base64

    load_public_key(RFC_PUB).verify(
        base64.b64decode(e["signature_b64"]), e["signature_base"].encode("ascii")
    )


def test_keys_roundtrip():
    priv, pub = generate_keypair_b64()
    assert public_key_b64(load_private_key(priv)) == pub
    assert "=" not in priv + pub
    assert len(b64url_decode(pub)) == 32
    assert public_key_b64(load_private_key(RFC_PRIV)) == RFC_PUB


@pytest.mark.parametrize("s", ["abc=", "ab+/", "", "a"])
def test_b64url_decode_rejects_padding_and_bad_chars(s):
    with pytest.raises(ValueError):
        b64url_decode(s)


def test_load_public_key_rejects_wrong_length():
    with pytest.raises(ValueError):
        load_public_key(b64url_encode(b"\x01" * 31))
    with pytest.raises(ValueError):
        load_public_key(b64url_encode(b"\x01" * 33))


_V = sign_request("POST", PROBE_URI, BODY, RFC_PRIV, "agt_x")["Signature-Input"]


@pytest.mark.parametrize(
    "bad",
    [
        _V.replace("sig1=", "sig2=", 1),
        _V.replace('("@method" "@target-uri" "content-digest")', '("@target-uri" "@method" "content-digest")'),
        _V.replace('("@method" "@target-uri" "content-digest")', '("@method" "content-digest")'),
        _V.replace('"content-digest")', '"content-digest";sf)', 1),
        _V + ';foo="bar"',
        _V + ";created=1",
        _V + ", sig2=()",
        _V.replace('alg="ed25519"', 'alg="rsa-pss-sha512"'),
        _V.replace('tag="intentlock-agent"', 'tag="other"'),
        _V.replace(_V.split('nonce="')[1].split('"')[0], "not-a-uuid"),
        _V.replace('keyid="agt_x"', "keyid=\"agt_x' OR '1'='1\""),
    ],
)
def test_parse_signature_input_rejects(bad):
    assert bad != _V
    with pytest.raises(AgentVerificationError) as ei:
        parse_signature_input(bad)
    assert ei.value.reason == "bad_signature"


def test_parse_signature_input_created_as_string_rejected():
    created = _V.split("created=")[1].split(";")[0]
    bad = _V.replace(f"created={created}", f'created="{created}"')
    with pytest.raises(AgentVerificationError) as ei:
        parse_signature_input(bad)
    assert ei.value.reason == "bad_signature"


def test_parse_signature_input_roundtrip():
    assert serialize_signature_params(parse_signature_input(_V)) == _V[len("sig1=") :]


# --- DB / HTTP tests ----------------------------------------------------------


def test_valid_signature_accepted(probe, sig_db, agent):
    h = _sign(agent)
    nonce = parse_signature_input(h["Signature-Input"]).get("nonce")
    r = _post(probe, BODY, h)
    assert r.status_code == 200, r.text
    assert r.json() == {"agent_id": agent.id}
    sig_db.refresh(agent)
    assert agent.verified is True
    assert sig_db.get(Nonce, (agent.id, nonce)) is not None


def test_body_tampered_digest_mismatch(probe, agent):
    h = _sign(agent)
    assert _reason(_post(probe, BODY.replace(b"freshmart", b"dealsdaily"), h)) == "digest_mismatch"


def test_header_tampered_bad_signature(probe, agent):
    h = _sign(agent)
    b2 = b'{"cart":[],"intent_id":"int_test","merchant":"dealsdaily"}'
    h["Content-Digest"] = content_digest(b2)
    assert _reason(_post(probe, b2, h)) == "bad_signature"


def test_replay_same_nonce(probe, agent):
    h = _sign(agent)
    assert _post(probe, BODY, h).status_code == 200
    assert _reason(_post(probe, BODY, h)) == "replay"


def test_created_10_min_old_stale(probe, agent):
    created = int(time.time()) - 600
    h = _sign(agent, created=created, expires=created + 300)
    assert _reason(_post(probe, BODY, h)) == "stale"


def test_unknown_keyid(probe, agent):
    h = sign_request("POST", PROBE_URI, BODY, RFC_PRIV, new_id("agt"))
    assert _reason(_post(probe, BODY, h)) == "unknown_key"


def test_revoked_agent(probe, api, sig_db, agent):
    r = api.post(f"/agents/{agent.id}/revoke")
    assert r.status_code == 200
    assert r.json()["revoked_at"] is not None
    assert _reason(_post(probe, BODY, _sign(agent))) == "revoked"


@pytest.mark.parametrize("drop", [["Signature"], ["Signature-Input"], ["Signature", "Signature-Input"]])
def test_missing_signature_headers(probe, agent, drop):
    h = _sign(agent)
    for k in drop:
        h.pop(k)
    assert _reason(_post(probe, BODY, h)) == "bad_signature"


def test_missing_content_digest_header(probe, agent):
    h = _sign(agent)
    h.pop("Content-Digest")
    assert _reason(_post(probe, BODY, h)) == "bad_signature"


def test_wrong_key_bad_signature(probe, agent):
    other_priv = generate_keypair_b64()[0]
    h = sign_request("POST", PROBE_URI, BODY, other_priv, agent.id)
    assert _reason(_post(probe, BODY, h)) == "bad_signature"


@pytest.mark.parametrize("uri", ["http://testserver/other", "https://testserver/probe"])
def test_target_uri_mismatch_bad_signature(probe, agent, uri):
    h = sign_request("POST", uri, BODY, RFC_PRIV, agent.id)
    assert _reason(_post(probe, BODY, h)) == "bad_signature"


def test_method_mismatch_bad_signature(probe, agent):
    h = sign_request("PUT", PROBE_URI, BODY, RFC_PRIV, agent.id)
    assert _reason(_post(probe, BODY, h)) == "bad_signature"


def test_expires_window_too_long_stale(probe, agent):
    now = int(time.time())
    h = _sign(agent, created=now, expires=now + 600)
    assert _reason(_post(probe, BODY, h)) == "stale"


def test_created_in_future_stale(probe, agent):
    created = int(time.time()) + 400
    h = _sign(agent, created=created, expires=created + 60)
    assert _reason(_post(probe, BODY, h)) == "stale"


def test_expired_signature_stale(probe, agent):
    now = int(time.time())
    h = _sign(agent, created=now - 200, expires=now - 10)
    assert _reason(_post(probe, BODY, h)) == "stale"


@pytest.mark.parametrize("override", [{"alg": "rsa-pss-sha512"}, {"tag": "evil"}])
def test_policy_params_bad_signature(probe, agent, override):
    h = _sign_custom("POST", PROBE_URI, BODY, RFC_PRIV, _std_params(agent.id, **override))
    assert _reason(_post(probe, BODY, h)) == "bad_signature"


def test_nonce_not_uuid4_bad_signature(probe, sig_db, agent):
    h = _sign_custom("POST", PROBE_URI, BODY, RFC_PRIV, _std_params(agent.id, nonce="12345"))
    assert _reason(_post(probe, BODY, h)) == "bad_signature"
    assert sig_db.query(Nonce).filter(Nonce.agent_id == agent.id).count() == 0


def test_keyid_injection_rejected(probe, agent):
    h = _sign_custom("POST", PROBE_URI, BODY, RFC_PRIV, _std_params("agt_x' OR '1'='1"))
    assert _reason(_post(probe, BODY, h)) == "bad_signature"


@pytest.mark.parametrize(
    "sig", ["sig1=:!!!:", "sig1=:" + b64std_encode(b"x" * 10) + ":", "sig1=abc"]
)
def test_malformed_signature_header(probe, agent, sig):
    h = _sign(agent)
    h["Signature"] = sig
    assert _reason(_post(probe, BODY, h)) == "bad_signature"


def test_bad_signature_does_not_burn_nonce(probe, agent):
    import base64

    h = _sign(agent)
    raw = bytearray(base64.b64decode(h["Signature"][len("sig1=:") : -1]))
    raw[0] ^= 0xFF
    bad = dict(h)
    bad["Signature"] = "sig1=:" + b64std_encode(bytes(raw)) + ":"
    assert _reason(_post(probe, BODY, bad)) == "bad_signature"
    assert _post(probe, BODY, h).status_code == 200


def test_same_nonce_other_agent_ok(probe, sig_db, agent):
    a2 = Agent(
        id=new_id("agt"), user_id=agent.user_id, name="t2", public_key=RFC_PUB,
        device_id="d2", verified=False,
    )
    sig_db.add(a2)
    sig_db.commit()
    n = "6f1c2b9e-3d4a-4b8c-9e2f-1a2b3c4d5e6f"
    for a in (agent, a2):
        h = _sign(a, nonce=n)
        assert _post(probe, BODY, h).status_code == 200


def test_expired_nonce_row_cleaned_and_reusable(probe, sig_db, agent):
    old = datetime.now(UTC) - timedelta(seconds=700)
    n = "11111111-1111-4111-8111-111111111111"
    m = "22222222-2222-4222-8222-222222222222"
    sig_db.add(Nonce(agent_id=agent.id, nonce=n, seen_at=old))
    sig_db.add(Nonce(agent_id=agent.id, nonce=m, seen_at=old))
    sig_db.commit()
    assert _post(probe, BODY, _sign(agent, nonce=n)).status_code == 200
    sig_db.expire_all()
    assert sig_db.get(Nonce, (agent.id, m)) is None
    assert sig_db.get(Nonce, (agent.id, n)).seen_at > old


def _mk_user(db):
    u = User(id=new_id("usr"), name="U")
    db.add(u)
    db.commit()
    return u


def test_create_agent_ok(api, sig_db):
    u = _mk_user(sig_db)
    r = api.post(
        "/agents",
        json={"user_id": u.id, "name": "A", "public_key": RFC_PUB, "device_id": "dev"},
    )
    assert r.status_code == 201, r.text
    j = r.json()
    assert j["id"].startswith("agt_")
    assert j["verified"] is False
    assert j["revoked_at"] is None
    assert set(j) == {
        "id", "user_id", "name", "public_key", "device_id", "verified", "revoked_at", "created_at",
    }


@pytest.mark.parametrize("pk", [RFC_PUB + "=", b64url_encode(b"\x00" * 31), "not base64!"])
def test_create_agent_invalid_public_key(api, sig_db, pk):
    u = _mk_user(sig_db)
    r = api.post(
        "/agents", json={"user_id": u.id, "name": "A", "public_key": pk, "device_id": "dev"}
    )
    assert r.status_code == 422
    assert r.json() == {"error": "unprocessable", "reason": "invalid_public_key"}


def test_create_agent_unknown_user(api):
    r = api.post(
        "/agents",
        json={"user_id": "usr_nope", "name": "A", "public_key": RFC_PUB, "device_id": "dev"},
    )
    assert r.status_code == 404
    assert r.json() == {"error": "not_found", "reason": "user_not_found"}


def test_revoke_agent_idempotent(api, agent):
    r1 = api.post(f"/agents/{agent.id}/revoke")
    r2 = api.post(f"/agents/{agent.id}/revoke")
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json()["revoked_at"] is not None
    assert r1.json()["revoked_at"] == r2.json()["revoked_at"]


def test_revoke_unknown_agent_404(api):
    r = api.post("/agents/agt_nope/revoke")
    assert r.status_code == 404
    assert r.json() == {"error": "not_found", "reason": "agent_not_found"}


def test_agent_keys_lists_keys_with_revoked_flag(api, sig_db, agent):
    a2 = Agent(
        id=new_id("agt"), user_id=agent.user_id, name="t2", public_key=RFC_PUB,
        device_id="d2", verified=False,
    )
    sig_db.add(a2)
    sig_db.commit()
    assert api.post(f"/agents/{a2.id}/revoke").status_code == 200
    r = api.get("/.well-known/agent-keys")
    assert r.status_code == 200
    keys = {k["keyid"]: k for k in r.json()["keys"]}
    assert keys[agent.id]["revoked"] is False
    assert keys[a2.id]["revoked"] is True
    for k in (agent.id, a2.id):
        assert keys[k]["alg"] == "ed25519"
        assert keys[k]["public_key"] == RFC_PUB
        assert set(keys[k]) == {"keyid", "alg", "public_key", "revoked"}


def test_checkout_requires_signature(api):
    r = api.post("/checkout", json={})
    assert r.status_code == 401
    assert r.json() == {"error": "agent_verification_failed", "reason": "bad_signature"}
