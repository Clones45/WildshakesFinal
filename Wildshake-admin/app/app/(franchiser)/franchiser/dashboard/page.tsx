import { createClient } from '@/lib/supabase/server'
import { requireDashboardOrFirstPanel } from '@/lib/portal/access'
import { loadFranchiseDashboard } from '@/lib/franchise/dashboard'
import FranchiserDashboardView from '@/components/franchiser/FranchiserDashboardView'

export default async function FranchiserDashboard() {
  const { user } = await requireDashboardOrFirstPanel('franchise')
  const franchiseId = (user?.app_metadata as Record<string, string>)?.franchise_id

  const data = await loadFranchiseDashboard(await createClient(), franchiseId)
  if (!data) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem' }}>
        <p style={{ fontSize: '2rem' }}>🏪</p>
        <h2 style={{ color: 'var(--color-text)' }}>No Branch Found</h2>
        <p>Please contact the master admin to set up your branch.</p>
      </div>
    )
  }

  return <FranchiserDashboardView data={data} inventoryHref="/franchiser/inventory" />
}
