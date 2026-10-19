"""intents.approved_cart: the exact cart the user approved; checkout must match it"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010_intent_approved_cart"
down_revision: Union[str, Sequence[str], None] = "0009_paypal_buyer_approval"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("intents", sa.Column("approved_cart", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("intents", "approved_cart")
