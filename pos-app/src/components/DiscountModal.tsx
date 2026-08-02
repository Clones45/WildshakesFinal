import { motion, AnimatePresence } from 'framer-motion'
import { X, Tag, Percent, Check } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useCartStore, cartItemKey, type DiscountType } from '../store/cartStore'

interface DiscountModalProps {
    isOpen: boolean
    onClose: () => void
}

const DISCOUNTS: { id: DiscountType; label: string; rate: string; icon: string; description: string }[] = [
    { id: 'none', label: 'No Discount', rate: '0%', icon: '🚫', description: 'Full price' },
    { id: 'senior', label: 'Senior Citizen', rate: '20%', icon: '👴', description: 'With valid ID — their items only' },
    { id: 'pwd', label: 'PWD', rate: '20%', icon: '♿', description: 'With valid ID — their items only' },
    { id: 'manager', label: 'Manager', rate: '15%', icon: '🛡️', description: 'Requires manager PIN' },
    { id: 'custom', label: 'Custom Amount', rate: 'Fixed', icon: '✏️', description: 'Manual entry' },
]

const RATES: Record<string, number> = { senior: 0.2, pwd: 0.2, manager: 0.15 }

export function DiscountModal({ isOpen, onClose }: DiscountModalProps) {
    const { items, discountType, discountItemKeys, setDiscount, subtotal } = useCartStore()
    const [customAmount, setCustomAmount] = useState('')
    const [selected, setSelected] = useState<DiscountType>(discountType)
    const [checkedKeys, setCheckedKeys] = useState<string[]>([])

    const sub = subtotal()
    const activeItems = items.filter(i => !i.cancelled)
    const isPercent = selected === 'senior' || selected === 'pwd' || selected === 'manager'

    // On open: restore the current selection, defaulting to "all items"
    useEffect(() => {
        if (!isOpen) return
        setSelected(discountType)
        setCheckedKeys(
            discountItemKeys.length > 0
                ? discountItemKeys
                : activeItems.map(cartItemKey)
        )
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen])

    const toggleKey = (key: string) =>
        setCheckedKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])

    const lineTotal = (i: (typeof items)[number]) => (i.overridePrice ?? i.product.price) * i.quantity

    const checkedSubtotal = activeItems
        .filter(i => checkedKeys.includes(cartItemKey(i)))
        .reduce((s, i) => s + lineTotal(i), 0)

    const previewDiscount = isPercent ? checkedSubtotal * (RATES[selected] ?? 0) : 0
    const allChecked = activeItems.length > 0 && activeItems.every(i => checkedKeys.includes(cartItemKey(i)))

    const handleApply = () => {
        if (selected === 'custom') {
            setDiscount('custom', parseFloat(customAmount) || 0)
        } else if (isPercent) {
            if (checkedKeys.length === 0) return
            // All items checked → store [] (whole order — also covers items added
            // after this modal closes). Partial → store the exact lines.
            setDiscount(selected, 0, allChecked ? [] : checkedKeys)
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

    const applyDisabled = isPercent && checkedKeys.length === 0

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
                                    onClick={() => setSelected(d.id)}
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

                            {/* Per-item selection for percentage discounts */}
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
                                                Apply to which items?
                                            </p>
                                            <button
                                                onClick={() => setCheckedKeys(allChecked ? [] : activeItems.map(cartItemKey))}
                                                className="text-xs font-bold text-amber-400 hover:text-amber-300"
                                            >
                                                {allChecked ? 'Unselect all' : 'Select all'}
                                            </button>
                                        </div>

                                        {activeItems.length === 0 ? (
                                            <p className="text-xs text-gray-500 px-1">Cart is empty.</p>
                                        ) : (
                                            activeItems.map((i) => {
                                                const key = cartItemKey(i)
                                                const checked = checkedKeys.includes(key)
                                                return (
                                                    <button
                                                        key={key}
                                                        onClick={() => toggleKey(key)}
                                                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${checked
                                                            ? 'border-amber-500/60 bg-amber-500/5'
                                                            : 'border-surface-600 bg-surface-700/50 opacity-60'
                                                            }`}
                                                    >
                                                        <span className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${checked ? 'bg-amber-500 border-amber-500' : 'border-surface-400'}`}>
                                                            {checked && <Check size={13} className="text-surface-900" />}
                                                        </span>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm text-white truncate">
                                                                {i.product.name}{i.variant ? ` · ${i.variant}` : ''}
                                                            </p>
                                                            <p className="text-xs text-gray-500">x{i.quantity}</p>
                                                        </div>
                                                        <span className="text-sm font-semibold text-gray-300 flex-shrink-0">
                                                            ₱{lineTotal(i).toFixed(2)}
                                                        </span>
                                                    </button>
                                                )
                                            })
                                        )}

                                        <div className="flex justify-between px-1 pt-1 text-sm">
                                            <span className="text-gray-400 font-semibold">Discount ({(RATES[selected] * 100).toFixed(0)}% of ₱{checkedSubtotal.toFixed(2)})</span>
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
