"""Auth router — register / login / me."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select

from src.auth.dependencies import get_current_user
from src.auth.rate_limit import check_login_rate_limit, record_login_failure
from src.auth.security import (
    create_access_token,
    create_asset_viewer_token,
    hash_password,
    verify_password,
)
from src.db.session import get_db
from src.models.base import User
from src.schemas.api import (
    AssetViewerTokenResponse,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserOut,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, db: "AsyncSession" = Depends(get_db)) -> TokenResponse:
    existing = await db.execute(select(User).where(User.username == payload.username))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="用户名已被占用")

    user = User(username=payload.username, password_hash=hash_password(payload.password))
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return TokenResponse(
        access_token=create_access_token(user.id),
        user=UserOut.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    db: "AsyncSession" = Depends(get_db),
) -> TokenResponse:
    # Throttle BEFORE the DB hit so a flood of bad attempts can't
    # also DoS Postgres with bcrypt verifies.
    check_login_rate_limit(request, payload.username)
    result = await db.execute(select(User).where(User.username == payload.username))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(payload.password, user.password_hash):
        record_login_failure(request, payload.username)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")
    return TokenResponse(
        access_token=create_access_token(user.id),
        user=UserOut.model_validate(user),
    )


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)


@router.post("/asset-viewer-token", response_model=AssetViewerTokenResponse)
async def issue_asset_viewer_token(
    user: User = Depends(get_current_user),
) -> AssetViewerTokenResponse:
    """Mint a short-TTL token for ``<img src>`` to use in URLs.

    The frontend caches the token in memory and refreshes it before
    expiry. Scoped via the ``typ`` claim so a leaked image URL only
    grants read access to the asset proxy, never the rest of the API.
    """
    token, ttl_seconds = create_asset_viewer_token(user.id)
    return AssetViewerTokenResponse(token=token, expires_in=ttl_seconds)
