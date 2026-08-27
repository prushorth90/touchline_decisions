import asyncio
from typing import Any, cast

import pytest

from app.fpl import CacheCoordinator, FplApiClient, FplDataService, map_bootstrap, map_manager


@pytest.mark.asyncio
async def test_cache_coalesces_concurrent_misses() -> None:
    cache = CacheCoordinator(None)
    calls = 0

    async def factory() -> dict[str, int]:
        nonlocal calls
        calls += 1
        await asyncio.sleep(0)
        return {"value": 42}

    results = await asyncio.gather(*(cache.get_or_create("same", 60, factory) for _ in range(10)))
    assert calls == 1
    assert results == [{"value": 42}] * 10


@pytest.mark.asyncio
async def test_league_standings_are_mapped_and_cached() -> None:
    class FakeClient:
        calls = 0

        async def get(self, endpoint: str) -> dict[str, Any]:
            self.calls += 1
            assert endpoint == "leagues-classic/123/standings/?page_standings=2"
            return {
                "league": {"id": 123, "name": "Test League"},
                "standings": {
                    "page": 2,
                    "has_next": False,
                    "results": [
                        {
                            "rank": 1,
                            "last_rank": 2,
                            "entry": 42,
                            "entry_name": "Algorithms FC",
                            "player_name": "Ada Lovelace",
                            "event_total": 70,
                            "total": 1400,
                        }
                    ],
                },
            }

    client = FakeClient()
    service = FplDataService(cast(FplApiClient, client), CacheCoordinator(None))
    first = await service.league_standings(123, 2)
    second = await service.league_standings(123, 2)
    assert client.calls == 1
    assert first == second
    assert first["standings"][0]["entryId"] == 42


def test_manager_mapping_preserves_bank_and_rank_nulls() -> None:
    manager = map_manager({"id": 42, "player_first_name": "Ada", "player_last_name": "Lovelace", "name": "Algorithms FC", "started_event": 1, "current_event": 2, "summary_overall_points": 100, "summary_overall_rank": None, "summary_event_points": 50, "summary_event_rank": None, "last_deadline_bank": 15, "last_deadline_value": 1005})
    assert manager.bank == 15
    assert manager.team_value == 1005
    assert manager.overall_rank is None


def test_bootstrap_parses_invalid_numeric_strings_as_zero() -> None:
    source: dict[str, Any] = {"events": [], "teams": [], "element_types": [], "elements": [{"id": 1, "code": 2, "first_name": "A", "second_name": "B", "web_name": "AB", "team": 1, "element_type": 3, "now_cost": 50, "total_points": 0, "event_points": 0, "form": "bad", "selected_by_percent": "", "expected_goals_per_90": 0, "expected_assists_per_90": 0, "status": "a", "news": "", "chance_of_playing_next_round": None}]}
    result = map_bootstrap(source)
    assert result.players[0].form == 0
    assert result.players[0].ownership_percentage == 0