import { ArrowRight, LoaderCircle } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { TeamVerificationError, verifyTeam } from '../../api/fplApi'
import type { FplTeam } from '../../models/fpl'

interface TeamIdFormProps {
  initialValue?: number | null
  submitLabel: string
  onVerified: (teamId: number, team: FplTeam) => void
}

export function TeamIdForm({ initialValue, submitLabel, onVerified }: TeamIdFormProps) {
  const [value, setValue] = useState(initialValue ? String(initialValue) : '')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedValue = value.trim()

    if (!/^\d+$/.test(trimmedValue)) {
      setError('Enter a numeric FPL team ID.')
      return
    }

    const teamId = Number(trimmedValue)
    if (!Number.isSafeInteger(teamId) || teamId <= 0) {
      setError('Enter a positive FPL team ID.')
      return
    }

    setError(null)
    setIsSubmitting(true)

    try {
      const team = await verifyTeam(teamId)
      onVerified(teamId, team)
    } catch (verificationError) {
      setError(
        verificationError instanceof TeamVerificationError
          ? verificationError.message
          : 'Unable to verify this team right now.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <label htmlFor="fpl-team-id" className="text-sm font-bold">FPL team ID</label>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        <input
          id="fpl-team-id"
          name="teamId"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          inputMode="numeric"
          autoComplete="off"
          placeholder="e.g. 1234567"
          aria-describedby={error ? 'team-id-error' : undefined}
          aria-invalid={Boolean(error)}
          className="h-12 min-w-0 flex-1 border border-black/20 bg-white px-4 text-base outline-none focus:border-[#287c50]"
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex h-12 items-center justify-center gap-2 bg-[#151a17] px-5 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60"
        >
          {isSubmitting ? <LoaderCircle className="animate-spin" size={17} /> : <ArrowRight size={17} />}
          {isSubmitting ? 'Checking team' : submitLabel}
        </button>
      </div>
      {error && <p id="team-id-error" role="alert" className="mt-3 text-sm font-semibold text-[#a63625]">{error}</p>}
    </form>
  )
}