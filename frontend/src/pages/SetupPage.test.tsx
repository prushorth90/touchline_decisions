// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { TeamProvider } from '../team/TeamContext'
import { SetupPage } from './SetupPage'

describe('SetupPage', () => {
  afterEach(() => {
    cleanup()
    window.localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('validates the team ID before requesting the backend', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderSetup()

    await user.type(screen.getByLabelText('FPL team ID'), 'abc')
    await user.click(screen.getByRole('button', { name: 'Connect team' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Enter a numeric FPL team ID.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('verifies, saves, and navigates to the connected application', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 7558250,
      managerName: 'Ada Manager',
      teamName: 'Expected Goals',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    const user = userEvent.setup()
    renderSetup()

    await user.type(screen.getByLabelText('FPL team ID'), '7558250')
    await user.click(screen.getByRole('button', { name: 'Connect team' }))

    expect(await screen.findByText('Connected workspace')).toBeTruthy()
    expect(window.localStorage.getItem('touchline.fplTeamId')).toBe('7558250')
  })

  it('keeps the form open and displays a backend verification error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))
    const user = userEvent.setup()
    renderSetup()

    await user.type(screen.getByLabelText('FPL team ID'), '999')
    await user.click(screen.getByRole('button', { name: 'Connect team' }))

    expect((await screen.findByRole('alert')).textContent).toContain('We could not find that FPL team.')
    expect(screen.getByRole('heading', { name: 'Find your FPL team' })).toBeTruthy()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Connect team' }).hasAttribute('disabled')).toBe(false))
  })
})

function renderSetup() {
  render(
    <MemoryRouter initialEntries={['/setup']}>
      <TeamProvider initialTeamId={null}>
        <Routes>
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/" element={<h1>Connected workspace</h1>} />
        </Routes>
      </TeamProvider>
    </MemoryRouter>,
  )
}
