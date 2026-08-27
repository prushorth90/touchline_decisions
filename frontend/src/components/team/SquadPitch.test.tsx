import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { FplSquadPick } from '../../models/fpl'
import { SquadPitch } from './SquadPitch'

describe('SquadPitch', () => {
  it('groups starters by position and preserves bench order', () => {
    const picks = [
      createPick(1, 'Goalkeeper', 'GKP', 1),
      createPick(2, 'Defender', 'DEF', 2),
      createPick(3, 'Midfielder', 'MID', 3, { isCaptain: true }),
      createPick(4, 'Forward', 'FWD', 4),
      createPick(5, 'First Bench', 'DEF', 12),
      createPick(6, 'Second Bench', 'MID', 13),
      createPick(7, 'Third Bench', 'FWD', 14),
      createPick(8, 'Reserve Keeper', 'GKP', 15),
    ]

    const markup = renderToStaticMarkup(<SquadPitch picks={picks} />)

    expect(markup).toContain('aria-label="Squad formation"')
    expect(markup).toContain('aria-label="GKP"')
    expect(markup).toContain('aria-label="DEF"')
    expect(markup).toContain('aria-label="MID"')
    expect(markup).toContain('aria-label="FWD"')
    expect(markup).toContain('aria-label="Substitutes"')
    expect(markup).toContain('Midfielder, Captain')
    expect(markup.indexOf('First Bench')).toBeLessThan(markup.indexOf('Second Bench'))
    expect(markup.indexOf('Second Bench')).toBeLessThan(markup.indexOf('Third Bench'))
    expect(markup.indexOf('Third Bench')).toBeLessThan(markup.indexOf('Reserve Keeper'))
  })
})

function createPick(
  playerId: number,
  displayName: string,
  positionName: string,
  squadPosition: number,
  overrides: Partial<FplSquadPick> = {},
): FplSquadPick {
  return {
    playerId,
    displayName,
    teamName: 'Test FC',
    positionName,
    price: 5,
    squadPosition,
    multiplier: squadPosition <= 11 ? 1 : 0,
    isCaptain: false,
    isViceCaptain: false,
    gameweekPoints: 4,
    nextOpponent: 'CHE (H)',
    ...overrides,
  }
}
