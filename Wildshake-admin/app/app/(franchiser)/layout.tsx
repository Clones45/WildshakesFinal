import { createClient } from '@/lib/supabase/server'
import FranchiserSidebar from '@/components/franchiser/FranchiserSidebar'
import { redirect } from 'next/navigation'
import { getPortalPermissions } from '@/lib/portal/access'

export default async function FranchiserLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const role = (user.app_metadata as Record<string, string>)?.role
  if (role !== 'franchisee') redirect('/unauthorized')

  const { grantedPanels } = await getPortalPermissions(supabase, user)

  // Load the franchisee's franchise + branch info
  const franchiseId = (user.app_metadata as Record<string, string>)?.franchise_id

  const { data: franchise } = await supabase
    .from('franchises')
    .select('id, name, owner_name, region, status')
    .eq('id', franchiseId)
    .single()

  const { data: branchRows } = await supabase
    .from('branches')
    .select('id, name, location, active_device_id, status')
    .eq('franchise_id', franchiseId)
    .order('name')
    .limit(5)

  const branch = branchRows?.[0] ?? null

  return (
    <div className="dashboard-layout">
      <FranchiserSidebar
        userEmail={user.email}
        ownerName={franchise?.owner_name}
        franchiseName={franchise?.name}
        branchName={branch?.name}
        deviceClaimed={!!branch?.active_device_id}
        grantedPanels={grantedPanels}
      />
      <main className="dashboard-main">
        {children}
      </main>
    </div>
  )
}
