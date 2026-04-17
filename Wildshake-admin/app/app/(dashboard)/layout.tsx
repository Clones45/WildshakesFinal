import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/Sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

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
      />
      <main className="dashboard-main">
        {children}
      </main>
    </div>
  )
}
