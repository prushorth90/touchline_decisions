from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class ProblemDetails(ApiModel):
    status: int
    title: str
    detail: str | None = None
    traceId: str | None = None


class GameweekInsightPlayer(ApiModel):
    name: str = Field(min_length=1)
    form: float = Field(strict=True, allow_inf_nan=False)
    total_points: int = Field(strict=True)


class GameweekInsightsResponse(ApiModel):
    generatedAt: AwareDatetime
    players: list[GameweekInsightPlayer] = Field(max_length=5)


class FplGameweekResponse(ApiModel):
    id: int
    name: str
    deadline: datetime


class FplTeamResponse(ApiModel):
    id: int
    managerName: str
    teamName: str
    startedGameweek: int
    currentGameweek: int
    overallPoints: int
    overallRank: int | None
    gameweekPoints: int
    gameweekRank: int | None
    bank: float
    teamValue: float
    freeTransfers: int | None
    nextGameweek: FplGameweekResponse | None


class FplPlayerResponse(ApiModel):
    id: int
    code: int
    firstName: str
    lastName: str
    displayName: str
    teamId: int
    teamName: str
    positionId: int
    position: str
    price: float
    totalPoints: int
    gameweekPoints: int
    form: float
    ownershipPercentage: float
    status: str
    news: str
    chanceOfPlayingNextRound: int | None
    upcomingFixture: str | None
    photoUrl: str


class FplFixtureResponse(ApiModel):
    id: int
    code: int
    gameweek: int | None
    kickoff: datetime | None
    finished: bool
    started: bool
    homeTeamId: int
    homeTeam: str
    awayTeamId: int
    awayTeam: str
    homeScore: int | None
    awayScore: int | None
    homeDifficulty: int
    awayDifficulty: int


class FplSquadSummaryResponse(ApiModel):
    points: int
    totalPoints: int
    overallRank: int | None
    bank: float
    teamValue: float
    transfers: int
    transferCost: int
    benchPoints: int


class FplSquadPickResponse(ApiModel):
    playerId: int
    displayName: str
    teamName: str
    positionName: str
    price: float
    squadPosition: int
    multiplier: int
    isCaptain: bool
    isViceCaptain: bool
    gameweekPoints: int
    nextOpponent: str | None
    photoUrl: str


class FplSquadResponse(ApiModel):
    teamId: int
    teamName: str
    gameweek: int
    activeChip: str | None
    summary: FplSquadSummaryResponse
    picks: list[FplSquadPickResponse]


class LeagueEntryResponse(ApiModel):
    rank: int
    lastRank: int
    entryId: int
    entryName: str
    playerName: str
    eventTotal: int
    total: int


class LeagueStandingsResponse(ApiModel):
    leagueId: int
    leagueName: str
    page: int
    hasNext: bool
    standings: list[LeagueEntryResponse]


