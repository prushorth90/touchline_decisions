import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from './App'

function renderRoute(path: string, initialTeamId: number | null = 1) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <App initialTeamId={initialTeamId} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('App routing', () => {
  it.each([
    ['/', 'Loading dashboard'],
    ['/team', 'My Team'],
    ['/transfers', 'Transfers'],
    ['/players', 'Players'],
    ['/fixtures', 'Fixtures'],
    ['/insights', 'Gameweek Intelligence'],
    ['/recommendations', 'Recommendations'],
    ['/coach', 'AI Coach'],
    ['/settings', 'Settings'],
  ])('renders %s', (path, heading) => {
    expect(renderRoute(path)).toContain(heading)
  })

  it('renders setup when there is no saved team', () => {
    expect(renderRoute('/setup', null)).toContain('Find your FPL team')
  })

  it('links to gameweek intelligence in desktop and mobile navigation', () => {
    const markup = renderRoute('/insights')

    expect((markup.match(/href="\/insights"/g) ?? []).length).toBe(2)
    expect((markup.match(/aria-current="page"/g) ?? []).length).toBe(2)
  })

  it('renders the not-found page for an unknown route', () => {
    expect(renderRoute('/unknown')).toContain('Page not found')
  })
})