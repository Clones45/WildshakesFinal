import { useEffect, useState } from 'react'
import { supabase, type Product } from '../lib/supabase'
import { db } from '../lib/db'

/**
 * menu_items actual columns (verified against live DB):
 *   category, item_name, cost_per_serving,
 *   old_price, old_margin, new_price, new_margin, profit_in_peso
 *
 * There is NO `id` column — we synthesise a stable id from category + item_name.
 */
function makeId(category: string, itemName: string): string {
    return `${category}::${itemName}`.replace(/\s+/g, '_').toLowerCase()
}

function mapMenuItemToProduct(row: Record<string, unknown>): Product {
    const category = String(row.category ?? 'Other')
    const itemName = String(row.item_name ?? 'Unknown')
    return {
        id: makeId(category, itemName),
        name: itemName,
        category,
        // new_price is the selling price per masterprompt
        price: Number(row.new_price ?? 0),
        image_url: null,
        is_available: true,
    }
}

export function useMenuItems() {
    const [products, setProducts] = useState<Product[]>([])
    const [categories, setCategories] = useState<string[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        loadItems()
    }, [])

    async function loadItems() {
        setIsLoading(true)
        setError(null)

        try {
            // Select only columns confirmed to exist in the live DB.
            // No `id` column exists — do NOT include it.
            // Order by category then item_name (both confirmed columns).
            const { data, error: supaErr } = await supabase
                .from('menu_items')
                .select('category, item_name, new_price, cost_per_serving')
                .order('category')
                .order('item_name')

            if (supaErr) {
                console.error('[useMenuItems] Supabase error:', supaErr)
                throw supaErr
            }

            if (!data || data.length === 0) {
                console.warn('[useMenuItems] No rows returned — check RLS policies on menu_items')
                throw new Error('Empty result from menu_items')
            }

            // Filter out items with no price (e.g. Quesadilla row has null new_price)
            const validRows = (data as Record<string, unknown>[]).filter(
                (row) => row.new_price != null
            )

            console.log(`[useMenuItems] Loaded ${validRows.length} items from Supabase`)
            const prods = validRows.map(mapMenuItemToProduct)
            const cats = [...new Set(prods.map((p) => p.category))]

            setProducts(prods)
            setCategories(cats)

            // Bust the stale offline cache and replace with fresh data
            await db.products.clear()
            await db.products.bulkPut(
                prods.map((p) => ({ ...p, cachedAt: new Date().toISOString() }))
            )
            console.log('[useMenuItems] Offline cache refreshed')
        } catch (err) {
            // Offline fallback
            console.warn('[useMenuItems] Falling back to offline cache', err)
            const cached = await db.products.toArray()
            if (cached.length > 0) {
                console.log(`[useMenuItems] Using ${cached.length} cached items`)
                const cats = [...new Set(cached.map((p) => p.category))]
                setProducts(cached as Product[])
                setCategories(cats)
            } else {
                setError('Could not load menu. Check your connection and RLS policies.')
            }
        } finally {
            setIsLoading(false)
        }
    }

    return { products, categories, isLoading, error, reload: loadItems }
}
