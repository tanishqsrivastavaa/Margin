from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.models import PointStatus, Role


class PageCreate(BaseModel):
    title: str = ""
    goal: str = ""
    instructions: str = ""


class PageUpdate(BaseModel):
    title: str | None = None
    goal: str | None = None
    instructions: str | None = None
    body_json: dict[str, Any] | None = None


class PageSummary(BaseModel):
    id: str
    title: str
    updated_at: datetime


class PointOut(BaseModel):
    id: str
    block_id: str
    position: int
    summary_line: str
    status: PointStatus
    unlocked: bool


class PageOut(PageSummary):
    goal: str
    instructions: str
    body_json: dict[str, Any]
    points: list[PointOut]


class PointIn(BaseModel):
    block_id: str
    text: str
    position: int = 0


class MessageOut(BaseModel):
    id: int
    role: Role
    content: str
    rung: int | None
    created_at: datetime


class ThreadOut(BaseModel):
    point: PointOut
    text_snapshot: str
    messages: list[MessageOut]


class ReplyIn(BaseModel):
    content: str | None = None
