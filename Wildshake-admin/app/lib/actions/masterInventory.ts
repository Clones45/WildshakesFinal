'use server'

/**
 * Master-admin inventory setup and branch-sheet actions.
 *
 * Every write here runs through the service-role client after confirming the caller
 * is the master admin with the Inventory panel, and records a line in
 * inventory_history (who, when, what changed, before/after). If that table has not
 * been created yet (see add_inventory_history_migration.sql) the change still saves
 * and the result carries historyRecorded: false so the page can say so.
 */

import { revalidatePath } from 'next/cache'
import { unstable_rethrow } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getVerifiedUser } from '@/lib/auth/verify'
import { getPortalPermissions } from '@/lib/portal/access'
import { isPanelGranted } from '@/lib/portal/panels'
import { manilaDay } from '@/lib/manila'
import { isSheetType, computeEnding } from '@/lib/inventory/sheets'

type Fail = { error: string }
type Actor = { email: string; authId: string }
type Admin = ReturnType<typeof createAdminClient>

export interface ItemRow {
  id: string
  category_id: string
  name: string
  unit: string | null
  min_stock_level: number | null
  sort_order: number
  is_active: boolean
}
export interface CategoryRow { id: string; name: string; sheet_type: string; sort_order: number }
export interface LinkRow { id: string; inventory_item_id: string; product_id: string; quantity_per_serving: number | null }
export interface LogRow {
  id: string
  branch_id: string
  inventory_item_id: string
  log_date: string
  starting_stock: number | null
  additional_stock: number | null
  used_stock: number | null
  notes: string | null
}
export interface AvailabilityRow { product_id: string; is_available: boolean; stock_qty: number | null }

const ITEM_COLS = 'id, category_id, name, unit, min_stock_level, sort_order, is_active'
const LOG_COLS  = 'id, branch_id, inventory_item_id, log_date, starting_stock, additional_stock, used_stock, notes'

// ---------------------------------------------------------------------------
// Guard, history, revalidation
// ---------------------------------------------------------------------------

async function requireMaster(): Promise<{ actor: Actor } | Fail> {
  try {
    const supabase = await createClient()
    const user = await getVerifiedUser(supabase)
    if (!user) return { error: 'Please sign in again.' }
    if ((user.app_metadata as Record<string, string>)?.role !== 'master_admin') {
      return { error: 'Only the master admin can change inventory setup.' }
    }
    const perms = await getPortalPermissions(supabase, user)
    if (!isPanelGranted(perms.grantedPanels, 'inventory')) {
      return { error: 'This account has no access to the Inventory panel.' }
    }
    return { actor: { email: user.email ?? '', authId: user.id } }
  } catch (err) {
    unstable_rethrow(err)
    console.error('[masterInventory] could not verify the session:', err)
    return { error: 'Could not verify your session. Please reload and try again.' }
  }
}

interface HistoryEntry {
  area: 'item' | 'category' | 'tags' | 'recipe' | 'daily_log' | 'availability' | 'import'
  action: 'create' | 'update' | 'retire' | 'restore' | 'delete' | 'copy' | 'import'
  summary: string
  branch_id?: string | null
  reference_table?: string
  reference_id?: string | null
  before?: unknown
  after?: unknown
}

let historyWarned = false
async function record(admin: Admin, actor: Actor, entry: HistoryEntry): Promise<boolean> {
  const { error } = await admin.from('inventory_history').insert({
    actor_email: actor.email,
    actor_auth_id: actor.authId,
    ...entry,
  })
  if (error) {
    if (!historyWarned) {
      historyWarned = true
      console.warn('[inventory history] not recorded (run add_inventory_history_migration.sql):', error.message)
    }
    return false
  }
  return true
}

function bump() {
  for (const p of ['/inventory', '/inventory/branches', '/inventory/import', '/franchiser/inventory', '/franchiser/menu', '/commissary', '/franchises']) {
    revalidatePath(p)
  }
}

const q = (s: string) => `"${s}"`
const num = (v: number | null | undefined) => (v === null || v === undefined ? 'blank' : String(v))

