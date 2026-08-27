import asyncio
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal
from itertools import combinations
from typing import Any

from app.domain import Player, PlayerHistory, iso_datetime, player_photo_url
from app.fpl import FplDataService

D = Decimal
HORIZONS = (1, 3, 5)
LEGAL_FORMATIONS = ((3, 4, 3), (3, 5, 2), (4, 3, 3), (4, 4, 2), (4, 5, 1), (5, 2, 3), (5, 3, 2), (5, 4, 1))


def rounded(value: Decimal) -> Decimal:
    return value.quantize(D("0.01"), rounding=ROUND_HALF_UP)


def number(value: Decimal) -> float:
    return float(rounded(value))


@dataclass(frozen=True, slots=True)
class Factor:
    factor: str
    contribution: Decimal
    explanation: str


@dataclass(frozen=True, slots=True)
class FixtureProjection:
    fixture_id: int
    gameweek: int
    projected_points: Decimal
    factors: tuple[Factor, ...]


@dataclass(frozen=True, slots=True)
class Horizon:
    gameweeks: int
    projected_points: Decimal
    factors: tuple[Factor, ...]
    fixtures: tuple[FixtureProjection, ...]


@dataclass(frozen=True, slots=True)
class Projection:
    player_id: int
    player_name: str
    calculated_at: datetime
    expected_minutes: Decimal
    horizons: tuple[Horizon, ...]


def calculate_projection(player: Player, history: PlayerHistory, now: datetime | None = None) -> Projection:
    recent = sorted(history.current_season, key=lambda item: item.gameweek, reverse=True)[:5]
    if recent:
        expected_minutes = min(D(90), max(D(0), sum((D(item.minutes) for item in recent), D(0)) / D(len(recent))))
    else:
        latest = next((season for season in reversed(history.previous_seasons) if season.minutes > 0), None)
        expected_minutes = D(0) if latest is None else min(D(90), max(D(0), D(latest.minutes) / D(38)))
    seasons = [season for season in history.previous_seasons if season.minutes > 0][-3:]
    historical_pp90 = D(0)
    if seasons:
        historical_pp90 = D(sum(item.points for item in seasons)) * D(90) / D(sum(item.minutes for item in seasons))

    fixture_projections: list[FixtureProjection] = []
    for fixture in sorted(
        (item for item in history.fixtures if item.gameweek is not None),
        key=lambda item: (item.gameweek or 0, item.kickoff or datetime.min.replace(tzinfo=UTC)),
    ):
        position = {1: D("1.8"), 2: D("1.7"), 3: D("1.5"), 4: D("1.4")}.get(player.position_id, D("1.5"))
        factors = [
            Factor("Position", position, f"Position {player.position_id} baseline."),
            Factor("Recent form", player.form * D("0.35"), f"Form {player.form:.1f} × 0.35."),
            Factor("Expected playing time", expected_minutes / D(90) * D("1.5"), f"Expected {expected_minutes:.0f} minutes from recent appearances."),
            Factor("Fixture difficulty", D(3 - fixture.difficulty) * D("0.4"), f"FDR {fixture.difficulty}; easier fixtures add points and harder fixtures subtract them."),
            Factor("Venue", D("0.25") if fixture.is_home else D("-0.1"), "Home fixture bonus." if fixture.is_home else "Away fixture adjustment."),
            Factor("Historical FPL points", historical_pp90 * D("0.25"), f"Historical {historical_pp90:.2f} points per 90 × 0.25."),
        ]
        subtotal = sum((factor.contribution for factor in factors), D(0))
        multiplier = {
            "a": D(1), "i": D(0), "s": D(0), "u": D(0),
        }.get(player.status, D(player.chance_of_playing_next_round or 50) / D(100) if player.status == "d" else D("0.75"))
        factors.append(Factor("Availability", subtotal * (multiplier - D(1)), f"Status '{player.status}' applies a {multiplier:.0%} availability multiplier."))
        projected = rounded(max(D(0), sum((factor.contribution for factor in factors), D(0))))
        rounded_factors = [replace(factor, contribution=rounded(factor.contribution)) for factor in factors]
        adjustment = projected - sum((factor.contribution for factor in rounded_factors), D(0))
        if adjustment:
            rounded_factors.append(Factor("Floor and rounding", adjustment, "Reconciles rounded factors and prevents negative projected points."))
        fixture_projections.append(FixtureProjection(fixture.id, fixture.gameweek or 0, projected, tuple(rounded_factors)))

    gameweeks = sorted({item.gameweek for item in fixture_projections})
    horizons: list[Horizon] = []
    for horizon in HORIZONS:
        selected_gameweeks = set(gameweeks[:horizon])
        selected = tuple(item for item in fixture_projections if item.gameweek in selected_gameweeks)
        grouped: dict[str, list[Factor]] = {}
        for projected_fixture in selected:
            for factor in projected_fixture.factors:
                grouped.setdefault(factor.factor, []).append(factor)
        horizon_factors = tuple(
            Factor(name, rounded(sum((item.contribution for item in items), D(0))), " ".join(dict.fromkeys(item.explanation for item in items)))
            for name, items in grouped.items()
        )
        horizons.append(Horizon(horizon, rounded(sum((item.projected_points for item in selected), D(0))), horizon_factors, selected))
    return Projection(player.id, player.display_name, now or datetime.now(UTC), expected_minutes, tuple(horizons))


