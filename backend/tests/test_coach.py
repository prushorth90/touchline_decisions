from pathlib import Path

import pytest

from app.coach import (
    availability,
    recommendation_type,
    requested_gameweeks,
    resolve_player_name,
    validate_agent_definitions,
)


def test_intent_precedence_and_horizons() -> None:
    assert recommendation_type("Is Saka injured and should I sell?") == "Availability"
    assert recommendation_type("Who should replace Saka?") == "Replacement"
    assert requested_gameweeks("Show the next 2 fixtures") == (2, 2)
    assert requested_gameweeks("Should I hold Saka?") == (3, 5)


def test_availability_extracts_expected_return() -> None:
    result = availability({"playerId": 1, "playerName": "Test", "teamName": "Club", "position": "MID", "status": "i", "chanceOfPlayingNextRound": 0, "news": "Hamstring. Expected back 14 Sep; rehabilitation."})
    assert result["statusDescription"] == "Injured"
    assert result["expectedReturn"] == "14 Sep"
    assert result["confidence"] == 95


def test_player_resolution_prefers_longest_owned_name() -> None:
    short = {"playerName": "Fernandes", "firstName": "Bruno", "lastName": "Fernandes"}
    long = {"playerName": "Bruno Fernandes", "firstName": "Bruno", "lastName": "Fernandes"}
    assert resolve_player_name("Should I sell Bruno Fernandes?", [short, long]) is long
    assert resolve_player_name("Should I sell Salah?", [short, long]) is None


def test_repository_agent_definitions_are_valid() -> None:
    validate_agent_definitions("/app/agents")


def test_agent_validation_rejects_broadened_tools(tmp_path: Path) -> None:
    for filename, name, tool in (("fpl-coach.agent.md", "FplCoachAgent", "task"), ("injury.agent.md", "InjuryAgent", "get_player_availability"), ("fixture.agent.md", "FixtureAgent", "get_upcoming_fixtures"), ("transfer.agent.md", "TransferAgent", "get_transfer_candidates")):
        tools = f"{tool}, extra" if name == "InjuryAgent" else tool
        (tmp_path / filename).write_text(f"---\nname: {name}\ndescription: test\ntools: [{tools}]\n---\nInstructions\n")
    with pytest.raises(RuntimeError, match="exactly these tools"):
        validate_agent_definitions(str(tmp_path))