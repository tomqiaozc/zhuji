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


async def test_content_endpoint_accepts_viewer_token_in_query(client: AsyncClient) -> None:
    """`<img src>` can't carry an Authorization header, so the proxy
    accepts a short-TTL asset-viewer token via ``?token=...``. The main
    API JWT is NOT accepted in URLs — that would leak it into browser
    history / server logs / Referer. Bogus asset id keeps the test
    storage-free: auth check runs first, then the row lookup 404s."""
    info = await register_user(client)

    bogus_asset = "00000000-0000-0000-0000-000000000000"

    # No token at all → 401
    r = await client.get(f"/api/assets/{bogus_asset}/content")
    assert r.status_code == 401

    # Main API JWT in the query string is rejected — must be in the
    # Authorization header instead.
    r = await client.get(f"/api/assets/{bogus_asset}/content?token={info['token']}")
    assert r.status_code == 401, r.text

    # Mint a viewer token via the dedicated endpoint and use that in the URL.
    r = await client.post("/api/auth/asset-viewer-token", headers=auth_headers(info["token"]))
    assert r.status_code == 200, r.text
    viewer = r.json()
    assert viewer["expires_in"] <= 15 * 60
    viewer_token = viewer["token"]

    # Viewer token via query string → auth passes, then 404 because the
    # asset doesn't exist for this user.
    r = await client.get(f"/api/assets/{bogus_asset}/content?token={viewer_token}")
    assert r.status_code == 404, r.text

    # Main JWT still works via the Authorization header.
    r = await client.get(
        f"/api/assets/{bogus_asset}/content",
        headers=auth_headers(info["token"]),
    )
    assert r.status_code == 404, r.text


async def test_viewer_token_cannot_unlock_other_endpoints(client: AsyncClient) -> None:
    """A leaked asset-viewer URL must NOT also unlock the rest of the API.

    Scope is enforced by the JWT ``typ`` claim — the viewer token only
    passes the asset-content dependency."""
    info = await register_user(client, username="viewer-scope")
    r = await client.post("/api/auth/asset-viewer-token", headers=auth_headers(info["token"]))
    assert r.status_code == 200
    viewer_token = r.json()["token"]

    # Trying to use the viewer token as a Bearer for a regular endpoint
    # must be rejected.
    r = await client.get("/api/projects", headers=auth_headers(viewer_token))
    assert r.status_code == 401


async def test_asset_responses_never_leak_blob_url(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Regression for CR1+: the API surface must NOT expose the raw Azure
    blob URL — the container is private and the URL is bearer-token-free.
    Both list and upload responses are scrubbed of blob_url + the blob
    storage host."""
    info = await register_user(client, username="leak-check")
    pid, nid = await _make_project_with_node(client, info["token"])

    # Stub out the blob layer so the upload actually persists a row
    # without needing a real storage account.
    from src.services import storage as blob_storage

    fake_url = "https://stqefxzrxiqz4kw.blob.core.windows.net/zhuji-assets/secret/file.png"
    monkeypatch.setattr(blob_storage, "is_configured", lambda: True)
    monkeypatch.setattr(blob_storage, "upload_blob", lambda *_a, **_k: fake_url)
    # Predictable blob name so the fake URL above stays deterministic.
    monkeypatch.setattr(blob_storage, "make_blob_name", lambda _pid, _name: "secret/file.png")

    files = {"file": ("a.png", b"\x89PNG\r\n\x1a\nfake", "image/png")}
    data = {"ref_type": "node", "ref_id": nid}
    r = await client.post(
        f"/api/projects/{pid}/assets",
        headers=auth_headers(info["token"]),
        files=files,
        data=data,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert "blob_url" not in body, body
    assert "blob.core.windows.net" not in r.text, r.text
    # Sanity: the response still has everything the client needs.
    asset_id = body["id"]
    for required in ("id", "project_id", "ref_type", "ref_id", "file_name", "mime_type", "size"):
        assert required in body, body

    # List response must be just as clean.
    r = await client.get(f"/api/projects/{pid}/assets", headers=auth_headers(info["token"]))
    assert r.status_code == 200
    items = r.json()
    assert any(a["id"] == asset_id for a in items)
    for a in items:
        assert "blob_url" not in a, a
    assert "blob.core.windows.net" not in r.text, r.text
