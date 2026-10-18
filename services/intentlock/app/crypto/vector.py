"""Fixed inputs and builder for the RFC 9421 agent-signature reference vector.

Uses the RFC 9421 Appendix B.1.4 test-key-ed25519 (a published test key, not a secret).
"""

from __future__ import annotations

import hashlib

from app.crypto.http_sig import (
    build_signature_base,
    parse_signature_input,
    sign_request,
)

VECTOR_PRIVATE_KEY = "n4Ni-HpISpVObnQMW0wOhCKROaIKqKtW_2ZYb2p9KcU"
VECTOR_PUBLIC_KEY = "JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs"
VECTOR_KEYID = "agt_demo_shopper"
VECTOR_METHOD = "POST"
VECTOR_TARGET_URI = "http://localhost:8000/checkout"
VECTOR_BODY = (
    '{"cart":[{"category":"groceries","currency":"USD","product_id":"fm_oat_milk_1l",'
    '"qty":2,"title":"Oat Milk 1L","unit_price":3.49,'
    '"url":"https://freshmart.example/p/oat-milk-1l","variant":"1L"}],'
    '"intent_id":"int_01JABCDEFGHJKMNPQRSTVWXYZ0","merchant":"freshmart",'
    '"page_urls":["https://freshmart.example/p/oat-milk-1l"],'
    '"shipping_address":{"city":"Austin","country":"US","line1":"1 Demo St",'
    '"postal_code":"78701","state":"TX"},"trace_id":"trace_test_vector_1"}'
)
VECTOR_CREATED = 1760572800
VECTOR_EXPIRES = 1760573100
VECTOR_NONCE = "6f1c2b9e-3d4a-4b8c-9e2f-1a2b3c4d5e6f"


def build_vector() -> dict:
    body = VECTOR_BODY.encode("utf-8")
    headers = sign_request(
        VECTOR_METHOD,
        VECTOR_TARGET_URI,
        body,
        VECTOR_PRIVATE_KEY,
        VECTOR_KEYID,
        created=VECTOR_CREATED,
        expires=VECTOR_EXPIRES,
        nonce=VECTOR_NONCE,
    )
    sp = parse_signature_input(headers["Signature-Input"])
    base = build_signature_base(
        VECTOR_METHOD,
        VECTOR_TARGET_URI,
        {"content-digest": headers["Content-Digest"]},
        sp,
    )
    sig_header = headers["Signature"]
    signature_b64 = sig_header[len("sig1=:") : -1]
    return {
        "version": 1,
        "description": (
            "IntentLock RFC 9421 agent request signature reference vector "
            "(Python reference, P1-T05). TS signer must reproduce expected.* byte for byte."
        ),
        "key": {
            "alg": "ed25519",
            "encoding": "base64url, no padding, raw 32 bytes",
            "source": "RFC 9421 Appendix B.1.4 test-key-ed25519 (public test key, not a secret)",
            "private_key": VECTOR_PRIVATE_KEY,
            "public_key": VECTOR_PUBLIC_KEY,
        },
        "request": {
            "method": VECTOR_METHOD,
            "target_uri": VECTOR_TARGET_URI,
            "body": VECTOR_BODY,
            "body_encoding": "utf-8",
        },
        "params": {
            "label": "sig1",
            "components": list(sp.components),
            "created": VECTOR_CREATED,
            "expires": VECTOR_EXPIRES,
            "nonce": VECTOR_NONCE,
            "keyid": VECTOR_KEYID,
            "alg": "ed25519",
            "tag": "intentlock-agent",
        },
        "expected": {
            "content_digest": headers["Content-Digest"],
            "signature_params": headers["Signature-Input"][len("sig1=") :],
            "signature_base": base,
            "signature_base_sha256": hashlib.sha256(base.encode("ascii")).hexdigest(),
            "signature_b64": signature_b64,
            "headers": headers,
        },
    }
