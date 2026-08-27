import { Banknote, CalendarDays, CircleDollarSign, Hash, RefreshCw, Trophy, WalletCards } from 'lucide-react'
import { SquadSummary } from '../components/dashboard/SquadSummary'
import { StatCard } from '../components/dashboard/StatCard'
import { Card, CardHeader } from '../components/ui/Card'
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/ui/States'
import { PageHeader } from '../components/ui/PageHeader'
import { useFplFixturesQuery, useFplSquadQuery, useFplTeamQuery } from '../queries/fplQueries'
import { useTeam } from '../team/useTeam'

const rankFormatter = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 })
const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

export function DashboardPage() {
  const { teamId } = useTeam()
  const teamQuery = useFplTeamQuery(teamId)
  const squadQuery = useFplSquadQuery(teamId)
  const fixturesQuery = useFplFixturesQuery()
  const queries = [teamQuery, squadQuery, fixturesQuery]
  const isLoading = queries.some((query) => query.isPending)
  const isFetching = queries.some((query) => query.isFetching)
  const failedQuery = queries.find((query) => query.isError)

  function refetchDashboard() {
    void Promise.all(queries.map((query) => query.refetch()))
  }

  if (isLoading) {
    return (
      <>
        <PageHeader eyebrow="Connecting team" title="Loading dashboard" description="Fetching your latest squad, players, and fixtures." />
        <div className="grid gap-7 lg:grid-cols-2">
          <Card><LoadingSkeleton rows={4} /></Card>
          <Card><LoadingSkeleton rows={4} /></Card>
        </div>
      </>
    )
  }

  if (failedQuery || !teamQuery.data || !squadQuery.data || !fixturesQuery.data) {
    return (
      <>
        <PageHeader eyebrow="Dashboard" title="Your team data is unavailable" description="The saved team ID is still connected." />
        <ErrorState
          description={failedQuery?.error instanceof Error ? failedQuery.error.message : 'The dashboard response was incomplete.'}
          action={<button onClick={refetchDashboard} className="inline-flex h-10 items-center gap-2 bg-[#151a17] px-4 text-sm font-bold text-white"><RefreshCw size={16} /> Try again</button>}
        />
      </>
    )
  }

  const team = teamQuery.data
  const squad = squadQuery.data
  const nextGameweek = team.nextGameweek
  const upcomingFixtures = fixturesQuery.data
    .filter((fixture) => !fixture.finished && (!nextGameweek || fixture.gameweek === nextGameweek.id))
    .sort((left, right) => (left.kickoff ?? '').localeCompare(right.kickoff ?? ''))
    .slice(0, 3)
  const firstName = team.managerName.split(' ')[0]
  const stats = [
    { label: 'Total points', value: String(team.overallPoints), note: `${team.gameweekPoints} in Gameweek ${team.currentGameweek}`, accent: 'bg-[#b8ff3d]', icon: Trophy },
    { label: 'Overall rank', value: team.overallRank ? rankFormatter.format(team.overallRank) : 'Unranked', note: 'Current global position', accent: 'bg-[#ff795f]', icon: Hash },
    { label: 'Gameweek rank', value: team.gameweekRank ? rankFormatter.format(team.gameweekRank) : 'Unranked', note: `${squad.summary.benchPoints} points on bench`, accent: 'bg-[#e9b5ff]', icon: Trophy },
    { label: 'Team value', value: `£${team.teamValue.toFixed(1)}m`, note: 'Current squad valuation', accent: 'bg-[#77d6c5]', icon: CircleDollarSign },
    { label: 'Money in bank', value: `£${team.bank.toFixed(1)}m`, note: 'Available transfer budget', accent: 'bg-[#b8ff3d]', icon: Banknote },
    { label: 'Free transfers', value: team.freeTransfers === null ? '—' : String(team.freeTransfers), note: team.freeTransfers === null ? 'Not available from public FPL data' : 'Available this gameweek', accent: 'bg-[#ff795f]', icon: WalletCards },
  ]

  return (
    <>
      <PageHeader
        eyebrow={`Gameweek ${team.currentGameweek}`}
        title={`Good morning, ${firstName}.`}
        description={`${team.teamName} is connected and showing the latest available FPL data.`}
        action={
          <button onClick={refetchDashboard} disabled={isFetching} className="inline-flex h-11 items-center justify-center gap-2 border border-black/15 bg-white px-4 text-sm font-bold disabled:cursor-wait disabled:opacity-60">
            <RefreshCw className={isFetching ? 'animate-spin' : ''} size={17} />
            {isFetching ? 'Refreshing' : 'Refresh'}
          </button>
        }
      />

      <div className="grid gap-px border border-black/10 bg-black/10 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map((stat) => <StatCard key={stat.label} {...stat} />)}
      </div>

      <div className="mt-7 grid items-start gap-7 xl:grid-cols-[1.5fr_1fr]">
        <SquadSummary picks={squad.picks} gameweek={squad.gameweek} />
        <Card>
          <CardHeader title="Next gameweek" detail={nextGameweek?.name ?? 'Schedule pending'} action={<CalendarDays size={18} />} />
          {nextGameweek && (
            <div className="bg-[#151a17] p-5 text-white">
              <p className="text-xs font-bold uppercase text-[#b8ff3d]">Deadline</p>
              <p className="font-display mt-2 text-2xl font-bold">{dateFormatter.format(new Date(nextGameweek.deadline))}</p>
            </div>
          )}
          {!nextGameweek || upcomingFixtures.length === 0 ? (
            <EmptyState title="Next gameweek pending" description="Deadline and fixture information has not been published yet." />
          ) : (
            <div className="divide-y divide-black/8">
              {upcomingFixtures.map((fixture) => (
                <div key={fixture.id} className="px-5 py-4">
                  <p className="text-xs text-black/45">{fixture.kickoff ? dateFormatter.format(new Date(fixture.kickoff)) : 'Date to be confirmed'}</p>
                  <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm font-bold">
                    <span>{fixture.homeTeam}</span><span className="text-black/25">vs</span><span className="text-right">{fixture.awayTeam}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  )
}