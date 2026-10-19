"""Vault router — GET /vault/setup, GET /vault/return (CONTRACTS)."""
from __future__ import annotations

import logging
import re
import threading
import time
import uuid
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.config import settings, web_origins
from app.db import get_db
from app.models import User
from app.paypal import service as paypal

router = APIRouter(tags=["vault"])
log = logging.getLogger("intentlock.vault")
_USER_RE = re.compile(r"^usr_[A-Za-z0-9_]{1,64}$")
_TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_TTL_S = 72 * 3600
_MAX = 1000
_LOCK = threading.Lock()
_PENDING: dict[str, tuple[str, float]] = {}  # setup_token_id -> (user_id, created)
_LATEST: dict[str, str] = {}  # user_id -> latest setup_token_id


def _bad(reason: str):
    raise HTTPException(400, detail={"error": "bad_request", "reason": reason})


def _web() -> str:
    return web_origins()[0]


def _remember(sid: str, uid: str) -> None:
    now = time.monotonic()
    with _LOCK:
        for k in [k for k, (_, t) in _PENDING.items() if now - t > _TTL_S]:
            _PENDING.pop(k, None)
        while len(_PENDING) >= _MAX:
            _PENDING.pop(next(iter(_PENDING)))
        _PENDING[sid] = (uid, now)
        _LATEST[uid] = sid
        while len(_LATEST) > _MAX:
            _LATEST.pop(next(iter(_LATEST)))


def _pending_user(sid: str):
    with _LOCK:
        v = _PENDING.get(sid)
    return v[0] if v and time.monotonic() - v[1] <= _TTL_S else None


def reset_pending() -> None:  # tests
    with _LOCK:
        _PENDING.clear()
        _LATEST.clear()


@router.get("/vault/setup")
def vault_setup(user_id: str | None = None, db: Session = Depends(get_db)):
    if not user_id or not _USER_RE.fullmatch(user_id):
        _bad("invalid_user_id")
    if db.get(User, user_id) is None:
        raise HTTPException(404, detail={"error": "not_found", "reason": "user not found"})
    base = (settings.PUBLIC_BASE_URL or "").rstrip("/")
    if not base:
        raise HTTPException(
            503, detail={"error": "not_configured", "reason": "PUBLIC_BASE_URL not set"}
        )
    return_url = f"{base}/vault/return?user_id={quote(user_id)}"
    cancel_url = f"{_web()}/wallet?vaulted=0&reason=cancelled"
    try:
        sid, approve_url = paypal.create_setup_token(
            return_url, cancel_url, f"setup-{uuid.uuid4().hex}"
        )
    except paypal.PayPalError as e:
        log.warning("vault.setup_failed code=%s debug_id=%s", e.code, e.debug_id)
        raise HTTPException(502, detail={"error": "paypal_error", "reason": e.code}) from None
    _remember(sid, user_id)
    return {"approve_url": approve_url}


@router.get("/vault/return")
def vault_return(request: Request, db: Session = Depends(get_db)):
    q = request.query_params
    uid = q.get("user_id") or None
    tok = q.get("approval_token_id") or q.get("approval_session_id") or q.get("token") or None
    if uid is not None and not _USER_RE.fullmatch(uid):
        _bad("invalid_user_id")
    if tok is not None and not _TOKEN_RE.fullmatch(tok):
        _bad("invalid_token")
    if tok is None and uid is not None:
        with _LOCK:
            tok = _LATEST.get(uid)
    mapped = _pending_user(tok) if tok else None
    if uid is None:
        uid = mapped
    elif mapped is not None and mapped != uid:
        _bad("setup_token_user_mismatch")
    if not uid or not tok:
        _bad("missing_parameters")
    user = db.get(User, uid)
    if user is None:
        raise HTTPException(404, detail={"error": "not_found", "reason": "user not found"})
    try:
        pt = paypal.exchange_payment_token(tok)
    except paypal.PayPalError as e:
        log.warning("vault.exchange_failed code=%s debug_id=%s", e.code, e.debug_id)
        return RedirectResponse(f"{_web()}/wallet?vaulted=0&reason=paypal_error", status_code=303)
    user.paypal_payment_token = pt
    db.commit()
    log.info("vault.vaulted user_id=%s token_suffix=%s", uid, pt[-4:])
    return RedirectResponse(f"{_web()}/wallet?vaulted=1", status_code=303)
