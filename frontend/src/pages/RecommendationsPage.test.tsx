import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { CaptainCandidate, CaptainRecommendation, LineupPlayer, LineupRecommendation, TransferCombinationRecommendation, TransferRecommendation, TransferRecommendationResponse } from '../models/fpl'
import { fplQueryKeys } from '../queries/fplQueries'
import { TeamProvider } from '../team/TeamContext'
import { RecommendationsPage } from './RecommendationsPage'

describe('RecommendationsPage', () => {
  it('renders captain, vice captain, alternatives, and factor explanations', () => {
    const queryClient = new QueryClient()
    const recommendation: CaptainRecommendation = {
      teamId: 42,
      gameweek: 8,
      calculatedAt: '2026-10-20T12:00:00Z',
      bestCaptain: createCandidate(1, 'Mohamed Salah', 9.42, 8.75),
      viceCaptain: createCandidate(2, 'Cole Palmer', 8.71, 8.12),
      alternatives: [createCandidate(3, 'Bukayo Saka', 7.93, 7.55)],
    }
    const lineup: LineupRecommendation = {
      teamId: 42,
      gameweek: 8,
      calculatedAt: '2026-10-20T12:00:00Z',
      formation: '3-5-2',
      startingXi: [
        createLineupPlayer(1, 'David Raya', 'GKP', 1),
        createLineupPlayer(2, 'William Saliba', 'DEF', 2),
        createLineupPlayer(3, 'Gabriel', 'DEF', 3),
        createLineupPlayer(4, 'Virgil van Dijk', 'DEF', 4),
        ...Array.from({ length: 5 }, (_, index) => createLineupPlayer(index + 5, `Midfielder ${index + 1}`, 'MID', index + 5)),
        createLineupPlayer(10, 'Forward One', 'FWD', 10),
        createLineupPlayer(11, 'Forward Two', 'FWD', 11),
      ],
      bench: [
        createLineupPlayer(12, 'First substitute', 'FWD', 12),
        createLineupPlayer(13, 'Second substitute', 'DEF', 13),
        createLineupPlayer(14, 'Third substitute', 'DEF', 14),
        createLineupPlayer(15, 'Reserve keeper', 'GKP', 15),
      ],
      changes: [{ playerId: 12, playerName: 'First substitute', changeType: 'Moved to starting XI', currentSquadPosition: 12, recommendedSquadPosition: 11 }],
    }
    const bestTransfer = createTransfer(20, 'Sell Defender', 120, 'Buy Defender', 2, 6, 10, 92)
    const speculativeTransfer = createTransfer(22, 'Speculative Sale', 121, 'Alternative Defender', 1, 4, 8, 68)
    const secondTransfer = createTransfer(21, 'Sell Midfielder', 122, 'Buy Midfielder', 1.5, 5, 9, 86, 'MID')
    const combination: TransferCombinationRecommendation = {
      transfers: [bestTransfer, secondTransfer],
      totalPriceDifference: -1,
      expectedPointGains: [
        { gameweeks: 3, playerOutPoints: 20, playerInPoints: 31, expectedPointGain: 11 },
        { gameweeks: 5, playerOutPoints: 30, playerInPoints: 49, expectedPointGain: 19 },
      ],
      weightedGain: 3.72,
      confidenceScore: 89,
      explanations: [{ factor: 'Expected points', score: 3.72, explanation: 'Combined long-term upgrade.' }],
    }
    const transfers: TransferRecommendationResponse = {
      teamId: 42,
      gameweek: 8,
      calculatedAt: '2026-10-20T12:00:00Z',
      bank: 0.5,
      recommendations: [bestTransfer, speculativeTransfer, secondTransfer],
      combinations: [combination],
    }

    queryClient.setQueryData(fplQueryKeys.captainRecommendation(42), recommendation)
    queryClient.setQueryData(fplQueryKeys.lineupRecommendation(42), lineup)
    queryClient.setQueryData(fplQueryKeys.transferRecommendations(42), transfers)

    const markup = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TeamProvider initialTeamId={42}>
            <RecommendationsPage />
          </TeamProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(markup).toContain('Gameweek 8')
    expect(markup).toContain('Decision dashboard')
    expect(markup).toContain('Next 3 GWs')
    expect(markup).toContain('206.25')
    expect(markup).toContain('Best single transfer')
    expect(markup).toContain('Best two-transfer combination')
    expect(markup).toContain('Sell Defender')
    expect(markup).toContain('Buy Defender')
    expect(markup).toContain('Potential sales')
    expect(markup).toContain('High confidence')
    expect(markup).toContain('Speculative')
    expect(markup).toContain('Combined long-term upgrade.')
    expect(markup).toContain('Recommended starting XI')
    expect(markup).toContain('3-5-2')
    expect(markup).toContain('David Raya')
    expect(markup).toContain('Bench order')
    expect(markup).toContain('Reserve keeper')
    expect(markup).toContain('Moved to starting XI')
    expect(markup).toContain('Captain')
    expect(markup).toContain('Mohamed Salah')
    expect(markup).toContain('9.42')
    expect(markup).toContain('Vice captain')
    expect(markup).toContain('Cole Palmer')
    expect(markup).toContain('Bukayo Saka')
    expect(markup).toContain('Projected points')
    expect(markup).toContain('Strong projection for the next fixture.')
  })

  function createLineupPlayer(playerId: number, playerName: string, position: string, recommendedSquadPosition: number): LineupPlayer {
    return {
      playerId,
      playerName,
      teamName: 'Test FC',
      position,
      projectedPoints: 6.25,
      expectedMinutes: 82,
      rankingScore: 6.82,
      currentSquadPosition: recommendedSquadPosition,
      recommendedSquadPosition,
      projections: [
        { gameweeks: 1, projectedPoints: 6.25 },
        { gameweeks: 3, projectedPoints: 18.75 },
        { gameweeks: 5, projectedPoints: 31.25 },
      ],
    }
  }
})

