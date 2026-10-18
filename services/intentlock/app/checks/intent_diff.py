"""Intent Diff, LLM half: Jev judges the lines the deterministic rules left uncertain.

``intent_diff`` returns the CONTRACTS intent_diff shape. Jev probabilities only set
flags (explained / issue); reason sentences come from templates, never from LLM or
cart text. Rule results (``no``, or any issue other than ``none``) always win.
Never raises: any failure leaves the lines ``uncertain``.
"""
from __future__ import annotations

import logging
import math
from typing import Any

from app.checks.intent_diff_rules import sanitize_title
from app.jev import decide
from app.llm import LLMUnavailable

logger = logging.getLogger("intentlock.checks.intent_diff")

YES_AT = 0.70
NO_AT = 0.30
ISSUE_MIN_CONFIDENCE = 0.6
UNAVAILABLE_REASON = "Could not verify automatically"
STEP = "intent_diff"
ISSUES = ("none", "extra_item", "variant_mismatch", "quantity", "price", "address", "merchant")
_ISSUE_CRITERIA = {
    "none": "Line matches the request",
    "extra_item": "Item the user never asked for",
    "variant_mismatch": "Wrong size, colour, length or pack",
    "quantity": "Wrong quantity",
    "price": "Over budget or overpriced",
    "address": "Shipping to a different address than the user's",
    "merchant": "Wrong merchant",
}
_ISSUE_REASONS = {
    "extra_item": "'{title}' is not in your request",
    "variant_mismatch": "'{title}' is a different variant than you asked for",
    "quantity": "The quantity of '{title}' does not match your request",
    "price": "The price of '{title}' looks too high for your request",
    "address": "Shipping address for '{title}' differs from your usual one",
    "merchant": "'{title}' is from a different merchant than you asked for",
}
MAX_REASON_LEN = 160
_TXT = 300  # cap on any cart string placed into the Jev state


def _txt(v: Any, n: int = _TXT) -> str:
    return v[:n] if isinstance(v, str) else ""


def _dict_list(v: Any) -> list[dict]:
    return [x for x in v if isinstance(x, dict)] if isinstance(v, list) else []


def _line_state(i: int, c: dict) -> dict:
    feats = c.get("key_features")
    offers = c.get("other_offers", c.get("offers"))
    return {
        "i": i,
        "title": _txt(c.get("title"), 120),
        "description": _txt(c.get("description")),
        "key_features": [_txt(f, 120) for f in feats[:8]] if isinstance(feats, list) else [],
        "variant": _txt(c.get("variant"), 60),
        "qty": c.get("qty") if isinstance(c.get("qty"), (int, str)) else None,
        "unit_price": str(c.get("unit_price")) if c.get("unit_price") is not None else None,
        "merchant": _txt(c.get("merchant"), 60),
        "category": _txt(c.get("category"), 60),
        "other_offers": offers[:5] if isinstance(offers, list) else [],
    }


def _mandate_summary(m: Any) -> dict:
    if not isinstance(m, dict):
        return {}
    keys = ("categories", "merchants", "budget_amount", "budget_period", "currency")
    return {k: m[k] for k in keys if k in m}


def _questions(idx: list[int]) -> dict:
    qs: dict[str, dict] = {}
    for i in idx:
        qs[f"line_{i}_explained"] = {
            "type": "noul",
            "instructions": (
                f"Cart line {i} is the kind of product the user request asks for "
                "(brand and exact product name do not need to match), in a sensible variant and quantity"
            ),
        }
        qs[f"line_{i}_issue"] = {
            "type": "choice",
            "instructions": f"Main mismatch between the request and cart line {i}",
            "criteria": dict(_ISSUE_CRITERIA),
        }
    return qs


def _prob(x: Any) -> float | None:
    if isinstance(x, bool) or not isinstance(x, (int, float)):
        return None
    x = float(x)
    return x if math.isfinite(x) and 0.0 <= x <= 1.0 else None


def map_explained(p: float) -> str:
    return "yes" if p >= YES_AT else ("no" if p <= NO_AT else "uncertain")


def _reason(explained: str, issue: str, title: str) -> str:
    if explained == "yes":
        text = f"'{title}' matches your request"
    elif issue in _ISSUE_REASONS:
        text = _ISSUE_REASONS[issue].format(title=title)
    elif explained == "no":
        text = f"'{title}' does not match your request"
    else:
        text = f"'{title}' could not be confirmed against your request"
    return text if len(text) <= MAX_REASON_LEN else text[: MAX_REASON_LEN - 3].rstrip() + "..."


