import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { FplTeam, TransferCombinationRecommendation, TransferRecommendation, TransferRecommendationResponse } from '../models/fpl'
import { sortTransferCombinations, sortTransferRecommendations } from '../features/transfers/transferSelectors'
import { fplQueryKeys } from '../queries/fplQueries'
import { TeamProvider } from '../team/TeamContext'
import { TransfersPage } from './TransfersPage'

describe('TransfersPage', () => {
  it('renders live account status, single moves, combinations, fixtures, gains, confidence, and reasoning', () => {
    const queryClient = new QueryClient()
    const single = createTransfer(1, 'Current Defender', 101, 'Target Defender', 2, 6, 10)
    const second = createTransfer(2, 'Current Midfielder', 102, 'Target Midfielder', 1, 4, 8, 'MID')
    const combination = createCombination(single, second)
    const team: FplTeam = {
      id: 42,
      managerName: 'Ada Manager',
      teamName: 'Expected Goals',
      startedGameweek: 1,
      currentGameweek: 8,
      overallPoints: 400,
      overallRank: 1000,
      gameweekPoints: 60,
      gameweekRank: 2000,
      bank: 0.5,
      teamValue: 100,
      freeTransfers: null,
      nextGameweek: null,
    }
    const response: TransferRecommendationResponse = {
      teamId: 42,
      gameweek: 8,
      calculatedAt: '2026-10-20T12:00:00Z',
      bank: 0.5,
      recommendations: [single],
      combinations: [combination],
    }
    queryClient.setQueryData(fplQueryKeys.team(42), team)
    queryClient.setQueryData(fplQueryKeys.transferRecommendations(42), response)

    const markup = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TeamProvider initialTeamId={42}>
            <TransfersPage />
          </TeamProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(markup).toContain('Free transfers')
    expect(markup).toContain('Unavailable')
    expect(markup).toContain('£0.5m')
    expect(markup).toContain('One-transfer moves')
    expect(markup).toContain('Two-transfer combinations')
    expect(markup).toContain('Current Defender')
    expect(markup).toContain('Target Defender')
    expect(markup).toContain('CHE (H)')
    expect(markup).toContain('+2.00')
    expect(markup).toContain('88% confidence')
    expect(markup).toContain('Projected upgrade across the selected horizon.')
  })

  it('sorts single and combination recommendations by the selected horizon', () => {
    const immediate = createTransfer(1, 'Immediate Out', 101, 'Immediate In', 5, 6, 7)
    const sustained = createTransfer(2, 'Sustained Out', 102, 'Sustained In', 2, 8, 14)
    const immediateCombination = createCombination(immediate, createTransfer(3, 'Other Out', 103, 'Other In', 4, 5, 6, 'MID'))
    const sustainedCombination = createCombination(sustained, createTransfer(4, 'Long Out', 104, 'Long In', 1, 8, 15, 'FWD'))

    expect(sortTransferRecommendations([sustained, immediate], 'short')[0]).toBe(immediate)
    expect(sortTransferRecommendations([immediate, sustained], 'long')[0]).toBe(sustained)
    expect(sortTransferCombinations([sustainedCombination, immediateCombination], 'short')[0]).toBe(immediateCombination)
    expect(sortTransferCombinations([immediateCombination, sustainedCombination], 'long')[0]).toBe(sustainedCombination)
  })
})

function createTransfer(
  playerOutId: number,
  playerOutName: string,
  playerInId: number,
  playerInName: string,
  oneGameweekGain: number,
  threeGameweekGain: number,
  fiveGameweekGain: number,
  position = 'DEF',
): TransferRecommendation {
  return {
    playerOut: {
      playerId: playerOutId,
      playerName: playerOutName,
      teamName: 'Old FC',
      position,
      price: 5.5,
      status: 'a',
      expectedMinutes: 70,
      nextFixtures: ['ARS (A)'],
    },
    playerIn: {
      playerId: playerInId,
      playerName: playerInName,
      teamName: 'New FC',
      position,
      price: 5,
      status: 'a',
      expectedMinutes: 85,
      nextFixtures: ['CHE (H)', 'FUL (A)', 'EVE (H)'],
    },
    priceDifference: -0.5,
    expectedPointGains: [
      { gameweeks: 1, playerOutPoints: 4, playerInPoints: 4 + oneGameweekGain, expectedPointGain: oneGameweekGain },
      { gameweeks: 3, playerOutPoints: 12, playerInPoints: 12 + threeGameweekGain, expectedPointGain: threeGameweekGain },
      { gameweeks: 5, playerOutPoints: 20, playerInPoints: 20 + fiveGameweekGain, expectedPointGain: fiveGameweekGain },
    ],
    weightedGain: oneGameweekGain,
    confidenceScore: 88,
    explanations: [{ factor: 'Expected points', score: oneGameweekGain, explanation: 'Projected upgrade across the selected horizon.' }],
  }
}

function createCombination(first: TransferRecommendation, second: TransferRecommendation): TransferCombinationRecommendation {
  return {
    transfers: [first, second],
    totalPriceDifference: first.priceDifference + second.priceDifference,
    expectedPointGains: [3, 5].map((gameweeks) => {
      const firstGain = first.expectedPointGains.find((gain) => gain.gameweeks === gameweeks)!
      const secondGain = second.expectedPointGains.find((gain) => gain.gameweeks === gameweeks)!
      return {
        gameweeks,
        playerOutPoints: firstGain.playerOutPoints + secondGain.playerOutPoints,
        playerInPoints: firstGain.playerInPoints + secondGain.playerInPoints,
        expectedPointGain: firstGain.expectedPointGain + secondGain.expectedPointGain,
      }
    }),
    weightedGain: 4,
    confidenceScore: 88,
    explanations: [{ factor: 'Expected points', score: 4, explanation: 'Projected upgrade across the selected horizon.' }],
  }
}
