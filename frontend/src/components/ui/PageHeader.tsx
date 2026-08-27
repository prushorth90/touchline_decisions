import type { ReactNode } from 'react'

interface PageHeaderProps {
  eyebrow?: string
  title: string
  description: string
  action?: ReactNode
}

export function PageHeader({ eyebrow, title, description, action }: PageHeaderProps) {
  return (
    <header className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div className="min-w-0 max-w-3xl">
        {eyebrow && <p className="mb-2 text-xs font-bold uppercase text-[#287c50]">{eyebrow}</p>}
        <h1 className="font-display break-words text-4xl font-bold leading-tight text-[#151a17] [overflow-wrap:anywhere] sm:text-5xl">{title}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-black/55 sm:text-base">{description}</p>
      </div>
      {action}
    </header>
  )
}