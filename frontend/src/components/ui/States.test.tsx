import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ErrorState, LoadingSkeleton } from './States'

describe('query state components', () => {
  it('renders a labelled loading skeleton with the requested rows', () => {
    const markup = renderToStaticMarkup(<LoadingSkeleton rows={3} />)

    expect(markup).toContain('aria-label="Loading content"')
    expect((markup.match(/size-10/g) ?? []).length).toBe(3)
  })

  it('renders an API error message and retry action', () => {
    const markup = renderToStaticMarkup(
      <ErrorState
        title="Players unavailable"
        description="Mock player service failure."
        action={<button>Try again</button>}
      />,
    )

    expect(markup).toContain('Players unavailable')
    expect(markup).toContain('Mock player service failure.')
    expect(markup).toContain('Try again')
  })
})