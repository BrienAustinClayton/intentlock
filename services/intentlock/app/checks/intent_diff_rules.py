"""Deterministic / rule-based half of Intent Diff + price anomaly detection.

Catches obvious quantity breaches, merchant mismatch, budget overruns,
gift card additions, and market price anomalies before calling LLMs.
"""

from __future__ import annotations

import logging
import re
import statistics
import unicodedata
from decimal import Decimal, InvalidOperation
from typing import Any

logger = logging.getLogger("intentlock.checks.intent_diff_rules")

DEMO_MERCHANTS: tuple[str, ...] = ("freshmart", "gadgethub", "dealsdaily")


MAX_TITLE_LEN = 80
MAX_REASON_LEN = 160
_QUOTES = "\"'`\u2018\u2019\u201a\u201b\u201c\u201d\u201e\u201f\u00ab\u00bb\u2039\u203a"
_QUOTE_TABLE = {ord(c): None for c in _QUOTES}
_STRIP_CATS = frozenset({"Cc", "Cf", "Zl", "Zp"})

# Quantity parsing helpers
_WORD_TO_NUM: dict[str, int] = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12,
}
_COUNT_NOUNS_PAT = r"(?:packs?|cartons?|bottles?|boxes?|pouches?|cans?|bags?|pieces?|pcs|units?|items?)"
_NUM_WORDS_PAT = "|".join(_WORD_TO_NUM.keys())
# Words that are allowed to immediately precede an explicit quantity number.
# A number NOT preceded by one of these (or start-of-text) is likely part of a
# product-name designation such as "Stage 3" or "USB 3.0".
_QTY_PRECEDING: frozenset[str] = frozenset({
    "buy", "order", "get", "want", "need", "of", "a", "an", "the",
    "please", "me", "i", "you", "purchase", "send", "add", "give", "take",
    "pick", "grab",
})


def _to_decimal(val: Any) -> Decimal:
    """Convert to a finite Decimal or raise ValueError."""
    if isinstance(val, bool):
        raise ValueError("bool is not a number")
    if isinstance(val, Decimal):
        d = val
    elif isinstance(val, (int, str)):
        try:
            d = Decimal(str(val).strip())
        except InvalidOperation as exc:
            raise ValueError("not a number") from exc
    elif isinstance(val, float):
        d = Decimal(repr(val))
    else:
        raise ValueError("not a number")
    if not d.is_finite():
        raise ValueError("not finite")
    return d


def _to_qty(val: Any) -> int:
    """Convert to a positive integer quantity or raise ValueError."""
    d = _to_decimal(val)
    if d != d.to_integral_value() or d < 1 or d > 1_000_000:
        raise ValueError("bad quantity")
    return int(d)


def _clean_text(val: Any) -> str:
    """Strip control/format/line-separator chars, quotes; collapse whitespace; cap length."""
    if not isinstance(val, str):
        return ""
    out = "".join(
        " " if ch.isspace() else ch
        for ch in val
        if unicodedata.category(ch) not in _STRIP_CATS or ch.isspace()
    )
    out = out.translate(_QUOTE_TABLE)
    out = re.sub(r"\s+", " ", out).strip()
    return out[:MAX_TITLE_LEN].strip()


def sanitize_title(title: Any, product_id: Any = None) -> str:
    """CONTRACTS echoed-title rule: non-str -> product_id or 'an item'."""
    cleaned = _clean_text(title)
    if cleaned:
        return cleaned
    cleaned = _clean_text(product_id)
    return cleaned or "an item"


def _safe_merchant(val: Any) -> str | None:
    """Lower-cased merchant if it is one of the whitelisted demo merchants."""
    if isinstance(val, str):
        v = val.strip().lower()
        if v in DEMO_MERCHANTS:
            return v
    return None


def _cap_reason(text: str) -> str:
    return text if len(text) <= MAX_REASON_LEN else text[: MAX_REASON_LEN - 3].rstrip() + "..."


def _norm_address(addr: Any) -> str | None:
    """Normalise an address (str or dict) for comparison; None if empty/unusable."""
    if isinstance(addr, str):
        parts = [addr]
    elif isinstance(addr, dict):
        parts = [str(addr[k]) for k in sorted(addr, key=str) if addr[k] is not None]
    else:
        return None
    text = re.sub(r"[^a-z0-9]+", " ", " ".join(parts).lower()).strip()
    return text or None


