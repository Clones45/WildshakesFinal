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
    { data: categories },
    { data: todayLogs },
    { data: myTags },
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
      .from('inventory_categories')
      .select('id, name, sheet_type, sort_order')
      .order('sheet_type')
      .order('sort_order'),

    supabase
      .from('daily_inventory_logs')
      .select('id, branch_id, inventory_item_id, log_date, starting_stock, additional_stock, used_stock, ending_stock')
      .eq('log_date', today),

    // Tags for this commissary
    supabase
      .from('inventory_item_tags')
      .select('inventory_item_id')
      .eq('entity_type', 'commissary')
      .eq('entity_id', commissaryId),
  ])

  // Fetch branches for this commissary's franchisees
  const franchiseIds = (franchises || []).map(f => f.id)
  const { data: scopedBranches } = franchiseIds.length > 0
    ? await supabase
        .from('branches')
        .select('id, name, franchise_id')
        .in('franchise_id', franchiseIds)
        .eq('status', 'active')
    : { data: [] }

  // Get all items then filter based on tags
  const { data: allItems } = await supabase
    .from('inventory_items')
    .select('id, name, unit, min_stock_level, is_active, category_id')
    .eq('is_active', true)
    .order('name')

  // Determine which items are tagged to this commissary, and which have no tags (global)
  const myTaggedItemIds = new Set((myTags || []).map(t => t.inventory_item_id))
  const { data: allTaggedRows } = await supabase
    .from('inventory_item_tags')
    .select('inventory_item_id')
  const allTaggedIds = new Set((allTaggedRows || []).map(r => r.inventory_item_id))

  const visibleItems = (allItems || []).filter(item =>
    myTaggedItemIds.has(item.id)
  )

  const visibleItemIds = visibleItems.map(i => i.id)
  const { data: itemTags } = visibleItemIds.length > 0
    ? await supabase
        .from('inventory_item_tags')
        .select('id, inventory_item_id, entity_type, entity_id')
        .in('inventory_item_id', visibleItemIds)
    : { data: [] }

  return (
    <CommissaryInventoryClient
      commissaryId={commissaryId}
      commissaryName={commissary?.name ?? ''}
      categories={categories || []}
      inventoryItems={visibleItems as Parameters<typeof CommissaryInventoryClient>[0]['inventoryItems']}
      franchises={[
        { id: 'self', name: '🏭 My Commissary' },
        ...(franchises || [])
      ]}
      branches={[
        { id: commissaryId, name: commissary?.name ?? 'Main Stock', franchise_id: 'self' },
        ...(scopedBranches || [])
      ]}
      todayLogs={(todayLogs || []) as Parameters<typeof CommissaryInventoryClient>[0]['todayLogs']}
      itemTags={itemTags || []}
    />
  )
}
