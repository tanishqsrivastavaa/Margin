"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-11-07

"""
from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

text = sqlmodel.sql.sqltypes.AutoString
timestamp = sqlmodel.sql.sqltypes.UTCDateTime
point_status = sa.Enum("candidate", "open", "stale", name="pointstatus")
role = sa.Enum("user", "assistant", name="role")


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", text(), primary_key=True),
        sa.Column("email", text(), nullable=True),
        sa.Column("name", text(), nullable=True),
        sa.Column("created_at", timestamp(), nullable=False),
    )
    op.create_table(
        "pages",
        sa.Column("id", text(), primary_key=True),
        sa.Column("user_id", text(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("title", text(), nullable=False),
        sa.Column("goal", text(), nullable=False),
        sa.Column("instructions", text(), nullable=False),
        sa.Column("body_json", sa.JSON(), nullable=False),
        sa.Column("created_at", timestamp(), nullable=False),
        sa.Column("updated_at", timestamp(), nullable=False),
    )
    op.create_table(
        "points",
        sa.Column("id", text(), primary_key=True),
        sa.Column("page_id", text(), sa.ForeignKey("pages.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("block_id", text(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("text_snapshot", text(), nullable=False),
        sa.Column("summary_line", text(), nullable=False),
        sa.Column("status", point_status, nullable=False),
        sa.Column("unlocked_at", timestamp(), nullable=True),
        sa.Column("created_at", timestamp(), nullable=False),
        sa.UniqueConstraint("page_id", "block_id"),
    )
    op.create_table(
        "messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("point_id", text(), sa.ForeignKey("points.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("role", role, nullable=False),
        sa.Column("content", text(), nullable=False),
        sa.Column("rung", sa.Integer(), nullable=True),
        sa.Column("created_at", timestamp(), nullable=False),
    )
    op.create_table(
        "thread_summaries",
        sa.Column("point_id", text(), sa.ForeignKey("points.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("summary", text(), nullable=False),
        sa.Column("upto_message_id", sa.Integer(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("thread_summaries")
    op.drop_table("messages")
    op.drop_table("points")
    op.drop_table("pages")
    op.drop_table("users")
    role.drop(op.get_bind(), checkfirst=True)
    point_status.drop(op.get_bind(), checkfirst=True)
