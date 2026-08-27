import { describe, expect, it } from 'vitest'
import type { FplFixture } from '../../models/fpl'
import { selectUpcomingFixtures, selectUpcomingGameweeks } from './fixtureSelectors'

const fixtures = [
  createFixture(1, 2, '2026-08-29T15:00:00Z'),
  createFixture(2, 1, '2026-08-22T15:00:00Z'),
  createFixture(3, 3, '2026-09-05T15:00:00Z'),
  createFixture(4, 4, '2026-09-12T15:00:00Z'),
  { ...createFixture(5, 1, '2026-08-22T12:00:00Z'), finished: true },
]

describe('fixture selectors', () => {
  it('groups unfinished fixtures by ordered gameweek and applies range', () => {
    const groups = selectUpcomingGameweeks(fixtures, 3)

    expect(groups.map((group) => group.gameweek)).toEqual([1, 2, 3])
    expect(groups.flatMap((group) => group.fixtures).map((fixture) => fixture.id)).toEqual([2, 1, 3])
  })

  it('supports all remaining gameweeks', () => {
    expect(selectUpcomingGameweeks(fixtures, 'all')).toHaveLength(4)
  })

  it('selects the nearest unfinished fixtures for compact views', () => {
    expect(selectUpcomingFixtures(fixtures, 2).map((fixture) => fixture.id)).toEqual([2, 1])
  })
})

function createFixture(id: number, gameweek: number, kickoff: string): FplFixture {
  return {
    id,
    code: id,
    gameweek,
    kickoff,
    finished: false,
    started: false,
    homeTeamId: 1,
    homeTeam: 'Arsenal',
    awayTeamId: 2,
    awayTeam: 'Chelsea',
    homeScore: null,
    awayScore: null,
    homeDifficulty: 3,
    awayDifficulty: 4,
  }
}