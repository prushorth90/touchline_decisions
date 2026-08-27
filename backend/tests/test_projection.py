from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from app.domain import Player, PlayerFixture, PlayerGameweekHistory, PlayerHistory, PlayerSeasonHistory
from app.recommendations import calculate_projection, horizon

NOW = datetime(2026, 8, 26, 12, tzinfo=UTC)


def player(status: str = "a", chance: int | None = None) -> Player:
    return Player(10, 100, "Test", "Player", "Test Player", 1, 3, 75, 100, 5, Decimal(6), Decimal(10), Decimal("0.4"), Decimal("0.2"), status, "", chance)


def fixture(identifier: int, gameweek: int, home: bool, difficulty: int) -> PlayerFixture:
    return PlayerFixture(identifier, gameweek, f"Gameweek {gameweek}", NOW + timedelta(days=gameweek * 7), home, 1 if home else 2, 2 if home else 1, difficulty)


def appearance(gameweek: int, minutes: int) -> PlayerGameweekHistory:
    return PlayerGameweekHistory(10, gameweek, 2, gameweek, True, NOW - timedelta(days=gameweek * 7), 5, minutes, 0, 0, 0, 0, 0, 0, 75, 1000, 0, 0)


def season(name: str, points: int, minutes: int) -> PlayerSeasonHistory:
    return PlayerSeasonHistory(name, 100, 50, 60, points, minutes, 0, 0, 0, 0, 0, 0)


def history(fixtures: tuple[PlayerFixture, ...], current: tuple[PlayerGameweekHistory, ...] | None = None, previous: tuple[PlayerSeasonHistory, ...] | None = None) -> PlayerHistory:
    return PlayerHistory(fixtures, current if current is not None else (appearance(1, 90),), previous if previous is not None else (season("2025/26", 180, 2700),))


def test_exact_horizons_preserve_double_gameweek() -> None:
    result = calculate_projection(player(), history((fixture(1, 2, True, 2), fixture(2, 3, False, 4), fixture(3, 3, True, 3), fixture(4, 4, False, 3), fixture(5, 5, False, 5), fixture(6, 6, True, 1))), NOW)
    assert horizon(result, 1).projected_points == Decimal("7.25")
    assert horizon(result, 3).projected_points == Decimal("26.70")
    assert horizon(result, 5).projected_points == Decimal("40.05")
    assert len(horizon(result, 3).fixtures) == 4


@pytest.mark.parametrize(("status", "chance", "expected"), [("a", None, "7.25"), ("d", 50, "3.63"), ("i", 0, "0.00"), ("s", 0, "0.00")])
def test_availability_is_applied_last(status: str, chance: int | None, expected: str) -> None:
    result = calculate_projection(player(status, chance), history((fixture(1, 2, True, 2),)), NOW)
    assert horizon(result, 1).projected_points == Decimal(expected)


def test_recent_minutes_and_latest_three_seasons() -> None:
    result = calculate_projection(player(), history((fixture(1, 2, True, 3),), (appearance(1, 90), appearance(2, 45), appearance(3, 0)), (season("Old", 50, 900), season("A", 100, 1800), season("B", 120, 1800), season("C", 140, 1800))), NOW)
    factors = {item.factor: item.contribution for item in horizon(result, 1).factors}
    assert factors["Expected playing time"] == Decimal("0.75")
    assert factors["Historical FPL points"] == Decimal("1.50")


def test_previous_season_minutes_fallback() -> None:
    result = calculate_projection(player(), history((fixture(1, 2, True, 3),), (), (season("2025/26", 120, 2280),)), NOW)
    assert result.expected_minutes == Decimal(60)