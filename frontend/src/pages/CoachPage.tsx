import { AlertCircle, ArrowRightLeft, Bot, CalendarDays, Check, LoaderCircle, RotateCw, Send, ShieldCheck, UserRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { sendCoachMessageStream } from '../api/coachApi'
import { ApiError } from '../api/fplApi'
import { PageHeader } from '../components/ui/PageHeader'
import type { CoachChatMessage, CoachStructuredRecommendation } from '../models/coach'
import { useTeam } from '../team/useTeam'
import { PlayerHeadshot } from '../components/player/PlayerHeadshot'

const suggestions = [
  'Saka is injured',
  "How are Saka's next 3 fixtures?",
  'Should I sell Saka?',
  'Who can I replace him with?',
]

export function CoachPage() {
  const { teamId } = useTeam()
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<CoachChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Ask me about an injury, captaincy decision, lineup choice, or transfer idea.',
      sentAt: new Date().toISOString(),
    },
  ])
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failedMessage, setFailedMessage] = useState<string | null>(null)
  const [progressStatuses, setProgressStatuses] = useState<string[]>([])

  async function requestReply(message: string, appendUser: boolean) {
    if (!teamId || isSending) return

    if (appendUser) {
      setMessages((current) => [...current, createMessage('user', message)])
    }
    setDraft('')
    setError(null)
    setFailedMessage(null)
    setProgressStatuses([])
    setIsSending(true)

    try {
      const response = await sendCoachMessageStream(
        { teamId, message },
        (update) => setProgressStatuses((current) => current.includes(update.message) ? current : [...current, update.message]),
      )
      setMessages((current) => [...current, {
        id: createId(),
        role: 'assistant',
        content: response.message,
        sentAt: response.respondedAt,
        isMocked: response.isMocked,
        recommendationType: response.recommendationType,
        confidence: response.confidence,
        player: response.player,
        availability: response.availability,
        fixtures: response.fixtures,
        transfers: response.transfers,
        recommendation: response.recommendation,
        structuredRecommendation: response.structuredRecommendation,
      }])
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'The coach could not respond. Try again.')
      setFailedMessage(message)
    } finally {
      setProgressStatuses([])
      setIsSending(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const message = draft.trim()
    if (message) void requestReply(message, true)
  }

  return (
    <>
      <PageHeader
        eyebrow="Team-aware conversation"
        title="AI Coach"
        description="Ask for grounded guidance using structured context from your connected FPL squad."
      />

      <div className="grid min-h-[38rem] overflow-hidden border border-black/10 bg-white lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="flex min-h-[38rem] min-w-0 flex-col" aria-label="Coach conversation">
          <div className="flex-1 space-y-5 overflow-y-auto bg-[#f7f7f3] p-4 sm:p-6" aria-live="polite">
            {messages.map((message) => <ChatBubble key={message.id} message={message} />)}
            {isSending && (
              <div className="flex items-start gap-3">
                <Avatar role="assistant" />
                <div className="min-w-56 border border-black/10 bg-white px-4 py-3 text-sm text-black/55" aria-label="Coach progress">
                  {progressStatuses.length === 0
                    ? <span className="inline-flex items-center gap-2"><LoaderCircle className="animate-spin" size={14} /> Starting analysis</span>
                    : <ol className="space-y-1.5">{progressStatuses.map((status, index) => <li key={status} className="flex items-center gap-2 text-xs">{index === progressStatuses.length - 1 ? <LoaderCircle className="animate-spin text-[#287c50]" size={13} /> : <Check className="text-[#287c50]" size={13} />}<span>{status}</span></li>)}</ol>}
                </div>
              </div>
            )}
            {error && (
              <div role="alert" className="flex items-start gap-3 border border-[#ff795f]/50 bg-[#fff2ee] p-4 text-[#762718]">
                <AlertCircle className="mt-0.5 shrink-0" size={18} />
                <div className="min-w-0 flex-1"><p className="text-sm font-bold">Message not delivered</p><p className="mt-1 text-xs leading-5 text-[#762718]/70">{error}</p></div>
                <button onClick={() => failedMessage && void requestReply(failedMessage, false)} disabled={isSending} className="inline-flex h-9 shrink-0 items-center gap-2 bg-[#a63625] px-3 text-xs font-bold text-white disabled:opacity-60"><RotateCw size={14} /> Retry</button>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="border-t border-black/10 bg-white p-4 sm:p-5">
            <label htmlFor="coach-message" className="sr-only">Message AI Coach</label>
            <div className="flex items-end gap-3">
              <textarea
                id="coach-message"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    event.currentTarget.form?.requestSubmit()
                  }
                }}
                maxLength={1_000}
                rows={2}
                placeholder="Ask about your squad..."
                disabled={isSending}
                className="max-h-36 min-h-14 min-w-0 flex-1 resize-y border border-black/15 bg-[#f4f4ef] px-4 py-3 text-sm outline-none focus:border-[#287c50] disabled:opacity-60"
              />
              <button type="submit" disabled={isSending || !draft.trim()} aria-label="Send message" title="Send message" className="grid size-14 shrink-0 place-items-center bg-[#151a17] text-[#b8ff3d] disabled:cursor-not-allowed disabled:opacity-35"><Send size={19} /></button>
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-black/35"><span>Enter to send · Shift+Enter for a new line</span><span>{draft.length}/1000</span></div>
          </form>
        </section>

        <aside className="border-t border-black/10 bg-[#151a17] p-5 text-white lg:border-l lg:border-t-0">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center bg-[#b8ff3d] text-[#151a17]"><Bot size={19} /></span><div><p className="font-bold">Coach context</p><p className="text-xs text-white/45">Team ID {teamId}</p></div></div>
          <div className="mt-6 flex items-start gap-2 border-y border-white/10 py-4 text-xs leading-5 text-white/55"><ShieldCheck className="mt-0.5 shrink-0 text-[#77d6c5]" size={16} /><p>Your connected Team ID is included with every message.</p></div>
          <p className="mt-6 text-[10px] font-bold uppercase text-[#b8ff3d]">Try asking</p>
          <div className="mt-3 space-y-2">{suggestions.map((suggestion) => <button key={suggestion} onClick={() => void requestReply(suggestion, true)} disabled={isSending} className="w-full border border-white/10 px-3 py-3 text-left text-xs font-semibold text-white/70 hover:border-[#b8ff3d]/50 hover:text-white disabled:opacity-40">{suggestion}</button>)}</div>
          <p className="mt-6 text-[10px] leading-4 text-white/35">Availability, fixtures, transfer constraints, and recommendations are evaluated deterministically in the FastAPI backend.</p>
        </aside>
      </div>
    </>
  )
}

