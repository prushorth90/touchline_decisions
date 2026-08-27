import type { SyntheticEvent } from 'react'

export const playerPhotoFallback = '/images/player-placeholder.svg'

interface PlayerHeadshotProps {
  photoUrl?: string | null
  playerName: string
  className?: string
}

export function PlayerHeadshot({ photoUrl, playerName, className = '' }: PlayerHeadshotProps) {
  function useFallback(event: SyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget
    image.onerror = null
    image.src = playerPhotoFallback
  }

  return (
    <img
      src={photoUrl || playerPhotoFallback}
      onError={useFallback}
      alt={`${playerName} headshot`}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      width="110"
      height="140"
      className={`block bg-[url('/images/player-placeholder.svg')] bg-contain bg-bottom bg-no-repeat object-contain object-bottom ${className}`}
    />
  )
}
