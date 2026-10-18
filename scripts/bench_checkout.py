"""Latency benchmark for the checkout decision pipeline (P4-T08).

Usage (repo root):
    uv run --project services/intentlock python scripts/bench_checkout.py \
        [--api http://127.0.0.1:8000] [--runs 3] [--no-real] [--json out.json]

Calls POST /lab/reset, runs every /lab scenario N times, reads per-step duration_ms
from GET /orders/{id}, prints p50/p95 per step plus end-to-end request time. The first
run of each scenario (cold caches) is reported separately from the warm runs. Also times
one real signed POST /checkout with a remote page_url. Never prints keys.
"""
from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "intentlock"))

SCENARIOS = ["normal", "hidden_gift_card", "wrong_variant",
             "overpriced_merchant", "bot_farm", "revoked_agent"]
TARGET_DECISION_S = 6.0
TARGET_DIFF_S = 4.0


def pct(vals: list[float], q: float) -> float:
    if not vals:
        return float("nan")
    s = sorted(vals)
    k = (len(s) - 1) * q
    lo, hi = int(k), min(int(k) + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (k - lo)


def env_value(path: str, key: str) -> str | None:
    p = ROOT / path
    if not p.exists():
        return None
    for line in p.read_text().splitlines():
        m = re.match(rf"^{key}=(.*)$", line)
        if m:
            return m.group(1).strip()
    return None


def fmt(v: float) -> str:
    return "   n/a" if v != v else f"{v:6.0f}"


def run_once(client: httpx.Client, api: str, scenario: str) -> dict:
    # Reset first so the mandate budget is never exhausted by earlier runs (a budget
    # reject would skip every AI step and hide the latency we want to measure).
    client.post(f"{api}/lab/reset", timeout=30).raise_for_status()
    t0 = time.perf_counter()
    r = client.post(f"{api}/lab/{scenario}", json={}, timeout=60)
    e2e_ms = (time.perf_counter() - t0) * 1000
    r.raise_for_status()
    d = r.json()
    o = client.get(f"{api}/orders/{d['order_id']}", timeout=30).json()
    steps = {c["step"]: c.get("duration_ms") for c in o.get("checks", [])
             if c.get("duration_ms") is not None}
    return {"scenario": scenario, "e2e_ms": e2e_ms, "steps": steps,
            "decision": d["actual_decision"], "expected": d["expected_decision"],
            "order_id": d["order_id"]}


def report(title: str, rows: list[dict]) -> dict:
    print(f"\n== {title} (n={len(rows)}) ==")
    steps = sorted({s for r in rows for s in r["steps"]})
    print(f"{'step':18}{'p50 ms':>8}{'p95 ms':>8}{'max ms':>8}")
    out = {}
    for s in steps:
        v = [r["steps"][s] for r in rows if s in r["steps"]]
        out[s] = (pct(v, .5), pct(v, .95))
        print(f"{s:18}{fmt(pct(v, .5)):>8}{fmt(pct(v, .95)):>8}{fmt(max(v)):>8}")
    e = [r["e2e_ms"] for r in rows]
    out["_e2e"] = (pct(e, .5), pct(e, .95))
    print(f"{'END-TO-END':18}{fmt(pct(e, .5)):>8}{fmt(pct(e, .95)):>8}{fmt(max(e)):>8}")
    return out


def clear_llm_cache() -> None:
    """Empty llm_cache so the first run of each scenario really calls the LLMs."""
    from sqlalchemy import text
    from app.db import get_engine
    with get_engine().begin() as conn:
        n = conn.execute(text("delete from llm_cache")).rowcount
    print(f"llm_cache cleared ({n} rows)")


def real_checkout(client: httpx.Client, api: str) -> dict | None:
    from app.crypto.http_sig import sign_request
    client.post(f"{api}/lab/reset", timeout=30).raise_for_status()
    key = env_value("apps/agent/.env", "AGENT_PRIVATE_KEY")
    if not key or key == "__FILL_ME__":
        print("\n(real /checkout skipped: AGENT_PRIVATE_KEY not configured)")
        return None
    base = env_value("services/intentlock/.env", "PUBLIC_BASE_URL") or "http://localhost:8000"
    sc = {s["scenario"]: s for s in json.loads((ROOT / "data/lab/scenarios.json").read_text())}["normal"]
    ir = client.post(f"{api}/intents", json={"user_id": "usr_demo_priya", "agent_id": "agt_demo_shopper",
                                              "request_text": sc["request_text"]}, timeout=30)
    ir.raise_for_status()
    body = json.dumps({"intent_id": ir.json()["id"], "merchant": sc["merchant"], "cart": sc["cart"],
                       "page_urls": ["https://example.com/"], "shipping_address": None,
                       "trace_id": "bench-real"}).encode()
    h = sign_request("POST", f"{base}/checkout", body, key, "agt_demo_shopper")
    t0 = time.perf_counter()
    r = client.post(f"{api}/checkout", content=body, headers={**h, "content-type": "application/json"}, timeout=60)
    e2e_ms = (time.perf_counter() - t0) * 1000
    d = r.json()
    steps = {}
    if d.get("order_id"):
        o = client.get(f"{api}/orders/{d['order_id']}", timeout=30).json()
        steps = {c["step"]: c.get("duration_ms") for c in o.get("checks", []) if c.get("duration_ms") is not None}
    print(f"\n== real signed /checkout, page_urls=[https://example.com/] ==")
    print(f"HTTP {r.status_code} decision={d.get('decision')} status={d.get('status')} end-to-end={e2e_ms:.0f} ms")
    for s, v in steps.items():
        print(f"  {s:18}{v:>7} ms")
    return {"e2e_ms": e2e_ms, "steps": steps}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="http://127.0.0.1:8000")
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--no-real", action="store_true")
    ap.add_argument("--json", default=None)
    ap.add_argument("--clear-llm-cache", action="store_true",
                    help="delete llm_cache rows first so run 1 is a true cold run")
    a = ap.parse_args()
    if a.clear_llm_cache:
        clear_llm_cache()
    with httpx.Client() as c:
        rr = c.post(f"{a.api}/lab/reset", timeout=30)
        print(f"POST /lab/reset -> {rr.status_code}")
        rr.raise_for_status()
        all_runs: list[list[dict]] = []
        for i in range(a.runs):
            all_runs.append([run_once(c, a.api, s) for s in SCENARIOS])
        cold = all_runs[0]
        warm = [r for run in all_runs[1:] for r in run]
        print("\nper scenario (end-to-end ms):  " + "  ".join(f"run{i+1}" for i in range(a.runs)))
        for s in SCENARIOS:
            es = [next(r for r in run if r["scenario"] == s)["e2e_ms"] for run in all_runs]
            mism = [r for run in all_runs for r in run if r["scenario"] == s and r["decision"] != r["expected"]]
            print(f"  {s:20}" + "  ".join(f"{e:6.0f}" for e in es) + ("   DECISION MISMATCH" if mism else ""))
        res_cold = report("COLD: first run of each scenario", cold)
        res_warm = report("WARM: runs 2..N", warm) if warm else {}
        real = None if a.no_real else real_checkout(c, a.api)
        try:
            u = c.get(f"{a.api}/llm/usage", timeout=15).json()
            print(f"\n/llm/usage: {json.dumps(u)[:400]}")
        except Exception as e:  # noqa: BLE001
            print(f"\n/llm/usage unavailable: {type(e).__name__}")

    everything = [r for run in all_runs for r in run]
    dec_p95 = pct([r["e2e_ms"] for r in everything], .95) / 1000
    diff_p95 = pct([r["steps"]["intent_diff"] for r in everything if "intent_diff" in r["steps"]], .95) / 1000
    print(f"\ndecision p95 (all runs, end-to-end) = {dec_p95:.2f}s  target < {TARGET_DECISION_S}s  "
          f"{'PASS' if dec_p95 < TARGET_DECISION_S else 'FAIL'}")
    print(f"intent_diff p95 (all runs)          = {diff_p95:.2f}s  target < {TARGET_DIFF_S}s  "
          f"{'PASS' if diff_p95 < TARGET_DIFF_S else 'FAIL'}")
    if a.json:
        Path(a.json).write_text(json.dumps({"cold": res_cold, "warm": res_warm, "real": real,
                                            "decision_p95_s": dec_p95, "intent_diff_p95_s": diff_p95}, indent=1))
    return 0 if dec_p95 < TARGET_DECISION_S and diff_p95 < TARGET_DIFF_S else 1


if __name__ == "__main__":
    raise SystemExit(main())
