from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Annotated, cast

import httpx
from fastapi import Depends, Request
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.coach import CoachService
from app.fpl import FplDataService
from app.insights import GameweekInsightsService
from app.persistence import Persistence
from app.recommendations import RecommendationService


@dataclass(frozen=True, slots=True)
class AppContainer:
    http_client: httpx.AsyncClient
    redis: Redis
    engine: AsyncEngine
    sessions: async_sessionmaker[AsyncSession]
    persistence: Persistence
    fpl: FplDataService
    recommendations: RecommendationService
    coach: CoachService
    insights: GameweekInsightsService


def get_container(request: Request) -> AppContainer:
    return cast(AppContainer, request.app.state.container)


def get_fpl_service(container: Annotated[AppContainer, Depends(get_container)]) -> FplDataService:
    return container.fpl


def get_recommendation_service(container: Annotated[AppContainer, Depends(get_container)]) -> RecommendationService:
    return container.recommendations


def get_coach_service(container: Annotated[AppContainer, Depends(get_container)]) -> CoachService:
    return container.coach


def get_insights_service(container: Annotated[AppContainer, Depends(get_container)]) -> GameweekInsightsService:
    return container.insights


def get_persistence(container: Annotated[AppContainer, Depends(get_container)]) -> Persistence:
    return container.persistence


def get_redis(container: Annotated[AppContainer, Depends(get_container)]) -> Redis:
    return container.redis


async def get_session(container: Annotated[AppContainer, Depends(get_container)]) -> AsyncIterator[AsyncSession]:
    async with container.sessions() as session:
        yield session


FplServiceDependency = Annotated[FplDataService, Depends(get_fpl_service)]
RecommendationServiceDependency = Annotated[RecommendationService, Depends(get_recommendation_service)]
CoachServiceDependency = Annotated[CoachService, Depends(get_coach_service)]
GameweekInsightsServiceDependency = Annotated[GameweekInsightsService, Depends(get_insights_service)]
PersistenceDependency = Annotated[Persistence, Depends(get_persistence)]
RedisDependency = Annotated[Redis, Depends(get_redis)]
SessionDependency = Annotated[AsyncSession, Depends(get_session)]