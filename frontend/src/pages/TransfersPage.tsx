import { ArrowRight, Banknote, CalendarDays, RefreshCw, Repeat2, ShieldCheck } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Card } from '../components/ui/Card'
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/ui/States'
import { PageHeader } from '../components/ui/PageHeader'
import { PlayerHeadshot } from '../components/player/PlayerHeadshot'
import { combinationGainForHorizon, sortTransferCombinations, sortTransferRecommendations, type RecommendationHorizon } from '../features/transfers/transferSelectors'
import type { TransferCombinationRecommendation, TransferHorizonGain, TransferPlayer, TransferRecommendation } from '../models/fpl'
import { useFplTeamQuery, useTransferRecommendationsQuery } from '../queries/fplQueries'
import { useTeam } from '../team/useTeam'

export function TransfersPage() {
  const { teamId } = useTeam()
  const teamQuery = useFplTeamQuery(teamId)
  const transfersQuery = useTransferRecommendationsQuery(teamId)
  const [horizon, setHorizon] = useState<RecommendationHorizon>('short')

  if (teamQuery.isPending || transfersQuery.isPending) {
    return (
      <>
        <PageHeader eyebrow="Transfer planner" title="Finding squad upgrades" description="Checking prices, fixtures, availability, and projected points across the market." />
        <div className="mb-7 grid gap-px border border-black/10 bg-black/10 sm:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <div key={index} className="bg-white"><LoadingSkeleton rows={1} /></div>)}</div>
        <div className="grid gap-5 lg:grid-cols-2"><Card><LoadingSkeleton rows={5} /></Card><Card><LoadingSkeleton rows={5} /></Card></div>
      </>
    )
  }

  if (teamQuery.isError || transfersQuery.isError || !teamQuery.data || !transfersQuery.data) {
    const error = teamQuery.error ?? transfersQuery.error
    return (
      <>
        <PageHeader eyebrow="Transfer planner" title="Recommendations unavailable" description="Your squad remains connected while the market data reloads." />
        <ErrorState
          description={error instanceof Error ? error.message : 'The transfer recommendation response was incomplete.'}
          action={<button onClick={() => { void teamQuery.refetch(); void transfersQuery.refetch() }} className="inline-flex h-10 items-center gap-2 bg-[#151a17] px-4 text-sm font-bold text-white"><RefreshCw size={16} /> Try again</button>}
        />
      </>
    )
  }

  const team = teamQuery.data
  const response = transfersQuery.data
  const isFetching = teamQuery.isFetching || transfersQuery.isFetching
  const singles = sortTransferRecommendations(response.recommendations, horizon)
  const combinations = sortTransferCombinations(response.combinations, horizon)

  return (
    <>
      <PageHeader
        eyebrow={`Gameweek ${response.gameweek}`}
        title="Transfer recommendations"
        description="Ranked squad upgrades that respect your budget, positions, and the three-player club limit."
        action={<button onClick={() => { void teamQuery.refetch(); void transfersQuery.refetch() }} disabled={isFetching} className="inline-flex h-11 items-center gap-2 border border-black/15 bg-white px-4 text-sm font-bold disabled:opacity-60"><RefreshCw className={isFetching ? 'animate-spin' : ''} size={16} /> Refresh</button>}
      />

      <div className="mb-7 grid gap-px border border-black/10 bg-black/10 sm:grid-cols-3">
        <Metric label="Free transfers" value={team.freeTransfers === null ? 'Unavailable' : String(team.freeTransfers)} note={team.freeTransfers === null ? 'Private FPL account data' : 'Available this gameweek'} />
        <Metric label="Money in bank" value={`£${response.bank.toFixed(1)}m`} note="Available before player sales" />
        <Metric label="Recommendations" value={`${singles.length} + ${combinations.length}`} note="Single moves + combinations" />
      </div>

      <div className="mb-8 flex flex-col gap-4 border-y border-black/10 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-sm font-bold">Recommendation horizon</p><p className="mt-1 text-xs text-black/45">Re-rank the shortlist by immediate or sustained improvement.</p></div>
        <div className="grid grid-cols-2 border border-black/15 bg-white p-1" role="group" aria-label="Recommendation horizon">
          <HorizonButton active={horizon === 'short'} onClick={() => setHorizon('short')} label="Short term" detail="1 GW" />
          <HorizonButton active={horizon === 'long'} onClick={() => setHorizon('long')} label="Long term" detail="5 GW" />
        </div>
      </div>

      <RecommendationSection title="One-transfer moves" detail={`${singles.length} ranked options · sorted by ${horizon === 'short' ? '1-GW' : '5-GW'} gain`}>
        {singles.length === 0 ? <Card><EmptyState title="No single upgrade found" description="No affordable one-player move currently improves the projection." /></Card> : (
          <div className="grid gap-5 xl:grid-cols-2">{singles.map((recommendation, index) => <SingleTransferCard key={`${recommendation.playerOut.playerId}-${recommendation.playerIn.playerId}`} recommendation={recommendation} rank={index + 1} />)}</div>
        )}
      </RecommendationSection>

      <RecommendationSection title="Two-transfer combinations" detail={`${combinations.length} jointly funded options · sorted by ${horizon === 'short' ? '1-GW' : '5-GW'} gain`}>
        {combinations.length === 0 ? <Card><EmptyState title="No combination upgrade found" description="No valid pair of transfers improves the squad within the available funds." /></Card> : (
          <div className="grid gap-5 xl:grid-cols-2">{combinations.map((combination, index) => <CombinationCard key={combinationKey(combination)} combination={combination} rank={index + 1} />)}</div>
        )}
      </RecommendationSection>
    </>
  )
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="min-w-0 bg-white px-5 py-4"><p className="text-xs text-black/45">{label}</p><p className="font-display mt-1 break-words text-2xl font-bold">{value}</p><p className="mt-1 text-[10px] text-black/35">{note}</p></div>
}

