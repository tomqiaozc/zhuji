"""GET /api/projects/{id}/snapshot — one-shot read for hydration."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers, register_user

pytestmark = pytest.mark.asyncio


def _template(nodes: int, checklist: int) -> dict:
    return {
        "nodes": [
            {
                "stage": "瓦工",
                "name": f"节点 {i}",
                "status": "todo",
                "tips": "",
                "notes": "",
                "checklist": [{"text": f"chk-{i}-{j}", "done": False} for j in range(checklist)],
            }
            for i in range(nodes)
        ]
    }


async def test_snapshot_returns_nodes_with_inline_checklist(client: AsyncClient) -> None:
    info = await register_user(client, username="snap-user")
    h = auth_headers(info["token"])
    r = await client.post("/api/projects", headers=h, json={"name": "P"})
    pid = r.json()["id"]

    # Seed via the bulk init endpoint: 5 nodes × 3 checklist items.
    r = await client.post(
        f"/api/projects/{pid}/init-from-template",
        headers=h,
        json=_template(nodes=5, checklist=3),
    )
    assert r.status_code == 201

    # Add one purchase + one reminder so we cover every list.
    nid = (await client.get(f"/api/projects/{pid}/nodes", headers=h)).json()[0]["id"]
    await client.post(
        f"/api/projects/{pid}/purchases",
        headers=h,
        json={
            "node_id": nid,
            "name": "瓷砖",
            "category": "瓷砖",
            "unit_price": 80,
            "quantity": 50,
            "total_price": 4000,
        },
    )
    await client.post(
        f"/api/projects/{pid}/reminders",
        headers=h,
        json={"title": "复尺", "trigger_at": "2027-06-01T09:00:00Z"},
    )

    r = await client.get(f"/api/projects/{pid}/snapshot", headers=h)
    assert r.status_code == 200, r.text
    body = r.json()

    # Project payload matches the canonical /projects/{id} shape.
    assert body["project"]["id"] == pid
    assert body["project"]["name"] == "P"

    # Nodes carry their inline checklist; no extra calls needed.
    assert len(body["nodes"]) == 5
    for n in body["nodes"]:
        assert "checklist" in n
        assert len(n["checklist"]) == 3
        assert [c["order"] for c in n["checklist"]] == [0, 1, 2]

    # Order preserved.
    assert [n["order"] for n in body["nodes"]] == [0, 1, 2, 3, 4]

    # Purchases + reminders included.
    assert len(body["purchases"]) == 1
    assert body["purchases"][0]["name"] == "瓷砖"
    assert len(body["reminders"]) == 1
    assert body["reminders"][0]["title"] == "复尺"


async def test_snapshot_empty_project(client: AsyncClient) -> None:
    """A bare project (no init, no purchases, no reminders) still returns
    a valid envelope rather than 404 or a broken shape."""
    info = await register_user(client, username="snap-empty")
    h = auth_headers(info["token"])
    r = await client.post("/api/projects", headers=h, json={"name": "Empty"})
    pid = r.json()["id"]

    r = await client.get(f"/api/projects/{pid}/snapshot", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["project"]["id"] == pid
    assert body["nodes"] == []
    assert body["purchases"] == []
    assert body["reminders"] == []


async def test_snapshot_other_user_404(client: AsyncClient) -> None:
    alice = await register_user(client, username="snap-alice")
    bob = await register_user(client, username="snap-bob")
    r = await client.post("/api/projects", headers=auth_headers(alice["token"]), json={"name": "A"})
    pid = r.json()["id"]
    r = await client.get(f"/api/projects/{pid}/snapshot", headers=auth_headers(bob["token"]))
    assert r.status_code == 404
