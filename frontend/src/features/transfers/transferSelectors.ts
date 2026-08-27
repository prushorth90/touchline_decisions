import type { TransferCombinationRecommendation, TransferRecommendation } from '../../models/fpl'

export type RecommendationHorizon = 'short' | 'long'

export function sortTransferRecommendations(recommendations: TransferRecommendation[], horizon: RecommendationHorizon) {
  return [...recommendations].sort((left, right) => recommendationGain(right, horizon) - recommendationGain(left, horizon))
}

export function sortTransferCombinations(combinations: TransferCombinationRecommendation[], horizon: RecommendationHorizon) {
  return [...combinations].sort((left, right) => combinationGain(right, horizon) - combinationGain(left, horizon))
}

export function combinationGainForHorizon(combination: TransferCombinationRecommendation, gameweeks: number) {
  const combined = combination.expectedPointGains.find((gain) => gain.gameweeks === gameweeks)
  return combined?.expectedPointGain ?? combination.transfers.reduce((total, transfer) => total + (transfer.expectedPointGains.find((gain) => gain.gameweeks === gameweeks)?.expectedPointGain ?? 0), 0)
}

function recommendationGain(recommendation: TransferRecommendation, horizon: RecommendationHorizon) {
  return recommendation.expectedPointGains.find((gain) => gain.gameweeks === (horizon === 'short' ? 1 : 5))?.expectedPointGain ?? 0
}

function combinationGain(combination: TransferCombinationRecommendation, horizon: RecommendationHorizon) {
  return combinationGainForHorizon(combination, horizon === 'short' ? 1 : 5)
}