async function branchNames(admin: Admin, ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {}
  const { data } = await admin.from('branches').select('id, name').in('id', ids)
  return Object.fromEntries((data ?? []).map(b => [b.id, b.name as string]))
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

async function insertItem(
  admin: Admin,
  input: { name: string; category_id: string; unit: string | null; min_stock_level: number | null; branch_ids: string[] }
): Promise<{ item: ItemRow } | Fail> {
  const name = input.name.trim()
  if (!name) return { error: 'The item needs a name.' }
  if (!input.category_id) return { error: 'Pick a category for the item.' }

  const { data: last } = await admin
    .from('inventory_items').select('sort_order')
    .eq('category_id', input.category_id)
    .order('sort_order', { ascending: false }).limit(1).maybeSingle()

  const { data: item, error } = await admin
    .from('inventory_items')
    .insert({
      name,
      category_id: input.category_id,
      unit: input.unit?.trim() || null,
      min_stock_level: input.min_stock_level ?? 0,
      sort_order: (last?.sort_order ?? 0) + 1,
      is_active: true,
    })
    .select(ITEM_COLS).single()
  if (error || !item) return { error: error?.message ?? 'Could not create the item.' }

  const branchIds = [...new Set(input.branch_ids)]
  if (branchIds.length > 0) {
    const { error: tagErr } = await admin.from('inventory_item_tags').insert(
      branchIds.map(b => ({ inventory_item_id: item.id, entity_type: 'branch', entity_id: b }))
    )
    if (tagErr) return { error: `Item created, but tagging to branches failed: ${tagErr.message}` }
  }
  return { item: item as ItemRow }
}

export async function createItem(input: {
  name: string; category_id: string; unit: string | null; min_stock_level: number | null; branch_ids: string[]
}) {
  const g = await requireMaster(); if ('error' in g) return g
  const admin = createAdminClient()
  const r = await insertItem(admin, input); if ('error' in r) return r
  const names = await branchNames(admin, input.branch_ids)
  const historyRecorded = await record(admin, g.actor, {
    area: 'item', action: 'create',
    summary: `Created item ${q(r.item.name)}` + (input.branch_ids.length ? ` for ${input.branch_ids.map(b => names[b] ?? b).join(', ')}` : ' (no branches yet)'),
    reference_table: 'inventory_items', reference_id: r.item.id,
    after: { ...r.item, branch_ids: input.branch_ids },
  })
  bump()
  return { ok: true as const, historyRecorded, item: r.item }
}

export async function updateItem(
  id: string,
  patch: { name?: string; unit?: string | null; min_stock_level?: number | null; category_id?: string }
) {
  const g = await requireMaster(); if ('error' in g) return g
  const admin = createAdminClient()
  const { data: before } = await admin.from('inventory_items').select(ITEM_COLS).eq('id', id).maybeSingle()
  if (!before) return { error: 'That item no longer exists.' }

  const next: Partial<ItemRow> = {}
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name) return { error: 'The item needs a name.' }
    if (name !== before.name) next.name = name
  }
  if (patch.unit !== undefined) {
    const unit = patch.unit?.trim() || null
    if (unit !== before.unit) next.unit = unit
  }
  if (patch.min_stock_level !== undefined && patch.min_stock_level !== before.min_stock_level) {
    if (patch.min_stock_level !== null && patch.min_stock_level < 0) return { error: 'Minimum stock cannot be negative.' }
    next.min_stock_level = patch.min_stock_level
  }
  if (patch.category_id !== undefined && patch.category_id !== before.category_id) {
    const { data: cat } = await admin.from('inventory_categories').select('id').eq('id', patch.category_id).maybeSingle()
    if (!cat) return { error: 'That category does not exist.' }
    const { data: last } = await admin
      .from('inventory_items').select('sort_order').eq('category_id', patch.category_id)
      .order('sort_order', { ascending: false }).limit(1).maybeSingle()
    next.category_id = patch.category_id
    next.sort_order = (last?.sort_order ?? 0) + 1
  }
  if (Object.keys(next).length === 0) return { ok: true as const, historyRecorded: true, item: before as ItemRow, unchanged: true }

  const { data: after, error } = await admin.from('inventory_items').update(next).eq('id', id).select(ITEM_COLS).single()
  if (error || !after) return { error: error?.message ?? 'Could not save the item.' }

  const changes: string[] = []
  if (next.name !== undefined) changes.push(`renamed ${q(before.name)} to ${q(after.name)}`)
  if (next.unit !== undefined) changes.push(`unit ${before.unit ?? 'blank'} to ${after.unit ?? 'blank'}`)
  if (next.min_stock_level !== undefined) changes.push(`minimum ${num(before.min_stock_level)} to ${num(after.min_stock_level)}`)
  if (next.category_id !== undefined) changes.push('moved to another category')
  const historyRecorded = await record(admin, g.actor, {
    area: 'item', action: 'update',
    summary: `Item ${q(after.name)}: ${changes.join('; ')}`,
    reference_table: 'inventory_items', reference_id: id, before, after,
  })
  bump()
  return { ok: true as const, historyRecorded, item: after as ItemRow }
}

