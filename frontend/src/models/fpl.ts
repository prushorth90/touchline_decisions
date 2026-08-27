export interface FplTeam {
  id: number
  managerName: string
  teamName: string
  startedGameweek: number
  currentGameweek: number
  overallPoints: number
  overallRank: number | null
  gameweekPoints: number
  gameweekRank: number | null
  bank: number
  teamValue: number
  freeTransfers: number | null
  nextGameweek: FplGameweek | null
}

export interface FplGameweek {
  id: number
  name: string
  deadline: string
}

export interface FplPlayer {
  id: number
  code: number
  firstName: string
  lastName: string
  displayName: string
  teamId: number
  teamName: string
  positionId: number
  position: string
  price: number
  totalPoints: number
  gameweekPoints: number
  form: number
  ownershipPercentage: number
  status: string
  news: string
  chanceOfPlayingNextRound: number | null
  upcomingFixture: string | null
  photoUrl?: string
}

export interface FplFixture {
  id: number
  code: number
  gameweek: number | null
  kickoff: string | null
  finished: boolean
  started: boolean
  homeTeamId: number
  homeTeam: string
  awayTeamId: number
  awayTeam: string
  homeScore: number | null
  awayScore: number | null
  homeDifficulty: number
  awayDifficulty: number
}

export interface FplSquad {
  teamId: number
  teamName: string
  gameweek: number
  activeChip: string | null
  summary: FplSquadSummary
  picks: FplSquadPick[]
}

export interface FplSquadSummary {
  points: number
  totalPoints: number
  overallRank: number | null
  bank: number
  teamValue: number
  transfers: number
  transferCost: number
  benchPoints: number
}

export interface FplSquadPick {
  playerId: number
  displayName: string
  teamName: string
  positionName: string
  price: number
  squadPosition: number
  multiplier: number
  isCaptain: boolean
  isViceCaptain: boolean
  gameweekPoints: number
  nextOpponent: string | null
  photoUrl?: string
}

export interface CaptainRecommendation {
  teamId: number
  gameweek: number
  calculatedAt: string
  bestCaptain: CaptainCandidate
  viceCaptain: CaptainCandidate
  alternatives: CaptainCandidate[]
}

export interface CaptainCandidate {
  playerId: number
  playerName: string
  teamName: string
  position: string
  projectedPoints: number
  rankingScore: number
  factors: CaptainFactorBreakdown[]
  photoUrl?: string
}

export interface CaptainFactorBreakdown {
  factor: string
  score: number
  explanation: string
}

export interface LineupRecommendation {
  teamId: number
  gameweek: number
  calculatedAt: string
  formation: string
  startingXi: LineupPlayer[]
  bench: LineupPlayer[]
  changes: LineupChange[]
}

export interface LineupPlayer {
  playerId: number
  playerName: string
  teamName: string
  position: string
  projectedPoints: number
  expectedMinutes: number
  rankingScore: number
  currentSquadPosition: number
  recommendedSquadPosition: number
  projections: LineupHorizonProjection[]
  photoUrl?: string
}

export interface LineupHorizonProjection {
  gameweeks: number
  projectedPoints: number
}

export interface LineupChange {
  playerId: number
  playerName: string
  changeType: string
  currentSquadPosition: number
  recommendedSquadPosition: number
}

export interface TransferRecommendationResponse {
  teamId: number
  gameweek: number
  calculatedAt: string
  bank: number
  recommendations: TransferRecommendation[]
  combinations: TransferCombinationRecommendation[]
}

export interface TransferRecommendation {
  playerOut: TransferPlayer
  playerIn: TransferPlayer
  priceDifference: number
  expectedPointGains: TransferHorizonGain[]
  weightedGain: number
  confidenceScore: number
  explanations: TransferExplanation[]
}

export interface TransferCombinationRecommendation {
  transfers: TransferRecommendation[]
  totalPriceDifference: number
  expectedPointGains: TransferHorizonGain[]
  weightedGain: number
  confidenceScore: number
  explanations: TransferExplanation[]
}

export interface TransferPlayer {
  playerId: number
  playerName: string
  teamName: string
  position: string
  price: number
  status: string
  expectedMinutes: number
  nextFixtures: string[]
  photoUrl?: string
}

export interface TransferHorizonGain {
  gameweeks: number
  playerOutPoints: number
  playerInPoints: number
  expectedPointGain: number
}

export interface TransferExplanation {
  factor: string
  score: number
  explanation: string
}