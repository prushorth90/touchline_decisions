import math
from datetime import UTC, datetime
from typing import TypedDict

import httpx

BOOTSTRAP_URL = "https://fantasy.premierleague.com/api/bootstrap-static/"
HTTP_TIMEOUT = httpx.Timeout(10.0, connect=3.0)


class FplDataError(ValueError):
    """The upstream response does not contain usable player data."""


class PlayerSummary(TypedDict):
    name: str
    form: float
    total_points: int


class AnalysisResult(TypedDict):
    players: list[PlayerSummary]
    generated_at: str


def parse_player(item: object) -> PlayerSummary:
    if not isinstance(item, dict):
        raise FplDataError("Each FPL player must be an object")

    name = item.get("web_name")
    raw_form = item.get("form")
    total_points = item.get("total_points")
    if not isinstance(name, str) or not name.strip():
        raise FplDataError("Player web_name must be a nonempty string")
    if isinstance(raw_form, bool) or not isinstance(raw_form, (str, int, float)):
        raise FplDataError("Player form must be numeric")
    try:
        form = float(raw_form)
    except (ValueError, OverflowError) as error:
        raise FplDataError("Player form must be numeric") from error
    if not math.isfinite(form):
        raise FplDataError("Player form must be finite")
    if isinstance(total_points, bool) or not isinstance(total_points, int):
        raise FplDataError("Player total_points must be an integer")
    return {"name": name.strip(), "form": form, "total_points": total_points}


def analyze_gameweek() -> AnalysisResult:
    with httpx.Client(timeout=HTTP_TIMEOUT) as client:
        response = client.get(BOOTSTRAP_URL)
        response.raise_for_status()
        try:
            payload = response.json()
        except ValueError as error:
            raise FplDataError("FPL returned invalid JSON") from error

    if not isinstance(payload, dict) or not isinstance(payload.get("elements"), list):
        raise FplDataError("FPL response must contain an elements list")
    players = [parse_player(item) for item in payload["elements"]]
    # Python's stable sort preserves API order when form values are equal.
    players.sort(key=lambda player: player["form"], reverse=True)
    return {
        "players": players[:5],
        "generated_at": datetime.now(UTC).isoformat(),
    }
