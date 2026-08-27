export interface CoachChatRequest {
  teamId: number
  message: string
}

export interface CoachChatResponse {
  message: string
  teamId: number
  respondedAt: string
  isMocked: boolean
  recommendationType: CoachRecommendationType
  confidence: number
  player: CoachPlayerInfo | null
  availability: PlayerAvailabilityResult | null
  fixtures: PlayerFixtureWindowResult | null
  transfers: PlayerReplacementResult | null
  recommendation: PlayerRecommendationResult | null
  structuredRecommendation: CoachStructuredRecommendation | null
}

export type CoachRecommendationType = 'General' | 'Availability' | 'Fixture' | 'Recommendation' | 'Transfer' | 'Replacement'

export interface CoachPlayerInfo {
  playerId: number
  playerName: string
  teamName: string
  position: string
  status: string
  chanceOfPlayingNextRound: number | null
  photoUrl: string
}

export interface PlayerAvailabilityResult {
  player: {
    playerId: number
    playerName: string
    teamName: string
    position: string
  }
  status: string
  statusDescription: string
  isAvailable: boolean
  chanceOfPlayingNextRound: number | null
  expectedReturn: string | null
  confidence: number
  evidence: string
  source: string
}

export interface PlayerFixtureWindowResult {
  player: {
    playerId: number
    playerName: string
    teamName: string
    position: string
  }
  requestedGameweeks: number
  fixtures: CoachUpcomingFixture[]
  averageDifficulty: number | null
  aggregateScore: number | null
  scheduleRating: string
  explanation: string
  source: string
}

export interface CoachUpcomingFixture {
  fixtureId: number
  gameweek: number
  gameweekName: string
  kickoff: string | null
  opponent: string
  isHome: boolean
  venue: string
  difficulty: number
}

export interface PlayerReplacementResult {
  playerOut: CoachTransferPlayer
  bank: number
  maximumPurchasePrice: number
  projectionGameweeks: number
  candidates: CoachReplacementCandidate[]
  source: string
}

export interface CoachTransferPlayer {
  playerId: number
  playerName: string
  teamName: string
  position: string
  price: number
}

export interface CoachReplacementCandidate {
  rank: number
  player: CoachTransferPlayer
  priceDifference: number
  playerOutProjectedPoints: number
  candidateProjectedPoints: number
  projectedPointDifference: number
  confidence: number
  reason: string
}

export interface PlayerRecommendationResult {
  action: PlayerRecommendationAction
  projectedImpact: number
  projectionGameweeks: number
  confidence: number
  reason: string
  recommendedReplacement: CoachReplacementCandidate | null
  availability: PlayerAvailabilityResult
  fixtures: PlayerFixtureWindowResult
  transfers: PlayerReplacementResult
  source: string
}

export type PlayerRecommendationAction = 'Hold' | 'Bench' | 'Transfer'

export interface CoachStructuredRecommendation {
  detectedPlayer: CoachPlayerInfo
  recommendedAction: PlayerRecommendationAction
  confidence: number
  injuryStatus: {
    status: string
    description: string
    isAvailable: boolean
    chanceOfPlayingNextRound: number | null
    expectedReturn: string | null
  }
  upcomingFixtureSummary: {
    requestedGameweeks: number
    scheduleRating: string
    averageDifficulty: number | null
    aggregateScore: number | null
    fixtures: CoachUpcomingFixture[]
  }
  suggestedReplacement: {
    playerId: number
    playerName: string
    teamName: string
    position: string
    price: number
    priceDifference: number
    projectedPointDifference: number
    reason: string
  } | null
  projectedImpact: number
  projectionGameweeks: number
  reason: string
}

export interface CoachChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sentAt: string
  isMocked?: boolean
  recommendationType?: CoachRecommendationType
  confidence?: number
  player?: CoachPlayerInfo | null
  availability?: PlayerAvailabilityResult | null
  fixtures?: PlayerFixtureWindowResult | null
  transfers?: PlayerReplacementResult | null
  recommendation?: PlayerRecommendationResult | null
  structuredRecommendation?: CoachStructuredRecommendation | null
}