import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import InventoryImportClient from '@/components/franchiser/InventoryImportClient'

export const dynamic = 'force-dynamic'

export default async function InventoryImportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch all products for matching
  const { data: products } = await supabase
    .from('products')
    .select('id, name, category, price, is_available')
    .order('category')
    .order('name')

  // Fetch all inventory items for matching
  const { data: inventoryItems } = await supabase
    .from('inventory_items')
    .select('id, name, unit, category_id')
    .eq('is_active', true)
    .order('name')

  // Fetch inventory categories
  const { data: categories } = await supabase
    .from('inventory_categories')
    .select('id, name, sheet_type')
    .order('name')

  return (
    <InventoryImportClient
      products={products || []}
      inventoryItems={inventoryItems || []}
      categories={categories || []}
    />
  )
}
