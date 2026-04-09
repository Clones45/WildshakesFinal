import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { supabase, type Product } from '../lib/supabase'
import { db } from '../lib/db'

export function useProducts() {
    const { branch } = useAuthStore()
    const [products, setProducts] = useState<Product[]>([])
    const [categories, setCategories] = useState<string[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        loadProducts()
    }, [branch])

    async function loadProducts() {
        setIsLoading(true)
        try {
            // Try Supabase first
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .eq('is_available', true)
                .order('category')
                .order('name')

            if (data && !error) {
                const prods = data as Product[]
                setProducts(prods)
                const cats = [...new Set(prods.map((p) => p.category))]
                setCategories(cats)

                // Cache for offline use
                await db.products.bulkPut(
                    prods.map((p) => ({ ...p, cachedAt: new Date().toISOString() }))
                )
                return
            }
        } catch {
            // Fall through to offline cache
        }

        // Load from offline cache
        const cached = await db.products.toArray()
        const cats = [...new Set(cached.map((p) => p.category))]
        setProducts(cached as Product[])
        setCategories(cats)
        setIsLoading(false)
    }

    // Once products are set and loading unset
    useEffect(() => {
        if (products.length > 0) setIsLoading(false)
    }, [products])

    return { products, categories, isLoading, reload: loadProducts }
}
