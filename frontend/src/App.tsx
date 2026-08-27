import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { DashboardPage } from './pages/DashboardPage'
import { CoachPage } from './pages/CoachPage'
import { FixturesPage } from './pages/FixturesPage'
import { MyTeamPage } from './pages/MyTeamPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PlayersPage } from './pages/PlayersPage'
import { RecommendationsPage } from './pages/RecommendationsPage'
import { SettingsPage } from './pages/SettingsPage'
import { SetupPage } from './pages/SetupPage'
import { TransfersPage } from './pages/TransfersPage'
import { TeamProvider } from './team/TeamContext'
import { useTeam } from './team/useTeam'

function RequireTeam({ children }: { children: React.ReactNode }) {
  const { teamId } = useTeam()

  return teamId ? children : <Navigate to="/setup" replace />
}

interface AppProps {
  initialTeamId?: number | null
}

function App({ initialTeamId }: AppProps = {}) {
  return (
    <TeamProvider initialTeamId={initialTeamId}>
      <Routes>
        <Route path="setup" element={<SetupPage />} />
        <Route element={<RequireTeam><AppShell /></RequireTeam>}>
          <Route index element={<DashboardPage />} />
          <Route path="team" element={<MyTeamPage />} />
          <Route path="transfers" element={<TransfersPage />} />
          <Route path="players" element={<PlayersPage />} />
          <Route path="fixtures" element={<FixturesPage />} />
          <Route path="recommendations" element={<RecommendationsPage />} />
          <Route path="coach" element={<CoachPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </TeamProvider>
  )
}

export default App
