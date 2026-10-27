export interface GameweekInsightPlayer {
  name: string
  form: number
  total_points: number
}

export interface GameweekInsightsResponse {
  generatedAt: string
  players: GameweekInsightPlayer[]
}
