"""Canonical JSON, base64url, Ed25519 sign/verify and UTC time helpers.

Canonical JSON follows plans/CONTRACTS.md exactly. Keys are base64url (no
padding) raw 32-byte Ed25519 values. ``settings`` is read at call time so tests
can monkeypatch the wallet key.
"""
from __future__ import annotations

import base64
import functools
import json
import re
from datetime import datetime, timezone
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

from app.config import settings

_B64URL_RE = re.compile(r"^[A-Za-z0-9_-]*$")


def canonical_json(obj: Any) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def b64url_decode(s: str) -> bytes:
    if not isinstance(s, str) or not _B64URL_RE.match(s) or len(s) % 4 == 1:
        raise ValueError("invalid base64url")
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


@functools.lru_cache(maxsize=8)
def load_private_key(b64: str) -> Ed25519PrivateKey:
    raw = b64url_decode(b64.strip())
    if len(raw) != 32:
        raise ValueError("Ed25519 private key must be 32 raw bytes (base64url, no padding)")
    return Ed25519PrivateKey.from_private_bytes(raw)


def public_key_b64(pub: Ed25519PublicKey) -> str:
    return b64url_encode(
        pub.public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    )


def wallet_private_key() -> Ed25519PrivateKey:
    return load_private_key(settings.require("INTENTLOCK_WALLET_PRIVATE_KEY"))


def wallet_public_key() -> Ed25519PublicKey:
    return wallet_private_key().public_key()


def sign_payload(obj: Any, private_key: Ed25519PrivateKey | None = None) -> str:
    key = private_key or wallet_private_key()
    return b64url_encode(key.sign(canonical_json(obj)))


def verify_payload(obj: Any, signature: str, public_key: Ed25519PublicKey | None = None) -> bool:
    """Never raises on malformed input. A missing wallet key (RuntimeError) surfaces."""
    try:
        pub = public_key or wallet_public_key()
        sig = b64url_decode(signature)
        if len(sig) != 64:
            return False
        pub.verify(sig, canonical_json(obj))
        return True
    except (InvalidSignature, ValueError, TypeError):
        return False


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def to_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def utc_seconds(dt: datetime) -> datetime:
    return to_utc(dt).replace(microsecond=0)


def iso_z(dt: datetime) -> str:
    return utc_seconds(dt).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso_z(s: str) -> datetime:
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
