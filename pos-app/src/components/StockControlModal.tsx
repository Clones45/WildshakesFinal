import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Package, Search, AlertTriangle, CheckCircle2, Hash, Ban, RotateCcw, Loader2 } from 'lucide-react'
import { supabase, type Product } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { useFriesStockStore } from '../store/friesStockStore'
import { FRIES_FLAVORS, type FriesFlavor } from './FlavorPickerModal'
import { toast } from 'react-hot-toast'

interface StockOverride {
    productId: string
    isAvailable: boolean
    stockQty: number | null   // null = unlimited / no qty tracking
}

interface StockControlModalProps {
    isOpen: boolean
    onClose: () => void
    products: Product[]
}

const CATEGORY_EMOJIS: Record<string, string> = {
    'Fruitshakes Grande': '🥤',
    'Fruitshakes Petite': '🍹',
    'Fruitshakes Regular': '🍹',
    'Milkshakes Grande': '🍦',
    'Milkshakes Petite': '🍨',
    'Milkshakes': '🍦',
    'Coffee Hot': '☕',
    'Coffee Iced': '🧋',
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
    'Fries Flavor': '🍟',
}

export function StockControlModal({ isOpen, onClose, products }: StockControlModalProps) {
    const { branch } = useAuthStore()
    const [overrides, setOverrides] = useState<Map<string, StockOverride>>(new Map())
    const [saving, setSaving] = useState<Set<string>>(new Set())
    const [search, setSearch] = useState('')
    const [activeCategory, setActiveCategory] = useState('All')
    const [isLoadingOverrides, setIsLoadingOverrides] = useState(false)

    // Fries local stock store
    const { outOfStockFlavors, toggleFlavorStock, isFlavorAvailable } = useFriesStockStore()

    // Generate pseudo-products for fries flavors
    const pseudoProducts = useMemo(() => {
        return FRIES_FLAVORS.map(flavor => ({
            id: `flavor-${flavor}`,
            name: `Fries Flavor: ${flavor}`,
            category: 'Fries Flavor',
            price: 0,
            image_url: null,
            is_available: isFlavorAvailable(flavor),
        })) as Product[]
    }, [outOfStockFlavors])

    const allItems = useMemo(() => {
        return [...products, ...pseudoProducts]
    }, [products, pseudoProducts])

    const categories = useMemo(() => {
        const cats = [...new Set(allItems.map(p => p.category))]
        return ['All', ...cats]
    }, [allItems])

    const filtered = useMemo(() => {
        return allItems.filter(p => {
            const matchCat = activeCategory === 'All' || p.category === activeCategory
            const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
            return matchCat && matchSearch
        })
    }, [allItems, activeCategory, search])

    // Load existing overrides when modal opens
    useEffect(() => {
        if (isOpen && branch?.id) {
            loadOverrides()
        }
    }, [isOpen, branch?.id])

    const loadOverrides = async () => {
        if (!branch?.id) return
        setIsLoadingOverrides(true)
        try {
            const { data, error } = await supabase
                .from('branch_menu_availability')
                .select('product_id, is_available, stock_qty')
                .eq('branch_id', branch.id)

            if (error) throw error

            const map = new Map<string, StockOverride>()
            for (const row of data ?? []) {
                map.set(row.product_id, {
                    productId: row.product_id,
                    isAvailable: row.is_available,
                    stockQty: row.stock_qty ?? null,
                })
            }
            setOverrides(map)
        } catch (err) {
            console.error('[StockControl] Failed to load overrides:', err)
            toast.error('Failed to load stock data')
        } finally {
            setIsLoadingOverrides(false)
        }
    }

    const getOverride = (productId: string): StockOverride => {
        if (productId.startsWith('flavor-')) {
            const flavor = productId.replace('flavor-', '') as FriesFlavor
            return { productId, isAvailable: isFlavorAvailable(flavor), stockQty: null }
        }
        return overrides.get(productId) ?? { productId, isAvailable: true, stockQty: null }
    }

    const saveOverride = async (productId: string, patch: Partial<StockOverride>) => {
        if (!branch?.id) return
        const current = getOverride(productId)
        const updated = { ...current, ...patch }

        // Optimistic update
        setOverrides(prev => new Map(prev).set(productId, updated))
        setSaving(prev => new Set(prev).add(productId))

        try {
            const isDefault = updated.isAvailable && updated.stockQty === null

            if (isDefault) {
                // Remove override entirely — product is fully available
                const { error } = await supabase
                    .from('branch_menu_availability')
                    .delete()
                    .eq('branch_id', branch.id)
                    .eq('product_id', productId)
                if (error) throw error
                setOverrides(prev => {
                    const next = new Map(prev)
                    next.delete(productId)
                    return next
                })
            } else {
                // Upsert the override
                const { error } = await supabase
                    .from('branch_menu_availability')
                    .upsert(
                        {
                            branch_id: branch.id,
                            product_id: productId,
                            is_available: updated.isAvailable,
                            stock_qty: updated.stockQty,
                        },
                        { onConflict: 'branch_id,product_id' }
                    )
                if (error) throw error
            }
        } catch (err) {
            console.error('[StockControl] Save failed:', err)
            toast.error('Failed to update stock')
            // Revert
            setOverrides(prev => new Map(prev).set(productId, current))
        } finally {
            setSaving(prev => {
                const next = new Set(prev)
                next.delete(productId)
                return next
            })
        }
    }

    const handleToggleAvailable = (product: Product) => {
        if (product.id.startsWith('flavor-')) {
            const flavor = product.id.replace('flavor-', '') as FriesFlavor
            toggleFlavorStock(flavor)
            const isOut = !isFlavorAvailable(flavor)
            toast(isOut ? 'Marked as Available' : 'Marked as Sold Out', { icon: isOut ? '✅' : '🚫', duration: 1500 })
            return
        }

        const current = getOverride(product.id)
        if (current.isAvailable) {
            // Mark sold out
            saveOverride(product.id, { isAvailable: false, stockQty: null })
            toast('Marked as Sold Out', { icon: '🚫', duration: 1500 })
        } else {
            // Mark back as available (clear override)
            saveOverride(product.id, { isAvailable: true, stockQty: null })
            toast('Marked as Available', { icon: '✅', duration: 1500 })
        }
    }

    const handleSetQty = (product: Product, qty: number | null) => {
        const current = getOverride(product.id)
        // If setting a quantity, item must be available
        const newAvailable = qty === null ? current.isAvailable : true
        saveOverride(product.id, { isAvailable: newAvailable, stockQty: qty })
    }

    const soldOutCount = Array.from(overrides.values()).filter(o => !o.isAvailable).length + outOfStockFlavors.length
    const withQtyCount = Array.from(overrides.values()).filter(o => o.isAvailable && o.stockQty !== null).length

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                    onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.92, y: 24 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.92, y: 24 }}
                        className="bg-surface-800 border border-surface-500 rounded-3xl w-full max-w-2xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-5 border-b border-surface-600 flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
                                    <Package size={20} className="text-amber-400" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-white">Stock Control</h2>
                                    <p className="text-gray-500 text-xs">
                                        {soldOutCount > 0 && <span className="text-red-400 font-semibold">{soldOutCount} sold out</span>}
                                        {soldOutCount > 0 && withQtyCount > 0 && <span className="mx-1">·</span>}
                                        {withQtyCount > 0 && <span className="text-amber-400 font-semibold">{withQtyCount} with qty</span>}
                                        {soldOutCount === 0 && withQtyCount === 0 && <span>All items available</span>}
                                    </p>
                                </div>
                            </div>
                            <button onClick={onClose} className="w-9 h-9 rounded-xl bg-surface-600 flex items-center justify-center hover:bg-surface-500 transition-colors">
                                <X size={16} className="text-gray-400" />
                            </button>
                        </div>

                        {/* Search + Category Filters */}
                        <div className="px-4 pt-4 pb-3 flex-shrink-0 space-y-3">
                            <div className="relative">
                                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input
                                    type="text"
                                    placeholder="Search items…"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    className="input-field pl-9 text-sm w-full"
                                />
                            </div>
                            <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
                                {categories.map(cat => (
                                    <button
                                        key={cat}
                                        onClick={() => setActiveCategory(cat)}
                                        className={`category-tab flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${activeCategory === cat ? 'category-tab-active' : 'category-tab-inactive'}`}
                                    >
                                        <span>{cat === 'All' ? '🍽️' : CATEGORY_EMOJIS[cat] ?? '📋'}</span>
                                        <span>{cat}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Product List */}
                        <div className="flex-1 overflow-y-auto px-4 pb-4">
                            {isLoadingOverrides ? (
                                <div className="flex items-center justify-center h-32 gap-2 text-gray-500">
                                    <Loader2 size={20} className="animate-spin" />
                                    <span className="text-sm">Loading stock data…</span>
                                </div>
                            ) : filtered.length === 0 ? (
                                <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
                                    No items found
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {filtered.map(product => {
                                        const override = getOverride(product.id)
                                        const isSaving = saving.has(product.id)
                                        const isSoldOut = !override.isAvailable
                                        const hasQty = override.isAvailable && override.stockQty !== null

                                        return (
                                            <motion.div
                                                key={product.id}
                                                layout
                                                className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all ${
                                                    isSoldOut
                                                        ? 'bg-red-500/8 border-red-500/30'
                                                        : hasQty
                                                            ? 'bg-amber-500/8 border-amber-500/30'
                                                            : 'bg-surface-700 border-surface-600'
                                                }`}
                                            >
                                                {/* Emoji icon */}
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 ${isSoldOut ? 'opacity-40' : ''}`}>
                                                    {CATEGORY_EMOJIS[product.category] ?? '🍵'}
                                                </div>

                                                {/* Name + category */}
                                                <div className="flex-1 min-w-0">
                                                    <p className={`font-semibold text-sm leading-tight truncate ${isSoldOut ? 'text-gray-500 line-through' : 'text-white'}`}>
                                                        {product.name}
                                                    </p>
                                                    <p className="text-gray-500 text-xs mt-0.5">₱{product.price.toFixed(2)}</p>
                                                </div>

                                                {/* Controls */}
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    {/* Qty input — only show when available */}
                                                    {!isSoldOut && (
                                                        <div className="flex items-center gap-1.5">
                                                            <Hash size={12} className="text-gray-500" />
                                                            <input
                                                                type="number"
                                                                min={1}
                                                                placeholder="∞"
                                                                value={override.stockQty ?? ''}
                                                                onChange={e => {
                                                                    const val = e.target.value
                                                                    handleSetQty(product, val === '' ? null : Math.max(1, parseInt(val) || 1))
                                                                }}
                                                                className="w-16 text-center text-sm font-bold rounded-lg border bg-surface-600 border-surface-500 text-white px-2 py-1.5 focus:outline-none focus:border-amber-500/60"
                                                            />
                                                        </div>
                                                    )}

                                                    {/* Qty reset button (if has qty) */}
                                                    {hasQty && (
                                                        <button
                                                            onClick={() => handleSetQty(product, null)}
                                                            disabled={isSaving}
                                                            title="Remove qty limit"
                                                            className="w-7 h-7 rounded-lg bg-surface-600 flex items-center justify-center hover:bg-surface-500 transition-colors disabled:opacity-40"
                                                        >
                                                            <RotateCcw size={11} className="text-gray-400" />
                                                        </button>
                                                    )}

                                                    {/* Sold-out toggle */}
                                                    <button
                                                        onClick={() => handleToggleAvailable(product)}
                                                        disabled={isSaving}
                                                        title={isSoldOut ? 'Mark as Available' : 'Mark as Sold Out'}
                                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all disabled:opacity-50 ${
                                                            isSoldOut
                                                                ? 'bg-red-500/15 border-red-500/40 text-red-400 hover:bg-red-500/25'
                                                                : 'bg-surface-600 border-surface-500 text-gray-400 hover:border-red-500/40 hover:text-red-400'
                                                        }`}
                                                    >
                                                        {isSaving ? (
                                                            <Loader2 size={11} className="animate-spin" />
                                                        ) : isSoldOut ? (
                                                            <><Ban size={11} /><span>Sold Out</span></>
                                                        ) : (
                                                            <><CheckCircle2 size={11} /><span>Available</span></>
                                                        )}
                                                    </button>
                                                </div>
                                            </motion.div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Footer hint */}
                        <div className="px-6 py-4 border-t border-surface-600 flex-shrink-0">
                            <p className="text-center text-gray-500 text-xs">
                                <AlertTriangle size={11} className="inline mr-1 text-amber-400" />
                                Changes take effect immediately at this branch. Set a qty to auto-hide when it reaches 0.
                            </p>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
