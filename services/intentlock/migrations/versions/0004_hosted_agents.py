"""agents: managed flag + sealed key; agent_runs"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004_hosted_agents"
down_revision: Union[str, Sequence[str], None] = "0003_auth"
branch_labels = None
depends_on = None

TZ = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.add_column("agents", sa.Column("managed", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("agents", sa.Column("secret_enc", sa.Text(), nullable=True))
    op.create_table(
        "agent_runs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("intent_id", sa.String(), sa.ForeignKey("intents.id"), nullable=False),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("agent_id", sa.String(), sa.ForeignKey("agents.id"), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("errors", postgresql.JSONB(), nullable=True),
        sa.Column("order_id", sa.String(), nullable=True),
        sa.Column("started_at", TZ, nullable=False, server_default=sa.func.now()),
        sa.Column("finished_at", TZ, nullable=True),
    )
    op.create_index("ix_agent_runs_intent_id", "agent_runs", ["intent_id"])
    op.create_index("ix_agent_runs_user_id", "agent_runs", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_agent_runs_user_id", table_name="agent_runs")
    op.drop_index("ix_agent_runs_intent_id", table_name="agent_runs")
    op.drop_table("agent_runs")
    op.drop_column("agents", "secret_enc")
    op.drop_column("agents", "managed")
