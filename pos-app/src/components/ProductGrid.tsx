import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Product } from '../lib/supabase'
import { useCartStore } from '../store/cartStore'
import { Search, Coffee, Loader2, AlertTriangle, Plus, RefreshCw } from 'lucide-react'

const CATEGORY_EMOJIS: Record<string, string> = {
    // Exact category values from Wildshakes products table
    'Fruitshakes Grande':        '🥤',
    'Fruitshakes Petite':        '🍹',
    'Fruitshakes Regular':       '🍹',
    'Milkshakes Grande':         '🍦',
    'Milkshakes Petite':         '🍨',
    'Milkshakes':                '🍦',
    'Coffee Hot':                '☕',
    'Coffee Iced':               '🧋',
    'Coffee':                    '☕',
    'Pasta':                     '🍝',
    'Chicken Wings':             '🍗',
    'Chicken Wings Rice Meals':  '🍚',
    'Rice Meals':                '🍛',
    'Pica Pica':                 '🍟',
    'Burger and Fries':          '🍔',
    'Tortilla Pizza':            '🍕',
    'Snacks':                    '🧆',
    'Add-ons':                   '➕',
}

interface ProductGridProps {
    products: Product[]
    categories: string[]
    isLoading: boolean
    menuError?: string | null
    onReload?: () => void
}

export function ProductGrid({ products, categories, isLoading, menuError, onReload }: ProductGridProps) {
    const [activeCategory, setActiveCategory] = useState<string>('All')
    const [search, setSearch] = useState('')
    const { addItem, items } = useCartStore()
    const [flashId, setFlashId] = useState<string | null>(null)

    // Build a map of productId → quantity in cart for badges
    const cartQtyMap = new Map<string, number>()
    for (const ci of items) {
        cartQtyMap.set(ci.product.id, ci.quantity)
    }

    const allCategories = ['All', ...categories]

    const filtered = products.filter((p) => {
        const matchCat = activeCategory === 'All' || p.category === activeCategory
        const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
        return matchCat && matchSearch
    })

    // Item count per category for badges
    const categoryCount = (cat: string) =>
        cat === 'All' ? products.length : products.filter((p) => p.category === cat).length

    const handleAdd = (product: Product) => {
        addItem(product)
        setFlashId(product.id)
        setTimeout(() => setFlashId(null), 350)
    }

    return (
        <div className="flex flex-col h-full">
            {/* Search bar */}
            <div className="px-4 pt-4 pb-3 flex items-center gap-2">
                <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                        id="product-search-input"
                        type="text"
                        placeholder="Search menu (Shift + F)…"
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setActiveCategory('All') }}
                        className="input-field pl-9 text-sm"
                    />
                </div>
                {onReload && (
                    <button
                        onClick={onReload}
                        disabled={isLoading}
                        title="Reload menu"
                        className="w-10 h-10 flex items-center justify-center rounded-xl bg-brand-50 border border-brand-200 text-brand-500 hover:bg-brand-100 transition-all disabled:opacity-40"
                    >
                        <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                )}
            </div>

            {/* Category tabs */}
            <div className="px-4 pb-3 flex gap-2 overflow-x-auto scrollbar-none">
                {allCategories.map((cat) => {
                    const isActive = activeCategory === cat
                    const count = categoryCount(cat)
                    return (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`category-tab flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${isActive ? 'category-tab-active' : 'category-tab-inactive'}`}
                        >
                            <span>{cat === 'All' ? '🍽️' : CATEGORY_EMOJIS[cat] ?? '📋'}</span>
                            <span>{cat}</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                isActive
                                    ? 'bg-white/30 text-white'
                                    : 'bg-brand-100 text-brand-500'
                            }`}>
                                {count}
                            </span>
                        </button>
                    )
                })}
            </div>

            {/* Product grid */}
            <div className="flex-1 overflow-y-auto px-4 pb-4">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-600">
                        <Loader2 size={32} className="animate-spin text-brand-500" />
                        <p className="text-sm font-semibold">Loading menu…</p>
                    </div>
                ) : menuError ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4">
                        <AlertTriangle size={40} className="text-red-400" />
                        <p className="text-red-400 text-sm font-semibold">Menu failed to load</p>
                        <p className="text-gray-500 text-xs text-center max-w-xs">{menuError}</p>
                        {onReload && (
                            <button
                                onClick={onReload}
                                className="btn-ghost flex items-center gap-2 text-sm"
                            >
                                <RefreshCw size={14} /> Retry
                            </button>
                        )}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-500">
                        <Coffee size={40} className="opacity-40" />
                        <p className="text-sm font-semibold">No items found</p>
                        {search && (
                            <button
                                onClick={() => setSearch('')}
                                className="text-brand-500 text-xs font-bold underline"
                            >
                                Clear search
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                        <AnimatePresence>
                            {filtered.map((product) => {
                                const cartQty = cartQtyMap.get(product.id) ?? 0
                                const inCart = cartQty > 0
                                const isFlashing = flashId === product.id

                                return (
                                    <motion.button
                                        key={product.id}
                                        layout
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{
                                            opacity: 1,
                                            scale: isFlashing ? 0.96 : 1,
                                        }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        onClick={() => handleAdd(product)}
                                        className={`product-card text-left relative ${inCart ? 'ring-2 ring-brand-400/60' : ''}`}
                                    >
                                        {/* In-cart quantity badge */}
                                        {inCart && (
                                            <motion.span
                                                initial={{ scale: 0 }}
                                                animate={{ scale: 1 }}
                                                className="absolute top-2 left-2 z-10 min-w-[22px] h-[22px] px-1.5 rounded-full bg-brand-500 text-white text-[11px] font-black flex items-center justify-center shadow-md"
                                            >
                                                ×{cartQty}
                                            </motion.span>
                                        )}

                                        {/* Category tag */}
                                        <span className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded-full bg-brand-500/15 text-brand-600 font-semibold leading-tight max-w-[80px] text-right truncate">
                                            {product.category}
                                        </span>

                                        {/* Icon */}
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-3xl mb-1 shadow-inner ${inCart ? 'bg-brand-200' : 'bg-brand-100'}`}>
                                            {CATEGORY_EMOJIS[product.category] ?? '🍵'}
                                        </div>

                                        <p className="font-bold text-surface-800 text-sm leading-tight line-clamp-2">
                                            {product.name}
                                        </p>

                                        <div className="flex items-center justify-between mt-auto pt-1">
                                            <span className="text-brand-600 font-bold text-base">
                                                ₱{product.price.toFixed(2)}
                                            </span>
                                            <motion.div
                                                whileTap={{ scale: 0.85 }}
                                                className={`w-8 h-8 rounded-full flex items-center justify-center border transition-all ${
                                                    inCart
                                                        ? 'bg-brand-500 border-brand-500 text-white'
                                                        : 'bg-brand-50 border-brand-200 text-brand-500'
                                                }`}
                                            >
                                                <Plus size={15} />
                                            </motion.div>
                                        </div>

                                        {/* Flash overlay on tap */}
                                        <AnimatePresence>
                                            {isFlashing && (
                                                <motion.div
                                                    initial={{ opacity: 0.5 }}
                                                    animate={{ opacity: 0 }}
                                                    exit={{ opacity: 0 }}
                                                    transition={{ duration: 0.35 }}
                                                    className="absolute inset-0 rounded-2xl bg-brand-400/30"
                                                />
                                            )}
                                        </AnimatePresence>
                                    </motion.button>
                                )
                            })}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </div>
    )
}