export async function setItemActive(id: string, is_active: boolean) {
  const g = await requireMaster(); if ('error' in g) return g
  const admin = createAdminClient()
  const { data: after, error } = await admin.from('inventory_items').update({ is_active }).eq('id', id).select(ITEM_COLS).single()
  if (error || !after) return { error: error?.message ?? 'Could not update the item.' }
  const historyRecorded = await record(admin, g.actor, {
    area: 'item', action: is_active ? 'restore' : 'retire',
    summary: `${is_active ? 'Restored' : 'Retired'} item ${q(after.name)}`,
    reference_table: 'inventory_items', reference_id: id, after,
  })
  bump()
  return { ok: true as const, historyRecorded, item: after as ItemRow }
}

/** Permanent removal, only for an item with no daily counts and no recipe links behind it. */
export async function deleteItem(id: string) {
  const g = await requireMaster(); if ('error' in g) return g
  const admin = createAdminClient()
  const { data: before } = await admin.from('inventory_items').select(ITEM_COLS).eq('id', id).maybeSingle()
  if (!before) return { error: 'That item no longer exists.' }

  const [{ count: logs }, { count: links }] = await Promise.all([
    admin.from('daily_inventory_logs').select('id', { count: 'exact', head: true }).eq('inventory_item_id', id),
    admin.from('food_item_menu_links').select('id', { count: 'exact', head: true }).eq('inventory_item_id', id),
  ])
  if ((logs ?? 0) > 0 || (links ?? 0) > 0) {
    return { error: `${q(before.name)} has ${logs ?? 0} daily count(s) and ${links ?? 0} recipe link(s) behind it. Retire it instead so the history stays.` }
  }

  const { error: tagErr } = await admin.from('inventory_item_tags').delete().eq('inventory_item_id', id)
  if (tagErr) return { error: tagErr.message }
  const { error } = await admin.from('inventory_items').delete().eq('id', id)
  if (error) return { error: error.message }

  const historyRecorded = await record(admin, g.actor, {
    area: 'item', action: 'delete',
    summary: `Deleted item ${q(before.name)} permanently (it had no counts or recipe links)`,
    reference_table: 'inventory_items', reference_id: id, before,
  })
  bump()
  return { ok: true as const, historyRecorded }
}

/** Swap an item with its neighbour inside its category. Cosmetic, so not written to history. */
export async function moveItem(id: string, direction: 'up' | 'down') {
  const g = await requireMaster(); if ('error' in g) return g
  const admin = createAdminClient()
  const { data: item } = await admin.from('inventory_items').select('id, category_id, sort_order').eq('id', id).maybeSingle()
  if (!item) return { error: 'That item no longer exists.' }
  const { data: siblings } = await admin
    .from('inventory_items').select('id, sort_order')
    .eq('category_id', item.category_id).order('sort_order').order('name')
  const order = (siblings ?? []).map(s => s.id as string)
  const i = order.indexOf(id)
  const j = direction === 'up' ? i - 1 : i + 1
  if (i < 0 || j < 0 || j >= order.length) return { ok: true as const, historyRecorded: true, order }
  // Renumber 1..n so equal sort_order values can never make the swap a no-op.
  ;[order[i], order[j]] = [order[j], order[i]]
  for (let k = 0; k < order.length; k++) {
    const { error } = await admin.from('inventory_items').update({ sort_order: k + 1 }).eq('id', order[k])
    if (error) return { error: error.message }
  }
  bump()
  return { ok: true as const, historyRecorded: true, order }
}

// ---------------------------------------------------------------------------
// Branch tags (which branches see an item)
// ---------------------------------------------------------------------------

