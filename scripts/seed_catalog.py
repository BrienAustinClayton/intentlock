#!/usr/bin/env python3
"""Seed data/seed/catalog.json from live Channel3 API calls.

Queries produce ~50 products per demo merchant with real Channel3 data.
Results are cached in Postgres (catalog_cache) so re-runs cost 0 credits.

Run from services/intentlock/:
    uv run python ../../scripts/seed_catalog.py

Merchants / categories:
    freshmart    -> groceries          (baby-toddler-food category in Channel3)
    gadgethub    -> electronics_accessories
    dealsdaily   -> electronics_accessories + gift_cards (gift-giving category)

Variant shape: [{name, label, product_id}] flattened from
Channel3 variants.options[].values[].

Note: uses httpx directly (no official Python SDK at time of writing).
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path
from typing import Any

# Allow `import app.*` even when run as a script.
_SVC = Path(__file__).resolve().parent.parent / "services" / "intentlock"
sys.path.insert(0, str(_SVC))

from dotenv import load_dotenv
load_dotenv(_SVC / ".env")

from app.channel3 import search, get_product  # noqa: E402  (after sys.path insert)

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Category acceptance lists (Channel3 category.path slug sets)
# ---------------------------------------------------------------------------

# Slugs that indicate a product really IS a grocery/food item
_GROCERY_PATH_SLUGS = frozenset({
    "baby-toddler-food", "baby-formula", "dairy-formula", "nursing-feeding",
    "baby-toddler", "food-beverages", "snacks", "bakery", "dairy",
})

# Slugs that indicate electronics / accessories
_ELECTRONICS_PATH_SLUGS = frozenset({
    "electronics", "electronics-accessories", "cables", "usb-cables",
    "storage-data-transfer-cables", "system-power-cables",
    "headphones-earbuds", "computer-accessories", "computer-mice",
    "keyboards", "laptop-accessories", "portable-power",
    "phone-cases-covers", "phone-screen-protectors",
    "chargers-cradles", "audio", "portable-audio-video",
    "cell-phones-smartphones", "consumer-electronics",
    "networking-products", "computer-components",
})

# Any gift-giving slug
_GIFT_PATH_SLUGS = frozenset({"gift-giving", "gift-cards", "gift-sets"})


def _path_slugs(raw: dict[str, Any]) -> frozenset[str]:
    cat = raw.get("category") or {}
    path = cat.get("path") or []
    slugs = {x.get("slug", "") for x in path}
    slugs.add(cat.get("slug", ""))
    return frozenset(slugs)


def _is_real_grocery(raw: dict[str, Any]) -> bool:
    return bool(_path_slugs(raw) & _GROCERY_PATH_SLUGS)


def _is_real_electronics(raw: dict[str, Any]) -> bool:
    return bool(_path_slugs(raw) & _ELECTRONICS_PATH_SLUGS)


def _is_real_gift_card(raw: dict[str, Any]) -> bool:
    return bool(_path_slugs(raw) & _GIFT_PATH_SLUGS)


# ---------------------------------------------------------------------------
# Queries
# ---------------------------------------------------------------------------

# (merchant, our_category, query, channel3_filter, validator_fn)
QUERIES: list[tuple[str, str, str, dict[str, Any], Any]] = [
    # ---- FreshMart groceries (baby-toddler-food = real food products) ----
    ("freshmart", "groceries", "milk toddler cow",
     {"category_ids": ["baby-toddler-food"]}, _is_real_grocery),
    ("freshmart", "groceries", "fruit pouch organic",
     {"category_ids": ["baby-toddler-food"]}, _is_real_grocery),
    ("freshmart", "groceries", "yogurt snack freeze dried",
     {"category_ids": ["baby-toddler-food"]}, _is_real_grocery),
    ("freshmart", "groceries", "rice pasta meal pouch",
     {"category_ids": ["baby-toddler-food"]}, _is_real_grocery),
    ("freshmart", "groceries", "cereal oatmeal baby",
     {"category_ids": ["baby-toddler-food"]}, _is_real_grocery),
    ("freshmart", "groceries", "apple banana puree",
     {"category_ids": ["baby-toddler-food"]}, _is_real_grocery),
    ("freshmart", "groceries", "vegetable puree organic",
     {"category_ids": ["baby-toddler-food"]}, _is_real_grocery),
    ("freshmart", "groceries", "snack puff organic",
     {"category_ids": ["baby-toddler-food"]}, _is_real_grocery),
    ("freshmart", "groceries", "chicken meat dinner",
     {"category_ids": ["baby-toddler-food"]}, _is_real_grocery),
    ("freshmart", "groceries", "bread biscuit cracker",
     {"category_ids": ["baby-toddler-food"]}, _is_real_grocery),

    # ---- GadgetHub electronics accessories ----
    ("gadgethub", "electronics_accessories", "USB-C cable fast charging",
     {}, _is_real_electronics),
    ("gadgethub", "electronics_accessories", "wireless earbuds bluetooth",
     {}, _is_real_electronics),
    ("gadgethub", "electronics_accessories", "laptop USB-C charger power adapter",
     {}, _is_real_electronics),
    ("gadgethub", "electronics_accessories", "wireless computer mouse ergonomic",
     {}, _is_real_electronics),
    ("gadgethub", "electronics_accessories", "mechanical keyboard gaming",
     {}, _is_real_electronics),
    ("gadgethub", "electronics_accessories", "portable power bank 20000mAh",
     {}, _is_real_electronics),
    ("gadgethub", "electronics_accessories", "HDMI cable 4K display",
     {}, _is_real_electronics),
    ("gadgethub", "electronics_accessories", "phone screen protector tempered glass",
     {}, _is_real_electronics),
    ("gadgethub", "electronics_accessories", "USB hub multiport adapter",
     {}, _is_real_electronics),
    # "charging cable" specifically finds Staples USB-C cable with length variants
    ("gadgethub", "electronics_accessories", "charging cable",
     {}, _is_real_electronics),

    # ---- DealsDaily gift cards ----
    ("dealsdaily", "gift_cards", "digital gift card",
     {"category_ids": ["gift-giving"]}, _is_real_gift_card),
    ("dealsdaily", "gift_cards", "restaurant gift card",
     {"category_ids": ["gift-giving"]}, _is_real_gift_card),
    ("dealsdaily", "gift_cards", "spa wellness gift card",
     {"category_ids": ["gift-giving"]}, _is_real_gift_card),

    # ---- DealsDaily electronics mix ----
    ("dealsdaily", "electronics_accessories", "smart home speaker bluetooth",
     {}, _is_real_electronics),
    ("dealsdaily", "electronics_accessories", "phone case protective cover",
     {}, _is_real_electronics),
    ("dealsdaily", "electronics_accessories", "smartwatch fitness tracker",
     {}, _is_real_electronics),
    ("dealsdaily", "electronics_accessories", "laptop stand adjustable desk",
     {}, _is_real_electronics),
    ("dealsdaily", "electronics_accessories", "noise cancelling headphones over ear",
     {}, _is_real_electronics),
]

LIMIT_PER_QUERY = 7  # 28 queries × 7 = up to 196 raw; after dedup and filtering ≥140

# ---------------------------------------------------------------------------
# USB-C cable with length variants — special product for wrong_variant lab
# Channel3 Staples cable KW9jmp4 has Size options in feet.
# We normalise 3.3 ft → "1 m" and 6.5 ft → "2 m" (exact conversions).
# ---------------------------------------------------------------------------
_CABLE_VARIANT_MAP = {"3.3": "1 m", "6.5": "2 m", "9.8": "3 m"}
_STAPLES_CABLE_ID = "KW9jmp4"


# ---------------------------------------------------------------------------
# Normalisation
# ---------------------------------------------------------------------------

def _flatten_variants(raw: dict[str, Any], product_id: str) -> list[dict[str, str]]:
    """Return [{name, label, product_id}] from variants.options[].values[]."""
    variants_obj = raw.get("variants")
    if not variants_obj or not isinstance(variants_obj, dict):
        return []
    result = []
    for opt in variants_obj.get("options") or []:
        opt_name = opt.get("name") or ""
        for val in opt.get("values") or []:
            label = val.get("label") or ""
            if not label:
                continue
            # For the Staples cable, convert ft labels to metric
            if raw.get("id") == _STAPLES_CABLE_ID:
                label = _CABLE_VARIANT_MAP.get(label, label)
            result.append({
                "name": opt_name,
                "label": label,
                "product_id": val.get("product_id") or product_id,
            })
    return result


def _normalise(
    raw: dict[str, Any],
    merchant: str,
    category: str,
) -> dict[str, Any] | None:
    """Return a normalised catalog row, or None if the product has no priced offer."""
    offers_raw = raw.get("offers") or []
    offers = []
    price = 0.0
    currency = "USD"
    for o in offers_raw:
        price_obj = o.get("price") or {}
        p = float(price_obj.get("price") or 0)
        c = price_obj.get("currency") or "USD"
        if p > 0:
            if price == 0.0:
                price = p
                currency = c
            offers.append({"merchant": o.get("domain", merchant), "price": p})

    # Skip products with no priced offers (no fake fallback).
    if not offers:
        return None

    images = raw.get("images") or []
    image_url = ""
    for img in images:
        if isinstance(img, dict):
            image_url = img.get("url") or img.get("cleaned_url") or ""
            if image_url:
                break

    product_id = raw["id"]
    return {
        "product_id": product_id,
        "merchant": merchant,
        "category": category,
        "title": raw.get("title") or "",
        "description": raw.get("description") or "",
        "key_features": raw.get("key_features") or [],
        "price": price,
        "currency": currency,
        "image_url": image_url,
        "variants": _flatten_variants(raw, product_id),
        "offers": offers,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    out_path = repo_root / "data" / "seed" / "catalog.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    seen_ids: set[str] = set()
    rows: list[dict[str, Any]] = []
    live_calls = 0

    for idx, (merchant, category, query, ch3_filter, validator) in enumerate(QUERIES, 1):
        log.info("[%d/%d] merchant=%s query=%r filter=%r",
                 idx, len(QUERIES), merchant, query, ch3_filter)
        try:
            result = search(query, limit=LIMIT_PER_QUERY, filters=ch3_filter or None)
        except Exception as exc:
            log.warning("search failed for %r: %s", query, exc)
            continue

        products = result.get("products") or []
        new_count = 0
        for raw in products:
            pid = raw.get("id")
            if not pid or pid in seen_ids:
                continue
            # Drop products that don't match the assigned category
            if not validator(raw):
                log.debug("  skip %s (category mismatch for %s)", pid, category)
                continue
            row = _normalise(raw, merchant, category)
            if row is None:
                log.debug("  skip %s (no priced offer)", pid)
                continue
            seen_ids.add(pid)
            rows.append(row)
            new_count += 1

        log.info("  -> %d new (total %d)", new_count, len(rows))

    # Summary
    merchants = {}
    categories = {}
    for r in rows:
        merchants[r["merchant"]] = merchants.get(r["merchant"], 0) + 1
        categories[r["category"]] = categories.get(r["category"], 0) + 1
    has_variants = sum(1 for r in rows if r["variants"])
    log.info("Merchants: %s", merchants)
    log.info("Categories: %s", categories)
    log.info("Products with variants: %d", has_variants)

    # Ensure Staples USB-C cable (1m/2m variants) is present for wrong_variant lab.
    # Fetch it explicitly if it wasn't returned by any search query.
    cable = next((r for r in rows if r["product_id"] == _STAPLES_CABLE_ID), None)
    if cable:
        log.info("Staples USB-C cable present: variants=%s", cable["variants"])
    else:
        log.info("Fetching Staples USB-C cable (%s) explicitly for lab scenario", _STAPLES_CABLE_ID)
        try:
            raw_cable = get_product(_STAPLES_CABLE_ID)
            cable_row = _normalise(raw_cable, "gadgethub", "electronics_accessories")
            if cable_row and _STAPLES_CABLE_ID not in seen_ids:
                seen_ids.add(_STAPLES_CABLE_ID)
                rows.append(cable_row)
                log.info("  Added Staples cable: variants=%s", cable_row["variants"])
            elif cable_row:
                log.info("  Staples cable already in catalog (different source)")
        except Exception as exc:
            log.warning("Could not fetch Staples cable: %s", exc)

    log.info("Writing %d products to %s", len(rows), out_path)
    out_path.write_text(json.dumps(rows, indent=2, ensure_ascii=False))
    log.info("Done.")

    if len(rows) < 140:
        log.warning(
            "Only %d products written; expected ≥140. Increase LIMIT_PER_QUERY or add queries.",
            len(rows),
        )
        sys.exit(1)

    if not categories.get("gift_cards"):
        log.warning("No gift_card products. Check gift-giving category filter.")

    if not categories.get("groceries"):
        log.warning("No grocery products. Check baby-toddler-food category filter.")


if __name__ == "__main__":
    main()