function HorizonButton({ active, onClick, label, detail }: { active: boolean; onClick: () => void; label: string; detail: string }) {
  return <button onClick={onClick} aria-pressed={active} className={`min-w-28 px-4 py-2 text-left ${active ? 'bg-[#151a17] text-white' : 'text-black/50'}`}><span className="block text-xs font-bold">{label}</span><span className={`mt-0.5 block text-[9px] font-bold uppercase ${active ? 'text-[#b8ff3d]' : 'text-black/35'}`}>{detail}</span></button>
}

function RecommendationSection({ title, detail, children }: { title: string; detail: string; children: ReactNode }) {
  return <section className="mb-10"><div className="mb-4"><h2 className="font-display text-2xl font-bold">{title}</h2><p className="mt-1 text-xs text-black/45">{detail}</p></div>{children}</section>
}

function SingleTransferCard({ recommendation, rank }: { recommendation: TransferRecommendation; rank: number }) {
  const reason = recommendation.explanations.find((item) => item.factor === 'Expected points')?.explanation
  return (
    <Card className="overflow-hidden">
      <RecommendationHeader rank={rank} confidence={recommendation.confidenceScore} priceDifference={recommendation.priceDifference} />
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-black/8 p-5">
        <PlayerSummary player={recommendation.playerOut} role="Sell" tone="bg-[#ffcec5]" />
        <ArrowRight size={19} className="text-black/25" />
        <PlayerSummary player={recommendation.playerIn} role="Buy" tone="bg-[#b8ff3d]" align="right" />
      </div>
      <Fixtures player={recommendation.playerIn} />
      <GainGrid gains={recommendation.expectedPointGains} />
      {reason && <p className="border-t border-black/8 px-5 py-4 text-xs leading-5 text-black/50">{reason}</p>}
    </Card>
  )
}

