from collections.abc import Iterator

from sqlalchemy import event
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, create_engine

from app.config import get_settings


def make_engine(url: str):
    if not url.startswith("sqlite"):
        return create_engine(url, pool_pre_ping=True)
    engine = create_engine(url, connect_args={"check_same_thread": False}, poolclass=StaticPool)
    event.listen(engine, "connect", lambda conn, _: conn.execute("PRAGMA foreign_keys=ON"))
    return engine


engine = make_engine(get_settings().database_url)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
