import { RefreshCw } from 'lucide-react'
import { SquadPitch } from '../components/team/SquadPitch'
import { Card, CardHeader } from '../components/ui/Card'
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/ui/States'
import { PageHeader } from '../components/ui/PageHeader'
import { useFplSquadQuery, useFplTeamQuery } from '../queries/fplQueries'
import { useTeam } from '../team/useTeam'

export function MyTeamPage() {
  const { teamId } = useTeam()
  const teamQuery = useFplTeamQuery(teamId)
  const squadQuery = useFplSquadQuery(teamId)
  const isFetching = teamQuery.isFetching || squadQuery.isFetching

  function refetchTeam() {
    void Promise.all([teamQuery.refetch(), squadQuery.refetch()])
  }

  if (teamQuery.isPending || squadQuery.isPending) {
    return (
      <>
        <PageHeader eyebrow="My Team" title="Loading squad" description="Arranging your current gameweek selection." />
        <Card><LoadingSkeleton rows={8} /></Card>
      </>
    )
  }

  if (teamQuery.isError || squadQuery.isError || !teamQuery.data || !squadQuery.data) {
    const error = teamQuery.error ?? squadQuery.error
    return (
      <>
        <PageHeader eyebrow="My Team" title="Squad unavailable" description="Your saved team remains connected." />
        <ErrorState
          description={error instanceof Error ? error.message : 'The squad response was incomplete.'}
          action={<button onClick={refetchTeam} className="inline-flex h-10 items-center gap-2 bg-[#151a17] px-4 text-sm font-bold text-white"><RefreshCw size={16} /> Try again</button>}
        />
      </>
    )
  }

  const team = teamQuery.data
  const squad = squadQuery.data
  const starters = squad.picks.filter((pick) => pick.squadPosition <= 11)
  const formation = ['DEF', 'MID', 'FWD']
    .map((position) => starters.filter((pick) => pick.positionName === position).length)
    .join('-')

  return (
    <>
      <PageHeader
        eyebrow={`Gameweek ${squad.gameweek}`}
        title={team.teamName}
        description={`${formation} formation · ${squad.summary.points} points · ${squad.summary.benchPoints} on bench`}
        action={<button onClick={refetchTeam} disabled={isFetching} className="inline-flex h-11 items-center justify-center gap-2 border border-black/15 bg-white px-4 text-sm font-bold disabled:opacity-60"><RefreshCw className={isFetching ? 'animate-spin' : ''} size={17} /> {isFetching ? 'Refreshing' : 'Refresh'}</button>}
      />
      <Card className="mb-7">
        <CardHeader title="Squad summary" detail="Live FPL selection" />
        <dl className="grid grid-cols-2 gap-px bg-black/8 sm:grid-cols-4">
          {[
            ['Formation', formation],
            ['Team value', `£${squad.summary.teamValue.toFixed(1)}m`],
            ['In bank', `£${squad.summary.bank.toFixed(1)}m`],
            ['Active chip', squad.activeChip ?? 'None'],
          ].map(([label, value]) => (
            <div key={label} className="bg-white p-4"><dt className="text-xs text-black/45">{label}</dt><dd className="mt-2 font-display text-xl font-bold">{value}</dd></div>
          ))}
        </dl>
      </Card>
      {squad.picks.length === 0 ? (
        <Card><EmptyState title="No squad available" description="Your current gameweek selection has not been published yet." /></Card>
      ) : (
        <SquadPitch picks={squad.picks} />
      )}
    </>
  )
}