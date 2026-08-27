import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { FplSquadPick } from '../../models/fpl'
import { Card, CardHeader } from '../ui/Card'
import { EmptyState } from '../ui/States'
import { PlayerHeadshot } from '../player/PlayerHeadshot'

export function SquadSummary({ picks, gameweek }: { picks: FplSquadPick[]; gameweek: number }) {
  const starters = picks.filter((pick) => pick.squadPosition <= 11)
  const bench = picks.filter((pick) => pick.squadPosition > 11)

  return (
    <Card>
      <CardHeader title="Current squad" detail={`Gameweek ${gameweek} selection`} />
      {picks.length === 0 ? (
        <EmptyState title="No squad available" description="Your current gameweek selection has not been published yet." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px bg-black/8 sm:grid-cols-3">
            {starters.map((pick) => <PlayerCell key={pick.playerId} pick={pick} />)}
          </div>
          <div className="border-t border-black/10 bg-[#f4f4ef] px-5 py-3 text-xs font-bold uppercase text-black/45">Bench</div>
          <div className="grid grid-cols-2 gap-px bg-black/8 sm:grid-cols-4">
            {bench.map((pick) => <PlayerCell key={pick.playerId} pick={pick} />)}
          </div>
        </>
      )}
      <Link to="/team" className="flex h-12 items-center justify-center gap-2 border-t border-black/10 text-sm font-bold text-[#287c50]">
        View full team <ArrowRight size={16} />
      </Link>
    </Card>
  )
}

function PlayerCell({ pick }: { pick: FplSquadPick }) {
  return (
    <div className="relative flex min-w-0 items-center gap-3 bg-white px-4 py-3">
      {(pick.isCaptain || pick.isViceCaptain) && (
        <span className={`absolute right-3 top-3 grid size-5 place-items-center rounded-full text-[9px] font-bold ${pick.isCaptain ? 'bg-[#ff795f]' : 'bg-[#77d6c5]'}`}>
          {pick.isCaptain ? 'C' : 'V'}
        </span>
      )}
      <div className="grid h-16 w-12 shrink-0 place-items-end overflow-hidden bg-[#e5f6ef]"><PlayerHeadshot photoUrl={pick.photoUrl} playerName={pick.displayName} className="h-full w-auto" /></div>
      <div className="min-w-0"><p className="truncate pr-6 text-sm font-bold">{pick.displayName}</p><p className="mt-1 truncate text-xs text-black/45">{pick.teamName} · {pick.positionName}</p><p className="mt-3 text-xs font-semibold text-[#287c50]">£{pick.price.toFixed(1)}m</p></div>
    </div>
  )
}