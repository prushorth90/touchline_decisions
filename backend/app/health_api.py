from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Response
from sqlalchemy import text

from app.dependencies import RedisDependency, SessionDependency
from app.domain import iso_datetime
from app.schemas import HealthResponse

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=HealthResponse)
async def health(response: Response, session: SessionDependency, redis: RedisDependency) -> dict[str, Any]:
    postgres_healthy = redis_healthy = False
    try:
        await session.execute(text("SELECT 1"))
        postgres_healthy = True
    except Exception:
        pass
    try:
        redis_healthy = bool(await redis.ping())
    except Exception:
        pass
    status = "Unhealthy" if not postgres_healthy else "Healthy" if redis_healthy else "Degraded"
    payload: dict[str, Any] = {"status": status, "timestamp": iso_datetime(datetime.now(UTC)),
                               "dependencies": {"postgresql": "Healthy" if postgres_healthy else "Unhealthy", "redis": "Healthy" if redis_healthy else "Degraded"}}
    response.status_code = 503 if status == "Unhealthy" else 200
    return payload