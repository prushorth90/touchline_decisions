import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { FixtureTicker } from '../components/fixtures/FixtureTicker'
import { Card } from '../components/ui/Card'
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/ui/States'
import { PageHeader } from '../components/ui/PageHeader'
import { selectUpcomingGameweeks, type GameweekRange } from '../features/fixtures/fixtureSelectors'
import type { FplFixture } from '../models/fpl'
import { useFplFixturesQuery } from '../queries/fplQueries'

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

const rangeOptions: { value: GameweekRange; label: string }[] = [
  { value: 1, label: '1 GW' },
  { value: 3, label: '3 GWs' },
  { value: 5, label: '5 GWs' },
  { value: 10, label: '10 GWs' },
  { value: 'all', label: 'All' },
]

export function FixturesPage() {
  const fixturesQuery = useFplFixturesQuery()
  const [range, setRange] = useState<GameweekRange>(3)

  if (fixturesQuery.isPending) {
    return (
      <>
        <PageHeader eyebrow="Schedule" title="Fixtures" description="Loading upcoming Premier League fixtures." />
        <Card><LoadingSkeleton rows={8} /></Card>
      </>
    )
  }

  if (fixturesQuery.isError || !fixturesQuery.data) {
    return (
      <>
        <PageHeader eyebrow="Schedule" title="Fixtures unavailable" description="The fixture schedule could not be loaded." />
        <ErrorState
          description={fixturesQuery.error instanceof Error ? fixturesQuery.error.message : 'The fixture response was incomplete.'}
          action={<button onClick={() => void fixturesQuery.refetch()} className="inline-flex h-10 items-center gap-2 bg-[#151a17] px-4 text-sm font-bold text-white"><RefreshCw size={16} /> Try again</button>}
        />
      </>
    )
  }

  const fixtures = fixturesQuery.data
  const gameweeks = selectUpcomingGameweeks(fixtures, range)
  const remainingGameweeks = selectUpcomingGameweeks(fixtures, 'all').length

  return (
    <>
      <PageHeader
        eyebrow={`${remainingGameweeks} gameweeks remaining`}
        title="Fixtures"
        description="Compare upcoming matches and fixture difficulty across the planning horizon."
        action={<button onClick={() => void fixturesQuery.refetch()} disabled={fixturesQuery.isFetching} className="inline-flex h-11 items-center gap-2 border border-black/15 bg-white px-4 text-sm font-bold disabled:opacity-60"><RefreshCw className={fixturesQuery.isFetching ? 'animate-spin' : ''} size={16} /> Refresh</button>}
      />

      <FixtureTicker fixtures={fixtures} />

      <div className="mb-7 flex flex-col justify-between gap-3 border border-black/10 bg-white p-3 sm:flex-row sm:items-center">
        <div><p className="text-sm font-bold">Planning horizon</p><p className="mt-1 text-xs text-black/45">Show the next gameweeks with published fixtures.</p></div>
        <div className="grid grid-cols-5 gap-px bg-black/10" role="group" aria-label="Gameweek range">
          {rangeOptions.map((option) => (
            <button key={option.label} onClick={() => setRange(option.value)} aria-pressed={range === option.value} className={`h-10 min-w-14 px-2 text-xs font-bold sm:min-w-16 ${range === option.value ? 'bg-[#b8ff3d] text-[#151a17]' : 'bg-[#f4f4ef] text-black/55 hover:bg-white'}`}>{option.label}</button>
          ))}
        </div>
      </div>

      {gameweeks.length === 0 ? (
        <Card><EmptyState title="No upcoming fixtures" description="No unfinished fixtures are currently published." /></Card>
      ) : (
        <div className="space-y-7">
          {gameweeks.map((group) => (
            <section key={group.gameweek} aria-labelledby={`gameweek-${group.gameweek}`}>
              <div className="mb-3 flex items-end justify-between border-b-2 border-[#151a17] pb-3">
                <div><p className="text-xs font-bold uppercase text-[#287c50]">Premier League</p><h2 id={`gameweek-${group.gameweek}`} className="font-display mt-1 text-2xl font-bold">Gameweek {group.gameweek}</h2></div>
                <span className="text-xs text-black/45">{group.fixtures.length} fixtures</span>
              </div>
              <Card><div className="divide-y divide-black/8">{group.fixtures.map((fixture) => <FixtureRow key={fixture.id} fixture={fixture} />)}</div></Card>
            </section>
          ))}
        </div>
      )}
    </>
  )
}

function FixtureRow({ fixture }: { fixture: FplFixture }) {
  return (
    <article className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-3 py-4 sm:grid-cols-[10rem_1fr_auto_1fr_5rem] sm:px-5">
      <p className="col-span-3 mb-1 text-center text-[10px] text-black/45 sm:col-span-1 sm:mb-0 sm:text-left sm:text-xs">{fixture.kickoff ? dateFormatter.format(new Date(fixture.kickoff)) : 'Date TBC'}</p>
      <div className="flex min-w-0 items-center justify-end gap-2"><span className="truncate text-right text-sm font-bold">{fixture.homeTeam}</span><DifficultyBadge value={fixture.homeDifficulty} /></div>
      <span className="font-display text-sm font-bold text-black/25">VS</span>
      <div className="flex min-w-0 items-center gap-2"><DifficultyBadge value={fixture.awayDifficulty} /><span className="truncate text-sm font-bold">{fixture.awayTeam}</span></div>
      <span className="hidden text-right text-xs text-black/35 sm:block">FDR</span>
    </article>
  )
}

function DifficultyBadge({ value }: { value: number }) {
  const tones: Record<number, string> = {
    1: 'bg-[#b8ff3d] text-[#151a17]',
    2: 'bg-[#77d6c5] text-[#151a17]',
    3: 'bg-[#dfe0d8] text-[#151a17]',
    4: 'bg-[#ffb19f] text-[#762718]',
    5: 'bg-[#a63625] text-white',
  }
  return <span className={`grid size-7 shrink-0 place-items-center text-xs font-bold ${tones[value] ?? tones[3]}`}>{value}</span>
}