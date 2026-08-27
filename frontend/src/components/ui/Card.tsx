import type { ReactNode } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`border border-black/10 bg-white ${className}`}>{children}</section>
}

export function CardHeader({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-16 items-center justify-between gap-4 border-b border-black/10 px-5 py-4">
      <div>
        <h2 className="text-sm font-bold text-[#151a17]">{title}</h2>
        {detail && <p className="mt-1 text-xs text-black/45">{detail}</p>}
      </div>
      {action}
    </div>
  )
}