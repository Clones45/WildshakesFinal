import { createAdminClient } from '@/lib/supabase/admin'
import CommissaryClient from '@/components/CommissaryClient'

export default async function CommissaryPage() {
  const supabase = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const [
    { data: branches },
    { data: franchises },
    { data: commCategories },
    { data: commItems },
    { data: shipments },
    { data: todayLogs },
    { data: ingredients },
    { data: inventory },
    { data: inventoryCategories },
    { data: inventoryItems },
  ] = await Promise.all([
    // All active branches with franchise info
    supabase
      .from('branches')
      .select('id, name, location, franchise_id, franchises(name, owner_name)')
      .eq('status', 'active')
      .order('name'),

    // All franchises
    supabase
      .from('franchises')
      .select('id, name, owner_name')
      .eq('status', 'active')
      .order('name'),

    // Commissary categories only (sheet_type = commissary or commissary_home)
    supabase
      .from('inventory_categories')
      .select('id, name, sheet_type, sort_order')
      .in('sheet_type', ['commissary', 'commissary_home'])
      .order('sheet_type')
      .order('sort_order'),

    // Commissary items (from those categories)
    supabase
      .from('inventory_items')
      .select('id, category_id, name, unit, min_stock_level, sort_order, is_active')
      .eq('is_active', true)
      .order('sort_order'),

    // All shipments (new system with inventory_item_id + legacy with ingredient_id)
    supabase
      .from('commissary_shipments')
      .select(`
        id, quantity_sent, quantity_unit, unit_cost, status, notes,
        rejected_reason, sent_at, received_at, created_at,
        branch_id,
        branches(id, name, franchise_id),
        inventory_item_id,
        inventory_items(id, name, unit),
        ingredient_id,
        ingredients(name)
      `)
      .order('created_at', { ascending: false })
      .limit(200),

    // Today's daily logs for ALL branches (commissary items)
    supabase
      .from('daily_inventory_logs')
      .select('id, branch_id, inventory_item_id, starting_stock, additional_stock, used_stock, ending_stock, notes')
      .eq('log_date', today),

    // Legacy ingredients
    supabase.from('ingredients').select('id, name, unit_of_measure').order('name'),

    // Legacy inventory
    supabase
      .from('inventory')
      .select('id, current_stock, safety_level, ingredients(id, name, unit_of_measure), branches(id, name)')
      .order('current_stock'),

    // ALL inventory categories (for Item Catalog tab — includes food too)
    supabase
      .from('inventory_categories')
      .select('id, name, sheet_type, sort_order')
      .order('sheet_type')
      .order('sort_order'),

    // ALL inventory items (for Item Catalog tab)
    supabase
      .from('inventory_items')
      .select('id, category_id, name, unit, min_stock_level, sort_order, is_active')
      .order('category_id')
      .order('sort_order'),
  ])

  // Filter commissary items to only those in commissary categories
  const commCatIds = new Set((commCategories || []).map(c => c.id))
  const commItemsFiltered = (commItems || []).filter(i => commCatIds.has(i.category_id))

  return (
    <CommissaryClient
      branches={(branches || []) as unknown as Parameters<typeof CommissaryClient>[0]['branches']}
      franchises={(franchises || []) as Parameters<typeof CommissaryClient>[0]['franchises']}
      commCategories={(commCategories || []) as Parameters<typeof CommissaryClient>[0]['commCategories']}
      commItems={commItemsFiltered as Parameters<typeof CommissaryClient>[0]['commItems']}
      shipments={(shipments || []) as unknown as Parameters<typeof CommissaryClient>[0]['shipments']}
      todayLogs={(todayLogs || []) as Parameters<typeof CommissaryClient>[0]['todayLogs']}
      ingredients={ingredients || []}
      inventory={(inventory || []) as unknown as Parameters<typeof CommissaryClient>[0]['inventory']}
      inventoryCategories={inventoryCategories || []}
      inventoryItems={(inventoryItems || []) as Parameters<typeof CommissaryClient>[0]['inventoryItems']}
    />
  )
}
