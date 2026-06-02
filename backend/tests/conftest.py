"""Shared test fixtures: in-memory SQLite + httpx ASGI client."""

from __future__ import annotations

import os
import uuid

# Test environment. Set these BEFORE importing src.* so pydantic-settings
# picks them up. JWT_SECRET has no default in code (production safety) —
# tests pin a long static value here.
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("JWT_SECRET", "test-only-jwt-secret-not-for-production-0123456789abcdef")

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from src.auth.rate_limit import reset_login_throttle
from src.db import session as db_session_module
from src.main import app
from src.models.base import Base


@pytest.fixture(autouse=True)
def _reset_login_throttle():
    # The login throttle is process-global by design (single Gunicorn
    # worker in prod). Tests run in the same process and would leak
    # buckets across cases, so clear it before AND after each test.
    reset_login_throttle()
    yield
    reset_login_throttle()


@pytest_asyncio.fixture
async def db_engine():
    # Fresh in-memory DB per test, shared across connections via a single
    # StaticPool — SQLAlchemy's default behavior with :memory: would give
    # each connection a brand-new DB and break us.
    from sqlalchemy.pool import StaticPool

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session_factory(db_engine):
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    return factory


@pytest_asyncio.fixture
async def client(db_session_factory):
    async def _override_get_db():
        async with db_session_factory() as s:
            yield s

    app.dependency_overrides[db_session_module.get_db] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


async def register_user(
    client: AsyncClient,
    *,
    username: str | None = None,
    password: str = "secret-1234",
) -> dict:
    if username is None:
        username = f"u-{uuid.uuid4().hex[:8]}"
    r = await client.post("/api/auth/register", json={"username": username, "password": password})
    assert r.status_code == 201, r.text
    body = r.json()
    return {
        "token": body["access_token"],
        "user": body["user"],
        "username": username,
        "password": password,
    }


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
