from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

from app.config import Settings, get_settings
from app.db import get_session
from app.models import User

bearer = HTTPBearer(auto_error=False)


@lru_cache
def jwks_client(url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(url, cache_keys=True)


def decode_token(token: str, settings: Settings) -> dict:
    if settings.auth_dev_bypass and token.startswith("dev:"):
        email = token.removeprefix("dev:") or "dev@localhost"
        return {"sub": f"dev-{email}", "email": email}
    if not settings.neon_auth_jwks_url:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Auth is not configured")
    try:
        key = jwks_client(settings.neon_auth_jwks_url).get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            key.key,
            algorithms=["EdDSA", "RS256", "ES256"],
            issuer=settings.neon_auth_issuer or None,
            audience=settings.neon_auth_audience or None,
            options={"verify_aud": bool(settings.neon_auth_audience)},
            leeway=30,
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token") from exc


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> User:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing token")
    claims = decode_token(credentials.credentials, settings)
    user = session.get(User, claims["sub"])
    if user is None:
        session.add(User(id=claims["sub"], email=claims.get("email"), name=claims.get("name")))
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
        user = session.get(User, claims["sub"])
    return user
