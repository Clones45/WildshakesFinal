import { useEffect, useState } from 'react'
import { supabase, type Product } from '../lib/supabase'
import { db } from '../lib/db'
import { useAuthStore } from '../store/authStore'
import { computeEffectiveStock } from '../lib/menuAvailability'

/**
 * Loads menu items from the `products` table.
 * Applies per-branch availability overrides from `branch_menu_availability`.
 * Falls back to Dexie offline cache if Supabase is unreachable.
 *
 * Realtime: automatically refreshes when:
 *  - Franchiser marks items out of stock (branch_menu_availability changes)
 *  - Master admin updates the products table
 *
 * Rules:
 *  - Global `products.is_available = false`  → hidden everywhere (master admin only)
 *  - `branch_menu_availability.is_available = false` → hidden at this branch only
 *  - No row in branch_menu_availability → product is available at this branch
 */
export function useMenuItems() {
    const { branch } = useAuthStore()
    const [products, setProducts] = useState<Product[]>([])
    const [categories, setCategories] = useState<string[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        loadItems()

        // ── Realtime: auto-refresh on any availability change ────────────────
        const channel = supabase
            .channel(`menu-updates-${branch?.id ?? 'global'}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'branch_menu_availability',
                    filter: branch?.id ? `branch_id=eq.${branch.id}` : undefined,
                },
                () => {
                    console.log('[useMenuItems] Branch availability changed — refreshing menu')
                    loadItems()
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'products' },
                () => {
                    console.log('[useMenuItems] Products table changed — refreshing menu')
                    loadItems()
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [branch?.id])

    async function loadItems() {
        setIsLoading(true)
        setError(null)

        try {
            // ── 1. Fetch all globally available products ─────────────────────
            const { data: allProducts, error: prodErr } = await supabase
                .from('products')
                .select('id, name, category, price, image_url, is_available')
                .eq('is_available', true)
                .order('category')
                .order('name')

            if (prodErr) {
                console.error('[useMenuItems] Supabase error:', prodErr)
                throw prodErr
            }

            if (!allProducts || allProducts.length === 0) {
                console.warn('[useMenuItems] No rows returned from products table')
                throw new Error('Empty result from products')
            }

            // ── 2. Fetch this branch's out-of-stock overrides ──────────────────
            let unavailableIds = new Set<string>()
            let stockQuantities = new Map<string, number | null>()
            if (branch?.id) {
                const { data: overrides } = await supabase
                    .from('branch_menu_availability')
                    .select('product_id, is_available, stock_qty')
                    .eq('branch_id', branch.id)

                if (overrides) {
                    for (const o of overrides as { product_id: string; is_available: boolean; stock_qty: number | null }[]) {
                        stockQuantities.set(o.product_id, o.stock_qty)
                        // Hide if explicitly marked unavailable
                        if (!o.is_available) { unavailableIds.add(o.product_id); continue }
                        // Hide if stock_qty is set and has reached 0
                        if (o.stock_qty !== null && o.stock_qty <= 0) { unavailableIds.add(o.product_id) }
                    }
                }
            }

            // ── 2b. Sales not yet pushed to Supabase ─────────────────────────────
            // The server's stock_qty only moves once a sale reaches it. While anything is
            // still queued, the tablet's own count is the more truthful one — it already
            // includes those sales. Taking the server number here would wind the count
            // back up and make a sold-out item look available again.
            const unsyncedSales = await db.transactions
                .where('syncStatus').anyOf(['pending', 'failed']).count()
            let localStock = new Map<string, number | null>()
            if (unsyncedSales > 0) {
                const cached = await db.products.toArray()
                localStock = new Map(cached.map(p => [p.id, p.stock_qty ?? null]))
            }

            const stockFor = (id: string): number | null => {
                const server = stockQuantities.has(id) ? stockQuantities.get(id)! : null
                if (server === null) return null            // untracked item
                const local = localStock.get(id)
                return local === null || local === undefined ? server : Math.min(server, local)
            }

            // ── 2c. Share counts across items that draw on the same thing ────────
            // Five wings is five wings, whether they go out solo or on a party tray.
            const [recipeLinks, ingredients] = await Promise.all([
                db.recipeLinks.toArray(),
                db.ingredientStock.toArray(),
            ])
            const unitByIngredient = new Map(ingredients.map(i => [i.inventoryItemId, i.unit]))
            const withOwnCount = (allProducts as Product[]).map(p => ({ id: p.id, stock_qty: stockFor(p.id) }))
            const effective = computeEffectiveStock(withOwnCount, recipeLinks, unitByIngredient)

            // ── 3. Apply branch-level unavailable items ─────────────────────────────────
            // stock_qty rides along so the grid can warn when an item is running low.
            const prods = (allProducts as Product[]).map(p => {
                const stock_qty = stockFor(p.id)
                const effective_stock = effective.get(p.id) ?? null
                const soldOut = unavailableIds.has(p.id)
                    || (effective_stock !== null && effective_stock <= 0)
                return { ...p, is_available: soldOut ? false : p.is_available, stock_qty, effective_stock }
            })
            const cats = [...new Set(prods.map((p) => p.category))]

            console.log(`[useMenuItems] Loaded ${allProducts.length} items from Supabase products`)
            if (unavailableIds.size > 0) {
                console.log(`[useMenuItems] ${unavailableIds.size} item(s) hidden by branch override`)
            }
            if (unsyncedSales > 0) {
                console.log(`[useMenuItems] ${unsyncedSales} unsynced sale(s) — keeping the tablet's own stock counts`)
            }

            setProducts(prods)
            setCategories(cats)

            // ── 4. Refresh offline cache ─────────────────────────────────────
            await db.products.clear()
            await db.products.bulkPut(
                prods.map((p) => ({ ...p, cachedAt: new Date().toISOString() }))
            )
            console.log('[useMenuItems] Offline cache refreshed from products table')
        } catch (err) {
            // Offline fallback — cache already reflects branch overrides from last online session
            console.warn('[useMenuItems] Falling back to offline cache', err)
            const cached = await db.products.toArray()
            if (cached.length > 0) {
                console.log(`[useMenuItems] Using ${cached.length} cached items`)
                const cats = [...new Set(cached.map((p) => p.category))]
                setProducts(cached as Product[])
                setCategories(cats)
            } else {
                setError('Could not load menu. Check your connection.')
            }
        } finally {
            setIsLoading(false)
        }
    }

    return { products, categories, isLoading, error, reload: loadItems }
}
