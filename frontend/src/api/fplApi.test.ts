import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCaptainRecommendation, getFixtures, getLineupRecommendation, getPlayers, getSquad, getTeam, getTransferRecommendations, TeamVerificationError, verifyTeam } from './fplApi'

describe('verifyTeam', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns a verified team from the backend', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 42,
      managerName: 'Ada Manager',
      teamName: 'Expected Goals',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    await expect(verifyTeam(42)).resolves.toEqual({
      id: 42,
      managerName: 'Ada Manager',
      teamName: 'Expected Goals',
    })
  })

  it('returns a meaningful error when the team is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))

    await expect(verifyTeam(999)).rejects.toThrow(
      new TeamVerificationError('We could not find that FPL team. Check the ID and try again.'),
    )
  })

  it('returns a meaningful error when the backend is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network error')))

    await expect(verifyTeam(42)).rejects.toThrow(
      new TeamVerificationError('The backend is unavailable. Check your connection and try again.'),
    )
  })

  it('requests each typed FPL resource from the backend', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 42, managerName: 'Ada', teamName: 'Expected Goals' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ teamId: 42, summary: {}, picks: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 1, displayName: 'Player' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 7, homeTeam: 'Arsenal' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ teamId: 42, bestCaptain: { playerName: 'Player' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ teamId: 42, formation: '3-4-3' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ teamId: 42, recommendations: [], combinations: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const [team, squad, players, fixtures, captainRecommendation, lineupRecommendation, transferRecommendations] = await Promise.all([
      getTeam(42),
      getSquad(42),
      getPlayers(),
      getFixtures(),
      getCaptainRecommendation(42),
      getLineupRecommendation(42),
      getTransferRecommendations(42),
    ])

    expect(team.id).toBe(42)
    expect(squad.teamId).toBe(42)
    expect(players[0]?.displayName).toBe('Player')
    expect(fixtures[0]?.homeTeam).toBe('Arsenal')
    expect(captainRecommendation.bestCaptain.playerName).toBe('Player')
    expect(lineupRecommendation.formation).toBe('3-4-3')
    expect(transferRecommendations.recommendations).toEqual([])
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/fpl/team/42',
      '/api/fpl/team/42/squad',
      '/api/fpl/players',
      '/api/fpl/fixtures',
      '/api/recommendations/42/captain',
      '/api/recommendations/42/lineup',
      '/api/recommendations/42/transfers?limit=10',
    ])
  })

  it('uses safe Problem Details messages and rejects malformed success responses', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        title: 'Too many requests.',
        detail: 'Wait briefly before trying again.',
      }), { status: 429, headers: { 'Content-Type': 'application/problem+json' } }))
      .mockResolvedValueOnce(new Response('not-json', { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getPlayers()).rejects.toMatchObject({
      message: 'Wait briefly before trying again.',
      status: 429,
    })
    await expect(getFixtures()).rejects.toMatchObject({
      message: 'The backend returned an invalid response.',
      status: 200,
    })
  })
})