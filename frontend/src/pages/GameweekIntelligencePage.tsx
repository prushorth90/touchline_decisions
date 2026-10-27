import { RefreshCw } from 'lucide-react'
import { Card, CardHeader } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/ui/States'
import { useGameweekInsightsQuery } from '../queries/insightsQueries'

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZoneName: 'short',
})

export function GameweekIntelligencePage() {
  const reportQuery = useGameweekInsightsQuery()

  return (
    <>
      <PageHeader
        eyebrow="Published insights"
        title="Gameweek Intelligence"
        description="Discover the top five FPL players ranked by form in the latest scheduled report. This is a published snapshot, not live advice."
        action={
          <button
            onClick={() => void reportQuery.refetch()}
            disabled={reportQuery.isFetching}
            className="inline-flex h-11 items-center gap-2 border border-black/15 bg-white px-4 text-sm font-bold disabled:opacity-60"
          >
            <RefreshCw className={reportQuery.isFetching ? 'animate-spin' : ''} size={16} />
            Refresh
          </button>
        }
      />

      {reportQuery.isPending ? (
        <Card>
          <div role="status" aria-label="Loading gameweek report">
            <LoadingSkeleton rows={5} />
          </div>
        </Card>
      ) : reportQuery.isError || !reportQuery.data ? (
        <div role="alert">
          <ErrorState
            title="Gameweek report unavailable"
            description={reportQuery.error instanceof Error ? reportQuery.error.message : 'The gameweek report could not be loaded. Please try again shortly.'}
            action={
              <button
                onClick={() => void reportQuery.refetch()}
                disabled={reportQuery.isFetching}
                className="inline-flex h-10 items-center gap-2 bg-[#151a17] px-4 text-sm font-bold text-white disabled:opacity-60"
              >
                <RefreshCw size={16} /> Try again
              </button>
            }
          />
        </div>
      ) : (
        <Card>
          <CardHeader title="Recommended players" detail="Ranked by form in the published report" />
          <p className="border-b border-black/10 px-5 py-4 text-xs text-black/55">
            Report generated: <time dateTime={reportQuery.data.generatedAt}>{dateFormatter.format(new Date(reportQuery.data.generatedAt))}</time>
          </p>
          {reportQuery.data.players.length === 0 ? (
            <EmptyState title="No player recommendations" description="The latest report contains no recommended players. Check back after the next scheduled report." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Top FPL players from the latest gameweek report</caption>
                <thead className="bg-[#f4f4ef] text-xs text-black/55">
                  <tr>
                    <th scope="col" className="px-3 py-3 sm:px-5">Rank</th>
                    <th scope="col" className="px-3 py-3 sm:px-5">Player</th>
                    <th scope="col" className="px-3 py-3 text-right sm:px-5">Form</th>
                    <th scope="col" className="px-3 py-3 text-right sm:px-5">Total points</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/8">
                  {reportQuery.data.players.map((player, index) => (
                    <tr key={`${index}-${player.name}`}>
                      <td className="px-3 py-4 sm:px-5">
                        <span className={`grid size-7 place-items-center text-xs font-bold ${index === 0 ? 'bg-[#b8ff3d] text-[#151a17]' : 'bg-[#f4f4ef] text-black/55'}`}>{index + 1}</span>
                      </td>
                      <th scope="row" className="break-words px-3 py-4 font-bold sm:px-5">{player.name}</th>
                      <td className="px-3 py-4 text-right tabular-nums sm:px-5">{player.form.toFixed(1)}</td>
                      <td className="px-3 py-4 text-right font-bold tabular-nums sm:px-5">{player.total_points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </>
  )
}
