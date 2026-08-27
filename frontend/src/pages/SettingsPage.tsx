import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TeamIdForm } from '../components/team/TeamIdForm'
import { Card, CardHeader } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { useTeam } from '../team/useTeam'

export function SettingsPage() {
  const { teamId, saveTeamId, removeTeamId } = useTeam()
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const [isConfirmingRemoval, setIsConfirmingRemoval] = useState(false)
  const navigate = useNavigate()

  return (
    <>
      <PageHeader eyebrow="Preferences" title="Settings" description="Manage the public FPL team connected to this browser." />
      <div className="max-w-3xl space-y-7">
        <Card>
          <CardHeader title="Connected team" detail={`Current team ID: ${teamId}`} />
          <div className="p-5 sm:p-7">
            <TeamIdForm
              initialValue={teamId}
              submitLabel="Verify and save"
              onVerified={(verifiedTeamId, team) => {
                saveTeamId(verifiedTeamId)
                setSavedMessage(`${team.teamName} is now connected.`)
              }}
            />
            {savedMessage && <p role="status" className="mt-4 border-l-4 border-[#287c50] bg-[#e5f6ef] px-4 py-3 text-sm font-semibold text-[#185b39]">{savedMessage}</p>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Remove team" detail="Return this browser to first-time setup" />
          <div className="p-5 sm:p-7">
            {!isConfirmingRemoval ? (
              <button onClick={() => setIsConfirmingRemoval(true)} className="inline-flex h-11 items-center gap-2 border border-[#be3e2b] px-4 text-sm font-bold text-[#a63625]"><Trash2 size={17} /> Remove saved team</button>
            ) : (
              <div className="border border-[#ff795f]/50 bg-[#fff2ee] p-5">
                <p className="font-bold text-[#762718]">Remove team ID {teamId}?</p>
                <p className="mt-2 text-sm text-[#762718]/70">You will need to verify a team again before using the app.</p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button onClick={() => { removeTeamId(); navigate('/setup', { replace: true }) }} className="h-10 bg-[#a63625] px-4 text-sm font-bold text-white">Yes, remove team</button>
                  <button onClick={() => setIsConfirmingRemoval(false)} className="h-10 border border-black/15 bg-white px-4 text-sm font-bold">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  )
}