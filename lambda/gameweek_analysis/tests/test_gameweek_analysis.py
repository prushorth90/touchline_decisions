import importlib
import json
import logging
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch

import httpx
import pytest
from analysis import BOOTSTRAP_URL, HTTP_TIMEOUT, analyze_gameweek
from botocore.exceptions import ClientError, EndpointConnectionError
from handler import handler


def player(name: str, form: str, points: int = 100) -> dict[str, object]:
    return {"web_name": name, "form": form, "total_points": points}


@pytest.fixture
def api_mock():
    with patch("analysis.httpx.Client") as client_class:
        client = client_class.return_value.__enter__.return_value
        yield client


@pytest.fixture(autouse=True)
def s3_mock(monkeypatch):
    monkeypatch.setenv("REPORT_BUCKET", "test-report-bucket")
    with patch("handler.boto3.client") as client_class:
        yield client_class.return_value


def set_response(api_mock, payload: object, status: int = 200) -> None:
    api_mock.get.return_value = httpx.Response(
        status, json=payload, request=httpx.Request("GET", BOOTSTRAP_URL)
    )


def test_ranks_numeric_form_and_returns_exactly_five(api_mock) -> None:
    set_response(
        api_mock,
        {"elements": [
            player("Low", "2.0", 999),
            player("Best", "10.5", 80),
            player("Second", "9.0", 90),
            player("Third", "8.0"),
            player("Fourth", "7.0"),
            player("Fifth", "6.0"),
            player("Sixth", "5.0"),
        ]},
    )
    before = datetime.now(UTC)
    result = analyze_gameweek()
    after = datetime.now(UTC)

    assert [item["name"] for item in result["players"]] == [
        "Best", "Second", "Third", "Fourth", "Fifth"
    ]
    assert result["players"][0] == {"name": "Best", "form": 10.5, "total_points": 80}
    assert set(result) == {"players", "generated_at"}
    generated = datetime.fromisoformat(result["generated_at"])
    assert generated.utcoffset() == UTC.utcoffset(generated)
    assert before <= generated <= after
    api_mock.get.assert_called_once_with(BOOTSTRAP_URL)


def test_client_has_explicit_timeouts(api_mock) -> None:
    set_response(api_mock, {"elements": []})
    analyze_gameweek()
    httpx.Client.assert_called_once_with(timeout=HTTP_TIMEOUT)
    assert HTTP_TIMEOUT.connect == 3.0
    assert HTTP_TIMEOUT.read == HTTP_TIMEOUT.write == HTTP_TIMEOUT.pool == 10.0


def test_handler_returns_json_and_does_not_cache(api_mock, s3_mock) -> None:
    set_response(api_mock, {"elements": [player("First", "4.0")]})
    first = handler({}, None)
    assert first["statusCode"] == 200
    assert first["headers"] == {"Content-Type": "application/json"}
    assert json.loads(first["body"])["players"] == [
        {"name": "First", "form": 4.0, "total_points": 100}
    ]

    set_response(api_mock, {"elements": [player("Fresh", "5.0")]})
    second = handler({"ignored": True}, None)
    assert json.loads(second["body"])["players"][0]["name"] == "Fresh"
    assert api_mock.get.call_count == 2
    assert s3_mock.put_object.call_count == 2
    uploaded = json.loads(s3_mock.put_object.call_args.kwargs["Body"])
    assert uploaded["players"][0]["name"] == "Fresh"


def test_handler_uploads_top_five_as_json_with_utc_timestamp(api_mock, s3_mock) -> None:
    set_response(api_mock, {"elements": [
        player(f"Player {index}", str(index)) for index in range(7)
    ]})
    before = datetime.now(UTC)
    response = handler({}, None)
    after = datetime.now(UTC)

    assert response["statusCode"] == 200
    boto_client = importlib.import_module("handler").boto3.client
    boto_client.assert_called_once_with("s3")
    s3_mock.put_object.assert_called_once()
    upload = s3_mock.put_object.call_args.kwargs
    assert set(upload) == {"Bucket", "Key", "Body", "ContentType"}
    assert upload["Bucket"] == "test-report-bucket"
    assert upload["Key"] == "reports/latest.json"
    assert upload["ContentType"] == "application/json"
    assert isinstance(upload["Body"], bytes)
    report = json.loads(upload["Body"])
    assert set(report) == {"players", "generatedAt"}
    assert [item["name"] for item in report["players"]] == [
        "Player 6", "Player 5", "Player 4", "Player 3", "Player 2",
    ]
    assert report["players"] == json.loads(response["body"])["players"]
    generated = datetime.fromisoformat(report["generatedAt"])
    assert generated.utcoffset() == UTC.utcoffset(generated)
    assert before <= generated <= after


@pytest.mark.parametrize("error", [
    ClientError({"Error": {"Code": "AccessDenied", "Message": "Denied"}}, "PutObject"),
    EndpointConnectionError(endpoint_url="https://s3.example.test"),
])
def test_upload_errors_are_logged_and_not_reported_as_success(api_mock, s3_mock, caplog, error) -> None:
    set_response(api_mock, {"elements": [player("Best", "9.0")]})
    s3_mock.put_object.side_effect = error
    with caplog.at_level(logging.ERROR):
        response = handler({}, None)
    assert response["statusCode"] == 500
    assert json.loads(response["body"]) == {"error": "Unable to store gameweek report"}
    assert any(record.exc_info and "upload" in record.message for record in caplog.records)
    s3_mock.put_object.assert_called_once()


