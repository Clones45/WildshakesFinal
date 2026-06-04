'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

/* ── Create a new Commissary Branch + its Supabase Auth account ──── */
export async function createCommissaryBranch(formData: FormData) {
  const name          = formData.get('name') as string
  const contactEmail  = formData.get('contact_email') as string
  const region        = formData.get('region') as string
  const password      = formData.get('password') as string

  if (!name || !contactEmail || !password) {
    return { error: 'Name, email, and password are required.' }
  }
  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters.' }
  }

  const admin = createAdminClient()

  // Step 1: Create commissary_branches record
  const { data: commissary, error: dbError } = await admin
    .from('commissary_branches')
    .insert({ name, contact_email: contactEmail, region: region || null, status: 'active' })
    .select()
    .single()

  if (dbError) return { error: dbError.message }

  // Step 2: Create Supabase Auth user
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: contactEmail,
    password,
    email_confirm: true,
    app_metadata: {
      role: 'commissary',
      commissary_id: commissary.id,
    },
    user_metadata: {
      full_name: name,
      commissary_name: name,
    },
  })

  if (authError) {
    // Roll back commissary record
    await admin.from('commissary_branches').delete().eq('id', commissary.id)
    return { error: `Auth error: ${authError.message}` }
  }

  // Step 3: Link auth_id back to commissary record
  await admin
    .from('commissary_branches')
    .update({ auth_id: authData.user.id })
    .eq('id', commissary.id)

  revalidatePath('/franchises')
  revalidatePath('/dashboard')
  return {
    success: true,
    commissary,
    credentials: { email: contactEmail, password },
  }
}

/* ── Update Commissary Branch status ────────────────────────────── */
export async function updateCommissaryBranchStatus(commissaryId: string, status: string) {
  const admin = createAdminClient()
  const { error } = await admin
    .from('commissary_branches')
    .update({ status })
    .eq('id', commissaryId)
  if (error) return { error: error.message }
  revalidatePath('/franchises')
  return { success: true }
}

/* ── Create Franchisee under a Commissary Branch (commissary-side) ── */
export async function createFranchiseeUnderCommissary(formData: FormData) {
  const name               = formData.get('name') as string
  const ownerName          = formData.get('owner_name') as string
  const ownerEmail         = formData.get('owner_email') as string
  const region             = formData.get('region') as string
  const password           = formData.get('password') as string
  const parent_commissary_id = formData.get('parent_commissary_id') as string

  if (!name || !ownerName || !ownerEmail || !password || !parent_commissary_id) {
    return { error: 'All fields are required.' }
  }

  const admin = createAdminClient()

  // Create franchise record with parent_commissary_id
  const { data: franchise, error: franchiseError } = await admin
    .from('franchises')
    .insert({
      name,
      owner_name: ownerName,
      owner_email: ownerEmail,
      region: region || null,
      status: 'active',
      parent_commissary_id,
    })
    .select()
    .single()

  if (franchiseError) return { error: franchiseError.message }

  // Create Auth user for the franchisee
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: ownerEmail,
    password,
    email_confirm: true,
    app_metadata: {
      role: 'franchisee',
      franchise_id: franchise.id,
      parent_commissary_id,
    },
    user_metadata: {
      full_name: ownerName,
      franchise_name: name,
    },
  })

  if (authError) {
    await admin.from('franchises').delete().eq('id', franchise.id)
    return { error: `Auth error: ${authError.message}` }
  }

  await admin.from('franchises').update({ auth_id: authData.user.id }).eq('id', franchise.id)

  // Auto-create first branch
  const { data: branch, error: branchError } = await admin.from('branches').insert({
    name: `${name} - Main`,
    location: region || 'Philippines',
    franchise_id: franchise.id,
    status: 'active',
  }).select().single()

  if (branchError) console.error('[createFranchiseeUnderCommissary] branch insert failed:', branchError.message)

  revalidatePath('/commissary-portal/franchisees')
  revalidatePath('/franchises')
  return {
    success: true,
    franchise,
    branchName: branch?.name,
    credentials: { email: ownerEmail, password },
  }
}

/* ── Create shipment (commissary → its franchisee) ─────────────── */
export async function createCommissaryShipmentFromCommissary(formData: FormData) {
  const admin = createAdminClient()

  const branch_id           = formData.get('branch_id') as string
  const inventory_item_id   = formData.get('inventory_item_id') as string
  const quantity            = parseFloat(formData.get('quantity') as string)
  const quantity_unit       = (formData.get('quantity_unit') as string) || null
  const notes               = (formData.get('notes') as string) || null
  const source_commissary_id = formData.get('source_commissary_id') as string

  if (!branch_id || !inventory_item_id || isNaN(quantity) || quantity <= 0) {
    return { error: 'Branch, item, and a valid quantity are required.' }
  }

  const { error } = await admin.from('commissary_shipments').insert({
    branch_id,
    inventory_item_id,
    quantity_sent: quantity,
    quantity_unit,
    unit_cost: 0,
    notes,
    status: 'pending',
    source_commissary_id: source_commissary_id || null,
  })

  if (error) return { error: error.message }
  revalidatePath('/commissary-portal/shipments')
  revalidatePath('/franchiser/inventory')
  return { success: true }
}
