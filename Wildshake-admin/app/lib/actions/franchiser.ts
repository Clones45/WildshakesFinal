'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createFranchiserStaff(formData: FormData) {
  const supabase = await createClient()
  
  const branch_id = formData.get('branch_id') as string
  const name = formData.get('name') as string
  const role = formData.get('role') as string
  const pin_code = formData.get('pin_code') as string

  if (!branch_id || !name || !role || !pin_code) {
    return { error: 'All fields are required.' }
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
      pin_code,
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