@pytest.mark.parametrize("bucket", [None, "", "   "])
def test_missing_bucket_is_logged_and_raised(api_mock, s3_mock, monkeypatch, caplog, bucket) -> None:
    set_response(api_mock, {"elements": [player("Best", "9.0")]})
    if bucket is None:
        monkeypatch.delenv("REPORT_BUCKET")
    else:
        monkeypatch.setenv("REPORT_BUCKET", bucket)
    with caplog.at_level(logging.ERROR), pytest.raises(RuntimeError, match="REPORT_BUCKET"):
        handler({}, None)
    s3_mock.put_object.assert_not_called()
    assert any(record.exc_info for record in caplog.records)


@pytest.mark.parametrize("elements", [[], [player("Only", "0.0")]])
def test_fewer_than_five_players(api_mock, elements) -> None:
    set_response(api_mock, {"elements": elements})
    result = analyze_gameweek()
    assert len(result["players"]) == len(elements)


def test_equal_forms_preserve_api_order(api_mock) -> None:
    set_response(api_mock, {"elements": [
        player("First", "-1.0", 1), player("Second", "-1.0", 999)
    ]})
    assert [item["name"] for item in analyze_gameweek()["players"]] == ["First", "Second"]


@pytest.mark.parametrize("error, status", [
    (httpx.ConnectTimeout("connect timed out"), 504),
    (httpx.ReadTimeout("read timed out"), 504),
    (httpx.ConnectError("connection failed"), 502),
])
def test_transport_errors_are_logged(api_mock, s3_mock, caplog, error, status) -> None:
    api_mock.get.side_effect = error
    with caplog.at_level(logging.ERROR):
        response = handler({}, None)
    assert response["statusCode"] == status
    assert set(json.loads(response["body"])) == {"error"}
    assert caplog.records
    s3_mock.put_object.assert_not_called()


@pytest.mark.parametrize("status", [429, 500, 503])
def test_http_errors(api_mock, s3_mock, status) -> None:
    set_response(api_mock, {"detail": "upstream failure"}, status)
    assert handler({}, None)["statusCode"] == 502
    s3_mock.put_object.assert_not_called()


def test_invalid_json(api_mock, s3_mock) -> None:
    api_mock.get.return_value = httpx.Response(
        200, text="not JSON", request=httpx.Request("GET", BOOTSTRAP_URL)
    )
    assert handler({}, None)["statusCode"] == 502
    s3_mock.put_object.assert_not_called()


@pytest.mark.parametrize("payload", [
    None,
    [],
    {},
    {"elements": None},
    {"elements": {}},
    {"elements": [None]},
    {"elements": [{}]},
    {"elements": [player("", "1.0")]},
    {"elements": [player("   ", "1.0")]},
    {"elements": [player("Bad", "not numeric")]},
    {"elements": [player("Bad", "NaN")]},
    {"elements": [player("Bad", "Infinity")]},
    {"elements": [player("Bad", "1e999")]},
    {"elements": [{"web_name": "Bad", "form": None, "total_points": 1}]},
    {"elements": [{"web_name": "Bad", "form": True, "total_points": 1}]},
    {"elements": [{"web_name": "Bad", "form": "1.0", "total_points": True}]},
    {"elements": [{"web_name": "Bad", "form": "1.0", "total_points": "10"}]},
])
def test_invalid_upstream_data_is_not_a_success(api_mock, s3_mock, payload) -> None:
    set_response(api_mock, payload)
    response = handler({}, None)
    assert response["statusCode"] == 502
    assert json.loads(response["body"]) == {"error": "Unable to analyze FPL player data"}
    s3_mock.put_object.assert_not_called()


def test_validation_failure_keeps_previous_successful_report(api_mock, s3_mock) -> None:
    set_response(api_mock, {"elements": [player("Best", "9.0")]})
    assert handler({}, None)["statusCode"] == 200
    previous_upload = s3_mock.put_object.call_args

    # Even invalid players outside the top five must prevent publication.
    set_response(api_mock, {"elements": [
        *[player(f"Good {index}", "9.0") for index in range(5)],
        player("Bad", "NaN"),
    ]})
    assert handler({}, None)["statusCode"] == 502
    s3_mock.put_object.assert_called_once()
    assert s3_mock.put_object.call_args == previous_upload


def test_handler_import_does_not_load_application_or_services() -> None:
    code = (
        "import sys; import handler; "
        "assert not any(name.split('.')[0] in "
        "{'app', 'fastapi', 'sqlalchemy', 'redis'} for name in sys.modules)"
    )
    subprocess.run(
        [sys.executable, "-c", code],
        cwd=Path(__file__).resolve().parents[1],
        check=True,
    )


def test_local_script_is_importable_without_a_request(api_mock) -> None:
    importlib.import_module("invoke_local")
    api_mock.get.assert_not_called()