def horizon(projection: Projection, gameweeks: int) -> Horizon:
    return next(item for item in projection.horizons if item.gameweeks == gameweeks)


@dataclass(frozen=True, slots=True)
class PlayerContext:
    player: Player
    team_name: str
    position: str
    projection: Projection
    current_squad_position: int = 0
    selling_price: int | None = None
    next_fixtures: tuple[str, ...] = ()


def captain_candidate(context: PlayerContext) -> dict[str, Any]:
    one = horizon(context.projection, 1)
    fixture_quality = sum((item.contribution for item in one.factors if item.factor in {"Fixture difficulty", "Venue"}), D(0))
    position_multiplier = {1: D("0.15"), 2: D("0.5"), 3: D(1), 4: D("1.1")}.get(context.player.position_id, D("0.75"))
    availability = {
        "a": D(0), "i": D(-10), "s": D(-10), "u": D(-10),
    }.get(context.player.status, -D(2) * (D(1) - D(context.player.chance_of_playing_next_round or 50) / D(100)) if context.player.status == "d" else D(-1))
    factors = (
        ("Projected points", one.projected_points * D("0.65"), f"{one.projected_points:.2f} projected points × 0.65."),
        ("Expected minutes", context.projection.expected_minutes / D(90) * D("1.5"), f"Expected {context.projection.expected_minutes:.0f} minutes."),
        ("Fixture quality", fixture_quality, "Fixture-difficulty and home/away contributions from the projection model."),
        ("Attacking potential", (context.player.expected_goals_per_90 * D(4) + context.player.expected_assists_per_90 * D(3)) * position_multiplier, f"xG/90 {context.player.expected_goals_per_90:.2f}, xA/90 {context.player.expected_assists_per_90:.2f}, position multiplier {position_multiplier:.2f}."),
        ("Availability", availability, f"Availability status '{context.player.status}'."),
    )
    mapped = [{"factor": name, "score": number(score), "explanation": explanation} for name, score, explanation in factors]
    return {
        "playerId": context.player.id, "playerName": context.player.display_name, "teamName": context.team_name,
        "position": context.position, "projectedPoints": number(one.projected_points),
        "rankingScore": number(sum((rounded(score) for _, score, _ in factors), D(0))), "factors": mapped,
        "photoUrl": player_photo_url(context.player.code),
    }