export async function setItemBranches(itemId: string, branchIds: string[]) {
  const g = await requireMaster(); if ('error' in g) return g
  const admin = createAdminClient()
  const { data: item } = await admin.from('inventory_items').select('id, name').eq('id', itemId).maybeSingle()
  if (!item) return { error: 'That item no longer exists.' }

  const { data: existing } = await admin
    .from('inventory_item_tags').select('entity_id')
    .eq('inventory_item_id', itemId).eq('entity_type', 'branch')
  const before = (existing ?? []).map(t => t.entity_id as string)
  const after = [...new Set(branchIds)]

  const { error: delErr } = await admin.from('inventory_item_tags').delete().eq('inventory_item_id', itemId).eq('entity_type', 'branch')
  if (delErr) return { error: delErr.message }
  if (after.length > 0) {
    const { error: insErr } = await admin.from('inventory_item_tags').insert(
      after.map(b => ({ inventory_item_id: itemId, entity_type: 'branch', entity_id: b }))
    )
    if (insErr) return { error: insErr.message }
  }

  const names = await branchNames(admin, [...before, ...after])
  const label = (ids: string[]) => (ids.length ? ids.map(b => names[b] ?? b).join(', ') : 'no branch')
  const historyRecorded = await record(admin, g.actor, {
    area: 'tags', action: 'update',
    summary: `Branches for ${q(item.name)}: ${label(before)} to ${label(after)}`,
    reference_table: 'inventory_items', reference_id: itemId,
    before: { branch_ids: before }, after: { branch_ids: after },
  })
  bump()
  return { ok: true as const, historyRecorded, branch_ids: after }
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function createCategory(input: { name: string; sheet_type: string }) {
  const g = await requireMaster(); if ('error' in g) return g
  const name = input.name.trim()
  if (!name) return { error: 'The category needs a name.' }
  if (!isSheetType(input.sheet_type)) return { error: 'Unknown sheet.' }
  const admin = createAdminClient()
  const { data: last } = await admin
    .from('inventory_categories').select('sort_order').eq('sheet_type', input.sheet_type)
    .order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const { data: cat, error } = await admin
    .from('inventory_categories')
    .insert({ name, sheet_type: input.sheet_type, sort_order: (last?.sort_order ?? 0) + 1 })
    .select('id, name, sheet_type, sort_order').single()
  if (error || !cat) return { error: error?.message ?? 'Could not create the category.' }
  const historyRecorded = await record(admin, g.actor, {
    area: 'category', action: 'create',
    summary: `Created category ${q(cat.name)} in sheet ${cat.sheet_type}`,
    reference_table: 'inventory_categories', reference_id: cat.id, after: cat,
  })
  bump()
  return { ok: true as const, historyRecorded, category: cat as CategoryRow }
}

export async function renameCategory(id: string, name: string) {
  const g = await requireMaster(); if ('error' in g) return g
  const clean = name.trim()
  if (!clean) return { error: 'The category needs a name.' }
  const admin = createAdminClient()
  const { data: before } = await admin.from('inventory_categories').select('id, name, sheet_type, sort_order').eq('id', id).maybeSingle()
  if (!before) return { error: 'That category no longer exists.' }
  if (before.name === clean) return { ok: true as const, historyRecorded: true, category: before as CategoryRow }
  const { data: after, error } = await admin.from('inventory_categories').update({ name: clean }).eq('id', id).select('id, name, sheet_type, sort_order').single()
  if (error || !after) return { error: error?.message ?? 'Could not rename the category.' }
  const historyRecorded = await record(admin, g.actor, {
    area: 'category', action: 'update',
    summary: `Renamed category ${q(before.name)} to ${q(after.name)}`,
    reference_table: 'inventory_categories', reference_id: id, before, after,
  })
  bump()
  return { ok: true as const, historyRecorded, category: after as CategoryRow }
}

export async function moveCategory(id: string, direction: 'up' | 'down') {
  const g = await requireMaster(); if ('error' in g) return g
  const admin = createAdminClient()
  const { data: cat } = await admin.from('inventory_categories').select('id, sheet_type').eq('id', id).maybeSingle()
  if (!cat) return { error: 'That category no longer exists.' }
  const { data: siblings } = await admin
    .from('inventory_categories').select('id').eq('sheet_type', cat.sheet_type).order('sort_order').order('name')
  const order = (siblings ?? []).map(s => s.id as string)
  const i = order.indexOf(id)
  const j = direction === 'up' ? i - 1 : i + 1
  if (i < 0 || j < 0 || j >= order.length) return { ok: true as const, historyRecorded: true, order }
  ;[order[i], order[j]] = [order[j], order[i]]
  for (let k = 0; k < order.length; k++) {
    const { error } = await admin.from('inventory_categories').update({ sort_order: k + 1 }).eq('id', order[k])
    if (error) return { error: error.message }
  }
  bump()
  return { ok: true as const, historyRecorded: true, order }
}

export async function deleteCategory(id: string) {
  const g = await requireMaster(); if ('error' in g) return g
  const admin = createAdminClient()
  const { data: before } = await admin.from('inventory_categories').select('id, name, sheet_type, sort_order').eq('id', id).maybeSingle()
  if (!before) return { error: 'That category no longer exists.' }
  const { count } = await admin.from('inventory_items').select('id', { count: 'exact', head: true }).eq('category_id', id)
  if ((count ?? 0) > 0) return { error: `${q(before.name)} still holds ${count} item(s). Move or retire them first.` }
  const { error } = await admin.from('inventory_categories').delete().eq('id', id)
  if (error) return { error: error.message }
  const historyRecorded = await record(admin, g.actor, {
    area: 'category', action: 'delete',
    summary: `Deleted empty category ${q(before.name)} from sheet ${before.sheet_type}`,
    reference_table: 'inventory_categories', reference_id: id, before,
  })
  bump()
  return { ok: true as const, historyRecorded }
}

// ---------------------------------------------------------------------------
// Recipes (one recipe for all branches)
// ---------------------------------------------------------------------------

export async function setRecipeLink(input: { inventory_item_id: string; product_id: string; quantity_per_serving: number }) {
  const g = await requireMaster(); if ('error' in g) return g
  const qty = Number(input.quantity_per_serving)
  if (!Number.isFinite(qty) || qty <= 0) return { error: 'Amount per serving must be more than zero.' }
  const admin = createAdminClient()
  const [{ data: item }, { data: product }] = await Promise.all([
    admin.from('inventory_items').select('id, name, unit').eq('id', input.inventory_item_id).maybeSingle(),
    admin.from('products').select('id, name').eq('id', input.product_id).maybeSingle(),
  ])
  if (!item) return { error: 'That ingredient no longer exists.' }
  if (!product) return { error: 'That menu item no longer exists.' }

  const { data: existing } = await admin
    .from('food_item_menu_links').select('id, quantity_per_serving')
    .eq('inventory_item_id', input.inventory_item_id).eq('product_id', input.product_id).maybeSingle()

  let link: LinkRow
  if (existing) {
    if (Number(existing.quantity_per_serving) === qty) {
      return { ok: true as const, historyRecorded: true, link: { id: existing.id, inventory_item_id: input.inventory_item_id, product_id: input.product_id, quantity_per_serving: qty } as LinkRow }
    }
    const { data, error } = await admin.from('food_item_menu_links').update({ quantity_per_serving: qty }).eq('id', existing.id)
      .select('id, inventory_item_id, product_id, quantity_per_serving').single()
    if (error || !data) return { error: error?.message ?? 'Could not save the recipe.' }
    link = data as LinkRow
  } else {
    const { data, error } = await admin.from('food_item_menu_links')
      .insert({ inventory_item_id: input.inventory_item_id, product_id: input.product_id, quantity_per_serving: qty })
      .select('id, inventory_item_id, product_id, quantity_per_serving').single()
    if (error || !data) return { error: error?.message ?? 'Could not save the recipe.' }
    link = data as LinkRow
  }

  const unit = item.unit ? ` ${item.unit}` : ''
  const historyRecorded = await record(admin, g.actor, {
    area: 'recipe', action: existing ? 'update' : 'create',
    summary: `Recipe: ${q(product.name)} uses ${qty}${unit} of ${q(item.name)} per serving` + (existing ? ` (was ${num(existing.quantity_per_serving)})` : ''),
    reference_table: 'food_item_menu_links', reference_id: link.id,
    before: existing ?? null, after: link,
  })
  bump()
  return { ok: true as const, historyRecorded, link }
}

export async function removeRecipeLink(id: string) {
  const g = await requireMaster(); if ('error' in g) return g
  const admin = createAdminClient()
  const { data: before } = await admin
    .from('food_item_menu_links')
    .select('id, inventory_item_id, product_id, quantity_per_serving, inventory_items(name), products(name)')
    .eq('id', id).maybeSingle()
  if (!before) return { ok: true as const, historyRecorded: true }
  const { error } = await admin.from('food_item_menu_links').delete().eq('id', id)
  if (error) return { error: error.message }
  const rel = before as unknown as { inventory_items: { name: string } | null; products: { name: string } | null }
  const historyRecorded = await record(admin, g.actor, {
    area: 'recipe', action: 'delete',
    summary: `Recipe: ${q(rel.products?.name ?? 'menu item')} no longer uses ${q(rel.inventory_items?.name ?? 'ingredient')}`,
    reference_table: 'food_item_menu_links', reference_id: id, before,
  })
  bump()
  return { ok: true as const, historyRecorded }
}

// ---------------------------------------------------------------------------
// Branch daily sheets
// ---------------------------------------------------------------------------

const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)

