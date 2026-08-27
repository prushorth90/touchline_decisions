import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.database import RecommendationHistory, RecommendationSnapshot
from app.domain import iso_datetime, parse_datetime


class Persistence:
    def __init__(self, sessions: async_sessionmaker[AsyncSession], snapshot_minutes: int) -> None:
        self.sessions = sessions
        self.snapshot_minutes = snapshot_minutes

    async def current(self, team_id: int, kind: str) -> dict[str, Any] | None:
        async with self.sessions() as session:
            return await session.scalar(select(RecommendationSnapshot.payload).where(RecommendationSnapshot.team_id == team_id, RecommendationSnapshot.kind == kind, RecommendationSnapshot.expires_at > datetime.now(UTC)))

    async def store(self, team_id: int, kind: str, payload: dict[str, Any]) -> None:
        now = datetime.now(UTC)
        calculated_at = parse_datetime(payload["calculatedAt"]) or now
        statement = insert(RecommendationSnapshot).values(
            id=uuid.uuid4(), team_id=team_id, kind=kind, payload=payload, calculated_at=calculated_at,
            expires_at=now + timedelta(minutes=self.snapshot_minutes), updated_at=now,
        ).on_conflict_do_update(
            index_elements=[RecommendationSnapshot.team_id, RecommendationSnapshot.kind],
            set_={"PayloadJson": payload, "CalculatedAt": calculated_at, "ExpiresAt": now + timedelta(minutes=self.snapshot_minutes), "UpdatedAt": now},
        )
        async with self.sessions() as session, session.begin():
            await session.execute(statement)
            session.add(RecommendationHistory(team_id=team_id, kind=kind, payload=payload, calculated_at=calculated_at, recorded_at=now))

    async def history(self, team_id: int, kind: str | None, limit: int) -> list[dict[str, Any]]:
        statement = select(RecommendationHistory).where(RecommendationHistory.team_id == team_id)
        if kind is not None:
            statement = statement.where(RecommendationHistory.kind == kind)
        statement = statement.order_by(RecommendationHistory.recorded_at.desc()).limit(limit)
        async with self.sessions() as session:
            rows = (await session.scalars(statement)).all()
        return [{"kind": row.kind, "recommendation": row.payload, "calculatedAt": iso_datetime(row.calculated_at), "recordedAt": iso_datetime(row.recorded_at)} for row in rows]