import io

import pytest
from botocore.exceptions import ClientError

from app.main import app
from app.storage import get_storage


class FakeStorage:
    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], tuple[bytes, str]] = {}

    def put_object(self, Bucket, Key, Body, ContentType):
        self.objects[Bucket, Key] = (Body, ContentType)

    def get_object(self, Bucket, Key):
        if (Bucket, Key) not in self.objects:
            raise ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject")
        body, content_type = self.objects[Bucket, Key]
        return {"Body": io.BytesIO(body), "ContentType": content_type}


@pytest.fixture
def storage(client):
    fake = FakeStorage()
    app.dependency_overrides[get_storage] = lambda: fake
    return fake


def test_upload_and_download(client, storage):
    page = client.post("/pages", json={"title": "Notes"}).json()
    data = bytes(range(256))
    response = client.put(f"/pages/{page['id']}/files/a.bin", files={"file": ("a.bin", data, "application/x-test")})
    assert response.status_code == 201
    assert response.json() == {"name": "a.bin", "size": 256}
    assert ("assets", f"pages/{page['id']}/a.bin") in storage.objects

    download = client.get(f"/pages/{page['id']}/files/a.bin")
    assert download.content == data
    assert download.headers["content-type"] == "application/x-test"
    assert client.get(f"/pages/{page['id']}/files/missing.bin").status_code == 404


def test_files_are_private(client, storage):
    page = client.post("/pages", json={"title": "Notes"}).json()
    client.put(f"/pages/{page['id']}/files/a.txt", files={"file": ("a.txt", b"hi", "text/plain")})
    other = {"Authorization": "Bearer dev:bob@example.com"}
    assert client.get(f"/pages/{page['id']}/files/a.txt", headers=other).status_code == 404
    response = client.put(f"/pages/{page['id']}/files/b.txt", files={"file": ("b.txt", b"x")}, headers=other)
    assert response.status_code == 404
