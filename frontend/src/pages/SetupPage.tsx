import { Check, Sparkles } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import { TeamIdForm } from '../components/team/TeamIdForm'
import { useTeam } from '../team/useTeam'

export function SetupPage() {
  const { teamId, saveTeamId } = useTeam()
  const navigate = useNavigate()

  if (teamId) {
    return <Navigate to="/" replace />
  }

  return (
    <main className="grid min-h-screen bg-[#f4f4ef] lg:grid-cols-[minmax(20rem,0.8fr)_1.2fr]">
      <section className="flex flex-col justify-between bg-[#151a17] p-5 text-white sm:p-10 lg:p-16">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center bg-[#b8ff3d] text-[#151a17]"><Sparkles size={21} /></span>
          <span className="font-display text-2xl font-bold">Touchline</span>
        </div>
        <div className="my-10 max-w-lg sm:my-14 lg:my-0">
          <p className="text-xs font-bold uppercase text-[#b8ff3d]">Your decision room</p>
          <h1 className="font-display mt-4 text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">Bring your team into focus.</h1>
          <p className="mt-5 max-w-md leading-7 text-white/60">Connect your public fantasy team to build a workspace around your squad, fixtures, and transfer decisions.</p>
        </div>
        <p className="text-xs text-white/40">Your team ID stays in this browser.</p>
      </section>

      <section className="relative flex items-center px-5 py-10 sm:px-12 sm:py-14 lg:px-20">
        <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(21,26,23,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(21,26,23,0.08)_1px,transparent_1px)] [background-size:40px_40px]" />
        <div className="relative w-full max-w-xl">
          <p className="text-xs font-bold uppercase text-[#287c50]">One-time setup</p>
          <h2 className="font-display mt-3 text-4xl font-bold">Find your FPL team</h2>
          <p className="mt-4 text-sm leading-6 text-black/55">Enter the numeric ID from your public FPL team URL. We will verify it before saving anything.</p>
          <div className="mt-8 border border-black/10 bg-white p-5 sm:p-7">
            <TeamIdForm
              submitLabel="Connect team"
              onVerified={(verifiedTeamId) => {
                saveTeamId(verifiedTeamId)
                navigate('/', { replace: true })
              }}
            />
          </div>
          <div className="mt-6 flex gap-3 text-sm text-black/50"><Check className="shrink-0 text-[#287c50]" size={18} /><p>Only public FPL information is requested. No login credentials are needed.</p></div>
        </div>
      </section>
    </main>
  )
}