import { describe, expect, it } from 'vitest'
import type { FplPlayer } from '../../models/fpl'
import { selectClubs, selectPlayers } from './playerSelectors'

const players: FplPlayer[] = [
  createPlayer(1, 'Saka', 'Arsenal', 'MID', 9.5, 20, 8.2, 25),
  createPlayer(2, 'Raya', 'Arsenal', 'GKP', 6, 12, 4.1, 20),
  createPlayer(3, 'Palmer', 'Chelsea', 'MID', 10.5, 25, 7.6, 30),
]

describe('player selectors', () => {
  it('filters by search, club, and position', () => {
    const result = selectPlayers(players, {
      search: 'sa',
      club: 'Arsenal',
      position: 'MID',
      sortBy: 'totalPoints',
      sortDirection: 'descending',
    })

    expect(result.map((player) => player.displayName)).toEqual(['Saka'])
  })

  it('sorts numeric player fields in either direction', () => {
    const baseFilters = { search: '', club: '', position: '', sortBy: 'ownershipPercentage' as const }

    expect(selectPlayers(players, { ...baseFilters, sortDirection: 'descending' })[0]?.displayName).toBe('Palmer')
    expect(selectPlayers(players, { ...baseFilters, sortDirection: 'ascending' })[0]?.displayName).toBe('Raya')
  })

  it('returns unique clubs alphabetically', () => {
    expect(selectClubs(players)).toEqual(['Arsenal', 'Chelsea'])
  })
})

function createPlayer(
  id: number,
  displayName: string,
  teamName: string,
  position: string,
  price: number,
  totalPoints: number,
  form: number,
  ownershipPercentage: number,
): FplPlayer {
  return {
    id,
    code: id,
    firstName: displayName,
    lastName: displayName,
    displayName,
    teamId: id,
    teamName,
    positionId: id,
    position,
    price,
    totalPoints,
    gameweekPoints: 0,
    form,
    ownershipPercentage,
    status: 'a',
    news: '',
    chanceOfPlayingNextRound: null,
    upcomingFixture: 'CHE (H)',
  }
}