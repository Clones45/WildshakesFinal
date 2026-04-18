import { useEffect, useState } from 'react'
import { supabase, type Product } from '../lib/supabase'
import { db } from '../lib/db'

/**
 * Loads menu items from the `products` table (133 real items synced from menu_items).
 * Falls back to Dexie offline cache if Supabase is unreachable.
 */
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
            const { data, error: supaErr } = await supabase
                .from('products')
                .select('id, name, category, price, image_url, is_available')
                .eq('is_available', true)
                .order('category')
                .order('name')

            if (supaErr) {
                console.error('[useMenuItems] Supabase error:', supaErr)
                throw supaErr
            }

            if (!data || data.length === 0) {
                console.warn('[useMenuItems] No rows returned from products table')
                throw new Error('Empty result from products')
            }

            console.log(`[useMenuItems] Loaded ${data.length} items from Supabase products`)
            const prods = data as Product[]
            const cats = [...new Set(prods.map((p) => p.category))]

            setProducts(prods)
            setCategories(cats)

            // Refresh offline cache
            await db.products.clear()
            await db.products.bulkPut(
                prods.map((p) => ({ ...p, cachedAt: new Date().toISOString() }))
            )
            console.log('[useMenuItems] Offline cache refreshed from products table')
        } catch (err) {
            // Offline fallback
            console.warn('[useMenuItems] Falling back to offline cache', err)
            const cached = await db.products.toArray()
            if (cached.length > 0) {
                console.log(`[useMenuItems] Using ${cached.length} cached items`)
                // Filter available only from cache
                const available = cached.filter((p) => p.is_available !== false)
                const cats = [...new Set(available.map((p) => p.category))]
                setProducts(available as Product[])
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
