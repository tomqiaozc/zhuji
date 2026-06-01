"""POST /api/projects/load-demo — shape, scope, totals."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers, register_user

pytestmark = pytest.mark.asyncio


async def test_load_demo_shape(client: AsyncClient) -> None:
    info = await register_user(client, username="demo-shape")
    h = auth_headers(info["token"])
    r = await client.post("/api/projects/load-demo", headers=h)
    assert r.status_code == 200, r.text
    body = r.json()

    stats = body["stats"]
    assert stats["stage_count"] == 11
    assert stats["node_count"] == 62
    assert 25 <= stats["purchase_count"] <= 40, stats
    assert 60_000 <= stats["total_spent"] <= 80_000, stats

    # Project lands under this user
    project_id = body["project"]["id"]
    r = await client.get("/api/projects", headers=h)
    ids = [p["id"] for p in r.json()]
    assert project_id in ids

    # Nodes + purchases land under that project
    r = await client.get(f"/api/projects/{project_id}/nodes", headers=h)
    assert len(r.json()) == 62
    r = await client.get(f"/api/projects/{project_id}/purchases", headers=h)
    assert 25 <= len(r.json()) <= 40


async def test_load_demo_does_not_leak_across_users(client: AsyncClient) -> None:
    alice = await register_user(client, username="demo-a")
    bob = await register_user(client, username="demo-b")

    r = await client.post("/api/projects/load-demo", headers=auth_headers(alice["token"]))
    assert r.status_code == 200
    alice_project = r.json()["project"]["id"]

    # Bob still has nothing
    r = await client.get("/api/projects", headers=auth_headers(bob["token"]))
    assert r.json() == []

    # Bob can't see Alice's seeded project
    r = await client.get(f"/api/projects/{alice_project}", headers=auth_headers(bob["token"]))
    assert r.status_code == 404


async def test_load_demo_twice_keeps_both(client: AsyncClient) -> None:
    """Calling load-demo a second time creates another demo project rather than failing."""
    info = await register_user(client, username="demo-twice")
    h = auth_headers(info["token"])
    await client.post("/api/projects/load-demo", headers=h)
    await client.post("/api/projects/load-demo", headers=h)
    r = await client.get("/api/projects", headers=h)
    assert len(r.json()) == 2
