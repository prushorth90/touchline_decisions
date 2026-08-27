import { createContext, useContext } from 'react'

export interface TeamContextValue {
  teamId: number | null
  saveTeamId: (teamId: number) => void
  removeTeamId: () => void
}

export const TeamContext = createContext<TeamContextValue | null>(null)

export function useTeam() {
  const context = useContext(TeamContext)
  if (!context) {
    throw new Error('useTeam must be used within TeamProvider')
  }

  return context
}