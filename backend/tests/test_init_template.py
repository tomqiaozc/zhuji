"""POST /api/projects/{id}/init-from-template — bulk insert nodes + checklist."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers, register_user

pytestmark = pytest.mark.asyncio


def _template_payload(num_nodes: int = 5, checklist_per_node: int = 4) -> dict:
    return {
        "nodes": [
            {
                "stage": "水电改造" if i % 2 == 0 else "瓦工",
                "name": f"节点 {i}",
                "status": "todo",
                "tips": f"- 注意点 {i}\n- 还有一条",
                "notes": "",
                "checklist": [{"text": f"勾选项 {i}-{j}", "done": False} for j in range(checklist_per_node)],
            }
            for i in range(num_nodes)
        ]
    }


async def test_init_from_template_bulk_inserts(client: AsyncClient) -> None:
    info = await register_user(client, username="init-bulk")
    h = auth_headers(info["token"])
    r = await client.post("/api/projects", headers=h, json={"name": "我的新家"})
    pid = r.json()["id"]

    payload = _template_payload(num_nodes=62, checklist_per_node=9)
    r = await client.post(f"/api/projects/{pid}/init-from-template", headers=h, json=payload)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["node_count"] == 62
    assert body["checklist_count"] == 62 * 9

    # Nodes show up via the regular list endpoint, ordered.
    r = await client.get(f"/api/projects/{pid}/nodes", headers=h)
    nodes = r.json()
    assert len(nodes) == 62
    assert [n["order"] for n in nodes] == list(range(62))

    # Checklist for the first node has the right count + order.
    nid = nodes[0]["id"]
    r = await client.get(f"/api/nodes/{nid}/checklist", headers=h)
    items = r.json()
    assert len(items) == 9
    assert [c["order"] for c in items] == list(range(9))


async def test_init_from_template_rejects_already_populated(client: AsyncClient) -> None:
    """Calling init twice on the same project must 409 instead of
    silently double-inserting (a retry should be safe)."""
    info = await register_user(client, username="init-twice")
    h = auth_headers(info["token"])
    r = await client.post("/api/projects", headers=h, json={"name": "P"})
    pid = r.json()["id"]

    payload = _template_payload(num_nodes=3, checklist_per_node=2)
    r = await client.post(f"/api/projects/{pid}/init-from-template", headers=h, json=payload)
    assert r.status_code == 201

    # Second call → 409, AND the node count stayed at 3.
    r = await client.post(f"/api/projects/{pid}/init-from-template", headers=h, json=payload)
    assert r.status_code == 409, r.text

    r = await client.get(f"/api/projects/{pid}/nodes", headers=h)
    assert len(r.json()) == 3


async def test_init_from_template_other_user_404(client: AsyncClient) -> None:
    """Init belongs to whoever owns the project — anyone else gets 404
    (the same shape used by all the other CRUD routes, never 403)."""
    alice = await register_user(client, username="init-alice")
    bob = await register_user(client, username="init-bob")
    r = await client.post("/api/projects", headers=auth_headers(alice["token"]), json={"name": "A"})
    alice_pid = r.json()["id"]

    r = await client.post(
        f"/api/projects/{alice_pid}/init-from-template",
        headers=auth_headers(bob["token"]),
        json=_template_payload(num_nodes=1, checklist_per_node=1),
    )
    assert r.status_code == 404
