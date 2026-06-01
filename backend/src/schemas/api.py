"""Pydantic request/response schemas."""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from src.config import settings


class _ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ── Auth ──────────────────────────────────────────────────────────


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=1)  # length checked below for a custom message

    @field_validator("username")
    @classmethod
    def _username_charset(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("用户名不能为空")
        if any(c.isspace() for c in v):
            raise ValueError("用户名不能包含空白字符")
        return v

    @field_validator("password")
    @classmethod
    def _password_length(cls, v: str) -> str:
        if len(v) < settings.min_password_length:
            raise ValueError(f"密码长度至少 {settings.min_password_length} 位")
        return v


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class UserOut(_ORM):
    id: UUID
    username: str
    created_at: datetime


# ── Project ───────────────────────────────────────────────────────


class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    address: Optional[str] = None
    area: Optional[float] = None
    type: Optional[str] = None
    start_date: Optional[date] = None
    expected_end_date: Optional[date] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    address: Optional[str] = None
    area: Optional[float] = None
    type: Optional[str] = None
    start_date: Optional[date] = None
    expected_end_date: Optional[date] = None


class ProjectOut(_ORM):
    id: UUID
    user_id: UUID
    name: str
    address: Optional[str] = None
    area: Optional[float] = None
    type: Optional[str] = None
    start_date: Optional[date] = None
    expected_end_date: Optional[date] = None
    created_at: datetime


# ── Node ──────────────────────────────────────────────────────────


class NodeIn(BaseModel):
    stage: str
    name: str
    order: int = 0
    status: str = "todo"
    planned_start: Optional[date] = None
    planned_end: Optional[date] = None
    actual_start: Optional[date] = None
    actual_end: Optional[date] = None
    tips: str = ""
    tips_modified: bool = False
    notes: str = ""


class NodeUpdate(BaseModel):
    stage: Optional[str] = None
    name: Optional[str] = None
    order: Optional[int] = None
    status: Optional[str] = None
    planned_start: Optional[date] = None
    planned_end: Optional[date] = None
    actual_start: Optional[date] = None
    actual_end: Optional[date] = None
    tips: Optional[str] = None
    tips_modified: Optional[bool] = None
    notes: Optional[str] = None


class NodeOut(_ORM):
    id: UUID
    project_id: UUID
    stage: str
    name: str
    order: int
    status: str
    planned_start: Optional[date] = None
    planned_end: Optional[date] = None
    actual_start: Optional[date] = None
    actual_end: Optional[date] = None
    tips: str
    tips_modified: bool
    notes: str


# ── Checklist ─────────────────────────────────────────────────────


class ChecklistItemIn(BaseModel):
    text: str
    done: bool = False
    note: Optional[str] = None
    order: int = 0


class ChecklistItemUpdate(BaseModel):
    text: Optional[str] = None
    done: Optional[bool] = None
    note: Optional[str] = None
    order: Optional[int] = None


class ChecklistItemOut(_ORM):
    id: UUID
    node_id: UUID
    text: str
    done: bool
    note: Optional[str] = None
    order: int


# ── Purchase ──────────────────────────────────────────────────────


class PurchaseIn(BaseModel):
    node_id: Optional[UUID] = None
    name: str
    spec: Optional[str] = None
    brand: Optional[str] = None
    channel: Optional[str] = None
    category: str = ""
    unit_price: float = 0
    quantity: float = 1
    total_price: float = 0
    purchase_date: Optional[date] = None
    purchase_url: Optional[str] = None
    remark: Optional[str] = None


class PurchaseUpdate(BaseModel):
    node_id: Optional[UUID] = None
    name: Optional[str] = None
    spec: Optional[str] = None
    brand: Optional[str] = None
    channel: Optional[str] = None
    category: Optional[str] = None
    unit_price: Optional[float] = None
    quantity: Optional[float] = None
    total_price: Optional[float] = None
    purchase_date: Optional[date] = None
    purchase_url: Optional[str] = None
    remark: Optional[str] = None


class PurchaseOut(_ORM):
    id: UUID
    project_id: UUID
    node_id: Optional[UUID] = None
    name: str
    spec: Optional[str] = None
    brand: Optional[str] = None
    channel: Optional[str] = None
    category: str
    unit_price: float
    quantity: float
    total_price: float
    purchase_date: Optional[date] = None
    purchase_url: Optional[str] = None
    remark: Optional[str] = None
    created_at: datetime


# ── Reminder ──────────────────────────────────────────────────────


class ReminderIn(BaseModel):
    node_id: Optional[UUID] = None
    title: str
    trigger_at: datetime
    repeated: Optional[str] = None
    done: bool = False


class ReminderUpdate(BaseModel):
    node_id: Optional[UUID] = None
    title: Optional[str] = None
    trigger_at: Optional[datetime] = None
    repeated: Optional[str] = None
    done: Optional[bool] = None


class ReminderOut(_ORM):
    id: UUID
    project_id: UUID
    node_id: Optional[UUID] = None
    title: str
    trigger_at: datetime
    repeated: Optional[str] = None
    done: bool


# ── Load-demo ─────────────────────────────────────────────────────


class LoadDemoResponse(BaseModel):
    project: ProjectOut
    stats: dict


TokenResponse.model_rebuild()
