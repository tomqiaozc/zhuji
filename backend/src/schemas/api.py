"""Pydantic request/response schemas."""

from __future__ import annotations

from datetime import date, datetime
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
    address: str | None = None
    area: float | None = None
    type: str | None = None
    start_date: date | None = None
    expected_end_date: date | None = None


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    address: str | None = None
    area: float | None = None
    type: str | None = None
    start_date: date | None = None
    expected_end_date: date | None = None


class ProjectOut(_ORM):
    id: UUID
    user_id: UUID
    name: str
    address: str | None = None
    area: float | None = None
    type: str | None = None
    start_date: date | None = None
    expected_end_date: date | None = None
    created_at: datetime


# ── Node ──────────────────────────────────────────────────────────


class NodeIn(BaseModel):
    stage: str
    name: str
    order: int = 0
    status: str = "todo"
    planned_start: date | None = None
    planned_end: date | None = None
    actual_start: date | None = None
    actual_end: date | None = None
    tips: str = ""
    tips_modified: bool = False
    notes: str = ""


class NodeUpdate(BaseModel):
    stage: str | None = None
    name: str | None = None
    order: int | None = None
    status: str | None = None
    planned_start: date | None = None
    planned_end: date | None = None
    actual_start: date | None = None
    actual_end: date | None = None
    tips: str | None = None
    tips_modified: bool | None = None
    notes: str | None = None


class NodeOut(_ORM):
    id: UUID
    project_id: UUID
    stage: str
    name: str
    order: int
    status: str
    planned_start: date | None = None
    planned_end: date | None = None
    actual_start: date | None = None
    actual_end: date | None = None
    tips: str
    tips_modified: bool
    notes: str


# ── Checklist ─────────────────────────────────────────────────────


class ChecklistItemIn(BaseModel):
    text: str
    done: bool = False
    note: str | None = None
    order: int = 0


class ChecklistItemUpdate(BaseModel):
    text: str | None = None
    done: bool | None = None
    note: str | None = None
    order: int | None = None


class ChecklistItemOut(_ORM):
    id: UUID
    node_id: UUID
    text: str
    done: bool
    note: str | None = None
    order: int


# ── Purchase ──────────────────────────────────────────────────────


class PurchaseIn(BaseModel):
    node_id: UUID | None = None
    name: str
    spec: str | None = None
    brand: str | None = None
    channel: str | None = None
    category: str = ""
    unit_price: float = 0
    quantity: float = 1
    total_price: float = 0
    purchase_date: date | None = None
    purchase_url: str | None = None
    remark: str | None = None


class PurchaseUpdate(BaseModel):
    node_id: UUID | None = None
    name: str | None = None
    spec: str | None = None
    brand: str | None = None
    channel: str | None = None
    category: str | None = None
    unit_price: float | None = None
    quantity: float | None = None
    total_price: float | None = None
    purchase_date: date | None = None
    purchase_url: str | None = None
    remark: str | None = None


class PurchaseOut(_ORM):
    id: UUID
    project_id: UUID
    node_id: UUID | None = None
    name: str
    spec: str | None = None
    brand: str | None = None
    channel: str | None = None
    category: str
    unit_price: float
    quantity: float
    total_price: float
    purchase_date: date | None = None
    purchase_url: str | None = None
    remark: str | None = None
    created_at: datetime


# ── Reminder ──────────────────────────────────────────────────────


class ReminderIn(BaseModel):
    node_id: UUID | None = None
    title: str
    trigger_at: datetime
    repeated: str | None = None
    done: bool = False


class ReminderUpdate(BaseModel):
    node_id: UUID | None = None
    title: str | None = None
    trigger_at: datetime | None = None
    repeated: str | None = None
    done: bool | None = None


class ReminderOut(_ORM):
    id: UUID
    project_id: UUID
    node_id: UUID | None = None
    title: str
    trigger_at: datetime
    repeated: str | None = None
    done: bool


# ── Load-demo ─────────────────────────────────────────────────────


class LoadDemoResponse(BaseModel):
    project: ProjectOut
    stats: dict


# ── Asset ─────────────────────────────────────────────────────────


class AssetOut(_ORM):
    """Asset summary returned to the client.

    `blob_url` is deliberately omitted — the container is private and the
    raw Azure URL must never leave the backend. Clients fetch bytes via
    `/api/assets/{id}/content` instead.
    """

    id: UUID
    project_id: UUID
    ref_type: str
    ref_id: UUID
    file_name: str
    mime_type: str
    size: int
    created_at: datetime


# ── Project bulk init from template ──────────────────────────────


class TemplateChecklistItemIn(BaseModel):
    text: str
    done: bool = False
    note: str | None = None


class TemplateNodeIn(BaseModel):
    """One node in the project-creation template.

    `order` is server-assigned (sequential across stages in the order the
    client sends), so the client doesn't have to compute it. Everything
    else mirrors NodeIn.
    """

    stage: str
    name: str
    status: str = "todo"
    tips: str = ""
    tips_modified: bool = False
    notes: str = ""
    checklist: list[TemplateChecklistItemIn] = []


class ProjectInitFromTemplateIn(BaseModel):
    nodes: list[TemplateNodeIn]


class ProjectInitFromTemplateOut(BaseModel):
    project_id: UUID
    node_count: int
    checklist_count: int


TokenResponse.model_rebuild()
