import type { LineupRecommendation, TransferPlayer, TransferRecommendation } from '../../models/fpl'

export interface SellCandidate {
  player: TransferPlayer
  appearances: number
  replacement: TransferPlayer
  fiveGameweekGain: number
  confidenceScore: number
  reason: string
}

export function getSquadProjection(lineup: LineupRecommendation) {
  return [1, 3, 5].map((gameweeks) => ({
    gameweeks,
    projectedPoints: round(lineup.startingXi.reduce((total, player) => {
      const projection = player.projections.find((item) => item.gameweeks === gameweeks)
      return total + (projection?.projectedPoints ?? (gameweeks === 1 ? player.projectedPoints : 0))
    }, 0)),
  }))
}

export function selectSellCandidates(recommendations: TransferRecommendation[], limit = 3): SellCandidate[] {
  const grouped = recommendations.reduce((groups, recommendation) => {
    const playerRecommendations = groups.get(recommendation.playerOut.playerId) ?? []
    playerRecommendations.push(recommendation)
    groups.set(recommendation.playerOut.playerId, playerRecommendations)
    return groups
  }, new Map<number, TransferRecommendation[]>())

  return Array.from(grouped.values())
    .map((playerRecommendations) => {
      const best = [...playerRecommendations].sort((left, right) => fiveGameweekGain(right) - fiveGameweekGain(left))[0]
      return {
        player: best.playerOut,
        appearances: playerRecommendations.length,
        replacement: best.playerIn,
        fiveGameweekGain: fiveGameweekGain(best),
        confidenceScore: best.confidenceScore,
        reason: best.explanations.find((item) => item.factor === 'Expected points')?.explanation ?? 'Recurring transfer-out candidate across the ranked shortlist.',
      }
    })
    .sort((left, right) => right.appearances - left.appearances || right.fiveGameweekGain - left.fiveGameweekGain || left.player.playerId - right.player.playerId)
    .slice(0, limit)
}

function fiveGameweekGain(recommendation: TransferRecommendation) {
  return recommendation.expectedPointGains.find((gain) => gain.gameweeks === 5)?.expectedPointGain ?? 0
}

function round(value: number) {
  return Math.round(value * 100) / 100
}