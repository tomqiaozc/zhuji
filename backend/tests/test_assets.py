"""Asset endpoints — ownership scope + 503 when storage isn't configured."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers, register_user

pytestmark = pytest.mark.asyncio


async def _make_project_with_node(client: AsyncClient, token: str) -> tuple[str, str]:
    r = await client.post("/api/projects", headers=auth_headers(token), json={"name": "P"})
    pid = r.json()["id"]
    r = await client.post(
        f"/api/projects/{pid}/nodes",
        headers=auth_headers(token),
        json={"stage": "瓦工", "name": "贴砖"},
    )
    return pid, r.json()["id"]


async def test_list_assets_starts_empty(client: AsyncClient) -> None:
    info = await register_user(client)
    pid, _ = await _make_project_with_node(client, info["token"])
    r = await client.get(f"/api/projects/{pid}/assets", headers=auth_headers(info["token"]))
    assert r.status_code == 200
    assert r.json() == []


async def test_upload_503_when_storage_unconfigured(client: AsyncClient) -> None:
    """In tests AZURE_STORAGE_CONNECTION_STRING is empty, so upload must
    refuse cleanly (503) instead of throwing an opaque 500."""
    info = await register_user(client)
    pid, nid = await _make_project_with_node(client, info["token"])

    files = {"file": ("a.png", b"\x89PNG\r\n\x1a\n", "image/png")}
    data = {"ref_type": "node", "ref_id": nid}
    r = await client.post(
        f"/api/projects/{pid}/assets",
        headers=auth_headers(info["token"]),
        files=files,
        data=data,
    )
    assert r.status_code == 503, r.text
    assert "AZURE_STORAGE" in r.text


async def test_assets_isolated_across_users(client: AsyncClient) -> None:
    alice = await register_user(client, username="alice-asset")
    bob = await register_user(client, username="bob-asset")
    alice_pid, _ = await _make_project_with_node(client, alice["token"])

    # Bob cannot even list Alice's assets
    r = await client.get(f"/api/projects/{alice_pid}/assets", headers=auth_headers(bob["token"]))
    assert r.status_code == 404
