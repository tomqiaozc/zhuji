"""Purchase CRUD."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from src.api._ownership import get_user_node, get_user_project, get_user_purchase
from src.auth.dependencies import get_current_user
from src.db.session import get_db
from src.models.base import Purchase, User
from src.schemas.api import PurchaseIn, PurchaseOut, PurchaseUpdate

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(tags=["purchases"])


@router.get("/api/projects/{project_id}/purchases", response_model=list[PurchaseOut])
async def list_purchases(
    project_id: UUID,
    user: User = Depends(get_current_user),
    db: "AsyncSession" = Depends(get_db),
) -> list[PurchaseOut]:
    await get_user_project(db, user, project_id)
    result = await db.execute(
        select(Purchase)
        .where(Purchase.project_id == project_id)
        .order_by(Purchase.purchase_date.desc().nullslast(), Purchase.created_at.desc())
    )
    return [PurchaseOut.model_validate(p) for p in result.scalars().all()]


@router.post(
    "/api/projects/{project_id}/purchases",
    response_model=PurchaseOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_purchase(
    project_id: UUID,
    payload: PurchaseIn,
    user: User = Depends(get_current_user),
    db: "AsyncSession" = Depends(get_db),
) -> PurchaseOut:
    await get_user_project(db, user, project_id)
    if payload.node_id is not None:
        node = await get_user_node(db, user, payload.node_id)
        if node.project_id != project_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="节点不属于该项目",
            )
    purchase = Purchase(project_id=project_id, **payload.model_dump(exclude_unset=True))
    db.add(purchase)
    await db.commit()
    await db.refresh(purchase)
    return PurchaseOut.model_validate(purchase)


@router.get("/api/purchases/{purchase_id}", response_model=PurchaseOut)
async def get_purchase(
    purchase_id: UUID,
    user: User = Depends(get_current_user),
    db: "AsyncSession" = Depends(get_db),
) -> PurchaseOut:
    return PurchaseOut.model_validate(await get_user_purchase(db, user, purchase_id))


@router.patch("/api/purchases/{purchase_id}", response_model=PurchaseOut)
async def update_purchase(
    purchase_id: UUID,
    payload: PurchaseUpdate,
    user: User = Depends(get_current_user),
    db: "AsyncSession" = Depends(get_db),
) -> PurchaseOut:
    purchase = await get_user_purchase(db, user, purchase_id)
    data = payload.model_dump(exclude_unset=True)
    if "node_id" in data and data["node_id"] is not None:
        node = await get_user_node(db, user, data["node_id"])
        if node.project_id != purchase.project_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="节点不属于该项目")
    for k, v in data.items():
        setattr(purchase, k, v)
    await db.commit()
    await db.refresh(purchase)
    return PurchaseOut.model_validate(purchase)


@router.delete("/api/purchases/{purchase_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_purchase(
    purchase_id: UUID,
    user: User = Depends(get_current_user),
    db: "AsyncSession" = Depends(get_db),
) -> None:
    purchase = await get_user_purchase(db, user, purchase_id)
    await db.delete(purchase)
    await db.commit()
