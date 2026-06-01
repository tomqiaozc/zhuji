"""Zhuji backend — FastAPI entry point."""

from __future__ import annotations

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.assets import router as assets_router
from src.api.auth import router as auth_router
from src.api.demo import router as demo_router
from src.api.nodes import router as nodes_router
from src.api.projects import router as projects_router
from src.api.purchases import router as purchases_router
from src.api.reminders import router as reminders_router
from src.config import settings
from src.db.session import get_db

app = FastAPI(
    title="Zhuji API",
    version="0.1.0",
    description="筑迹 — 装修管家 backend",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Demo router includes the more-specific /load-demo path and must be
# registered before the generic projects router (otherwise FastAPI would
# match "load-demo" against the `{project_id}` UUID converter and 422).
app.include_router(demo_router)
app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(nodes_router)
app.include_router(purchases_router)
app.include_router(reminders_router)
app.include_router(assets_router)


@app.get("/api/health/liveness")
async def liveness() -> dict:
    return {"status": "ok"}


@app.get("/api/health")
async def health_check(db: AsyncSession = Depends(get_db)) -> dict:  # noqa: B008
    try:
        await db.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception:
        db_status = "error"
    return {
        "status": "ok" if db_status == "ok" else "degraded",
        "db": db_status,
        "version": "0.1.0",
    }
