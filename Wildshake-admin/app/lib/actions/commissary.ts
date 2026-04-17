'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function logShipment(formData: FormData) {
  const supabase = await createClient()

  const branch_id     = formData.get('branch_id') as string
  const ingredient_id = formData.get('ingredient_id') as string
  const quantity      = parseFloat(formData.get('quantity') as string)
  const unit_cost     = parseFloat(formData.get('unit_cost') as string) || 0
  const notes         = (formData.get('notes') as string) || null

  if (!branch_id || !ingredient_id || isNaN(quantity) || quantity <= 0) {
    return { error: 'Branch, ingredient, and a valid quantity are required.' }
  }

  const { error } = await supabase.from('commissary_shipments').insert({
    branch_id,
    ingredient_id,
    quantity_sent: quantity,
    unit_cost,
    notes,
    status: 'in_transit',
  })

  if (error) return { error: error.message }

  revalidatePath('/commissary')
  return { success: true }
}

export async function updateShipmentStatus(shipmentId: string, status: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('commissary_shipments')
    .update({ status })
    .eq('id', shipmentId)
  if (error) return { error: error.message }
  revalidatePath('/commissary')
  return { success: true }
}

// ── Add new ingredient to master ingredients list ─────────────────────────────
export async function createIngredient(formData: FormData) {
  const supabase = await createClient()
  const name           = formData.get('name') as string
  const unit_of_measure = formData.get('unit_of_measure') as string
  const cost_per_unit  = parseFloat(formData.get('cost_per_unit') as string) || 0

  if (!name || !unit_of_measure) return { error: 'Name and unit of measure are required.' }

  const { error } = await supabase.from('ingredients').insert({ name, unit_of_measure, cost_per_unit })
  if (error) return { error: error.message }

  revalidatePath('/commissary')
  return { success: true }
}

// ── Set / update inventory level for a branch + ingredient ───────────────────
export async function setInventoryLevel(formData: FormData) {
  const supabase      = await createClient()
  const branch_id     = formData.get('branch_id') as string
  const ingredient_id = formData.get('ingredient_id') as string
  const current_stock = parseFloat(formData.get('current_stock') as string)
  const safety_level  = parseFloat(formData.get('safety_level') as string)

  if (!branch_id || !ingredient_id || isNaN(current_stock) || isNaN(safety_level)) {
    return { error: 'All fields are required.' }
  }

  // Upsert — update if row exists, insert if not
  const { error } = await supabase.from('inventory').upsert(
    { branch_id, ingredient_id, current_stock, safety_level, last_updated: new Date().toISOString() },
    { onConflict: 'branch_id,ingredient_id' }
  )

  if (error) return { error: error.message }
  revalidatePath('/commissary')
  return { success: true }
}
