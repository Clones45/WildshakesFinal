import { createClient } from '@/lib/supabase/server'
import CommissaryShipmentsClient from '@/components/commissary/CommissaryShipmentsClient'

export default async function CommissaryShipmentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const commissaryId = (user?.app_metadata as Record<string, string>)?.commissary_id

  const [
    { data: franchises },
    { data: shipments },
    { data: itemTags },
  ] = await Promise.all([
    // Only franchisees belonging to this commissary
    supabase
      .from('franchises')
      .select('id, name, branches(id, name, status)')
      .eq('parent_commissary_id', commissaryId)
      .eq('status', 'active'),

    // Shipments from this commissary
    supabase
      .from('commissary_shipments')
      .select(`
        id, quantity_sent, quantity_unit, status, notes, created_at, sent_at, received_at,
        branches(id, name),
        inventory_items(id, name, unit)
      `)
      .eq('source_commissary_id', commissaryId)
      .order('created_at', { ascending: false })
      .limit(200),

    // Tags for this commissary — items tagged to it
    supabase
      .from('inventory_item_tags')
      .select('inventory_item_id')
      .eq('entity_type', 'commissary')
      .eq('entity_id', commissaryId),
  ])

  // Get item IDs tagged to this commissary
  const taggedItemIds = new Set((itemTags || []).map(t => t.inventory_item_id))

  // Get items that are either tagged to this commissary or have NO tags at all (global)
  const { data: allItems } = await supabase
    .from('inventory_items')
    .select('id, name, unit, category_id')
    .eq('is_active', true)
    .order('name')

  // Get all tagged item IDs (to determine which items are "global" = no tags)
  const { data: allTaggedItemRows } = await supabase
    .from('inventory_item_tags')
    .select('inventory_item_id')

  const allTaggedIds = new Set((allTaggedItemRows || []).map(r => r.inventory_item_id))

  // Filter: items tagged to this commissary OR items with no tags at all
  const visibleItems = (allItems || []).filter(item =>
    taggedItemIds.has(item.id) || !allTaggedIds.has(item.id)
  )

  return (
    <CommissaryShipmentsClient
      commissaryId={commissaryId}
      franchises={(franchises || []) as Parameters<typeof CommissaryShipmentsClient>[0]['franchises']}
      inventoryItems={visibleItems as Parameters<typeof CommissaryShipmentsClient>[0]['inventoryItems']}
      shipments={(shipments || []) as unknown as Parameters<typeof CommissaryShipmentsClient>[0]['shipments']}
    />
  )
}
