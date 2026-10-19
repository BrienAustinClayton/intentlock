"""channel3_usage: live Channel3 calls per UTC day, for the daily credit budget"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0011_channel3_usage"
down_revision: Union[str, Sequence[str], None] = "0010_intent_approved_cart"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "channel3_usage",
        sa.Column("day", sa.Date(), primary_key=True),
        sa.Column("calls", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_table("channel3_usage")
