"""Reminder CRUD."""

from __future__ import annotations

from typing import TYPE_CHECKING, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from src.api._ownership import get_user_node, get_user_project, get_user_reminder
from src.auth.dependencies import get_current_user
from src.db.session import get_db
from src.models.base import Reminder, User
from src.schemas.api import ReminderIn, ReminderOut, ReminderUpdate

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(tags=["reminders"])


@router.get("/api/projects/{project_id}/reminders", response_model=List[ReminderOut])
async def list_reminders(
    project_id: UUID,
    user: User = Depends(get_current_user),
    db: "AsyncSession" = Depends(get_db),
) -> List[ReminderOut]:
    await get_user_project(db, user, project_id)
    result = await db.execute(
        select(Reminder).where(Reminder.project_id == project_id).order_by(Reminder.trigger_at)
    )
    return [ReminderOut.model_validate(r) for r in result.scalars().all()]


@router.post(
    "/api/projects/{project_id}/reminders",
    response_model=ReminderOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_reminder(
    project_id: UUID,
    payload: ReminderIn,
    user: User = Depends(get_current_user),
    db: "AsyncSession" = Depends(get_db),
) -> ReminderOut:
    await get_user_project(db, user, project_id)
    if payload.node_id is not None:
        node = await get_user_node(db, user, payload.node_id)
        if node.project_id != project_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="节点不属于该项目"
            )
    reminder = Reminder(project_id=project_id, **payload.model_dump(exclude_unset=True))
    db.add(reminder)
    await db.commit()
    await db.refresh(reminder)
    return ReminderOut.model_validate(reminder)


@router.patch("/api/reminders/{reminder_id}", response_model=ReminderOut)
async def update_reminder(
    reminder_id: UUID,
    payload: ReminderUpdate,
    user: User = Depends(get_current_user),
    db: "AsyncSession" = Depends(get_db),
) -> ReminderOut:
    reminder = await get_user_reminder(db, user, reminder_id)
    data = payload.model_dump(exclude_unset=True)
    if "node_id" in data and data["node_id"] is not None:
        node = await get_user_node(db, user, data["node_id"])
        if node.project_id != reminder.project_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="节点不属于该项目"
            )
    for k, v in data.items():
        setattr(reminder, k, v)
    await db.commit()
    await db.refresh(reminder)
    return ReminderOut.model_validate(reminder)


@router.delete("/api/reminders/{reminder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reminder(
    reminder_id: UUID,
    user: User = Depends(get_current_user),
    db: "AsyncSession" = Depends(get_db),
) -> None:
    reminder = await get_user_reminder(db, user, reminder_id)
    await db.delete(reminder)
    await db.commit()
