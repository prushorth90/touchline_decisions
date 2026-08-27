import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendCoachMessage, sendCoachMessageStream } from './coachApi'

describe('sendCoachMessage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('posts the connected team ID and natural-language message', async () => {
    const response = {
      message: 'Mock coach reply.',
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
      availability: null,
      fixtures: null,
      transfers: null,
      recommendation: null,
      structuredRecommendation: null,
    }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(sendCoachMessage({ teamId: 7558250, message: 'Should I sell Saka?' })).resolves.toEqual(response)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/coach/chat')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ Accept: 'application/json', 'Content-Type': 'application/json' })
    expect(JSON.parse(String(init.body))).toEqual({ teamId: 7558250, message: 'Should I sell Saka?' })
  })

  it('streams safe progress updates before returning the final response', async () => {
    const response = {
      message: 'Final recommendation.', teamId: 7558250, respondedAt: '2026-08-26T12:00:00Z',
      isMocked: false, recommendationType: 'Transfer', confidence: 80, player: null,
      availability: null, fixtures: null, transfers: null, recommendation: null, structuredRecommendation: null,
    }
    const encoder = new TextEncoder()
    const chunks = [
      'event: progress\r\ndata: {"code":"checking-availability",',
      '"message":"Checking player availability"}\r\n\r\nevent: progress\ndata: {"code":"analyzing-fixtures","message":"Analyzing upcoming fixtures"}\n\n',
      `event: complete\ndata: ${JSON.stringify(response)}\n\n`,
    ]
    const body = new ReadableStream({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)))
        controller.close()
      },
    })
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const onProgress = vi.fn()

    await expect(sendCoachMessageStream(
      { teamId: 7558250, message: 'Saka is injured' },
      onProgress,
    )).resolves.toEqual(response)
    expect(onProgress).toHaveBeenNthCalledWith(1, { code: 'checking-availability', message: 'Checking player availability' })
    expect(onProgress).toHaveBeenNthCalledWith(2, { code: 'analyzing-fixtures', message: 'Analyzing upcoming fixtures' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/coach/chat/stream')
    expect(init.headers).toMatchObject({ Accept: 'text/event-stream', 'Content-Type': 'application/json' })
  })
})
