import { createClient } from '@/lib/supabase/server'
import CommissaryInventoryClient from '@/components/commissary/CommissaryInventoryClient'

export default async function CommissaryInventoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const commissaryId = (user?.app_metadata as Record<string, string>)?.commissary_id

  const today = new Date().toISOString().split('T')[0]

  const [
    { data: commissary },
    { data: franchises },
    { data: branches },
    { data: categories },
    { data: inventoryItems },
    { data: todayLogs },
  ] = await Promise.all([
    supabase
      .from('commissary_branches')
      .select('id, name')
      .eq('id', commissaryId)
      .single(),

    supabase
      .from('franchises')
      .select('id, name')
      .eq('parent_commissary_id', commissaryId)
      .eq('status', 'active'),

    supabase
      .from('branches')
      .select('id, name, franchise_id')
      .in(
        'franchise_id',
        // subquery via filter — we'll do it in JS
        ['placeholder'] // will replace below
      ),

    supabase
      .from('inventory_categories')
      .select('id, name, sheet_type, sort_order')
      .order('sheet_type')
      .order('sort_order'),

    // Items visible to this commissary
    supabase
      .from('inventory_items')
      .select('id, name, unit, min_stock_level, is_active, category_id, tagged_to_commissary_id')
      .eq('is_active', true)
      .or(`tagged_to_commissary_id.is.null,tagged_to_commissary_id.eq.${commissaryId}`)
      .order('name'),

    supabase
      .from('daily_inventory_logs')
      .select('id, branch_id, inventory_item_id, log_date, starting_stock, additional_stock, used_stock, ending_stock')
      .eq('log_date', today),
  ])

  // Fetch branches properly scoped to this commissary's franchisees
  const franchiseIds = (franchises || []).map(f => f.id)
  const { data: scopedBranches } = franchiseIds.length > 0
    ? await supabase
        .from('branches')
        .select('id, name, franchise_id')
        .in('franchise_id', franchiseIds)
        .eq('status', 'active')
    : { data: [] }

  return (
    <CommissaryInventoryClient
      commissaryId={commissaryId}
      commissaryName={commissary?.name ?? ''}
      categories={categories || []}
      inventoryItems={(inventoryItems || []) as Parameters<typeof CommissaryInventoryClient>[0]['inventoryItems']}
      franchises={franchises || []}
      branches={scopedBranches || []}
      todayLogs={(todayLogs || []) as Parameters<typeof CommissaryInventoryClient>[0]['todayLogs']}
    />
  )
}
