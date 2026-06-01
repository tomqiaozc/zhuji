"""CRUD on projects + nodes + checklist + purchases + reminders."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import auth_headers, register_user

pytestmark = pytest.mark.asyncio


async def _make_project(client: AsyncClient, token: str, name: str = "我的家") -> str:
    r = await client.post(
        "/api/projects",
        headers=auth_headers(token),
        json={"name": name, "address": "上海", "area": 89, "type": "毛坯"},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def test_project_crud(client: AsyncClient) -> None:
    info = await register_user(client)
    pid = await _make_project(client, info["token"])

    r = await client.get("/api/projects", headers=auth_headers(info["token"]))
    assert r.status_code == 200
    assert len(r.json()) == 1

    r = await client.patch(
        f"/api/projects/{pid}",
        headers=auth_headers(info["token"]),
        json={"name": "改名后的家"},
    )
    assert r.status_code == 200
    assert r.json()["name"] == "改名后的家"

    r = await client.delete(f"/api/projects/{pid}", headers=auth_headers(info["token"]))
    assert r.status_code == 204

    r = await client.get("/api/projects", headers=auth_headers(info["token"]))
    assert r.json() == []


async def test_node_and_checklist_crud(client: AsyncClient) -> None:
    info = await register_user(client)
    pid = await _make_project(client, info["token"])

    r = await client.post(
        f"/api/projects/{pid}/nodes",
        headers=auth_headers(info["token"]),
        json={"stage": "水电改造", "name": "水路改造", "order": 0, "tips": "走顶不走地"},
    )
    assert r.status_code == 201
    nid = r.json()["id"]

    r = await client.post(
        f"/api/nodes/{nid}/checklist",
        headers=auth_headers(info["token"]),
        json={"text": "打压测试", "order": 0},
    )
    assert r.status_code == 201
    cid = r.json()["id"]

    r = await client.patch(
        f"/api/checklist/{cid}",
        headers=auth_headers(info["token"]),
        json={"done": True},
    )
    assert r.status_code == 200
    assert r.json()["done"] is True

    r = await client.get(f"/api/nodes/{nid}/checklist", headers=auth_headers(info["token"]))
    assert len(r.json()) == 1


async def test_purchase_crud(client: AsyncClient) -> None:
    info = await register_user(client)
    pid = await _make_project(client, info["token"])

    r = await client.post(
        f"/api/projects/{pid}/purchases",
        headers=auth_headers(info["token"]),
        json={
            "name": "马桶",
            "brand": "TOTO",
            "category": "卫浴",
            "unit_price": 2000,
            "quantity": 1,
            "total_price": 2000,
        },
    )
    assert r.status_code == 201
    purchase_id = r.json()["id"]

    r = await client.get(
        f"/api/projects/{pid}/purchases", headers=auth_headers(info["token"])
    )
    assert len(r.json()) == 1

    r = await client.patch(
        f"/api/purchases/{purchase_id}",
        headers=auth_headers(info["token"]),
        json={"total_price": 1800},
    )
    assert r.status_code == 200
    assert r.json()["total_price"] == 1800


async def test_reminder_crud(client: AsyncClient) -> None:
    info = await register_user(client)
    pid = await _make_project(client, info["token"])
    r = await client.post(
        f"/api/projects/{pid}/reminders",
        headers=auth_headers(info["token"]),
        json={"title": "复尺", "trigger_at": "2027-06-01T09:00:00Z"},
    )
    assert r.status_code == 201
    rid = r.json()["id"]

    r = await client.get(
        f"/api/projects/{pid}/reminders", headers=auth_headers(info["token"])
    )
    assert len(r.json()) == 1

    r = await client.delete(f"/api/reminders/{rid}", headers=auth_headers(info["token"]))
    assert r.status_code == 204
