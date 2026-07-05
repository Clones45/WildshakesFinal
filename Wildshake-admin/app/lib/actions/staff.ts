'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { roleToTenantType, validatePanelSubset, type TenantType } from '@/lib/portal/panels'

interface OwnerContext {
  authUserId: string
  role: string
  tenantType: TenantType
  franchiseId: string | null
  commissaryId: string | null
}

// Every mutation below must be reachable only by the real tenant owner login --
// never by a staff account, even one granted the "staff" panel (decision: staff
// can view/manage POS-staff duties but can never create staff or edit anyone's
// permissions). This check is server-side and independent of what the UI shows.
async function assertIsOwner(): Promise<{ error: string } | { owner: OwnerContext }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const meta = user.app_metadata as Record<string, unknown> | null
  if (meta?.is_staff) return { error: 'Forbidden: staff accounts cannot manage staff or permissions.' }

  const role = meta?.role as string | undefined
  if (role !== 'franchisee' && role !== 'commissary' && role !== 'master_admin') {
    return { error: 'Forbidden.' }
  }

  return {
    owner: {
      authUserId: user.id,
      role,
      tenantType: roleToTenantType(role),
      franchiseId: (meta?.franchise_id as string) ?? null,
      commissaryId: (meta?.commissary_id as string) ?? null,
    },
  }
}

// Fetches a staff row via the admin client (which bypasses RLS) and verifies it
// actually belongs to the caller's own tenant. Required because the admin client
// has no RLS to fall back on -- this check IS the tenant boundary for these actions.
async function loadOwnedStaffRow(admin: ReturnType<typeof createAdminClient>, owner: OwnerContext, staffId: string) {
  const { data: row, error } = await admin
    .from('users')
    .select('id, tenant_type, franchise_id, commissary_id, auth_id, email, panels, has_portal_access')
    .eq('id', staffId)
    .single()

  if (error || !row) return { error: 'Staff member not found.' }
  if (row.tenant_type !== owner.tenantType) return { error: 'Forbidden.' }
  if (owner.tenantType === 'franchise' && row.franchise_id !== owner.franchiseId) return { error: 'Forbidden.' }
  if (owner.tenantType === 'commissary' && row.commissary_id !== owner.commissaryId) return { error: 'Forbidden.' }

  return { row }
}

function auditMetadata(owner: OwnerContext) {
  return { actor_auth_id: owner.authUserId, actor_role: owner.role }
}

function revalidateStaffPages() {
  revalidatePath('/franchiser/staff')
  revalidatePath('/staff')
  revalidatePath('/commissary-portal/staff')
}

// Tier-agnostic staff creation for master_admin/commissary, whose staff have no
// PIN/POS concept -- every account created here is a portal account from the
// start, mirroring the admin.auth.admin.createUser() pattern already proven in
// lib/actions/franchises.ts's createFranchise(). Franchise-tier staff creation
// continues to go through the existing createFranchiserStaff() (unchanged); use
// grantPortalAccess() below to add portal access to a franchise staff row.
export async function createStaffMember(formData: FormData) {
  const ctx = await assertIsOwner()
  if ('error' in ctx) return { error: ctx.error }
  const { owner } = ctx

  if (owner.tenantType === 'franchise') {
    return { error: 'Use the existing "Add Staff Member" flow for franchise staff.' }
  }

  const name = (formData.get('name') as string)?.trim()
  const email = (formData.get('email') as string)?.trim()
  const password = formData.get('password') as string
  const panels = formData.getAll('panels') as string[]

  if (!name || !email || !password) return { error: 'Name, email, and password are required.' }

  const panelError = validatePanelSubset(owner.tenantType, panels)
  if (panelError) return { error: panelError }

  const admin = createAdminClient()

  const { data: staffRow, error: insertError } = await admin
    .from('users')
    .insert({
      name,
      role: 'staff',
      tenant_type: owner.tenantType,
      is_active: true,
      franchise_id: null,
      commissary_id: owner.tenantType === 'commissary' ? owner.commissaryId : null,
    })
    .select()
    .single()

  if (insertError) return { error: insertError.message }

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: {
      role: owner.role,
      is_staff: true,
      ...(owner.tenantType === 'commissary' ? { commissary_id: owner.commissaryId } : {}),
    },
    user_metadata: { full_name: name },
  })

  if (authError) {
    await admin.from('users').delete().eq('id', staffRow.id)
    return { error: `Auth error: ${authError.message}` }
  }

  const { error: updateError } = await admin
    .from('users')
    .update({ auth_id: authData.user.id, email, has_portal_access: true, panels })
    .eq('id', staffRow.id)

  if (updateError) {
    await admin.auth.admin.deleteUser(authData.user.id)
    await admin.from('users').delete().eq('id', staffRow.id)
    return { error: updateError.message }
  }

  await admin.from('audit_logs').insert({
    action_type: 'user_change',
    reference_table: 'users',
    reference_id: staffRow.id,
    notes: 'Staff created with portal access',
    metadata: auditMetadata(owner),
  })

  revalidateStaffPages()
  return { success: true, staff: { ...staffRow, email, has_portal_access: true, panels } }
}

