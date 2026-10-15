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
  const branchId = branch?.id ?? ''

  const [{ data: products }, { data: overrides }, { data: prices }] = await Promise.all([
    // All globally available products (master list — read only)
    supabase
      .from('products')
      .select('id, name, category, price, foodpanda_price, grab_price, image_url, is_available')
      .eq('is_available', true)
      .order('category')
      .order('name'),
    // Branch-specific overrides (which items are hidden at this branch)
    supabase
      .from('branch_menu_availability')
      .select('product_id, is_available')
      .eq('branch_id', branchId),
    // Prices head office set for this branch alone; a null column means the menu's price.
    supabase
      .from('branch_product_prices')
      .select('product_id, price, foodpanda_price, grab_price')
      .eq('branch_id', branchId),
  ])

  type Own = { price: number | null; foodpanda_price: number | null; grab_price: number | null }
  const own = new Map((prices ?? []).map(r => [r.product_id as string, r as Own]))
  const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))
  const priced = (products ?? []).map(p => {
    const o = own.get(p.id as string)
    return {
      ...p,
      price: num(o?.price) ?? Number(p.price),
      foodpanda_price: num(o?.foodpanda_price) ?? num(p.foodpanda_price),
      grab_price: num(o?.grab_price) ?? num(p.grab_price),
    }
  })

  return (
    <FranchiserMenuClient
      branchId={branchId}
      branchName={branch?.name ?? 'My Branch'}
      products={priced as Parameters<typeof FranchiserMenuClient>[0]['products']}
      overrides={(overrides ?? []) as Parameters<typeof FranchiserMenuClient>[0]['overrides']}
    />
  )
}
