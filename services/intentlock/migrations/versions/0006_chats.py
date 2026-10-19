"""chats + chat_messages; agent_runs.product_id/qty for chat purchases"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006_chats"
down_revision: Union[str, Sequence[str], None] = "0005_agent_run_log"
branch_labels = None
depends_on = None

TZ = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.add_column("agent_runs", sa.Column("product_id", sa.String(), nullable=True))
    op.add_column("agent_runs", sa.Column("qty", sa.Integer(), nullable=True))
    op.create_table(
        "chats",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("agent_id", sa.String(), sa.ForeignKey("agents.id"), nullable=False),
        sa.Column("title", sa.String(120), nullable=False, server_default="New chat"),
        sa.Column("created_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", TZ, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_chats_user_id", "chats", ["user_id"])
    op.create_table(
        "chat_messages",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("chat_id", sa.String(), sa.ForeignKey("chats.id"), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("products", postgresql.JSONB(), nullable=True),
        sa.Column("intent_id", sa.String(), sa.ForeignKey("intents.id"), nullable=True),
        sa.Column("run_id", sa.String(), sa.ForeignKey("agent_runs.id"), nullable=True),
        sa.Column("created_at", TZ, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_chat_messages_chat_id", "chat_messages", ["chat_id"])


def downgrade() -> None:
    op.drop_index("ix_chat_messages_chat_id", table_name="chat_messages")
    op.drop_table("chat_messages")
    op.drop_index("ix_chats_user_id", table_name="chats")
    op.drop_table("chats")
    op.drop_column("agent_runs", "qty")
    op.drop_column("agent_runs", "product_id")
