import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Product } from '../lib/supabase'
import { useCartStore } from '../store/cartStore'
import { Search, Coffee, Loader2, AlertTriangle, Plus, RefreshCw, Bike } from 'lucide-react'
import { SizePickerModal, type SizeOption } from './SizePickerModal'
import { FlavorPickerModal, requiresFriesFlavor, type FriesFlavor } from './FlavorPickerModal'
import { PearlsPickerModal, type PearlOption } from './PearlsPickerModal'
import { CoffeePickerModal, type CoffeeOption } from './CoffeePickerModal'
import { getDeliveryPrice } from '../lib/deliveryPricing'

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
    deliveryPlatform?: 'foodpanda' | 'grab' | null
    onDeliveryTabClick?: () => void
}

// ─── Size-picker categories ───────────────────────────────────────────────────
const SHAKE_SIZE_CATEGORIES = new Set([
    'Fruitshakes Petite', 'Fruitshakes Grande',
    'Milkshakes Petite', 'Milkshakes Grande',
])

// ─── Coffee categories ────────────────────────────────────────────────────────
const COFFEE_CATEGORIES = new Set(['Coffee Hot', 'Coffee Iced'])

// ── Category consolidation ────────────────────────────────────────────────────
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

    if (!hotProduct) return null
    if (!coldProduct) return null

    return [
        { label: 'Hot',  product: hotProduct },
        { label: 'Cold', product: coldProduct },
    ]
}

// ─── Delivery platform style helpers ─────────────────────────────────────────
const PLATFORM_CONFIG = {
    foodpanda: {
        label: 'FoodPanda',
        emoji: '🐼',
        color: '#e8005e',
        bgClass: 'bg-pink-600/10',
        borderClass: 'border-pink-500/40',
        textClass: 'text-pink-400',
        bannerBg: 'linear-gradient(135deg, rgba(232,0,94,0.18), rgba(232,0,94,0.06))',
        bannerBorder: 'rgba(232,0,94,0.4)',
    },
    grab: {
        label: 'Grab',
        emoji: '🟢',
        color: '#00b14f',
        bgClass: 'bg-green-600/10',
        borderClass: 'border-green-500/40',
        textClass: 'text-green-400',
        bannerBg: 'linear-gradient(135deg, rgba(0,177,79,0.18), rgba(0,177,79,0.06))',
        bannerBorder: 'rgba(0,177,79,0.4)',
    },
} as const

/** Get the display price for a product: delivery override if in delivery mode, else normal price */
function getDisplayPrice(product: Product, deliveryPlatform: 'foodpanda' | 'grab' | null): number {
    if (!deliveryPlatform) return product.price
    // For size-based, the override is applied per-size in the size picker.
    // For regular products return the flat delivery price.
    if (SHAKE_SIZE_CATEGORIES.has(product.category) || COFFEE_CATEGORIES.has(product.category)) {
        return product.price // shown via size/coffee picker
    }
    return getDeliveryPrice(product.name) ?? product.price
}

