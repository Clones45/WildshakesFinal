import { requirePanelAccess } from '@/lib/portal/access'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAll } from '@/lib/supabase/fetchAll'
import MasterInventoryClient, { type HistoryRow } from '@/components/admin/MasterInventoryClient'
import type { ItemRow, CategoryRow, LinkRow } from '@/lib/actions/masterInventory'

export const dynamic = 'force-dynamic'

export default async function MasterInventoryPage() {
  await requirePanelAccess('master_admin', 'inventory')
  const admin = createAdminClient()

  const [
    { data: categories },
    { data: items },
    tags,
    links,
    { data: products },
    { data: branches },
    logRows,
    history,
  ] = await Promise.all([
    admin.from('inventory_categories').select('id, name, sheet_type, sort_order').order('sheet_type').order('sort_order').order('name'),
    admin.from('inventory_items').select('id, category_id, name, unit, min_stock_level, sort_order, is_active').order('sort_order').order('name'),
    fetchAll(() => admin.from('inventory_item_tags').select('inventory_item_id, entity_id').eq('entity_type', 'branch').order('id')),
    fetchAll(() => admin.from('food_item_menu_links').select('id, inventory_item_id, product_id, quantity_per_serving').order('id')),
    admin.from('products').select('id, name, category, is_available').order('category').order('name'),
    admin.from('branches').select('id, name, franchises(name)').order('name'),
    fetchAll(() => admin.from('daily_inventory_logs').select('inventory_item_id').order('id')),
    admin.from('inventory_history').select('id, created_at, actor_email, area, action, summary, branch_id').order('created_at', { ascending: false }).limit(300),
  ])

  const logCounts: Record<string, number> = {}
  for (const l of logRows as { inventory_item_id: string }[]) {
    logCounts[l.inventory_item_id] = (logCounts[l.inventory_item_id] ?? 0) + 1
  }

  const branchList = (branches ?? []).map(b => ({
    id: b.id as string,
    name: b.name as string,
    franchise: ((b as unknown as { franchises: { name: string } | null }).franchises?.name) ?? null,
  }))

  return (
    <MasterInventoryClient
      categories={(categories ?? []) as CategoryRow[]}
      items={(items ?? []) as ItemRow[]}
      tags={tags as { inventory_item_id: string; entity_id: string }[]}
      links={links as LinkRow[]}
      products={(products ?? []) as { id: string; name: string; category: string; is_available: boolean }[]}
      branches={branchList}
      logCounts={logCounts}
      history={history.error ? null : ((history.data ?? []) as HistoryRow[])}
    />
  )
}
