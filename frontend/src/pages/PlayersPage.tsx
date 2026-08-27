import { ArrowDown, ArrowUp, RefreshCw, Search, X } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { Card } from '../components/ui/Card'
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/ui/States'
import { PageHeader } from '../components/ui/PageHeader'
import { PlayerHeadshot } from '../components/player/PlayerHeadshot'
import { getAvailability, selectClubs, selectPlayers, type PlayerSortKey, type SortDirection } from '../features/players/playerSelectors'
import type { FplPlayer } from '../models/fpl'
import { useFplPlayersQuery } from '../queries/fplQueries'

const positions = ['GKP', 'DEF', 'MID', 'FWD']
const sortOptions: { value: PlayerSortKey; label: string }[] = [
  { value: 'totalPoints', label: 'Total points' },
  { value: 'price', label: 'Price' },
  { value: 'ownershipPercentage', label: 'Ownership' },
  { value: 'form', label: 'Form' },
]

export function PlayersPage() {
  const playersQuery = useFplPlayersQuery()
  const [search, setSearch] = useState('')
  const [club, setClub] = useState('')
  const [position, setPosition] = useState('')
  const [sortBy, setSortBy] = useState<PlayerSortKey>('totalPoints')
  const [sortDirection, setSortDirection] = useState<SortDirection>('descending')
  const deferredSearch = useDeferredValue(search)

  if (playersQuery.isPending) {
    return (
      <>
        <PageHeader eyebrow="Player database" title="Loading players" description="Fetching the latest player prices and performance data." />
        <Card><LoadingSkeleton rows={8} /></Card>
      </>
    )
  }

  if (playersQuery.isError || !playersQuery.data) {
    return (
      <>
        <PageHeader eyebrow="Player database" title="Players unavailable" description="The player list could not be loaded." />
        <ErrorState
          description={playersQuery.error instanceof Error ? playersQuery.error.message : 'The player response was incomplete.'}
          action={<button onClick={() => void playersQuery.refetch()} className="inline-flex h-10 items-center gap-2 bg-[#151a17] px-4 text-sm font-bold text-white"><RefreshCw size={16} /> Try again</button>}
        />
      </>
    )
  }

  const players = playersQuery.data
  const clubs = selectClubs(players)
  const filteredPlayers = selectPlayers(players, {
    search: deferredSearch,
    club,
    position,
    sortBy,
    sortDirection,
  })
  const hasFilters = Boolean(search || club || position)

  function clearFilters() {
    setSearch('')
    setClub('')
    setPosition('')
  }

  return (
    <>
      <PageHeader
        eyebrow={`${filteredPlayers.length} of ${players.length} players`}
        title="Players"
        description="Search the full player pool and compare price, points, form, ownership, availability, and the next fixture."
        action={<button onClick={() => void playersQuery.refetch()} disabled={playersQuery.isFetching} className="inline-flex h-11 items-center gap-2 border border-black/15 bg-white px-4 text-sm font-bold disabled:opacity-60"><RefreshCw className={playersQuery.isFetching ? 'animate-spin' : ''} size={16} /> Refresh</button>}
      />

      <div className="mb-5 grid gap-3 border border-black/10 bg-white p-3 sm:grid-cols-2 xl:grid-cols-[minmax(15rem,1fr)_14rem_10rem_14rem_auto]">
        <label className="flex h-11 items-center gap-3 border border-black/15 bg-[#f4f4ef] px-4"><Search size={17} className="shrink-0 text-black/35" /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search players" placeholder="Search player or club" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
        <FilterSelect label="Club" value={club} onChange={setClub} options={clubs} />
        <FilterSelect label="Position" value={position} onChange={setPosition} options={positions} />
        <label className="flex h-11 items-center gap-2 border border-black/15 bg-[#f4f4ef] px-3 text-xs font-bold text-black/45"><span>Sort</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value as PlayerSortKey)} aria-label="Sort players" className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[#151a17] outline-none">{sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <div className="flex gap-2">
          <button onClick={() => setSortDirection((current) => current === 'descending' ? 'ascending' : 'descending')} title={`Sort ${sortDirection}`} aria-label={`Sort ${sortDirection}`} className="grid size-11 place-items-center border border-black/15 bg-[#151a17] text-white">{sortDirection === 'descending' ? <ArrowDown size={17} /> : <ArrowUp size={17} />}</button>
          {hasFilters && <button onClick={clearFilters} title="Clear filters" aria-label="Clear filters" className="grid size-11 place-items-center border border-black/15 bg-white"><X size={17} /></button>}
        </div>
      </div>

      {filteredPlayers.length === 0 ? (
        <Card><EmptyState title="No players found" description="Try a different player name, club, or position." /></Card>
      ) : (
        <Card>
          <div className="grid gap-3 p-3 md:hidden">
            {filteredPlayers.map((player) => <MobilePlayerCard key={player.id} player={player} />)}
          </div>
        <div className="overflow-x-auto">
          <table className="hidden w-full min-w-[880px] text-left text-sm md:table">
            <thead className="bg-[#151a17] text-xs text-white/60"><tr><th className="px-5 py-4">Player</th><th>Position</th><th>Price</th><th>Points</th><th>Form</th><th>Ownership</th><th>Availability</th><th className="px-5 text-right">Next</th></tr></thead>
            <tbody className="divide-y divide-black/8">{filteredPlayers.map((player) => {
              const availability = getAvailability(player.status)
              return <tr key={player.id} className="hover:bg-[#f4f4ef]"><td className="px-5 py-3"><div className="flex items-center gap-3"><div className="grid h-14 w-11 shrink-0 place-items-end overflow-hidden bg-[#e5f6ef]"><PlayerHeadshot photoUrl={player.photoUrl} playerName={player.displayName} className="h-full w-auto" /></div><div className="min-w-0"><p className="truncate font-bold">{player.displayName}</p><p className="text-xs text-black/45">{player.teamName}</p></div></div></td><td>{player.position}</td><td>£{player.price.toFixed(1)}m</td><td className="font-display text-lg font-bold">{player.totalPoints}</td><td><span className="bg-[#e5f6ef] px-2 py-1 font-bold text-[#287c50]">{player.form.toFixed(1)}</span></td><td>{player.ownershipPercentage.toFixed(1)}%</td><td><span className={`px-2 py-1 text-xs font-bold ${availability.tone}`} title={player.news}>{availability.label}</span></td><td className="px-5 text-right font-bold">{player.upcomingFixture ?? 'TBC'}</td></tr>
            })}</tbody>
          </table>
        </div>
      </Card>
      )}
    </>
  )
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="flex h-11 items-center gap-2 border border-black/15 bg-[#f4f4ef] px-3 text-xs font-bold text-black/45"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} aria-label={`Filter by ${label.toLowerCase()}`} className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[#151a17] outline-none"><option value="">All</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
  )
}

