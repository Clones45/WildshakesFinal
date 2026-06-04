import { createAdminClient } from '@/lib/supabase/admin'
import CommissaryClient from '@/components/CommissaryClient'

export default async function CommissaryPage() {
  const supabase = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const [
    { data: branches },
    { data: franchises },
    { data: allCategories },
    { data: allItems },
    { data: shipments },
    { data: todayLogs },
    { data: ingredients },
    { data: inventory },
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

    // ALL inventory categories (all sheet types: commissary, commissary_home, food, food_2, production, coffee_general, shake)
    supabase
      .from('inventory_categories')
      .select('id, name, sheet_type, sort_order')
      .order('sheet_type')
      .order('sort_order'),

    // ALL active inventory items
    supabase
      .from('inventory_items')
      .select('id, category_id, name, unit, min_stock_level, sort_order, is_active')
      .eq('is_active', true)
      .order('category_id')
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

    // Today's daily logs for ALL branches
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
  ])

  // Commissary categories (CSL + Home) for the stock tab subset
  const commCategories = (allCategories || []).filter(c =>
    c.sheet_type === 'commissary' || c.sheet_type === 'commissary_home'
  )
  const commCatIds = new Set(commCategories.map(c => c.id))
  const commItemsFiltered = (allItems || []).filter(i => commCatIds.has(i.category_id))

  return (
    <CommissaryClient
      branches={(branches || []) as unknown as Parameters<typeof CommissaryClient>[0]['branches']}
      franchises={(franchises || []) as Parameters<typeof CommissaryClient>[0]['franchises']}
      commCategories={commCategories as Parameters<typeof CommissaryClient>[0]['commCategories']}
      commItems={commItemsFiltered as Parameters<typeof CommissaryClient>[0]['commItems']}
      shipments={(shipments || []) as unknown as Parameters<typeof CommissaryClient>[0]['shipments']}
      todayLogs={(todayLogs || []) as Parameters<typeof CommissaryClient>[0]['todayLogs']}
      ingredients={ingredients || []}
      inventory={(inventory || []) as unknown as Parameters<typeof CommissaryClient>[0]['inventory']}
      inventoryCategories={allCategories || []}
      inventoryItems={(allItems || []) as Parameters<typeof CommissaryClient>[0]['inventoryItems']}
    />
  )
}
