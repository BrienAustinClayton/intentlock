"""Who may call a route: the operator (admin key), or the agent that signed the request.

User routes use app.auth.current_user; agent checkout uses the RFC 9421 signature. The older demo routes
(/mandates, /orders, /lab, …) are operator-only: closed unless ADMIN_API_KEY is set and sent as X-Admin-Key.
"""
from __future__ import annotations

import hmac
from typing import Optional

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.deps import require_agent
from app.models import Agent

ADMIN_HEADER = "x-admin-key"


def _admin_key() -> Optional[str]:
    k = (settings.ADMIN_API_KEY or "").strip()
    return k if len(k) >= 16 and k != "__FILL_ME__" else None


def is_admin(request: Request) -> bool:
    key, sent = _admin_key(), request.headers.get(ADMIN_HEADER)
    return bool(key and sent and hmac.compare_digest(key.encode(), sent.encode()))


def require_admin(request: Request) -> None:
    if not is_admin(request):
        raise HTTPException(401, detail={"error": "unauthorized", "reason": "operator key required"})


async def agent_or_admin(request: Request, db: Session = Depends(get_db)) -> Optional[Agent]:
    """The signing agent, or None for the operator. Anyone else gets 401."""
    if is_admin(request):
        return None
    return await require_agent(request, db)