// Upgrades an existing PIN/QR-only franchise staff row (or any staff row) to
// also have web-portal access with the given panels.
export async function grantPortalAccess(staffId: string, formData: FormData) {
  const ctx = await assertIsOwner()
  if ('error' in ctx) return { error: ctx.error }
  const { owner } = ctx

  const owned = await loadOwnedStaffRow(createAdminClient(), owner, staffId)
  if ('error' in owned) return { error: owned.error }
  const { row } = owned

  if (row.has_portal_access) return { error: 'This staff member already has portal access.' }

  const email = (formData.get('email') as string)?.trim()
  const password = formData.get('password') as string
  const panels = formData.getAll('panels') as string[]

  if (!email || !password) return { error: 'Email and password are required.' }

  const panelError = validatePanelSubset(owner.tenantType, panels)
  if (panelError) return { error: panelError }

  const admin = createAdminClient()

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: {
      role: owner.role,
      is_staff: true,
      ...(owner.tenantType === 'franchise' ? { franchise_id: owner.franchiseId } : {}),
      ...(owner.tenantType === 'commissary' ? { commissary_id: owner.commissaryId } : {}),
    },
    user_metadata: {},
  })

  if (authError) return { error: `Auth error: ${authError.message}` }

  const { error: updateError } = await admin
    .from('users')
    .update({ auth_id: authData.user.id, email, has_portal_access: true, panels })
    .eq('id', staffId)

  if (updateError) {
    await admin.auth.admin.deleteUser(authData.user.id)
    return { error: updateError.message }
  }

  await admin.from('audit_logs').insert({
    action_type: 'user_change',
    reference_table: 'users',
    reference_id: staffId,
    notes: 'Portal access granted',
    metadata: auditMetadata(owner),
  })

  revalidateStaffPages()
  return { success: true }
}

// Removes web-portal access from a staff row (deletes the Supabase Auth account,
// clears panels/auth_id/email/has_portal_access). The underlying POS PIN/QR
// identity (if any) is left intact -- use updateStaffStatus to deactivate the
// whole account instead.
export async function revokePortalAccess(staffId: string) {
  const ctx = await assertIsOwner()
  if ('error' in ctx) return { error: ctx.error }
  const { owner } = ctx

  const admin = createAdminClient()
  const owned = await loadOwnedStaffRow(admin, owner, staffId)
  if ('error' in owned) return { error: owned.error }
  const { row } = owned

  if (!row.auth_id) return { error: 'This staff member does not have portal access.' }

  const { error: deleteAuthError } = await admin.auth.admin.deleteUser(row.auth_id)
  if (deleteAuthError) return { error: deleteAuthError.message }

  const { error: updateError } = await admin
    .from('users')
    .update({ auth_id: null, has_portal_access: false, panels: [] })
    .eq('id', staffId)

  if (updateError) return { error: updateError.message }

  await admin.from('audit_logs').insert({
    action_type: 'user_change',
    reference_table: 'users',
    reference_id: staffId,
    notes: 'Portal access revoked',
    metadata: auditMetadata(owner),
  })

  revalidateStaffPages()
  return { success: true }
}

export async function updateStaffPanels(staffId: string, panels: string[]) {
  const ctx = await assertIsOwner()
  if ('error' in ctx) return { error: ctx.error }
  const { owner } = ctx

  const admin = createAdminClient()
  const owned = await loadOwnedStaffRow(admin, owner, staffId)
  if ('error' in owned) return { error: owned.error }
  const { row } = owned

  if (!row.has_portal_access) return { error: 'This staff member does not have portal access.' }

  const panelError = validatePanelSubset(owner.tenantType, panels)
  if (panelError) return { error: panelError }

  const { error } = await admin.from('users').update({ panels }).eq('id', staffId)
  if (error) return { error: error.message }

  await admin.from('audit_logs').insert({
    action_type: 'user_change',
    reference_table: 'users',
    reference_id: staffId,
    notes: 'Staff panel permissions updated',
    metadata: { ...auditMetadata(owner), panels },
  })

  revalidateStaffPages()
  return { success: true }
}
