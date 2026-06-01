"""Project CRUD."""

from __future__ import annotations

from typing import TYPE_CHECKING, List
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy import select

from src.api._ownership import get_user_project
from src.auth.dependencies import get_current_user
from src.db.session import get_db
from src.models.base import Project, User
from src.schemas.api import ProjectIn, ProjectOut, ProjectUpdate

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("", response_model=List[ProjectOut])
async def list_projects(
    user: User = Depends(get_current_user),
    db: "AsyncSession" = Depends(get_db),
) -> List[ProjectOut]:
    result = await db.execute(
        select(Project).where(Project.user_id == user.id).order_by(Project.created_at.desc())
    )
    return [ProjectOut.model_validate(p) for p in result.scalars().all()]


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectIn,
    user: User = Depends(get_current_user),
    db: "AsyncSession" = Depends(get_db),
) -> ProjectOut:
    project = Project(user_id=user.id, **payload.model_dump(exclude_unset=True))
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return ProjectOut.model_validate(project)


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(
    project_id: UUID,
    user: User = Depends(get_current_user),
    db: "AsyncSession" = Depends(get_db),
) -> ProjectOut:
    return ProjectOut.model_validate(await get_user_project(db, user, project_id))


@router.patch("/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: UUID,
    payload: ProjectUpdate,
    user: User = Depends(get_current_user),
    db: "AsyncSession" = Depends(get_db),
) -> ProjectOut:
    project = await get_user_project(db, user, project_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(project, k, v)
    await db.commit()
    await db.refresh(project)
    return ProjectOut.model_validate(project)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: UUID,
    user: User = Depends(get_current_user),
    db: "AsyncSession" = Depends(get_db),
) -> None:
    project = await get_user_project(db, user, project_id)
    await db.delete(project)
    await db.commit()
