"""chats.mandate_id: the spending rule a chat shops under (null = all of the agent's rules)"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008_chat_rule"
down_revision: Union[str, Sequence[str], None] = "0007_cart"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("chats", sa.Column("mandate_id", sa.String(), sa.ForeignKey("mandates.id"), nullable=True))


def downgrade() -> None:
    op.drop_column("chats", "mandate_id")