/**
 * Keep the branch's POS menu in step with an ingredient's ending stock, the same way the
 * franchiser page does: out -> linked menu items hidden at that branch; back in stock ->
 * hidden rows removed (rows that also carry a daily limit are kept, just switched back on).
 */
async function syncAvailability(admin: Admin, branchId: string, itemId: string, log: Pick<LogRow, 'starting_stock' | 'additional_stock' | 'used_stock'>) {
  const ending = computeEnding(log.starting_stock, log.additional_stock, log.used_stock)
  if (ending === null) return
  const { data: links } = await admin.from('food_item_menu_links').select('product_id').eq('inventory_item_id', itemId)
  const productIds = [...new Set((links ?? []).map(l => l.product_id as string))]
  if (productIds.length === 0) return

  if (ending > 0) {
    await admin.from('branch_menu_availability').update({ is_available: true, updated_at: new Date().toISOString() })
      .eq('branch_id', branchId).in('product_id', productIds).not('stock_qty', 'is', null)
    await admin.from('branch_menu_availability').delete()
      .eq('branch_id', branchId).in('product_id', productIds).is('stock_qty', null)
  } else {
    await admin.from('branch_menu_availability').upsert(
      productIds.map(pid => ({ branch_id: branchId, product_id: pid, is_available: false, updated_at: new Date().toISOString() })),
      { onConflict: 'branch_id,product_id' }
    )
  }
}

