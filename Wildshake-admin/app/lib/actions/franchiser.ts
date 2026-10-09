'use server'

/**
 * Actions on a franchise's branch: its daily counts, its POS staff and its POS tablet.
 * The POS-staff actions (status, PIN) are also what the head office's and the
 * commissary's own Staff pages use for their people.
 *
 * Who may call them: an owner for their own tenant (and their portal staff, where
 * the panel they were given allows it), and the master admin for any franchise,
 * because the head office's franchise page shows the very same screens as the
 * owner's portal. The caller is checked here, server-side, and every write then
 * goes through the service-role client, so what is allowed never depends on which
 * account happens to be signed in.
 *
 * Results are plain object literals ({ error } or { success, ... }) so callers can
 * test res.error directly.
 */

import { revalidatePath } from 'next/cache'
import { unstable_rethrow } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getVerifiedUser } from '@/lib/auth/verify'
import { getPortalPermissions } from '@/lib/portal/access'
import { isPanelGranted, type GrantedPanels } from '@/lib/portal/panels'
import { manilaDay } from '@/lib/manila'

type Admin = ReturnType<typeof createAdminClient>

interface Caller {
  role: 'master_admin' | 'franchisee' | 'commissary'
  email: string
  authId: string
  /** The caller's own franchise or commissary; null for the master admin, who reaches every franchise. */
  franchiseId: string | null
  commissaryId: string | null
  /** A portal staff account rather than the owner's own login. */
  isStaff: boolean
  panels: GrantedPanels
}

/** What a row or branch belongs to. */
interface Target { franchise_id: string | null; commissary_id: string | null }

type Panel = 'staff' | 'inventory' | 'pos_device' | 'franchises'
const PANEL_NAMES: Record<Panel, string> = { staff: 'Staff', inventory: 'Inventory', pos_device: 'POS Device', franchises: 'Franchises' }

async function resolveCaller(): Promise<Caller | { error: string }> {
  try {
    const supabase = await createClient()
    const user = await getVerifiedUser(supabase)
    if (!user) return { error: 'Please sign in again.' }
    const meta = (user.app_metadata ?? {}) as Record<string, unknown>
    const role = meta.role
    if (role !== 'master_admin' && role !== 'franchisee' && role !== 'commissary') return { error: 'Not allowed.' }
    const perms = await getPortalPermissions(supabase, user)
    return {
      role,
      email: user.email ?? '',
      authId: user.id,
      franchiseId: role === 'franchisee' ? ((meta.franchise_id as string) ?? null) : null,
      commissaryId: role === 'commissary' ? ((meta.commissary_id as string) ?? null) : null,
      isStaff: !!meta.is_staff,
      panels: perms.grantedPanels,
    }
  } catch (err) {
    unstable_rethrow(err)
    console.error('[franchiser actions] could not verify the session:', err)
    return { error: 'Could not verify your session. Please reload and try again.' }
  }
}

/**
 * Why this caller may not act on this target through this panel, or null if they may.
 * The master admin's owner login reaches everything; a head-office staff account
 * needs the Franchises panel to act on a franchise or commissary, and the Staff panel
 * for head-office people. A franchise or commissary login stays inside its own tenant,
 * and a staff account of theirs needs the panel in question.
 */
function denied(caller: Caller, target: Target, panel: Panel): string | null {
  const lacks = (p: Panel) => (isPanelGranted(caller.panels, p) ? null : `This account has no access to the ${PANEL_NAMES[p]} panel.`)
  switch (caller.role) {
    case 'master_admin':
      return lacks(target.franchise_id || target.commissary_id ? 'franchises' : 'staff')
    case 'franchisee':
      if (!target.franchise_id || target.franchise_id !== caller.franchiseId) return 'That is not part of your franchise.'
      return lacks(panel)
    case 'commissary':
      if (!target.commissary_id || target.commissary_id !== caller.commissaryId) return 'That is not part of your commissary.'
      return lacks(panel)
  }
}

const who = (caller: Caller) => {
  const tier = caller.role === 'master_admin' ? 'Head office' : caller.role === 'franchisee' ? 'Franchise' : 'Commissary'
  return caller.isStaff ? `${tier} (staff account)` : tier
}

