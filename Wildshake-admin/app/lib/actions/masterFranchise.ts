'use server'

/**
 * Head-office (master admin) actions on a franchise's branch: its POS staff and its
 * POS tablet. The franchise owner can do these from their own portal; these let the
 * master admin do the same from Franchises > (franchise), without signing in as them.
 *
 * Every write runs through the service-role client after confirming the caller is the
 * master admin with the Franchises panel, and is noted in audit_logs as a user_change
 * (the only audit type allowed for staff changes).
 */

import { revalidatePath } from 'next/cache'
import { unstable_rethrow } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getVerifiedUser } from '@/lib/auth/verify'
import { getPortalPermissions } from '@/lib/portal/access'
import { isPanelGranted } from '@/lib/portal/panels'

type Fail = { error: string }
type Admin = ReturnType<typeof createAdminClient>
type Actor = { authId: string; email: string }

/** POS staff positions, matching the franchise owner's My Staff page. */
const STAFF_ROLES = ['cashier', 'manager', 'barista', 'crew', 'kitchen_staff', 'delivery_rider']
const PIN_ROLES = new Set(['cashier', 'manager'])

async function requireMaster(): Promise<Actor | Fail> {
  try {
    const supabase = await createClient()
    const user = await getVerifiedUser(supabase)
    if (!user) return { error: 'Please sign in again.' }
    if ((user.app_metadata as Record<string, string>)?.role !== 'master_admin') {
      return { error: 'Only the master admin can do this.' }
    }
    const perms = await getPortalPermissions(supabase, user)
    if (!isPanelGranted(perms.grantedPanels, 'franchises')) {
      return { error: 'This account has no access to the Franchises panel.' }
    }
    return { authId: user.id, email: user.email ?? '' }
  } catch (err) {
    unstable_rethrow(err)
    console.error('[masterFranchise] could not verify the session:', err)
    return { error: 'Could not verify your session. Please reload and try again.' }
  }
}

async function audit(admin: Admin, actor: Actor, staffId: string, notes: string) {
  const { error } = await admin.from('audit_logs').insert({
    action_type: 'user_change',
    reference_table: 'users',
    reference_id: staffId,
    notes,
    metadata: { actor_auth_id: actor.authId, actor_role: 'master_admin', actor_email: actor.email },
  })
  if (error) console.warn('[masterFranchise] audit note not saved:', error.message)
}

function bump() {
  revalidatePath('/franchises', 'layout')
  revalidatePath('/franchiser/staff')
  revalidatePath('/franchiser/pos-device')
}

/** A PIN is how a cashier signs in on the till, so two active people at one branch must not share one. */
async function pinTaken(admin: Admin, branchId: string, pin: string, exceptId?: string): Promise<boolean> {
  let q = admin.from('users').select('id').eq('branch_id', branchId).eq('pin_code', pin).eq('is_active', true)
  if (exceptId) q = q.neq('id', exceptId)
  const { data } = await q.limit(1)
  return (data ?? []).length > 0
}

async function loadBranchStaff(admin: Admin, staffId: string) {
  const { data } = await admin
    .from('users')
    .select('id, name, role, branch_id, franchise_id, tenant_type, is_active, pin_code')
    .eq('id', staffId)
    .maybeSingle()
  // Only POS staff of a franchise branch are handled here; head-office and commissary
  // accounts are managed on their own Staff pages.
  if (!data || !data.branch_id || data.tenant_type === 'master_admin' || data.tenant_type === 'commissary') return null
  return data as { id: string; name: string; role: string; branch_id: string; is_active: boolean; pin_code: string | null }
}

export async function addBranchStaff(input: { branch_id: string; name: string; role: string; pin_code?: string | null }) {
  const actor = await requireMaster(); if ('error' in actor) return actor
  const name = input.name?.trim()
  const role = input.role
  const pin = input.pin_code?.trim() || null
  if (!name) return { error: 'Enter the staff member\'s name.' }
  if (!STAFF_ROLES.includes(role)) return { error: 'Pick a position.' }
  if (PIN_ROLES.has(role) && !pin) return { error: `A ${role} needs a 6-digit PIN to sign in on the till.` }
  if (pin && !/^\d{6}$/.test(pin)) return { error: 'The PIN must be 6 digits.' }

  const admin = createAdminClient()
  const { data: branch } = await admin.from('branches').select('id, name, franchise_id').eq('id', input.branch_id).maybeSingle()
  if (!branch) return { error: 'That branch no longer exists.' }
  if (pin && await pinTaken(admin, branch.id, pin)) return { error: 'Someone at this branch already uses that PIN. Pick another.' }

  const { data, error } = await admin
    .from('users')
    .insert({ branch_id: branch.id, franchise_id: branch.franchise_id, name, role, pin_code: pin, is_active: true })
    .select('id, name, email, role, pin_code, is_active, created_at, branch_id')
    .single()
  if (error || !data) return { error: error?.message ?? 'Could not add the staff member.' }

  await audit(admin, actor, data.id, `Head office added ${name} (${role}) at ${branch.name}`)
  bump()
  return { ok: true as const, staff: data }
}

