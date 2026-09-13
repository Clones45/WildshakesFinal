import { requirePanelAccess } from '@/lib/portal/access'
import { createAdminClient } from '@/lib/supabase/admin'
import InventoryImportClient from '@/components/admin/InventoryImportClient'

export const dynamic = 'force-dynamic'

export default async function InventoryImportPage() {
  await requirePanelAccess('master_admin', 'inventory')
  const admin = createAdminClient()

  const [{ data: products }, { data: inventoryItems }, { data: categories }, { data: branches }] = await Promise.all([
    admin.from('products').select('id, name, category, price, is_available').order('category').order('name'),
    admin.from('inventory_items').select('id, name, unit, category_id').eq('is_active', true).order('name'),
    admin.from('inventory_categories').select('id, name, sheet_type').order('sheet_type').order('sort_order').order('name'),
    admin.from('branches').select('id, name').order('name'),
  ])

  return (
    <InventoryImportClient
      products={products || []}
      inventoryItems={inventoryItems || []}
      categories={categories || []}
      branches={(branches || []) as { id: string; name: string }[]}
    />
  )
}
