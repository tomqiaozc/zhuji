"""Async DB engine + session factory."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from src.config import settings

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator


def _build_engine_kwargs() -> dict:
    url = settings.database_url
    kw: dict = {"echo": False, "pool_pre_ping": True}
    # SQLite (used in tests) doesn't accept pool sizing kwargs
    if "sqlite" not in url:
        kw["pool_size"] = settings.db_pool_size
        kw["max_overflow"] = settings.db_max_overflow
    return kw


engine = create_async_engine(settings.database_url, **_build_engine_kwargs())

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        yield session
