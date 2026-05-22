import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Product } from '../lib/supabase'
import { useCartStore } from '../store/cartStore'
import { Search, Coffee, Loader2, AlertTriangle, Plus, RefreshCw } from 'lucide-react'
import { SizePickerModal, type SizeOption } from './SizePickerModal'
import { FlavorPickerModal, requiresFriesFlavor, type FriesFlavor } from './FlavorPickerModal'

const CATEGORY_EMOJIS: Record<string, string> = {
    // Exact category values from Wildshakes products table
    'Fruitshakes':         '🍹',
    'Fruitshakes Grande':  '🥤',
    'Fruitshakes Petite':  '🍹',
    'Fruitshakes Regular': '🍹',
    'Milkshakes':          '🍦',
    'Milkshakes Grande':   '🍦',
    'Milkshakes Petite':   '🍨',
    'Coffee Hot':          '☕',
    'Coffee Iced':         '🧋',
    'Coffee':              '☕',
    'Pasta':               '🍝',
    'Chicken Wings':       '🍗',
    'Chicken Wings Rice Meals': '🍚',
    'Rice Meals':          '🍛',
    'Pica Pica':           '🍟',
    'Burger and Fries':    '🍔',
    'Tortilla Pizza':      '🍕',
    'Snacks':              '🧆',
    'Add-ons':             '➕',
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
    const [sizePicker, setSizePicker] = useState<{ product: Product; options: SizeOption[] } | null>(null)
    const [flavorPicker, setFlavorPicker] = useState<Product | null>(null)

    const handleProductTap = (product: Product) => {
        // Fries flavor picker takes priority
        if (requiresFriesFlavor(product.name)) {
            setFlavorPicker(product)
            return
        }
        const options = getSizeOptions(product, products)
        if (options) {
            setSizePicker({ product, options })
        } else {
            addItem(product)
            setFlashId(product.id)
            setTimeout(() => setFlashId(null), 350)
        }
    }

    const handleFlavorSelect = (product: Product, flavor: FriesFlavor) => {
        addItem(product, flavor)   // flavor stored as the variant
        setFlashId(product.id)
        setTimeout(() => setFlashId(null), 350)
        setFlavorPicker(null)
    }

    const handleSizeSelect = (sizedProduct: Product, sizeLabel: string) => {
        addItem(sizedProduct, sizeLabel)
        setFlashId(sizedProduct.id)
        setTimeout(() => setFlashId(null), 350)
        setSizePicker(null)
    }

    // ── Category consolidation ───────────────────────────────────────────────
    // Merge the 4 size sub-categories into 2 parent labels in the tab bar
    const MERGE_MAP: Record<string, string> = {
        'Fruitshakes Petite': 'Fruitshakes',
        'Fruitshakes Grande': 'Fruitshakes',
        'Milkshakes Petite':  'Milkshakes',
        'Milkshakes Grande':  'Milkshakes',
    }

    // Build deduplicated category list for the tabs
    const allCategories = ['All', ...(() => {
        const seen = new Set<string>()
        const result: string[] = []
        for (const cat of categories) {
            const label = MERGE_MAP[cat] ?? cat
            if (!seen.has(label)) { seen.add(label); result.push(label) }
        }
        return result
    })()]

    // Filter + deduplicate products for display
    // When a merged category (e.g. "Fruitshakes") is active, include products from all its sub-categories
    // but show each name only ONCE (using the first/cheapest variant as the card representative)
    const MERGED_SUB_CATS: Record<string, string[]> = {
        'Fruitshakes': ['Fruitshakes Petite', 'Fruitshakes Grande'],
        'Milkshakes':  ['Milkshakes Petite', 'Milkshakes Grande'],
    }

    const isMergedCategory = (cat: string) => cat in MERGED_SUB_CATS

    // ─── Size-picker categories ───────────────────────────────────────────────
    // These are the category names that are size variants for Fruitshakes / Milkshakes
    const SHAKE_SIZE_CATEGORIES = new Set([
        'Fruitshakes Petite', 'Fruitshakes Grande',
        'Milkshakes Petite', 'Milkshakes Grande',
    ])

    const filtered = (() => {
        // Step 1: which products match the active category / search
        const matchesCat = (p: Product) => {
            if (activeCategory === 'All') return true
            if (isMergedCategory(activeCategory)) return MERGED_SUB_CATS[activeCategory].includes(p.category)
            return p.category === activeCategory
        }

        const base = products.filter(p => {
            if (!matchesCat(p)) return false
            if (!p.name.toLowerCase().includes(search.toLowerCase())) return false

            if (SHAKE_SIZE_CATEGORIES.has(p.category)) {
                // For shakes, show the base card if ANY size variant of this shake is available
                return products.some(other => 
                    other.name === p.name && 
                    SHAKE_SIZE_CATEGORIES.has(other.category) && 
                    other.is_available !== false
                )
            }
            // For normal products, only show if available
            return p.is_available !== false
        })

        // Step 2: deduplicate by name — keep only ONE card per product name
        // (prefer the Petite/smaller variant as the representative so the price shown is the lower bound)
        const seen = new Set<string>()
        return base.filter(p => {
            if (seen.has(p.name)) return false
            seen.add(p.name)
            return true
        })
    })()

    // Build a map of productId+variant → quantity in cart for badges
    const cartQtyMap = new Map<string, number>()
    for (const ci of items) {
        const key = ci.product.id + (ci.variant ?? '')
        cartQtyMap.set(key, (cartQtyMap.get(key) ?? 0) + ci.quantity)
    }
    // Also map by name for consolidated badge counting on merged categories
    const cartNameMap = new Map<string, number>()
    for (const ci of items) {
        cartNameMap.set(ci.product.name, (cartNameMap.get(ci.product.name) ?? 0) + ci.quantity)
    }

    // Item count per category for badges (deduplicated for merged categories)
    const categoryCount = (cat: string) => {
        if (cat === 'All') return [...new Set(products.map(p => p.name))].length
        const subCats = MERGED_SUB_CATS[cat]
        if (subCats) {
            return [...new Set(products.filter(p => subCats.includes(p.category)).map(p => p.name))].length
        }
        return products.filter(p => p.category === cat).length
    }

// ─── Size-picker setup ────────────────────────────────────────────────────────

// Map each size-category to a display label for the picker
const SIZE_LABEL: Record<string, string> = {
    'Fruitshakes Petite':  'Petite',
    'Fruitshakes Grande':  'Grande',
    'Milkshakes Petite':   'Petite',
    'Milkshakes Grande':   'Grande',
}

// Group same-base-type categories together so we know which categories to search
const SHAKE_BASE_GROUPS: string[][] = [
    ['Fruitshakes Petite', 'Fruitshakes Grande'],
    ['Milkshakes Petite', 'Milkshakes Grande'],
]

function getSizeOptions(tappedProduct: Product, allProducts: Product[]): SizeOption[] | null {
    if (!SHAKE_SIZE_CATEGORIES.has(tappedProduct.category)) return null

    // Find the group this category belongs to
    const group = SHAKE_BASE_GROUPS.find(g => g.includes(tappedProduct.category))
    if (!group) return null

    // Find all same-name products across the group's categories
    const variants = group
        .map(cat => {
            const match = allProducts.find(p => p.name === tappedProduct.name && p.category === cat)
            if (!match) return null
            return { sizeLabel: SIZE_LABEL[cat] ?? cat, product: match } as SizeOption
        })
        .filter((v): v is SizeOption => v !== null)

    // Only show picker when we have more than 1 size variant
    return variants.length > 1 ? variants : null
}
// ─────────────────────────────────────────────────────────────────────────────


    return (
        <div className="flex flex-col h-full">
            {/* Flavor picker modal (Fries) */}
            {flavorPicker && (
                <FlavorPickerModal
                    product={flavorPicker}
                    onSelect={handleFlavorSelect}
                    onClose={() => setFlavorPicker(null)}
                />
            )}
            {/* Size picker modal */}
            {sizePicker && (
                <SizePickerModal
                    baseName={sizePicker.product.name}
                    emoji={CATEGORY_EMOJIS[sizePicker.product.category] ?? '🥤'}
                    options={sizePicker.options}
                    onSelect={handleSizeSelect}
                    onClose={() => setSizePicker(null)}
                />
            )}
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
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isActive
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
                                // For shake products (size-picker ones), badge = total qty across all sizes of this name
                                const isShake = SHAKE_SIZE_CATEGORIES.has(product.category)
                                const cartQty = isShake
                                    ? (cartNameMap.get(product.name) ?? 0)
                                    : (cartQtyMap.get(product.id + '') ?? 0)
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
                                        onClick={() => handleProductTap(product)}
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
                                                className={`w-8 h-8 rounded-full flex items-center justify-center border transition-all ${inCart
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
