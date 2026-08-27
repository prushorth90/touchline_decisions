import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMocks = vi.hoisted(() => ({
  captain: vi.fn(),
  lineup: vi.fn(),
  transfers: vi.fn(),
}))

vi.mock('../queries/fplQueries', () => ({
  useCaptainRecommendationQuery: queryMocks.captain,
  useLineupRecommendationQuery: queryMocks.lineup,
  useTransferRecommendationsQuery: queryMocks.transfers,
}))

vi.mock('../team/useTeam', () => ({
  useTeam: () => ({ teamId: 42 }),
}))

import { RecommendationsPage } from './RecommendationsPage'

describe('RecommendationsPage states', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders aggregate loading state while recommendation services are pending', () => {
    const pending = createQueryState({ isPending: true, isFetching: true })
    queryMocks.captain.mockReturnValue(pending)
    queryMocks.lineup.mockReturnValue(pending)
    queryMocks.transfers.mockReturnValue(pending)

    const markup = renderToStaticMarkup(<RecommendationsPage />)

    expect(markup).toContain('Building your gameweek plan')
    expect((markup.match(/aria-label="Loading content"/g) ?? []).length).toBe(2)
  })

  it('renders the originating service error and retry action', () => {
    queryMocks.captain.mockReturnValue(createQueryState({ isError: true, error: new Error('Mock captain service failure.') }))
    queryMocks.lineup.mockReturnValue(createQueryState())
    queryMocks.transfers.mockReturnValue(createQueryState())

    const markup = renderToStaticMarkup(<RecommendationsPage />)

    expect(markup).toContain('Recommendations unavailable')
    expect(markup).toContain('Mock captain service failure.')
    expect(markup).toContain('Try again')
  })
})

function createQueryState(overrides: Record<string, unknown> = {}) {
  return {
    data: undefined,
    error: null,
    isError: false,
    isFetching: false,
    isPending: false,
    refetch: vi.fn(),
    ...overrides,
  }
}
