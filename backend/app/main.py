from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api import router as fpl_router
from app.coach import CoachService, validate_agent_definitions
from app.coach_api import router as coach_router
from app.config import get_settings
from app.dependencies import AppContainer
from app.fpl import CacheCoordinator, FplApiClient, FplApiError, FplDataService
from app.health_api import router as health_router
from app.middleware import ApplicationMiddleware
from app.persistence import Persistence
from app.profile_api import router as profile_router
from app.recommendation_api import router as recommendation_router
from app.recommendations import RecommendationService


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    validate_agent_definitions(settings.agent_directory)
    http_client = httpx.AsyncClient(
        base_url=settings.fpl_base_url,
        timeout=settings.fpl_timeout_seconds,
        headers={"User-Agent": "Touchline-FPL/1.0"},
    )
    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    engine = create_async_engine(settings.sqlalchemy_url, pool_pre_ping=True)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    persistence = Persistence(sessions, settings.recommendation_snapshot_minutes)
    fpl_service = FplDataService(FplApiClient(http_client), CacheCoordinator(redis))
    recommendation_service = RecommendationService(fpl_service)
    coach_service = CoachService(fpl_service, recommendation_service)
    app.state.container = AppContainer(
        http_client,
        redis,
        engine,
        sessions,
        persistence,
        fpl_service,
        recommendation_service,
        coach_service,
    )
    yield
    await http_client.aclose()
    await redis.aclose()
    await engine.dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    is_development = settings.environment.lower() == "development"
    app = FastAPI(
        title="Touchline Decisions API",
        docs_url="/swagger" if is_development else None,
        redoc_url=None,
        openapi_url="/swagger/v1/swagger.json" if is_development else None,
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(
        ApplicationMiddleware,
        max_body_bytes=settings.max_request_body_kilobytes * 1024,
        requests_per_minute=settings.request_limit_per_minute,
        development=is_development,
    )
    app.include_router(fpl_router)
    app.include_router(recommendation_router)
    app.include_router(coach_router)
    app.include_router(profile_router)
    app.include_router(health_router)

    @app.exception_handler(HTTPException)
    async def handle_http_exception(_request: Request, error: HTTPException) -> JSONResponse:
        detail = error.detail if isinstance(error.detail, dict) else {"status": error.status_code, "title": str(error.detail)}
        return JSONResponse(detail, status_code=error.status_code, media_type="application/problem+json")

    @app.exception_handler(FplApiError)
    async def handle_fpl_error(_request: Request, error: FplApiError) -> JSONResponse:
        status = 404 if error.status_code == 404 else 502
        title = "FPL resource not found." if status == 404 else "The Fantasy Premier League service is unavailable."
        return JSONResponse({"status": status, "title": title}, status_code=status, media_type="application/problem+json")

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, _error: RequestValidationError) -> JSONResponse:
        if request.url.path.startswith("/api/coach/"):
            return JSONResponse(
                {
                    "status": 400,
                    "title": "Invalid coach message.",
                    "detail": "Team ID must be positive and message must contain between 1 and 1000 characters.",
                },
                status_code=400,
                media_type="application/problem+json",
            )
        return JSONResponse(
            {"status": 400, "title": "The request was invalid.", "traceId": request.state.trace_id},
            status_code=400,
            media_type="application/problem+json",
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, error: Exception) -> JSONResponse:
        from sqlalchemy.exc import SQLAlchemyError

        is_database = isinstance(error, SQLAlchemyError)
        status = 503 if is_database else 500
        title = "Application storage is temporarily unavailable." if is_database else "An unexpected error occurred."
        return JSONResponse(
            {"status": status, "title": title, "traceId": request.state.trace_id},
            status_code=status,
            media_type="application/problem+json",
        )

    return app


app = create_app()