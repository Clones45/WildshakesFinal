import { motion, AnimatePresence } from 'framer-motion'
import { X, Tag, Percent } from 'lucide-react'
import { useState } from 'react'
import { useCartStore, type DiscountType } from '../store/cartStore'

interface DiscountModalProps {
    isOpen: boolean
    onClose: () => void
}

const DISCOUNTS: { id: DiscountType; label: string; rate: string; icon: string; description: string }[] = [
    { id: 'none', label: 'No Discount', rate: '0%', icon: '🚫', description: 'Full price' },
    { id: 'senior', label: 'Senior Citizen', rate: '20%', icon: '👴', description: 'With valid ID' },
    { id: 'pwd', label: 'PWD', rate: '20%', icon: '♿', description: 'With valid ID' },
    { id: 'manager', label: 'Manager', rate: '15%', icon: '🛡️', description: 'Requires manager PIN' },
    { id: 'custom', label: 'Custom Amount', rate: 'Fixed', icon: '✏️', description: 'Manual entry' },
]

export function DiscountModal({ isOpen, onClose }: DiscountModalProps) {
    const { discountType, setDiscount, subtotal } = useCartStore()
    const [customAmount, setCustomAmount] = useState('')
    const [selected, setSelected] = useState<DiscountType>(discountType)

    const sub = subtotal()

    const handleApply = () => {
        if (selected === 'custom') {
            setDiscount('custom', parseFloat(customAmount) || 0)
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
                        className="bg-surface-800 border border-surface-500 rounded-3xl w-full max-w-sm shadow-2xl"
                    >
                        <div className="flex items-center justify-between px-6 py-5 border-b border-surface-600">
                            <div className="flex items-center gap-2">
                                <Tag size={18} className="text-amber-400" />
                                <h2 className="text-lg font-bold text-white">Apply Discount</h2>
                            </div>
                            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-surface-600 flex items-center justify-center hover:bg-surface-500 transition-colors">
                                <X size={14} className="text-gray-400" />
                            </button>
                        </div>

                        <div className="p-5 space-y-2">
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
                        </div>

                        <div className="px-5 pb-5 flex gap-2">
                            <button onClick={handleClear} className="btn-ghost flex-1 text-sm">
                                Clear
                            </button>
                            <button onClick={handleApply} className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm">
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
