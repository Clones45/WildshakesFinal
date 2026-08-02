import { motion, AnimatePresence } from 'framer-motion'
import { X, Tag, Percent, Check, Plus, Minus } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useCartStore, cartItemKey, type DiscountType } from '../store/cartStore'

interface DiscountModalProps {
    isOpen: boolean
    onClose: () => void
}

const DISCOUNTS: { id: DiscountType; label: string; rate: string; icon: string; description: string }[] = [
    { id: 'none', label: 'No Discount', rate: '0%', icon: '🚫', description: 'Full price' },
    { id: 'senior', label: 'Senior Citizen', rate: '20%', icon: '👴', description: 'Tap the senior\'s items below' },
    { id: 'pwd', label: 'PWD', rate: '20%', icon: '♿', description: 'Tap the PWD\'s items below' },
    { id: 'manager', label: 'Manager', rate: '15%', icon: '🛡️', description: 'Requires manager PIN' },
    { id: 'custom', label: 'Custom Amount', rate: 'Fixed', icon: '✏️', description: 'Manual entry' },
]

const RATES: Record<string, number> = { senior: 0.2, pwd: 0.2, manager: 0.15 }

export function DiscountModal({ isOpen, onClose }: DiscountModalProps) {
    const { items, discountType, discountUnits, setDiscount, subtotal } = useCartStore()
    const [customAmount, setCustomAmount] = useState('')
    const [selected, setSelected] = useState<DiscountType>(discountType)
    // key → number of units of that line the discount covers
    const [units, setUnits] = useState<Record<string, number>>({})

    const sub = subtotal()
    const activeItems = items.filter(i => !i.cancelled)
    const isPercent = selected === 'senior' || selected === 'pwd' || selected === 'manager'
    const unitPrice = (i: (typeof items)[number]) => i.overridePrice ?? i.product.price

    const fullSelection = () =>
        Object.fromEntries(activeItems.map(i => [cartItemKey(i), i.quantity]))

    // On open: restore existing selection; whole-order (null) shows as everything selected
    useEffect(() => {
        if (!isOpen) return
        setSelected(discountType)
        if (discountType === 'senior' || discountType === 'pwd' || discountType === 'manager') {
            setUnits(discountUnits === null ? fullSelection() : { ...discountUnits })
        } else {
            setUnits({})
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen])

    // Switching discount type: Senior/PWD start EMPTY (cashier taps the
    // customer's items); Manager starts with the whole order selected.
    const pickType = (type: DiscountType) => {
        setSelected(type)
        if (type === 'senior' || type === 'pwd') setUnits({})
        else if (type === 'manager') setUnits(fullSelection())
    }

    const setLineUnits = (key: string, n: number, max: number) =>
        setUnits(prev => {
            const next = { ...prev }
            const clamped = Math.max(0, Math.min(n, max))
            if (clamped === 0) delete next[key]
            else next[key] = clamped
            return next
        })

    const selectedCount = Object.values(units).reduce((s, n) => s + n, 0)
    const selectedSubtotal = activeItems.reduce(
        (s, i) => s + unitPrice(i) * Math.min(units[cartItemKey(i)] ?? 0, i.quantity), 0)
    const previewDiscount = isPercent ? selectedSubtotal * (RATES[selected] ?? 0) : 0
    const allSelected = activeItems.length > 0 &&
        activeItems.every(i => (units[cartItemKey(i)] ?? 0) >= i.quantity)

    const handleApply = () => {
        if (selected === 'custom') {
            setDiscount('custom', parseFloat(customAmount) || 0)
        } else if (isPercent) {
            if (selectedCount === 0) return
            // Everything selected → whole order (null: also covers items added later)
            setDiscount(selected, 0, allSelected ? null : units)
        } else {
            setDiscount(selected)
        }
        onClose()
    }

    const handleClear = () => {
        setDiscount('none')
        setSelected('none')
        onClose()
    }

    const applyDisabled = isPercent && selectedCount === 0

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
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="bg-surface-800 border border-surface-500 rounded-3xl w-full max-w-sm shadow-2xl max-h-[90vh] flex flex-col"
                    >
                        <div className="flex items-center justify-between px-6 py-5 border-b border-surface-600 flex-shrink-0">
                            <div className="flex items-center gap-2">
                                <Tag size={18} className="text-amber-400" />
                                <h2 className="text-lg font-bold text-white">Apply Discount</h2>
                            </div>
                            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-surface-600 flex items-center justify-center hover:bg-surface-500 transition-colors">
                                <X size={14} className="text-gray-400" />
                            </button>
                        </div>

                        <div className="p-5 space-y-2 overflow-y-auto">
                            {DISCOUNTS.map((d) => (
                                <button
                                    key={d.id}
                                    onClick={() => pickType(d.id)}
                                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all ${selected === d.id
                                        ? 'border-amber-500 bg-amber-500/10 text-amber-300'
                                        : 'border-surface-500 bg-surface-700 text-gray-400 hover:border-surface-400'
                                        }`}
                                >
                                    <span className="text-xl w-7">{d.icon}</span>
                                    <div className="flex-1 text-left">
                                        <p className="font-semibold text-sm">{d.label}</p>
                                        <p className="text-xs opacity-60">{d.description}</p>
                                    </div>
                                    <span className="font-bold text-sm ml-auto">{d.rate}</span>
                                </button>
                            ))}

                            {/* Custom amount input */}
                            <AnimatePresence>
                                {selected === 'custom' && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="pt-1"
                                    >
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₱</span>
                                            <input
                                                type="number"
                                                value={customAmount}
                                                onChange={(e) => setCustomAmount(e.target.value)}
                                                placeholder={`Max ₱${sub.toFixed(2)}`}
                                                className="input-field pl-7"
                                                autoFocus
                                            />
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Per-item / per-unit selection for percentage discounts */}
                            <AnimatePresence>
                                {isPercent && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="pt-2 space-y-2"
                                    >
                                        <div className="flex items-center justify-between px-1">
                                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                                                {selected === 'manager' ? 'Applies to' : "Tap the customer's items"}
                                            </p>
                                            <button
                                                onClick={() => setUnits(allSelected ? {} : fullSelection())}
                                                className="text-xs font-bold text-amber-400 hover:text-amber-300"
                                            >
                                                {allSelected ? 'Clear all' : 'Whole order'}
                                            </button>
                                        </div>

                                        {activeItems.length === 0 ? (
                                            <p className="text-xs text-gray-500 px-1">Cart is empty.</p>
                                        ) : (
                                            activeItems.map((i) => {
                                                const key = cartItemKey(i)
                                                const n = Math.min(units[key] ?? 0, i.quantity)
                                                const isOn = n > 0
                                                return (
                                                    <div
                                                        key={key}
                                                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all ${isOn
                                                            ? 'border-amber-500/60 bg-amber-500/5'
                                                            : 'border-surface-600 bg-surface-700/50'
                                                            }`}
                                                    >
                                                        <button
                                                            onClick={() => setLineUnits(key, isOn ? 0 : 1, i.quantity)}
                                                            className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                                                        >
                                                            <span className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${isOn ? 'bg-amber-500 border-amber-500' : 'border-surface-400'}`}>
                                                                {isOn && <Check size={13} className="text-surface-900" />}
                                                            </span>
                                                            <span className="flex-1 min-w-0">
                                                                <span className={`block text-sm truncate ${isOn ? 'text-white' : 'text-gray-400'}`}>
                                                                    {i.product.name}{i.variant ? ` · ${i.variant}` : ''}
                                                                </span>
                                                                <span className="block text-xs text-gray-500">
                                                                    ₱{unitPrice(i).toFixed(2)} each · {i.quantity} in cart
                                                                </span>
                                                            </span>
                                                        </button>

                                                        {/* Unit stepper — only matters for stacked lines (qty > 1) */}
                                                        {i.quantity > 1 && isOn && (
                                                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                                                <button
                                                                    onClick={() => setLineUnits(key, n - 1, i.quantity)}
                                                                    className="w-6 h-6 rounded-lg bg-surface-600 flex items-center justify-center hover:bg-surface-500"
                                                                >
                                                                    <Minus size={12} className="text-gray-300" />
                                                                </button>
                                                                <span className="text-sm font-bold text-amber-400 w-8 text-center">{n}/{i.quantity}</span>
                                                                <button
                                                                    onClick={() => setLineUnits(key, n + 1, i.quantity)}
                                                                    className="w-6 h-6 rounded-lg bg-surface-600 flex items-center justify-center hover:bg-surface-500"
                                                                >
                                                                    <Plus size={12} className="text-gray-300" />
                                                                </button>
                                                            </div>
                                                        )}

                                                        <span className={`text-sm font-semibold flex-shrink-0 ${isOn ? 'text-amber-400' : 'text-gray-500'}`}>
                                                            {isOn ? `₱${(unitPrice(i) * n).toFixed(2)}` : '—'}
                                                        </span>
                                                    </div>
                                                )
                                            })
                                        )}

                                        <div className="flex justify-between px-1 pt-1 text-sm">
                                            <span className="text-gray-400 font-semibold">
                                                Discount ({((RATES[selected] ?? 0) * 100).toFixed(0)}% of ₱{selectedSubtotal.toFixed(2)})
                                            </span>
                                            <span className="text-amber-400 font-bold">-₱{previewDiscount.toFixed(2)}</span>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        <div className="px-5 pb-5 pt-2 flex gap-2 flex-shrink-0">
                            <button onClick={handleClear} className="btn-ghost flex-1 text-sm">
                                Clear
                            </button>
                            <button
                                onClick={handleApply}
                                disabled={applyDisabled}
                                className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm disabled:opacity-40"
                            >
                                <Percent size={14} />
                                Apply
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