def parse_stated_budget(text: str) -> Decimal | None:
    """Extract stated budget constraint from user request text (e.g. 'under $80')."""
    if not isinstance(text, str):
        return None
    m = re.search(
        r"(?:under|below|budget(?:\s+of)?|max(?:\s+of)?|limit(?:\s+of)?|up\s+to|spend\s+(?:at\s+most|under|less\s+than))\s*\$?([0-9]+(?:\.[0-9]{2})?)",
        text,
        re.IGNORECASE,
    )
    if m:
        try:
            return Decimal(m.group(1))
        except Exception:
            return None
    return None


def parse_stated_merchant(text: str) -> str | None:
    """Extract explicit merchant name from text if mentioned."""
    if not isinstance(text, str):
        return None
    text_lower = text.lower()
    for m in DEMO_MERCHANTS:
        # Match 'from freshmart', 'at gadgethub', etc. or explicit merchant word
        if re.search(rf"\b{m}\b", text_lower):
            return m
    return None


def _preceding_word(text: str, pos: int) -> str | None:
    """Return the last alphabetic token before position `pos`, lowercased."""
    prefix = text[:pos].rstrip()
    if not prefix:
        return None
    m = re.search(r"\b([a-zA-Z]+)\s*$", prefix)
    return m.group(1).lower() if m else None


def parse_explicit_quantity(text: str, product_keyword: str) -> int | None:
    """Try to extract explicitly requested quantity for an item.

    Only accepts quantities that are clearly bound to a count form:
    - digit or number word directly followed by a count noun or unit, then the
      product keyword  (e.g. "2 cartons of milk", "three pouches");
    - "x2" / "2x" / "qty 2" / "quantity: 2";
    - a number word or digit directly before the product keyword, provided the
      number is NOT immediately preceded by a regular noun/adjective (which
      would indicate a product-name sequence such as "Stage 3 toddler").

    Numbers inside product names ("Stage 3", "60W", "USB 3.0") are not counted.
    Never raises.
    """
    if not isinstance(text, str) or not isinstance(product_keyword, str):
        return None
    kw = re.escape(product_keyword)
    # Accept both the exact keyword form and a simple plural (e.g. "Cable" → "cables").
    kw_p = kw + r"(?:es|s)?"

    # Pattern: "qty 2" or "quantity: 2" (keyword-independent; unambiguous)
    m = re.search(r"\bq(?:ty|uantity)\b\s*:?\s*([1-9][0-9]?)\b", text, re.IGNORECASE)
    if m:
        try:
            return int(m.group(1))
        except ValueError:
            pass

    # Pattern: "x3 <keyword>" or "3x <keyword>"
    m = re.search(rf"\bx([1-9][0-9]?)\s+{kw_p}\b", text, re.IGNORECASE)
    if m:
        try:
            return int(m.group(1))
        except ValueError:
            pass
    m = re.search(rf"\b([1-9][0-9]?)x\s+{kw_p}\b", text, re.IGNORECASE)
    if m:
        try:
            return int(m.group(1))
        except ValueError:
            pass

    # Pattern: digit + count noun (+ optional "of") + keyword
    m = re.search(
        rf"(?<!\$)\b([1-9][0-9]?)\s+{_COUNT_NOUNS_PAT}\s+(?:of\s+)?{kw_p}\b",
        text,
        re.IGNORECASE,
    )
    if m:
        try:
            return int(m.group(1))
        except ValueError:
            pass

    # Pattern: number word + count noun (+ optional "of") + keyword
    m = re.search(
        rf"\b({_NUM_WORDS_PAT})\s+{_COUNT_NOUNS_PAT}\s+(?:of\s+)?{kw_p}\b",
        text,
        re.IGNORECASE,
    )
    if m:
        return _WORD_TO_NUM.get(m.group(1).lower())

    # Pattern: digit directly before keyword (no intervening words).
    # Reject when the digit is itself immediately preceded by a regular word
    # (e.g. "Stage 3 toddler" — "Stage" precedes "3", so "3" is a product-name
    # number, not a standalone quantity).
    m = re.search(rf"(?<!\$)\b([1-9][0-9]?)\s+{kw_p}\b", text, re.IGNORECASE)
    if m:
        preceding = _preceding_word(text, m.start())
        if preceding is None or preceding in _QTY_PRECEDING:
            try:
                return int(m.group(1))
            except ValueError:
                pass

    # Pattern: number word directly before keyword (same preceding-word guard)
    m = re.search(rf"\b({_NUM_WORDS_PAT})\s+{kw_p}\b", text, re.IGNORECASE)
    if m:
        preceding = _preceding_word(text, m.start())
        if preceding is None or preceding in _QTY_PRECEDING:
            return _WORD_TO_NUM.get(m.group(1).lower())

    return None


