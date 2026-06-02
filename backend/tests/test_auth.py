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


async def test_login_throttle_ip_limit_triggers_across_usernames(
    client: AsyncClient,
) -> None:
    """A botnet rotating through usernames from one IP must hit IP_LIMIT.

    The username bucket is 5 so we exhaust user A (5 failures) and user B
    (5 failures) to drive the IP counter to its 10 ceiling, then assert
    that even a brand-new username from the same IP is rejected — the
    refusal must be IP-keyed, not username-keyed.
    """
    a = await register_user(client, username="ip_alpha")
    b = await register_user(client, username="ip_bravo")
    c = await register_user(client, username="ip_charlie")
    for _ in range(5):
        r = await client.post(
            "/api/auth/login",
            json={"username": a["username"], "password": "wrong-pw-12345"},
        )
        assert r.status_code == 401, r.text
    for _ in range(5):
        r = await client.post(
            "/api/auth/login",
            json={"username": b["username"], "password": "wrong-pw-12345"},
        )
        assert r.status_code == 401, r.text
    # User C is below ITS own quota but the shared IP is now at 10.
    # Even a correct password should be refused with the IP-keyed message.
    r = await client.post(
        "/api/auth/login",
        json={"username": c["username"], "password": c["password"]},
    )
    assert r.status_code == 429, r.text
    assert r.headers.get("retry-after")
    # The IP-keyed message is the one we surfaced before any username-bucket
    # check would run — confirm we hit that branch, not the username branch.
    assert "账号" not in r.json()["detail"]


async def test_login_throttle_isolates_distinct_forwarded_ips(
    client: AsyncClient,
) -> None:
    """X-Forwarded-For governs the IP key; two different upstream IPs
    must not poison each other.

    Without this guarantee a single attacker who can spoof X-Forwarded-For
    would be globally rate-limited — but worse, two legitimate users sharing
    nothing but our nginx proxy would lock each other out.
    """
    a = await register_user(client, username="xff_user_a")
    b = await register_user(client, username="xff_user_b")
    bad_ip = {"X-Forwarded-For": "203.0.113.10"}
    good_ip = {"X-Forwarded-For": "198.51.100.20"}
    # Saturate the bad IP across two usernames to reach IP_LIMIT (=10).
    for _ in range(5):
        r = await client.post(
            "/api/auth/login",
            headers=bad_ip,
            json={"username": a["username"], "password": "wrong-pw-12345"},
        )
        assert r.status_code == 401, r.text
    for _ in range(5):
        r = await client.post(
            "/api/auth/login",
            headers=bad_ip,
            json={"username": b["username"], "password": "wrong-pw-12345"},
        )
        assert r.status_code == 401, r.text
    # Bad IP is now blocked even for a brand-new password attempt.
    r_bad = await client.post(
        "/api/auth/login",
        headers=bad_ip,
        json={"username": a["username"], "password": a["password"]},
    )
    assert r_bad.status_code == 429
    # User B from the good IP must still log in: separate IP bucket, and
    # the username bucket for B was filled by the bad IP — to keep this
    # test scoped to the IP isolation question, we use user A from the
    # good IP since A's username bucket was also filled. Hmm — both
    # username buckets are saturated. Register a fresh user and exercise
    # the good IP through them.
    fresh = await register_user(client, username="xff_user_fresh")
    r_good = await client.post(
        "/api/auth/login",
        headers=good_ip,
        json={"username": fresh["username"], "password": fresh["password"]},
    )
    assert r_good.status_code == 200, r_good.text
