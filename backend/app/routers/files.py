from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile, status
from sqlmodel import Session

from app.access import owned_page
from app.auth import current_user
from app.config import get_settings
from app.db import get_session
from app.models import User
from app.storage import get_storage, page_key

router = APIRouter(prefix="/pages/{page_id}/files", tags=["files"])


@router.put("/{name}", status_code=status.HTTP_201_CREATED)
async def upload_file(
    page_id: str,
    name: str,
    file: UploadFile,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
    storage=Depends(get_storage),
) -> dict[str, str | int]:
    owned_page(session, user, page_id)
    data = await file.read()
    storage.put_object(
        Bucket=get_settings().storage_bucket,
        Key=page_key(page_id, name),
        Body=data,
        ContentType=file.content_type or "application/octet-stream",
    )
    return {"name": name, "size": len(data)}


@router.get("/{name}")
def download_file(
    page_id: str,
    name: str,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
    storage=Depends(get_storage),
) -> Response:
    owned_page(session, user, page_id)
    try:
        obj = storage.get_object(Bucket=get_settings().storage_bucket, Key=page_key(page_id, name))
    except ClientError as exc:
        if exc.response["Error"]["Code"] in ("NoSuchKey", "404"):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found") from exc
        raise
    return Response(obj["Body"].read(), media_type=obj["ContentType"])
