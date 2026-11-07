import json
import re
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlmodel import Session, col, select

from app.access import owned_page, owned_point, point_out
from app.auth import current_user
from app.config import Settings, get_settings
from app.context import max_rung, refresh_thread_summary, thread_messages
from app.db import get_session
from app.document import neighbors
from app.llm import LLM, get_llm
from app.models import Message, Page, Point, PointStatus, Role, User, now
from app.prompts import DETECT_PROMPT, SUMMARY_PROMPT
from app.rung import RungParser
from app.schemas import MessageOut, PointIn, PointOut, ReplyIn, ThreadOut

router = APIRouter(tags=["points"])


def parse_detection(raw: str) -> tuple[bool, str]:
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    try:
        data = json.loads(match.group(0)) if match else {}
    except json.JSONDecodeError:
        data = {}
    return bool(data.get("is_point")), str(data.get("summary", "")).strip()


def upsert_point(session: Session, page: Page, body: PointIn, summary: str) -> Point:
    point = session.exec(select(Point).where(Point.page_id == page.id, Point.block_id == body.block_id)).first()
    point = point or Point(page_id=page.id, block_id=body.block_id)
    point.position = body.position
    point.text_snapshot = body.text
    point.summary_line = summary
    if point.status == PointStatus.stale:
        point.status = PointStatus.open
    session.add(point)
    session.commit()
    session.refresh(point)
    return point


@router.post("/pages/{page_id}/points/detect", response_model=PointOut | None)
async def detect_point(
    page_id: str,
    body: PointIn,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
    llm: LLM = Depends(get_llm),
):
    page = owned_page(session, user, page_id)
    raw = await llm.helper([
        {"role": "system", "content": DETECT_PROMPT.format(goal=page.goal or "Not set")},
        {"role": "user", "content": body.text},
    ])
    is_point, summary = parse_detection(raw)
    if not is_point:
        return None
    return point_out(upsert_point(session, page, body, summary))


@router.post("/pages/{page_id}/points", response_model=PointOut)
async def create_point(
    page_id: str,
    body: PointIn,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
    llm: LLM = Depends(get_llm),
):
    page = owned_page(session, user, page_id)
    summary = await llm.helper([
        {"role": "system", "content": SUMMARY_PROMPT},
        {"role": "user", "content": body.text},
    ])
    return point_out(upsert_point(session, page, body, summary.strip()))


@router.get("/points/{point_id}", response_model=ThreadOut)
def get_thread(point_id: str, user: User = Depends(current_user), session: Session = Depends(get_session)):
    _, point = owned_point(session, user, point_id)
    messages = session.exec(select(Message).where(Message.point_id == point.id).order_by(col(Message.id))).all()
    return ThreadOut(
        point=point_out(point),
        text_snapshot=point.text_snapshot,
        messages=[MessageOut.model_validate(m, from_attributes=True) for m in messages],
    )


@router.post("/points/{point_id}/unlock", response_model=PointOut)
def unlock_point(point_id: str, user: User = Depends(current_user), session: Session = Depends(get_session)):
    _, point = owned_point(session, user, point_id)
    point.unlocked_at = point.unlocked_at or now()
    session.add(point)
    session.commit()
    session.refresh(point)
    return point_out(point)


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.post("/points/{point_id}/reply")
async def reply(
    point_id: str,
    body: ReplyIn,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
    llm: LLM = Depends(get_llm),
    settings: Settings = Depends(get_settings),
):
    page, point = owned_point(session, user, point_id)
    _, text, _ = neighbors(page.body_json, point.block_id)
    if text is not None and text != point.text_snapshot:
        point.text_snapshot = text
    point.status = PointStatus.open
    session.add(point)
    if body.content:
        session.add(Message(point_id=point.id, role=Role.user, content=body.content))
    session.commit()

    await refresh_thread_summary(session, point, llm, settings)
    messages = thread_messages(session, page, point)
    parser = RungParser(max_rung(point))
    engine = session.get_bind()

    async def stream() -> AsyncIterator[str]:
        parts: list[str] = []
        async for chunk in llm.stream_thread(messages):
            if text := parser.feed(chunk):
                parts.append(text)
                yield sse("token", {"text": text})
        if tail := parser.flush():
            parts.append(tail)
            yield sse("token", {"text": tail})
        with Session(engine) as db:
            message = Message(point_id=point_id, role=Role.assistant, content="".join(parts).strip(), rung=parser.rung)
            db.add(message)
            db.commit()
            db.refresh(message)
            yield sse("done", MessageOut.model_validate(message, from_attributes=True).model_dump(mode="json"))

    return StreamingResponse(stream(), media_type="text/event-stream")
