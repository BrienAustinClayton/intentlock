"""RFC 9421 HTTP Message Signatures (Ed25519) for IntentLock agent requests.

Strict single profile: sig1 over ("@method" "@target-uri" "content-digest") with
params created, expires, nonce, keyid, alg, tag.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import re
import time
import uuid
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal
from urllib.parse import urlsplit

from cryptography.exceptions import InvalidSignature
from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session
from starlette.requests import Request

from app.config import settings
from app.crypto.keys import (
    b64std_decode,
    b64std_encode,
    load_private_key,
    load_public_key,
)
from app.models import Agent, Nonce

logger = logging.getLogger("intentlock.http_sig")

LABEL = "sig1"
COMPONENTS: tuple[str, ...] = ("@method", "@target-uri", "content-digest")
PARAM_ORDER: tuple[str, ...] = ("created", "expires", "nonce", "keyid", "alg", "tag")
ALG = "ed25519"
TAG = "intentlock-agent"
MAX_SKEW_S = 300
MAX_LIFETIME_S = 480
DEFAULT_LIFETIME_S = 300
NONCE_TTL_S = 600

Reason = Literal[
    "bad_signature", "unknown_key", "revoked", "stale", "replay", "digest_mismatch"
]
REASONS: frozenset[str] = frozenset(
    {"bad_signature", "unknown_key", "revoked", "stale", "replay", "digest_mismatch"}
)


class AgentVerificationError(Exception):
    reason: str

    def __init__(self, reason: Reason) -> None:
        if reason not in REASONS:
            raise ValueError(f"unknown verification reason: {reason}")
        super().__init__(reason)
        self.reason = reason


class SignatureBaseError(ValueError):
    pass


@dataclass(frozen=True)
class SignatureParams:
    components: tuple[str, ...]
    params: tuple[tuple[str, int | str], ...]

    def get(self, name: str) -> int | str | None:
        for k, v in self.params:
            if k == name:
                return v
        return None


# --- structured-field helpers -------------------------------------------------

_SF_STRING = r'"(?:[\x20\x21\x23-\x5b\x5d-\x7e]|\\[\\"])*"'
_KEY = r"[a-z*][a-z0-9_.*-]*"
_SF_INT = r"-?[0-9]{1,15}"
_PARAM_RE = re.compile(rf";({_KEY})=({_SF_INT}|{_SF_STRING})")
_SIG_INPUT_RE = re.compile(
    rf"({_KEY})=\(((?:{_SF_STRING})(?: {_SF_STRING})*)?\)"
    rf"((?:;{_KEY}=(?:{_SF_INT}|{_SF_STRING}))*)"
)
_ITEM_RE = re.compile(_SF_STRING)
_SIGNATURE_RE = re.compile(r"sig1=:([A-Za-z0-9+/]+={0,2}):")
_DIGEST_RE = re.compile(r"sha-256=:([A-Za-z0-9+/]{43}=):")
_NONCE_RE = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"
)
_KEYID_RE = re.compile(r"[A-Za-z0-9_-]{1,64}")


def sf_string(value: str) -> str:
    if any(not (0x20 <= ord(c) <= 0x7E) for c in value):
        raise ValueError("sf-string must be printable ASCII")
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _sf_unstring(token: str) -> str:
    return re.sub(r'\\(["\\])', r"\1", token[1:-1])


def _sf_value(v: int | str) -> str:
    if isinstance(v, bool):
        raise ValueError("bool params not supported")
    return str(v) if isinstance(v, int) else sf_string(v)


def serialize_signature_params(sp: SignatureParams) -> str:
    inner = "(" + " ".join(sf_string(c) for c in sp.components) + ")"
    return inner + "".join(f";{k}={_sf_value(v)}" for k, v in sp.params)


# --- signature base -----------------------------------------------------------


def _component_value(
    name: str, method: str, target_uri: str, headers: Mapping[str, str]
) -> str:
    if name == "@method":
        return method
    if name == "@target-uri":
        return target_uri
    if name == "@authority":
        parts = urlsplit(target_uri)
        host = (parts.hostname or "").lower()
        port = parts.port
        default = {"http": 80, "https": 443}.get(parts.scheme)
        return host if port is None or port == default else f"{host}:{port}"
    if name == "@path":
        return urlsplit(target_uri).path or "/"
    if name.startswith("@"):
        raise SignatureBaseError(f"unsupported derived component {name}")
    if name != name.lower():
        raise SignatureBaseError("component names must be lowercase")
    if name not in headers:
        raise SignatureBaseError(f"missing header {name}")
    return headers[name].strip(" \t")


def build_signature_base(
    method: str,
    target_uri: str,
    headers: Mapping[str, str],
    params: SignatureParams,
) -> str:
    lowered = {k.lower(): v for k, v in headers.items()}
    seen: set[str] = set()
    lines: list[str] = []
    for c in params.components:
        if c in seen:
            raise SignatureBaseError("duplicate component")
        seen.add(c)
        lines.append(f"{sf_string(c)}: {_component_value(c, method, target_uri, lowered)}")
    lines.append(f'"@signature-params": {serialize_signature_params(params)}')
    return "\n".join(lines)


def content_digest(body: bytes) -> str:
    return "sha-256=:" + b64std_encode(hashlib.sha256(body).digest()) + ":"


# --- signing ------------------------------------------------------------------


def sign_request(
    method: str,
    target_uri: str,
    body: bytes,
    private_key_b64: str,
    keyid: str,
    *,
    created: int | None = None,
    expires: int | None = None,
    nonce: str | None = None,
    tag: str = TAG,
) -> dict[str, str]:
    created = int(time.time()) if created is None else created
    expires = created + DEFAULT_LIFETIME_S if expires is None else expires
    nonce = str(uuid.uuid4()) if nonce is None else nonce
    digest = content_digest(body)
    sp = SignatureParams(
        components=COMPONENTS,
        params=(
            ("created", created),
            ("expires", expires),
            ("nonce", nonce),
            ("keyid", keyid),
            ("alg", ALG),
            ("tag", tag),
        ),
    )
    base = build_signature_base(method, target_uri, {"content-digest": digest}, sp)
    sig = load_private_key(private_key_b64).sign(base.encode("ascii"))
    return {
        "Content-Type": "application/json",
        "Content-Digest": digest,
        "Signature-Input": f"{LABEL}={serialize_signature_params(sp)}",
        "Signature": f"{LABEL}=:{b64std_encode(sig)}:",
    }


# --- parsing ------------------------------------------------------------------


def parse_signature_input(value: str) -> SignatureParams:
    bad = AgentVerificationError
    v = value.strip(" \t")
    if len(v) > 1024:
        raise bad("bad_signature")
    m = _SIG_INPUT_RE.fullmatch(v)
    if not m or m.group(1) != LABEL:
        raise bad("bad_signature")
    components = tuple(_sf_unstring(t) for t in _ITEM_RE.findall(m.group(2) or ""))
    if components != COMPONENTS:
        raise bad("bad_signature")
    params: list[tuple[str, int | str]] = []
    for key, raw in _PARAM_RE.findall(m.group(3)):
        params.append((key, _sf_unstring(raw) if raw.startswith('"') else int(raw)))
    names = [k for k, _ in params]
    if len(names) != len(set(names)) or set(names) != set(PARAM_ORDER):
        raise bad("bad_signature")
    sp = SignatureParams(components, tuple(params))
    created, expires = sp.get("created"), sp.get("expires")
    if (
        not isinstance(created, int)
        or not isinstance(expires, int)
        or created < 0
        or expires < 0
    ):
        raise bad("bad_signature")
    for name in ("nonce", "keyid", "alg", "tag"):
        if not isinstance(sp.get(name), str):
            raise bad("bad_signature")
    if sp.get("alg") != ALG or sp.get("tag") != TAG:
        raise bad("bad_signature")
    if not _NONCE_RE.fullmatch(sp.get("nonce")):  # type: ignore[arg-type]
        raise bad("bad_signature")
    if not _KEYID_RE.fullmatch(sp.get("keyid")):  # type: ignore[arg-type]
        raise bad("bad_signature")
    return sp


def parse_signature(value: str) -> bytes:
    m = _SIGNATURE_RE.fullmatch(value.strip(" \t"))
    if not m:
        raise AgentVerificationError("bad_signature")
    try:
        sig = b64std_decode(m.group(1))
    except ValueError:
        raise AgentVerificationError("bad_signature") from None
    if len(sig) != 64:
        raise AgentVerificationError("bad_signature")
    return sig


# --- request adapters ---------------------------------------------------------


def target_uri_for(request: Request) -> str:
    base = settings.PUBLIC_BASE_URL
    url = request.url
    uri = (base.rstrip("/") if base else f"{url.scheme}://{url.netloc}") + url.path
    return f"{uri}?{url.query}" if url.query else uri


def request_headers(request: Request) -> dict[str, str]:
    out: dict[str, str] = {}
    for k, v in request.headers.items():
        v = v.strip(" \t")
        out[k] = f"{out[k]}, {v}" if k in out else v
    return out


# --- verification -------------------------------------------------------------


def verify_signed_message(
    *,
    method: str,
    target_uri: str,
    headers: Mapping[str, str],
    body: bytes,
    db: Session,
    now: int | None = None,
) -> Agent:
    now = int(time.time()) if now is None else now
    h = {k.lower(): v for k, v in headers.items()}
    if "signature-input" not in h or "signature" not in h:
        raise AgentVerificationError("bad_signature")
    sp = parse_signature_input(h["signature-input"])
    sig = parse_signature(h["signature"])
    keyid = sp.get("keyid")
    created = sp.get("created")
    expires = sp.get("expires")
    nonce = sp.get("nonce")
    assert isinstance(keyid, str) and isinstance(nonce, str)
    assert isinstance(created, int) and isinstance(expires, int)

    agent = db.get(Agent, keyid)
    if agent is None:
        raise AgentVerificationError("unknown_key")
    if agent.revoked_at is not None:
        raise AgentVerificationError("revoked")

    if (
        created > now + MAX_SKEW_S
        or created < now - MAX_SKEW_S
        or expires < created
        or expires - created > MAX_LIFETIME_S
        or now > expires
    ):
        raise AgentVerificationError("stale")

    try:
        base = build_signature_base(method, target_uri, h, sp).encode("ascii")
        load_public_key(agent.public_key).verify(sig, base)
    except (SignatureBaseError, ValueError, UnicodeEncodeError, InvalidSignature):
        raise AgentVerificationError("bad_signature") from None

    m = _DIGEST_RE.fullmatch(h["content-digest"].strip(" \t"))
    if not m:
        raise AgentVerificationError("digest_mismatch")
    try:
        claimed = b64std_decode(m.group(1))
    except ValueError:
        raise AgentVerificationError("digest_mismatch") from None
    if not hmac.compare_digest(claimed, hashlib.sha256(body).digest()):
        raise AgentVerificationError("digest_mismatch")

    now_dt = datetime.fromtimestamp(now, tz=UTC)
    db.execute(
        delete(Nonce).where(Nonce.seen_at < now_dt - timedelta(seconds=NONCE_TTL_S))
    )
    inserted = db.execute(
        pg_insert(Nonce)
        .values(agent_id=agent.id, nonce=nonce, seen_at=now_dt)
        .on_conflict_do_nothing(index_elements=["agent_id", "nonce"])
        .returning(Nonce.nonce)
    ).first()
    if inserted is None:
        db.rollback()
        raise AgentVerificationError("replay")
    if not agent.verified:
        agent.verified = True
    db.commit()
    logger.info("agent_verified keyid=%s", agent.id)
    return agent


def verify_request(
    request: Request, body: bytes, db: Session, *, now: int | None = None
) -> Agent:
    try:
        return verify_signed_message(
            method=request.method,
            target_uri=target_uri_for(request),
            headers=request_headers(request),
            body=body,
            db=db,
            now=now,
        )
    except AgentVerificationError as e:
        logger.info("agent_verification_failed reason=%s", e.reason)
        raise
