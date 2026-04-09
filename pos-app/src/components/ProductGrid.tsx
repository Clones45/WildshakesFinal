import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Product } from '../lib/supabase'
import { useCartStore } from '../store/cartStore'
import { ShoppingCart, Search, Coffee, Loader2, AlertTriangle } from 'lucide-react'

const CATEGORY_EMOJIS: Record<string, string> = {
    // Exact category values from Wildshakes menu_items table
    'Fruitshakes Grande': '🥤',
    'Fruitshakes Regular': '🍹',
    'Milkshakes': '🍦',
    'Coffee': '☕',
    'Pasta': '🍝',
    'Chicken Wings': '🍗',
    'Chicken Wings Rice Meals': '🍚',
    'Rice Meals': '🍛',
    'Pica Pica': '🍟',
    'Burger and Fries': '🍔',
    'Tortilla Pizza': '🍕',
    'Snacks': '🧆',
    'Add-ons': '➕',
}


interface ProductGridProps {
    products: Product[]
    categories: string[]
    isLoading: boolean
    menuError?: string | null
}

export function ProductGrid({ products, categories, isLoading, menuError }: ProductGridProps) {
    const [activeCategory, setActiveCategory] = useState<string>('All')
    const [search, setSearch] = useState('')
    const { addItem } = useCartStore()
    const [addedId, setAddedId] = useState<string | null>(null)

    const allCategories = ['All', ...categories]

    const filtered = products.filter((p) => {
        const matchCat = activeCategory === 'All' || p.category === activeCategory
        const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
        return matchCat && matchSearch
    })

    const handleAdd = (product: Product) => {
        addItem(product)
        setAddedId(product.id)
        setTimeout(() => setAddedId(null), 300)
    }

    return (
        <div className="flex flex-col h-full">
            {/* Search bar */}
            <div className="px-4 pt-4 pb-3">
                <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                        type="text"
                        placeholder="Search menu…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="input-field pl-9 text-sm"
                    />
                </div>
            </div>

            {/* Category tabs */}
            <div className="px-4 pb-3 flex gap-2 overflow-x-auto scrollbar-none">
                {allCategories.map((cat) => (
                    <button
                        key={cat}
                        onClick={() => setActiveCategory(cat)}
                        className={`category-tab flex items-center gap-1.5 ${activeCategory === cat ? 'category-tab-active' : 'category-tab-inactive'}`}
                    >
                        <span>{CATEGORY_EMOJIS[cat] ?? '📋'}</span>
                        {cat}
                    </button>
                ))}
            </div>

            {/* Product grid */}
            <div className="flex-1 overflow-y-auto px-4 pb-4">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-600">
                        <Loader2 size={32} className="animate-spin text-brand-500" />
                        <p className="text-sm">Loading menu…</p>
                    </div>
                ) : menuError ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3">
                        <AlertTriangle size={40} className="text-red-500" />
                        <p className="text-red-400 text-sm font-semibold">Menu failed to load</p>
                        <p className="text-gray-500 text-xs text-center max-w-xs">{menuError}</p>
                        <p className="text-gray-600 text-xs">Check RLS policies on menu_items table</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-600">
                        <Coffee size={40} />
                        <p className="text-sm">No items found</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                        <AnimatePresence>
                            {filtered.map((product) => (
                                <motion.button
                                    key={product.id}
                                    layout
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{
                                        opacity: 1,
                                        scale: addedId === product.id ? 0.97 : 1,
                                    }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    onClick={() => handleAdd(product)}
                                    className="product-card text-left"
                                >
                                    {/* Category tag */}
                                    <span className="absolute top-2 right-2 text-xs px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-400 font-medium">
                                        {product.category}
                                    </span>

                                    {/* Icon / Image */}
                                    <div className="w-12 h-12 rounded-xl bg-brand-100 flex items-center justify-center text-3xl mb-1 shadow-inner">
                                        {CATEGORY_EMOJIS[product.category] ?? '🍵'}
                                    </div>

                                    <p className="font-bold text-surface-800 text-sm leading-tight line-clamp-2">
                                        {product.name}
                                    </p>

                                    <div className="flex items-center justify-between mt-auto">
                                        <span className="text-brand-500 font-bold text-base">
                                            ₱{product.price.toFixed(2)}
                                        </span>
                                        <div className="w-8 h-8 rounded-full bg-brand-50 flex items-center justify-center border border-brand-200">
                                            <ShoppingCart size={15} className="text-brand-500" />
                                        </div>
                                    </div>

                                    {/* Flash overlay on tap */}
                                    <AnimatePresence>
                                        {addedId === product.id && (
                                            <motion.div
                                                initial={{ opacity: 0.4 }}
                                                animate={{ opacity: 0 }}
                                                exit={{ opacity: 0 }}
                                                transition={{ duration: 0.3 }}
                                                className="absolute inset-0 rounded-2xl bg-brand-400/30"
                                            />
                                        )}
                                    </AnimatePresence>
                                </motion.button>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </div>
    )
}
