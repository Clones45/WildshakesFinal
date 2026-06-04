import { createClient } from '@/lib/supabase/server'
import CommissaryShipmentsClient from '@/components/commissary/CommissaryShipmentsClient'

export default async function CommissaryShipmentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const commissaryId = (user?.app_metadata as Record<string, string>)?.commissary_id

  const [
    { data: franchises },
    { data: inventoryItems },
    { data: shipments },
  ] = await Promise.all([
    // Only franchisees belonging to this commissary
    supabase
      .from('franchises')
      .select('id, name, branches(id, name, status)')
      .eq('parent_commissary_id', commissaryId)
      .eq('status', 'active'),

    // Items visible to this commissary (tagged to it or global)
    supabase
      .from('inventory_items')
      .select('id, name, unit, category_id, tagged_to_commissary_id, inventory_categories(name)')
      .eq('is_active', true)
      .or(`tagged_to_commissary_id.is.null,tagged_to_commissary_id.eq.${commissaryId}`)
      .order('name'),

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
  ])

  return (
    <CommissaryShipmentsClient
      commissaryId={commissaryId}
      franchises={(franchises || []) as Parameters<typeof CommissaryShipmentsClient>[0]['franchises']}
      inventoryItems={(inventoryItems || []) as Parameters<typeof CommissaryShipmentsClient>[0]['inventoryItems']}
      shipments={(shipments || []) as unknown as Parameters<typeof CommissaryShipmentsClient>[0]['shipments']}
    />
  )
}
