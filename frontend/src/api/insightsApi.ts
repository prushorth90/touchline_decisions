import type { GameweekInsightsResponse } from '../models/insights'
import { request } from './fplApi'

export function getGameweekInsights(signal?: AbortSignal) {
  return request<GameweekInsightsResponse>('/api/insights/gameweek', signal)
}
