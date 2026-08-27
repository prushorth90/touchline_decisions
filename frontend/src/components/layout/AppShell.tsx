import {
  ArrowLeftRight,
  CalendarDays,
  LayoutDashboard,
  Lightbulb,
  MessagesSquare,
  Settings,
  Shield,
  Sparkles,
  Users,
} from 'lucide-react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useFplTeamQuery } from '../../queries/fplQueries'
import { useTeam } from '../../team/useTeam'

const navigation = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard, end: true },
  { label: 'My Team', to: '/team', icon: Shield },
  { label: 'Transfers', to: '/transfers', icon: ArrowLeftRight },
  { label: 'Players', to: '/players', icon: Users },
  { label: 'Fixtures', to: '/fixtures', icon: CalendarDays },
  { label: 'Recommendations', to: '/recommendations', icon: Lightbulb },
  { label: 'AI Coach', to: '/coach', icon: MessagesSquare },
]

export function AppShell() {
  const { teamId } = useTeam()
  const teamQuery = useFplTeamQuery(teamId)

  return (
    <div className="min-h-screen bg-[#f4f4ef] text-[#191c1a]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-black/10 bg-[#151a17] text-white lg:flex lg:flex-col">
        <div className="flex h-20 items-center gap-3 border-b border-white/10 px-6">
          <span className="grid size-10 place-items-center bg-[#b8ff3d] text-[#151a17]">
            <Sparkles size={20} strokeWidth={2.5} />
          </span>
          <div>
            <p className="font-display text-xl font-bold">Touchline</p>
            <p className="text-xs text-white/55">Decision room</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-6" aria-label="Primary navigation">
          {navigation.map(({ label, to, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex h-11 items-center gap-3 px-3 text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-[#b8ff3d] text-[#151a17]'
                    : 'text-white/65 hover:bg-white/8 hover:text-white'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <Link to="/settings" className="mx-3 flex h-11 items-center gap-3 px-3 text-sm font-semibold text-white/65 hover:bg-white/8 hover:text-white">
          <Settings size={18} />
          Settings
        </Link>

        <div className="m-3 border border-white/10 bg-white/5 p-4">
          <p className="text-xs font-bold uppercase text-[#b8ff3d]">Gameweek 1</p>
          <p className="mt-2 text-sm font-semibold">Deadline Friday</p>
          <p className="mt-1 text-xs text-white/50">17:30 local time</p>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-black/10 bg-[#f4f4ef]/95 px-4 backdrop-blur sm:px-7 lg:h-20 lg:px-10">
          <div className="flex items-center gap-3 lg:hidden">
            <span className="grid size-9 place-items-center bg-[#151a17] text-[#b8ff3d]">
              <Sparkles size={18} />
            </span>
            <span className="font-display text-lg font-bold">Touchline</span>
          </div>
          <p className="hidden text-sm text-black/50 lg:block">Fantasy squad workspace</p>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-bold">{teamQuery.data?.teamName ?? `Team ${teamId}`}</p>
              <p className="text-xs text-black/45">{teamQuery.data?.managerName ?? `Team ID ${teamId}`}</p>
            </div>
            <Link to="/settings" aria-label="Team settings" title="Team settings" className="grid size-9 place-items-center rounded-full bg-[#ff795f] text-[#151a17]">
              <Settings size={17} />
            </Link>
          </div>
        </header>

        <main className="mx-auto min-h-[calc(100vh-8rem)] max-w-[1500px] px-4 pb-24 pt-7 sm:px-7 lg:min-h-[calc(100vh-5rem)] lg:px-10 lg:py-10">
          <Outlet />
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-30 grid h-16 grid-cols-7 border-t border-black/10 bg-[#151a17] px-1 text-white lg:hidden" aria-label="Mobile navigation">
          {navigation.map(({ label, to, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              aria-label={label}
              title={label}
              className={({ isActive }) =>
                `grid place-items-center ${isActive ? 'text-[#b8ff3d]' : 'text-white/45'}`
              }
            >
              <Icon size={20} />
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}