from dataclasses import replace
from datetime import UTC, datetime
from decimal import Decimal

import pytest

from app.domain import Player
from app.recommendations import Horizon, PlayerContext, Projection, optimize_lineup, validate_fpl_squad


def context(identifier: int, position: str, points: str, minutes: str, current: int) -> PlayerContext:
    position_id = {"GKP": 1, "DEF": 2, "MID": 3, "FWD": 4}[position]
    player = Player(identifier, identifier, f"Player {identifier}", "", f"Player {identifier}", (identifier % 5) + 1, position_id, 50, 0, 0, Decimal(0), Decimal(0), Decimal(0), Decimal(0), "a", "", None)
    projection = Projection(identifier, player.display_name, datetime.now(UTC), Decimal(minutes), (Horizon(1, Decimal(points), (), ()),))
    return PlayerContext(player, "Test FC", position, projection, current_squad_position=current)


def squad() -> list[PlayerContext]:
    return [context(1, "GKP", "7", "90", 1), context(2, "GKP", "2", "90", 15), context(3, "DEF", "8", "90", 2), context(4, "DEF", "7", "90", 3), context(5, "DEF", "1", "90", 4), context(6, "DEF", "0.5", "90", 12), context(7, "DEF", "0.4", "90", 13), context(8, "MID", "10", "90", 5), context(9, "MID", "9", "90", 6), context(10, "MID", "8", "90", 7), context(11, "MID", "7", "90", 8), context(12, "MID", "6", "90", 14), context(13, "FWD", "10", "90", 9), context(14, "FWD", "9", "90", 10), context(15, "FWD", "1", "90", 11)]


def test_optimizer_selects_best_legal_formation_and_orders_goalkeeper_last_on_bench() -> None:
    formation, starting, bench, changes = optimize_lineup(squad())
    assert formation == "3-5-2"
    assert len(starting) == 11
    assert [item["recommendedSquadPosition"] for item in bench] == [12, 13, 14, 15]
    assert bench[-1]["position"] == "GKP"
    assert any(item["playerId"] == 12 and item["changeType"] == "Moved to starting XI" for item in changes)


def test_optimizer_uses_expected_minutes_as_tiebreaker() -> None:
    players = squad()
    players[4] = context(5, "DEF", "1", "10", 4)
    players[5] = context(6, "DEF", "1", "90", 12)
    _, starting, bench, _ = optimize_lineup(players)
    assert any(item["playerId"] == 6 for item in starting)
    assert any(item["playerId"] == 5 for item in bench)


def test_optimizer_rejects_incomplete_squad() -> None:
    with pytest.raises(RuntimeError, match="15 distinct players"):
        optimize_lineup(squad()[:-1])


def test_transfer_validation_rejects_invalid_club_limit() -> None:
    players = squad()
    players = [replace(context, player=replace(context.player, team_id=1)) if index < 4 else context for index, context in enumerate(players)]
    with pytest.raises(RuntimeError, match="three-player club limit"):
        validate_fpl_squad(players, 10, 5)