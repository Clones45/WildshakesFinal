'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createInventoryItem(formData: FormData) {
  const supabase = await createClient()
  const name                    = formData.get('name') as string
  const category_id             = formData.get('category_id') as string
  const unit                    = formData.get('unit') as string
  const min_stock_level         = parseFloat(formData.get('min_stock_level') as string) || 0
  const tagged_to_commissary_id = (formData.get('tagged_to_commissary_id') as string) || null

  if (!name || !category_id) return { error: 'Name and category are required.' }

  const { error } = await supabase.from('inventory_items').insert({
    name, category_id, unit, min_stock_level, is_active: true,
    tagged_to_commissary_id,
  })
  if (error) return { error: error.message }
  
  revalidatePath('/commissary')
  return { success: true }
}

export async function updateInventoryItemStatus(id: string, is_active: boolean) {
  const supabase = await createClient()
  const { error } = await supabase.from('inventory_items').update({ is_active }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/commissary')
  return { success: true }
}
