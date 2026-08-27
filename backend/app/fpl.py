import asyncio
import json
import logging
import time
from collections.abc import Awaitable, Callable
from decimal import Decimal, InvalidOperation
from typing import Any, TypeVar, cast

import httpx
from redis.asyncio import Redis

from app.domain import (
    BootstrapData,
    Fixture,
    Gameweek,
    Manager,
    Player,
    PlayerFixture,
    PlayerGameweekHistory,
    PlayerHistory,
    PlayerPosition,
    PlayerSeasonHistory,
    Squad,
    SquadPick,
    SquadSummary,
    Team,
    parse_datetime,
)

logger = logging.getLogger(__name__)
T = TypeVar("T")


class FplApiError(Exception):
    def __init__(self, endpoint: str, status_code: int | None = None) -> None:
        super().__init__(f"FPL endpoint {endpoint} failed")
        self.endpoint = endpoint
        self.status_code = status_code


class FplApiClient:
    def __init__(self, client: httpx.AsyncClient) -> None:
        self._client = client

    async def get(self, endpoint: str) -> Any:
        try:
            response = await self._client.get(endpoint)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as error:
            raise FplApiError(endpoint, error.response.status_code) from error
        except (httpx.HTTPError, ValueError) as error:
            raise FplApiError(endpoint) from error


class CacheCoordinator:
    def __init__(self, redis: Redis | None) -> None:
        self._redis = redis
        self._memory: dict[str, tuple[float, Any]] = {}
        self._inflight: dict[str, asyncio.Future[Any]] = {}
        self._guard = asyncio.Lock()

    async def get_or_create(self, key: str, ttl_seconds: int, factory: Callable[[], Awaitable[T]]) -> T:
        now = time.monotonic()
        memory_value = self._memory.get(key)
        if memory_value is not None and memory_value[0] > now:
            return cast(T, memory_value[1])

        if self._redis is not None:
            try:
                encoded = await self._redis.get(f"fpl:{key}")
                if encoded is not None:
                    value = json.loads(encoded)
                    self._memory[key] = (now + ttl_seconds, value)
                    return cast(T, value)
            except Exception:
                logger.warning("Redis cache read failed", extra={"cache_key": key}, exc_info=True)

        async with self._guard:
            task = self._inflight.get(key)
            if task is None:
                task = asyncio.ensure_future(factory())
                self._inflight[key] = task

        try:
            value = cast(T, await asyncio.shield(task))
            self._memory[key] = (time.monotonic() + ttl_seconds, value)
            if self._redis is not None:
                try:
                    await self._redis.set(f"fpl:{key}", json.dumps(value), ex=ttl_seconds)
                except Exception:
                    logger.warning("Redis cache write failed", extra={"cache_key": key}, exc_info=True)
            return value
        finally:
            if task.done():
                async with self._guard:
                    if self._inflight.get(key) is task:
                        self._inflight.pop(key, None)


class FplDataService:
    def __init__(self, client: FplApiClient, cache: CacheCoordinator) -> None:
        self._client = client
        self._cache = cache

    async def bootstrap(self) -> BootstrapData:
        value = await self._cache.get_or_create(
            "api:v1:bootstrap:v4", 3600, lambda: self._client.get("bootstrap-static/")
        )
        return map_bootstrap(value)

    async def fixtures(self) -> tuple[Fixture, ...]:
        value = await self._cache.get_or_create("api:v1:fixtures:v1", 900, lambda: self._client.get("fixtures/"))
        return tuple(map_fixture(item) for item in value)

    async def manager(self, manager_id: int) -> Manager:
        value = await self._cache.get_or_create(
            f"api:v1:manager:{manager_id}:v1", 300, lambda: self._client.get(f"entry/{manager_id}/")
        )
        return map_manager(value)

    async def squad(self, manager_id: int, gameweek: int) -> Squad:
        value = await self._cache.get_or_create(
            f"api:v1:manager:{manager_id}:gameweek:{gameweek}:picks:v3",
            300,
            lambda: self._client.get(f"entry/{manager_id}/event/{gameweek}/picks/"),
        )
        return map_squad(value)

    async def player_history(self, player_id: int) -> PlayerHistory:
        value = await self._cache.get_or_create(
            f"api:v1:player:{player_id}:history:v1",
            1800,
            lambda: self._client.get(f"element-summary/{player_id}/"),
        )
        return map_player_history(value)

    async def league_standings(self, league_id: int, page: int = 1) -> dict[str, Any]:
        value = await self._cache.get_or_create(
            f"api:v1:league:{league_id}:standings:{page}:v1",
            300,
            lambda: self._client.get(f"leagues-classic/{league_id}/standings/?page_standings={page}"),
        )
        league = value["league"]
        standings = value["standings"]
        return {
            "leagueId": league["id"],
            "leagueName": league["name"],
            "page": standings["page"],
            "hasNext": standings["has_next"],
            "standings": [
                {
                    "rank": item["rank"],
                    "lastRank": item["last_rank"],
                    "entryId": item["entry"],
                    "entryName": item["entry_name"],
                    "playerName": item["player_name"],
                    "eventTotal": item["event_total"],
                    "total": item["total"],
                }
                for item in standings["results"]
            ],
        }


