import type { FplPlayer } from '../../models/fpl'

export type PlayerSortKey = 'price' | 'totalPoints' | 'ownershipPercentage' | 'form'
export type SortDirection = 'ascending' | 'descending'

export interface PlayerFilters {
  search: string
  club: string
  position: string
  sortBy: PlayerSortKey
  sortDirection: SortDirection
}

export function selectPlayers(players: FplPlayer[], filters: PlayerFilters) {
  const search = filters.search.trim().toLocaleLowerCase()
  const direction = filters.sortDirection === 'ascending' ? 1 : -1

  return players
    .filter((player) =>
      (!search || `${player.displayName} ${player.firstName} ${player.lastName} ${player.teamName}`.toLocaleLowerCase().includes(search)) &&
      (!filters.club || player.teamName === filters.club) &&
      (!filters.position || player.position === filters.position))
    .sort((left, right) => {
      const difference = left[filters.sortBy] - right[filters.sortBy]
      return difference === 0
        ? left.displayName.localeCompare(right.displayName)
        : difference * direction
    })
}

export function selectClubs(players: FplPlayer[]) {
  return [...new Set(players.map((player) => player.teamName))].sort((left, right) => left.localeCompare(right))
}

export function getAvailability(status: string) {
  switch (status) {
    case 'a': return { label: 'Available', tone: 'bg-[#e5f6ef] text-[#185b39]' }
    case 'd': return { label: 'Doubtful', tone: 'bg-[#fff2d8] text-[#76551b]' }
    case 'i': return { label: 'Injured', tone: 'bg-[#fff2ee] text-[#a63625]' }
    case 's': return { label: 'Suspended', tone: 'bg-[#fde8ff] text-[#773780]' }
    case 'u': return { label: 'Unavailable', tone: 'bg-black/8 text-black/55' }
    default: return { label: 'Unknown', tone: 'bg-black/8 text-black/55' }
  }
}