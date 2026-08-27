// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/fplApi'

const coachApiMock = vi.hoisted(() => ({ sendCoachMessageStream: vi.fn() }))

vi.mock('../api/coachApi', () => ({ sendCoachMessageStream: coachApiMock.sendCoachMessageStream }))
vi.mock('../team/useTeam', () => ({ useTeam: () => ({ teamId: 7558250 }) }))

import { CoachPage } from './CoachPage'

describe('CoachPage', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('sends the connected Team ID and displays the mocked assistant response', async () => {
    coachApiMock.sendCoachMessageStream.mockResolvedValue({
      message: 'Compare Saka with the best same-position replacements.',
      teamId: 7558250,
      respondedAt: '2026-08-26T12:00:00Z',
      isMocked: false,
      recommendationType: 'Transfer',
      confidence: 68,
      player: {
        playerId: 10,
        playerName: 'Saka',
        teamName: 'Arsenal',
        position: 'MID',
        status: 'd',
        chanceOfPlayingNextRound: 75,
        photoUrl: '/images/player-placeholder.svg',
      },
      availability: {
        player: { playerId: 10, playerName: 'Saka', teamName: 'Arsenal', position: 'MID' },
        status: 'd',
        statusDescription: 'Doubtful',
        isAvailable: false,
        chanceOfPlayingNextRound: 75,
        expectedReturn: '12 Sep',
        confidence: 85,
        evidence: 'Hamstring injury. Expected back 12 Sep.',
        source: 'Official FPL bootstrap data',
      },
      fixtures: null,
      transfers: {
        playerOut: { playerId: 10, playerName: 'Saka', teamName: 'Arsenal', position: 'MID', price: 10 },
        bank: 0.5,
        maximumPurchasePrice: 10.5,
        projectionGameweeks: 5,
        candidates: [{
          rank: 1,
          player: { playerId: 20, playerName: 'Palmer', teamName: 'Chelsea', position: 'MID', price: 9.5 },
          priceDifference: -0.5,
          playerOutProjectedPoints: 25,
          candidateProjectedPoints: 33,
          projectedPointDifference: 8,
          confidence: 80,
          reason: 'Adds eight projected points over five gameweeks.',
        }],
        source: 'Touchline transfer recommendation engine',
      },
      recommendation: {
        action: 'Transfer',
        projectedImpact: 8,
        projectionGameweeks: 5,
        confidence: 80,
        reason: 'Transfer to Palmer: the legal replacement projects +8.00 points better over 5 gameweeks.',
        recommendedReplacement: null,
        availability: {
          player: { playerId: 10, playerName: 'Saka', teamName: 'Arsenal', position: 'MID' },
          status: 'd', statusDescription: 'Doubtful', isAvailable: false, chanceOfPlayingNextRound: 75,
          expectedReturn: '12 Sep', confidence: 85, evidence: 'Knock', source: 'Official FPL bootstrap data',
        },
        fixtures: {
          player: { playerId: 10, playerName: 'Saka', teamName: 'Arsenal', position: 'MID' },
          requestedGameweeks: 5, fixtures: [], averageDifficulty: 2, aggregateScore: 4,
          scheduleRating: 'Favorable', explanation: 'Favorable schedule.', source: 'Official FPL fixture data',
        },
        transfers: {
          playerOut: { playerId: 10, playerName: 'Saka', teamName: 'Arsenal', position: 'MID', price: 10 },
          bank: 0.5, maximumPurchasePrice: 10.5, projectionGameweeks: 5, candidates: [], source: 'Transfer engine',
        },
        source: 'Deterministic C# recommendation policy',
      },
      structuredRecommendation: {
        detectedPlayer: {
          playerId: 10, playerName: 'Saka', teamName: 'Arsenal', position: 'MID', status: 'd',
          chanceOfPlayingNextRound: 75, photoUrl: '/images/player-placeholder.svg',
        },
        recommendedAction: 'Transfer',
        confidence: 80,
        injuryStatus: { status: 'd', description: 'Doubtful', isAvailable: false, chanceOfPlayingNextRound: 75, expectedReturn: '12 Sep' },
        upcomingFixtureSummary: { requestedGameweeks: 5, scheduleRating: 'Favorable', averageDifficulty: 2, aggregateScore: 4, fixtures: [] },
        suggestedReplacement: {
          playerId: 20, playerName: 'Palmer', teamName: 'Chelsea', position: 'MID', price: 9.5,
          priceDifference: -0.5, projectedPointDifference: 8, reason: 'Adds eight projected points.',
        },
        projectedImpact: 8,
        projectionGameweeks: 5,
        reason: 'Transfer to Palmer: the legal replacement projects +8.00 points better over 5 gameweeks.',
      },
    })
    const user = userEvent.setup()
    render(<CoachPage />)

    await user.type(screen.getByLabelText('Message AI Coach'), 'Should I sell Saka?')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(await screen.findByText('Compare Saka with the best same-position replacements.')).toBeTruthy()
    expect(coachApiMock.sendCoachMessageStream).toHaveBeenCalledWith(
      { teamId: 7558250, message: 'Should I sell Saka?' },
      expect.any(Function),
    )
    expect(screen.queryByText('Mocked response')).toBeNull()
    expect(screen.getByText('Transfer')).toBeTruthy()
    expect(screen.getByText('68% confidence')).toBeTruthy()
    expect(screen.getByText('Arsenal · MID · 75% chance')).toBeTruthy()
    expect(screen.getAllByText('Doubtful')).toHaveLength(2)
    expect(screen.getByText('12 Sep')).toBeTruthy()
    expect(screen.getByText('85%')).toBeTruthy()
    expect(screen.getByText('Palmer · Chelsea · MID')).toBeTruthy()
    const card = screen.getByRole('region', { name: 'Structured recommendation' })
    expect(within(card).getByText('Transfer Saka')).toBeTruthy()
    expect(within(card).getByText('+8.00 pts')).toBeTruthy()
    expect(within(card).getByText('5 GW · 80% confidence')).toBeTruthy()
    expect(within(card).getByText('Doubtful')).toBeTruthy()
    expect(within(card).getByText('Favorable · FDR 2.00')).toBeTruthy()
    expect(within(card).getByText('Palmer · £9.5m')).toBeTruthy()
    expect(within(card).getByText('-£0.5m', { exact: false })).toBeTruthy()
    expect(screen.getByText('Bank £0.5m · Max £10.5m')).toBeTruthy()
  })

  it('shows a pending assistant state while waiting', async () => {
    let resolveResponse: (value: unknown) => void = () => undefined
    coachApiMock.sendCoachMessageStream.mockReturnValue(new Promise((resolve) => { resolveResponse = resolve }))
    const user = userEvent.setup()
    render(<CoachPage />)

    await user.type(screen.getByLabelText('Message AI Coach'), 'Saka is injured')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(screen.getByText('Starting analysis')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Send message' }) as HTMLButtonElement).disabled).toBe(true)

    const onProgress = coachApiMock.sendCoachMessageStream.mock.calls[0][1]
    onProgress({ code: 'checking-availability', message: 'Checking player availability' })
    expect(await screen.findByText('Checking player availability')).toBeTruthy()
    onProgress({ code: 'analyzing-fixtures', message: 'Analyzing upcoming fixtures' })
    expect(await screen.findByText('Analyzing upcoming fixtures')).toBeTruthy()

    resolveResponse({ message: 'Noted.', teamId: 7558250, respondedAt: '2026-08-26T12:00:00Z', isMocked: false, recommendationType: 'Availability', confidence: 78, player: null, availability: null, fixtures: null, transfers: null, recommendation: null, structuredRecommendation: null })
    expect(await screen.findByText('Noted.')).toBeTruthy()
    expect(screen.queryByLabelText('Coach progress')).toBeNull()
  })

  it('renders structured fixture difficulty results', async () => {
    coachApiMock.sendCoachMessageStream.mockResolvedValue({
      message: 'Saka has a favorable upcoming schedule.',
      teamId: 7558250,
      respondedAt: '2026-08-26T12:00:00Z',
      isMocked: false,
      recommendationType: 'Fixture',
      confidence: 90,
      player: null,
      availability: null,
      fixtures: {
        player: { playerId: 10, playerName: 'Saka', teamName: 'Arsenal', position: 'MID' },
        requestedGameweeks: 3,
        fixtures: [
          { fixtureId: 1, gameweek: 9, gameweekName: 'Gameweek 9', kickoff: '2026-09-12T14:00:00Z', opponent: 'Chelsea', isHome: true, venue: 'Home', difficulty: 2 },
          { fixtureId: 2, gameweek: 10, gameweekName: 'Gameweek 10', kickoff: null, opponent: 'Liverpool', isHome: false, venue: 'Away', difficulty: 3 },
        ],
        averageDifficulty: 2.5,
        aggregateScore: 3.5,
        scheduleRating: 'Favorable',
        explanation: 'Saka has a favorable upcoming schedule.',
        source: 'Official FPL element-summary and bootstrap data',
      },
      transfers: null,
      recommendation: null,
      structuredRecommendation: null,
    })
    const user = userEvent.setup()
    render(<CoachPage />)

    await user.type(screen.getByLabelText('Message AI Coach'), "How are Saka's next 3 fixtures?")
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(await screen.findByText('Chelsea (H)')).toBeTruthy()
    expect(screen.getByText('Liverpool (A)')).toBeTruthy()
    expect(screen.getByText('Favorable · Score 3.50')).toBeTruthy()
    expect(screen.getByText('FDR 2')).toBeTruthy()
    expect(screen.getByText('Fixture')).toBeTruthy()
  })

  it('shows an error and retries without duplicating the user message', async () => {
    coachApiMock.sendCoachMessageStream
      .mockRejectedValueOnce(new ApiError('Mock coach outage.', 503))
      .mockResolvedValueOnce({ message: 'Recovered reply.', teamId: 7558250, respondedAt: '2026-08-26T12:00:00Z', isMocked: false, recommendationType: 'General', confidence: 35, player: null, availability: null, fixtures: null, transfers: null, recommendation: null, structuredRecommendation: null })
    const user = userEvent.setup()
    render(<CoachPage />)

    await user.type(screen.getByLabelText('Message AI Coach'), 'Sell Martinelli?')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Mock coach outage.')
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Recovered reply.')).toBeTruthy()
    expect(coachApiMock.sendCoachMessageStream).toHaveBeenCalledTimes(2)
    expect(screen.getAllByText('Sell Martinelli?')).toHaveLength(1)
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })
})
