'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createInventoryItem(formData: FormData) {
  const supabase = await createClient()
  const name            = formData.get('name') as string
  const category_id     = formData.get('category_id') as string
  const unit            = formData.get('unit') as string
  const min_stock_level = parseFloat(formData.get('min_stock_level') as string) || 0

  if (!name || !category_id) return { error: 'Name and category are required.' }

  const { data: newItem, error } = await supabase
    .from('inventory_items')
    .insert({ name, category_id, unit, min_stock_level, is_active: true })
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/commissary')
  return { success: true, id: newItem.id }
}

export async function updateInventoryItemStatus(id: string, is_active: boolean) {
  const supabase = await createClient()
  const { error } = await supabase.from('inventory_items').update({ is_active }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/commissary')
  return { success: true }
}

/**
 * Replace all tags for an inventory item with the provided list.
 * tags: array of { entity_type: 'branch' | 'commissary', entity_id: UUID }
 * Passing an empty array removes all tags (makes item global).
 */
export async function setInventoryItemTags(
  itemId: string,
  tags: { entity_type: 'branch' | 'commissary'; entity_id: string }[]
) {
  const supabase = await createClient()

  // Delete all existing tags for this item
  const { error: delError } = await supabase
    .from('inventory_item_tags')
    .delete()
    .eq('inventory_item_id', itemId)

  if (delError) return { error: delError.message }

  // Insert new tags (if any)
  if (tags.length > 0) {
    const { error: insError } = await supabase
      .from('inventory_item_tags')
      .insert(tags.map(t => ({ inventory_item_id: itemId, ...t })))
    if (insError) return { error: insError.message }
  }

  revalidatePath('/commissary')
  return { success: true }
}

/**
 * Safely replace tags for an inventory item ONLY within a specific scope of entities.
 * This prevents Commissary Managers from accidentally deleting Master Admin tags.
 */
export async function setScopedItemTags(
  itemId: string,
  scopeEntityIds: string[],
  newEntityIds: string[]
) {
  const supabase = await createClient()

  if (scopeEntityIds.length > 0) {
    const { error: delError } = await supabase
      .from('inventory_item_tags')
      .delete()
      .eq('inventory_item_id', itemId)
      .eq('entity_type', 'branch')
      .in('entity_id', scopeEntityIds)
    if (delError) return { error: delError.message }
  }

  if (newEntityIds.length > 0) {
    const insertData = newEntityIds.map(id => ({
      inventory_item_id: itemId,
      entity_type: 'branch',
      entity_id: id
    }))
    const { error: insError } = await supabase.from('inventory_item_tags').insert(insertData)
    if (insError) return { error: insError.message }
  }

  revalidatePath('/commissary-portal/inventory')
  return { success: true }
}
