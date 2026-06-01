"""Asset (project image) CRUD — stores blobs in Azure Blob Storage.

Body shape: multipart/form-data with fields `file` (the upload), `ref_type`
(``node`` or ``purchase``), and `ref_id` (the related UUID). The endpoint
validates ownership of the parent project + ref before issuing the upload.
"""

from __future__ import annotations

import contextlib
from typing import TYPE_CHECKING, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy import select

from src.api._ownership import (
    get_user_asset,
    get_user_node,
    get_user_project,
    get_user_purchase,
)
from src.auth.dependencies import get_asset_viewer_user, get_current_user
from src.config import settings
from src.db.session import get_db
from src.models.base import Asset, User
from src.schemas.api import AssetOut
from src.services import storage as blob_storage

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(tags=["assets"])

# Keep the upload set narrow — the frontend gallery is image-only.
_ALLOWED_MIME_PREFIXES = ("image/",)


def _ensure_storage() -> None:
    if not blob_storage.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="对象存储未配置（AZURE_STORAGE_CONNECTION_STRING 缺失）",
        )


@router.get("/api/projects/{project_id}/assets", response_model=list[AssetOut])
async def list_assets(
    project_id: UUID,
    user: User = Depends(get_current_user),
    db: "AsyncSession" = Depends(get_db),
) -> list[AssetOut]:
    await get_user_project(db, user, project_id)
    result = await db.execute(
        select(Asset).where(Asset.project_id == project_id).order_by(Asset.created_at.desc())
    )
    return [AssetOut.model_validate(a) for a in result.scalars().all()]


@router.post(
    "/api/projects/{project_id}/assets",
    response_model=AssetOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_asset(
    project_id: UUID,
    ref_type: Literal["node", "purchase"] = Form(...),
    ref_id: UUID = Form(...),
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: "AsyncSession" = Depends(get_db),
) -> AssetOut:
    _ensure_storage()
    project = await get_user_project(db, user, project_id)

    # Validate that the ref actually belongs to this user's project. This
    # is the only way to attach an asset to a node / purchase, so the
    # blob can never be linked to someone else's data.
    if ref_type == "node":
        node = await get_user_node(db, user, ref_id)
        if node.project_id != project.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="节点不属于该项目")
    else:
        purchase = await get_user_purchase(db, user, ref_id)
        if purchase.project_id != project.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="采购不属于该项目")

    if not file.content_type or not file.content_type.startswith(_ALLOWED_MIME_PREFIXES):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"仅支持图片上传 (got {file.content_type or 'unknown'})",
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="空文件")
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"文件超出 {settings.max_upload_bytes // (1024 * 1024)}MB 上限",
        )

    blob_name = blob_storage.make_blob_name(project.id, file.filename or "upload")
    blob_url = blob_storage.upload_blob(blob_name, data, content_type=file.content_type)

    asset = Asset(
        project_id=project.id,
        ref_type=ref_type,
        ref_id=ref_id,
        blob_url=blob_url,
        file_name=file.filename or "upload",
        mime_type=file.content_type,
        size=len(data),
    )
    db.add(asset)
    await db.commit()
    await db.refresh(asset)
    return AssetOut.model_validate(asset)


@router.delete("/api/assets/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_asset(
    asset_id: UUID,
    user: User = Depends(get_current_user),
    db: "AsyncSession" = Depends(get_db),
) -> None:
    asset = await get_user_asset(db, user, asset_id)
    # Best-effort delete from blob storage; ignore errors so the DB row
    # still clears even if the blob is already gone.
    if blob_storage.is_configured():
        with contextlib.suppress(Exception):
            blob_storage.delete_blob(asset.blob_url)
    await db.delete(asset)
    await db.commit()


@router.get("/api/assets/{asset_id}/content")
async def get_asset_content(
    asset_id: UUID,
    user: User = Depends(get_asset_viewer_user),
    db: "AsyncSession" = Depends(get_db),
) -> Response:
    """Auth-protected blob proxy.

    The blob container is private (装修照片属隐私), so the URL we
    persist isn't usable directly from the browser. This endpoint
    re-streams the bytes after re-checking ownership. Accepts the main
    API JWT via ``Authorization: Bearer ...`` OR a short-lived
    asset-viewer token via ``?token=...`` (so ``<img src>`` works
    without leaking the main JWT into URLs).
    """
    asset = await get_user_asset(db, user, asset_id)
    _ensure_storage()
    try:
        data = blob_storage.download_blob(asset.blob_url)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"读取对象存储失败：{exc}",
        ) from exc
    # 5-minute private cache — the same user's repeated views hit
    # nothing further, but the bytes never sit in a shared CDN cache.
    return Response(
        content=data,
        media_type=asset.mime_type or "application/octet-stream",
        headers={
            "Cache-Control": "private, max-age=300",
            "Content-Disposition": f'inline; filename="{asset.file_name}"',
        },
    )
