"""
Decision policy module.

Pure function: no I/O, no DB, no LLM calls.
Decision table implemented in order — first match wins.
"""

from __future__ import annotations

import math
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Optional
from urllib.parse import urlparse

# ── Constants ─────────────────────────────────────────────────────────────────

INJECTION_VOID_CONFIDENCE = 0.80
RISK_VOID = 60
RISK_HOLD = 30
APPROVAL_TIMEOUT_MIN = 30

_MAX_TITLE = 80    # product title chars in a reason
_MAX_REASON = 160  # max chars per reason string
_MAX_PER_RULE = 5  # max reasons contributed by one rule
_MAX_TOTAL = 8     # max reasons before the closing "and N more" reason
_TITLE_SCAN = 512  # only this many raw chars of a title are ever examined

# Issue-type → reason template  (title already truncated to _MAX_TITLE)
_ISSUE_TEMPLATES: dict[str, str] = {
    "extra_item":       "'{title}' is not in your request",
    "variant_mismatch": "'{title}' has an unexpected variant",
    "quantity":         "'{title}' has an unexpected quantity",
    "price":            "'{title}' has an unexpected price",
    "address":          "'{title}' has an unexpected shipping address",
    "merchant":         "'{title}' is from an unexpected merchant",
}
_ISSUE_DEFAULT = "'{title}' was not explained by your request"


# Fixed templates for rule 1-2 reason codes. Free text is never echoed.
_VERIFY_REASONS: dict[str, str] = {
    "bad_signature":   "Agent signature is invalid",
    "unknown_key":     "Agent key is not recognised",
    "revoked":         "Agent key was revoked",
    "stale":           "Agent request is too old",
    "replay":          "Agent request was already used",
    "digest_mismatch": "Agent request body does not match its signature",
}
_VERIFY_GENERIC = "Agent verification failed"
_VERIFY_MISSING = "Agent verification did not run"

_MANDATE_REASONS: dict[str, str] = {
    "no_mandate":                "No mandate exists for this agent",
    "mandate_signature_invalid": "Mandate signature is invalid",
    "mandate_row_mismatch":      "Mandate record does not match its signed copy",
    "intent_signature_invalid":  "Signed request is invalid",
    "intent_mismatch":           "Order does not belong to this signed request",
    "agent_mismatch":            "Agent is not covered by this mandate",
    "mandate_revoked":           "Mandate was revoked",
    "mandate_not_started":       "Mandate has not started yet",
    "mandate_expired":           "Mandate has expired",
    "merchant_not_allowed":      "Merchant is not allowed by the mandate",
    "invalid_cart":              "Cart is empty or has invalid lines",
    "currency_mismatch":         "Cart currency does not match the mandate",
    "category_not_allowed":      "A cart category is not allowed by the mandate",
    "over_budget":               "Total exceeds the remaining mandate budget",
}
_MANDATE_GENERIC = "Mandate check failed"
_MANDATE_MISSING = "Mandate check did not run"

# Echo whitelists (contract: Check outputs)
_TECHNIQUES = frozenset({
    "hidden_css", "html_comment", "aria_hidden", "offscreen",
    "zero_font", "white_on_white", "phrase",
})
_SIGNALS = frozenset({
    "shared_key", "bot_farm", "unfamiliar_device", "out_of_mandate", "flagged_merchant",
})
_HOST_RE = re.compile(r"[a-z0-9.-]{1,253}")

# Echoed-title sanitising: these Unicode categories are removed, quotes stripped.
_STRIP_CATEGORIES = frozenset({"Cc", "Cf", "Zl", "Zp"})
_QUOTE_CHARS = dict.fromkeys(
    map(ord, "'\"`\u2018\u2019\u201a\u201b\u201c\u201d\u201e\u201f\u2039\u203a\u00ab\u00bb")
)
_FALLBACK_TITLE = "an item"

_PRE_AUTHORIZE_ERROR = "Authorization checks could not be completed"
_GENERIC_HOLD = "Policy check could not be completed; needs your review"


# ── Output type ───────────────────────────────────────────────────────────────

@dataclass
class Decision:
    decision: str                        # reject | void | hold | capture
    reasons: list[str] = field(default_factory=list)


# ── Internal helpers ──────────────────────────────────────────────────────────

def _is_numeric(val: object) -> bool:
    """True for finite int/float values; not bool, str, None, NaN or inf."""
    if not isinstance(val, (int, float)) or isinstance(val, bool):
        return False
    try:
        return math.isfinite(val)
    except OverflowError:  # int too large for a float
        return False


def _in_range(val: object, lo: float, hi: float) -> bool:
    return _is_numeric(val) and lo <= val <= hi  # type: ignore[operator]


def _check_ran(check: dict) -> bool:
    return check.get("result") not in ("error", "skipped")


