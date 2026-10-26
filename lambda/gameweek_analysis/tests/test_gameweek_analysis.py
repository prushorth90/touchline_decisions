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
from handler import handler


def player(name: str, form: str, points: int = 100) -> dict[str, object]:
    return {"web_name": name, "form": form, "total_points": points}


@pytest.fixture
def api_mock():
    with patch("analysis.httpx.Client") as client_class:
        client = client_class.return_value.__enter__.return_value
        yield client


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


def test_handler_returns_json_and_does_not_cache(api_mock) -> None:
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
def test_transport_errors_are_logged(api_mock, caplog, error, status) -> None:
    api_mock.get.side_effect = error
    with caplog.at_level(logging.ERROR):
        response = handler({}, None)
    assert response["statusCode"] == status
    assert set(json.loads(response["body"])) == {"error"}
    assert caplog.records


@pytest.mark.parametrize("status", [429, 500, 503])
def test_http_errors(api_mock, status) -> None:
    set_response(api_mock, {"detail": "upstream failure"}, status)
    assert handler({}, None)["statusCode"] == 502


def test_invalid_json(api_mock) -> None:
    api_mock.get.return_value = httpx.Response(
        200, text="not JSON", request=httpx.Request("GET", BOOTSTRAP_URL)
    )
    assert handler({}, None)["statusCode"] == 502


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
def test_invalid_upstream_data_is_not_a_success(api_mock, payload) -> None:
    set_response(api_mock, payload)
    response = handler({}, None)
    assert response["statusCode"] == 502
    assert json.loads(response["body"]) == {"error": "Unable to analyze FPL player data"}


def test_handler_import_does_not_load_application_or_services() -> None:
    code = (
        "import sys; import handler; "
        "assert not any(name.split('.')[0] in "
        "{'app', 'fastapi', 'sqlalchemy', 'redis', 'boto3'} for name in sys.modules)"
    )
    subprocess.run(
        [sys.executable, "-c", code],
        cwd=Path(__file__).resolve().parents[1],
        check=True,
    )


def test_local_script_is_importable_without_a_request(api_mock) -> None:
    importlib.import_module("invoke_local")
    api_mock.get.assert_not_called()
