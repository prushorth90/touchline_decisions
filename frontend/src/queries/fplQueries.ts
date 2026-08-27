import { useQuery } from '@tanstack/react-query'
import { getCaptainRecommendation, getFixtures, getLineupRecommendation, getPlayers, getSquad, getTeam, getTransferRecommendations } from '../api/fplApi'

const minute = 60_000

export const fplQueryKeys = {
  all: ['fpl'] as const,
  team: (teamId: number | null) => [...fplQueryKeys.all, 'team', teamId] as const,
  squad: (teamId: number | null) => [...fplQueryKeys.all, 'squad', teamId] as const,
  players: () => [...fplQueryKeys.all, 'players'] as const,
  fixtures: () => [...fplQueryKeys.all, 'fixtures'] as const,
  captainRecommendation: (teamId: number | null) => [...fplQueryKeys.all, 'recommendations', 'captain', teamId] as const,
  lineupRecommendation: (teamId: number | null) => [...fplQueryKeys.all, 'recommendations', 'lineup', teamId] as const,
  transferRecommendations: (teamId: number | null) => [...fplQueryKeys.all, 'recommendations', 'transfers', teamId] as const,
}

export function useFplTeamQuery(teamId: number | null) {
  return useQuery({
    queryKey: fplQueryKeys.team(teamId),
    queryFn: ({ signal }) => getTeam(teamId!, signal),
    enabled: teamId !== null,
    staleTime: 5 * minute,
  })
}

export function useFplSquadQuery(teamId: number | null) {
  return useQuery({
    queryKey: fplQueryKeys.squad(teamId),
    queryFn: ({ signal }) => getSquad(teamId!, signal),
    enabled: teamId !== null,
    staleTime: 5 * minute,
  })
}

export function useFplPlayersQuery() {
  return useQuery({
    queryKey: fplQueryKeys.players(),
    queryFn: ({ signal }) => getPlayers(signal),
    staleTime: 60 * minute,
  })
}

export function useFplFixturesQuery() {
  return useQuery({
    queryKey: fplQueryKeys.fixtures(),
    queryFn: ({ signal }) => getFixtures(signal),
    staleTime: 15 * minute,
  })
}

export function useCaptainRecommendationQuery(teamId: number | null) {
  return useQuery({
    queryKey: fplQueryKeys.captainRecommendation(teamId),
    queryFn: ({ signal }) => getCaptainRecommendation(teamId!, signal),
    enabled: teamId !== null,
    staleTime: 15 * minute,
  })
}

export function useLineupRecommendationQuery(teamId: number | null) {
  return useQuery({
    queryKey: fplQueryKeys.lineupRecommendation(teamId),
    queryFn: ({ signal }) => getLineupRecommendation(teamId!, signal),
    enabled: teamId !== null,
    staleTime: 15 * minute,
  })
}

export function useTransferRecommendationsQuery(teamId: number | null) {
  return useQuery({
    queryKey: fplQueryKeys.transferRecommendations(teamId),
    queryFn: ({ signal }) => getTransferRecommendations(teamId!, signal),
    enabled: teamId !== null,
    staleTime: 15 * minute,
  })
}