def lineup_player(context: PlayerContext) -> dict[str, Any]:
    one = horizon(context.projection, 1)
    minutes = min(D(90), max(D(0), context.projection.expected_minutes))
    score = one.projected_points * D("0.8") + minutes / D(90) * D(2)
    return {
        "playerId": context.player.id, "playerName": context.player.display_name, "teamName": context.team_name,
        "position": context.position, "projectedPoints": number(one.projected_points), "expectedMinutes": number(minutes),
        "rankingScore": number(score), "currentSquadPosition": context.current_squad_position,
        "recommendedSquadPosition": 0,
        "projections": [{"gameweeks": item.gameweeks, "projectedPoints": number(item.projected_points)} for item in context.projection.horizons],
        "photoUrl": player_photo_url(context.player.code),
    }


def optimize_lineup(contexts: list[PlayerContext]) -> tuple[str, list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    players = [lineup_player(context) for context in contexts]
    if len(players) != 15 or len({item["playerId"] for item in players}) != 15:
        raise RuntimeError("A valid FPL squad must contain 15 distinct players.")
    expected = {"GKP": 2, "DEF": 5, "MID": 5, "FWD": 3}
    if any(sum(item["position"] == position for item in players) != count for position, count in expected.items()):
        raise RuntimeError("The squad does not have the required FPL position allocation.")

    def take(position: str, count: int) -> list[dict[str, Any]]:
        return sorted((item for item in players if item["position"] == position), key=lambda item: (-item["rankingScore"], -item["projectedPoints"], -item["expectedMinutes"], item["playerId"]))[:count]

    options = []
    for defenders, midfielders, forwards in LEGAL_FORMATIONS:
        selected = take("GKP", 1) + take("DEF", defenders) + take("MID", midfielders) + take("FWD", forwards)
        options.append((sum(item["rankingScore"] for item in selected), f"{defenders}-{midfielders}-{forwards}", selected))
    _, formation, selected = sorted(options, key=lambda item: (-item[0], item[1]))[0]
    selected_ids = {item["playerId"] for item in selected}
    position_order = {"GKP": 0, "DEF": 1, "MID": 2, "FWD": 3}
    starting = sorted(selected, key=lambda item: (position_order[item["position"]], -item["rankingScore"], item["playerId"]))
    bench = sorted((item for item in players if item["playerId"] not in selected_ids), key=lambda item: (item["position"] == "GKP", -item["rankingScore"], item["playerId"]))
    for index, item in enumerate(starting + bench, 1):
        item["recommendedSquadPosition"] = index
    changes = [{
        "playerId": item["playerId"], "playerName": item["playerName"],
        "changeType": "Moved to starting XI" if item["recommendedSquadPosition"] <= 11 else "Moved to bench",
        "currentSquadPosition": item["currentSquadPosition"], "recommendedSquadPosition": item["recommendedSquadPosition"],
    } for item in sorted(players, key=lambda value: value["recommendedSquadPosition"])
        if (item["currentSquadPosition"] <= 11) != (item["recommendedSquadPosition"] <= 11)]
    return formation, starting, bench, changes


def _fixture_quality(context: PlayerContext) -> Decimal:
    return sum((factor.contribution for item in context.projection.horizons for factor in item.factors if factor.factor in {"Fixture difficulty", "Venue"}), D(0))


def transfer_recommendation(player_out: PlayerContext, player_in: PlayerContext) -> dict[str, Any]:
    gains = []
    for gameweeks in HORIZONS:
        out_points = horizon(player_out.projection, gameweeks).projected_points
        in_points = horizon(player_in.projection, gameweeks).projected_points
        gains.append({"gameweeks": gameweeks, "playerOutPoints": number(out_points), "playerInPoints": number(in_points), "expectedPointGain": number(in_points - out_points)})
    gain_by_horizon = {item["gameweeks"]: D(str(item["expectedPointGain"])) for item in gains}
    weighted = rounded(gain_by_horizon[1] * D("0.5") + gain_by_horizon[3] / D(3) * D("0.3") + gain_by_horizon[5] / D(5) * D("0.2"))
    availability = D(1) if player_in.player.status == "a" else D(player_in.player.chance_of_playing_next_round or 50) / D(100)
    positives = sum(item["expectedPointGain"] > 0 for item in gains)
    coverage = sum(bool(horizon(player_in.projection, gameweeks).fixtures) for gameweeks in HORIZONS)
    base_confidence = min(D(100), max(D(0), player_in.projection.expected_minutes / D(90) * D(45) + availability * D(25) + D(positives) / D(3) * D(20) + D(coverage) / D(3) * D(10)))
    confidence = rounded(base_confidence * min(D(1), max(D(0), player_in.projection.expected_minutes / D(60))))
    selling_price = player_out.selling_price or player_out.player.price

    def mapped(context: PlayerContext, price: int) -> dict[str, Any]:
        return {"playerId": context.player.id, "playerName": context.player.display_name, "teamName": context.team_name,
                "position": context.position, "price": price / 10, "status": context.player.status,
                "expectedMinutes": number(context.projection.expected_minutes), "nextFixtures": list(context.next_fixtures),
                "photoUrl": player_photo_url(context.player.code)}

    price_difference = D(player_in.player.price - selling_price) / D(10)
    fixture_delta = rounded(_fixture_quality(player_in) - _fixture_quality(player_out))
    explanations = [
        {"factor": "Expected points", "score": number(weighted), "explanation": f"Weighted improvement across 1, 3, and 5 gameweeks: {weighted:+.2f} points per gameweek."},
        {"factor": "Fixture quality", "score": number(fixture_delta), "explanation": f"Fixture and venue contribution changes by {fixture_delta:+.2f} across the projection horizons."},
        {"factor": "Expected minutes", "score": number(player_in.projection.expected_minutes - player_out.projection.expected_minutes), "explanation": f"Expected minutes change from {player_out.projection.expected_minutes:.0f} to {player_in.projection.expected_minutes:.0f}."},
        {"factor": "Availability", "score": number(availability), "explanation": "Incoming player is currently available." if player_in.player.status == "a" else f"Incoming player is doubtful with {player_in.player.chance_of_playing_next_round or 50}% chance of playing."},
        {"factor": "Budget", "score": number(-price_difference), "explanation": f"Uses £{player_in.player.price / 10:.1f}m of £{selling_price / 10:.1f}m sale value plus bank."},
    ]
    return {"playerOut": mapped(player_out, selling_price), "playerIn": mapped(player_in, player_in.player.price),
            "priceDifference": number(price_difference), "expectedPointGains": gains, "weightedGain": number(weighted),
            "confidenceScore": number(confidence), "explanations": explanations}


def validate_fpl_squad(squad: list[PlayerContext], bank: int, limit: int) -> None:
    if len(squad) != 15 or len({context.player.id for context in squad}) != 15:
        raise RuntimeError("A valid FPL squad must contain 15 distinct players.")
    if any(sum(context.player.team_id == team_id for context in squad) > 3 for team_id in {item.player.team_id for item in squad}):
        raise RuntimeError("The current squad exceeds the three-player club limit.")
    expected_positions = {1: 2, 2: 5, 3: 5, 4: 3}
    if any(sum(context.player.position_id == position_id for context in squad) != count for position_id, count in expected_positions.items()):
        raise RuntimeError("The squad does not have the required FPL position allocation.")
    if bank < 0:
        raise ValueError("Bank must not be negative.")
    if limit <= 0:
        raise ValueError("Limit must be positive.")


def rank_transfers(squad: list[PlayerContext], market: list[PlayerContext], bank: int, limit: int, player_out_id: int | None = None) -> list[dict[str, Any]]:
    validate_fpl_squad(squad, bank, limit)
    owned = {item.player.id for item in squad}
    club_counts = {team_id: sum(item.player.team_id == team_id for item in squad) for team_id in {item.player.team_id for item in squad}}
    results = []
    for player_out in squad:
        if player_out_id is not None and player_out.player.id != player_out_id:
            continue
        for player_in in market:
            affordable = player_in.player.price <= (player_out.selling_price or player_out.player.price) + bank
            incoming_club = club_counts.get(player_in.player.team_id, 0) - (player_out.player.team_id == player_in.player.team_id) + 1
            if player_in.player.id in owned or player_in.player.position_id != player_out.player.position_id or player_in.player.status not in {"a", "d"} or player_in.projection.expected_minutes < 30 or not affordable or incoming_club > 3:
                continue
            recommendation = transfer_recommendation(player_out, player_in)
            if recommendation["weightedGain"] > 0:
                results.append(recommendation)
    return sorted(results, key=lambda item: (-item["weightedGain"], -item["confidenceScore"], -next(gain["expectedPointGain"] for gain in item["expectedPointGains"] if gain["gameweeks"] == 5), item["playerIn"]["playerId"], item["playerOut"]["playerId"]))[:limit]


def rank_combinations(squad: list[PlayerContext], market: list[PlayerContext], bank: int, limit: int) -> list[dict[str, Any]]:
    validate_fpl_squad(squad, bank, limit)
    singles = rank_transfers(squad, market, 10000, 10000)
    club_counts = {team_id: sum(item.player.team_id == team_id for item in squad) for team_id in {item.player.team_id for item in squad}}
    player_teams = {item.player.id: item.player.team_id for item in squad + market}
    selling_tenths = {item.player.id: item.selling_price or item.player.price for item in squad}
    buying_tenths = {item.player.id: item.player.price for item in market}
    unique: dict[str, dict[str, Any]] = {}
    for first, second in combinations(singles, 2):
        outs = (first["playerOut"]["playerId"], second["playerOut"]["playerId"])
        ins = (first["playerIn"]["playerId"], second["playerIn"]["playerId"])
        if len(set(outs)) < 2 or len(set(ins)) < 2 or sum(buying_tenths[item] for item in ins) > sum(selling_tenths[item] for item in outs) + bank:
            continue
        counts = dict(club_counts)
        for item in outs:
            counts[player_teams[item]] -= 1
        for item in ins:
            counts[player_teams[item]] = counts.get(player_teams[item], 0) + 1
        if any(value > 3 for value in counts.values()):
            continue
        transfers = sorted((first, second), key=lambda item: (item["playerOut"]["playerId"], item["playerIn"]["playerId"]))
        gains = []
        for gameweeks in (3, 5):
            rows = [next(row for row in item["expectedPointGains"] if row["gameweeks"] == gameweeks) for item in transfers]
            out_points = sum((D(str(row["playerOutPoints"])) for row in rows), D(0))
            in_points = sum((D(str(row["playerInPoints"])) for row in rows), D(0))
            gains.append({"gameweeks": gameweeks, "playerOutPoints": number(out_points), "playerInPoints": number(in_points), "expectedPointGain": number(in_points - out_points)})
        weighted = rounded(D(str(gains[0]["expectedPointGain"])) / D(3) * D("0.6") + D(str(gains[1]["expectedPointGain"])) / D(5) * D("0.4"))
        if weighted <= 0:
            continue
        price_difference = sum((D(str(item["priceDifference"])) for item in transfers), D(0))
        confidence = sum((D(str(item["confidenceScore"])) for item in transfers), D(0)) / D(2)
        key = f"{':'.join(map(str, sorted(outs)))}>{':'.join(map(str, sorted(ins)))}"
        unique[key] = {"transfers": transfers, "totalPriceDifference": number(price_difference), "expectedPointGains": gains,
                       "weightedGain": number(weighted), "confidenceScore": number(confidence),
                       "explanations": [{"factor": "Expected points", "score": number(weighted), "explanation": f"Combined weighted improvement over 3 and 5 gameweeks: {weighted:+.2f} points per gameweek."},
                                        {"factor": "Squad constraints", "score": 1.0, "explanation": "Both replacements preserve position counts and the three-player club limit."}]}
    return sorted(unique.values(), key=lambda item: (-item["weightedGain"], -item["confidenceScore"], -next(row["expectedPointGain"] for row in item["expectedPointGains"] if row["gameweeks"] == 5), min(transfer["playerIn"]["playerId"] for transfer in item["transfers"])))[:limit]


class RecommendationService:
    def __init__(self, fpl: FplDataService) -> None:
        self._fpl = fpl

    async def _contexts(self, team_id: int, include_market: bool = False) -> tuple[Any, Any, Any, list[PlayerContext], list[PlayerContext]]:
        manager, bootstrap = await asyncio.gather(self._fpl.manager(team_id), self._fpl.bootstrap())
        squad = await self._fpl.squad(team_id, manager.current_gameweek)
        players = {item.id: item for item in bootstrap.players}
        teams = {item.id: item for item in bootstrap.teams}
        positions = {item.id: item for item in bootstrap.player_positions}
        owned = {item.player_id for item in squad.picks}
        selected = [players[item.player_id] for item in squad.picks]
        if include_market:
            sale_values = sorted((item.selling_price or players[item.player_id].price for item in squad.picks), reverse=True)[:2]
            market_available = [item for item in bootstrap.players if item.id not in owned and item.status in {"a", "d"}]
            minimum_price = min((item.price for item in market_available), default=0)
            maximum = manager.bank + sum(sale_values) - minimum_price
            selected += [item for item in market_available if item.price <= maximum and any(owned_player.position_id == item.position_id for owned_player in selected)]
        semaphore = asyncio.Semaphore(8)

        async def context(player: Player) -> PlayerContext:
            async with semaphore:
                history = await self._fpl.player_history(player.id)
            fixtures = []
            for fixture in sorted((item for item in history.fixtures if item.gameweek is not None), key=lambda item: (item.gameweek or 0, item.kickoff or datetime.min.replace(tzinfo=UTC)))[:3]:
                opponent = teams[fixture.away_team_id if fixture.is_home else fixture.home_team_id].short_name
                fixtures.append(f"{opponent} ({'H' if fixture.is_home else 'A'})")
            return PlayerContext(player, teams[player.team_id].name, positions[player.position_id].short_name, calculate_projection(player, history), next_fixtures=tuple(fixtures))

        all_contexts = await asyncio.gather(*(context(player) for player in dict.fromkeys(selected)))
        by_id = {item.player.id: item for item in all_contexts}
        squad_contexts = [replace(by_id[pick.player_id], current_squad_position=pick.position, selling_price=pick.selling_price) for pick in squad.picks]
        market_contexts = [item for item in all_contexts if item.player.id not in owned]
        return manager, bootstrap, squad, squad_contexts, market_contexts

    async def captain(self, team_id: int) -> dict[str, Any]:
        manager, _, _, squad, _ = await self._contexts(team_id)
        ranked = sorted((captain_candidate(item) for item in squad if item.current_squad_position <= 11), key=lambda item: (-item["rankingScore"], -item["projectedPoints"], item["playerId"]))
        return {"teamId": team_id, "gameweek": manager.current_gameweek, "calculatedAt": iso_datetime(datetime.now(UTC)), "bestCaptain": ranked[0], "viceCaptain": ranked[1], "alternatives": ranked[2:5]}

    async def lineup(self, team_id: int) -> dict[str, Any]:
        manager, _, _, squad, _ = await self._contexts(team_id)
        formation, starting, bench, changes = optimize_lineup(squad)
        return {"teamId": team_id, "gameweek": manager.current_gameweek, "calculatedAt": iso_datetime(datetime.now(UTC)), "formation": formation, "startingXi": starting, "bench": bench, "changes": changes}

    async def transfers(self, team_id: int, limit: int) -> dict[str, Any]:
        manager, _, _, squad, market = await self._contexts(team_id, include_market=True)
        return {"teamId": team_id, "gameweek": manager.current_gameweek, "calculatedAt": iso_datetime(datetime.now(UTC)), "bank": manager.bank / 10,
                "recommendations": rank_transfers(squad, market, manager.bank, limit), "combinations": rank_combinations(squad, market, manager.bank, limit)}

    async def replacements(self, team_id: int, player_out_id: int, limit: int) -> tuple[list[dict[str, Any]], list[PlayerContext], Any]:
        manager, _, _, squad, market = await self._contexts(team_id, include_market=True)
        return rank_transfers(squad, market, manager.bank, limit, player_out_id), squad, manager