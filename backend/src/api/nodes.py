"""Node + ChecklistItem CRUD."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy import select

from src.api._ownership import (
    get_user_checklist_item,
    get_user_node,
    get_user_project,
)
from src.auth.dependencies import get_current_user
from src.db.session import get_db
from src.models.base import ChecklistItem, Node, User
from src.schemas.api import (
    ChecklistItemIn,
    ChecklistItemOut,
    ChecklistItemUpdate,
    NodeIn,
    NodeOut,
    NodeUpdate,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(tags=["nodes"])


@router.get("/api/projects/{project_id}/nodes", response_model=list[NodeOut])
async def list_nodes(
    project_id: UUID,
    user: User = Depends(get_current_user),
    db: "AsyncSession" = Depends(get_db),
) -> list[NodeOut]:
    await get_user_project(db, user, project_id)
    result = await db.execute(select(Node).where(Node.project_id == project_id).order_by(Node.order))
    return [NodeOut.model_validate(n) for n in result.scalars().all()]


@router.post(
    "/api/projects/{project_id}/nodes",
    response_model=NodeOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_node(
    project_id: UUID,
    payload: NodeIn,
    user: User = Depends(get_current_user),
    db: "AsyncSession" = Depends(get_db),
) -> NodeOut:
    await get_user_project(db, user, project_id)
    node = Node(project_id=project_id, **payload.model_dump(exclude_unset=True))
    db.add(node)
    await db.commit()
    await db.refresh(node)
    return NodeOut.model_validate(node)


@router.get("/api/nodes/{node_id}", response_model=NodeOut)
async def get_node(
    node_id: UUID,
    user: User = Depends(get_current_user),
    db: "AsyncSession" = Depends(get_db),
) -> NodeOut:
    return NodeOut.model_validate(await get_user_node(db, user, node_id))


@router.patch("/api/nodes/{node_id}", response_model=NodeOut)
async def update_node(
    node_id: UUID,
    payload: NodeUpdate,
    user: User = Depends(get_current_user),
    db: "AsyncSession" = Depends(get_db),
) -> NodeOut:
    node = await get_user_node(db, user, node_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(node, k, v)
    await db.commit()
    await db.refresh(node)
    return NodeOut.model_validate(node)


@router.delete("/api/nodes/{node_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_node(
    node_id: UUID,
    user: User = Depends(get_current_user),
    db: "AsyncSession" = Depends(get_db),
) -> None:
    node = await get_user_node(db, user, node_id)
    await db.delete(node)
    await db.commit()


# ── Checklist ────────────────────────────────────────────────────


@router.get("/api/nodes/{node_id}/checklist", response_model=list[ChecklistItemOut])
async def list_checklist(
    node_id: UUID,
    user: User = Depends(get_current_user),
    db: "AsyncSession" = Depends(get_db),
) -> list[ChecklistItemOut]:
    await get_user_node(db, user, node_id)
    result = await db.execute(
        select(ChecklistItem).where(ChecklistItem.node_id == node_id).order_by(ChecklistItem.order)
    )
    return [ChecklistItemOut.model_validate(c) for c in result.scalars().all()]


@router.post(
    "/api/nodes/{node_id}/checklist",
    response_model=ChecklistItemOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_checklist_item(
    node_id: UUID,
    payload: ChecklistItemIn,
    user: User = Depends(get_current_user),
    db: "AsyncSession" = Depends(get_db),
) -> ChecklistItemOut:
    await get_user_node(db, user, node_id)
    item = ChecklistItem(node_id=node_id, **payload.model_dump(exclude_unset=True))
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return ChecklistItemOut.model_validate(item)


@router.patch("/api/checklist/{item_id}", response_model=ChecklistItemOut)
async def update_checklist_item(
    item_id: UUID,
    payload: ChecklistItemUpdate,
    user: User = Depends(get_current_user),
    db: "AsyncSession" = Depends(get_db),
) -> ChecklistItemOut:
    item = await get_user_checklist_item(db, user, item_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(item, k, v)
    await db.commit()
    await db.refresh(item)
    return ChecklistItemOut.model_validate(item)


@router.delete("/api/checklist/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_checklist_item(
    item_id: UUID,
    user: User = Depends(get_current_user),
    db: "AsyncSession" = Depends(get_db),
) -> None:
    item = await get_user_checklist_item(db, user, item_id)
    await db.delete(item)
    await db.commit()
