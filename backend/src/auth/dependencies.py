"""FastAPI auth dependency — resolve User from Bearer JWT."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import Depends, HTTPException, Request, status
from jose import JWTError
from sqlalchemy import select

from src.auth.security import decode_access_token
from src.db.session import get_db
from src.models.base import User

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


def _extract_token(request: Request) -> str | None:
    """Return the JWT from Authorization header, or fall back to ``?token=``.

    The query-string fallback exists for endpoints called via plain
    ``<img src>`` / browser navigation where adding a custom header is
    impractical. Callers that have a choice should still use the header.
    """
    auth_header = request.headers.get("Authorization") or ""
    if auth_header.lower().startswith("bearer "):
        return auth_header.split(" ", 1)[1].strip()
    qs_token = request.query_params.get("token")
    return qs_token or None


async def get_current_user(
    request: Request,
    db: "AsyncSession" = Depends(get_db),
) -> User:
    token = _extract_token(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id = decode_access_token(token)
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return user
