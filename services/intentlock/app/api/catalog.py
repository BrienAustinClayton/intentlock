"""Catalog router — GET /catalog.

Serves normalised product rows from data/seed/catalog.json.
Supports optional filtering by merchant, category, and full-text search.
"""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Query

router = APIRouter(tags=["catalog"])

log = logging.getLogger(__name__)

# app/api/catalog.py lives at <repo>/services/intentlock/app/api/catalog.py
# parents: [0]=api  [1]=app  [2]=intentlock  [3]=services  [4]=<repo-root>
_REPO_ROOT = Path(__file__).resolve().parents[4]
_CATALOG_PATH = _REPO_ROOT / "data" / "seed" / "catalog.json"


@lru_cache(maxsize=1)
def _load_catalog() -> list[dict[str, Any]]:
    """Load catalog.json once and cache in memory.

    Raises RuntimeError when the file is missing so a misconfigured
    deployment fails loudly rather than serving an empty response.
    """
    if not _CATALOG_PATH.exists():
        log.error("catalog.json not found at %s — run scripts/seed_catalog.py first", _CATALOG_PATH)
        raise RuntimeError(
            f"catalog.json not found at {_CATALOG_PATH}. "
            "Run `uv run python ../../scripts/seed_catalog.py` from services/intentlock/."
        )
    return json.loads(_CATALOG_PATH.read_text(encoding="utf-8"))  # type: ignore[return-value]


@router.get("/catalog")
def get_catalog(
    merchant: Optional[str] = Query(None, description="Filter by merchant slug"),
    category: Optional[str] = Query(None, description="Filter by category slug"),
    q: Optional[str] = Query(None, description="Full-text search over title + description"),
) -> list[dict[str, Any]]:
    """Return cached catalog rows.

    All query params are optional; omitting them returns the full catalog.
    """
    rows = _load_catalog()

    if merchant:
        rows = [r for r in rows if r.get("merchant") == merchant]
    if category:
        rows = [r for r in rows if r.get("category") == category]
    if q:
        q_lower = q.lower()
        rows = [
            r for r in rows
            if q_lower in (r.get("title") or "").lower()
            or q_lower in (r.get("description") or "").lower()
        ]

    return rows
