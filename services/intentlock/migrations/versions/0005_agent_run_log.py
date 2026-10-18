"""agent_runs: dispatch + response log"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005_agent_run_log"
down_revision: Union[str, Sequence[str], None] = "0004_hosted_agents"
branch_labels = None
depends_on = None

COLS = ("endpoint", "dispatched_at", "response_status", "response_ms", "response_excerpt", "attempts")


def upgrade() -> None:
    op.add_column("agent_runs", sa.Column("endpoint", sa.String(), nullable=True))
    op.add_column("agent_runs", sa.Column("dispatched_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("agent_runs", sa.Column("response_status", sa.Integer(), nullable=True))
    op.add_column("agent_runs", sa.Column("response_ms", sa.Integer(), nullable=True))
    op.add_column("agent_runs", sa.Column("response_excerpt", sa.Text(), nullable=True))
    op.add_column("agent_runs", sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    for c in reversed(COLS):
        op.drop_column("agent_runs", c)
