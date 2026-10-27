// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameweekInsightsResponse } from '../models/insights'
import { GameweekIntelligencePage } from './GameweekIntelligencePage'

const report: GameweekInsightsResponse = {
  generatedAt: '2026-10-27T12:00:00Z',
  players: [
    { name: 'First Player', form: 9.5, total_points: 80 },
    { name: 'Second Player', form: 8.2, total_points: 92 },
    { name: 'Third Player', form: 8.2, total_points: 65 },
    { name: 'Fourth Player', form: 7, total_points: 54 },
    { name: 'Fifth Player', form: 6.1, total_points: 43 },
  ],
}

const clients: QueryClient[] = []

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  return render(
    <QueryClientProvider client={client}>
      <GameweekIntelligencePage />
    </QueryClientProvider>,
  )
}

function reportResponse(payload = report) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('GameweekIntelligencePage', () => {
  afterEach(() => {
    cleanup()
    clients.splice(0).forEach((client) => client.clear())
    vi.unstubAllGlobals()
  })

  it('shows a loading state while the report request is pending', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    renderPage()

    expect(screen.getByRole('status', { name: 'Loading gameweek report' })).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByRole('button', { name: 'Refresh' }).hasAttribute('disabled')).toBe(true)
  })

  it('requests only the backend and displays five players in published order with the generation timestamp', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reportResponse())
    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(5)
    rows.forEach((row, index) => {
      const player = report.players[index]
      expect(within(row).getByRole('rowheader').textContent).toBe(player.name)
      expect(within(row).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
        String(index + 1), player.form.toFixed(1), String(player.total_points),
      ])
    })
    const timestamp = screen.getByText('Report generated:').querySelector('time')
    expect(timestamp?.getAttribute('datetime')).toBe(report.generatedAt)
    expect(timestamp?.textContent).toContain('27 Oct 2026')
    expect(screen.queryByRole('status')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/insights/gameweek', expect.objectContaining({
      headers: { Accept: 'application/json' },
      signal: expect.any(AbortSignal),
    }))
  })

  it('displays fewer than five players without inventing recommendations', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reportResponse({
      ...report, players: report.players.slice(0, 2),
    })))
    renderPage()

    expect(within(await screen.findByRole('table')).getAllByRole('row')).toHaveLength(3)
  })

  it('shows an empty state and the generation timestamp when there are no recommendations', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reportResponse({ ...report, players: [] })))
    renderPage()

    expect(await screen.findByText('No player recommendations')).toBeTruthy()
    expect(screen.getByText('Report generated:').querySelector('time')?.getAttribute('datetime')).toBe(report.generatedAt)
    expect(screen.queryByRole('table')).toBeNull()
  })

  it.each([404, 502, 503])('shows an unavailable report and supports retry after HTTP %s', async (status) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        detail: 'The gameweek report is temporarily unavailable.',
      }), { status, headers: { 'Content-Type': 'application/problem+json' } }))
      .mockResolvedValueOnce(reportResponse())
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderPage()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Gameweek report unavailable')
    expect(alert.textContent).toContain('The gameweek report is temporarily unavailable.')
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('table')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows a friendly connection error on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network error')))
    renderPage()

    expect((await screen.findByRole('alert')).textContent).toContain('Check your connection and try again.')
  })

  it('shows an error when the backend returns invalid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not-json', { status: 200 })))
    renderPage()

    expect((await screen.findByRole('alert')).textContent).toContain('The backend returned an invalid response.')
  })

  it('refreshes the published snapshot and its timestamp without invoking a calculation', async () => {
    const updatedReport: GameweekInsightsResponse = {
      generatedAt: '2026-10-27T18:00:00Z',
      players: [{ name: 'New Leader', form: 10, total_points: 100 }],
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reportResponse())
      .mockResolvedValueOnce(reportResponse(updatedReport))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('First Player')

    await user.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(await screen.findByText('New Leader')).toBeTruthy()
    expect(screen.queryByText('First Player')).toBeNull()
    expect(screen.getByText('Report generated:').querySelector('time')?.getAttribute('datetime')).toBe(updatedReport.generatedAt)
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/insights/gameweek', '/api/insights/gameweek',
    ])
  })
})