function ChatBubble({ message }: { message: CoachChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <Avatar role={message.role} />
      <div className={`max-w-[min(34rem,82%)] px-4 py-3 text-sm leading-6 ${isUser ? 'bg-[#151a17] text-white' : 'border border-black/10 bg-white text-[#151a17]'}`}>
        <p>{message.content}</p>
        {message.structuredRecommendation && <RecommendationCard recommendation={message.structuredRecommendation} />}
        {message.player && (
          <div className="mt-3 flex items-center gap-3 border-t border-black/8 pt-3">
            <div className="grid h-14 w-11 shrink-0 place-items-end overflow-hidden bg-[#e5f6ef]"><PlayerHeadshot photoUrl={message.player.photoUrl} playerName={message.player.playerName} className="h-full w-auto" /></div>
            <div className="min-w-0"><p className="truncate text-xs font-bold">{message.player.playerName}</p><p className="mt-0.5 text-[10px] text-black/45">{message.player.teamName} · {message.player.position}{message.player.chanceOfPlayingNextRound !== null ? ` · ${message.player.chanceOfPlayingNextRound}% chance` : ''}</p></div>
          </div>
        )}
        {message.availability && (
          <dl className="mt-3 grid grid-cols-2 gap-px bg-black/8 text-[10px] sm:grid-cols-4">
            <AvailabilityMetric label="Status" value={message.availability.statusDescription} />
            <AvailabilityMetric label="Chance" value={message.availability.chanceOfPlayingNextRound === null ? 'Not supplied' : `${message.availability.chanceOfPlayingNextRound}%`} />
            <AvailabilityMetric label="Expected return" value={message.availability.expectedReturn ?? 'Not known'} />
            <AvailabilityMetric label="Confidence" value={`${message.availability.confidence.toFixed(0)}%`} />
          </dl>
        )}
        {message.fixtures && (
          <div className="mt-3 border-t border-black/8 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase text-black/45"><CalendarDays size={13} /> Next {message.fixtures.requestedGameweeks} gameweeks</span>
              <span className="text-[10px] font-bold text-[#287c50]">{message.fixtures.scheduleRating} · Score {formatScore(message.fixtures.aggregateScore)}</span>
            </div>
            <div className="mt-2 divide-y divide-black/8 border-y border-black/8">
              {message.fixtures.fixtures.map((fixture) => (
                <div key={fixture.fixtureId} className="grid grid-cols-[3rem_minmax(0,1fr)_3rem] items-center gap-2 py-2 text-[10px]">
                  <span className="font-bold text-black/40">GW{fixture.gameweek}</span>
                  <span className="truncate font-semibold">{fixture.opponent} ({fixture.isHome ? 'H' : 'A'})</span>
                  <span className="text-right font-bold">FDR {fixture.difficulty}</span>
                </div>
              ))}
              {message.fixtures.fixtures.length === 0 && <p className="py-2 text-[10px] text-black/45">No published fixtures.</p>}
            </div>
          </div>
        )}
        {message.transfers && (
          <div className="mt-3 border-t border-black/8 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px]">
              <span className="inline-flex items-center gap-1.5 font-bold uppercase text-black/45"><ArrowRightLeft size={13} /> Ranked replacements</span>
              <span className="font-bold text-[#287c50]">Bank £{message.transfers.bank.toFixed(1)}m · Max £{message.transfers.maximumPurchasePrice.toFixed(1)}m</span>
            </div>
            <ol className="mt-2 divide-y divide-black/8 border-y border-black/8">
              {message.transfers.candidates.map((candidate) => (
                <li key={candidate.player.playerId} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2 py-2.5 text-[10px]">
                  <span className="font-bold text-black/35">{candidate.rank}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className="font-bold">{candidate.player.playerName} · {candidate.player.teamName} · {candidate.player.position}</span>
                      <span className="font-bold text-[#287c50]">{formatSigned(candidate.projectedPointDifference)} pts</span>
                    </div>
                    <p className="mt-0.5 text-black/45">£{candidate.player.price.toFixed(1)}m · {formatSignedCurrency(candidate.priceDifference)} · {candidate.confidence.toFixed(0)}% confidence</p>
                    <p className="mt-1 leading-4 text-black/65">{candidate.reason}</p>
                  </div>
                </li>
              ))}
              {message.transfers.candidates.length === 0 && <li className="py-2 text-[10px] text-black/45">No valid improving replacements found.</li>}
            </ol>
          </div>
        )}
        {(message.isMocked || message.recommendationType) && <div className="mt-2 flex flex-wrap gap-2 text-[9px] font-bold uppercase text-[#287c50]">{message.isMocked && <span>Mocked response</span>}{message.recommendationType && <span>{message.recommendationType}</span>}{message.confidence !== undefined && <span>{message.confidence.toFixed(0)}% confidence</span>}</div>}
      </div>
    </div>
  )
}