def check_price_anomaly(
    product_id: Any,
    unit_price: Decimal,
    merchant: Any,
    catalog: Any,
) -> tuple[bool, Decimal | None]:
    """Check if unit price is > 1.5 * median of other merchants' offers."""
    if not isinstance(catalog, list) or not catalog:
        return False, None

    other_prices: list[Decimal] = []
    for p in catalog:
        if not isinstance(p, dict) or p.get("product_id") != product_id:
            continue
        offers = p.get("offers")
        if not isinstance(offers, list):
            continue
        for o in offers:
            if not isinstance(o, dict) or o.get("merchant") == merchant:
                continue
            try:
                price = _to_decimal(o.get("price"))
            except ValueError:
                continue
            if price > 0:
                other_prices.append(price)
        break

    if not other_prices:
        return False, None

    median_price = statistics.median(other_prices)
    if unit_price > Decimal("1.5") * median_price:
        return True, median_price

    return False, median_price


def _typical_qty(product_id: Any, catalog: Any) -> int:
    """Typical quantity from a catalog hint ('typical_qty'), default 1."""
    if isinstance(catalog, list):
        for p in catalog:
            if isinstance(p, dict) and p.get("product_id") == product_id and "typical_qty" in p:
                try:
                    return _to_qty(p["typical_qty"])
                except ValueError:
                    break
    return 1


def _uncertain(pid: Any, title: str, reason: str) -> dict[str, Any]:
    return {
        "product_id": pid if isinstance(pid, str) else "",
        "title": title,
        "explained": "uncertain",
        "issue": "none",
        "reason": _cap_reason(reason),
        "source": "deterministic",
    }


def rule_diff(
    request_text: Any,
    mandate: dict[str, Any] | None,
    cart: Any,
    shipping_address: Any = None,
    catalog: Any = None,
    cart_merchant: Any = None,
    default_address: Any = None,
) -> dict[str, Any]:
    """Execute deterministic rules against cart and user request.

    Returns CONTRACTS-compliant intent_diff shape:
    {"items": [...], "price_anomaly": bool}. Never raises.
    """
    try:
        return _rule_diff(
            request_text, mandate, cart, shipping_address, catalog, cart_merchant, default_address
        )
    except Exception:  # noqa: BLE001 - fail-safe: never raise into checkout
        logger.warning("rule_diff failed; returning uncertain items")
        items = []
        if isinstance(cart, list):
            for it in cart:
                if isinstance(it, dict):
                    pid = it.get("product_id")
                    items.append(
                        _uncertain(
                            pid,
                            sanitize_title(it.get("title"), pid),
                            "Rule check could not run; needs review",
                        )
                    )
        return {"items": items, "price_anomaly": False}


