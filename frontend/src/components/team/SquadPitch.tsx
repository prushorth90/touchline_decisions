import type { FplSquadPick } from '../../models/fpl'
import { PlayerCard } from './PlayerCard'

const positionOrder = ['GKP', 'DEF', 'MID', 'FWD']

export function SquadPitch({ picks }: { picks: FplSquadPick[] }) {
  const starters = picks.filter((pick) => pick.squadPosition <= 11)
  const bench = picks.filter((pick) => pick.squadPosition > 11)
  const rows = positionOrder
    .map((position) => ({ position, players: starters.filter((pick) => pick.positionName === position) }))
    .filter((row) => row.players.length > 0)

  return (
    <div className="mx-auto w-full max-w-5xl" aria-label="Squad formation">
      <div className="pitch relative overflow-hidden border-4 border-white/70 bg-[#287c50] px-2 py-5 shadow-lg sm:px-5 sm:py-8">
        <div className="pointer-events-none absolute inset-x-[6%] top-1/2 border-t border-white/25" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 size-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25" />
        <div className="pointer-events-none absolute inset-x-[24%] top-0 h-[10%] border-x border-b border-white/25" />
        <div className="pointer-events-none absolute inset-x-[24%] bottom-0 h-[10%] border-x border-t border-white/25" />
        <div className="relative grid min-h-[42rem] grid-rows-4 gap-5 sm:min-h-[48rem] sm:gap-7">
          {rows.map((row) => (
            <section key={row.position} className="flex items-center justify-center" aria-label={row.position}>
              <div className="grid w-full grid-flow-col auto-cols-fr justify-center gap-1.5 sm:gap-4">
                {row.players.map((player) => (
                  <div key={player.playerId} className="flex min-w-0 justify-center">
                    <PlayerCard player={player} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      <section className="mt-4 border border-black/10 bg-[#dfe0d8] p-3 sm:p-5" aria-label="Substitutes">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase text-black/55">Substitutes</h2>
          <span className="text-xs text-black/40">Bench order</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-4">
          {bench.map((player, index) => (
            <div key={player.playerId} className="relative min-w-0">
              <span className="absolute -left-1.5 -top-1.5 z-10 grid size-5 place-items-center rounded-full bg-[#ff795f] text-[9px] font-bold">{index + 1}</span>
              <PlayerCard player={player} variant="bench" />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}