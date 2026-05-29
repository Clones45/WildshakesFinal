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

  const today = new Date().toISOString().split('T')[0]

  // ── Food / Commissary inventory ──────────────────────────────────────────────
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

  const { data: todayLogs } = branchId
    ? await supabase
        .from('daily_inventory_logs')
        .select('id, inventory_item_id, starting_stock, additional_stock, used_stock, ending_stock, notes')
        .eq('branch_id', branchId)
        .eq('log_date', today)
    : { data: [] }

  // ── Food item ↔ Menu item links ──────────────────────────────────────────────
  const { data: foodMenuLinks } = await supabase
    .from('food_item_menu_links')
    .select('id, inventory_item_id, product_id')

  // ── All POS products (for Menu Items tab + tag picker) ──────────────────────
  const { data: products } = await supabase
    .from('products')
    .select('id, name, category, price, is_available')
    .order('category')
    .order('name')

  // ── Menu item daily logs ─────────────────────────────────────────────────────
  const { data: menuLogs } = branchId
    ? await supabase
        .from('menu_item_daily_logs')
        .select('id, product_id, starting_stock, additional_stock, notes')
        .eq('branch_id', branchId)
        .eq('log_date', today)
    : { data: [] }

  // ── Compute sold / cancelled / voided per product from transactions ──────────
  // Sold = quantity from completed (non-voided) transactions, item not cancelled
  // Cancelled = quantity of cancelled items within completed transactions
  // Voided = quantity from voided transactions
  const soldMap: Record<string, number> = {}
  const cancelledMap: Record<string, number> = {}
  const voidedMap: Record<string, number> = {}

  if (branchId) {
    const dateStart = `${today}T00:00:00.000Z`
    const dateEnd   = `${today}T23:59:59.999Z`

    // Fetch all transaction items for today at this branch (joins via transaction)
    const { data: txItems } = await supabase
      .from('transaction_items')
      .select('product_id, quantity, cancelled, transactions!inner(branch_id, status, created_at)')
      .eq('transactions.branch_id', branchId)
      .gte('transactions.created_at', dateStart)
      .lte('transactions.created_at', dateEnd)

    if (txItems) {
      for (const ti of txItems) {
        const pid = ti.product_id
        const tx = (ti as any).transactions
        const qty = Number(ti.quantity ?? 0)

        if (tx?.status === 'voided') {
          voidedMap[pid] = (voidedMap[pid] ?? 0) + qty
        } else if (ti.cancelled) {
          cancelledMap[pid] = (cancelledMap[pid] ?? 0) + qty
        } else {
          soldMap[pid] = (soldMap[pid] ?? 0) + qty
        }
      }
    }

    // ── Compute used_stock per food item from linked products ─────────────
    if (foodMenuLinks && items) {
      for (const foodItem of items) {
        const linkedProductIds = (foodMenuLinks ?? [])
          .filter(l => l.inventory_item_id === foodItem.id)
          .map(l => l.product_id)

        if (linkedProductIds.length > 0) {
          const usedQty = linkedProductIds.reduce((sum, pid) => sum + (soldMap[pid] ?? 0), 0)
          // Update used_stock in today's log if it has changed
          const existingLog = (todayLogs ?? []).find(l => l.inventory_item_id === foodItem.id)
          if (existingLog && existingLog.id) {
            await supabase
              .from('daily_inventory_logs')
              .update({ used_stock: usedQty })
              .eq('id', existingLog.id)
            existingLog.used_stock = usedQty
          }
        }
      }
    }
  }

  return (
    <FranchiserInventoryClient
      branchId={branchId}
      branchName={branchName}
      categories={categories || []}
      items={items || []}
      todayLogs={todayLogs || []}
      today={today}
      products={products || []}
      menuLogs={menuLogs || []}
      foodMenuLinks={foodMenuLinks || []}
      soldMap={soldMap}
      cancelledMap={cancelledMap}
      voidedMap={voidedMap}
    />
  )
}