function CombinationCard({ combination, rank }: { combination: TransferCombinationRecommendation; rank: number }) {
  const gains = [1, 3, 5].map((gameweeks) => ({ gameweeks, expectedPointGain: combinationGainForHorizon(combination, gameweeks), playerOutPoints: 0, playerInPoints: 0 }))
  const reason = combination.explanations.find((item) => item.factor === 'Expected points')?.explanation
  return (
    <Card className="overflow-hidden">
      <RecommendationHeader rank={rank} confidence={combination.confidenceScore} priceDifference={combination.totalPriceDifference} combination />
      <div className="divide-y divide-black/8">
        {combination.transfers.map((transfer) => (
          <div key={`${transfer.playerOut.playerId}-${transfer.playerIn.playerId}`} className="p-5">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3"><PlayerSummary player={transfer.playerOut} role="Sell" tone="bg-[#ffcec5]" /><ArrowRight size={18} className="text-black/25" /><PlayerSummary player={transfer.playerIn} role="Buy" tone="bg-[#b8ff3d]" align="right" /></div>
            <Fixtures player={transfer.playerIn} compact />
          </div>
        ))}
      </div>
      <GainGrid gains={gains} />
      {reason && <p className="border-t border-black/8 px-5 py-4 text-xs leading-5 text-black/50">{reason}</p>}
    </Card>
  )
}

function RecommendationHeader({ rank, confidence, priceDifference, combination = false }: { rank: number; confidence: number; priceDifference: number; combination?: boolean }) {
  const priceLabel = priceDifference > 0 ? `Costs £${priceDifference.toFixed(1)}m` : priceDifference < 0 ? `Releases £${Math.abs(priceDifference).toFixed(1)}m` : 'No price change'
  return <div className="flex items-center justify-between gap-3 bg-[#151a17] px-5 py-3 text-white"><div className="flex items-center gap-3"><span className="font-display text-xl font-bold text-[#b8ff3d]">#{rank}</span><span className="flex items-center gap-1.5 text-xs font-bold text-white/65">{combination ? <Repeat2 size={14} /> : <Banknote size={14} />}{priceLabel}</span></div><span className="flex items-center gap-1.5 text-xs font-bold"><ShieldCheck size={14} className="text-[#77d6c5]" />{confidence.toFixed(0)}% confidence</span></div>
}

function PlayerSummary({ player, role, tone, align = 'left' }: { player: TransferPlayer; role: string; tone: string; align?: 'left' | 'right' }) {
  return <div className={`flex min-w-0 items-center gap-2 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}><div className="grid h-16 w-12 shrink-0 place-items-end overflow-hidden bg-[#e5f6ef]"><PlayerHeadshot photoUrl={player.photoUrl} playerName={player.playerName} className="h-full w-auto" /></div><div className="min-w-0"><span className={`inline-block px-2 py-1 text-[9px] font-bold uppercase ${tone}`}>{role} · {player.position}</span><p className="mt-2 truncate text-sm font-bold" title={player.playerName}>{player.playerName}</p><p className="mt-1 truncate text-[10px] text-black/45">{player.teamName} · £{player.price.toFixed(1)}m</p></div></div>
}

function Fixtures({ player, compact = false }: { player: TransferPlayer; compact?: boolean }) {
  return <div className={`flex min-w-0 items-center gap-2 ${compact ? 'mt-3' : 'border-b border-black/8 px-5 py-3'}`}><CalendarDays size={13} className="shrink-0 text-black/30" /><span className="shrink-0 text-[9px] font-bold uppercase text-black/35">Next</span><div className="flex min-w-0 gap-1.5 overflow-hidden">{player.nextFixtures.length > 0 ? player.nextFixtures.map((fixture) => <span key={fixture} className="shrink-0 bg-[#f0f0ea] px-2 py-1 text-[10px] font-bold">{fixture}</span>) : <span className="text-[10px] text-black/40">TBC</span>}</div></div>
}

function GainGrid({ gains }: { gains: TransferHorizonGain[] }) {
  return <dl className="grid grid-cols-3 gap-px bg-black/8">{[1, 3, 5].map((gameweeks) => { const gain = gains.find((item) => item.gameweeks === gameweeks)?.expectedPointGain ?? 0; return <div key={gameweeks} className="bg-[#f7f7f3] px-3 py-3 text-center"><dt className="text-[9px] font-bold uppercase text-black/35">{gameweeks} GW</dt><dd className={`font-display mt-1 text-xl font-bold ${gain >= 0 ? 'text-[#287c50]' : 'text-[#a63625]'}`}>{gain >= 0 ? '+' : ''}{gain.toFixed(2)}</dd></div> })}</dl>
}

function combinationKey(combination: TransferCombinationRecommendation) {
  return combination.transfers.map((transfer) => `${transfer.playerOut.playerId}-${transfer.playerIn.playerId}`).sort().join(':')
}