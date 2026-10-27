import { useQuery } from '@tanstack/react-query'
import { getGameweekInsights } from '../api/insightsApi'

export const insightsQueryKeys = {
  gameweek: ['insights', 'gameweek'] as const,
}

export function useGameweekInsightsQuery() {
  return useQuery({
    queryKey: insightsQueryKeys.gameweek,
    queryFn: ({ signal }) => getGameweekInsights(signal),
    staleTime: 15 * 60_000,
  })
}
