import { CalendarClock } from 'lucide-react'
import type { FplFixture } from '../../models/fpl'
import { selectUpcomingFixtures } from '../../features/fixtures/fixtureSelectors'

const compactDateFormatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

export function FixtureTicker({ fixtures, limit = 5 }: { fixtures: FplFixture[]; limit?: number }) {
  const upcomingFixtures = selectUpcomingFixtures(fixtures, limit)

  if (upcomingFixtures.length === 0) return null

  return (
    <section className="mb-7 border border-black/10 bg-[#151a17] text-white" aria-label="Upcoming fixture ticker">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3 text-xs font-bold uppercase text-[#b8ff3d]">
        <CalendarClock size={15} /> Coming up
      </div>
      <div className="flex snap-x gap-px overflow-x-auto bg-white/10">
        {upcomingFixtures.map((fixture) => (
          <article key={fixture.id} className="w-56 shrink-0 snap-start bg-[#151a17] px-4 py-3 sm:w-64">
            <p className="text-[10px] text-white/45">GW{fixture.gameweek ?? '—'} · {formatKickoff(fixture.kickoff)}</p>
            <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs font-bold">
              <span className="truncate">{fixture.homeTeam}</span>
              <span className="text-white/30">vs</span>
              <span className="truncate text-right">{fixture.awayTeam}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function formatKickoff(kickoff: string | null) {
  return kickoff ? compactDateFormatter.format(new Date(kickoff)) : 'TBC'
}