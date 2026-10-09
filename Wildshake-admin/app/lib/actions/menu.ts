'use server'

/**
 * The live POS menu: its items, their prices, and which branches a price applies to.
 *
 * Every item has a normal price and, if it is sold on FoodPanda and Grab, one shared
 * delivery price. A price change can apply to every branch (the menu's own price
 * changes, and any branch-only price for that item is cleared so everyone is on the
 * new one) or to chosen branches only (those branches get a branch-only price; the
 * rest keep what they had). Names, categories, pictures and hidden/shown are always
 * the same everywhere. The tills pick a change up within seconds.
 *
 * Only the master admin with the Menu panel may change the menu. Writes go through
 * the service-role client after that check.
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
  delivery_price: number | null
}

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

/** Rows where both columns are blank say nothing, so they go. */
async function dropEmptyRows(admin: Admin, productId: string) {
  await admin.from('branch_product_prices').delete().eq('product_id', productId).is('price', null).is('delivery_price', null)
}

// ── Items ────────────────────────────────────────────────────────────────────

export async function createProduct(formData: FormData) {
  const g = await requireMenuAdmin(); if ('error' in g) return { error: g.error }
  const name = ((formData.get('name') as string) ?? '').trim()
  const category = ((formData.get('category') as string) ?? '').trim()
  const image_url = ((formData.get('image_url') as string) ?? '').trim() || null
  const is_available = formData.get('is_available') !== 'false'
  const price = pesos(formData.get('price'), 'Price', true)
  const delivery_price = pesos(formData.get('delivery_price'), 'FoodPanda & Grab price', false)
  if (!name || !category) return { error: 'Name, category, and price are required.' }
  if (typeof price === 'object' && price) return { error: price.error }
  if (typeof delivery_price === 'object' && delivery_price) return { error: delivery_price.error }

  const admin = createAdminClient()
  const { error } = await admin.from('products').insert({ name, category, price, delivery_price, image_url, is_available })
  if (error) return { error: error.message }

  bump()
  return { success: true }
}

/**
 * Save an item. Details (name, category, picture, shown/hidden) apply everywhere.
 * Prices apply by `scope`:
 *   all      - the menu's price changes; a changed price also clears every branch-only
 *              price for that item, so all branches are on the new one. A price left as
 *              it was leaves the branch-only prices alone.
 *   branches - the chosen branches (`branch_ids`) get a branch-only price where the
 *              entered price differs from the menu's; where it matches the menu, the
 *              branch simply follows the menu again. The menu's own price is untouched.
 */
export async function updateProduct(id: string, formData: FormData) {
  const g = await requireMenuAdmin(); if ('error' in g) return { error: g.error }
  const name = ((formData.get('name') as string) ?? '').trim()
  const category = ((formData.get('category') as string) ?? '').trim()
  const image_url = ((formData.get('image_url') as string) ?? '').trim() || null
  const is_available = formData.get('is_available') === 'true'
  const price = pesos(formData.get('price'), 'Price', true)
  const delivery_price = pesos(formData.get('delivery_price'), 'FoodPanda & Grab price', false)
  const scope = formData.get('scope') === 'branches' ? 'branches' : 'all'
  const branchIds = [...new Set(formData.getAll('branch_ids').map(String).filter(Boolean))]
  if (!name || !category) return { error: 'Name, category, and price are required.' }
  if (typeof price === 'object' && price) return { error: price.error }
  if (typeof delivery_price === 'object' && delivery_price) return { error: delivery_price.error }
  if (scope === 'branches' && branchIds.length === 0) return { error: 'Tick at least one branch, or apply the price to all branches.' }

  const admin = createAdminClient()
  const { data: current } = await admin.from('products').select('id, price, delivery_price').eq('id', id).maybeSingle()
  if (!current) return { error: 'That menu item no longer exists.' }
  const basePrice = Number(current.price)
  const baseDelivery = current.delivery_price === null ? null : Number(current.delivery_price)

  const details: Record<string, unknown> = { name, category, image_url, is_available }

  if (scope === 'all') {
    const priceChanged = price !== basePrice
    const deliveryChanged = delivery_price !== baseDelivery
    details.price = price
    details.delivery_price = delivery_price
    const { error } = await admin.from('products').update(details).eq('id', id)
    if (error) return { error: error.message }
    // A changed price now applies everywhere: clear that column's branch-only prices.
    if (priceChanged) await admin.from('branch_product_prices').update({ price: null, updated_at: new Date().toISOString(), updated_by: g.email }).eq('product_id', id)
    if (deliveryChanged) await admin.from('branch_product_prices').update({ delivery_price: null, updated_at: new Date().toISOString(), updated_by: g.email }).eq('product_id', id)
    if (priceChanged || deliveryChanged) await dropEmptyRows(admin, id)
  } else {
    const { error } = await admin.from('products').update(details).eq('id', id)
    if (error) return { error: error.message }
    const { data: known } = await admin.from('branches').select('id').in('id', branchIds)
    const ids = (known ?? []).map(b => b.id as string)
    if (ids.length === 0) return { error: 'None of those branches exist any more.' }
    // Only a price that differs from the menu's is a branch-only price; one that matches
    // means "follow the menu", so the column is cleared rather than pinned.
    const rows = ids.map(branch_id => ({
      branch_id, product_id: id,
      price: price === basePrice ? null : price,
      delivery_price: delivery_price === baseDelivery ? null : delivery_price,
      updated_at: new Date().toISOString(), updated_by: g.email,
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
