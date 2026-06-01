"""Application configuration (pydantic-settings).

``JWT_SECRET`` is **required** — there is no fallback. The process refuses
to start without one, so a leaked default value can never make it to
production.
"""

from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database — must be an async URL (postgresql+asyncpg://... or sqlite+aiosqlite://...)
    database_url: str = "postgresql+asyncpg://zhuji:devpassword@localhost:5432/zhuji"

    # JWT — REQUIRED. No default; provision via env var (.env in dev,
    # Key Vault in prod). Min length 32 to keep dev placeholders from
    # sneaking through.
    jwt_secret: str = Field(min_length=32)
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days

    # Password policy
    min_password_length: int = 8

    # CORS
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:4173",
    ]

    # Asset storage (Azure Blob). Optional in dev — when unset the
    # /api/.../assets routes return 503 instead of crashing.
    azure_storage_connection_string: str = ""
    azure_storage_container_name: str = "zhuji-assets"
    max_upload_bytes: int = 10 * 1024 * 1024  # 10 MB per file

    # Database pool
    db_pool_size: int = 5
    db_max_overflow: int = 10

    log_level: str = "INFO"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
