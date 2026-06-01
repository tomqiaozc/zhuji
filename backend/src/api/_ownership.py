"""Shared helpers for ownership-scoped lookups.

Every CRUD route must go through one of these getters so resources from
other users can never be reached, even by guessing UUIDs.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select

from src.models.base import Asset, ChecklistItem, Node, Project, Purchase, Reminder, User

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


async def get_user_project(db: "AsyncSession", user: User, project_id: UUID) -> Project:
    result = await db.execute(select(Project).where(Project.id == project_id, Project.user_id == user.id))
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="项目不存在")
    return project


async def get_user_node(db: "AsyncSession", user: User, node_id: UUID) -> Node:
    result = await db.execute(
        select(Node)
        .join(Project, Project.id == Node.project_id)
        .where(Node.id == node_id, Project.user_id == user.id)
    )
    node = result.scalar_one_or_none()
    if node is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="节点不存在")
    return node


async def get_user_checklist_item(db: "AsyncSession", user: User, item_id: UUID) -> ChecklistItem:
    result = await db.execute(
        select(ChecklistItem)
        .join(Node, Node.id == ChecklistItem.node_id)
        .join(Project, Project.id == Node.project_id)
        .where(ChecklistItem.id == item_id, Project.user_id == user.id)
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="清单项不存在")
    return item


async def get_user_purchase(db: "AsyncSession", user: User, purchase_id: UUID) -> Purchase:
    result = await db.execute(
        select(Purchase)
        .join(Project, Project.id == Purchase.project_id)
        .where(Purchase.id == purchase_id, Project.user_id == user.id)
    )
    p = result.scalar_one_or_none()
    if p is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="采购不存在")
    return p


async def get_user_reminder(db: "AsyncSession", user: User, reminder_id: UUID) -> Reminder:
    result = await db.execute(
        select(Reminder)
        .join(Project, Project.id == Reminder.project_id)
        .where(Reminder.id == reminder_id, Project.user_id == user.id)
    )
    r = result.scalar_one_or_none()
    if r is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="提醒不存在")
    return r


async def get_user_asset(db: "AsyncSession", user: User, asset_id: UUID) -> Asset:
    result = await db.execute(
        select(Asset)
        .join(Project, Project.id == Asset.project_id)
        .where(Asset.id == asset_id, Project.user_id == user.id)
    )
    a = result.scalar_one_or_none()
    if a is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资源不存在")
    return a
