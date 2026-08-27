import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { FplSquadPick } from '../../models/fpl'
import { PlayerCard } from './PlayerCard'

describe('PlayerCard', () => {
  it('renders identity, captaincy, price, points, and next opponent', () => {
    const markup = renderToStaticMarkup(<PlayerCard player={createPick({ isCaptain: true })} />)

    expect(markup).toContain('aria-label="Test Player, Captain"')
    expect(markup).toContain('MID')
    expect(markup).toContain('Test Player')
    expect(markup).toContain('Arsenal')
    expect(markup).toContain('£7.5')
    expect(markup).toContain('CHE (H)')
  })

  it('renders vice-captain and missing fixture states', () => {
    const markup = renderToStaticMarkup(<PlayerCard player={createPick({ isViceCaptain: true, nextOpponent: null })} variant="bench" />)

    expect(markup).toContain('aria-label="Test Player, Vice-captain"')
    expect(markup).toContain('TBC')
  })
})

function createPick(overrides: Partial<FplSquadPick> = {}): FplSquadPick {
  return {
    playerId: 1,
    displayName: 'Test Player',
    teamName: 'Arsenal',
    positionName: 'MID',
    price: 7.5,
    squadPosition: 5,
    multiplier: 1,
    isCaptain: false,
    isViceCaptain: false,
    gameweekPoints: 8,
    nextOpponent: 'CHE (H)',
    ...overrides,
  }
}
