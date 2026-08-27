import { useState, type ReactNode } from 'react'
import { TeamContext } from './useTeam'

const storageKey = 'touchline.fplTeamId'

function readSavedTeamId() {
  if (typeof window === 'undefined') {
    return null
  }

  const value = window.localStorage.getItem(storageKey)
  const teamId = value ? Number(value) : Number.NaN
  return Number.isSafeInteger(teamId) && teamId > 0 ? teamId : null
}

export function TeamProvider({ children, initialTeamId }: { children: ReactNode; initialTeamId?: number | null }) {
  const [teamId, setTeamId] = useState<number | null>(() =>
    initialTeamId === undefined ? readSavedTeamId() : initialTeamId,
  )

  function saveTeamId(value: number) {
    window.localStorage.setItem(storageKey, String(value))
    setTeamId(value)
  }

  function removeTeamId() {
    window.localStorage.removeItem(storageKey)
    setTeamId(null)
  }

  return (
    <TeamContext.Provider value={{ teamId, saveTeamId, removeTeamId }}>
      {children}
    </TeamContext.Provider>
  )
}