function MobilePlayerCard({ player }: { player: FplPlayer }) {
  const availability = getAvailability(player.status)
  return (
    <article className="border border-black/10 bg-white p-4">
      <div className="flex items-start gap-3"><div className="grid h-16 w-12 shrink-0 place-items-end overflow-hidden bg-[#e5f6ef]"><PlayerHeadshot photoUrl={player.photoUrl} playerName={player.displayName} className="h-full w-auto" /></div><div className="min-w-0 flex-1"><h2 className="truncate font-bold">{player.displayName}</h2><p className="mt-1 text-xs text-black/45">{player.teamName} · {player.position}</p></div><span className={`shrink-0 px-2 py-1 text-[10px] font-bold ${availability.tone}`}>{availability.label}</span></div>
      <dl className="mt-4 grid grid-cols-5 gap-px bg-black/8 text-center">{[
        ['Price', `£${player.price.toFixed(1)}`],
        ['Points', String(player.totalPoints)],
        ['Form', player.form.toFixed(1)],
        ['Owned', `${player.ownershipPercentage.toFixed(1)}%`],
        ['Next', player.upcomingFixture ?? 'TBC'],
      ].map(([label, value]) => <div key={label} className="min-w-0 bg-[#f4f4ef] px-1 py-2"><dt className="text-[8px] font-bold uppercase text-black/35">{label}</dt><dd className="mt-1 truncate text-[10px] font-bold" title={value}>{value}</dd></div>)}</dl>
    </article>
  )
}