function bump() {
  for (const p of ['/franchiser/staff', '/franchiser/inventory', '/franchiser/pos-device', '/staff', '/commissary-portal/staff']) revalidatePath(p)
  revalidatePath('/franchises/[id]', 'page')
}

// ---------------------------------------------------------------------------
// Daily counts
// ---------------------------------------------------------------------------

/**
 * Fill today's blank Starting counts for a branch from the last counted day (the
 * database carries the last Ending forward and applies the usage and deliveries of
 * any skipped days). A Starting a person typed is never touched.
 */
export async function fillFromLastCount(branchId: string) {
  const caller = await resolveCaller(); if ('error' in caller) return { error: caller.error }
  const admin = createAdminClient()
  const { data: branch } = await admin.from('branches').select('id, franchise_id').eq('id', branchId).maybeSingle()
  if (!branch) return { error: 'That branch no longer exists.' }
  const no = denied(caller, { franchise_id: branch.franchise_id, commissary_id: null }, 'inventory'); if (no) return { error: no }

  const today = manilaDay()
  const { data, error } = await admin.rpc('inventory_roll_forward', { p_day: today, p_branch: branchId, p_apply: true })
  if (error) return { error: error.message }
  const filled = ((data ?? []) as { out_applied: boolean }[]).filter(r => r.out_applied).length
  const { data: logs } = await admin
    .from('daily_inventory_logs')
    .select('id, inventory_item_id, starting_stock, additional_stock, used_stock, ending_stock, notes, starting_auto')
    .eq('branch_id', branchId).eq('log_date', today)
  bump()
  return { ok: true as const, filled, logs: logs ?? [] }
}

// ---------------------------------------------------------------------------
// Staff: POS people (PIN or QR on the till) and, for status, portal people too
// ---------------------------------------------------------------------------

const STAFF_ROLES = ['cashier', 'manager', 'barista', 'crew', 'kitchen_staff', 'delivery_rider']
const PIN_ROLES = new Set(['cashier', 'manager'])
const PIN_RE = /^\d{6}$/
const STAFF_COLS = 'id, name, email, role, pin_code, qr_access_token, is_active, created_at, has_portal_access, panels, branch_id'

/** A PIN is how a cashier signs in on the till, so two active people at one branch must not share one. */
async function pinTaken(admin: Admin, branchId: string, pin: string, exceptId?: string): Promise<boolean> {
  let q = admin.from('users').select('id').eq('branch_id', branchId).eq('pin_code', pin).eq('is_active', true)
  if (exceptId) q = q.neq('id', exceptId)
  const { data } = await q.limit(1)
  return (data ?? []).length > 0
}

interface StaffRow { id: string; name: string; role: string; branch_id: string | null; franchise_id: string | null; commissary_id: string | null; is_active: boolean; pin_code: string | null }

async function loadStaffRow(admin: Admin, staffId: string): Promise<StaffRow | null> {
  const { data } = await admin
    .from('users')
    .select('id, name, role, branch_id, franchise_id, commissary_id, is_active, pin_code')
    .eq('id', staffId)
    .maybeSingle()
  return (data as StaffRow | null) ?? null
}

async function note(admin: Admin, caller: Caller, staffId: string, text: string) {
  const { error } = await admin.from('audit_logs').insert({
    action_type: 'user_change',
    reference_table: 'users',
    reference_id: staffId,
    notes: text,
    metadata: { actor_auth_id: caller.authId, actor_role: caller.role, actor_email: caller.email },
  })
  if (error) console.warn('[franchiser actions] audit note not saved:', error.message)
}