function AvailabilityMetric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 bg-[#f4f4ef] px-2 py-2"><dt className="font-bold uppercase text-black/35">{label}</dt><dd className="mt-1 break-words font-semibold text-[#151a17]">{value}</dd></div>
}

function RecommendationCard({ recommendation }: { recommendation: CoachStructuredRecommendation }) {
  const replacement = recommendation.suggestedReplacement
  return (
    <section className="mt-3 border border-[#287c50]/30 bg-[#edf7f1]" aria-label="Structured recommendation">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#287c50]/20 px-3 py-2.5">
        <div><p className="text-[9px] font-bold uppercase text-[#287c50]">Recommendation</p><p className="text-sm font-black uppercase text-[#155c39]">{recommendation.recommendedAction} {recommendation.detectedPlayer.playerName}</p></div>
        <div className="text-right"><p className="text-xs font-black text-[#155c39]">{formatSigned(recommendation.projectedImpact)} pts</p><p className="text-[9px] text-[#287c50]">{recommendation.projectionGameweeks} GW · {recommendation.confidence.toFixed(0)}% confidence</p></div>
      </div>
      <dl className="grid grid-cols-2 gap-px bg-[#287c50]/15 text-[10px] sm:grid-cols-3">
        <RecommendationMetric label="Injury status" value={recommendation.injuryStatus.description} />
        <RecommendationMetric label="Fixtures" value={`${recommendation.upcomingFixtureSummary.scheduleRating} · FDR ${formatScore(recommendation.upcomingFixtureSummary.averageDifficulty)}`} />
        <RecommendationMetric label="Replacement" value={replacement ? `${replacement.playerName} · £${replacement.price.toFixed(1)}m` : 'None suggested'} />
      </dl>
      <p className="px-3 py-2.5 text-[10px] leading-4 text-[#214a36]">{recommendation.reason}</p>
      {replacement && <p className="border-t border-[#287c50]/15 px-3 py-2 text-[9px] text-[#287c50]">{replacement.teamName} · {replacement.position} · {formatSignedCurrency(replacement.priceDifference)} · {formatSigned(replacement.projectedPointDifference)} projected pts</p>}
    </section>
  )
}

function RecommendationMetric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 bg-[#f7fcf9] px-3 py-2"><dt className="font-bold uppercase text-[#287c50]">{label}</dt><dd className="mt-0.5 break-words font-semibold text-[#153d2a]">{value}</dd></div>
}

function Avatar({ role }: { role: CoachChatMessage['role'] }) {
  return <span className={`grid size-9 shrink-0 place-items-center ${role === 'user' ? 'bg-[#ff795f]' : 'bg-[#b8ff3d]'}`}>{role === 'user' ? <UserRound size={16} /> : <Bot size={17} />}</span>
}

function createMessage(role: CoachChatMessage['role'], content: string): CoachChatMessage {
  return { id: createId(), role, content, sentAt: new Date().toISOString() }
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function formatScore(score: number | null) {
  return score === null ? 'N/A' : score.toFixed(2)
}

function formatSigned(value: number) {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}`
}

function formatSignedCurrency(value: number) {
  return `${value > 0 ? '+' : value < 0 ? '-' : ''}£${Math.abs(value).toFixed(1)}m`
}