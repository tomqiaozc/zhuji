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


async def test_login_throttle_blocks_after_repeated_failures(client: AsyncClient) -> None:
    """A flood of wrong-password attempts must eventually 429 instead of 401.

    Defends against credential-stuffing. Uses the username-bucket limit
    (5/window) — once we hit it, even a CORRECT password should still
    be rejected until the window expires.
    """
    info = await register_user(client, username="frank")
    for _ in range(5):
        r = await client.post(
            "/api/auth/login",
            json={"username": info["username"], "password": "wrong-pw-12345"},
        )
        assert r.status_code == 401, r.text
    r = await client.post(
        "/api/auth/login",
        json={"username": info["username"], "password": info["password"]},
    )
    assert r.status_code == 429, r.text
    assert r.headers.get("retry-after")


async def test_login_throttle_per_username_isolates_other_accounts(
    client: AsyncClient,
) -> None:
    """A bad actor pounding account A must not lock out account B."""
    a = await register_user(client, username="ggraham")
    b = await register_user(client, username="hhopper")
    for _ in range(5):
        await client.post(
            "/api/auth/login",
            json={"username": a["username"], "password": "wrong-pw-12345"},
        )
    r_a = await client.post(
        "/api/auth/login",
        json={"username": a["username"], "password": a["password"]},
    )
    assert r_a.status_code == 429
    r_b = await client.post(
        "/api/auth/login",
        json={"username": b["username"], "password": b["password"]},
    )
    assert r_b.status_code == 200, r_b.text
