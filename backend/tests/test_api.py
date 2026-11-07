import json

from fastapi.testclient import TestClient

from tests.conftest import doc


def events(body: str) -> list[tuple[str, dict]]:
    out = []
    for block in body.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines())
        out.append((lines["event"], json.loads(lines["data"])))
    return out


def make_page(client: TestClient, **fields) -> dict:
    response = client.post("/pages", json={"title": "Two pointers", "goal": "Prep LeetCode", **fields})
    assert response.status_code == 201
    return response.json()


def test_requires_auth(client):
    assert client.get("/pages", headers={"Authorization": ""}).status_code == 401


def test_page_crud(client):
    page = make_page(client)
    assert client.get("/pages").json()[0]["id"] == page["id"]
    body = doc(("b1", "Use two pointers from both ends."))
    updated = client.patch(f"/pages/{page['id']}", json={"body_json": body, "instructions": "Be tough"}).json()
    assert updated["body_json"] == body
    assert updated["instructions"] == "Be tough"
    assert client.delete(f"/pages/{page['id']}").status_code == 204
    assert client.get(f"/pages/{page['id']}").status_code == 404


def test_pages_are_private(client):
    page = make_page(client)
    other = {"Authorization": "Bearer dev:bob@example.com"}
    assert client.get(f"/pages/{page['id']}", headers=other).status_code == 404
    assert client.get("/pages", headers=other).json() == []


def test_detect_point(client, llm):
    page = make_page(client)
    llm.helper_replies = ['{"is_point": false, "summary": ""}']
    assert client.post(f"/pages/{page['id']}/points/detect", json={"block_id": "b1", "text": "hmm"}).json() is None

    llm.helper_replies = ['Sure: {"is_point": true, "summary": "Two pointers solve it in O(n)"}']
    point = client.post(
        f"/pages/{page['id']}/points/detect", json={"block_id": "b1", "text": "Two pointers work here."}
    ).json()
    assert point["summary_line"] == "Two pointers solve it in O(n)"
    assert point["status"] == "candidate"
    assert len(client.get(f"/pages/{page['id']}").json()["points"]) == 1


def test_reply_streams_and_saves(client, llm):
    page = make_page(client, instructions="Be a tough interviewer")
    body = doc(("b0", "The array is sorted."), ("b1", "Two pointers work here."), ("b2", "Then return the pair."))
    client.patch(f"/pages/{page['id']}", json={"body_json": body})
    point = client.post(f"/pages/{page['id']}/points", json={"block_id": "b1", "text": "Two pointers work here."}).json()

    response = client.post(f"/points/{point['id']}/reply", json={})
    stream = events(response.text)
    assert "".join(e[1]["text"] for e in stream if e[0] == "token") == "What makes you sure?"
    assert stream[-1][0] == "done"
    assert stream[-1][1]["rung"] == 1

    prompt = "\n".join(m["content"] for m in llm.thread_calls[0])
    assert "Be a tough interviewer" in prompt
    assert "The array is sorted." in prompt
    assert "Then return the pair." in prompt
    assert "Highest rung allowed in this thread: 3" in prompt

    client.post(f"/points/{point['id']}/reply", json={"content": "Because it is sorted."})
    thread = client.get(f"/points/{point['id']}").json()
    assert [m["role"] for m in thread["messages"]] == ["assistant", "user", "assistant"]
    assert thread["point"]["status"] == "open"


def test_rung_capped_until_unlocked(client, llm):
    page = make_page(client)
    point = client.post(f"/pages/{page['id']}/points", json={"block_id": "b1", "text": "An idea."}).json()
    llm.thread_chunks = ["[rung:4] Here is the full answer."]

    done = events(client.post(f"/points/{point['id']}/reply", json={"content": "Just tell me"}).text)[-1][1]
    assert done["rung"] == 3

    assert client.post(f"/points/{point['id']}/unlock").json()["unlocked"] is True
    done = events(client.post(f"/points/{point['id']}/reply", json={"content": "Now tell me"}).text)[-1][1]
    assert done["rung"] == 4
    assert "Highest rung allowed in this thread: 4" in "\n".join(m["content"] for m in llm.thread_calls[-1])


def test_edit_marks_thread_stale(client):
    page = make_page(client)
    client.patch(f"/pages/{page['id']}", json={"body_json": doc(("b1", "First version."))})
    point = client.post(f"/pages/{page['id']}/points", json={"block_id": "b1", "text": "First version."}).json()
    client.post(f"/points/{point['id']}/reply", json={})

    client.patch(f"/pages/{page['id']}", json={"body_json": doc(("b1", "Second version."))})
    assert client.get(f"/points/{point['id']}").json()["point"]["status"] == "stale"

    client.post(f"/points/{point['id']}/reply", json={})
    thread = client.get(f"/points/{point['id']}").json()
    assert thread["point"]["status"] == "open"
    assert thread["text_snapshot"] == "Second version."


def test_long_threads_get_summarized(client, llm):
    page = make_page(client)
    point = client.post(f"/pages/{page['id']}/points", json={"block_id": "b1", "text": "An idea."}).json()
    for i in range(7):
        client.post(f"/points/{point['id']}/reply", json={"content": f"turn {i}"})
    llm.helper_replies = ["They settled on sorting first."]
    client.post(f"/points/{point['id']}/reply", json={"content": "turn 7"})

    last = "\n".join(m["content"] for m in llm.thread_calls[-1])
    assert "Earlier in this thread:\nThey settled on sorting first." in last
    assert "turn 0" not in last


def test_concurrent_first_requests_share_one_user(client):
    from fastapi.security import HTTPAuthorizationCredentials
    from sqlmodel import Session

    from app.auth import current_user
    from app.config import get_settings
    from app.db import engine
    from app.models import User

    with Session(engine) as other:
        other.add(User(id="dev-race@example.com", email="race@example.com"))
        other.commit()
    with Session(engine) as session:
        real_get = session.get
        calls = []

        def stale_get(model, key):
            calls.append(key)
            return None if len(calls) == 1 else real_get(model, key)

        session.get = stale_get
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="dev:race@example.com")
        user = current_user(creds, session, get_settings())
    assert user.id == "dev-race@example.com"