def _rule_diff(
    request_text: Any,
    mandate: Any,
    cart: Any,
    shipping_address: Any,
    catalog: Any,
    cart_merchant: Any,
    default_address: Any,
) -> dict[str, Any]:
    req_text = request_text if isinstance(request_text, str) else ""
    req_merchant = parse_stated_merchant(req_text)
    stated_budget = parse_stated_budget(req_text)
    cart_items = [i for i in cart if isinstance(i, dict)] if isinstance(cart, list) else []

    if default_address is None and isinstance(mandate, dict):
        default_address = mandate.get("default_address")
    norm_default = _norm_address(default_address)
    norm_ship = _norm_address(shipping_address)
    address_differs = norm_default is not None and norm_ship is not None and norm_default != norm_ship

    # Parse all numbers first; bad ones make that item uncertain.
    parsed: list[tuple[int, Decimal] | None] = []
    cart_total = Decimal("0.00")
    for item in cart_items:
        try:
            qty = _to_qty(item.get("qty", 1))
            price = _to_decimal(item.get("unit_price", 0))
            if price < 0:
                raise ValueError("negative price")
            parsed.append((qty, price))
            cart_total += price * qty
        except ValueError:
            parsed.append(None)

    budget_exceeded = stated_budget is not None and cart_total > stated_budget

    has_gift_mention = bool(re.search(r"\bgift\b", req_text, re.IGNORECASE))

    items_out: list[dict[str, Any]] = []
    has_global_price_anomaly = False
    default_merchant = cart_merchant if isinstance(cart_merchant, str) else ""

    for item, nums in zip(cart_items, parsed):
        pid_raw = item.get("product_id")
        pid = pid_raw if isinstance(pid_raw, str) else ""
        title = sanitize_title(item.get("title"), pid_raw)

        def out(explained: str, issue: str, reason: str) -> dict[str, Any]:
            return {
                "product_id": pid,
                "title": title,
                "explained": explained,
                "issue": issue,
                "reason": _cap_reason(reason),
                "source": "deterministic",
            }

        try:
            if nums is None:
                items_out.append(
                    out("uncertain", "none", f"Quantity or price of '{title}' could not be read; needs review")
                )
                continue
            qty, unit_price = nums

            category = item.get("category")
            category = category.lower() if isinstance(category, str) else ""
            merchant_raw = item.get("merchant")
            item_merchant = (
                merchant_raw if isinstance(merchant_raw, str) and merchant_raw else default_merchant
            )

            # 1. Price anomaly vs other merchants' offers
            is_anomalous, median_p = check_price_anomaly(pid_raw, unit_price, item_merchant, catalog)
            if is_anomalous and median_p is not None:
                has_global_price_anomaly = True
                items_out.append(
                    out(
                        "no",
                        "price",
                        f"Unit price ${unit_price:.2f} is significantly higher than market median (${median_p:.2f})",
                    )
                )
                continue

            # 2. Gift card / extra item
            is_gift_card = category in ("gift_cards", "gift_card") or "gift card" in title.lower()
            if is_gift_card and not has_gift_mention:
                items_out.append(out("no", "extra_item", f"'{title}' was not requested in your prompt"))
                continue

            # 3. Merchant mismatch
            if req_merchant and item_merchant and item_merchant.strip().lower() != req_merchant:
                safe = _safe_merchant(item_merchant)
                shown = f"'{safe}'" if safe else "an unrecognised merchant"
                items_out.append(
                    out(
                        "no",
                        "merchant",
                        f"Merchant {shown} does not match requested merchant '{req_merchant}'",
                    )
                )
                continue

            # 4. Shipping address differs from the user default
            if address_differs:
                items_out.append(
                    out("no", "address", "Shipping address differs from your default address")
                )
                continue

            # 5. Quantity
            explicit_qty = None
            for word in title.split():
                clean_w = re.sub(r"[^a-zA-Z]", "", word)
                if len(clean_w) >= 3 and clean_w.lower() not in ("the", "and", "for", "with"):
                    qty_found = parse_explicit_quantity(req_text, clean_w)
                    if qty_found is not None:
                        explicit_qty = qty_found
                        break

            if explicit_qty is not None:
                if qty != explicit_qty:
                    items_out.append(
                        out("no", "quantity", f"Quantity {qty} differs from requested quantity {explicit_qty}")
                    )
                    continue
            else:
                typical = _typical_qty(pid_raw, catalog)
                if qty > 2 * typical:
                    items_out.append(
                        out(
                            "no",
                            "quantity",
                            f"Quantity {qty} is more than twice the typical quantity {typical}",
                        )
                    )
                    continue

            # 6. Stated budget exceeded
            if budget_exceeded:
                items_out.append(
                    out(
                        "uncertain",
                        "price",
                        f"Cart total ${cart_total:.2f} exceeds stated budget of ${stated_budget:.2f}",
                    )
                )
                continue

            # 7. Not decided by rules -> LLM fills later
            items_out.append(
                out("uncertain", "none", f"'{title}' requires LLM verification against user prompt")
            )
        except Exception:  # noqa: BLE001 - per-item fail-safe
            items_out.append(out("uncertain", "none", f"'{title}' could not be checked by rules; needs review"))

    return {
        "items": items_out,
        "price_anomaly": has_global_price_anomaly,
    }
