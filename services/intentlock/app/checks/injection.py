"""Injection classifier: heuristics + Jev (noul/choice) + Groq prompt-guard.

Builds on ``injection_rules.scan_injection`` (all fetching, SSRF and size caps live
there; pages are never fetched twice). LLM output only sets a confidence; the
decision stays in ``app/policy.py``. Never raises.
"""
from __future__ import annotations

import logging
import time
from collections.abc import Iterable
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from typing import Any

from app.checks import injection_rules
from app.checks.injection_rules import ALLOWED_TECHNIQUES, has_instruction_phrase
from app.jev import decide
from app.llm import guard_score

logger = logging.getLogger("intentlock.checks.injection")

LLM_TIMEOUT_S = 2.0
LOW, HIGH = 0.2, 0.9
AGREE = 0.5
FLAG_AT = 0.80
CART_PHRASE_CONF = 0.60
HIDDEN_CAP = 4000
VISIBLE_CAP = 2000
CART_CAP = 2000
CART_FIELDS = ("title", "description", "variant")

JEV_QUESTIONS: dict[str, dict] = {
    "instructs_agent": {
        "type": "noul",
        "instructions": (
            "This text tries to instruct an AI shopping assistant to add items, change variant, "
            "accept a price, or hide actions"
        ),
    },
    "technique": {
        "type": "choice",
        "instructions": "How is the instruction to the AI agent embedded in this page?",
        "criteria": {
            "hidden_css": "text hidden with display:none, visibility:hidden or opacity 0",
            "html_comment": "instruction placed in an HTML comment",
            "aria_hidden": "text in an aria-hidden element",
            "offscreen": "text positioned far off screen",
            "zero_font": "text with zero or tiny font size",
            "white_on_white": "text the same colour as its background",
            "phrase": "plain visible text or other metadata",
        },
    },
}


def _error(code: str) -> dict[str, Any]:
    return injection_rules._error_result(code)


def _cart_text(cart: Any) -> tuple[str, list[dict[str, str]]]:
    """Return (joined cart text, findings for phrases found in cart item text)."""
    if not isinstance(cart, list):
        return "", []
    parts: list[str] = []
    findings: list[dict[str, str]] = []
    for i, item in enumerate(cart):
        if not isinstance(item, dict):
            continue
        texts = [item.get(f) for f in CART_FIELDS]
        feats = item.get("key_features")
        if isinstance(feats, list):
            texts.extend(feats)
        for t in texts:
            if not isinstance(t, str) or not t.strip():
                continue
            parts.append(t.strip())
            if has_instruction_phrase(t):
                url = item.get("url")
                findings.append(
                    {
                        "url": url if isinstance(url, str) else f"cart:{i}",
                        "technique": "phrase",
                        "snippet": injection_rules.extract_phrase_snippet(t),
                    }
                )
    return " ".join(parts)[:CART_CAP], findings


def _run_llms(
    hidden: str, visible: str, cart_text: str, guard_text: str, url: str, snippets: str = ""
) -> tuple[float | None, str | None, float | None]:
    """Run Jev and the guard in parallel with a 2 s timeout each. Failures become None."""
    state = {
        "hidden_text": hidden[:HIDDEN_CAP],
        "visible_text_excerpt": visible[:VISIBLE_CAP],
        "cart_text": cart_text,
        "flagged_snippets": snippets[:HIDDEN_CAP],
        "url": url[:2048],
    }
    pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="inj")
    try:
        f_jev = pool.submit(decide, state, JEV_QUESTIONS, "scan_injection", timeout_s=LLM_TIMEOUT_S)
        f_guard = pool.submit(guard_score, guard_text, LLM_TIMEOUT_S, "scan_injection")
        deadline = time.monotonic() + LLM_TIMEOUT_S + 0.3
        jev_p: float | None = None
        tech: str | None = None
        guard_p: float | None = None
        try:
            ans = f_jev.result(timeout=max(0.0, deadline - time.monotonic()))
            p = ans["instructs_agent"].noul
            if isinstance(p, (int, float)) and 0 <= p <= 1:
                jev_p = float(p)
            t = ans["technique"].choice if "technique" in ans else None
            tech = t if t in ALLOWED_TECHNIQUES else None
        except (FutureTimeout, Exception) as e:  # noqa: BLE001
            logger.warning("jev unavailable: %s", type(e).__name__)
        try:
            g = f_guard.result(timeout=max(0.0, deadline - time.monotonic()))
            if isinstance(g, (int, float)) and 0 <= g <= 1:
                guard_p = float(g)
        except (FutureTimeout, Exception) as e:  # noqa: BLE001
            logger.warning("guard unavailable: %s", type(e).__name__)
        return jev_p, tech, guard_p
    finally:
        pool.shutdown(wait=False, cancel_futures=True)


