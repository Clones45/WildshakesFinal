'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getVerifiedUser } from '@/lib/auth/verify'
import { manilaDay } from '@/lib/manila'

/**
 * Fill today's blank Starting counts for one of the caller's own branches from the last
 * counted day (the database carries the last Ending forward and applies the usage and
 * deliveries of any skipped days). A Starting a person typed is never touched.
 */
export async function fillFromLastCount(branchId: string) {
  const supabase = await createClient()
  const user = await getVerifiedUser(supabase)
  if (!user) return { error: 'Please sign in again.' }
  const franchiseId = (user.app_metadata as Record<string, string>)?.franchise_id
  const { data: branch } = await supabase.from('branches').select('id').eq('id', branchId).eq('franchise_id', franchiseId ?? '').maybeSingle()
  if (!branch) return { error: 'That branch is not part of your franchise.' }

  const today = manilaDay()
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('inventory_roll_forward', { p_day: today, p_branch: branchId, p_apply: true })
  if (error) return { error: error.message }
  const filled = ((data ?? []) as { out_applied: boolean }[]).filter(r => r.out_applied).length
  const { data: logs } = await admin
    .from('daily_inventory_logs')
    .select('id, inventory_item_id, starting_stock, additional_stock, used_stock, ending_stock, notes, starting_auto')
    .eq('branch_id', branchId).eq('log_date', today)
  revalidatePath('/franchiser/inventory')
  return { ok: true as const, filled, logs: logs ?? [] }
}

export async function createFranchiserStaff(formData: FormData) {
  const supabase = await createClient()
  
  const branch_id = formData.get('branch_id') as string
  const name = formData.get('name') as string
  const role = formData.get('role') as string
  const pin_code = (formData.get('pin_code') as string) || null

  const PIN_REQUIRED_ROLES = ['cashier', 'manager']

  if (!branch_id || !name || !role) {
    return { error: 'Name and role are required.' }
  }

  if (PIN_REQUIRED_ROLES.includes(role) && (!pin_code || pin_code.length !== 6)) {
    return { error: `A 6-digit PIN is required for ${role} role.` }
  }

  // Look up franchise_id from branch
  const { data: branch, error: branchError } = await supabase
    .from('branches')
    .select('franchise_id')
    .eq('id', branch_id)
    .single()

  if (branchError) return { error: branchError.message }

  const { data, error } = await supabase
    .from('users')
    .insert({
      branch_id,
      franchise_id: branch.franchise_id,
      name,
      role,
      pin_code: pin_code || null,
      is_active: true
    })
    .select()
    .single()

  if (error) return { error: error.message }
  
  revalidatePath('/franchiser/staff')
  return { success: true, staff: data }
}

export async function updateStaffStatus(id: string, is_active: boolean) {
  const supabase = await createClient()
  const { error } = await supabase.from('users').update({ is_active }).eq('id', id)
  
  if (error) return { error: error.message }
  
  revalidatePath('/franchiser/staff')
  return { success: true }
}

export async function updateStaffPin(id: string, pin_code: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('users').update({ pin_code }).eq('id', id)
  
  if (error) return { error: error.message }
  
  revalidatePath('/franchiser/staff')
  return { success: true }
}
