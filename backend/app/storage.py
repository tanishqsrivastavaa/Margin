from functools import lru_cache

import boto3
from botocore.config import Config

from app.config import get_settings


@lru_cache
def get_storage():
    settings = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=settings.aws_endpoint_url_s3,
        region_name=settings.aws_region,
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        config=Config(s3={"addressing_style": "path"}),
    )


def page_key(page_id: str, name: str) -> str:
    return f"pages/{page_id}/{name}"
