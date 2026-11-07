from sqlmodel import Session, col, select

from app.config import Settings
from app.document import neighbors
from app.llm import LLM, ChatMessage
from app.models import Message, Page, Point, ThreadSummary
from app.prompts import CORE_RULES, THREAD_SUMMARY_PROMPT, page_frame


def max_rung(point: Point) -> int:
    return 4 if point.unlocked_at else 3


def page_map(session: Session, page: Page, focus: Point) -> str:
    points = session.exec(
        select(Point).where(Point.page_id == page.id, Point.summary_line != "").order_by(col(Point.position))
    ).all()
    lines = [f"{'>' if p.id == focus.id else '-'} {p.summary_line}" for p in points]
    return "\n".join(lines) or "No other points yet."


def focus_block(page: Page, point: Point) -> str:
    before, text, after = neighbors(page.body_json, point.block_id)
    parts = []
    if before:
        parts.append(f"Paragraph before:\n{before}")
    parts.append(f"The point:\n{text if text is not None else point.text_snapshot}")
    if after:
        parts.append(f"Paragraph after:\n{after}")
    return "\n\n".join(parts)


async def refresh_thread_summary(session: Session, point: Point, llm: LLM, settings: Settings) -> None:
    messages = session.exec(select(Message).where(Message.point_id == point.id).order_by(col(Message.id))).all()
    if len(messages) <= settings.thread_summarize_after:
        return
    older = messages[: -settings.thread_keep_recent]
    existing = session.get(ThreadSummary, point.id)
    if existing and existing.upto_message_id >= older[-1].id:
        return
    transcript = "\n".join(f"{m.role}: {m.content}" for m in older)
    summary = await llm.helper([
        {"role": "system", "content": THREAD_SUMMARY_PROMPT},
        {"role": "user", "content": transcript},
    ])
    record = existing or ThreadSummary(point_id=point.id, summary="", upto_message_id=0)
    record.summary = summary.strip()
    record.upto_message_id = older[-1].id
    session.add(record)
    session.commit()


def thread_messages(session: Session, page: Page, point: Point) -> list[ChatMessage]:
    summary = session.get(ThreadSummary, point.id)
    query = select(Message).where(Message.point_id == point.id).order_by(col(Message.id))
    if summary:
        query = query.where(col(Message.id) > summary.upto_message_id)
    recent = session.exec(query).all()

    context = [
        f"Highest rung allowed in this thread: {max_rung(point)}",
        f"Page map (one line per point, > marks the focus):\n{page_map(session, page, point)}",
        focus_block(page, point),
    ]
    if summary:
        context.append(f"Earlier in this thread:\n{summary.summary}")

    messages: list[ChatMessage] = [
        {"role": "system", "content": CORE_RULES},
        {"role": "system", "content": page_frame(page.title, page.goal, page.instructions)},
        {"role": "system", "content": "\n\n".join(context)},
    ]
    messages += [{"role": m.role.value, "content": m.content} for m in recent]
    if not recent or recent[-1].role != "user":
        messages.append({"role": "user", "content": "Respond to my point."})
    return messages