export function ProductGrid({ products, categories, isLoading, menuError, onReload, deliveryPlatform, onDeliveryTabClick }: ProductGridProps) {
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

    const platformCfg = deliveryPlatform ? PLATFORM_CONFIG[deliveryPlatform] : null

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
            const deliveryOverride = deliveryPlatform ? getDeliveryPrice(product.name, 'Hot') ?? undefined : undefined
            addItem(product, 'Hot', deliveryOverride)
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
        // 4. Regular product — add with delivery price override if applicable
        const deliveryOverride = deliveryPlatform ? getDeliveryPrice(product.name) ?? undefined : undefined
        addItem(product, undefined, deliveryOverride)
        setFlashId(product.id)
        setTimeout(() => setFlashId(null), 350)
    }

    const handleFlavorSelect = (product: Product, flavor: FriesFlavor) => {
        const deliveryOverride = deliveryPlatform ? getDeliveryPrice(product.name) ?? undefined : undefined
        addItem(product, flavor, deliveryOverride)
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

        // In delivery mode: get delivery base price for this size, then apply pearl delta
        let effectiveFinalPrice = finalPrice
        if (deliveryPlatform) {
            const deliveryBase = getDeliveryPrice(sizedProduct.name, sizeLabel)
            if (deliveryBase !== null) {
                const pearlDelta = finalPrice - sizedProduct.price // e.g. +25 for add-on pearls
                effectiveFinalPrice = deliveryBase + pearlDelta
            }
        }

        const overridePrice = effectiveFinalPrice !== sizedProduct.price ? effectiveFinalPrice : undefined
        addItem(sizedProduct, combinedVariant, overridePrice)
        setFlashId(sizedProduct.id)
        setTimeout(() => setFlashId(null), 350)
        setPearlsPicker(null)
    }

    // After coffee temp selection → add with delivery override
    const handleCoffeeSelect = (product: Product, tempLabel: 'Hot' | 'Cold') => {
        const deliveryOverride = deliveryPlatform ? getDeliveryPrice(product.name, tempLabel) ?? undefined : undefined
        addItem(product, tempLabel, deliveryOverride)
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
    })(), 'FoodPanda & Grab']  // Delivery tab always last

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
            // For coffee: hide iced from grid — shown in picker
            if (COFFEE_CATEGORIES.has(p.category)) {
                if (p.category === 'Coffee Iced') return false
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
        if (cat === 'FoodPanda & Grab') return null // special tab — no count shown
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
                    deliveryPlatform={deliveryPlatform ?? undefined}
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
                    deliveryPlatform={deliveryPlatform ?? undefined}
                />
            )}
            {/* Coffee picker modal (Hot / Cold) */}
            {coffeePicker && (
                <CoffeePickerModal
                    baseName={coffeePicker.product.name}
                    options={coffeePicker.options}
                    onSelect={handleCoffeeSelect}
                    onClose={() => setCoffeePicker(null)}
                    deliveryPlatform={deliveryPlatform ?? undefined}
                />
            )}

            {/* ── Delivery mode banner ── */}
            {platformCfg && (
                <motion.div
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mx-4 mt-3 mb-0 px-4 py-2.5 rounded-2xl border flex items-center gap-3"
                    style={{ background: platformCfg.bannerBg, borderColor: platformCfg.bannerBorder }}
                >
                    <span className="text-2xl">{platformCfg.emoji}</span>
                    <div className="flex-1">
                        <p className="font-extrabold text-sm leading-tight" style={{ color: platformCfg.color }}>
                            {platformCfg.label} Delivery Menu
                        </p>
                        <p className="text-[11px] text-gray-400 leading-tight">Delivery prices active — tap any item to add</p>
                    </div>
                    <Bike size={18} style={{ color: platformCfg.color, opacity: 0.7 }} />
                </motion.div>
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
                    const isDeliveryTab = cat === 'FoodPanda & Grab'
                    const isActive = activeCategory === cat
                    const count = categoryCount(cat)

                    if (isDeliveryTab) {
                        // Special delivery tab — always styled with delivery colors
                        const isDeliveryActive = !!deliveryPlatform
                        return (
                            <button
                                key={cat}
                                onClick={() => {
                                    if (onDeliveryTabClick) onDeliveryTabClick()
                                }}
                                className="category-tab flex items-center gap-1.5 whitespace-nowrap flex-shrink-0"
                                style={{
                                    background: isDeliveryActive
                                        ? (deliveryPlatform === 'foodpanda'
                                            ? 'linear-gradient(135deg, #e8005e, #c0004d)'
                                            : 'linear-gradient(135deg, #00b14f, #008a3c)')
                                        : 'linear-gradient(135deg, rgba(232,0,94,0.15), rgba(0,177,79,0.15))',
                                    border: isDeliveryActive
                                        ? 'none'
                                        : '1px solid rgba(232,0,94,0.3)',
                                    color: isDeliveryActive ? '#fff' : '#e8005e',
                                    fontWeight: 700,
                                    padding: '0.35rem 0.875rem',
                                    borderRadius: '9999px',
                                }}
                            >
                                <span>{isDeliveryActive ? PLATFORM_CONFIG[deliveryPlatform!].emoji : '🛵'}</span>
                                <span>{isDeliveryActive ? PLATFORM_CONFIG[deliveryPlatform!].label : 'FoodPanda & Grab'}</span>
                            </button>
                        )
                    }

                    return (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`category-tab flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${isActive ? 'category-tab-active' : 'category-tab-inactive'}`}
                        >
                            <span>{cat === 'All' ? '🍽️' : CATEGORY_EMOJIS[cat] ?? '📋'}</span>
                            <span>{cat}</span>
                            {count !== null && (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isActive
                                        ? 'bg-white/30 text-white'
                                        : 'bg-brand-100 text-brand-500'
                                    }`}>
                                    {count}
                                </span>
                            )}
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

                                // Displayed price
                                const displayPrice = getDisplayPrice(product, deliveryPlatform ?? null)
                                const isPriceOverridden = deliveryPlatform && displayPrice !== product.price

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
                                            <div className="flex flex-col">
                                                <span className="text-brand-600 font-bold text-base">
                                                    ₱{displayPrice.toFixed(2)}
                                                </span>
                                                {isPriceOverridden && !isShake && !isCoffee && (
                                                    <span className="text-[10px] text-gray-400 line-through leading-none">
                                                        ₱{product.price.toFixed(2)}
                                                    </span>
                                                )}
                                            </div>
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
