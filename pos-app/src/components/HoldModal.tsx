import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PauseCircle, X } from 'lucide-react'

interface HoldModalProps {
    isOpen: boolean
    itemCount: number
    onConfirm: (tableNumber: string | null) => void
    onClose: () => void
}

export function HoldModal({ isOpen, itemCount, onConfirm, onClose }: HoldModalProps) {
    const [tableNumber, setTableNumber] = useState('')

    const handleConfirm = () => {
        onConfirm(tableNumber.trim() || null)
        setTableNumber('')
        onClose()
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                >
                    <motion.div
                        className="bg-surface-800 border border-surface-600 rounded-2xl w-full max-w-sm p-6 space-y-5"
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                                    <PauseCircle size={20} className="text-amber-400" />
                                </div>
                                <div>
                                    <h2 className="font-bold text-white text-base">Hold Order</h2>
                                    <p className="text-gray-500 text-xs">{itemCount} item{itemCount !== 1 ? 's' : ''} in cart</p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="w-8 h-8 rounded-xl bg-surface-600 flex items-center justify-center text-gray-400 hover:text-white transition-all"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        <p className="text-gray-400 text-sm">
                            Save this order to retrieve it later when the customer is ready to pay.
                            Optionally enter a table number for easy identification.
                        </p>

                        {/* Table number input */}
                        <div className="space-y-2">
                            <label className="text-gray-400 text-xs font-medium uppercase tracking-wide">
                                Table Number <span className="text-gray-600 normal-case">(optional)</span>
                            </label>
                            <input
                                type="text"
                                value={tableNumber}
                                onChange={(e) => setTableNumber(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
                                placeholder="e.g. 3, A2, Window Seat…"
                                className="input-field text-lg text-center font-semibold tracking-widest"
                                autoFocus
                            />
                        </div>

                        {/* Buttons */}
                        <div className="flex gap-3">
                            <button
                                onClick={onClose}
                                className="flex-1 btn-ghost text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirm}
                                className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-amber-600 to-amber-500 text-white font-semibold rounded-xl py-3 active:scale-95 transition-all shadow-lg shadow-amber-900/30 hover:from-amber-500 hover:to-amber-400"
                            >
                                <PauseCircle size={16} />
                                Hold Order
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