export async function saveDailyLog(input: {
  branch_id: string
  inventory_item_id: string
  log_date: string
  field: 'starting_stock' | 'additional_stock' | 'used_stock' | 'notes'
  value: number | string | null
  reason?: string
}) {
  const g = await requireMaster(); if ('error' in g) return g
  if (!isYmd(input.log_date)) return { error: 'Bad date.' }
  if (input.log_date > manilaDay()) return { error: 'That day has not happened yet.' }
  const isNumeric = input.field !== 'notes'
  let value: number | string | null = input.value
  if (isNumeric) {
    if (value === '' || value === null || value === undefined) value = null
    else {
      value = Number(value)
      if (!Number.isFinite(value) || value < 0) return { error: 'Enter a number of zero or more.' }
    }
  } else {
    value = typeof value === 'string' ? value : ''
  }
  const reason = input.reason?.trim() ?? ''
  if (input.field === 'used_stock' && !reason) return { error: 'Please say why you are changing Used.' }

  const admin = createAdminClient()
  const [{ data: item }, { data: branch }] = await Promise.all([
    admin.from('inventory_items').select('id, name').eq('id', input.inventory_item_id).maybeSingle(),
    admin.from('branches').select('id, name').eq('id', input.branch_id).maybeSingle(),
  ])
  if (!item) return { error: 'That item no longer exists.' }
  if (!branch) return { error: 'That branch no longer exists.' }

  const { data: existing } = await admin
    .from('daily_inventory_logs').select(LOG_COLS)
    .eq('branch_id', input.branch_id).eq('inventory_item_id', input.inventory_item_id).eq('log_date', input.log_date)
    .maybeSingle()

  let log: LogRow
  if (existing) {
    const { data, error } = await admin.from('daily_inventory_logs').update({ [input.field]: value, updated_at: new Date().toISOString() })
      .eq('id', existing.id).select(LOG_COLS).single()
    if (error || !data) return { error: error?.message ?? 'Could not save.' }
    log = data as LogRow
  } else {
    const { data, error } = await admin.from('daily_inventory_logs')
      .insert({ branch_id: input.branch_id, inventory_item_id: input.inventory_item_id, log_date: input.log_date, [input.field]: value })
      .select(LOG_COLS).single()
    if (error || !data) return { error: error?.message ?? 'Could not save.' }
    log = data as LogRow
  }

  await syncAvailability(admin, input.branch_id, input.inventory_item_id, log)

  const fieldLabel = { starting_stock: 'Starting', additional_stock: 'Additional', used_stock: 'Used', notes: 'Note' }[input.field]
  const beforeVal = existing ? (existing as LogRow)[input.field] : null
  const summary = isNumeric
    ? `${branch.name} - ${input.log_date} - ${q(item.name)}: ${fieldLabel} ${num(beforeVal as number | null)} to ${num(value as number | null)}` + (reason ? ` (${reason})` : '')
    : `${branch.name} - ${input.log_date} - ${q(item.name)}: note changed`
  const historyRecorded = await record(admin, g.actor, {
    area: 'daily_log', action: existing ? 'update' : 'create', summary,
    branch_id: input.branch_id, reference_table: 'daily_inventory_logs', reference_id: log.id,
    before: existing ?? null, after: { ...log, reason: reason || undefined },
  })
  bump()
  return { ok: true as const, historyRecorded, log, ending: computeEnding(log.starting_stock, log.additional_stock, log.used_stock) }
}

