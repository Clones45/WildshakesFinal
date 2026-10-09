import { requirePanelAccess } from '@/lib/portal/access'
import { loadFranchiseBranches, loadLastPosActivity } from '@/lib/franchise/portal'
import FranchiserPosDeviceClient from '@/components/franchiser/FranchiserPosDeviceClient'

export default async function FranchiserPosDevicePage() {
  const { supabase, user } = await requirePanelAccess('franchise', 'pos_device')
  const franchiseId = (user?.app_metadata as Record<string, string>)?.franchise_id

  // The primary branch's POS status.
  const branches = await loadFranchiseBranches(supabase, franchiseId)
  const branch = branches[0]
  const lastActivityAt = branch ? await loadLastPosActivity(supabase, branch.id) : null

  return (
    <FranchiserPosDeviceClient
      branchId={branch?.id || ''}
      branchName={branch?.name || ''}
      branchLocation={branch?.location || ''}
      activeDeviceId={branch?.active_device_id || null}
      lastActivityAt={lastActivityAt}
    />
  )
}
