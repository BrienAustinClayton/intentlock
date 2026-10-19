"""Live /graph/ask (Jev routing + Groq answer) against the dev database. Run with -m llm.

Resets demo orders (scripts/reset_demo.py), runs two void lab scenarios, then asks.
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

import pytest
ADMIN = {"X-Admin-Key": "test-operator-key-0123456789"}  # same key as conftest._operator_key

SERVICE_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVICE_ROOT))


@pytest.mark.llm
def test_live_voided_today_cites_at_least_two_facts(request, monkeypatch):
    if "llm" not in (request.config.getoption("-m") or ""):
        pytest.skip("live test; run with -m llm")
    from app.config import settings

    for key in (settings.LLM_FAST_API_KEY, settings.LLM_SMART_API_KEY):
        if not key or key == "__FILL_ME__":
            pytest.skip("LLM keys not configured")
    monkeypatch.setenv("PAYPAL_MODE", "mock")
    for k in ("PIPELINE_MODE", "PIPELINE_STUBS"):
        monkeypatch.delenv(k, raising=False)

    proc = subprocess.run(
        ["uv", "run", "python", "../../scripts/reset_demo.py"],
        cwd=SERVICE_ROOT, capture_output=True, text=True, timeout=120,
    )
    assert proc.returncode == 0, proc.stderr[-500:]

    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app, headers=ADMIN) as c:
        for s in ("hidden_gift_card", "bot_farm"):
            r = c.post(f"/lab/{s}", json={})
            assert r.status_code == 200, r.text
            assert r.json()["actual_decision"] == "void", r.json()
        r = c.post("/graph/ask", json={"question": "why were orders voided today?"})
        assert r.status_code == 200, r.text
        j = r.json()
    assert set(j) == {"answer", "facts", "evidence"}
    assert len(j["facts"]) >= 3 and len(j["answer"]) <= 600
    cited = {int(n) for n in re.findall(r"\[F(\d+)\]", j["answer"])}
    assert len(cited) >= 2 and all(1 <= n <= len(j["facts"]) for n in cited), j
    print(j["answer"])