def _check_clean(check: dict) -> bool:
    """An AI check is clean only if `result` is absent or "pass"."""
    return "result" not in check or check["result"] == "pass"


def _check_hold(label: str, well_formed: bool, clean: bool) -> Optional[str]:
    if not well_formed:
        return f"{label} did not run; needs your review"
    if not clean:
        return f"{label} reported a problem; needs your review"
    return None


def _clean_text(val: object) -> str:
    """
    Sanitise untrusted text for echoing: non-str -> "", Unicode Cc/Cf/Zl/Zp
    removed, quotes stripped, whitespace collapsed, cut to _MAX_TITLE chars.
    """
    if not isinstance(val, str):
        return ""
    chars = [
        " " if unicodedata.category(c) in _STRIP_CATEGORIES else c
        for c in val[:_TITLE_SCAN]
    ]
    text = "".join(chars).translate(_QUOTE_CHARS)
    return " ".join(text.split())[:_MAX_TITLE].strip()


def _item_title(item: dict) -> str:
    """Prefer item["title"], fall back to product_id, else "an item"."""
    return (
        _clean_text(item.get("title"))
        or _clean_text(item.get("product_id"))
        or _FALLBACK_TITLE
    )


def _cap(reasons: list[str], limit: int = _MAX_PER_RULE) -> tuple[list[str], int]:
    """De-duplicate (order kept) and keep at most `limit`; return (kept, dropped)."""
    unique = list(dict.fromkeys(reasons))
    return unique[:limit], max(0, len(unique) - limit)


def _finish(reasons: list[str], dropped: int = 0) -> list[str]:
    """Final list: de-duplicated, <= _MAX_TOTAL, plus one closing reason if any dropped."""
    unique = list(dict.fromkeys(reasons))
    kept = unique[:_MAX_TOTAL]
    dropped += len(unique) - len(kept)
    return kept + [f"and {dropped} more similar findings"] * bool(dropped)


def _safe_hostname(url: object) -> Optional[str]:
    """
    Return a whitelisted lowercase hostname, or None.
    url is coerced with str(); parse errors and non-matching hosts give None.
    Never raises.
    """
    try:
        host = urlparse(str(url)).hostname
    except ValueError:
        return None
    if not host:
        return None
    host = host.lower()
    return host if _HOST_RE.fullmatch(host) else None


def _reject_reason(check: object, table: dict[str, str], generic: str, missing: str) -> str:
    """Map a verify/mandate reason code to a fixed template. Never echoes text."""
    if not isinstance(check, dict):
        return missing
    code = check.get("reason")
    if isinstance(code, str) and code in table:
        return table[code][:_MAX_REASON]
    return generic


def _list_of_dicts(val: object) -> list[dict]:
    if not isinstance(val, list):
        return []
    return [v for v in val if isinstance(v, dict)]


def _item_reason(title: str, issue: str) -> str:
    """
    Build a code-template reason for an unexplained cart item.
    title must already be sanitized by the caller (never free page/LLM text).
    """
    short = title[:_MAX_TITLE]
    template = _ISSUE_TEMPLATES.get(issue, _ISSUE_DEFAULT)
    return template.format(title=short)[:_MAX_REASON]


def _injection_reasons(injection: dict) -> list[str]:
    reasons: list[str] = []
    for finding in _list_of_dicts(injection.get("findings")):
        technique = finding.get("technique")
        if not (isinstance(technique, str) and technique in _TECHNIQUES):
            technique = "unknown"
        host = _safe_hostname(finding.get("url") or "")
        where = f"{host} product page" if host else "a product page"
        reasons.append(f"Hidden instructions ({technique}) found on {where}"[:_MAX_REASON])
    return _finish(*_cap(reasons or ["Prompt injection detected with high confidence"]))


def _graph_void_reasons(graph: dict, score: float) -> list[str]:
    head = f"Risk score {math.floor(score)} exceeds void threshold"
    signals: list[str] = []
    for signal in _list_of_dicts(graph.get("signals")):
        name = signal.get("name")
        if not (isinstance(name, str) and name in _SIGNALS):
            name = "unknown"
        signals.append(f"Risk signal: {name}"[:_MAX_REASON])
    kept, dropped = _cap(signals)
    return _finish([head, *kept], dropped)


# ── Policy function ───────────────────────────────────────────────────────────

def _pre_authorize(verify: object, mandate: object) -> Optional[Decision]:
    """Rules 1-2: only an explicit "pass" is accepted. Returns a reject or None."""
    if not isinstance(verify, dict) or verify.get("result") != "pass":
        return Decision(
            decision="reject",
            reasons=[_reject_reason(verify, _VERIFY_REASONS, _VERIFY_GENERIC, _VERIFY_MISSING)],
        )
    if not isinstance(mandate, dict) or mandate.get("result") != "pass":
        return Decision(
            decision="reject",
            reasons=[
                _reject_reason(mandate, _MANDATE_REASONS, _MANDATE_GENERIC, _MANDATE_MISSING)
            ],
        )
    return None


