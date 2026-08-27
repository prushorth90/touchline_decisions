import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class LocalProfile(Base):
    __tablename__ = "local_profiles"
    id: Mapped[uuid.UUID] = mapped_column("Id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    display_name: Mapped[str] = mapped_column("DisplayName", String(120))
    selected_fpl_team_id: Mapped[int | None] = mapped_column("SelectedFplTeamId", Integer, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column("CreatedAt", DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column("UpdatedAt", DateTime(timezone=True))


class ApplicationSetting(Base):
    __tablename__ = "application_settings"
    __table_args__ = (UniqueConstraint("ProfileId", "Key"),)
    id: Mapped[int] = mapped_column("Id", BigInteger, primary_key=True, autoincrement=True)
    profile_id: Mapped[uuid.UUID] = mapped_column("ProfileId", UUID(as_uuid=True), ForeignKey("local_profiles.Id", ondelete="CASCADE"))
    key: Mapped[str] = mapped_column("Key", String(100))
    value: Mapped[Any] = mapped_column("ValueJson", JSONB)
    updated_at: Mapped[datetime] = mapped_column("UpdatedAt", DateTime(timezone=True))


class RecommendationSnapshot(Base):
    __tablename__ = "recommendation_snapshots"
    __table_args__ = (UniqueConstraint("FplTeamId", "Kind"), Index("IX_recommendation_snapshots_ExpiresAt", "ExpiresAt"))
    id: Mapped[uuid.UUID] = mapped_column("Id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    team_id: Mapped[int] = mapped_column("FplTeamId", Integer)
    kind: Mapped[str] = mapped_column("Kind", String(40))
    payload: Mapped[Any] = mapped_column("PayloadJson", JSONB)
    calculated_at: Mapped[datetime] = mapped_column("CalculatedAt", DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column("ExpiresAt", DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column("UpdatedAt", DateTime(timezone=True))


class RecommendationHistory(Base):
    __tablename__ = "recommendation_history"
    __table_args__ = (Index("IX_recommendation_history_FplTeamId_Kind_RecordedAt", "FplTeamId", "Kind", "RecordedAt"),)
    id: Mapped[int] = mapped_column("Id", BigInteger, primary_key=True, autoincrement=True)
    team_id: Mapped[int] = mapped_column("FplTeamId", Integer)
    kind: Mapped[str] = mapped_column("Kind", String(40))
    payload: Mapped[Any] = mapped_column("PayloadJson", JSONB)
    calculated_at: Mapped[datetime] = mapped_column("CalculatedAt", DateTime(timezone=True))
    recorded_at: Mapped[datetime] = mapped_column("RecordedAt", DateTime(timezone=True))