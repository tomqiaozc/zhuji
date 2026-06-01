"""POST /api/projects/load-demo — load the bundled demo project for the current user."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends

from src.auth.dependencies import get_current_user
from src.db.session import get_db
from src.models.base import User
from src.schemas.api import LoadDemoResponse, ProjectOut
from src.services.demo import load_demo_project

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/projects", tags=["demo"])


@router.post("/load-demo", response_model=LoadDemoResponse)
async def load_demo(
    user: User = Depends(get_current_user),
    db: "AsyncSession" = Depends(get_db),
) -> LoadDemoResponse:
    result = await load_demo_project(db, user)
    return LoadDemoResponse(
        project=ProjectOut.model_validate(result["project"]),
        stats=result["stats"],
    )