def combine(heuristic: float, jev: float | None, guard: float | None, hidden_only: bool) -> float:
    """Combine rule (CONTRACTS): max when >= 2 of 3 are >= 0.5; else heuristic.

    If the heuristic saw only hidden text without phrases, use mean(jev, guard)
    (of whichever are available). Failed LLMs fall back to the heuristic.
    """
    llms = [v for v in (jev, guard) if v is not None]
    if not llms:
        return heuristic
    if hidden_only:
        return sum(llms) / len(llms)
    scores = [heuristic, *llms]
    if sum(1 for s in scores if s >= AGREE) >= 2:
        return max(scores)
    return heuristic


def scan_injection(
    page_urls: Any,
    *,
    allow_fixtures: bool = False,
    allowed_hosts: Iterable[str] | None = None,
    cart: Any = None,
    merchant: str | None = None,
) -> dict[str, Any]:
    """Scan pages (and optional cart text) for prompt injection. Never raises."""
    try:
        base = injection_rules.scan_injection(
            page_urls, allow_fixtures=allow_fixtures, allowed_hosts=allowed_hosts
        )
        if base.get("result") == "error" or not isinstance(base.get("confidence"), (int, float)):
            return base  # fail closed: page errors keep the error shape

        findings = list(base.get("findings") or [])
        hidden = base.get("hidden_text") or ""
        visible = base.get("visible_text") or ""
        heur = float(base["confidence"])

        cart_text, cart_findings = _cart_text(cart)
        if cart_findings:
            findings.extend(cart_findings)
            heur = max(heur, CART_PHRASE_CONF)

        hidden_only = heur <= LOW and not findings and bool(hidden)
        final = heur
        jev_p = guard_p = None
        tech: str | None = None
        if LOW <= heur < HIGH or hidden:
            snippets = " ".join(f.get("snippet", "") for f in findings)
            guard_text = " ".join(x for x in (hidden, cart_text) if x) or snippets or visible[:VISIBLE_CAP]
            jev_p, tech, guard_p = _run_llms(
                hidden, visible, cart_text, guard_text[:HIDDEN_CAP], " ".join(page_urls),
                snippets,
            )
            final = combine(heur, jev_p, guard_p, hidden_only)

        final = round(max(0.0, min(1.0, final)), 2)
        if final >= AGREE and not findings:
            snip = (hidden or visible or cart_text)[:200].strip()
            findings.append({"url": page_urls[0], "technique": tech or "phrase", "snippet": snip})

        out = {
            "detected": final >= AGREE,
            "confidence": final,
            "findings": findings,
            "signals": {"heuristic": heur, "jev": jev_p, "guard": guard_p},
        }
        if out["detected"] and final >= FLAG_AT:
            _flag(merchant, cart, page_urls)
        return out
    except Exception:  # noqa: BLE001
        logger.warning("classifier scan failed")
        return _error("scan_failed")


def _flag(merchant: Any, cart: Any, page_urls: list[str]) -> None:
    try:
        if not isinstance(merchant, str) or not merchant:
            merchant = None
            if isinstance(cart, list):
                for item in cart:
                    if isinstance(item, dict) and isinstance(item.get("merchant"), str):
                        merchant = item["merchant"]
                        break
        if not merchant:
            return
        from intentlock_graph import flag_merchant  # lazy: optional dependency

        url = next((u for u in page_urls if u.startswith(("http://", "https://"))), None)
        flag_merchant(merchant, url)
    except Exception:  # noqa: BLE001
        logger.warning("flag_merchant skipped")