def _decimal(value: Any) -> Decimal:
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError):
        return Decimal(0)


def map_bootstrap(source: dict[str, Any]) -> BootstrapData:
    return BootstrapData(
        tuple(
            Gameweek(
                item["id"],
                item["name"],
                cast(Any, parse_datetime(item["deadline_time"])),
                item["finished"],
                item["is_current"],
                item["is_next"],
                item["average_entry_score"],
                item.get("highest_score"),
            )
            for item in source["events"]
        ),
        tuple(
            Team(
                item["id"], item["code"], item["name"], item["short_name"], item.get("strength"),
                item["strength_overall_home"], item["strength_overall_away"],
            )
            for item in source["teams"]
        ),
        tuple(
            PlayerPosition(
                item["id"], item["singular_name"], item["singular_name_short"], item["squad_select"],
                item["squad_min_play"], item["squad_max_play"],
            )
            for item in source["element_types"]
        ),
        tuple(
            Player(
                item["id"], item["code"], item["first_name"], item["second_name"], item["web_name"],
                item["team"], item["element_type"], item["now_cost"], item["total_points"], item["event_points"],
                _decimal(item.get("form")), _decimal(item.get("selected_by_percent")),
                _decimal(item.get("expected_goals_per_90")), _decimal(item.get("expected_assists_per_90")),
                item["status"], item.get("news", ""), item.get("chance_of_playing_next_round"),
            )
            for item in source["elements"]
        ),
    )


def map_fixture(item: dict[str, Any]) -> Fixture:
    return Fixture(
        item["id"], item["code"], item.get("event"), parse_datetime(item.get("kickoff_time")), item["finished"],
        item["started"], item["team_h"], item["team_a"], item.get("team_h_score"), item.get("team_a_score"),
        item["team_h_difficulty"], item["team_a_difficulty"],
    )


def map_manager(item: dict[str, Any]) -> Manager:
    return Manager(
        item["id"], item["player_first_name"], item["player_last_name"], item["name"], item["started_event"],
        item["current_event"], item["summary_overall_points"], item.get("summary_overall_rank"),
        item["summary_event_points"], item.get("summary_event_rank"), item["last_deadline_bank"],
        item["last_deadline_value"],
    )


def map_squad(source: dict[str, Any]) -> Squad:
    summary = source["entry_history"]
    return Squad(
        source.get("active_chip"),
        SquadSummary(
            summary["event"], summary["points"], summary["total_points"], summary.get("overall_rank"), summary["bank"],
            summary["value"], summary["event_transfers"], summary["event_transfers_cost"], summary["points_on_bench"],
        ),
        tuple(
            SquadPick(
                item["element"], item["position"], item["multiplier"], item["is_captain"], item["is_vice_captain"],
                item["element_type"], item.get("purchase_price"), item.get("selling_price"),
            )
            for item in source["picks"]
        ),
    )


def map_player_history(source: dict[str, Any]) -> PlayerHistory:
    fixtures = tuple(
        PlayerFixture(
            item["id"], item.get("event"), item["event_name"], parse_datetime(item.get("kickoff_time")), item["is_home"],
            item["team_h"], item["team_a"], item["difficulty"],
        )
        for item in source["fixtures"]
    )
    current = tuple(
        PlayerGameweekHistory(
            item["element"], item["fixture"], item["opponent_team"], item["round"], item["was_home"],
            cast(Any, parse_datetime(item["kickoff_time"])), item["total_points"], item["minutes"],
            item["goals_scored"], item["assists"], item["clean_sheets"], item["goals_conceded"], item["bonus"],
            item["bps"], item["value"], item["selected"], item["transfers_in"], item["transfers_out"],
        )
        for item in source["history"]
    )
    previous = tuple(
        PlayerSeasonHistory(
            item["season_name"], item["element_code"], item["start_cost"], item["end_cost"], item["total_points"],
            item["minutes"], item["goals_scored"], item["assists"], item["clean_sheets"], item["goals_conceded"],
            item["bonus"], item["bps"],
        )
        for item in source["history_past"]
    )
    return PlayerHistory(fixtures, current, previous)