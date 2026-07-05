import { requirePanelAccess } from '@/lib/portal/access'
import FranchiserPosDeviceClient from '@/components/franchiser/FranchiserPosDeviceClient'

export default async function FranchiserPosDevicePage() {
  const { supabase, user } = await requirePanelAccess('franchise', 'pos_device')
  const franchiseId = (user?.app_metadata as Record<string, string>)?.franchise_id

  // Get all branches; show primary branch's POS status
  const { data: branches } = await supabase
    .from('branches')
    .select('id, name, location, active_device_id, status')
    .eq('franchise_id', franchiseId)
    .order('name')

  const branch = branches?.[0]

  // Get last transaction to infer last POS activity
  const { data: lastTx } = await supabase
    .from('transactions')
    .select('created_at, status')
    .eq('branch_id', branch?.id || '')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  return (
    <FranchiserPosDeviceClient
      branchId={branch?.id || ''}
      branchName={branch?.name || ''}
      branchLocation={branch?.location || ''}
      activeDeviceId={branch?.active_device_id || null}
      lastActivityAt={lastTx?.created_at || null}
    />
  )
}
