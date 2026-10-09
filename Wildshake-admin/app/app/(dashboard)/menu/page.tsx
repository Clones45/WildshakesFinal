import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAll } from '@/lib/supabase/fetchAll'
import { requirePanelAccess } from '@/lib/portal/access'
import MenuClient from '@/components/MenuClient'
import type { BranchPriceRow } from '@/lib/actions/menu'

export const dynamic = 'force-dynamic'

export default async function MenuPage() {
  await requirePanelAccess('master_admin', 'menu')
  const admin = createAdminClient()

  const [{ data: products }, { data: branchRows }, branchPrices] = await Promise.all([
    admin.from('products').select('id, name, category, price, delivery_price, image_url, is_available, created_at').order('category').order('name'),
    admin.from('branches').select('id, name, franchises(name)').order('name'),
    fetchAll(() => admin.from('branch_product_prices').select('branch_id, product_id, price, delivery_price').order('id')),
  ])

  const branches = (branchRows ?? []).map(b => ({
    id: b.id as string,
    name: b.name as string,
    franchise: ((b as unknown as { franchises: { name: string } | null }).franchises?.name) ?? null,
  }))

  return (
    <MenuClient
      products={(products ?? []) as Parameters<typeof MenuClient>[0]['products']}
      branches={branches}
      branchPrices={branchPrices as BranchPriceRow[]}
    />
  )
}
