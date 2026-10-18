"""users: email/google identity, signup + onboarding; auth_codes; user_sessions"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003_auth"
down_revision: Union[str, Sequence[str], None] = "0002_order_checkout_fields"
branch_labels = None
depends_on = None

TZ = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.add_column("users", sa.Column("email", sa.String(), nullable=True))
    op.add_column("users", sa.Column("email_verified_at", TZ, nullable=True))
    op.add_column("users", sa.Column("google_sub", sa.String(), nullable=True))
    op.add_column("users", sa.Column("avatar_url", sa.String(), nullable=True))
    op.add_column("users", sa.Column("country", sa.String(2), nullable=True))
    op.add_column("users", sa.Column("currency", sa.String(3), nullable=True))
    op.add_column("users", sa.Column("company", sa.String(), nullable=True))
    op.add_column("users", sa.Column("onboarding", postgresql.JSONB(), nullable=True))
    op.add_column("users", sa.Column("signup_completed_at", TZ, nullable=True))
    op.add_column("users", sa.Column("onboarded_at", TZ, nullable=True))
    op.add_column("users", sa.Column("last_login_at", TZ, nullable=True))
    op.create_unique_constraint("uq_users_email", "users", ["email"])
    op.create_unique_constraint("uq_users_google_sub", "users", ["google_sub"])

    op.create_table(
        "auth_codes",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("code_hash", sa.String(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("expires_at", TZ, nullable=False),
        sa.Column("consumed_at", TZ, nullable=True),
        sa.Column("created_at", TZ, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_auth_codes_email", "auth_codes", ["email"])

    op.create_table(
        "user_sessions",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False, unique=True),
        sa.Column("user_agent", sa.String(300), nullable=True),
        sa.Column("expires_at", TZ, nullable=False),
        sa.Column("revoked_at", TZ, nullable=True),
        sa.Column("created_at", TZ, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_user_sessions_user_id", table_name="user_sessions")
    op.drop_table("user_sessions")
    op.drop_index("ix_auth_codes_email", table_name="auth_codes")
    op.drop_table("auth_codes")
    op.drop_constraint("uq_users_google_sub", "users", type_="unique")
    op.drop_constraint("uq_users_email", "users", type_="unique")
    for c in ("last_login_at", "onboarded_at", "signup_completed_at", "onboarding", "company",
              "currency", "country", "avatar_url", "google_sub", "email_verified_at", "email"):
        op.drop_column("users", c)
