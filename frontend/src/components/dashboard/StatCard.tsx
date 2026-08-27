import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string
  note: string
  accent: string
  icon: LucideIcon
}

export function StatCard({ label, value, note, accent, icon: Icon }: StatCardProps) {
  return (
    <article className="relative min-h-36 bg-white p-5">
      <span className={`absolute inset-y-0 left-0 w-1 ${accent}`} />
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs font-bold uppercase text-black/45">{label}</p>
        <Icon size={17} className="text-black/25" />
      </div>
      <p className="font-display mt-4 text-3xl font-bold">{value}</p>
      <p className="mt-2 text-xs text-black/45">{note}</p>
    </article>
  )
}