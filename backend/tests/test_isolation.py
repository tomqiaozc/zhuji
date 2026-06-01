"""Cross-user isolation — no user may access another user's resources."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers, register_user

pytestmark = pytest.mark.asyncio


async def test_user_cannot_see_other_users_project(client: AsyncClient) -> None:
    alice = await register_user(client, username="alice")
    bob = await register_user(client, username="bob")

    r = await client.post(
        "/api/projects",
        headers=auth_headers(alice["token"]),
        json={"name": "Alice 的家"},
    )
    alice_pid = r.json()["id"]

    # Bob can list — but should see nothing
    r = await client.get("/api/projects", headers=auth_headers(bob["token"]))
    assert r.json() == []

    # Direct GET → 404 for Bob
    r = await client.get(f"/api/projects/{alice_pid}", headers=auth_headers(bob["token"]))
    assert r.status_code == 404

    # PATCH / DELETE → 404 too (never 403; we don't leak existence)
    r = await client.patch(
        f"/api/projects/{alice_pid}",
        headers=auth_headers(bob["token"]),
        json={"name": "Bob 想改名"},
    )
    assert r.status_code == 404
    r = await client.delete(f"/api/projects/{alice_pid}", headers=auth_headers(bob["token"]))
    assert r.status_code == 404


async def test_user_cannot_write_to_other_users_project(client: AsyncClient) -> None:
    alice = await register_user(client, username="alice2")
    bob = await register_user(client, username="bob2")

    r = await client.post("/api/projects", headers=auth_headers(alice["token"]), json={"name": "A"})
    alice_pid = r.json()["id"]

    # Bob tries to create a node under Alice's project
    r = await client.post(
        f"/api/projects/{alice_pid}/nodes",
        headers=auth_headers(bob["token"]),
        json={"stage": "拆", "name": "偷偷加节点"},
    )
    assert r.status_code == 404

    # Same for purchases and reminders
    r = await client.post(
        f"/api/projects/{alice_pid}/purchases",
        headers=auth_headers(bob["token"]),
        json={
            "name": "x",
            "category": "x",
            "unit_price": 1,
            "quantity": 1,
            "total_price": 1,
        },
    )
    assert r.status_code == 404
    r = await client.post(
        f"/api/projects/{alice_pid}/reminders",
        headers=auth_headers(bob["token"]),
        json={"title": "x", "trigger_at": "2027-01-01T00:00:00Z"},
    )
    assert r.status_code == 404


async def test_node_and_checklist_are_isolated(client: AsyncClient) -> None:
    alice = await register_user(client, username="alice3")
    bob = await register_user(client, username="bob3")

    r = await client.post("/api/projects", headers=auth_headers(alice["token"]), json={"name": "A"})
    alice_pid = r.json()["id"]
    r = await client.post(
        f"/api/projects/{alice_pid}/nodes",
        headers=auth_headers(alice["token"]),
        json={"stage": "瓦工", "name": "贴砖"},
    )
    nid = r.json()["id"]
    r = await client.post(
        f"/api/nodes/{nid}/checklist",
        headers=auth_headers(alice["token"]),
        json={"text": "对缝", "order": 0},
    )
    cid = r.json()["id"]

    # Bob — every shape must 404
    for path in (f"/api/nodes/{nid}", f"/api/nodes/{nid}/checklist"):
        r = await client.get(path, headers=auth_headers(bob["token"]))
        assert r.status_code == 404, path
    r = await client.patch(
        f"/api/checklist/{cid}",
        headers=auth_headers(bob["token"]),
        json={"done": True},
    )
    assert r.status_code == 404
    r = await client.delete(f"/api/checklist/{cid}", headers=auth_headers(bob["token"]))
    assert r.status_code == 404


async def test_purchase_cross_project_node_rejected(client: AsyncClient) -> None:
    """Even within the same user, you can't attach a purchase to a node in a different project."""
    alice = await register_user(client, username="alice4")
    h = auth_headers(alice["token"])

    r = await client.post("/api/projects", headers=h, json={"name": "P1"})
    p1 = r.json()["id"]
    r = await client.post("/api/projects", headers=h, json={"name": "P2"})
    p2 = r.json()["id"]
    r = await client.post(
        f"/api/projects/{p2}/nodes",
        headers=h,
        json={"stage": "X", "name": "其他项目节点"},
    )
    other_node = r.json()["id"]

    r = await client.post(
        f"/api/projects/{p1}/purchases",
        headers=h,
        json={
            "node_id": other_node,
            "name": "x",
            "category": "x",
            "unit_price": 1,
            "quantity": 1,
            "total_price": 1,
        },
    )
    assert r.status_code == 400
