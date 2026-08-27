import asyncio
import re
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from app.domain import BootstrapData, iso_datetime, player_photo_url
from app.fpl import FplDataService
from app.recommendations import RecommendationService, number

ProgressCallback = Callable[[str, str], Awaitable[None]]

AGENTS = (
    ("fpl-coach.agent.md", "FplCoachAgent", ("task",)),
    ("injury.agent.md", "InjuryAgent", ("get_player_availability",)),
    ("fixture.agent.md", "FixtureAgent", ("get_upcoming_fixtures",)),
    ("transfer.agent.md", "TransferAgent", ("get_transfer_candidates",)),
)


def validate_agent_definitions(directory: str) -> None:
    root = Path(directory)
    for filename, expected_name, expected_tools in AGENTS:
        path = root / filename
        if not path.is_file():
            raise RuntimeError(f"Required Markdown agent file '{filename}' was not found in '{directory}'.")
        content = path.read_text(encoding="utf-8").replace("\r\n", "\n")
        match = re.match(r"\A---\n(.*?)\n---\n(.+)\Z", content, re.DOTALL)
        if match is None:
            raise RuntimeError(f"Agent file '{filename}' must contain YAML frontmatter and Markdown instructions.")
        values: dict[str, str] = {}
        for line in match.group(1).splitlines():
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            key, value = key.strip().lower(), value.strip().strip("'\"")
            if key in values:
                raise RuntimeError(f"Agent file '{filename}' declares '{key}' more than once.")
            values[key] = value
        if values.get("name") != expected_name:
            raise RuntimeError(f"Agent file '{filename}' must declare name '{expected_name}'.")
        if not values.get("description"):
            raise RuntimeError(f"Agent file '{filename}' must declare a description.")
        tools_value = values.get("tools", "")
        tools = tuple(item.strip().strip("'\"") for item in tools_value[1:-1].split(",") if item.strip()) if tools_value.startswith("[") and tools_value.endswith("]") else ()
        if tools != expected_tools:
            raise RuntimeError(f"Agent file '{filename}' must use exactly these tools: {', '.join(expected_tools)}.")
        if not match.group(2).strip():
            raise RuntimeError(f"Agent file '{filename}' must contain Markdown instructions.")


def recommendation_type(message: str) -> str:
    lowered = message.lower()
    if any(value in lowered for value in ("injur", "doubt", "available")):
        return "Availability"
    if any(value in lowered for value in ("fixture", "schedule", "opponent")):
        return "Fixture"
    if any(value in lowered for value in ("bench", "hold", "start", "what should")):
        return "Recommendation"
    if any(value in lowered for value in ("sell", "transfer out")):
        return "Transfer"
    if any(value in lowered for value in ("replace", "who")):
        return "Replacement"
    return "General"


def requested_gameweeks(message: str) -> tuple[int, int]:
    lowered = message.lower()
    fixture_gameweeks = next((value for value in range(1, 6) if any(token in lowered for token in (f"{value} fixture", f"{value} gameweek", f"next {value}"))), 3)
    return fixture_gameweeks, 5 if fixture_gameweeks == 3 and "3" not in message else fixture_gameweeks


def resolve_player_name(message: str, squad: list[dict[str, Any]]) -> dict[str, Any] | None:
    normalized = message.casefold()
    candidates = sorted(squad, key=lambda item: len(str(item["playerName"])), reverse=True)
    return next(
        (
            player
            for player in candidates
            if any(
                name and str(name).casefold() in normalized
                for name in (player["playerName"], player["firstName"], player["lastName"])
            )
        ),
        None,
    )


def availability(player: dict[str, Any]) -> dict[str, Any]:
    status = player["status"]
    description, is_available, confidence = {
        "a": ("Available", True, 95), "d": ("Doubtful", False, 85 if player["chanceOfPlayingNextRound"] is not None else 70),
        "i": ("Injured", False, 95), "s": ("Suspended", False, 95), "u": ("Unavailable", False, 95),
        "n": ("Not in squad", False, 90),
    }.get(status, ("Unknown", False, 40))
    expected_match = re.search(r"Expected back\s+([^.;]+)", player["news"], re.IGNORECASE)
    return {
        "player": {key: player[key] for key in ("playerId", "playerName", "teamName", "position")},
        "status": status, "statusDescription": description, "isAvailable": is_available,
        "chanceOfPlayingNextRound": player["chanceOfPlayingNextRound"],
        "expectedReturn": expected_match.group(1).strip() if expected_match else None,
        "confidence": confidence, "evidence": player["news"] or "No current FPL news note.",
        "source": "Official FPL bootstrap data",
    }


