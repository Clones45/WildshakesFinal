import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Product } from '../lib/supabase'
import { useCartStore } from '../store/cartStore'
import { Search, Coffee, Loader2, AlertTriangle, Plus, RefreshCw } from 'lucide-react'
import { SizePickerModal, type SizeOption } from './SizePickerModal'
import { FlavorPickerModal, requiresFriesFlavor, type FriesFlavor } from './FlavorPickerModal'
import { PearlsPickerModal, type PearlOption } from './PearlsPickerModal'
import { CoffeePickerModal, type CoffeeOption } from './CoffeePickerModal'

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

// ─── Size-picker categories ───────────────────────────────────────────────────
// These are the category names that are size variants for Fruitshakes / Milkshakes
const SHAKE_SIZE_CATEGORIES = new Set([
    'Fruitshakes Petite', 'Fruitshakes Grande',
    'Milkshakes Petite', 'Milkshakes Grande',
])

// ─── Coffee categories ────────────────────────────────────────────────────────
const COFFEE_CATEGORIES = new Set(['Coffee Hot', 'Coffee Iced'])

// ── Category consolidation ────────────────────────────────────────────────────
// Merge sub-categories into parent labels in the tab bar
const MERGE_MAP: Record<string, string> = {
    'Fruitshakes Petite': 'Fruitshakes',
    'Fruitshakes Grande': 'Fruitshakes',
    'Milkshakes Petite':  'Milkshakes',
    'Milkshakes Grande':  'Milkshakes',
    'Coffee Hot':         'Coffee',
    'Coffee Iced':        'Coffee',
}

const MERGED_SUB_CATS: Record<string, string[]> = {
    'Fruitshakes': ['Fruitshakes Petite', 'Fruitshakes Grande'],
    'Milkshakes':  ['Milkshakes Petite', 'Milkshakes Grande'],
    'Coffee':      ['Coffee Hot', 'Coffee Iced'],
}

// ─── Size-picker setup ────────────────────────────────────────────────────────
const SIZE_LABEL: Record<string, string> = {
    'Fruitshakes Petite':  'Petite',
    'Fruitshakes Grande':  'Grande',
    'Milkshakes Petite':   'Petite',
    'Milkshakes Grande':   'Grande',
}

const SHAKE_BASE_GROUPS: string[][] = [
    ['Fruitshakes Petite', 'Fruitshakes Grande'],
    ['Milkshakes Petite', 'Milkshakes Grande'],
]

function getSizeOptions(tappedProduct: Product, allProducts: Product[]): SizeOption[] | null {
    if (!SHAKE_SIZE_CATEGORIES.has(tappedProduct.category)) return null

    const group = SHAKE_BASE_GROUPS.find(g => g.includes(tappedProduct.category))
    if (!group) return null

    const variants = group
        .map(cat => {
            const match = allProducts.find(p => p.name === tappedProduct.name && p.category === cat)
            if (!match) return null
            return { sizeLabel: SIZE_LABEL[cat] ?? cat, product: match } as SizeOption
        })
        .filter((v): v is SizeOption => v !== null)

    return variants.length > 1 ? variants : null
}

function getCoffeeOptions(tappedProduct: Product, allProducts: Product[]): CoffeeOption[] | null {
    if (!COFFEE_CATEGORIES.has(tappedProduct.category)) return null

    const hotProduct  = allProducts.find(p => p.name === tappedProduct.name && p.category === 'Coffee Hot')
    const coldProduct = allProducts.find(p => p.name === tappedProduct.name && p.category === 'Coffee Iced')

    if (!hotProduct) return null // should always have a hot
    if (!coldProduct) return null // only hot available — no picker needed (handled below)

    const options: CoffeeOption[] = [
        { label: 'Hot',  product: hotProduct },
        { label: 'Cold', product: coldProduct },
    ]
    return options
}

