import { createClient } from '@/lib/supabase/server'
import MenuClient from '@/components/MenuClient'

export default async function MenuPage() {
  const supabase = await createClient()

  const [
    { data: products },
    { data: menuItems },
  ] = await Promise.all([
    supabase.from('products').select('*').order('category').order('name'),
    supabase.from('menu_items').select('*').order('category').order('item_name'),
  ])

  return (
    <MenuClient
      products={(products || []) as Parameters<typeof MenuClient>[0]['products']}
      menuItems={(menuItems || []) as unknown as Parameters<typeof MenuClient>[0]['menuItems']}
    />
  )
}
