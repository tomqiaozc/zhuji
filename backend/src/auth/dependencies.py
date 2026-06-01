"""FastAPI auth dependency — resolve User from Bearer JWT."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import Depends, HTTPException, Request, status
from jose import JWTError
from sqlalchemy import select

from src.auth.security import decode_access_token, decode_asset_viewer_token
from src.db.session import get_db
from src.models.base import User

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


def _bearer_token(request: Request) -> str | None:
    auth_header = request.headers.get("Authorization") or ""
    if auth_header.lower().startswith("bearer "):
        return auth_header.split(" ", 1)[1].strip()
    return None


async def _user_for_id(db: "AsyncSession", user_id) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return user


async def get_current_user(
    request: Request,
    db: "AsyncSession" = Depends(get_db),
) -> User:
    """Resolve the user from the Authorization: Bearer header.

    The main JWT is intentionally NOT accepted from query strings —
    embedding it in URLs leaks it to browser history, server logs, and
    Referer headers. For endpoints called via plain ``<img src>`` use
    :func:`get_asset_viewer_user` and the short-TTL viewer token.
    """
    token = _bearer_token(request)
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
    return await _user_for_id(db, user_id)


async def get_asset_viewer_user(
    request: Request,
    db: "AsyncSession" = Depends(get_db),
) -> User:
    """Resolve the user for the asset-content endpoint.

    Accepts EITHER the regular API JWT via ``Authorization: Bearer ...``
    (for programmatic callers) OR a short-lived asset-viewer token via
    ``?token=...`` (so ``<img src>`` works). The main JWT is never
    accepted from the query string.
    """
    bearer = _bearer_token(request)
    if bearer:
        try:
            user_id = decode_access_token(bearer)
        except JWTError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid token: {exc}",
                headers={"WWW-Authenticate": "Bearer"},
            ) from exc
        return await _user_for_id(db, user_id)

    qs_token = request.query_params.get("token")
    if not qs_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        user_id = decode_asset_viewer_token(qs_token)
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    return await _user_for_id(db, user_id)
