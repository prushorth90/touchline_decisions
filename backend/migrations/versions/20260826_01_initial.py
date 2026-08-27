"""Adopt or create application persistence tables."""
from alembic import op
from sqlalchemy import inspect

from app.database import Base

revision = "20260826_01"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    existing = set(inspect(connection).get_table_names())
    for table in Base.metadata.sorted_tables:
        if table.name not in existing:
            table.create(connection)


def downgrade() -> None:
    connection = op.get_bind()
    existing = set(inspect(connection).get_table_names())
    for table in reversed(Base.metadata.sorted_tables):
        if table.name in existing:
            table.drop(connection)