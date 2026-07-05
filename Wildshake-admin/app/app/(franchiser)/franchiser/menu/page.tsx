import { requirePanelAccess } from '@/lib/portal/access'
import FranchiserMenuClient from '@/components/franchiser/FranchiserMenuClient'

export default async function FranchiserMenuPage() {
  const { supabase, user } = await requirePanelAccess('franchise', 'menu')
  const franchiseId = (user?.app_metadata as Record<string, string>)?.franchise_id

  // Get the franchisee's primary branch
  const { data: branches } = await supabase
    .from('branches')
    .select('id, name')
    .eq('franchise_id', franchiseId)
    .order('name')

  const branch = branches?.[0]

  // All globally available products (master list — read only)
  const { data: products } = await supabase
    .from('products')
    .select('id, name, category, price, image_url, is_available')
    .eq('is_available', true)
    .order('category')
    .order('name')

  // Branch-specific overrides (which items are hidden at this branch)
  const { data: overrides } = await supabase
    .from('branch_menu_availability')
    .select('product_id, is_available')
    .eq('branch_id', branch?.id ?? '')

  return (
    <FranchiserMenuClient
      branchId={branch?.id ?? ''}
      branchName={branch?.name ?? 'My Branch'}
      products={(products ?? []) as Parameters<typeof FranchiserMenuClient>[0]['products']}
      overrides={(overrides ?? []) as Parameters<typeof FranchiserMenuClient>[0]['overrides']}
    />
  )
}
