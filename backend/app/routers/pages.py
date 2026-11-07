from fastapi import APIRouter, Depends, status
from sqlmodel import Session, col, select

from app.access import owned_page, point_out
from app.auth import current_user
from app.db import get_session
from app.document import blocks
from app.models import Page, Point, PointStatus, User, now
from app.schemas import PageCreate, PageOut, PageSummary, PageUpdate

router = APIRouter(prefix="/pages", tags=["pages"])


def page_out(session: Session, page: Page) -> PageOut:
    points = session.exec(select(Point).where(Point.page_id == page.id).order_by(col(Point.position))).all()
    return PageOut(
        id=page.id,
        title=page.title,
        goal=page.goal,
        instructions=page.instructions,
        body_json=page.body_json,
        updated_at=page.updated_at,
        points=[point_out(p) for p in points],
    )


def mark_stale(session: Session, page: Page) -> None:
    texts = dict(blocks(page.body_json))
    for point in session.exec(select(Point).where(Point.page_id == page.id)).all():
        if point.status == PointStatus.open and texts.get(point.block_id) != point.text_snapshot:
            point.status = PointStatus.stale
            session.add(point)


@router.get("", response_model=list[PageSummary])
def list_pages(user: User = Depends(current_user), session: Session = Depends(get_session)):
    query = select(Page).where(Page.user_id == user.id).order_by(col(Page.updated_at).desc())
    return session.exec(query).all()


@router.post("", response_model=PageOut, status_code=status.HTTP_201_CREATED)
def create_page(body: PageCreate, user: User = Depends(current_user), session: Session = Depends(get_session)):
    page = Page(user_id=user.id, **body.model_dump())
    session.add(page)
    session.commit()
    session.refresh(page)
    return page_out(session, page)


@router.get("/{page_id}", response_model=PageOut)
def get_page(page_id: str, user: User = Depends(current_user), session: Session = Depends(get_session)):
    return page_out(session, owned_page(session, user, page_id))


@router.patch("/{page_id}", response_model=PageOut)
def update_page(
    page_id: str,
    body: PageUpdate,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    page = owned_page(session, user, page_id)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(page, field, value)
    page.updated_at = now()
    if body.body_json is not None:
        mark_stale(session, page)
    session.add(page)
    session.commit()
    session.refresh(page)
    return page_out(session, page)


@router.delete("/{page_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_page(page_id: str, user: User = Depends(current_user), session: Session = Depends(get_session)):
    session.delete(owned_page(session, user, page_id))
    session.commit()
