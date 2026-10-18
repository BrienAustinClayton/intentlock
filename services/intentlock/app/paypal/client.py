"""Sandbox-only PayPal SDK client. Never log credentials or tokens."""
from __future__ import annotations

import threading

from app.config import settings
from app.paypal.service import PayPalError

PAYPAL_TIMEOUT_S = 20
_LOCK = threading.Lock()
_CLIENT = None


def _creds() -> tuple[str, str]:
    cid, secret = settings.PAYPAL_CLIENT_ID, settings.PAYPAL_CLIENT_SECRET
    bad = (None, "", "__FILL_ME__")
    if cid in bad or secret in bad:
        raise PayPalError("not_configured")
    return cid, secret


def get_client():
    global _CLIENT
    if (settings.PAYPAL_ENV or "sandbox").strip().lower() != "sandbox":
        raise PayPalError("live_env_not_allowed")
    cid, secret = _creds()
    with _LOCK:
        if _CLIENT is None:
            from paypalserversdk.configuration import Environment
            from paypalserversdk.http.auth.o_auth_2 import ClientCredentialsAuthCredentials
            from paypalserversdk.paypal_serversdk_client import PaypalServersdkClient

            _CLIENT = PaypalServersdkClient(
                client_credentials_auth_credentials=ClientCredentialsAuthCredentials(
                    o_auth_client_id=cid, o_auth_client_secret=secret
                ),
                environment=Environment.SANDBOX,
                timeout=PAYPAL_TIMEOUT_S,
                max_retries=0,
            )
        return _CLIENT


def reset_client() -> None:
    global _CLIENT
    with _LOCK:
        _CLIENT = None
