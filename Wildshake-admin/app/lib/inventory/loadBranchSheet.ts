import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAll } from '@/lib/supabase/fetchAll'
import type { ItemRow, CategoryRow, LinkRow, LogRow, AvailabilityRow } from '@/lib/actions/masterInventory'

export interface BranchSheetData {
  categories: CategoryRow[]
  items: ItemRow[]
  logs: LogRow[]
  links: LinkRow[]
  products: { id: string; name: string; category: string; is_available: boolean }[]
  overrides: AvailabilityRow[]
}

/**
 * One branch's daily inventory sheet for one Manila day, read exactly the way the
 * branch's own Inventory page reads it: only items tagged to the branch, that day's
 * rows only, every recipe link (paged past the 1,000-row cap), and the branch's menu
 * availability. Every master-admin screen that shows a branch's inventory loads it
 * from here, so the head office and the branch always see the same numbers.
 *
 * When the day is today, blank Starting counts are first carried forward from the last
 * counted day (idempotent; a Starting someone typed is never touched), as the branch
 * page does.
 */
export async function loadBranchSheet(branchId: string, day: string, today: string): Promise<BranchSheetData> {
  const admin = createAdminClient()

  if (day === today) {
    const { error: rollErr } = await admin.rpc('inventory_roll_forward', { p_day: day, p_branch: branchId, p_apply: true })
    if (rollErr) console.warn('[inventory] roll-forward skipped:', rollErr.message)
  }

  const [
    { data: categories },
    { data: allItems },
    tagRows,
    logs,
    links,
    { data: products },
    { data: overrides },
  ] = await Promise.all([
    admin.from('inventory_categories').select('id, name, sheet_type, sort_order').order('sheet_type').order('sort_order').order('name'),
    admin.from('inventory_items').select('id, category_id, name, unit, min_stock_level, sort_order, is_active').eq('is_active', true).order('name'),
    fetchAll(() => admin.from('inventory_item_tags').select('inventory_item_id').eq('entity_type', 'branch').eq('entity_id', branchId).order('id')),
    fetchAll(() => admin.from('daily_inventory_logs').select('id, branch_id, inventory_item_id, log_date, starting_stock, additional_stock, used_stock, notes, starting_auto').eq('branch_id', branchId).eq('log_date', day).order('id')),
    fetchAll(() => admin.from('food_item_menu_links').select('id, inventory_item_id, product_id, quantity_per_serving').order('id')),
    admin.from('products').select('id, name, category, is_available').order('category').order('name'),
    admin.from('branch_menu_availability').select('product_id, is_available, stock_qty').eq('branch_id', branchId),
  ])

  const tagged = new Set((tagRows as { inventory_item_id: string }[]).map(t => t.inventory_item_id))
  return {
    categories: (categories ?? []) as CategoryRow[],
    items: ((allItems ?? []) as ItemRow[]).filter(i => tagged.has(i.id)),
    logs: logs as LogRow[],
    links: links as LinkRow[],
    products: (products ?? []) as BranchSheetData['products'],
    overrides: (overrides ?? []) as AvailabilityRow[],
  }
}
