"""Reset demo order data so the Attack Lab and demo can run again from a clean budget.

Deletes orders (and their checks, approvals, proofs) plus used nonces. Keeps users, agents,
mandates, catalog cache and LLM usage. Run from services/intentlock:

    uv run python ../../scripts/reset_demo.py            # reset
    uv run python ../../scripts/reset_demo.py --dry-run  # show counts only
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services/intentlock"))

from sqlalchemy import text  # noqa: E402

from app.db import get_engine  # noqa: E402

TABLES = ["approvals", "checks", "proofs", "schedule_events", "orders", "nonces"]


def main(dry_run: bool) -> None:
    with get_engine().begin() as conn:
        for t in TABLES:
            n = conn.execute(text(f"select count(*) from {t}")).scalar()
            if t == "schedule_events":
                n = conn.execute(text("select count(*) from schedule_events where type = 'order'")).scalar()
            print(f"{t:16} {n:5} rows {'(would delete)' if dry_run else 'deleted'}")
            if not dry_run:
                where = " where type = 'order'" if t == "schedule_events" else ""
                conn.execute(text(f"delete from {t}{where}"))
        if dry_run:
            conn.rollback()


if __name__ == "__main__":
    main("--dry-run" in sys.argv)
