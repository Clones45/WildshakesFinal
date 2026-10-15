'use server'

/**
 * The live POS menu: its items, their prices, and which branches a price applies to.
 *
 * Every item has a normal price and, if it is sold on the delivery apps, a FoodPanda
 * price and a Grab price, set separately. A price change can apply to every branch
 * (the menu's own price changes, and any branch-only price for that item is cleared
 * so everyone is on the new one) or to chosen branches only (those branches get a
 * branch-only price; the rest keep what they had). Names, categories, pictures and
 * hidden/shown are always the same everywhere. The tills pick a change up within
 * seconds.
 *
 * Only the master admin with the Menu panel may change the menu. Writes go through
 * the service-role client after that check. Results are plain object literals
 * ({ error } or { success }) so callers can test res.error directly.
 */

import { revalidatePath } from 'next/cache'
import { unstable_rethrow } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getVerifiedUser } from '@/lib/auth/verify'
import { getPortalPermissions } from '@/lib/portal/access'
import { isPanelGranted } from '@/lib/portal/panels'

type Admin = ReturnType<typeof createAdminClient>

export interface BranchPriceRow {
  branch_id: string
  product_id: string
  price: number | null
  foodpanda_price: number | null
  grab_price: number | null
}

/** The three prices an item carries. null = not offered on that platform (the till charges the normal price). */
interface Prices { price: number; foodpanda_price: number | null; grab_price: number | null }
const PRICE_KEYS = ['price', 'foodpanda_price', 'grab_price'] as const
const LABELS: Record<keyof Prices, string> = { price: 'Price', foodpanda_price: 'FoodPanda price', grab_price: 'Grab price' }

async function requireMenuAdmin(): Promise<{ email: string } | { error: string }> {
  try {
    const supabase = await createClient()
    const user = await getVerifiedUser(supabase)
    if (!user) return { error: 'Please sign in again.' }
    if ((user.app_metadata as Record<string, string>)?.role !== 'master_admin') return { error: 'Only the master admin can change the menu.' }
    const perms = await getPortalPermissions(supabase, user)
    if (!isPanelGranted(perms.grantedPanels, 'menu')) return { error: 'This account has no access to the Menu panel.' }
    return { email: user.email ?? '' }
  } catch (err) {
    unstable_rethrow(err)
    console.error('[menu] could not verify the session:', err)
    return { error: 'Could not verify your session. Please reload and try again.' }
  }
}

function bump() {
  for (const p of ['/menu', '/franchiser/menu', '/inventory/branches']) revalidatePath(p)
  revalidatePath('/franchises/[id]', 'page')
}

/** A peso amount from a form field: blank means "none" when allowed, otherwise a number of zero or more. */
function pesos(raw: FormDataEntryValue | null, label: string, required: boolean): number | null | { error: string } {
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (text === '') return required ? { error: `${label} is required.` } : null
  const n = Number(text)
  if (!Number.isFinite(n) || n < 0) return { error: `${label} must be a number of zero or more.` }
  return Math.round(n * 100) / 100
}

/** The three prices from the form, or the first complaint. */
function readPrices(formData: FormData): Prices | { error: string } {
  const price = pesos(formData.get('price'), LABELS.price, true)
  if (typeof price === 'object' && price) return { error: price.error }
  const foodpanda_price = pesos(formData.get('foodpanda_price'), LABELS.foodpanda_price, false)
  if (typeof foodpanda_price === 'object' && foodpanda_price) return { error: foodpanda_price.error }
  const grab_price = pesos(formData.get('grab_price'), LABELS.grab_price, false)
  if (typeof grab_price === 'object' && grab_price) return { error: grab_price.error }
  return { price: price as number, foodpanda_price, grab_price }
}

/** Rows where every price column is blank say nothing, so they go. */
async function dropEmptyRows(admin: Admin, productId: string) {
  await admin.from('branch_product_prices').delete().eq('product_id', productId)
    .is('price', null).is('foodpanda_price', null).is('grab_price', null)
}

const asNum = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

// ── Items ────────────────────────────────────────────────────────────────────

export async function createProduct(formData: FormData) {
  const g = await requireMenuAdmin(); if ('error' in g) return { error: g.error }
  const name = ((formData.get('name') as string) ?? '').trim()
  const category = ((formData.get('category') as string) ?? '').trim()
  const image_url = ((formData.get('image_url') as string) ?? '').trim() || null
  const is_available = formData.get('is_available') !== 'false'
  if (!name || !category) return { error: 'Name, category, and price are required.' }
  const prices = readPrices(formData)
  if ('error' in prices) return { error: prices.error }

  const admin = createAdminClient()
  const { error } = await admin.from('products').insert({ name, category, image_url, is_available, ...prices })
  if (error) return { error: error.message }

  bump()
  return { success: true }
}