class CoachService:
    def __init__(self, fpl: FplDataService, recommendations: RecommendationService) -> None:
        self._fpl = fpl
        self._recommendations = recommendations

    async def _progress(self, callback: ProgressCallback | None, code: str, message: str) -> None:
        if callback is not None:
            await callback(code, message)

    async def _context(self, team_id: int) -> tuple[Any, BootstrapData, list[dict[str, Any]]]:
        manager, bootstrap = await asyncio.gather(self._fpl.manager(team_id), self._fpl.bootstrap())
        squad = await self._fpl.squad(team_id, manager.current_gameweek)
        if len(squad.picks) != 15 or len({item.player_id for item in squad.picks}) != 15:
            raise RuntimeError("The connected FPL team did not return a valid 15-player squad.")
        players = {item.id: item for item in bootstrap.players}
        teams = {item.id: item for item in bootstrap.teams}
        positions = {item.id: item for item in bootstrap.player_positions}
        context = []
        for pick in squad.picks:
            player = players[pick.player_id]
            context.append({
                "playerId": player.id, "playerName": player.display_name, "firstName": player.first_name,
                "lastName": player.last_name, "teamName": teams[player.team_id].name,
                "position": positions[player.position_id].short_name, "price": player.price / 10,
                "status": player.status, "news": player.news,
                "chanceOfPlayingNextRound": player.chance_of_playing_next_round,
                "isStarter": pick.position <= 11, "isCaptain": pick.is_captain, "isViceCaptain": pick.is_vice_captain,
                "code": player.code,
            })
        return manager, bootstrap, context

    async def fixtures(self, player: dict[str, Any], gameweeks: int) -> dict[str, Any]:
        history, bootstrap = await asyncio.gather(self._fpl.player_history(player["playerId"]), self._fpl.bootstrap())
        selected_gameweeks = sorted({item.gameweek for item in history.fixtures if item.gameweek is not None})[:max(1, min(5, gameweeks))]
        teams = {item.id: item for item in bootstrap.teams}
        rows: list[dict[str, Any]] = []
        for fixture in sorted((item for item in history.fixtures if item.gameweek in selected_gameweeks), key=lambda item: (item.gameweek or 0, item.kickoff or datetime.min.replace(tzinfo=UTC))):
            rows.append({
                "fixtureId": fixture.id, "gameweek": fixture.gameweek, "gameweekName": fixture.gameweek_name,
                "kickoff": iso_datetime(fixture.kickoff), "opponent": teams[fixture.away_team_id if fixture.is_home else fixture.home_team_id].name,
                "isHome": fixture.is_home, "venue": "Home" if fixture.is_home else "Away", "difficulty": fixture.difficulty,
            })
        average = None if not rows else Decimal(sum(int(item["difficulty"]) for item in rows)) / Decimal(len(rows))
        rating = "Unknown" if average is None else "Favorable" if average <= Decimal("2.5") else "Mixed" if average <= Decimal("3.5") else "Difficult"
        average_value = None if average is None else number(average)
        explanation = f"No published upcoming fixtures were available for {player['playerName']}." if average is None else f"{player['playerName']} has a {rating.lower()} upcoming schedule based on an average FPL difficulty of {average:.2f}."
        return {
            "player": {key: player[key] for key in ("playerId", "playerName", "teamName", "position")},
            "requestedGameweeks": max(1, min(5, gameweeks)), "fixtures": rows, "averageDifficulty": average_value,
            "aggregateScore": None if average is None else number(Decimal(6) - average), "scheduleRating": rating,
            "explanation": explanation, "source": "Official FPL element-summary and bootstrap data",
        }

    async def transfers(self, team_id: int, player: dict[str, Any], limit: int) -> dict[str, Any]:
        recommendations, squad, manager = await self._recommendations.replacements(team_id, player["playerId"], max(1, min(5, limit)))
        outgoing = next(item for item in squad if item.player.id == player["playerId"])
        sale_price = (outgoing.selling_price or outgoing.player.price) / 10
        candidates = []
        for rank, item in enumerate(recommendations, 1):
            gain = next(row for row in item["expectedPointGains"] if row["gameweeks"] == 5)
            reason = next((row["explanation"] for row in item["explanations"] if row["factor"] in {"Expected points", "Fixture quality", "Budget"}), "Higher deterministic projected points over the next five gameweeks.")
            incoming = item["playerIn"]
            candidates.append({
                "rank": rank, "player": {key: incoming[key] for key in ("playerId", "playerName", "teamName", "position", "price")},
                "priceDifference": item["priceDifference"], "playerOutProjectedPoints": gain["playerOutPoints"],
                "candidateProjectedPoints": gain["playerInPoints"], "projectedPointDifference": gain["expectedPointGain"],
                "confidence": item["confidenceScore"], "reason": reason,
            })
        return {
            "playerOut": {"playerId": player["playerId"], "playerName": player["playerName"], "teamName": player["teamName"], "position": player["position"], "price": sale_price},
            "bank": manager.bank / 10, "maximumPurchasePrice": sale_price + manager.bank / 10,
            "projectionGameweeks": 5, "candidates": candidates,
            "source": "Touchline transfer recommendation engine; FPL budget, position, ownership, availability, expected-minutes, and three-player club rules enforced in Python",
        }

    def evaluate(self, availability_result: dict[str, Any], fixture_result: dict[str, Any], transfer_result: dict[str, Any]) -> dict[str, Any]:
        best = next(iter(transfer_result["candidates"]), None)
        impact = best["projectedPointDifference"] if best else 0
        unavailable = availability_result["status"] in {"i", "s", "u", "n"}
        doubtful = availability_result["status"] == "d" or (availability_result["chanceOfPlayingNextRound"] is not None and availability_result["chanceOfPlayingNextRound"] < 75)
        difficult = fixture_result["scheduleRating"] == "Difficult"
        action = "Transfer" if best and impact >= 3 and (unavailable or doubtful or difficult or impact >= 5) else "Bench" if unavailable or doubtful or difficult else "Hold"
        transfer_confidence = best["confidence"] if best else 80
        confidence = number(Decimal(str(availability_result["confidence"])) * Decimal("0.4") + Decimal(95 if fixture_result["fixtures"] else 50) * Decimal("0.25") + Decimal(str(transfer_confidence)) * Decimal("0.35"))
        name = availability_result["player"]["playerName"]
        if action == "Transfer":
            assert best is not None
            reason = f"Transfer to {best['player']['playerName']}: the legal replacement projects {impact:+.2f} points better over 5 gameweeks."
        elif unavailable:
            reason = f"Bench {name}: verified status is {availability_result['statusDescription']}, and no legal replacement clears the 3.00-point transfer threshold."
        elif doubtful:
            reason = f"Bench {name}: availability is uncertain, and no legal replacement clears the 3.00-point transfer threshold."
        elif difficult:
            reason = f"Bench {name}: the upcoming schedule is difficult, and no legal replacement clears the 3.00-point transfer threshold."
        else:
            reason = f"Hold {name}: availability and fixtures do not justify a transfer, and no legal candidate provides a sufficient projected gain."
        return {"action": action, "projectedImpact": impact if action == "Transfer" else 0, "projectionGameweeks": 5,
                "confidence": confidence, "reason": reason, "recommendedReplacement": best if action == "Transfer" else None,
                "availability": availability_result, "fixtures": fixture_result, "transfers": transfer_result,
                "source": "Deterministic Python recommendation policy using verified availability, fixtures, projections, budget, position, ownership, and club constraints"}

    async def reply(self, team_id: int, message: str, callback: ProgressCallback | None = None) -> dict[str, Any]:
        await self._progress(callback, "loading-squad", "Loading squad context")
        _, _, squad = await self._context(team_id)
        matched = resolve_player_name(message, squad)
        kind = recommendation_type(message)
        fixture_gameweeks, decision_gameweeks = requested_gameweeks(message)
        availability_result = fixture_result = transfer_result = recommendation = None
        if matched is not None and kind == "Availability":
            await self._progress(callback, "checking-availability", "Checking player availability")
            availability_result = availability(matched)
            risky = availability_result["status"] in {"d", "i", "s", "u", "n"} or (availability_result["chanceOfPlayingNextRound"] is not None and availability_result["chanceOfPlayingNextRound"] < 75)
            if risky:
                await self._progress(callback, "analyzing-fixtures", "Analyzing upcoming fixtures")
                await self._progress(callback, "comparing-replacements", "Comparing replacements")
                fixture_analysis, transfer_analysis = await asyncio.gather(self.fixtures(matched, decision_gameweeks), self.transfers(team_id, matched, 3))
                fixture_result, transfer_result = fixture_analysis, transfer_analysis
                recommendation = self.evaluate(availability_result, fixture_result, transfer_result)
        elif matched is not None and kind in {"Recommendation", "Transfer", "Replacement"}:
            await self._progress(callback, "checking-availability", "Checking player availability")
            await self._progress(callback, "analyzing-fixtures", "Analyzing upcoming fixtures")
            await self._progress(callback, "comparing-replacements", "Comparing replacements")
            availability_result = availability(matched)
            fixture_analysis, transfer_analysis = await asyncio.gather(self.fixtures(matched, decision_gameweeks), self.transfers(team_id, matched, 3))
            fixture_result, transfer_result = fixture_analysis, transfer_analysis
            recommendation = self.evaluate(availability_result, fixture_result, transfer_result)
        elif matched is not None and kind == "Fixture":
            await self._progress(callback, "analyzing-fixtures", "Analyzing upcoming fixtures")
            fixture_result = await self.fixtures(matched, fixture_gameweeks)
        await self._progress(callback, "preparing-answer", "Preparing recommendation")
        if recommendation:
            assert availability_result is not None
            assert matched is not None
            text = f"Deterministic recommendation: {recommendation['action'].upper()}. {recommendation['reason']} Confidence: {recommendation['confidence']:.0f}%. Projected impact: {recommendation['projectedImpact']:+.2f} points over {recommendation['projectionGameweeks']} gameweeks."
            if kind == "Availability" and availability_result["status"] != "i":
                text = f"Official FPL data does not confirm that {matched['playerName']} is injured. Current status: {availability_result['statusDescription']}. {text}"
        elif availability_result:
            assert matched is not None
            confirmation = "confirms" if availability_result["status"] == "i" else "does not confirm"
            text = f"Official FPL data {confirmation} that {matched['playerName']} is injured. Current status: {availability_result['statusDescription']}. Confidence: {availability_result['confidence']:.0f}%."
        elif fixture_result:
            text = fixture_result["explanation"]
        else:
            text = "I could not identify a supported injury, fixture, or transfer question for a player in the connected squad."
        player_info = None if matched is None else {"playerId": matched["playerId"], "playerName": matched["playerName"], "teamName": matched["teamName"], "position": matched["position"], "status": matched["status"], "chanceOfPlayingNextRound": matched["chanceOfPlayingNextRound"], "photoUrl": player_photo_url(matched["code"])}
        structured = None
        if recommendation and player_info:
            assert availability_result is not None
            assert fixture_result is not None
            replacement = recommendation["recommendedReplacement"]
            structured = {"detectedPlayer": player_info, "recommendedAction": recommendation["action"], "confidence": recommendation["confidence"],
                          "injuryStatus": {"status": availability_result["status"], "description": availability_result["statusDescription"], "isAvailable": availability_result["isAvailable"], "chanceOfPlayingNextRound": availability_result["chanceOfPlayingNextRound"], "expectedReturn": availability_result["expectedReturn"]},
                          "upcomingFixtureSummary": {"requestedGameweeks": fixture_result["requestedGameweeks"], "scheduleRating": fixture_result["scheduleRating"], "averageDifficulty": fixture_result["averageDifficulty"], "aggregateScore": fixture_result["aggregateScore"], "fixtures": fixture_result["fixtures"]},
                          "suggestedReplacement": None if replacement is None else {**replacement["player"], "priceDifference": replacement["priceDifference"], "projectedPointDifference": replacement["projectedPointDifference"], "reason": replacement["reason"]},
                          "projectedImpact": recommendation["projectedImpact"], "projectionGameweeks": recommendation["projectionGameweeks"], "reason": recommendation["reason"]}
        confidence = recommendation["confidence"] if recommendation else availability_result["confidence"] if availability_result else (90 if kind == "Fixture" and matched else 35 if kind == "General" else 45)
        return {"message": text, "teamId": team_id, "respondedAt": iso_datetime(datetime.now(UTC)), "isMocked": False,
                "recommendationType": kind, "confidence": confidence, "player": player_info, "availability": availability_result,
                "fixtures": fixture_result, "transfers": transfer_result, "recommendation": recommendation, "structuredRecommendation": structured}