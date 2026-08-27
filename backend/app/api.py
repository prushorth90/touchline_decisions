import asyncio
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.dependencies import FplServiceDependency
from app.domain import BootstrapData, Fixture, iso_datetime, player_photo_url
from app.schemas import (
    FplFixtureResponse,
    FplPlayerResponse,
    FplSquadResponse,
    FplTeamResponse,
    LeagueStandingsResponse,
)

router = APIRouter(prefix="/api/fpl", tags=["FPL"])


def problem(status: int, title: str, detail: str | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"status": status, "title": title}
    if detail is not None:
        payload["detail"] = detail
    return payload


def _require_team_id(team_id: int) -> None:
    if team_id <= 0:
        raise HTTPException(
            status_code=400,
            detail=problem(400, "Invalid FPL team ID.", "The team ID must be a positive integer."),
        )


@router.get("/team/{team_id}", response_model=FplTeamResponse)
async def get_team(team_id: int, service: FplServiceDependency) -> dict[str, Any]:
    _require_team_id(team_id)
    manager, bootstrap = await asyncio.gather(service.manager(team_id), service.bootstrap())
    next_gameweek = next((gameweek for gameweek in bootstrap.gameweeks if gameweek.is_next), None)
    return {
        "id": manager.id,
        "managerName": f"{manager.first_name} {manager.last_name}".strip(),
        "teamName": manager.team_name,
        "startedGameweek": manager.started_gameweek,
        "currentGameweek": manager.current_gameweek,
        "overallPoints": manager.overall_points,
        "overallRank": manager.overall_rank,
        "gameweekPoints": manager.gameweek_points,
        "gameweekRank": manager.gameweek_rank,
        "bank": manager.bank / 10,
        "teamValue": manager.team_value / 10,
        "freeTransfers": None,
        "nextGameweek": None if next_gameweek is None else {
            "id": next_gameweek.id,
            "name": next_gameweek.name,
            "deadline": iso_datetime(next_gameweek.deadline),
        },
    }


@router.get("/team/{team_id}/squad", response_model=FplSquadResponse)
async def get_squad(team_id: int, service: FplServiceDependency) -> dict[str, Any]:
    _require_team_id(team_id)
    manager = await service.manager(team_id)
    if manager.current_gameweek <= 0:
        raise HTTPException(
            status_code=404,
            detail=problem(404, "Squad data is not available.", "The FPL team does not have a current gameweek squad."),
        )
    squad, bootstrap, fixtures = await asyncio.gather(
        service.squad(team_id, manager.current_gameweek), service.bootstrap(), service.fixtures()
    )
    players = {player.id: player for player in bootstrap.players}
    teams = {team.id: team for team in bootstrap.teams}
    positions = {position.id: position for position in bootstrap.player_positions}
    next_gameweek = next((gameweek.id for gameweek in bootstrap.gameweeks if gameweek.is_next), None)
    picks: list[dict[str, Any]] = []
    for pick in squad.picks:
        player = players.get(pick.player_id)
        fixture = next((item for item in fixtures if item.gameweek == next_gameweek and player is not None and player.team_id in (item.home_team_id, item.away_team_id)), None)
        opponent = None
        if fixture is not None and player is not None:
            opponent_team_id = fixture.away_team_id if fixture.home_team_id == player.team_id else fixture.home_team_id
            venue = "H" if fixture.home_team_id == player.team_id else "A"
            opponent = f"{teams[opponent_team_id].short_name} ({venue})"
        picks.append({
            "playerId": pick.player_id,
            "displayName": player.display_name if player else "Unknown player",
            "teamName": teams[player.team_id].name if player and player.team_id in teams else "Unknown team",
            "positionName": positions[player.position_id].short_name if player and player.position_id in positions else "Unknown",
            "price": (player.price if player else 0) / 10,
            "squadPosition": pick.position,
            "multiplier": pick.multiplier,
            "isCaptain": pick.is_captain,
            "isViceCaptain": pick.is_vice_captain,
            "gameweekPoints": player.gameweek_points if player else 0,
            "nextOpponent": opponent,
            "photoUrl": player_photo_url(player.code if player else 0),
        })
    return {
        "teamId": manager.id,
        "teamName": manager.team_name,
        "gameweek": squad.summary.gameweek,
        "activeChip": squad.active_chip,
        "summary": {
            "points": squad.summary.points,
            "totalPoints": squad.summary.total_points,
            "overallRank": squad.summary.overall_rank,
            "bank": squad.summary.bank / 10,
            "teamValue": squad.summary.team_value / 10,
            "transfers": squad.summary.transfers,
            "transferCost": squad.summary.transfer_cost,
            "benchPoints": squad.summary.bench_points,
        },
        "picks": picks,
    }


