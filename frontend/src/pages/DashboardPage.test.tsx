import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { FplFixture, FplSquad, FplTeam } from '../models/fpl'
import { fplQueryKeys } from '../queries/fplQueries'
import { TeamProvider } from '../team/TeamContext'
import { DashboardPage } from './DashboardPage'

describe('DashboardPage', () => {
  it('renders team metrics, current squad, and next gameweek data', () => {
    const queryClient = new QueryClient()
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
      nextGameweek: {
        id: 4,
        name: 'Gameweek 4',
        deadline: '2026-09-12T12:30:00Z',
      },
    }
    const squad: FplSquad = {
      teamId: 42,
      teamName: 'Expected Goals',
      gameweek: 3,
      activeChip: null,
      summary: {
        points: 67,
        totalPoints: 180,
        overallRank: 1234,
        bank: 1.5,
        teamValue: 101.2,
        transfers: 1,
        transferCost: 0,
        benchPoints: 8,
      },
      picks: [{
        playerId: 10,
        displayName: 'Test Player',
        teamName: 'Arsenal',
        positionName: 'MID',
        price: 5.5,
        squadPosition: 1,
        multiplier: 2,
        isCaptain: true,
        isViceCaptain: false,
        gameweekPoints: 5,
        nextOpponent: 'CHE (H)',
      }],
    }
    const fixtures: FplFixture[] = [{
      id: 7,
      code: 700,
      gameweek: 4,
      kickoff: '2026-09-12T14:00:00Z',
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
    }]

    queryClient.setQueryData(fplQueryKeys.team(42), team)
    queryClient.setQueryData(fplQueryKeys.squad(42), squad)
    queryClient.setQueryData(fplQueryKeys.fixtures(), fixtures)

    const markup = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TeamProvider initialTeamId={42}>
            <DashboardPage />
          </TeamProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(markup).toContain('Expected Goals')
    expect(markup).toContain('Total points')
    expect(markup).toContain('Overall rank')
    expect(markup).toContain('Gameweek rank')
    expect(markup).toContain('£101.2m')
    expect(markup).toContain('£1.5m')
    expect(markup).toContain('Not available from public FPL data')
    expect(markup).toContain('Gameweek 4')
    expect(markup).toContain('Test Player')
  })
})