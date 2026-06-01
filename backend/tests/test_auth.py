"""Auth round-trip: register, login, /me, password rules, duplicate usernames."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers, register_user

pytestmark = pytest.mark.asyncio


async def test_register_returns_token_and_user(client: AsyncClient) -> None:
    r = await client.post(
        "/api/auth/register",
        json={"username": "alice", "password": "longenough"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["user"]["username"] == "alice"


async def test_password_too_short_rejected(client: AsyncClient) -> None:
    r = await client.post(
        "/api/auth/register",
        json={"username": "bob", "password": "short"},
    )
    assert r.status_code == 422
    assert "8" in r.text


async def test_duplicate_username_conflicts(client: AsyncClient) -> None:
    await register_user(client, username="carol")
    r = await client.post(
        "/api/auth/register",
        json={"username": "carol", "password": "secret-1234"},
    )
    assert r.status_code == 409


async def test_login_with_wrong_password_fails(client: AsyncClient) -> None:
    info = await register_user(client, username="dave")
    r = await client.post(
        "/api/auth/login",
        json={"username": info["username"], "password": "wrong-pw-12345"},
    )
    assert r.status_code == 401


async def test_login_then_me(client: AsyncClient) -> None:
    info = await register_user(client, username="eve")
    r = await client.post(
        "/api/auth/login",
        json={"username": info["username"], "password": info["password"]},
    )
    assert r.status_code == 200
    token = r.json()["access_token"]
    r = await client.get("/api/auth/me", headers=auth_headers(token))
    assert r.status_code == 200
    assert r.json()["username"] == "eve"


async def test_me_without_token_is_401(client: AsyncClient) -> None:
    r = await client.get("/api/auth/me")
    assert r.status_code == 401


async def test_invalid_token_is_401(client: AsyncClient) -> None:
    r = await client.get("/api/auth/me", headers=auth_headers("garbage"))
    assert r.status_code == 401
