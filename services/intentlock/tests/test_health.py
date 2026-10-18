"""Tests for health endpoint, error shapes, CORS, and settings loading.

No database connection is required.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Make sure the service root is importable regardless of cwd
SERVICE_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVICE_ROOT))

from app.main import app, _web_origin  # noqa: E402


client = TestClient(app, raise_server_exceptions=False)


# ------------------------------------------------------------------ #
# Health
# ------------------------------------------------------------------ #

def test_health_ok():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert "version" in data
    assert isinstance(data["version"], str)
    assert len(data["version"]) > 0


# ------------------------------------------------------------------ #
# 404 shape — unknown path returns {"error", "reason"}
# ------------------------------------------------------------------ #

def test_404_shape():
    response = client.get("/no-such-endpoint-xyz")
    assert response.status_code == 404
    data = response.json()
    assert data.get("error") == "not_found"
    assert "reason" in data


# ------------------------------------------------------------------ #
# Dict-detail passthrough (P1-T05 pattern)
# ------------------------------------------------------------------ #

def test_dict_detail_passthrough():
    """An HTTPException with a dict detail should be forwarded as-is."""
    from fastapi import HTTPException
    from fastapi.testclient import TestClient as TC
    from fastapi import FastAPI

    mini = FastAPI()

    @mini.get("/trigger")
    async def trigger():
        raise HTTPException(
            status_code=401,
            detail={"error": "agent_verification_failed", "reason": "stale"},
        )

    from app.errors import http_exception_handler
    from starlette.exceptions import HTTPException as StarletteHTTPException

    mini.add_exception_handler(StarletteHTTPException, http_exception_handler)  # type: ignore[arg-type]
    mini.add_exception_handler(HTTPException, http_exception_handler)  # type: ignore[arg-type]

    tc = TC(mini, raise_server_exceptions=False)
    r = tc.get("/trigger")
    assert r.status_code == 401
    data = r.json()
    assert data == {"error": "agent_verification_failed", "reason": "stale"}


# ------------------------------------------------------------------ #
# CORS — request from a disallowed origin must NOT get ACAO header
# ------------------------------------------------------------------ #

def test_cors_rejects_other_origin():
    other_origin = "http://evil.example.com"
    # Ensure it is actually different from the configured origin.
    assert other_origin != _web_origin

    response = client.options(
        "/health",
        headers={
            "Origin": other_origin,
            "Access-Control-Request-Method": "GET",
        },
    )
    acao = response.headers.get("access-control-allow-origin", "")
    assert acao != other_origin, (
        f"CORS should not allow '{other_origin}', but got Allow-Origin: {acao!r}"
    )


def test_cors_allows_configured_origin():
    response = client.options(
        "/health",
        headers={
            "Origin": _web_origin,
            "Access-Control-Request-Method": "GET",
        },
    )
    acao = response.headers.get("access-control-allow-origin", "")
    assert acao == _web_origin, (
        f"Expected Allow-Origin {_web_origin!r}, got {acao!r}"
    )


# ------------------------------------------------------------------ #
# Settings load .env when present (value presence only — no printing)
# ------------------------------------------------------------------ #

def test_settings_loads_env_file():
    """Settings reads the .env file at services/intentlock/.env.
    We only assert the object can be imported; the env file may or may
    not exist in CI, so we only check types, never values.
    """
    from app.config import Settings

    s = Settings()
    # PORT always has a default and must be an int.
    assert isinstance(s.PORT, int)
    # WEB_ORIGIN is either None (not set) or a non-empty string.
    assert s.WEB_ORIGIN is None or isinstance(s.WEB_ORIGIN, str)


def test_settings_require_raises_for_missing():
    from app.config import Settings

    s = Settings()
    # Force a field to None regardless of env so the raise path is tested.
    object.__setattr__(s, "CHANNEL3_API_KEY", None)
    with pytest.raises(RuntimeError, match="CHANNEL3_API_KEY"):
        s.require("CHANNEL3_API_KEY")


# ------------------------------------------------------------------ #
# MANIFEST parity — Settings fields must exactly match API MANIFEST
# ------------------------------------------------------------------ #

def test_settings_fields_match_manifest():
    """Every API-file entry in MANIFEST should be a Settings field and
    every Settings field (except PORT) should be in MANIFEST.
    """
    import importlib.util

    creds_path = (
        Path(__file__).resolve().parents[3]
        / ".claude/skills/setup-credentials/scripts/creds.py"
    )
    spec = importlib.util.spec_from_file_location("creds", creds_path)
    assert spec is not None, f"creds.py not found at {creds_path}"
    creds = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(creds)  # type: ignore[union-attr]

    api_file = "services/intentlock/.env"
    manifest_api_vars = {
        var for var, f, *_ in creds.MANIFEST if f == api_file
    }

    from app.config import Settings

    settings_fields = set(Settings.model_fields.keys()) - {"PORT"}

    missing_in_settings = manifest_api_vars - settings_fields
    extra_in_settings = settings_fields - manifest_api_vars

    assert not missing_in_settings, (
        f"MANIFEST vars not in Settings: {sorted(missing_in_settings)}"
    )
    assert not extra_in_settings, (
        f"Settings fields not in MANIFEST: {sorted(extra_in_settings)}"
    )
