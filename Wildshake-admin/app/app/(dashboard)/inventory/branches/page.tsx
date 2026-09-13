import { requirePanelAccess } from '@/lib/portal/access'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAll } from '@/lib/supabase/fetchAll'
import { manilaDay } from '@/lib/manila'
import MasterBranchSheetClient from '@/components/admin/MasterBranchSheetClient'
import type { ItemRow, CategoryRow, LinkRow, LogRow, AvailabilityRow } from '@/lib/actions/masterInventory'

export const dynamic = 'force-dynamic'

export default async function MasterBranchSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; day?: string }>
}) {
  await requirePanelAccess('master_admin', 'inventory')
  const admin = createAdminClient()
  const sp = await searchParams

  const { data: branchRows } = await admin.from('branches').select('id, name, franchises(name)').order('name')
  const branches = (branchRows ?? []).map(b => ({
    id: b.id as string,
    name: b.name as string,
    franchise: ((b as unknown as { franchises: { name: string } | null }).franchises?.name) ?? null,
  }))

  const today = manilaDay()
  const branchId = branches.some(b => b.id === sp.branch) ? (sp.branch as string) : (branches[0]?.id ?? null)
  const day = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) && sp.day <= today ? sp.day : today

  if (!branchId) {
    return (
      <div>
        <div className="page-header"><div><h1>Branch sheets</h1></div></div>
        <div className="alert alert-warning">No branches exist yet.</div>
      </div>
    )
  }

  const [
    { data: categories },
    { data: allItems },
    { data: tagRows },
    { data: logs },
    links,
    { data: products },
    { data: overrides },
  ] = await Promise.all([
    admin.from('inventory_categories').select('id, name, sheet_type, sort_order').order('sheet_type').order('sort_order').order('name'),
    admin.from('inventory_items').select('id, category_id, name, unit, min_stock_level, sort_order, is_active').eq('is_active', true).order('sort_order').order('name'),
    admin.from('inventory_item_tags').select('inventory_item_id').eq('entity_type', 'branch').eq('entity_id', branchId),
    admin.from('daily_inventory_logs').select('id, branch_id, inventory_item_id, log_date, starting_stock, additional_stock, used_stock, notes').eq('branch_id', branchId).eq('log_date', day),
    fetchAll(() => admin.from('food_item_menu_links').select('id, inventory_item_id, product_id, quantity_per_serving').order('id')),
    admin.from('products').select('id, name, category, is_available').order('category').order('name'),
    admin.from('branch_menu_availability').select('product_id, is_available, stock_qty').eq('branch_id', branchId),
  ])

  const tagged = new Set((tagRows ?? []).map(t => t.inventory_item_id as string))
  const items = ((allItems ?? []) as ItemRow[]).filter(i => tagged.has(i.id))

  return (
    <MasterBranchSheetClient
      branches={branches}
      branchId={branchId}
      branchName={branches.find(b => b.id === branchId)?.name ?? 'Branch'}
      day={day}
      today={today}
      categories={(categories ?? []) as CategoryRow[]}
      items={items}
      logs={(logs ?? []) as LogRow[]}
      links={links as LinkRow[]}
      products={(products ?? []) as { id: string; name: string; category: string; is_available: boolean }[]}
      overrides={(overrides ?? []) as AvailabilityRow[]}
    />
  )
}
