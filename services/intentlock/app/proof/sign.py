"""Proof of Intent signing: sha256 of canonical JSON, Ed25519 over the 32 digest bytes."""
from __future__ import annotations

import hashlib
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

from app.config import settings
from app.signing import b64url_decode, b64url_encode, canonical_json, load_private_key, public_key_b64


def digest(bundle: Any) -> bytes:
    return hashlib.sha256(canonical_json(bundle)).digest()


def sha256_hex(bundle: Any) -> str:
    return digest(bundle).hex()


def proof_private_key() -> Ed25519PrivateKey:
    return load_private_key(settings.require("INTENTLOCK_PROOF_PRIVATE_KEY"))


def proof_public_key() -> Ed25519PublicKey:
    return proof_private_key().public_key()


def proof_public_key_b64() -> str:
    return public_key_b64(proof_public_key())


def sign_bundle(bundle: Any, private_key: Ed25519PrivateKey | None = None) -> dict:
    """Return {sha256, signature}; signature is base64url Ed25519 over the raw digest bytes."""
    key = private_key or proof_private_key()
    d = digest(bundle)
    return {"sha256": d.hex(), "signature": b64url_encode(key.sign(d))}


def verify_bundle(bundle: Any, signature: str, public_key: Ed25519PublicKey | None = None) -> tuple[bool, str | None]:
    """Return (valid, sha256). Never raises on malformed bundle/signature input."""
    try:
        d = digest(bundle)
    except (TypeError, ValueError):
        return False, None
    try:
        pub = public_key or proof_public_key()
        sig = b64url_decode(signature)
        if len(sig) != 64:
            return False, d.hex()
        pub.verify(sig, d)
        return True, d.hex()
    except (InvalidSignature, ValueError, TypeError):
        return False, d.hex()
