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

  // ── Incoming shipments from commissary (admin → franchiser) ─────────────────
  const { data: incomingShipments } = branchId
    ? await supabase
        .from('commissary_shipments')
        .select('id, quantity_sent, quantity_unit, status, notes, sent_at, created_at, inventory_item_id, inventory_items(id, name, unit)')
        .eq('branch_id', branchId)
        .in('status', ['in_transit', 'pending'])
        .order('created_at', { ascending: false })
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

          // ── Auto-sync branch availability via branch_menu_availability ──────
          // This is the same table the Menu Availability page uses
          const start = existingLog?.starting_stock ?? null
          if (start !== null) {
            const add    = existingLog?.additional_stock ?? 0
            const used   = usedQty
            const ending = Math.max(0, start + add - used)
            const isAvailable = ending > 0

            if (isAvailable) {
              // Restocked: remove override rows so products show as available
              await supabase
                .from('branch_menu_availability')
                .delete()
                .eq('branch_id', branchId)
                .in('product_id', linkedProductIds)
            } else {
              // Out: upsert override rows marking products unavailable at this branch
              await supabase
                .from('branch_menu_availability')
                .upsert(
                  linkedProductIds.map(pid => ({
                    branch_id: branchId,
                    product_id: pid,
                    is_available: false,
                    updated_at: new Date().toISOString(),
                  })),
                  { onConflict: 'branch_id,product_id' }
                )
            }
          }
        }
      }
    }

    // ── Sync menu item product availability from menu_item_daily_logs ──────
    // Uses branch_menu_availability so it appears in Menu Availability page and POS
    if (menuLogs && products) {
      for (const mLog of menuLogs) {
        const start = mLog.starting_stock ?? null
        if (start === null) continue

        const add    = mLog.additional_stock ?? 0
        const sold   = soldMap[mLog.product_id] ?? 0
        const ending = Math.max(0, start + add - sold)
        const isAvailable = ending > 0

        if (isAvailable) {
          await supabase
            .from('branch_menu_availability')
            .delete()
            .eq('branch_id', branchId)
            .eq('product_id', mLog.product_id)
        } else {
          await supabase
            .from('branch_menu_availability')
            .upsert(
              { branch_id: branchId, product_id: mLog.product_id, is_available: false, updated_at: new Date().toISOString() },
              { onConflict: 'branch_id,product_id' }
            )
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
      incomingShipments={(incomingShipments || []) as unknown as Parameters<typeof FranchiserInventoryClient>[0]['incomingShipments']}
    />
  )
}
