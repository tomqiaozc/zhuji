"""Project CRUD."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select

from src.api._ownership import get_user_project
from src.auth.dependencies import get_current_user
from src.db.session import get_db
from src.models.base import ChecklistItem, Node, Project, Purchase, Reminder, User
from src.schemas.api import (
    ChecklistItemOut,
    NodeOut,
    NodeWithChecklistOut,
    ProjectIn,
    ProjectInitFromTemplateIn,
    ProjectInitFromTemplateOut,
    ProjectOut,
    ProjectSnapshotOut,
    ProjectUpdate,
    PurchaseOut,
    ReminderOut,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("", response_model=list[ProjectOut])
async def list_projects(
    user: User = Depends(get_current_user),
    db: "AsyncSession" = Depends(get_db),
) -> list[ProjectOut]:
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


@router.post(
    "/{project_id}/init-from-template",
    response_model=ProjectInitFromTemplateOut,
    status_code=status.HTTP_201_CREATED,
)
async def init_from_template(
    project_id: UUID,
    payload: ProjectInitFromTemplateIn,
    user: User = Depends(get_current_user),
    db: "AsyncSession" = Depends(get_db),
) -> ProjectInitFromTemplateOut:
    """Bulk-insert every node + checklist item for a fresh project.

    Replaces the M5 frontend loop that fired ~600 sequential HTTP
    requests per new project. Runs in a single transaction; refuses
    (409) if the project already has nodes so a retry can't double the
    schema and so callers can't accidentally clobber a populated
    project (e.g. the demo).
    """
    project = await get_user_project(db, user, project_id)

    existing = await db.execute(select(func.count()).select_from(Node).where(Node.project_id == project.id))
    if (existing.scalar() or 0) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="项目已包含节点，请勿重复初始化",
        )

    node_count = 0
    checklist_count = 0
    # `order` is sequential across stages in the order the client sends
    # them, so the frontend doesn't need to compute it.
    for i, nt in enumerate(payload.nodes):
        node = Node(
            project_id=project.id,
            stage=nt.stage,
            name=nt.name,
            order=i,
            status=nt.status,
            tips=nt.tips,
            tips_modified=nt.tips_modified,
            notes=nt.notes,
        )
        db.add(node)
        await db.flush()  # need node.id for the checklist FKs
        for j, c in enumerate(nt.checklist):
            db.add(
                ChecklistItem(
                    node_id=node.id,
                    text=c.text,
                    done=c.done,
                    note=c.note,
                    order=j,
                )
            )
            checklist_count += 1
        node_count += 1

    await db.commit()
    return ProjectInitFromTemplateOut(
        project_id=project.id,
        node_count=node_count,
        checklist_count=checklist_count,
    )


@router.get("/{project_id}/snapshot", response_model=ProjectSnapshotOut)
async def get_project_snapshot(
    project_id: UUID,
    user: User = Depends(get_current_user),
    db: "AsyncSession" = Depends(get_db),
) -> ProjectSnapshotOut:
    """One-shot read of every row the frontend needs to render a project.

    Returns project + nodes (with inline checklist) + purchases +
    reminders. Replaces the M5-era N+1 hydration that fetched
    checklists per-node (62 round-trips for the demo / template
    project). Four SELECTs total, none of them per-node.

    NB: a single AsyncSession can only run one query at a time, so the
    SELECTs are issued sequentially — but they're cheap and run on the
    same connection, so the total still dwarfs the old N+1 path.
    """
    project = await get_user_project(db, user, project_id)

    nodes_res = await db.execute(select(Node).where(Node.project_id == project.id).order_by(Node.order))
    nodes = list(nodes_res.scalars().all())

    # Pull every checklist item for the project's nodes in one query,
    # then group locally — replaces the per-node round-trip.
    checklist_by_node: dict = {n.id: [] for n in nodes}
    if nodes:
        cl_res = await db.execute(
            select(ChecklistItem)
            .where(ChecklistItem.node_id.in_([n.id for n in nodes]))
            .order_by(ChecklistItem.node_id, ChecklistItem.order)
        )
        for item in cl_res.scalars().all():
            checklist_by_node[item.node_id].append(ChecklistItemOut.model_validate(item))

    purchases_res = await db.execute(
        select(Purchase)
        .where(Purchase.project_id == project.id)
        .order_by(Purchase.purchase_date.desc().nullslast(), Purchase.created_at.desc())
    )
    reminders_res = await db.execute(
        select(Reminder).where(Reminder.project_id == project.id).order_by(Reminder.trigger_at)
    )

    return ProjectSnapshotOut(
        project=ProjectOut.model_validate(project),
        nodes=[
            NodeWithChecklistOut(
                **NodeOut.model_validate(n).model_dump(),
                checklist=checklist_by_node.get(n.id, []),
            )
            for n in nodes
        ],
        purchases=[PurchaseOut.model_validate(p) for p in purchases_res.scalars().all()],
        reminders=[ReminderOut.model_validate(r) for r in reminders_res.scalars().all()],
    )