def decide(
    verify: Optional[dict],
    mandate: Optional[dict],
    injection: Optional[dict],
    intent_diff: Optional[dict],
    graph: Optional[dict],
) -> Decision:
    """
    Apply the IntentLock decision policy table; first match wins.

    Parameters
    ----------
    verify      : verify_agent output {"result", "reason": <code>} (or None)
    mandate     : check_mandate output {"result", "reason": <code>} (or None)
    injection   : scan_injection check output (or None if skipped/missing)
    intent_diff : intent_diff check output   (or None if skipped/missing)
    graph       : graph_risk check output    (or None if skipped/missing)

    Returns
    -------
    Decision with decision in {reject, void, hold, capture} and human reasons.
    Never raises: malformed inputs become holds (or rejects for rules 1-2).
    Reasons are built from code templates and never echo untrusted text.
    """

    # ── Rules 1-2: verify_agent, then check_mandate (any failure -> reject) ───
    try:
        rejected = _pre_authorize(verify, mandate)
    except Exception:  # malformed input in rules 1-2 can only reject
        return Decision(decision="reject", reasons=[_PRE_AUTHORIZE_ERROR])
    if rejected is not None:
        return rejected

    try:
        return _decide_post_authorize(injection, intent_diff, graph)
    except Exception:  # last line of defence: decide() never raises
        return Decision(decision="hold", reasons=[_GENERIC_HOLD])


def _decide_post_authorize(
    injection: object, intent_diff: object, graph: object
) -> Decision:
    # ── Well-formedness of the three post-authorize checks ────────────────────
    inj_ok = (
        isinstance(injection, dict)
        and _check_ran(injection)
        and _in_range(injection.get("confidence"), 0, 1)
    )
    items = intent_diff.get("items") if isinstance(intent_diff, dict) else None
    diff_ok = (
        isinstance(intent_diff, dict)
        and _check_ran(intent_diff)
        and isinstance(items, list)
        and len(items) > 0
        and all(isinstance(i, dict) for i in items)
    )
    graph_ok = (
        isinstance(graph, dict)
        and _check_ran(graph)
        and _in_range(graph.get("score"), 0, 100)
    )

    # ── Rule 3: injection detected + confidence ≥ threshold → void ────────────
    # Void wins over missing: evaluated before the missing-check hold.
    if (
        inj_ok
        and injection.get("detected")  # type: ignore[union-attr]
        and injection["confidence"] >= INJECTION_VOID_CONFIDENCE  # type: ignore[index]
    ):
        return Decision(decision="void", reasons=_injection_reasons(injection))  # type: ignore[arg-type]

    # ── Rule 4: graph risk score ≥ RISK_VOID → void ────────────────────────────
    if graph_ok and graph["score"] >= RISK_VOID:  # type: ignore[index]
        return Decision(
            decision="void",
            reasons=_graph_void_reasons(graph, graph["score"]),  # type: ignore[arg-type,index]
        )

    # ── Fail-safe: a missing/malformed check can only turn capture into hold ──
    hold_missing = [
        r
        for r in (
            _check_hold(
                "Injection scan", inj_ok, inj_ok and _check_clean(injection)  # type: ignore[arg-type]
            ),
            _check_hold(
                "Intent check", diff_ok, diff_ok and _check_clean(intent_diff)  # type: ignore[arg-type]
            ),
            _check_hold(
                "Risk check", graph_ok, graph_ok and _check_clean(graph)  # type: ignore[arg-type]
            ),
        )
        if r is not None
    ]
    if hold_missing:
        return Decision(decision="hold", reasons=hold_missing)

    score: float = graph["score"]  # type: ignore[index]

    # ── Rule 5: unexplained line / elevated score / price anomaly → hold ──────
    item_reasons = [
        _item_reason(_item_title(item), str(item.get("issue") or "none"))
        for item in items  # type: ignore[union-attr]  — non-empty list of dicts
        if item.get("explained") != "yes"
    ]
    hold_reasons, dropped = _cap(item_reasons)

    if intent_diff.get("price_anomaly"):  # type: ignore[union-attr]
        hold_reasons.append("Price anomaly detected in cart")

    if RISK_HOLD <= score < RISK_VOID:
        hold_reasons.append(f"Risk score {math.floor(score)} requires manual review")

    if hold_reasons:
        return Decision(decision="hold", reasons=_finish(hold_reasons, dropped))

    # ── Rule 6: all clear → capture ───────────────────────────────────────────
    return Decision(decision="capture", reasons=[])
