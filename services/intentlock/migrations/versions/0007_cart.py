"""chats.cart; agent_runs.items for multi-item cart checkouts"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007_cart"
down_revision: Union[str, Sequence[str], None] = "0006_chats"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("chats", sa.Column("cart", postgresql.JSONB(), nullable=True))
    op.add_column("agent_runs", sa.Column("items", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("agent_runs", "items")
    op.drop_column("chats", "cart")
