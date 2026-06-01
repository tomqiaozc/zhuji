"""Password hashing + JWT utilities."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from jose import JWTError, jwt
from passlib.context import CryptContext

from src.config import settings

_pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Token-type claim used to separate the long-lived API JWT from the
# short-lived asset-viewer JWT. The viewer token is embedded in image
# URLs (``?token=...``) so it must be scoped to read-only blob fetches
# and expire quickly; the main API JWT is never accepted from URLs.
_TYP_ACCESS = "access"
_TYP_ASSET_VIEWER = "asset-viewer"

# Hard cap on viewer-token TTL — the spec calls for ≤15 minutes.
_ASSET_VIEWER_TTL_MIN = 15


def hash_password(plain: str) -> str:
    return _pwd_ctx.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_ctx.verify(plain, hashed)


def create_access_token(user_id: UUID, expires_minutes: int | None = None) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes or settings.jwt_expire_minutes)
    payload: dict[str, Any] = {"sub": str(user_id), "exp": expires, "typ": _TYP_ACCESS}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> UUID:
    """Return the user UUID encoded in the API JWT.

    Rejects asset-viewer tokens — those are scoped to image fetches and
    must not unlock the rest of the API.
    """
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    typ = payload.get("typ")
    # Tokens issued before the typ-claim split have no ``typ`` field.
    # Accept them as access tokens so live sessions keep working across
    # the deploy; brand-new tokens always carry ``typ=access``.
    if typ is not None and typ != _TYP_ACCESS:
        raise JWTError("wrong token type for API access")
    sub = payload.get("sub")
    if not isinstance(sub, str):
        raise JWTError("missing sub claim")
    try:
        return UUID(sub)
    except ValueError as exc:
        raise JWTError("malformed sub claim") from exc


def create_asset_viewer_token(user_id: UUID) -> tuple[str, int]:
    """Mint a short-lived JWT for embedding in ``<img src>``.

    Returns ``(token, expires_in_seconds)``. Scoped via the ``typ`` claim
    so the asset endpoint can refuse main API JWTs in the URL.
    """
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=_ASSET_VIEWER_TTL_MIN)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "exp": expires_at,
        "typ": _TYP_ASSET_VIEWER,
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, _ASSET_VIEWER_TTL_MIN * 60


def decode_asset_viewer_token(token: str) -> UUID:
    """Return the user UUID encoded in an asset-viewer JWT.

    Only accepts tokens issued via :func:`create_asset_viewer_token`;
    regular API JWTs are rejected so a leaked URL only ever exposes the
    asset gallery, not the rest of the API.
    """
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    if payload.get("typ") != _TYP_ASSET_VIEWER:
        raise JWTError("not an asset-viewer token")
    sub = payload.get("sub")
    if not isinstance(sub, str):
        raise JWTError("missing sub claim")
    try:
        return UUID(sub)
    except ValueError as exc:
        raise JWTError("malformed sub claim") from exc

