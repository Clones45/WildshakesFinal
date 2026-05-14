import { createClient } from '@/lib/supabase/server'
import FranchiserInventoryClient from '@/components/franchiser/FranchiserInventoryClient'

export default async function FranchiserInventoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const franchiseId = (user?.app_metadata as Record<string, string>)?.franchise_id

  // Get branches for this franchise
  const { data: branches } = await supabase
    .from('branches')
    .select('id, name')
    .eq('franchise_id', franchiseId)
    .order('name')

  const branchId = branches?.[0]?.id ?? null
  const branchName = branches?.[0]?.name ?? 'My Branch'

  // Get all categories with their items
  const { data: categories } = await supabase
    .from('inventory_categories')
    .select('id, name, sheet_type, sort_order')
    .order('sheet_type')
    .order('sort_order')

  const { data: items } = await supabase
    .from('inventory_items')
    .select('id, category_id, name, unit, min_stock_level, sort_order')
    .eq('is_active', true)
    .order('sort_order')

  // Get today's logs for this branch (if branch exists)
  const today = new Date().toISOString().split('T')[0]
  const { data: todayLogs } = branchId
    ? await supabase
        .from('daily_inventory_logs')
        .select('id, inventory_item_id, starting_stock, additional_stock, ending_stock, notes')
        .eq('branch_id', branchId)
        .eq('log_date', today)
    : { data: [] }

  return (
    <FranchiserInventoryClient
      branchId={branchId}
      branchName={branchName}
      categories={categories || []}
      items={items || []}
      todayLogs={todayLogs || []}
      today={today}
    />
  )
}
