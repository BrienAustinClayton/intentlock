"""orders: page_urls, shipping_address, trace_id"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002_order_checkout_fields"
down_revision: Union[str, Sequence[str], None] = "0baf6453ca00"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("page_urls", postgresql.JSONB(), nullable=True))
    op.add_column("orders", sa.Column("shipping_address", postgresql.JSONB(), nullable=True))
    op.add_column("orders", sa.Column("trace_id", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("orders", "trace_id")
    op.drop_column("orders", "shipping_address")
    op.drop_column("orders", "page_urls")