def _player_response(player: Any, bootstrap: BootstrapData, fixtures: tuple[Fixture, ...]) -> dict[str, Any]:
    teams = {team.id: team for team in bootstrap.teams}
    positions = {position.id: position for position in bootstrap.player_positions}
    next_gameweek = next((gameweek.id for gameweek in bootstrap.gameweeks if gameweek.is_next), None)
    fixture = next((item for item in fixtures if item.gameweek == next_gameweek and player.team_id in (item.home_team_id, item.away_team_id)), None)
    opponent = None
    if fixture is not None:
        opponent_id = fixture.away_team_id if fixture.home_team_id == player.team_id else fixture.home_team_id
        opponent = f"{teams[opponent_id].short_name} ({'H' if fixture.home_team_id == player.team_id else 'A'})"
    return {
        "id": player.id, "code": player.code, "firstName": player.first_name, "lastName": player.last_name,
        "displayName": player.display_name, "teamId": player.team_id, "teamName": teams[player.team_id].name,
        "positionId": player.position_id, "position": positions[player.position_id].short_name, "price": player.price / 10,
        "totalPoints": player.total_points, "gameweekPoints": player.gameweek_points, "form": float(player.form),
        "ownershipPercentage": float(player.ownership_percentage), "status": player.status, "news": player.news,
        "chanceOfPlayingNextRound": player.chance_of_playing_next_round, "upcomingFixture": opponent,
        "photoUrl": player_photo_url(player.code),
    }


@router.get("/players", response_model=list[FplPlayerResponse])
async def get_players(service: FplServiceDependency) -> list[dict[str, Any]]:
    bootstrap, fixtures = await asyncio.gather(service.bootstrap(), service.fixtures())
    return [_player_response(player, bootstrap, fixtures) for player in bootstrap.players]


@router.get("/fixtures", response_model=list[FplFixtureResponse])
async def get_fixtures(service: FplServiceDependency) -> list[dict[str, Any]]:
    fixtures, bootstrap = await asyncio.gather(service.fixtures(), service.bootstrap())
    teams = {team.id: team for team in bootstrap.teams}
    return [{
        "id": fixture.id, "code": fixture.code, "gameweek": fixture.gameweek, "kickoff": iso_datetime(fixture.kickoff),
        "finished": fixture.finished, "started": fixture.started, "homeTeamId": fixture.home_team_id,
        "homeTeam": teams[fixture.home_team_id].name, "awayTeamId": fixture.away_team_id,
        "awayTeam": teams[fixture.away_team_id].name, "homeScore": fixture.home_score, "awayScore": fixture.away_score,
        "homeDifficulty": fixture.home_difficulty, "awayDifficulty": fixture.away_difficulty,
    } for fixture in fixtures]


@router.get("/leagues/{league_id}/standings", response_model=LeagueStandingsResponse)
async def get_league_standings(
    league_id: int,
    service: FplServiceDependency,
    page: int = Query(1, ge=1),
) -> dict[str, Any]:
    if league_id <= 0:
        raise HTTPException(400, problem(400, "Invalid FPL league ID.", "The league ID must be a positive integer."))
    return await service.league_standings(league_id, page)