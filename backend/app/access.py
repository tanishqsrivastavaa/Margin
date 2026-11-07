from fastapi import HTTPException, status
from sqlmodel import Session

from app.models import Page, Point, User
from app.schemas import PointOut


def owned_page(session: Session, user: User, page_id: str) -> Page:
    page = session.get(Page, page_id)
    if page is None or page.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Page not found")
    return page


def owned_point(session: Session, user: User, point_id: str) -> tuple[Page, Point]:
    point = session.get(Point, point_id)
    if point is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Point not found")
    return owned_page(session, user, point.page_id), point


def point_out(point: Point) -> PointOut:
    return PointOut(
        id=point.id,
        block_id=point.block_id,
        position=point.position,
        summary_line=point.summary_line,
        status=point.status,
        unlocked=point.unlocked_at is not None,
    )
