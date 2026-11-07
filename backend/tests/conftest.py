import os

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["AUTH_DEV_BYPASS"] = "true"

import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel

from app.db import engine
from app.llm import get_llm
from app.main import app


class FakeLLM:
    def __init__(self) -> None:
        self.helper_replies: list[str] = []
        self.thread_chunks: list[str] = ["[rung:", "1] What ", "makes you sure?"]
        self.thread_calls: list[list[dict]] = []

    async def helper(self, messages):
        return self.helper_replies.pop(0) if self.helper_replies else "A summary line"

    async def stream_thread(self, messages):
        self.thread_calls.append(messages)
        for chunk in self.thread_chunks:
            yield chunk


@pytest.fixture
def llm():
    return FakeLLM()


@pytest.fixture
def client(llm):
    SQLModel.metadata.create_all(engine)
    app.dependency_overrides[get_llm] = lambda: llm
    with TestClient(app, headers={"Authorization": "Bearer dev:ada@example.com"}) as c:
        yield c
    app.dependency_overrides.clear()
    SQLModel.metadata.drop_all(engine)


def doc(*paragraphs: tuple[str, str]) -> dict:
    return {
        "type": "doc",
        "content": [
            {"type": "paragraph", "attrs": {"id": bid}, "content": [{"type": "text", "text": text}]}
            for bid, text in paragraphs
        ],
    }
