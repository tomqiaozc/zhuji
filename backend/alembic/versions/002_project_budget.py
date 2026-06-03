"""Add budget column to projects.

Revision ID: 002_project_budget
Revises: 001_initial
Create Date: 2026-06-03
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "002_project_budget"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("budget", sa.Numeric(14, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("projects", "budget")
