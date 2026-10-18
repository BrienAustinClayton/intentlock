"""Load Attack Lab fixtures (users, agents, mandates) into Postgres idempotently.

Run from services/intentlock:
    uv run python ../../scripts/load_lab.py
"""

from __future__ import annotations

import os
import sys
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

# Add services/intentlock to sys.path
REPO_ROOT = Path(__file__).resolve().parent.parent
INTENTLOCK_DIR = REPO_ROOT / "services" / "intentlock"
sys.path.insert(0, str(INTENTLOCK_DIR))

# Load .env files if DATABASE_URL or keys not set
if "DATABASE_URL" not in os.environ:
    try:
        from dotenv import load_dotenv

        load_dotenv(INTENTLOCK_DIR / ".env")
        load_dotenv(REPO_ROOT / "apps" / "agent" / ".env")
    except ImportError:
        pass

from sqlalchemy.orm import sessionmaker  # noqa: E402
from app.db import get_engine  # noqa: E402
from app.mandates import sign_mandate  # noqa: E402
from app.models import Agent, Mandate, User  # noqa: E402

# Test public key (RFC 9421 Appendix B.1.4 test-key-ed25519)
RFC_PUB_KEY = "JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs"


def load_lab() -> None:
    engine = get_engine()
    factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = factory()

    try:
        # 1. User Priya
        priya = db.get(User, "usr_demo_priya")
        if priya is None:
            priya = User(
                id="usr_demo_priya",
                name="Priya",
                paypal_payment_token="tok_sandbox_priya_vault",
            )
            db.add(priya)
            db.flush()
            print("Created user usr_demo_priya")
        else:
            priya.name = "Priya"
            db.flush()
            print("User usr_demo_priya exists")

        # 2. Agent Priya Shopper
        shopper = db.get(Agent, "agt_demo_shopper")
        pub_key = os.environ.get("AGENT_PUBLIC_KEY") or RFC_PUB_KEY
        if shopper is None:
            shopper = Agent(
                id="agt_demo_shopper",
                user_id=priya.id,
                name="Priya Shopper",
                public_key=pub_key,
                device_id="dev_priya_macbook",
                verified=True,
            )
            db.add(shopper)
            db.flush()
            print("Created agent agt_demo_shopper")
        else:
            shopper.public_key = pub_key
            shopper.verified = True
            db.flush()
            print("Agent agt_demo_shopper exists")

        # 3. Agent Revoked (agt_lab_revoked)
        revoked = db.get(Agent, "agt_lab_revoked")
        if revoked is None:
            revoked = Agent(
                id="agt_lab_revoked",
                user_id=priya.id,
                name="Revoked Lab Agent",
                public_key=RFC_PUB_KEY,  # lab key (RFC 9421 B.1.4 test key), never Priya's
                device_id="dev_priya_macbook",
                verified=True,
                revoked_at=datetime.now(UTC),
            )
            db.add(revoked)
            db.flush()
            print("Created agent agt_lab_revoked")
        else:
            revoked.public_key = RFC_PUB_KEY
            if revoked.revoked_at is None:
                revoked.revoked_at = datetime.now(UTC)
            db.flush()
            print("Agent agt_lab_revoked exists")

        # 4. Bot Farm Agents (agt_lab_bot_01 .. agt_lab_bot_12)
        for i in range(1, 13):
            bot_id = f"agt_lab_bot_{i:02d}"
            dev_id = "dev_shared_bot_01" if i <= 6 else "dev_shared_bot_02"
            bot = db.get(Agent, bot_id)
            if bot is None:
                bot = Agent(
                    id=bot_id,
                    user_id=priya.id,
                    name=f"Bot Agent {i:02d}",
                    public_key=RFC_PUB_KEY,  # bot farm shares one lab key, never Priya's
                    device_id=dev_id,
                    verified=False,
                )
                db.add(bot)
                print(f"Created bot agent {bot_id}")
            else:
                bot.device_id = dev_id
                bot.public_key = RFC_PUB_KEY

        db.flush()

        # 5. Mandate for agt_demo_shopper
        mdt_shopper_id = "mdt_demo_priya_groceries"
        mdt_shopper = db.get(Mandate, mdt_shopper_id)
        shopper_cats = ["groceries", "electronics_accessories", "gift_cards"]
        shopper_merchants = ["freshmart", "gadgethub", "dealsdaily"]
        starts_at = datetime(2026, 1, 1, 0, 0, 0, tzinfo=UTC)
        expires_at = datetime(2027, 1, 1, 0, 0, 0, tzinfo=UTC)

        if mdt_shopper is None:
            mdt_shopper = Mandate(
                id=mdt_shopper_id,
                agent_id="agt_demo_shopper",
                categories=shopper_cats,
                merchants=shopper_merchants,
                budget_amount=Decimal("200.00"),
                budget_period="week",
                currency="USD",
                starts_at=starts_at,
                expires_at=expires_at,
                signed_json={},
                signature="",
            )
            sign_mandate(mdt_shopper, user_id=priya.id)
            db.add(mdt_shopper)
            print("Created mandate mdt_demo_priya_groceries")
        else:
            mdt_shopper.categories = shopper_cats
            mdt_shopper.merchants = shopper_merchants
            mdt_shopper.budget_amount = Decimal("200.00")
            mdt_shopper.budget_period = "week"
            mdt_shopper.currency = "USD"
            mdt_shopper.starts_at = starts_at
            mdt_shopper.expires_at = expires_at
            sign_mandate(mdt_shopper, user_id=priya.id)
            print("Updated mandate mdt_demo_priya_groceries")

        # 6. Mandate for agt_lab_bot_07
        mdt_bot_id = "mdt_lab_bot_07"
        mdt_bot = db.get(Mandate, mdt_bot_id)
        bot_cats = ["electronics_accessories"]
        bot_merchants = ["dealsdaily"]

        if mdt_bot is None:
            mdt_bot = Mandate(
                id=mdt_bot_id,
                agent_id="agt_lab_bot_07",
                categories=bot_cats,
                merchants=bot_merchants,
                budget_amount=Decimal("100.00"),
                budget_period="week",
                currency="USD",
                starts_at=starts_at,
                expires_at=expires_at,
                signed_json={},
                signature="",
            )
            sign_mandate(mdt_bot, user_id=priya.id)
            db.add(mdt_bot)
            print("Created mandate mdt_lab_bot_07")
        else:
            mdt_bot.categories = bot_cats
            mdt_bot.merchants = bot_merchants
            mdt_bot.budget_amount = Decimal("100.00")
            mdt_bot.budget_period = "week"
            mdt_bot.currency = "USD"
            mdt_bot.starts_at = starts_at
            mdt_bot.expires_at = expires_at
            sign_mandate(mdt_bot, user_id=priya.id)
            print("Updated mandate mdt_lab_bot_07")

        db.commit()
        print("Successfully loaded all lab fixtures.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    load_lab()
