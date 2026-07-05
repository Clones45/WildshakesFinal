import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { getPortalPermissions } from '@/lib/portal/access'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const role = (user.app_metadata as Record<string, string>)?.role
  if (role !== 'master_admin') redirect('/unauthorized')

  const { grantedPanels } = await getPortalPermissions(supabase, user)

  // Count low-stock items (current_stock < safety_level)
  const { data: inventory } = await supabase
    .from('inventory')
    .select('current_stock, safety_level')

  const lowStockCount = (inventory || []).filter(
    i => Number(i.current_stock) < Number(i.safety_level)
  ).length

  return (
    <div className="dashboard-layout">
      <Sidebar
        userEmail={user?.email}
        lowStockCount={lowStockCount}
        grantedPanels={grantedPanels}
      />
      <main className="dashboard-main">
        {children}
      </main>
    </div>
  )
}
