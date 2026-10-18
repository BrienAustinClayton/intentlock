"""Ed25519 key helpers. Keys are raw 32 bytes, base64url without padding."""

from __future__ import annotations

import base64
import binascii
import re

from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    PublicFormat,
)

_B64URL_RE = re.compile(r"[A-Za-z0-9_-]+")


def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def b64url_decode(s: str) -> bytes:
    s = s.strip()
    if not _B64URL_RE.fullmatch(s):
        raise ValueError("invalid base64url (no padding allowed)")
    try:
        return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))
    except (binascii.Error, ValueError) as e:
        raise ValueError("invalid base64url") from e


def b64std_encode(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def b64std_decode(s: str) -> bytes:
    try:
        return base64.b64decode(s, validate=True)
    except (binascii.Error, ValueError) as e:
        raise ValueError("invalid base64") from e


def load_private_key(b64: str) -> Ed25519PrivateKey:
    raw = b64url_decode(b64)
    if len(raw) != 32:
        raise ValueError("ed25519 private key must be 32 bytes")
    return Ed25519PrivateKey.from_private_bytes(raw)


def load_public_key(b64: str) -> Ed25519PublicKey:
    raw = b64url_decode(b64)
    if len(raw) != 32:
        raise ValueError("ed25519 public key must be 32 bytes")
    return Ed25519PublicKey.from_public_bytes(raw)


def private_key_b64(key: Ed25519PrivateKey) -> str:
    return b64url_encode(
        key.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption())
    )


def public_key_b64(key: Ed25519PrivateKey | Ed25519PublicKey) -> str:
    if isinstance(key, Ed25519PrivateKey):
        key = key.public_key()
    return b64url_encode(key.public_bytes(Encoding.Raw, PublicFormat.Raw))


def generate_keypair_b64() -> tuple[str, str]:
    key = Ed25519PrivateKey.generate()
    return private_key_b64(key), public_key_b64(key)
