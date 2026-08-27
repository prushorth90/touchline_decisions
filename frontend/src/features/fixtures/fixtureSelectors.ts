import type { FplFixture } from '../../models/fpl'

export type GameweekRange = 1 | 3 | 5 | 10 | 'all'

export interface FixtureGameweek {
  gameweek: number
  fixtures: FplFixture[]
}

export function selectUpcomingGameweeks(fixtures: FplFixture[], range: GameweekRange): FixtureGameweek[] {
  const groupedFixtures = new Map<number, FplFixture[]>()

  fixtures
    .filter((fixture) => !fixture.finished && fixture.gameweek !== null)
    .sort(compareFixtures)
    .forEach((fixture) => {
      const gameweek = fixture.gameweek!
      groupedFixtures.set(gameweek, [...(groupedFixtures.get(gameweek) ?? []), fixture])
    })

  const gameweeks = [...groupedFixtures.entries()]
    .sort(([left], [right]) => left - right)
    .map(([gameweek, gameweekFixtures]) => ({ gameweek, fixtures: gameweekFixtures }))

  return range === 'all' ? gameweeks : gameweeks.slice(0, range)
}

export function selectUpcomingFixtures(fixtures: FplFixture[], limit: number) {
  return fixtures
    .filter((fixture) => !fixture.finished)
    .sort(compareFixtures)
    .slice(0, limit)
}

function compareFixtures(left: FplFixture, right: FplFixture) {
  if (left.kickoff === right.kickoff) return left.id - right.id
  if (left.kickoff === null) return 1
  if (right.kickoff === null) return -1
  return left.kickoff.localeCompare(right.kickoff)
}