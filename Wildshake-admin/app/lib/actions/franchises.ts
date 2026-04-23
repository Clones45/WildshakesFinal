'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function createFranchise(formData: FormData) {
  const name        = formData.get('name') as string
  const ownerName   = formData.get('owner_name') as string
  const ownerEmail  = formData.get('owner_email') as string
  const region      = formData.get('region') as string
  const password    = formData.get('password') as string

  if (!name || !ownerName || !ownerEmail || !password) {
    return { error: 'All fields are required.' }
  }

  const admin   = createAdminClient()

  // ── Step 1: Create the franchise record ──────────────────────────────────
  const { data: franchise, error: franchiseError } = await admin
    .from('franchises')
    .insert({ name, owner_name: ownerName, owner_email: ownerEmail, region, status: 'active' })
    .select()
    .single()

  if (franchiseError) return { error: franchiseError.message }

  // ── Step 2: Create a Supabase Auth account for the franchisee ────────────
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: ownerEmail,
    password,
    email_confirm: true,           // auto-confirm, no email link needed
    app_metadata: {
      role: 'franchisee',
      franchise_id: franchise.id,
    },
    user_metadata: {
      full_name: ownerName,
      franchise_name: name,
    },
  })

  if (authError) {
    // Roll back the franchise record if auth creation fails
    await admin.from('franchises').delete().eq('id', franchise.id)
    return { error: `Auth error: ${authError.message}` }
  }

  // Update franchise with the creator's auth_id
  await admin.from('franchises').update({ auth_id: authData.user.id }).eq('id', franchise.id)

  // ── Step 3: Auto-create the first branch for this franchise ────────────
  const { data: branch, error: branchError } = await admin.from('branches').insert({
    name: `${name} - Main`,
    location: region || 'Philippines',
    franchise_id: franchise.id,
    status: 'active',
  }).select().single()

  if (branchError) console.error('[createFranchise] initial branch insert failed:', branchError.message)

  // NOTE: We do NOT create a public.users profile row for the franchiser owner.
  // The franchiser logs into the web portal via Supabase Auth (email/password).
  // Managers and cashiers are separate staff the franchiser adds via Staff Management.

  revalidatePath('/franchises')
  return {
    success: true,
    franchise,
    branchName: branch?.name,
    credentials: { email: ownerEmail, password },
  }
}

export async function updateFranchiseStatus(franchiseId: string, status: string) {
  // Use admin client so master_admin RLS isn't needed — this runs server-side
  const admin = createAdminClient()

  const { error } = await admin
    .from('franchises')
    .update({ status })
    .eq('id', franchiseId)

  if (error) return { error: error.message }

  revalidatePath('/franchises')
  return { success: true }
}