/** Fill this day's blank Starting counts from the previous day's Ending, for one branch. */
export async function copyPreviousDay(input: { branch_id: string; log_date: string }) {
  const g = await requireMaster(); if ('error' in g) return g
  if (!isYmd(input.log_date)) return { error: 'Bad date.' }
  if (input.log_date > manilaDay()) return { error: 'That day has not happened yet.' }
  const admin = createAdminClient()
  const previous = manilaDay(new Date(`${input.log_date}T12:00:00+08:00`).getTime() - 86400000)

  const [{ data: prevLogs }, { data: todayLogs }, { data: branch }] = await Promise.all([
    admin.from('daily_inventory_logs').select(LOG_COLS).eq('branch_id', input.branch_id).eq('log_date', previous),
    admin.from('daily_inventory_logs').select(LOG_COLS).eq('branch_id', input.branch_id).eq('log_date', input.log_date),
    admin.from('branches').select('id, name').eq('id', input.branch_id).maybeSingle(),
  ])
  if (!branch) return { error: 'That branch no longer exists.' }
  if (!prevLogs || prevLogs.length === 0) return { error: `No counts were entered on ${previous}.` }

  const todayByItem = new Map((todayLogs ?? []).map(l => [l.inventory_item_id as string, l as LogRow]))
  const saved: LogRow[] = []
  for (const p of prevLogs as LogRow[]) {
    const ending = computeEnding(p.starting_stock, p.additional_stock, p.used_stock)
    if (ending === null) continue
    const t = todayByItem.get(p.inventory_item_id)
    if (t && t.starting_stock !== null) continue
    let row: LogRow | null = null
    if (t) {
      const { data } = await admin.from('daily_inventory_logs').update({ starting_stock: ending, updated_at: new Date().toISOString() }).eq('id', t.id).select(LOG_COLS).single()
      row = (data as LogRow) ?? null
    } else {
      const { data } = await admin.from('daily_inventory_logs')
        .insert({ branch_id: input.branch_id, inventory_item_id: p.inventory_item_id, log_date: input.log_date, starting_stock: ending })
        .select(LOG_COLS).single()
      row = (data as LogRow) ?? null
    }
    if (row) {
      saved.push(row)
      await syncAvailability(admin, input.branch_id, row.inventory_item_id, row)
    }
  }

  const historyRecorded = saved.length === 0 ? true : await record(admin, g.actor, {
    area: 'daily_log', action: 'copy',
    summary: `${branch.name} - ${input.log_date}: copied ${previous} ending into Starting for ${saved.length} item(s)`,
    branch_id: input.branch_id, reference_table: 'daily_inventory_logs',
    after: { log_date: input.log_date, from: previous, item_ids: saved.map(s => s.inventory_item_id) },
  })
  bump()
  return { ok: true as const, historyRecorded, copied: saved.length, logs: saved, from: previous }
}

// ---------------------------------------------------------------------------
// Branch menu availability and daily limits
// ---------------------------------------------------------------------------

export async function setBranchAvailability(input: { branch_id: string; product_id: string; is_available: boolean; stock_qty: number | null }) {
  const g = await requireMaster(); if ('error' in g) return g
  let stockQty: number | null = input.stock_qty
  if (stockQty !== null && stockQty !== undefined) {
    stockQty = Math.floor(Number(stockQty))
    if (!Number.isFinite(stockQty) || stockQty < 0) return { error: 'The daily limit must be a whole number of zero or more.' }
  } else stockQty = null

  const admin = createAdminClient()
  const [{ data: product }, { data: branch }, { data: before }] = await Promise.all([
    admin.from('products').select('id, name').eq('id', input.product_id).maybeSingle(),
    admin.from('branches').select('id, name').eq('id', input.branch_id).maybeSingle(),
    admin.from('branch_menu_availability').select('product_id, is_available, stock_qty').eq('branch_id', input.branch_id).eq('product_id', input.product_id).maybeSingle(),
  ])
  if (!product) return { error: 'That menu item no longer exists.' }
  if (!branch) return { error: 'That branch no longer exists.' }

  if (input.is_available && stockQty === null) {
    const { error } = await admin.from('branch_menu_availability').delete().eq('branch_id', input.branch_id).eq('product_id', input.product_id)
    if (error) return { error: error.message }
  } else {
    const { error } = await admin.from('branch_menu_availability').upsert(
      { branch_id: input.branch_id, product_id: input.product_id, is_available: input.is_available, stock_qty: stockQty, updated_at: new Date().toISOString() },
      { onConflict: 'branch_id,product_id' }
    )
    if (error) return { error: error.message }
  }

  const state = (a: boolean, s: number | null) => (a ? 'available' : 'sold out') + (s === null ? '' : `, limit ${s}`)
  const historyRecorded = await record(admin, g.actor, {
    area: 'availability', action: 'update',
    summary: `${branch.name}: ${q(product.name)} ${state(before?.is_available ?? true, before?.stock_qty ?? null)} to ${state(input.is_available, stockQty)}`,
    branch_id: input.branch_id, reference_table: 'branch_menu_availability',
    before: before ?? null, after: { product_id: input.product_id, is_available: input.is_available, stock_qty: stockQty },
  })
  bump()
  return { ok: true as const, historyRecorded, row: { product_id: input.product_id, is_available: input.is_available, stock_qty: stockQty } as AvailabilityRow }
}