function createCandidate(playerId: number, playerName: string, projectedPoints: number, rankingScore: number): CaptainCandidate {
  return {
    playerId,
    playerName,
    teamName: 'Test FC',
    position: 'MID',
    projectedPoints,
    rankingScore,
    factors: [{
      factor: 'Projected points',
      score: projectedPoints * 0.65,
      explanation: 'Strong projection for the next fixture.',
    }],
  }
}

function createTransfer(
  playerOutId: number,
  playerOutName: string,
  playerInId: number,
  playerInName: string,
  oneGameweekGain: number,
  threeGameweekGain: number,
  fiveGameweekGain: number,
  confidenceScore: number,
  position = 'DEF',
): TransferRecommendation {
  return {
    playerOut: { playerId: playerOutId, playerName: playerOutName, teamName: 'Old FC', position, price: 5.5, status: 'a', expectedMinutes: 70, nextFixtures: ['ARS (A)'] },
    playerIn: { playerId: playerInId, playerName: playerInName, teamName: 'New FC', position, price: 5, status: 'a', expectedMinutes: 85, nextFixtures: ['CHE (H)', 'FUL (A)'] },
    priceDifference: -0.5,
    expectedPointGains: [
      { gameweeks: 1, playerOutPoints: 4, playerInPoints: 4 + oneGameweekGain, expectedPointGain: oneGameweekGain },
      { gameweeks: 3, playerOutPoints: 12, playerInPoints: 12 + threeGameweekGain, expectedPointGain: threeGameweekGain },
      { gameweeks: 5, playerOutPoints: 20, playerInPoints: 20 + fiveGameweekGain, expectedPointGain: fiveGameweekGain },
    ],
    weightedGain: oneGameweekGain,
    confidenceScore,
    explanations: [{ factor: 'Expected points', score: oneGameweekGain, explanation: 'Strong projected upgrade.' }],
  }
}
