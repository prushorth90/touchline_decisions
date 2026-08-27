from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.api import problem
from app.dependencies import PersistenceDependency, RecommendationServiceDependency
from app.persistence import Persistence
from app.schemas import (
    CaptainRecommendationResponse,
    LineupRecommendationResponse,
    RecommendationHistoryResponse,
    TransferRecommendationResponse,
)

router = APIRouter(prefix="/api/recommendations", tags=["Recommendations"])


def require_team(team_id: int) -> None:
    if team_id <= 0:
        raise HTTPException(400, problem(400, "Invalid FPL team ID.", "The team ID must be a positive integer."))


@router.get("/{team_id}/captain", response_model=CaptainRecommendationResponse)
async def captain(
    team_id: int,
    service: RecommendationServiceDependency,
    persistence: PersistenceDependency,
) -> dict[str, Any]:
    require_team(team_id)
    return await _cached(persistence, team_id, "captain", lambda: service.captain(team_id))


@router.get("/{team_id}/lineup", response_model=LineupRecommendationResponse)
async def lineup(
    team_id: int,
    service: RecommendationServiceDependency,
    persistence: PersistenceDependency,
) -> dict[str, Any]:
    require_team(team_id)
    return await _cached(persistence, team_id, "lineup", lambda: service.lineup(team_id))


@router.get("/{team_id}/transfers", response_model=TransferRecommendationResponse)
async def transfers(
    team_id: int,
    service: RecommendationServiceDependency,
    persistence: PersistenceDependency,
    limit: int = Query(20),
) -> dict[str, Any]:
    if team_id <= 0 or limit < 1 or limit > 50:
        raise HTTPException(400, problem(400, "Invalid transfer recommendation request.", "The team ID must be positive and limit must be between 1 and 50."))
    return await _cached(persistence, team_id, f"transfers:{limit}", lambda: service.transfers(team_id, limit))


async def _cached(
    persistence: Persistence,
    team_id: int,
    kind: str,
    factory: Callable[[], Awaitable[dict[str, Any]]],
) -> dict[str, Any]:
    cached = await persistence.current(team_id, kind)
    if cached is not None:
        return cached
    payload = await factory()
    await persistence.store(team_id, kind, payload)
    return payload


@router.get("/{team_id}/history", response_model=list[RecommendationHistoryResponse])
async def history(
    team_id: int,
    persistence: PersistenceDependency,
    kind: str | None = None,
    limit: int = Query(20),
) -> list[dict[str, Any]]:
    if team_id <= 0 or limit < 1 or limit > 100 or (kind is not None and len(kind) > 40):
        raise HTTPException(400, problem(400, "Invalid recommendation history request.", "Team ID must be positive, limit must be between 1 and 100, and kind must not exceed 40 characters."))
    return await persistence.history(team_id, kind, limit)