// ---------------------------------------------------------------------------
// CSV recipe import
// ---------------------------------------------------------------------------

export async function createItemsFromImport(items: { name: string; category_id: string; unit: string | null; branch_ids: string[] }[]) {
  const g = await requireMaster(); if ('error' in g) return g
  const admin = createAdminClient()
  const created: ItemRow[] = []
  const errors: string[] = []
  for (const it of items) {
    const r = await insertItem(admin, { ...it, min_stock_level: 0 })
    if ('error' in r) errors.push(`${it.name}: ${r.error}`)
    else created.push(r.item)
  }
  const historyRecorded = created.length === 0 ? true : await record(admin, g.actor, {
    area: 'import', action: 'create',
    summary: `Import: created ${created.length} new item(s): ${created.map(c => c.name).join(', ')}`,
    reference_table: 'inventory_items', after: { item_ids: created.map(c => c.id) },
  })
  bump()
  return { ok: true as const, historyRecorded, created, errors }
}

export async function importRecipeLinks(
  links: { inventory_item_id: string; product_id: string; quantity_per_serving: number }[],
  mode: 'update' | 'skip'
) {
  const g = await requireMaster(); if ('error' in g) return g
  const admin = createAdminClient()

  // One read of every existing link, then batched writes.
  const existing = new Map<string, { id: string; qty: number | null }>()
  for (let page = 0; page < 50; page++) {
    const { data, error } = await admin.from('food_item_menu_links')
      .select('id, inventory_item_id, product_id, quantity_per_serving').order('id')
      .range(page * 1000, page * 1000 + 999)
    if (error) return { error: error.message }
    for (const l of data ?? []) existing.set(`${l.inventory_item_id}|${l.product_id}`, { id: l.id, qty: l.quantity_per_serving })
    if (!data || data.length < 1000) break
  }

  const result = { inserted: 0, updated: 0, skipped: 0, errors: [] as string[] }
  const toInsert: { inventory_item_id: string; product_id: string; quantity_per_serving: number }[] = []
  for (const l of links) {
    const qty = Number(l.quantity_per_serving)
    if (!Number.isFinite(qty) || qty <= 0) { result.skipped++; continue }
    const key = `${l.inventory_item_id}|${l.product_id}`
    const ex = existing.get(key)
    if (!ex) {
      toInsert.push({ inventory_item_id: l.inventory_item_id, product_id: l.product_id, quantity_per_serving: qty })
      existing.set(key, { id: '', qty })
      continue
    }
    if (mode === 'skip' || Number(ex.qty) === qty) { result.skipped++; continue }
    const { error } = await admin.from('food_item_menu_links').update({ quantity_per_serving: qty }).eq('id', ex.id)
    if (error) result.errors.push(error.message); else result.updated++
  }
  for (let i = 0; i < toInsert.length; i += 100) {
    const chunk = toInsert.slice(i, i + 100)
    const { error } = await admin.from('food_item_menu_links').insert(chunk)
    if (error) result.errors.push(`${chunk.length} link(s): ${error.message}`); else result.inserted += chunk.length
  }

  const historyRecorded = await record(admin, g.actor, {
    area: 'import', action: 'import',
    summary: `Recipe import: ${result.inserted} new link(s), ${result.updated} updated, ${result.skipped} unchanged or skipped` + (result.errors.length ? `, ${result.errors.length} failed` : ''),
    reference_table: 'food_item_menu_links', after: result,
  })
  bump()
  return { ok: true as const, historyRecorded, ...result }
}
