import { useEffect, useRef, useState } from 'react'
import { supabase, type Product } from '../lib/supabase'
import { db } from '../lib/db'
import { useAuthStore } from '../store/authStore'
import { computeEffectiveStock, SHAREABLE_INGREDIENT_NAMES } from '../lib/menuAvailability'

/**
 * Loads menu items from the `products` table.
 * Applies this branch's own prices from `branch_product_prices` and its
 * availability overrides from `branch_menu_availability`.
 * Falls back to Dexie offline cache if Supabase is unreachable.
 *
 * Stays current three ways:
 *  - Realtime: the database pushes a change the moment head office edits a price or
 *    the products table, or a sold-out mark or daily limit changes for this branch.
 *  - A refresh whenever the tablet comes back online or the app comes back to the
 *    front, since a push can be missed while the socket was down.
 *  - A timer, as a last resort, so an open till is never more than a few minutes
 *    behind even if every push was lost.
 *  Background refreshes are silent: the grid never flashes a loading state mid-order.
 *
 * Rules:
 *  - Global `products.is_available = false`  → hidden everywhere (master admin only)
 *  - `branch_menu_availability.is_available = false` → hidden at this branch only
 *  - No row in branch_menu_availability → product is available at this branch
 *  - A `branch_product_prices` row with a price → that price at this branch;
 *    a null column there, or no row → the menu's own price
 */
const BACKGROUND_REFRESH_MS = 5 * 60_000

export function useMenuItems() {
    const { branch } = useAuthStore()
    const [products, setProducts] = useState<Product[]>([])
    const [categories, setCategories] = useState<string[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    // One load at a time: a push and the timer can land together.
    const inFlight = useRef<Promise<void> | null>(null)

    useEffect(() => {
        loadItems()

        const refresh = (why: string) => {
            console.log(`[useMenuItems] ${why} — refreshing menu`)
            loadItems(true)
        }

        // ── Realtime: the database pushes every change that matters to this till ──
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
                () => refresh('Branch availability changed')
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'branch_product_prices',
                    filter: branch?.id ? `branch_id=eq.${branch.id}` : undefined,
                },
                () => refresh('Branch prices changed')
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'products' },
                () => refresh('Products table changed')
            )
            .subscribe()

        // ── Catch anything a push missed ──────────────────────────────────────
        const onOnline = () => refresh('Back online')
        const onVisible = () => { if (document.visibilityState === 'visible') refresh('App back in front') }
        window.addEventListener('online', onOnline)
        document.addEventListener('visibilitychange', onVisible)
        const timer = window.setInterval(() => refresh('Periodic check'), BACKGROUND_REFRESH_MS)

        return () => {
            supabase.removeChannel(channel)
            window.removeEventListener('online', onOnline)
            document.removeEventListener('visibilitychange', onVisible)
            window.clearInterval(timer)
        }
    }, [branch?.id])

    /** silent: a background refresh that must not show a loading state. */
    function loadItems(silent = false): Promise<void> {
        if (inFlight.current) return inFlight.current
        const run = doLoad(silent).finally(() => { inFlight.current = null })
        inFlight.current = run
        return run
    }

    async function doLoad(silent: boolean) {
        if (!silent) setIsLoading(true)
        setError(null)

        try {
            // ── 1. Fetch all globally available products ─────────────────────
            const { data: allProducts, error: prodErr } = await supabase
                .from('products')
                .select('id, name, category, price, delivery_price, image_url, is_available')
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

            // ── 2. Fetch this branch's own prices and out-of-stock overrides ──
            const unavailableIds = new Set<string>()
            const stockQuantities = new Map<string, number | null>()
            const branchPrices = new Map<string, { price: number | null; delivery_price: number | null }>()
            if (branch?.id) {
                const [{ data: overrides }, { data: prices }] = await Promise.all([
                    supabase
                        .from('branch_menu_availability')
                        .select('product_id, is_available, stock_qty')
                        .eq('branch_id', branch.id),
                    supabase
                        .from('branch_product_prices')
                        .select('product_id, price, delivery_price')
                        .eq('branch_id', branch.id),
                ])

                if (overrides) {
                    for (const o of overrides as { product_id: string; is_available: boolean; stock_qty: number | null }[]) {
                        stockQuantities.set(o.product_id, o.stock_qty)
                        // Hide if explicitly marked unavailable
                        if (!o.is_available) { unavailableIds.add(o.product_id); continue }
                        // Hide if stock_qty is set and has reached 0
                        if (o.stock_qty !== null && o.stock_qty <= 0) { unavailableIds.add(o.product_id) }
                    }
                }
                for (const r of (prices ?? []) as { product_id: string; price: number | null; delivery_price: number | null }[]) {
                    branchPrices.set(r.product_id, { price: r.price, delivery_price: r.delivery_price })
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
            // Deliberately narrow — see SHAREABLE_INGREDIENT_NAMES for why this isn't
            // every portion/piece ingredient (a bun is shared too, but a count on Beef
            // Burger isn't meant to cap Crispy Chicken Burger along with it).
            const [recipeLinks, ingredients] = await Promise.all([
                db.recipeLinks.toArray(),
                db.ingredientStock.toArray(),
            ])
            const shareableIngredientIds = new Set(
                ingredients
                    .filter(i => SHAREABLE_INGREDIENT_NAMES.has(i.name))
                    .map(i => i.inventoryItemId)
            )
            const withOwnCount = (allProducts as Product[]).map(p => ({ id: p.id, stock_qty: stockFor(p.id) }))
            const effective = computeEffectiveStock(withOwnCount, recipeLinks, shareableIngredientIds)

            // ── 3. Apply this branch's prices and unavailable items ─────────────────
            // stock_qty rides along so the grid can warn when an item is running low.
            // Prices are numeric in the database and arrive as numbers or strings; both
            // become plain numbers here so the cart never adds up strings.
            const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v))
            const prods = (allProducts as Product[]).map(p => {
                const stock_qty = stockFor(p.id)
                const effective_stock = effective.get(p.id) ?? null
                const soldOut = unavailableIds.has(p.id)
                    || (effective_stock !== null && effective_stock <= 0)
                const own = branchPrices.get(p.id)
                const price = num(own?.price) ?? Number(p.price)
                const delivery_price = num(own?.delivery_price) ?? num(p.delivery_price)
                return { ...p, price, delivery_price, is_available: soldOut ? false : p.is_available, stock_qty, effective_stock }
            })
            const cats = [...new Set(prods.map((p) => p.category))]

            console.log(`[useMenuItems] Loaded ${allProducts.length} items from Supabase products`)
            if (unavailableIds.size > 0) {
                console.log(`[useMenuItems] ${unavailableIds.size} item(s) hidden by branch override`)
            }
            if (branchPrices.size > 0) {
                console.log(`[useMenuItems] ${branchPrices.size} item(s) priced for this branch`)
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
            // Offline fallback — cache already reflects branch prices and overrides from the last online session
            console.warn('[useMenuItems] Falling back to offline cache', err)
            const cached = await db.products.toArray()
            if (cached.length > 0) {
                console.log(`[useMenuItems] Using ${cached.length} cached items`)
                const cats = [...new Set(cached.map((p) => p.category))]
                setProducts(cached.map(p => ({ ...p, delivery_price: p.delivery_price ?? null })) as Product[])
                setCategories(cats)
            } else if (!silent) {
                setError('Could not load menu. Check your connection.')
            }
        } finally {
            if (!silent) setIsLoading(false)
        }
    }

    return { products, categories, isLoading, error, reload: () => loadItems(false) }
}
