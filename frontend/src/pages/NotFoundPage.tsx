import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="grid min-h-[65vh] place-items-center text-center">
      <div><p className="font-display text-8xl font-bold text-[#ff795f]">404</p><h1 className="mt-3 font-display text-3xl font-bold">Page not found</h1><p className="mt-3 text-sm text-black/50">This part of the touchline is out of bounds.</p><Link to="/" className="mt-7 inline-flex h-11 items-center gap-2 bg-[#151a17] px-5 text-sm font-bold text-white"><ArrowLeft size={17} /> Dashboard</Link></div>
    </div>
  )
}