"""Zhuji backend — FastAPI entry point."""

from __future__ import annotations

from fastapi import Depends, FastAPI, Response
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
    """Lightweight liveness — proves the worker is up, no dependencies."""
    return {"status": "ok"}


@app.get("/api/health")
async def health_check(
    response: Response,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    """Readiness probe — returns 503 when the DB connection is broken.

    Use this as the smoke target post-deploy so a container that came up
    with broken migrations / a dead DB doesn't pretend to be healthy.
    """
    try:
        await db.execute(text("SELECT 1"))
        return {"status": "ok", "db": "ok", "version": "0.1.0"}
    except Exception as exc:
        response.status_code = 503
        return {
            "status": "degraded",
            "db": "error",
            "version": "0.1.0",
            "error": str(exc),
        }