class CoachChatRequest(ApiModel):
    teamId: int = Field(gt=0)
    message: str = Field(min_length=1, max_length=1000)

    @field_validator("message")
    @classmethod
    def normalize_message(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("message must not be blank")
        return normalized


class FactorBreakdown(ApiModel):
    factor: str
    score: float
    explanation: str


class CaptainCandidate(ApiModel):
    playerId: int
    playerName: str
    teamName: str
    position: str
    projectedPoints: float
    rankingScore: float
    factors: list[FactorBreakdown]
    photoUrl: str


class CaptainRecommendationResponse(ApiModel):
    teamId: int
    gameweek: int
    calculatedAt: datetime
    bestCaptain: CaptainCandidate
    viceCaptain: CaptainCandidate
    alternatives: list[CaptainCandidate]


class LineupHorizonProjection(ApiModel):
    gameweeks: int
    projectedPoints: float


class LineupPlayer(ApiModel):
    playerId: int
    playerName: str
    teamName: str
    position: str
    projectedPoints: float
    expectedMinutes: float
    rankingScore: float
    currentSquadPosition: int
    recommendedSquadPosition: int
    projections: list[LineupHorizonProjection]
    photoUrl: str


class LineupChange(ApiModel):
    playerId: int
    playerName: str
    changeType: str
    currentSquadPosition: int
    recommendedSquadPosition: int


class LineupRecommendationResponse(ApiModel):
    teamId: int
    gameweek: int
    calculatedAt: datetime
    formation: str
    startingXi: list[LineupPlayer]
    bench: list[LineupPlayer]
    changes: list[LineupChange]


class TransferPlayer(ApiModel):
    playerId: int
    playerName: str
    teamName: str
    position: str
    price: float
    status: str
    expectedMinutes: float
    nextFixtures: list[str]
    photoUrl: str


class TransferHorizonGain(ApiModel):
    gameweeks: int
    playerOutPoints: float
    playerInPoints: float
    expectedPointGain: float


class TransferRecommendation(ApiModel):
    playerOut: TransferPlayer
    playerIn: TransferPlayer
    priceDifference: float
    expectedPointGains: list[TransferHorizonGain]
    weightedGain: float
    confidenceScore: float
    explanations: list[FactorBreakdown]


class TransferCombinationRecommendation(ApiModel):
    transfers: list[TransferRecommendation]
    totalPriceDifference: float
    expectedPointGains: list[TransferHorizonGain]
    weightedGain: float
    confidenceScore: float
    explanations: list[FactorBreakdown]


class TransferRecommendationResponse(ApiModel):
    teamId: int
    gameweek: int
    calculatedAt: datetime
    bank: float
    recommendations: list[TransferRecommendation]
    combinations: list[TransferCombinationRecommendation]


class CoachPlayer(ApiModel):
    playerId: int
    playerName: str
    teamName: str
    position: str


class CoachPlayerInfo(CoachPlayer):
    status: str
    chanceOfPlayingNextRound: int | None
    photoUrl: str


class PlayerAvailabilityResult(ApiModel):
    player: CoachPlayer
    status: str
    statusDescription: str
    isAvailable: bool
    chanceOfPlayingNextRound: int | None
    expectedReturn: str | None
    confidence: float
    evidence: str
    source: str


class CoachUpcomingFixture(ApiModel):
    fixtureId: int
    gameweek: int
    gameweekName: str
    kickoff: datetime | None
    opponent: str
    isHome: bool
    venue: str
    difficulty: int = Field(ge=1, le=5)


class PlayerFixtureWindowResult(ApiModel):
    player: CoachPlayer
    requestedGameweeks: int = Field(ge=1, le=5)
    fixtures: list[CoachUpcomingFixture]
    averageDifficulty: float | None
    aggregateScore: float | None
    scheduleRating: Literal["Favorable", "Mixed", "Difficult", "Unknown"]
    explanation: str
    source: str


class CoachTransferPlayer(CoachPlayer):
    price: float


class CoachReplacementCandidate(ApiModel):
    rank: int
    player: CoachTransferPlayer
    priceDifference: float
    playerOutProjectedPoints: float
    candidateProjectedPoints: float
    projectedPointDifference: float
    confidence: float
    reason: str


class PlayerReplacementResult(ApiModel):
    playerOut: CoachTransferPlayer
    bank: float
    maximumPurchasePrice: float
    projectionGameweeks: int
    candidates: list[CoachReplacementCandidate]
    source: str


class PlayerRecommendationResult(ApiModel):
    action: Literal["Hold", "Bench", "Transfer"]
    projectedImpact: float
    projectionGameweeks: int
    confidence: float
    reason: str
    recommendedReplacement: CoachReplacementCandidate | None
    availability: PlayerAvailabilityResult
    fixtures: PlayerFixtureWindowResult
    transfers: PlayerReplacementResult
    source: str


class CoachInjuryStatus(ApiModel):
    status: str
    description: str
    isAvailable: bool
    chanceOfPlayingNextRound: int | None
    expectedReturn: str | None


class CoachFixtureSummary(ApiModel):
    requestedGameweeks: int
    scheduleRating: str
    averageDifficulty: float | None
    aggregateScore: float | None
    fixtures: list[CoachUpcomingFixture]


class CoachSuggestedReplacement(CoachTransferPlayer):
    priceDifference: float
    projectedPointDifference: float
    reason: str


class CoachStructuredRecommendation(ApiModel):
    detectedPlayer: CoachPlayerInfo
    recommendedAction: Literal["Hold", "Bench", "Transfer"]
    confidence: float
    injuryStatus: CoachInjuryStatus
    upcomingFixtureSummary: CoachFixtureSummary
    suggestedReplacement: CoachSuggestedReplacement | None
    projectedImpact: float
    projectionGameweeks: int
    reason: str


class CoachChatResponse(ApiModel):
    message: str
    teamId: int
    respondedAt: datetime
    isMocked: bool
    recommendationType: Literal["General", "Availability", "Fixture", "Recommendation", "Transfer", "Replacement"]
    confidence: float
    player: CoachPlayerInfo | None
    availability: PlayerAvailabilityResult | None
    fixtures: PlayerFixtureWindowResult | None
    transfers: PlayerReplacementResult | None
    recommendation: PlayerRecommendationResult | None
    structuredRecommendation: CoachStructuredRecommendation | None


class RecommendationHistoryResponse(ApiModel):
    kind: str
    recommendation: dict[str, Any]
    calculatedAt: datetime
    recordedAt: datetime


class CreateProfileRequest(ApiModel):
    displayName: str = Field(min_length=1, max_length=120)
    selectedFplTeamId: int | None = Field(default=None, gt=0)


class UpdateSelectedTeamRequest(ApiModel):
    selectedFplTeamId: int | None = Field(gt=0)


class SetApplicationSettingRequest(ApiModel):
    value: Any


class LocalProfileResponse(ApiModel):
    id: UUID
    displayName: str
    selectedFplTeamId: int | None
    createdAt: datetime
    updatedAt: datetime


class ApplicationSettingResponse(ApiModel):
    key: str
    value: Any


class HealthResponse(ApiModel):
    status: Literal["Healthy", "Degraded", "Unhealthy"]
    timestamp: datetime
    dependencies: dict[str, str]
