"""Application configuration (pydantic-settings)."""

from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database — must be an async URL (postgresql+asyncpg://... or sqlite+aiosqlite://...)
    database_url: str = "postgresql+asyncpg://zhuji:devpassword@localhost:5432/zhuji"

    # JWT
    jwt_secret: str = "dev-jwt-secret-change-in-production"
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

    # Database pool
    db_pool_size: int = 5
    db_max_overflow: int = 10

    log_level: str = "INFO"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
