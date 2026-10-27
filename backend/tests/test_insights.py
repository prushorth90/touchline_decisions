import io
import json
from collections.abc import Iterator
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

import boto3
import pytest
from botocore.exceptions import EndpointConnectionError, NoCredentialsError, ReadTimeoutError
from botocore.response import StreamingBody
from botocore.stub import Stubber
from fastapi.testclient import TestClient

from app.config import Settings
from app.dependencies import get_insights_service
from app.insights import REPORT_KEY, GameweekInsightsService
from app.main import create_app


@pytest.fixture
def settings() -> Settings:
    return Settings(_env_file=None, insights_source="fixture")


@pytest.fixture
def report(settings: Settings) -> dict:
    return json.loads(settings.insights_fixture_path.read_text())


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    app = create_app()
    app.dependency_overrides[get_insights_service] = lambda: GameweekInsightsService(settings)
    with closing(TestClient(app)) as client:
        yield client


def test_fixture_report_matches_lambda_contract_without_aws(client: TestClient, report: dict) -> None:
    with patch("app.insights.boto3.client") as aws:
        response = client.get("/api/insights/gameweek")
    aws.assert_not_called()
    assert response.status_code == 200
    expected = {**report, "generatedAt": report["generatedAt"].replace("+00:00", "Z")}
    assert response.json() == expected
    assert len(response.json()["players"]) == 5


def test_s3_report_preserves_timestamp_and_player_ranking(
    client: TestClient, settings: Settings, report: dict,
) -> None:
    settings.insights_source = "s3"
    settings.report_bucket = "test-reports"
    payload = json.dumps(report).encode()
    stream = io.BytesIO(payload)
    s3 = boto3.client(
        "s3", region_name="eu-west-2", aws_access_key_id="testing", aws_secret_access_key="testing",
    )
    with Stubber(s3) as stubber, patch("app.insights.boto3.client", return_value=s3) as aws:
        stubber.add_response(
            "get_object",
            {"Body": StreamingBody(stream, len(payload))},
            {"Bucket": "test-reports", "Key": REPORT_KEY},
        )
        response = client.get("/api/insights/gameweek")
        stubber.assert_no_pending_responses()
    assert response.status_code == 200
    assert response.json()["players"] == report["players"]
    assert response.json()["generatedAt"] == "2026-10-27T12:00:00Z"
    assert stream.closed
    assert aws.call_args.kwargs["config"].connect_timeout == 3
    assert aws.call_args.kwargs["config"].read_timeout == 5


@pytest.mark.parametrize(
    ("code", "aws_status", "status", "title"),
    [
        ("NoSuchKey", 404, 404, "Gameweek report not found."),
        ("AccessDenied", 403, 503, "Gameweek insights are temporarily unavailable."),
        ("NoSuchBucket", 404, 503, "Gameweek insights are temporarily unavailable."),
        ("SlowDown", 503, 503, "Gameweek insights are temporarily unavailable."),
    ],
)
def test_s3_errors_are_sanitized(
    client: TestClient, settings: Settings, code: str, aws_status: int, status: int, title: str,
) -> None:
    settings.insights_source = "s3"
    settings.report_bucket = "test-reports"
    s3 = boto3.client(
        "s3", region_name="eu-west-2", aws_access_key_id="testing", aws_secret_access_key="testing",
    )
    with Stubber(s3) as stubber, patch("app.insights.boto3.client", return_value=s3):
        stubber.add_client_error(
            "get_object", service_error_code=code, service_message="sensitive-internal-details",
            http_status_code=aws_status, expected_params={"Bucket": "test-reports", "Key": REPORT_KEY},
        )
        response = client.get("/api/insights/gameweek")
        stubber.assert_no_pending_responses()
    assert response.status_code == status
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json() == {"status": status, "title": title}
    assert "sensitive-internal-details" not in response.text


