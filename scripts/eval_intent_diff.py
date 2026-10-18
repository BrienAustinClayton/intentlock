"""Intent Diff eval runner — 30-case labelled set.

Run from services/intentlock/:
    uv run python ../../scripts/eval_intent_diff.py

Calls rule_diff then intent_diff (with live Jev) for each case.
Prints a score table and "score: X/30". Writes data/eval/last_run.json.
Exits 1 if score < 27.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

# When invoked via "cd services/intentlock && uv run python ...", cwd is the
# service root; the app package is importable from there.
_SERVICE_ROOT = Path.cwd()
if str(_SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(_SERVICE_ROOT))

REPO_ROOT = Path(__file__).resolve().parent.parent
CASES_FILE = REPO_ROOT / "data" / "eval" / "intent_diff_cases.json"
CATALOG_FILE = REPO_ROOT / "data" / "seed" / "catalog.json"
OUTPUT_FILE = REPO_ROOT / "data" / "eval" / "last_run.json"

from app.checks.intent_diff import intent_diff  # noqa: E402
from app.checks.intent_diff_rules import rule_diff  # noqa: E402


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def actual_class(result: dict) -> str:
    """Return 'clean' if all items are explained=yes and no price anomaly; else 'flag'."""
    if result.get("price_anomaly"):
        return "flag"
    for item in result.get("items", []):
        if item.get("explained") != "yes":
            return "flag"
    return "clean"


def score_per_item(
    actual_items: list[dict], expected_items: list[dict]
) -> tuple[int, int]:
    """Return (matching_count, expected_count).

    An expected item matches if its (explained, issue) pair equals the actual
    item with the same product_id.
    """
    actual_by_pid: dict[str, dict] = {}
    for it in actual_items:
        pid = it.get("product_id", "")
        # last item wins if duplicate product_ids (shouldn't happen in practice)
        actual_by_pid[pid] = it

    matches = 0
    for exp in expected_items:
        pid = exp["product_id"]
        act = actual_by_pid.get(pid)
        if (
            act is not None
            and act.get("explained") == exp["explained"]
            and act.get("issue") == exp["issue"]
        ):
            matches += 1
    return matches, len(expected_items)


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def run() -> None:
    if not CASES_FILE.exists():
        print(f"ERROR: cases file not found: {CASES_FILE}", file=sys.stderr)
        sys.exit(1)
    if not CATALOG_FILE.exists():
        print(f"ERROR: catalog file not found: {CATALOG_FILE}", file=sys.stderr)
        sys.exit(1)

    cases: list[dict] = json.loads(CASES_FILE.read_text())
    catalog: list[dict] = json.loads(CATALOG_FILE.read_text())

    total = len(cases)
    passed = 0
    run_records: list[dict] = []

    col_id = 8
    col_act = 8
    col_exp = 10
    col_pass = 6
    col_item = 12
    col_ms = 6
    header = (
        f"{'ID':<{col_id}} {'Actual':<{col_act}} {'Expected':<{col_exp}}"
        f" {'Pass':<{col_pass}} {'ItemMatch':<{col_item}} {'ms':<{col_ms}}"
    )
    sep = "-" * len(header)
    print(header)
    print(sep)

    for case in cases:
        cid: str = case["id"]
        request_text: str = case["request_text"]
        cart: list[dict] = case["cart"]
        cart_merchant: str | None = case.get("cart_merchant")
        expected: dict = case["expected"]
        expected_class: str = expected["decision_class"]
        expected_items: list[dict] = expected["per_item"]

        t0 = time.perf_counter()
        try:
            rule_result = rule_diff(
                request_text,
                None,           # mandate
                cart,
                None,           # shipping_address
                catalog,
                cart_merchant,
                None,           # default_address
            )
            diff_result = intent_diff(request_text, None, cart, rule_result)
        except Exception as exc:  # noqa: BLE001 - never let eval crash
            diff_result = {"items": [], "price_anomaly": False}
            print(f"  [ERROR in case {cid}: {type(exc).__name__}: {exc}]", file=sys.stderr)
        elapsed_ms = int((time.perf_counter() - t0) * 1000)

        act_class = actual_class(diff_result)
        ok = act_class == expected_class
        passed += ok

        item_matches, item_total = score_per_item(
            diff_result.get("items", []), expected_items
        )

        pass_str = "PASS" if ok else "FAIL"
        item_str = f"{item_matches}/{item_total}"
        print(
            f"{cid:<{col_id}} {act_class:<{col_act}} {expected_class:<{col_exp}}"
            f" {pass_str:<{col_pass}} {item_str:<{col_item}} {elapsed_ms:<{col_ms}}"
        )

        run_records.append(
            {
                "id": cid,
                "request_text": request_text,
                "expected_class": expected_class,
                "actual_class": act_class,
                "pass": ok,
                "item_matches": item_matches,
                "item_total": item_total,
                "elapsed_ms": elapsed_ms,
                "items": diff_result.get("items", []),
                "price_anomaly": diff_result.get("price_anomaly", False),
            }
        )

    print(sep)
    print(f"score: {passed}/{total}")

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(
        json.dumps(
            {"score": passed, "total": total, "cases": run_records},
            indent=2,
            default=str,
        )
    )
    print(f"Written {OUTPUT_FILE}")

    if passed < 27:
        sys.exit(1)


if __name__ == "__main__":
    run()
