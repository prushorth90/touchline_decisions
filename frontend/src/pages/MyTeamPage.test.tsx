import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { FplSquad, FplSquadPick, FplTeam } from '../models/fpl'
import { fplQueryKeys } from '../queries/fplQueries'
import { TeamProvider } from '../team/TeamContext'
import { MyTeamPage } from './MyTeamPage'

describe('MyTeamPage', () => {
  it('renders position rows, player details, captaincy, and substitutes', () => {
    const queryClient = new QueryClient()
    const picks: FplSquadPick[] = [
      createPick(1, 'Goalkeeper', 'GKP', 1),
      createPick(2, 'Defender', 'DEF', 2),
      createPick(3, 'Midfielder', 'MID', 3, { isCaptain: true }),
      createPick(4, 'Forward', 'FWD', 4, { isViceCaptain: true }),
      createPick(5, 'Substitute', 'DEF', 12),
    ]
    const team: FplTeam = {
      id: 42,
      managerName: 'Ada Manager',
      teamName: 'Expected Goals',
      startedGameweek: 1,
      currentGameweek: 3,
      overallPoints: 180,
      overallRank: 1234,
      gameweekPoints: 67,
      gameweekRank: 456,
      bank: 1.5,
      teamValue: 101.2,
      freeTransfers: null,
      nextGameweek: null,
    }
    const squad: FplSquad = {
      teamId: 42,
      teamName: 'Expected Goals',
      gameweek: 3,
      activeChip: null,
      summary: { points: 67, totalPoints: 180, overallRank: 1234, bank: 1.5, teamValue: 101.2, transfers: 0, transferCost: 0, benchPoints: 2 },
      picks,
    }

    queryClient.setQueryData(fplQueryKeys.team(42), team)
    queryClient.setQueryData(fplQueryKeys.squad(42), squad)

    const markup = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TeamProvider initialTeamId={42}>
            <MyTeamPage />
          </TeamProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(markup).toContain('Expected Goals')
    expect(markup).toContain('1-1-1 formation')
    expect(markup).toContain('aria-label="GKP"')
    expect(markup).toContain('aria-label="DEF"')
    expect(markup).toContain('aria-label="MID"')
    expect(markup).toContain('aria-label="FWD"')
    expect(markup).toContain('aria-label="Substitutes"')
    expect(markup).toContain('Midfielder, Captain')
    expect(markup).toContain('Forward, Vice-captain')
    expect(markup).toContain('£5.5')
    expect(markup).toContain('5</p>')
    expect(markup).toContain('CHE (H)')
  })
})

function createPick(
  playerId: number,
  displayName: string,
  positionName: string,
  squadPosition: number,
  overrides: Partial<FplSquadPick> = {},
): FplSquadPick {
  return {
    playerId,
    displayName,
    teamName: 'Arsenal',
    positionName,
    price: 5.5,
    squadPosition,
    multiplier: 1,
    isCaptain: false,
    isViceCaptain: false,
    gameweekPoints: 5,
    nextOpponent: 'CHE (H)',
    ...overrides,
  }
}