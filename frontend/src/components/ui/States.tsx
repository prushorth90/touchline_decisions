import { AlertCircle, Inbox } from 'lucide-react'
import type { ReactNode } from 'react'

interface StateProps {
  title: string
  description: string
}

export function EmptyState({ title, description }: StateProps) {
  return (
    <div className="grid min-h-56 place-items-center px-6 py-10 text-center">
      <div className="max-w-sm">
        <Inbox className="mx-auto text-black/25" size={30} />
        <h3 className="mt-4 font-display text-xl font-bold">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-black/50">{description}</p>
      </div>
    </div>
  )
}

export function ErrorState({ title = 'Unable to load data', description = 'Try again in a moment.', action }: Partial<StateProps> & { action?: ReactNode }) {
  return (
    <div className="flex min-h-40 items-start gap-4 border border-[#ff795f]/50 bg-[#fff2ee] p-5">
      <AlertCircle className="mt-0.5 shrink-0 text-[#be3e2b]" size={20} />
      <div>
        <h3 className="font-bold text-[#762718]">{title}</h3>
        <p className="mt-1 text-sm text-[#762718]/70">{description}</p>
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  )
}

export function LoadingSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-4 p-5" aria-label="Loading content">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4">
          <div className="size-10 rounded-full bg-black/8" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/5 bg-black/8" />
            <div className="h-2 w-3/5 bg-black/5" />
          </div>
        </div>
      ))}
    </div>
  )
}