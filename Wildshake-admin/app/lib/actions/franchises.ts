'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
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
  const supabase = await createClient()

  // ── Step 1: Create the franchise record ──────────────────────────────────
  const { data: franchise, error: franchiseError } = await supabase
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
    await supabase.from('franchises').delete().eq('id', franchise.id)
    return { error: `Auth error: ${authError.message}` }
  }

  // ── Step 3: Insert a public.users profile row linking auth → franchise ───
  const { error: profileError } = await supabase.from('users').insert({
    auth_id:     authData.user.id,
    name:        ownerName,
    email:       ownerEmail,
    role:        'investor',        // franchisee owner role in the POS
    franchise_id: franchise.id,
    is_active:   true,
  })

  // Non-fatal — profile row is a convenience link
  if (profileError) console.error('[createFranchise] profile insert failed:', profileError.message)

  revalidatePath('/franchises')
  return {
    success: true,
    franchise,
    credentials: { email: ownerEmail, password },
  }
}

export async function updateFranchiseStatus(franchiseId: string, status: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('franchises')
    .update({ status })
    .eq('id', franchiseId)

  if (error) return { error: error.message }

  revalidatePath('/franchises')
  return { success: true }
}
