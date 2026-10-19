"""orders.awaiting_payment status and payer_action_url: the buyer approves the first payment in PayPal"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009_paypal_buyer_approval"
down_revision: Union[str, Sequence[str], None] = "0008_chat_rule"
branch_labels = None
depends_on = None

OLD = "status IN ('received', 'rejected', 'authorized', 'checking', 'captured', 'voided', 'pending_approval', 'failed')"
NEW = ("status IN ('received', 'awaiting_payment', 'rejected', 'authorized', 'checking', 'captured', 'voided', "
       "'pending_approval', 'failed')")


def upgrade() -> None:
    op.add_column("orders", sa.Column("payer_action_url", sa.String(), nullable=True))
    op.drop_constraint("ck_orders_status", "orders", type_="check")
    op.create_check_constraint("ck_orders_status", "orders", NEW)


def downgrade() -> None:
    op.execute("UPDATE orders SET status = 'failed' WHERE status = 'awaiting_payment'")
    op.drop_constraint("ck_orders_status", "orders", type_="check")
    op.create_check_constraint("ck_orders_status", "orders", OLD)
    op.drop_column("orders", "payer_action_url")
