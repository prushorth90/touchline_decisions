// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PlayerHeadshot, playerPhotoFallback } from './PlayerHeadshot'

describe('PlayerHeadshot', () => {
  afterEach(cleanup)

  it('renders an official image lazily with stable intrinsic dimensions', () => {
    const photoUrl = 'https://resources.premierleague.com/premierleague/photos/players/110x140/p244851.png'
    render(<PlayerHeadshot photoUrl={photoUrl} playerName="Cole Palmer" />)

    const image = screen.getByRole('img', { name: 'Cole Palmer headshot' }) as HTMLImageElement
    expect(image.getAttribute('src')).toBe(photoUrl)
    expect(image.getAttribute('loading')).toBe('lazy')
    expect(image.getAttribute('decoding')).toBe('async')
    expect(image.getAttribute('width')).toBe('110')
    expect(image.getAttribute('height')).toBe('140')
  })

  it('uses the local placeholder for a missing or failed image', () => {
    const { rerender } = render(<PlayerHeadshot photoUrl={undefined} playerName="Unknown Player" />)
    let image = screen.getByRole('img', { name: 'Unknown Player headshot' }) as HTMLImageElement
    expect(image.getAttribute('src')).toBe(playerPhotoFallback)

    rerender(<PlayerHeadshot photoUrl="https://resources.premierleague.com/missing.png" playerName="Unknown Player" />)
    image = screen.getByRole('img', { name: 'Unknown Player headshot' }) as HTMLImageElement
    fireEvent.error(image)
    expect(image.getAttribute('src')).toBe(playerPhotoFallback)
  })
})
