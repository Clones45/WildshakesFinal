'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/* ── Create shipment (new system — uses inventory_item_id) ─────── */
export async function createCommissaryShipment(formData: FormData) {
  const supabase = await createClient()

  const branch_id         = formData.get('branch_id') as string
  const inventory_item_id = formData.get('inventory_item_id') as string
  const quantity          = parseFloat(formData.get('quantity') as string)
  const quantity_unit     = (formData.get('quantity_unit') as string) || null
  const notes             = (formData.get('notes') as string) || null

  if (!branch_id || !inventory_item_id || isNaN(quantity) || quantity <= 0) {
    return { error: 'Branch, item, and a valid quantity are required.' }
  }

  const { error } = await supabase.from('commissary_shipments').insert({
    branch_id,
    inventory_item_id,
    quantity_sent: quantity,
    quantity_unit,
    unit_cost: 0,
    notes,
    status: 'pending',
  })

  if (error) return { error: error.message }
  revalidatePath('/commissary')
  revalidatePath('/franchiser/inventory')
  return { success: true }
}

/* ── Mark shipment as sent (in_transit) ────────────────────────── */
export async function markShipmentSent(shipmentId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('commissary_shipments')
    .update({ status: 'in_transit', sent_at: new Date().toISOString() })
    .eq('id', shipmentId)
  if (error) return { error: error.message }
  revalidatePath('/commissary')
  revalidatePath('/franchiser/inventory')
  return { success: true }
}

/* ── Mark shipment received (franchiser side) ──────────────────── */
export async function markShipmentReceived(shipmentId: string) {
  const supabase = await createClient()

  // Fetch shipment details
  const { data: shipment, error: fetchErr } = await supabase
    .from('commissary_shipments')
    .select('branch_id, inventory_item_id, quantity_sent, status')
    .eq('id', shipmentId)
    .single()

  if (fetchErr || !shipment) return { error: 'Shipment not found.' }
  if (shipment.status !== 'in_transit') return { error: 'Shipment must be in transit to receive.' }

  const today = new Date().toISOString().split('T')[0]

  // Get current log for today (if any)
  const { data: existingLog } = await supabase
    .from('daily_inventory_logs')
    .select('id, additional_stock')
    .eq('branch_id', shipment.branch_id)
    .eq('inventory_item_id', shipment.inventory_item_id)
    .eq('log_date', today)
    .single()

  if (existingLog) {
    // Add to existing additional_stock
    const newAdditional = (existingLog.additional_stock ?? 0) + Number(shipment.quantity_sent)
    await supabase
      .from('daily_inventory_logs')
      .update({ additional_stock: newAdditional })
      .eq('id', existingLog.id)
  } else {
    // Create a new log entry with the shipment quantity as additional
    await supabase.from('daily_inventory_logs').insert({
      branch_id: shipment.branch_id,
      inventory_item_id: shipment.inventory_item_id,
      log_date: today,
      starting_stock: null,
      additional_stock: Number(shipment.quantity_sent),
      used_stock: 0,
      ending_stock: null,
    })
  }

  // Mark shipment received
  const { error } = await supabase
    .from('commissary_shipments')
    .update({ status: 'received', received_at: new Date().toISOString() })
    .eq('id', shipmentId)

  if (error) return { error: error.message }
  revalidatePath('/commissary')
  revalidatePath('/franchiser/inventory')
  return { success: true }
}

/* ── Mark shipment rejected (franchiser side) ──────────────────── */
export async function markShipmentRejected(shipmentId: string, reason?: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('commissary_shipments')
    .update({
      status: 'rejected',
      rejected_reason: reason || null,
    })
    .eq('id', shipmentId)
  if (error) return { error: error.message }
  revalidatePath('/commissary')
  revalidatePath('/franchiser/inventory')
  return { success: true }
}

/* ── Cancel a pending shipment (admin) ─────────────────────────── */
export async function cancelShipment(shipmentId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('commissary_shipments')
    .update({ status: 'cancelled' })
    .eq('id', shipmentId)
    .eq('status', 'pending') // only cancel if still pending
  if (error) return { error: error.message }
  revalidatePath('/commissary')
  return { success: true }
}

/* ── Legacy: log shipment (old ingredient-based system) ─────────── */
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
    branch_id, ingredient_id, quantity_sent: quantity, unit_cost, notes, status: 'in_transit',
  })
  if (error) return { error: error.message }
  revalidatePath('/commissary')
  return { success: true }
}

export async function updateShipmentStatus(shipmentId: string, status: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('commissary_shipments').update({ status }).eq('id', shipmentId)
  if (error) return { error: error.message }
  revalidatePath('/commissary')
  return { success: true }
}

export async function createIngredient(formData: FormData) {
  const supabase = await createClient()
  const name            = formData.get('name') as string
  const unit_of_measure = formData.get('unit_of_measure') as string
  const cost_per_unit   = parseFloat(formData.get('cost_per_unit') as string) || 0
  if (!name || !unit_of_measure) return { error: 'Name and unit of measure are required.' }
  const { error } = await supabase.from('ingredients').insert({ name, unit_of_measure, cost_per_unit })
  if (error) return { error: error.message }
  revalidatePath('/commissary')
  return { success: true }
}

export async function setInventoryLevel(formData: FormData) {
  const supabase      = await createClient()
  const branch_id     = formData.get('branch_id') as string
  const ingredient_id = formData.get('ingredient_id') as string
  const current_stock = parseFloat(formData.get('current_stock') as string)
  const safety_level  = parseFloat(formData.get('safety_level') as string)
  if (!branch_id || !ingredient_id || isNaN(current_stock) || isNaN(safety_level)) {
    return { error: 'All fields are required.' }
  }
  const { error } = await supabase.from('inventory').upsert(
    { branch_id, ingredient_id, current_stock, safety_level, last_updated: new Date().toISOString() },
    { onConflict: 'branch_id,ingredient_id' }
  )
  if (error) return { error: error.message }
  revalidatePath('/commissary')
  return { success: true }
}
