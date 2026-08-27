import { Crown } from 'lucide-react'
import type { FplSquadPick } from '../../models/fpl'
import { PlayerHeadshot } from '../player/PlayerHeadshot'

interface PlayerCardProps {
  player: FplSquadPick
  variant?: 'pitch' | 'bench'
}

export function PlayerCard({ player, variant = 'pitch' }: PlayerCardProps) {
  const status = player.isCaptain ? 'Captain' : player.isViceCaptain ? 'Vice-captain' : null

  return (
    <article
      className={`relative min-w-0 border border-black/15 bg-white text-[#151a17] shadow-[0_4px_0_rgba(21,26,23,0.16)] ${
        variant === 'pitch' ? 'w-full max-w-36' : 'w-full'
      }`}
      aria-label={`${player.displayName}${status ? `, ${status}` : ''}`}
    >
      <div className="flex h-7 items-center justify-between bg-[#151a17] px-2 text-[9px] font-bold uppercase text-white/65 sm:h-8 sm:text-[10px]">
        <span>{player.positionName}</span>
        {status && (
          <span className={`flex items-center gap-1 ${player.isCaptain ? 'text-[#b8ff3d]' : 'text-[#77d6c5]'}`}>
            <Crown size={10} /> {player.isCaptain ? 'C' : 'V'}
          </span>
        )}
      </div>
      <div className="grid h-16 place-items-end overflow-hidden bg-[#e5f6ef] sm:h-20">
        <PlayerHeadshot photoUrl={player.photoUrl} playerName={player.displayName} className="h-full w-auto max-w-full" />
      </div>
      <div className="px-2 py-2 text-center sm:px-3 sm:py-3">
        <h3 className="truncate text-[11px] font-bold sm:text-sm" title={player.displayName}>{player.displayName}</h3>
        <p className="mt-0.5 truncate text-[9px] text-black/45 sm:text-[11px]">{player.teamName}</p>
        <div className="mt-2 grid grid-cols-1 gap-px bg-black/8 text-center sm:grid-cols-3">
          <Metric label="Price" value={`£${player.price.toFixed(1)}`} />
          <Metric label="Pts" value={String(player.gameweekPoints)} />
          <Metric label="Next" value={player.nextOpponent ?? 'TBC'} />
        </div>
      </div>
    </article>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-1 bg-[#f4f4ef] px-1 py-0.5 sm:block sm:px-0.5 sm:py-1.5">
      <p className="text-[7px] font-bold uppercase text-black/35 sm:text-[8px]">{label}</p>
      <p className="truncate text-[8px] font-bold sm:mt-0.5 sm:text-[10px]" title={value}>{value}</p>
    </div>
  )
}