export function ProductGrid({ products, categories, isLoading, menuError, onReload }: ProductGridProps) {
    const [activeCategory, setActiveCategory] = useState<string>('All')
    const [search, setSearch] = useState('')
    const { addItem, items } = useCartStore()
    const [flashId, setFlashId] = useState<string | null>(null)

    // Size picker (Shakes)
    const [sizePicker, setSizePicker] = useState<{ product: Product; options: SizeOption[] } | null>(null)
    // Pearls picker (Shakes — shown after size selection)
    const [pearlsPicker, setPearlsPicker] = useState<{ sizedProduct: Product; sizeLabel: string; emoji: string } | null>(null)
    // Flavor picker (Fries)
    const [flavorPicker, setFlavorPicker] = useState<Product | null>(null)
    // Coffee picker (Hot/Cold)
    const [coffeePicker, setCoffeePicker] = useState<{ product: Product; options: CoffeeOption[] } | null>(null)

    // ─── Tap handlers ─────────────────────────────────────────────────────────

    const handleProductTap = (product: Product) => {
        // 1. Fries flavor picker takes priority
        if (requiresFriesFlavor(product.name)) {
            setFlavorPicker(product)
            return
        }
        // 2. Coffee — check for Hot/Cold options
        if (COFFEE_CATEGORIES.has(product.category)) {
            const coffeeOpts = getCoffeeOptions(product, products)
            if (coffeeOpts) {
                setCoffeePicker({ product, options: coffeeOpts })
                return
            }
            // Only hot available (e.g. Espresso Shot) — add directly as Hot
            addItem(product, 'Hot')
            setFlashId(product.id)
            setTimeout(() => setFlashId(null), 350)
            return
        }
        // 3. Shakes — size picker
        const sizeOptions = getSizeOptions(product, products)
        if (sizeOptions) {
            setSizePicker({ product, options: sizeOptions })
            return
        }
        // 4. Regular product — add directly
        addItem(product)
        setFlashId(product.id)
        setTimeout(() => setFlashId(null), 350)
    }

    const handleFlavorSelect = (product: Product, flavor: FriesFlavor) => {
        addItem(product, flavor)
        setFlashId(product.id)
        setTimeout(() => setFlashId(null), 350)
        setFlavorPicker(null)
    }

    // After size selection → open pearls picker
    const handleSizeSelect = (sizedProduct: Product, sizeLabel: string) => {
        setSizePicker(null)
        const emoji = CATEGORY_EMOJIS[sizedProduct.category] ?? '🥤'
        setPearlsPicker({ sizedProduct, sizeLabel, emoji })
    }

    // After pearl selection → add item with combined variant and optional price override
    const handlePearlSelect = (pearl: PearlOption, finalPrice: number) => {
        if (!pearlsPicker) return
        const { sizedProduct, sizeLabel } = pearlsPicker
        const combinedVariant = `${sizeLabel} · ${pearl}`
        const overridePrice = finalPrice !== sizedProduct.price ? finalPrice : undefined
        addItem(sizedProduct, combinedVariant, overridePrice)
        setFlashId(sizedProduct.id)
        setTimeout(() => setFlashId(null), 350)
        setPearlsPicker(null)
    }

    // After coffee temp selection → add directly
    const handleCoffeeSelect = (product: Product, tempLabel: 'Hot' | 'Cold') => {
        addItem(product, tempLabel)
        setFlashId(product.id)
        setTimeout(() => setFlashId(null), 350)
        setCoffeePicker(null)
    }

    // ─── Category tabs ─────────────────────────────────────────────────────────

    const isMergedCategory = (cat: string) => cat in MERGED_SUB_CATS

    // Build deduplicated category list for tabs
    const allCategories = ['All', ...(() => {
        const seen = new Set<string>()
        const result: string[] = []
        for (const cat of categories) {
            const label = MERGE_MAP[cat] ?? cat
            if (!seen.has(label)) { seen.add(label); result.push(label) }
        }
        return result
    })()]

    // ─── Product filtering & deduplication ────────────────────────────────────

    const filtered = (() => {
        const matchesCat = (p: Product) => {
            if (activeCategory === 'All') return true
            if (isMergedCategory(activeCategory)) return MERGED_SUB_CATS[activeCategory].includes(p.category)
            return p.category === activeCategory
        }

        const base = products.filter(p => {
            if (!matchesCat(p)) return false
            if (!p.name.toLowerCase().includes(search.toLowerCase())) return false

            // For shakes: show card if ANY size variant is available
            if (SHAKE_SIZE_CATEGORIES.has(p.category)) {
                return products.some(other =>
                    other.name === p.name &&
                    SHAKE_SIZE_CATEGORIES.has(other.category) &&
                    other.is_available !== false
                )
            }
            // For coffee: show card if the Hot variant (representative) is available
            // (iced variant is shown inside the picker)
            if (COFFEE_CATEGORIES.has(p.category)) {
                if (p.category === 'Coffee Iced') return false // hide iced from grid — shown in picker
                return p.is_available !== false
            }
            return p.is_available !== false
        })

        // Deduplicate by name — one card per product name
        const seen = new Set<string>()
        return base.filter(p => {
            if (seen.has(p.name)) return false
            seen.add(p.name)
            return true
        })
    })()

    // ─── Cart badges ──────────────────────────────────────────────────────────

    const cartQtyMap = new Map<string, number>()
    for (const ci of items) {
        const key = ci.product.id + (ci.variant ?? '')
        cartQtyMap.set(key, (cartQtyMap.get(key) ?? 0) + ci.quantity)
    }
    const cartNameMap = new Map<string, number>()
    for (const ci of items) {
        cartNameMap.set(ci.product.name, (cartNameMap.get(ci.product.name) ?? 0) + ci.quantity)
    }

    const categoryCount = (cat: string) => {
        if (cat === 'All') return [...new Set(products.map(p => p.name))].length
        const subCats = MERGED_SUB_CATS[cat]
        if (subCats) {
            return [...new Set(products.filter(p => subCats.includes(p.category)).map(p => p.name))].length
        }
        return products.filter(p => p.category === cat).length
    }

    // ─── Render ───────────────────────────────────────────────────────────────

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
            {/* Size picker modal (Shakes) */}
            {sizePicker && (
                <SizePickerModal
                    baseName={sizePicker.product.name}
                    emoji={CATEGORY_EMOJIS[sizePicker.product.category] ?? '🥤'}
                    options={sizePicker.options}
                    onSelect={handleSizeSelect}
                    onClose={() => setSizePicker(null)}
                />
            )}
            {/* Pearls picker modal (after size selection) */}
            {pearlsPicker && (
                <PearlsPickerModal
                    baseName={pearlsPicker.sizedProduct.name}
                    sizeLabel={pearlsPicker.sizeLabel}
                    basePrice={pearlsPicker.sizedProduct.price}
                    emoji={pearlsPicker.emoji}
                    onSelect={handlePearlSelect}
                    onClose={() => setPearlsPicker(null)}
                />
            )}
            {/* Coffee picker modal (Hot / Cold) */}
            {coffeePicker && (
                <CoffeePickerModal
                    baseName={coffeePicker.product.name}
                    options={coffeePicker.options}
                    onSelect={handleCoffeeSelect}
                    onClose={() => setCoffeePicker(null)}
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
                                // Badge counts
                                const isShake = SHAKE_SIZE_CATEGORIES.has(product.category)
                                const isCoffee = COFFEE_CATEGORIES.has(product.category)
                                const cartQty = (isShake || isCoffee)
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
                                            {/* Show "Coffee" for both hot/iced in the tag */}
                                            {COFFEE_CATEGORIES.has(product.category) ? 'Coffee' : product.category}
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
