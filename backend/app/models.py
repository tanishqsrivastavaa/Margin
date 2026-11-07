import uuid
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import JSON, Column, UniqueConstraint
from sqlmodel import Field, SQLModel


def now() -> datetime:
    return datetime.now(UTC)


def new_id() -> str:
    return str(uuid.uuid4())


class PointStatus(StrEnum):
    candidate = "candidate"
    open = "open"
    stale = "stale"


class Role(StrEnum):
    user = "user"
    assistant = "assistant"


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: str = Field(primary_key=True)
    email: str | None = None
    name: str | None = None
    created_at: datetime = Field(default_factory=now)


class Page(SQLModel, table=True):
    __tablename__ = "pages"

    id: str = Field(default_factory=new_id, primary_key=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    title: str = ""
    goal: str = ""
    instructions: str = ""
    body_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


class Point(SQLModel, table=True):
    __tablename__ = "points"
    __table_args__ = (UniqueConstraint("page_id", "block_id"),)

    id: str = Field(default_factory=new_id, primary_key=True)
    page_id: str = Field(foreign_key="pages.id", index=True, ondelete="CASCADE")
    block_id: str
    position: int = 0
    text_snapshot: str = ""
    summary_line: str = ""
    status: PointStatus = PointStatus.candidate
    unlocked_at: datetime | None = None
    created_at: datetime = Field(default_factory=now)


class Message(SQLModel, table=True):
    __tablename__ = "messages"

    id: int | None = Field(default=None, primary_key=True)
    point_id: str = Field(foreign_key="points.id", index=True, ondelete="CASCADE")
    role: Role
    content: str
    rung: int | None = None
    created_at: datetime = Field(default_factory=now)


class ThreadSummary(SQLModel, table=True):
    __tablename__ = "thread_summaries"

    point_id: str = Field(foreign_key="points.id", primary_key=True, ondelete="CASCADE")
    summary: str
    upto_message_id: int