export async function setBranchStaffActive(staffId: string, isActive: boolean) {
  const actor = await requireMaster(); if ('error' in actor) return actor
  const admin = createAdminClient()
  const row = await loadBranchStaff(admin, staffId)
  if (!row) return { error: 'That staff member was not found.' }
  if (isActive && row.pin_code && await pinTaken(admin, row.branch_id, row.pin_code, row.id)) {
    return { error: 'Someone active at this branch now uses the same PIN. Give this person a new PIN first.' }
  }
  const { error } = await admin.from('users').update({ is_active: isActive }).eq('id', staffId)
  if (error) return { error: error.message }
  await audit(admin, actor, staffId, `Head office ${isActive ? 'reactivated' : 'deactivated'} ${row.name}`)
  bump()
  return { ok: true as const }
}

export async function setBranchStaffPin(staffId: string, pin: string) {
  const actor = await requireMaster(); if ('error' in actor) return actor
  const clean = pin?.trim() ?? ''
  if (!/^\d{6}$/.test(clean)) return { error: 'The PIN must be 6 digits.' }
  const admin = createAdminClient()
  const row = await loadBranchStaff(admin, staffId)
  if (!row) return { error: 'That staff member was not found.' }
  if (await pinTaken(admin, row.branch_id, clean, row.id)) return { error: 'Someone at this branch already uses that PIN. Pick another.' }
  const { error } = await admin.from('users').update({ pin_code: clean }).eq('id', staffId)
  if (error) return { error: error.message }
  await audit(admin, actor, staffId, `Head office changed the PIN for ${row.name}`)
  bump()
  return { ok: true as const }
}

/**
 * Free a branch's POS slot so a new or reset tablet can be set up for it. The tablet
 * that held the slot stops being the branch's till until it is set up again.
 *
 * Allowed for the master admin (Franchises panel) and for the owner of the branch's
 * own franchise (or their staff with the POS Device panel).
 */
export async function releaseBranchDevice(branchId: string) {
  try {
    const supabase = await createClient()
    const user = await getVerifiedUser(supabase)
    if (!user) return { error: 'Please sign in again.' }
    const meta = user.app_metadata as Record<string, string>
    const perms = await getPortalPermissions(supabase, user)
    const admin = createAdminClient()
    const { data: branch } = await admin.from('branches').select('id, name, franchise_id, active_device_id').eq('id', branchId).maybeSingle()
    if (!branch) return { error: 'That branch no longer exists.' }

    let who: string
    if (meta?.role === 'master_admin') {
      if (!isPanelGranted(perms.grantedPanels, 'franchises')) return { error: 'This account has no access to the Franchises panel.' }
      who = 'Head office'
    } else if (meta?.role === 'franchisee') {
      if (meta.franchise_id !== branch.franchise_id) return { error: 'That branch is not part of your franchise.' }
      if (!isPanelGranted(perms.grantedPanels, 'pos_device')) return { error: 'This account has no access to the POS Device panel.' }
      who = 'Branch owner'
    } else {
      return { error: 'Not allowed.' }
    }

    if (!branch.active_device_id) return { ok: true as const, alreadyFree: true }
    const { error } = await admin.from('branches').update({ active_device_id: null }).eq('id', branchId)
    if (error) return { error: error.message }
    console.info(`[pos-device] ${who} (${user.email}) released the POS slot of ${branch.name}`)
    bump()
    return { ok: true as const, alreadyFree: false }
  } catch (err) {
    unstable_rethrow(err)
    console.error('[releaseBranchDevice] failed:', err)
    return { error: 'Could not release the device. Please try again.' }
  }
}