def _fallback_item(item: dict) -> dict:
    out = dict(item)
    out["explained"] = "uncertain"
    out["reason"] = UNAVAILABLE_REASON
    return out


def _apply(item: dict, ans_p: Any, ans_c: Any) -> dict:
    """Merge one pair of Jev answers into a rule item; raises ValueError if malformed."""
    p = _prob(getattr(ans_p, "noul", None))
    choice = getattr(ans_c, "choice", None)
    conf = _prob(getattr(ans_c, "confidence", None))
    if p is None or choice not in ISSUES or conf is None:
        raise ValueError("malformed answer")
    explained = map_explained(p)
    issue = item.get("issue", "none")
    if explained != "yes" and conf >= ISSUE_MIN_CONFIDENCE:
        issue = choice
    title = item["title"]
    out = dict(item)
    out.update(
        explained=explained,
        issue=issue,
        reason=_reason(explained, issue, title),
        source="llm",
        details={
            "p_explained": round(p, 4),
            "issue_choice": choice,
            "issue_confidence": round(conf, 4),
            "engine": getattr(ans_p, "engine", None),
        },
    )
    return out


def _sanitise_items(rule_result: Any) -> tuple[list[dict], bool]:
    raw = rule_result.get("items") if isinstance(rule_result, dict) else None
    items: list[dict] = []
    for n, it in enumerate(_dict_list(raw)):
        it = dict(it)
        it["title"] = sanitize_title(it.get("title"), it.get("product_id"))
        if it.get("explained") not in ("yes", "no", "uncertain"):
            it["explained"] = "uncertain"
        if it.get("issue") not in ISSUES:
            it["issue"] = "none"
        if not isinstance(it.get("reason"), str):
            it["reason"] = _reason(it["explained"], it["issue"], it["title"])
        it.setdefault("product_id", "")
        it.setdefault("source", "deterministic")
        items.append(it)
    return items, bool(isinstance(rule_result, dict) and rule_result.get("price_anomaly") is True)


def intent_diff(
    request_text: Any, mandate: Any, cart_enriched: Any, rule_result: Any
) -> dict[str, Any]:
    """Return ``{"items": [...], "price_anomaly": bool}`` (CONTRACTS intent_diff). Never raises."""
    try:
        return _intent_diff(request_text, mandate, cart_enriched, rule_result)
    except Exception as e:  # noqa: BLE001 - fail-safe: never raise into checkout
        logger.warning("intent_diff failed: %s", type(e).__name__)
        try:
            items, anomaly = _sanitise_items(rule_result)
            return {"items": [_fallback_item(i) if i["explained"] == "uncertain" else i for i in items],
                    "price_anomaly": anomaly}
        except Exception:  # noqa: BLE001
            return {"items": [], "price_anomaly": False}


def _intent_diff(request_text: Any, mandate: Any, cart_enriched: Any, rule_result: Any) -> dict:
    cart = _dict_list(cart_enriched)
    items, anomaly = _sanitise_items(rule_result)
    # Only lines the rules left undecided with no issue go to Jev.
    todo = [n for n, it in enumerate(items) if it["explained"] == "uncertain" and it["issue"] == "none"]
    if not todo:
        return {"items": items, "price_anomaly": anomaly}

    if len(cart) != len(items) or not isinstance(request_text, str) or not request_text.strip():
        # Cannot align rule items with cart lines, or nothing to compare against.
        for n in todo:
            items[n] = _fallback_item(items[n])
        return {"items": items, "price_anomaly": anomaly}

    state = {
        "user_request": request_text[:1000],
        "mandate": _mandate_summary(mandate),
        "lines": [_line_state(i, c) for i, c in enumerate(cart)],
    }
    try:
        answers = decide(state, _questions(todo), STEP)
    except LLMUnavailable:
        answers = None
    except Exception as e:  # noqa: BLE001
        logger.warning("jev decide failed: %s", type(e).__name__)
        answers = None

    for n in todo:
        if answers is None:
            items[n] = _fallback_item(items[n])
            continue
        try:
            items[n] = _apply(items[n], answers[f"line_{n}_explained"], answers[f"line_{n}_issue"])
        except (KeyError, ValueError, TypeError, AttributeError):
            items[n] = _fallback_item(items[n])
    return {"items": items, "price_anomaly": anomaly}