/**
 * Save an item. Details (name, category, picture, shown/hidden) apply everywhere.
 * Prices apply by `scope`, each of the three on its own:
 *   all      - the menu's price changes; a changed price also clears every branch-only
 *              figure for that price, so all branches are on the new one. A price left
 *              as it was leaves the branch-only figures alone.
 *   branches - the chosen branches (`branch_ids`) get a branch-only figure where the
 *              entered price differs from the menu's; where it matches the menu, the
 *              branch simply follows the menu again. The menu's own prices are untouched.
 */
export async function updateProduct(id: string, formData: FormData) {
  const g = await requireMenuAdmin(); if ('error' in g) return { error: g.error }
  const name = ((formData.get('name') as string) ?? '').trim()
  const category = ((formData.get('category') as string) ?? '').trim()
  const image_url = ((formData.get('image_url') as string) ?? '').trim() || null
  const is_available = formData.get('is_available') === 'true'
  const scope = formData.get('scope') === 'branches' ? 'branches' : 'all'
  const branchIds = [...new Set(formData.getAll('branch_ids').map(String).filter(Boolean))]
  if (!name || !category) return { error: 'Name, category, and price are required.' }
  const entered = readPrices(formData)
  if ('error' in entered) return { error: entered.error }
  if (scope === 'branches' && branchIds.length === 0) return { error: 'Tick at least one branch, or apply the price to all branches.' }

  const admin = createAdminClient()
  const { data: current } = await admin.from('products').select('id, price, foodpanda_price, grab_price').eq('id', id).maybeSingle()
  if (!current) return { error: 'That menu item no longer exists.' }
  const base: Prices = { price: Number(current.price), foodpanda_price: asNum(current.foodpanda_price), grab_price: asNum(current.grab_price) }
  const changed = PRICE_KEYS.filter(k => entered[k] !== base[k])
  const stamp = { updated_at: new Date().toISOString(), updated_by: g.email }

  const details: Record<string, unknown> = { name, category, image_url, is_available }

  if (scope === 'all') {
    const { error } = await admin.from('products').update({ ...details, ...entered }).eq('id', id)
    if (error) return { error: error.message }
    // A changed price now applies everywhere: clear that column's branch-only figures.
    if (changed.length > 0) {
      const clear = Object.fromEntries(changed.map(k => [k, null]))
      const { error: clrErr } = await admin.from('branch_product_prices').update({ ...clear, ...stamp }).eq('product_id', id)
      if (clrErr) return { error: clrErr.message }
      await dropEmptyRows(admin, id)
    }
  } else {
    const { error } = await admin.from('products').update(details).eq('id', id)
    if (error) return { error: error.message }
    const { data: known } = await admin.from('branches').select('id').in('id', branchIds)
    const ids = (known ?? []).map(b => b.id as string)
    if (ids.length === 0) return { error: 'None of those branches exist any more.' }
    // Only a figure that differs from the menu's is a branch-only price; one that matches
    // means "follow the menu", so the column is cleared rather than pinned.
    const rows = ids.map(branch_id => ({
      branch_id, product_id: id,
      price: entered.price === base.price ? null : entered.price,
      foodpanda_price: entered.foodpanda_price === base.foodpanda_price ? null : entered.foodpanda_price,
      grab_price: entered.grab_price === base.grab_price ? null : entered.grab_price,
      ...stamp,
    }))
    const { error: upErr } = await admin.from('branch_product_prices').upsert(rows, { onConflict: 'branch_id,product_id' })
    if (upErr) return { error: upErr.message }
    await dropEmptyRows(admin, id)
  }

  bump()
  return { success: true }
}

/** Put one branch back on the menu's prices for one item. */
export async function clearBranchPrice(branchId: string, productId: string) {
  const g = await requireMenuAdmin(); if ('error' in g) return { error: g.error }
  const admin = createAdminClient()
  const { error } = await admin.from('branch_product_prices').delete().eq('branch_id', branchId).eq('product_id', productId)
  if (error) return { error: error.message }
  bump()
  return { success: true }
}

export async function toggleProductAvailability(id: string, is_available: boolean) {
  const g = await requireMenuAdmin(); if ('error' in g) return { error: g.error }
  const { error } = await createAdminClient().from('products').update({ is_available }).eq('id', id)
  if (error) return { error: error.message }
  bump()
  return { success: true }
}

export async function deleteProduct(id: string) {
  const g = await requireMenuAdmin(); if ('error' in g) return { error: g.error }
  const { error } = await createAdminClient().from('products').delete().eq('id', id)
  if (error) return { error: error.message }
  bump()
  return { success: true }
}
