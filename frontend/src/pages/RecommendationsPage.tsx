import { ArrowDownToLine, ArrowRight, ArrowUpFromLine, Clock3, Crown, RefreshCw, ShieldCheck, Sparkles, TrendingDown, UsersRound } from 'lucide-react'
import { Card, CardHeader } from '../components/ui/Card'
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/ui/States'
import { PageHeader } from '../components/ui/PageHeader'
import { PlayerHeadshot } from '../components/player/PlayerHeadshot'
import { getSquadProjection, selectSellCandidates, type SellCandidate } from '../features/recommendations/recommendationSelectors'
import type { CaptainCandidate, LineupPlayer, TransferCombinationRecommendation, TransferRecommendation } from '../models/fpl'
import { useCaptainRecommendationQuery, useLineupRecommendationQuery, useTransferRecommendationsQuery } from '../queries/fplQueries'
import { useTeam } from '../team/useTeam'

export function RecommendationsPage() {
  const { teamId } = useTeam()
  const recommendationQuery = useCaptainRecommendationQuery(teamId)
  const lineupQuery = useLineupRecommendationQuery(teamId)
  const transfersQuery = useTransferRecommendationsQuery(teamId)

  if (recommendationQuery.isPending || lineupQuery.isPending || transfersQuery.isPending) {
    return (
      <>
        <PageHeader eyebrow="Decision support" title="Building your gameweek plan" description="Combining lineup, captaincy, projected points, and transfer recommendations." />
        <div className="grid gap-7 lg:grid-cols-2"><Card><LoadingSkeleton rows={5} /></Card><Card><LoadingSkeleton rows={5} /></Card></div>
      </>
    )
  }

  if (recommendationQuery.isError || lineupQuery.isError || transfersQuery.isError || !recommendationQuery.data || !lineupQuery.data || !transfersQuery.data) {
    const error = recommendationQuery.error ?? lineupQuery.error ?? transfersQuery.error
    return (
      <>
        <PageHeader eyebrow="Decision support" title="Recommendations unavailable" description="Your saved team remains connected." />
        <ErrorState
          description={error instanceof Error ? error.message : 'The recommendation response was incomplete.'}
          action={<button onClick={() => { void recommendationQuery.refetch(); void lineupQuery.refetch(); void transfersQuery.refetch() }} className="inline-flex h-10 items-center gap-2 bg-[#151a17] px-4 text-sm font-bold text-white"><RefreshCw size={16} /> Try again</button>}
        />
      </>
    )
  }

  const recommendation = recommendationQuery.data
  const lineup = lineupQuery.data
  const transfers = transfersQuery.data
  const squadProjection = getSquadProjection(lineup)
  const sellCandidates = selectSellCandidates(transfers.recommendations)
  const bestSingleTransfer = transfers.recommendations[0]
  const bestCombination = transfers.combinations[0]
  const isFetching = recommendationQuery.isFetching || lineupQuery.isFetching || transfersQuery.isFetching

  return (
    <>
      <PageHeader
        eyebrow={`Gameweek ${recommendation.gameweek}`}
        title="Decision dashboard"
        description="One explainable plan for lineup, captaincy, transfers, and the next five gameweeks."
        action={<button onClick={() => { void recommendationQuery.refetch(); void lineupQuery.refetch(); void transfersQuery.refetch() }} disabled={isFetching} className="inline-flex h-11 items-center gap-2 border border-black/15 bg-white px-4 text-sm font-bold disabled:opacity-60"><RefreshCw className={isFetching ? 'animate-spin' : ''} size={16} /> Refresh</button>}
      />

      <section aria-label="Squad projected points" className="mb-7 grid gap-px border border-black/10 bg-black/10 sm:grid-cols-3">
        {squadProjection.map((projection) => (
          <div key={projection.gameweeks} className="bg-white px-5 py-5">
            <p className="text-[10px] font-bold uppercase text-black/35">Next {projection.gameweeks} GW{projection.gameweeks > 1 ? 's' : ''}</p>
            <p className="font-display mt-2 text-3xl font-bold">{projection.projectedPoints.toFixed(2)}</p>
            <p className="mt-1 text-xs text-black/45">Recommended XI projection</p>
          </div>
        ))}
      </section>

      <div className="grid gap-7 lg:grid-cols-2">
        <CandidateCard candidate={recommendation.bestCaptain} role="Captain" icon={Crown} accent="bg-[#b8ff3d]" />
        <CandidateCard candidate={recommendation.viceCaptain} role="Vice captain" icon={ShieldCheck} accent="bg-[#77d6c5]" />
      </div>

      <div className="my-7 flex items-center gap-3"><span className="h-px flex-1 bg-black/10" /><span className="text-[10px] font-bold uppercase text-black/35">Transfer priorities</span><span className="h-px flex-1 bg-black/10" /></div>

      <div className="grid gap-7 xl:grid-cols-2">
        {bestSingleTransfer ? <TransferDecisionCard recommendation={bestSingleTransfer} /> : <Card><EmptyState title="No single transfer" description="No valid one-player upgrade improves the current squad." /></Card>}
        {bestCombination ? <CombinationDecisionCard combination={bestCombination} /> : <Card><EmptyState title="No transfer combination" description="No valid two-player combination improves the current squad." /></Card>}
      </div>

      <Card className="mt-7">
        <CardHeader title="Potential sales" detail="Players recurring most often in the ranked transfer shortlist" action={<TrendingDown size={18} className="text-[#a63625]" />} />
        {sellCandidates.length === 0 ? <EmptyState title="No sale candidates" description="The transfer model does not currently favour selling anyone." /> : <div className="grid divide-y divide-black/8 lg:grid-cols-3 lg:divide-x lg:divide-y-0">{sellCandidates.map((candidate) => <SellCandidateCard key={candidate.player.playerId} candidate={candidate} />)}</div>}
      </Card>

      <div className="my-7 flex items-center gap-3"><span className="h-px flex-1 bg-black/10" /><span className="text-[10px] font-bold uppercase text-black/35">Lineup plan</span><span className="h-px flex-1 bg-black/10" /></div>

      <div className="grid gap-7 xl:grid-cols-[1.45fr_0.75fr]">
        <Card>
          <CardHeader title="Recommended starting XI" detail="Projected points weighted by expected minutes" action={<span className="font-display shrink-0 whitespace-nowrap bg-[#b8ff3d] px-3 py-1.5 text-lg font-bold">{lineup.formation}</span>} />
          <div className="divide-y divide-black/8">
            {(['GKP', 'DEF', 'MID', 'FWD'] as const).map((position) => (
              <LineupRow key={position} position={position} players={lineup.startingXi.filter((player) => player.position === position)} />
            ))}
          </div>
        </Card>

        <div className="space-y-7">
          <Card>
            <CardHeader title="Bench order" detail="Outfield substitution priority" action={<UsersRound size={18} className="text-[#287c50]" />} />
            <div className="divide-y divide-black/8">
              {lineup.bench.map((player, index) => <BenchPlayer key={player.playerId} player={player} order={index + 1} />)}
            </div>
          </Card>
          <Card>
            <CardHeader title="Lineup changes" detail="Compared with your current XI" />
            {lineup.changes.length === 0 ? (
              <EmptyState title="Current XI retained" description="Your existing lineup already matches the recommendation." />
            ) : (
              <div className="divide-y divide-black/8">
                {lineup.changes.map((change) => {
                  const movedIn = change.changeType === 'Moved to starting XI'
                  const Icon = movedIn ? ArrowUpFromLine : ArrowDownToLine
                  return <div key={change.playerId} className="flex items-center gap-3 px-5 py-4"><span className={`grid size-8 place-items-center ${movedIn ? 'bg-[#b8ff3d]' : 'bg-[#ffcec5]'}`}><Icon size={15} /></span><div><p className="text-sm font-bold">{change.playerName}</p><p className="mt-0.5 text-xs text-black/45">{change.changeType}</p></div></div>
                })}
              </div>
            )}
          </Card>
        </div>
      </div>

      <div className="mt-7 grid gap-7 xl:grid-cols-[1.25fr_1fr]">
        <Card>
          <CardHeader title="Why this captain?" detail={recommendation.bestCaptain.playerName} action={<Sparkles size={18} className="text-[#287c50]" />} />
          <FactorBreakdown candidate={recommendation.bestCaptain} />
        </Card>
        <Card>
          <CardHeader title="Alternatives" detail="Next best starting players" />
          {recommendation.alternatives.length === 0 ? (
            <EmptyState title="No alternatives available" description="At least three starting players are needed." />
          ) : (
            <div className="divide-y divide-black/8">
              {recommendation.alternatives.map((candidate, index) => (
                <article key={candidate.playerId} className="grid grid-cols-[2rem_3rem_1fr_auto] items-center gap-3 px-5 py-4">
                  <span className="font-display text-xl font-bold text-black/20">{index + 3}</span>
                  <div className="grid h-14 w-11 place-items-end overflow-hidden bg-[#e5f6ef]"><PlayerHeadshot photoUrl={candidate.photoUrl} playerName={candidate.playerName} className="h-full w-auto" /></div>
                  <div className="min-w-0"><h3 className="truncate text-sm font-bold">{candidate.playerName}</h3><p className="mt-1 text-xs text-black/45">{candidate.teamName} · {candidate.position}</p></div>
                  <div className="text-right"><p className="font-display text-xl font-bold">{candidate.projectedPoints.toFixed(2)}</p><p className="text-[9px] font-bold uppercase text-black/35">projected</p></div>
                </article>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  )
}

function LineupRow({ position, players }: { position: string; players: LineupPlayer[] }) {
  return (
    <section aria-label={position} className="grid gap-3 p-5 sm:grid-cols-[3.25rem_1fr] sm:items-start">
      <span className="pt-3 text-[10px] font-bold uppercase text-black/35">{position}</span>
      <div className="grid gap-px bg-black/8 sm:grid-cols-2">
        {players.map((player) => <LineupPlayerCell key={player.playerId} player={player} />)}
      </div>
    </section>
  )
}

function LineupPlayerCell({ player }: { player: LineupPlayer }) {
  return (
    <div className="flex min-h-24 items-center justify-between gap-3 bg-white p-4">
      <div className="flex min-w-0 items-center gap-3"><div className="grid h-16 w-12 shrink-0 place-items-end overflow-hidden bg-[#e5f6ef]"><PlayerHeadshot photoUrl={player.photoUrl} playerName={player.playerName} className="h-full w-auto" /></div><div className="min-w-0"><p className="truncate text-sm font-bold">{player.playerName}</p><p className="mt-1 truncate text-xs text-black/45">{player.teamName}</p><p className="mt-2 flex items-center gap-1 text-[10px] text-black/40"><Clock3 size={12} /> {player.expectedMinutes.toFixed(0)} min</p></div></div>
      <div className="text-right"><p className="font-display text-xl font-bold">{player.projectedPoints.toFixed(2)}</p><p className="text-[9px] font-bold uppercase text-black/35">projected</p></div>
    </div>
  )
}

function BenchPlayer({ player, order }: { player: LineupPlayer; order: number }) {
  return (
    <div className="grid grid-cols-[2rem_3rem_1fr_auto] items-center gap-3 px-5 py-4">
      <span className="font-display text-xl font-bold text-black/20">{order}</span>
      <div className="grid h-14 w-11 place-items-end overflow-hidden bg-[#e5f6ef]"><PlayerHeadshot photoUrl={player.photoUrl} playerName={player.playerName} className="h-full w-auto" /></div>
      <div className="min-w-0"><p className="truncate text-sm font-bold">{player.playerName}</p><p className="mt-1 text-xs text-black/45">{player.position} · {player.expectedMinutes.toFixed(0)} min</p></div>
      <p className="font-display text-lg font-bold">{player.projectedPoints.toFixed(2)}</p>
    </div>
  )
}

function TransferDecisionCard({ recommendation }: { recommendation: TransferRecommendation }) {
  const explanation = recommendation.explanations.find((item) => item.factor === 'Expected points')?.explanation
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Best single transfer" detail="Highest ranked valid one-player move" action={<ConfidenceBadge score={recommendation.confidenceScore} />} />
      <TransferMove recommendation={recommendation} />
      <HorizonGains gains={recommendation.expectedPointGains} />
      <Explanation text={explanation} />
    </Card>
  )
}

function CombinationDecisionCard({ combination }: { combination: TransferCombinationRecommendation }) {
  const explanation = combination.explanations.find((item) => item.factor === 'Expected points')?.explanation
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Best two-transfer combination" detail="Jointly funded and constraint checked" action={<ConfidenceBadge score={combination.confidenceScore} />} />
      <div className="divide-y divide-black/8">{combination.transfers.map((transfer) => <TransferMove key={`${transfer.playerOut.playerId}-${transfer.playerIn.playerId}`} recommendation={transfer} compact />)}</div>
      <HorizonGains gains={[1, 3, 5].map((gameweeks) => ({ gameweeks, expectedPointGain: combinedGain(combination, gameweeks), playerOutPoints: 0, playerInPoints: 0 }))} />
      <Explanation text={explanation} />
    </Card>
  )
}

function TransferMove({ recommendation, compact = false }: { recommendation: TransferRecommendation; compact?: boolean }) {
  const priceDifference = recommendation.priceDifference
  return (
    <div className={compact ? 'px-5 py-4' : 'p-5'}>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <TransferPlayerName label="Sell" name={recommendation.playerOut.playerName} photoUrl={recommendation.playerOut.photoUrl} detail={`${recommendation.playerOut.teamName} · £${recommendation.playerOut.price.toFixed(1)}m`} tone="bg-[#ffcec5]" />
        <ArrowRight size={18} className="text-black/25" />
        <TransferPlayerName label="Buy" name={recommendation.playerIn.playerName} photoUrl={recommendation.playerIn.photoUrl} detail={`${recommendation.playerIn.teamName} · £${recommendation.playerIn.price.toFixed(1)}m`} tone="bg-[#b8ff3d]" align="right" />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-[10px] text-black/45"><span className="truncate">Next: {recommendation.playerIn.nextFixtures.join(' · ') || 'TBC'}</span><span className="shrink-0 font-bold text-[#151a17]">{priceDifference > 0 ? `Costs £${priceDifference.toFixed(1)}m` : priceDifference < 0 ? `Releases £${Math.abs(priceDifference).toFixed(1)}m` : 'No price change'}</span></div>
    </div>
  )
}

function TransferPlayerName({ label, name, photoUrl, detail, tone, align = 'left' }: { label: string; name: string; photoUrl?: string; detail: string; tone: string; align?: 'left' | 'right' }) {
  return <div className={`flex min-w-0 items-center gap-2 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}><div className="grid h-14 w-11 shrink-0 place-items-end overflow-hidden bg-[#e5f6ef]"><PlayerHeadshot photoUrl={photoUrl} playerName={name} className="h-full w-auto" /></div><div className="min-w-0"><span className={`inline-block px-2 py-1 text-[9px] font-bold uppercase ${tone}`}>{label}</span><p className="mt-2 truncate text-sm font-bold" title={name}>{name}</p><p className="mt-1 truncate text-[10px] text-black/45">{detail}</p></div></div>
}

function HorizonGains({ gains }: { gains: TransferRecommendation['expectedPointGains'] }) {
  return <dl className="grid grid-cols-3 gap-px bg-black/8">{[1, 3, 5].map((gameweeks) => { const gain = gains.find((item) => item.gameweeks === gameweeks)?.expectedPointGain ?? 0; return <div key={gameweeks} className="bg-[#f7f7f3] px-3 py-3 text-center"><dt className="text-[9px] font-bold uppercase text-black/35">{gameweeks} GW</dt><dd className={`font-display mt-1 text-xl font-bold ${gain >= 0 ? 'text-[#287c50]' : 'text-[#a63625]'}`}>{gain >= 0 ? '+' : ''}{gain.toFixed(2)}</dd></div> })}</dl>
}

function Explanation({ text }: { text?: string }) {
  return <div className="flex gap-3 border-t border-black/8 px-5 py-4"><Sparkles size={15} className="mt-0.5 shrink-0 text-[#287c50]" /><p className="text-xs leading-5 text-black/50">{text ?? 'The recommendation combines projected points, fixtures, expected minutes, availability, and budget.'}</p></div>
}

function SellCandidateCard({ candidate }: { candidate: SellCandidate }) {
  return (
    <article className="p-5">
      <div className="flex items-start gap-3"><div className="grid h-16 w-12 shrink-0 place-items-end overflow-hidden bg-[#e5f6ef]"><PlayerHeadshot photoUrl={candidate.player.photoUrl} playerName={candidate.player.playerName} className="h-full w-auto" /></div><div className="min-w-0 flex-1"><p className="truncate font-bold">{candidate.player.playerName}</p><p className="mt-1 text-xs text-black/45">{candidate.player.teamName} · {candidate.player.position}</p></div><ConfidenceBadge score={candidate.confidenceScore} /></div>
      <p className="mt-4 text-xs text-black/50">Best alternative: <strong className="text-[#151a17]">{candidate.replacement.playerName}</strong></p>
      <div className="mt-3 flex items-center justify-between gap-3"><span className="text-[10px] font-bold uppercase text-black/35">In {candidate.appearances} ranked move{candidate.appearances === 1 ? '' : 's'}</span><span className="font-display text-lg font-bold text-[#287c50]">+{candidate.fiveGameweekGain.toFixed(2)}</span></div>
      <p className="mt-3 text-[11px] leading-5 text-black/40">{candidate.reason}</p>
    </article>
  )
}

function ConfidenceBadge({ score }: { score: number }) {
  const highConfidence = score >= 80
  return <span className={`shrink-0 px-2 py-1 text-[9px] font-bold uppercase ${highConfidence ? 'bg-[#e5f6ef] text-[#287c50]' : 'bg-[#fff0cf] text-[#805500]'}`}>{highConfidence ? 'High confidence' : 'Speculative'} · {score.toFixed(0)}%</span>
}

function combinedGain(combination: TransferCombinationRecommendation, gameweeks: number) {
  return combination.expectedPointGains.find((gain) => gain.gameweeks === gameweeks)?.expectedPointGain
    ?? combination.transfers.reduce((total, transfer) => total + (transfer.expectedPointGains.find((gain) => gain.gameweeks === gameweeks)?.expectedPointGain ?? 0), 0)
}

function CandidateCard({ candidate, role, icon: Icon, accent }: { candidate: CaptainCandidate; role: string; icon: typeof Crown; accent: string }) {
  return (
    <Card className="relative overflow-hidden">
      <span className={`absolute inset-y-0 left-0 w-2 ${accent}`} />
      <div className="flex items-start justify-between gap-5 p-6 sm:p-8">
        <div className="flex min-w-0 items-center gap-4"><div className="grid h-24 w-20 shrink-0 place-items-end overflow-hidden bg-[#e5f6ef]"><PlayerHeadshot photoUrl={candidate.photoUrl} playerName={candidate.playerName} className="h-full w-auto" /></div><div className="min-w-0"><div className="flex items-center gap-2 text-xs font-bold uppercase text-[#287c50]"><Icon size={16} /> {role}</div><h2 className="font-display mt-4 truncate text-3xl font-bold">{candidate.playerName}</h2><p className="mt-2 text-sm text-black/45">{candidate.teamName} · {candidate.position}</p></div></div>
        <div className="text-right"><p className="font-display text-4xl font-bold">{candidate.projectedPoints.toFixed(2)}</p><p className="mt-1 text-[10px] font-bold uppercase text-black/35">Projected points</p><p className="mt-4 text-xs text-black/45">Rank score <strong className="text-[#151a17]">{candidate.rankingScore.toFixed(2)}</strong></p></div>
      </div>
    </Card>
  )
}

function FactorBreakdown({ candidate }: { candidate: CaptainCandidate }) {
  return (
    <div className="divide-y divide-black/8">
      {candidate.factors.map((factor) => (
        <article key={factor.factor} className="grid grid-cols-[1fr_auto] gap-4 px-5 py-4">
          <div><h3 className="text-sm font-bold">{factor.factor}</h3><p className="mt-1 text-xs leading-5 text-black/45">{factor.explanation}</p></div>
          <span className={`font-display text-lg font-bold ${factor.score >= 0 ? 'text-[#287c50]' : 'text-[#a63625]'}`}>{factor.score >= 0 ? '+' : ''}{factor.score.toFixed(2)}</span>
        </article>
      ))}
    </div>
  )
}