@pytest.mark.parametrize(
    "error",
    [
        NoCredentialsError(),
        EndpointConnectionError(endpoint_url="https://internal.example"),
        ReadTimeoutError(endpoint_url="https://internal.example"),
    ],
)
def test_aws_sdk_failures_are_sanitized(
    client: TestClient, settings: Settings, error: Exception,
) -> None:
    settings.insights_source = "s3"
    settings.report_bucket = "test-reports"
    with patch("app.insights.boto3.client", side_effect=error):
        response = client.get("/api/insights/gameweek")
    assert response.status_code == 503
    assert response.json() == {"status": 503, "title": "Gameweek insights are temporarily unavailable."}


def test_unconfigured_s3_does_not_attempt_aws(client: TestClient, settings: Settings) -> None:
    settings.insights_source = "s3"
    settings.report_bucket = ""
    with patch("app.insights.boto3.client") as aws:
        response = client.get("/api/insights/gameweek")
    aws.assert_not_called()
    assert response.status_code == 503


def test_missing_fixture(client: TestClient, settings: Settings, tmp_path: Path) -> None:
    settings.insights_fixture_path = tmp_path / "missing.json"
    response = client.get("/api/insights/gameweek")
    assert response.status_code == 404
    assert response.json() == {"status": 404, "title": "Gameweek report not found."}


def test_unreadable_fixture(client: TestClient, settings: Settings, tmp_path: Path) -> None:
    settings.insights_fixture_path = tmp_path
    response = client.get("/api/insights/gameweek")
    assert response.status_code == 503


@pytest.mark.parametrize(
    "payload",
    [
        "not json",
        '{"players": []}',
        '{"generated_at": "2026-10-27T12:00:00Z", "players": []}',
        '{"generatedAt": "not-a-date", "players": []}',
        '{"generatedAt": "2026-10-27T12:00:00", "players": []}',
        '{"generatedAt": "2026-10-27T12:00:00Z", "players": [{}]}',
        '{"generatedAt": "2026-10-27T12:00:00Z", "players": [{"name": "A", "form": NaN, "total_points": 1}]}',
        '{"generatedAt": "2026-10-27T12:00:00Z", "players": [{"name": "A", "form": 1, "total_points": true}]}',
    ],
)
def test_invalid_report_is_a_sanitized_bad_gateway(
    client: TestClient, settings: Settings, tmp_path: Path, payload: str,
) -> None:
    settings.insights_fixture_path = tmp_path / "report.json"
    settings.insights_fixture_path.write_text(payload)
    response = client.get("/api/insights/gameweek")
    assert response.status_code == 502
    assert response.json() == {"status": 502, "title": "The gameweek report is invalid."}


def test_more_than_five_players_rejected(
    client: TestClient, settings: Settings, tmp_path: Path, report: dict,
) -> None:
    report["players"].append(report["players"][0])
    settings.insights_fixture_path = tmp_path / "report.json"
    settings.insights_fixture_path.write_text(json.dumps(report))
    assert client.get("/api/insights/gameweek").status_code == 502


def test_lifespan_wires_fixture_service_without_aws(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(
        _env_file=None, insights_source="fixture",
        AGENT_DIRECTORY=str(Path(__file__).resolve().parents[2] / ".github" / "agents"),
    )
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    with patch("app.insights.boto3.client") as aws, TestClient(create_app()) as client:
        response = client.get("/api/insights/gameweek")
        assert response.status_code == 200
        assert isinstance(client.app.state.container.insights, GameweekInsightsService)
    aws.assert_not_called()


def test_insights_settings_use_environment(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("INSIGHTS_SOURCE", "s3")
    monkeypatch.setenv("REPORT_BUCKET", "configured-reports")
    monkeypatch.setenv("INSIGHTS_FIXTURE_PATH", str(tmp_path / "report.json"))
    settings = Settings(_env_file=None)
    assert settings.insights_source == "s3"
    assert settings.report_bucket == "configured-reports"
    assert settings.insights_fixture_path == tmp_path / "report.json"
