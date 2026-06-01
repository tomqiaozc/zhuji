"""Azure Blob Storage adapter.

Reused across the asset upload endpoint and (eventually) any background
cleanup jobs. Lazy-builds a single ``BlobServiceClient`` so importing
this module without storage configured doesn't crash the app.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from src.config import settings

if TYPE_CHECKING:
    from azure.storage.blob import BlobServiceClient


_client: "BlobServiceClient | None" = None


def is_configured() -> bool:
    return bool(settings.azure_storage_connection_string)


def _get_client() -> "BlobServiceClient":
    global _client
    if _client is None:
        from azure.storage.blob import BlobServiceClient

        if not settings.azure_storage_connection_string:
            raise RuntimeError("AZURE_STORAGE_CONNECTION_STRING is not configured")
        _client = BlobServiceClient.from_connection_string(settings.azure_storage_connection_string)
    return _client


def make_blob_name(project_id: uuid.UUID, file_name: str) -> str:
    """Project-scoped, collision-free blob path."""
    safe = file_name.replace("/", "_").replace("\\", "_")
    return f"{project_id}/{uuid.uuid4().hex}_{safe}"


def upload_blob(blob_name: str, data: bytes, content_type: str | None = None) -> str:
    """Upload ``data`` and return the canonical blob URL.

    The container is private (Bicep sets ``publicAccess: 'None'``), so the
    URL is meant to be consumed by the backend or by clients holding a
    short-lived SAS — direct anonymous access will 404. M6 keeps the
    surface minimal: store the URL, frontend re-fetches through the API.
    """
    from azure.storage.blob import ContentSettings

    client = _get_client()
    container = client.get_container_client(settings.azure_storage_container_name)
    blob = container.get_blob_client(blob_name)
    blob.upload_blob(
        data,
        overwrite=True,
        content_settings=ContentSettings(content_type=content_type) if content_type else None,
    )
    return blob.url


def delete_blob(blob_url: str) -> None:
    """Best-effort delete by URL. Swallows 404s so cleanup is idempotent."""
    from urllib.parse import urlparse

    from azure.core.exceptions import ResourceNotFoundError

    parsed = urlparse(blob_url)
    # URL shape: https://<account>.blob.core.windows.net/<container>/<blob_name>
    parts = parsed.path.lstrip("/").split("/", 1)
    if len(parts) != 2:
        return
    container_name, blob_name = parts
    client = _get_client()
    blob = client.get_container_client(container_name).get_blob_client(blob_name)
    try:
        blob.delete_blob()
    except ResourceNotFoundError:
        return