/** Add a person to a branch's till. Owner logins only (or head office): a staff account never adds staff. */
export async function createFranchiserStaff(formData: FormData) {
  const caller = await resolveCaller(); if ('error' in caller) return { error: caller.error }
  if (caller.isStaff) return { error: 'Only the owner login can add staff.' }

  const branch_id = formData.get('branch_id') as string
  const name = ((formData.get('name') as string) ?? '').trim()
  const role = formData.get('role') as string
  const pin_code = ((formData.get('pin_code') as string) ?? '').trim() || null

  if (!branch_id || !name || !role) return { error: 'Name and role are required.' }
  if (!STAFF_ROLES.includes(role)) return { error: 'Pick a position.' }
  if (PIN_ROLES.has(role) && !pin_code) return { error: `A 6-digit PIN is required for ${role} role.` }
  if (pin_code && !PIN_RE.test(pin_code)) return { error: 'The PIN must be 6 digits.' }

  const admin = createAdminClient()
  const { data: branch } = await admin.from('branches').select('id, name, franchise_id').eq('id', branch_id).maybeSingle()
  if (!branch) return { error: 'That branch no longer exists.' }
  const no = denied(caller, { franchise_id: branch.franchise_id, commissary_id: null }, 'staff'); if (no) return { error: no }
  if (pin_code && await pinTaken(admin, branch.id, pin_code)) return { error: 'Someone at this branch already uses that PIN. Pick another.' }

  const { data, error } = await admin
    .from('users')
    .insert({ branch_id: branch.id, franchise_id: branch.franchise_id, name, role, pin_code, is_active: true })
    .select(STAFF_COLS)
    .single()
  if (error || !data) return { error: error?.message ?? 'Could not add the staff member.' }

  await note(admin, caller, data.id, `${who(caller)} added ${name} (${role}) at ${branch.name}`)
  bump()
  return { success: true, staff: data }
}

export async function updateStaffStatus(id: string, is_active: boolean) {
  const caller = await resolveCaller(); if ('error' in caller) return { error: caller.error }
  const admin = createAdminClient()
  const row = await loadStaffRow(admin, id)
  if (!row) return { error: 'That staff member was not found.' }
  const no = denied(caller, row, 'staff'); if (no) return { error: no }
  if (is_active && row.pin_code && row.branch_id && await pinTaken(admin, row.branch_id, row.pin_code, row.id)) {
    return { error: 'Someone active at this branch now uses the same PIN. Give this person a new PIN first.' }
  }

  const { error } = await admin.from('users').update({ is_active }).eq('id', id)
  if (error) return { error: error.message }

  await note(admin, caller, id, `${who(caller)} ${is_active ? 'activated' : 'deactivated'} ${row.name}`)
  bump()
  return { success: true }
}

export async function updateStaffPin(id: string, pin_code: string) {
  const caller = await resolveCaller(); if ('error' in caller) return { error: caller.error }
  const pin = (pin_code ?? '').trim()
  if (!PIN_RE.test(pin)) return { error: 'The PIN must be 6 digits.' }
  const admin = createAdminClient()
  const row = await loadStaffRow(admin, id)
  if (!row) return { error: 'That staff member was not found.' }
  const no = denied(caller, row, 'staff'); if (no) return { error: no }
  if (row.branch_id && await pinTaken(admin, row.branch_id, pin, row.id)) return { error: 'Someone at this branch already uses that PIN. Pick another.' }

  const { error } = await admin.from('users').update({ pin_code: pin }).eq('id', id)
  if (error) return { error: error.message }

  await note(admin, caller, id, `${who(caller)} changed the PIN for ${row.name}`)
  bump()
  return { success: true }
}

// ---------------------------------------------------------------------------
// POS tablet
// ---------------------------------------------------------------------------

/**
 * Free a branch's POS slot so a new or reset tablet can be set up for it. The tablet
 * that held the slot stops being the branch's till until it is set up again.
 */
export async function releaseBranchDevice(branchId: string) {
  const caller = await resolveCaller(); if ('error' in caller) return { error: caller.error }
  const admin = createAdminClient()
  const { data: branch } = await admin.from('branches').select('id, name, franchise_id, active_device_id').eq('id', branchId).maybeSingle()
  if (!branch) return { error: 'That branch no longer exists.' }
  const no = denied(caller, { franchise_id: branch.franchise_id, commissary_id: null }, 'pos_device'); if (no) return { error: no }

  if (!branch.active_device_id) return { ok: true as const, alreadyFree: true }
  const { error } = await admin.from('branches').update({ active_device_id: null }).eq('id', branchId)
  if (error) return { error: error.message }
  console.info(`[pos-device] ${who(caller)} (${caller.email}) released the POS slot of ${branch.name}`)
  bump()
  return { ok: true as const, alreadyFree: false }
}
