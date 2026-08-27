import httpx
import pytest

from app.dependencies import get_coach_service, get_fpl_service
from app.main import create_app


@pytest.mark.asyncio
async def test_invalid_team_returns_problem_details_not_422() -> None:
    app = create_app()
    app.dependency_overrides[get_fpl_service] = object
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/fpl/team/0")
    assert response.status_code == 400
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json() == {"status": 400, "title": "Invalid FPL team ID.", "detail": "The team ID must be a positive integer."}


@pytest.mark.asyncio
async def test_invalid_coach_body_returns_existing_contract() -> None:
    app = create_app()
    app.dependency_overrides[get_coach_service] = object
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/coach/chat", json={"teamId": 0, "message": ""})
    assert response.status_code == 400
    assert response.json()["title"] == "Invalid coach message."