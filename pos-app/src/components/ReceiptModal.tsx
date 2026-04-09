import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, RotateCcw, AlertTriangle } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import type { LocalTransaction } from '../lib/db'

interface ReceiptModalProps {
    isOpen: boolean
    transaction: LocalTransaction | null
    onClose: () => void
    onVoid: (localRef: string) => void
    onNewOrder: () => void
}

export function ReceiptModal({ isOpen, transaction, onVoid, onNewOrder }: ReceiptModalProps) {
    const { user, branch } = useAuthStore()
    if (!transaction) return null

    const now = new Date(transaction.createdAt)
    const dateStr = now.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    const timeStr = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="bg-surface-800 border border-surface-500 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden"
                    >
                        {/* Success header */}
                        <div className="bg-gradient-to-br from-teal-600/20 to-brand-600/20 border-b border-surface-600 px-6 py-6 text-center">
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
                                className="w-16 h-16 rounded-full bg-teal-500/20 border border-teal-500/40 flex items-center justify-center mx-auto mb-3"
                            >
                                <CheckCircle size={32} className="text-teal-400" />
                            </motion.div>
                            <h2 className="text-xl font-bold text-white">Payment Complete!</h2>
                            <p className="text-gray-400 text-sm mt-1">{branch?.name} — {timeStr}</p>
                        </div>

                        {/* Receipt body */}
                        <div className="px-6 py-5 space-y-1 font-mono text-sm max-h-64 overflow-y-auto">
                            <div className="text-center text-xs text-gray-500 pb-2 border-b border-dashed border-surface-500">
                                <p className="font-bold text-white text-base">WILDSHAKES CAFE</p>
                                <p>{branch?.location}</p>
                                <p>{dateStr}</p>
                                <p className="mt-1">Cashier: {user?.name}</p>
                                <p className="text-xs text-gray-600">Ref: {transaction.localRef.slice(0, 12).toUpperCase()}</p>
                            </div>

                            <div className="py-2 space-y-1.5">
                                {transaction.items.map((item, i) => (
                                    <div key={i} className="flex justify-between text-xs">
                                        <span className="text-gray-300 flex-1">{item.productName} × {item.quantity}</span>
                                        <span className="text-white ml-2">₱{item.subtotal.toFixed(2)}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="border-t border-dashed border-surface-500 pt-2 space-y-1">
                                <div className="flex justify-between text-xs text-gray-400">
                                    <span>Subtotal</span>
                                    <span>₱{(transaction.totalAmount + transaction.discountAmount).toFixed(2)}</span>
                                </div>
                                {transaction.discountAmount > 0 && (
                                    <div className="flex justify-between text-xs text-amber-400">
                                        <span>{transaction.discountType} disc.</span>
                                        <span>-₱{transaction.discountAmount.toFixed(2)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between font-bold border-t border-dashed border-surface-500 pt-1">
                                    <span className="text-white">TOTAL</span>
                                    <span className="text-teal-400 text-base">₱{transaction.totalAmount.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-xs text-gray-400">
                                    <span>Payment</span>
                                    <span className="capitalize">{transaction.paymentMethod}</span>
                                </div>
                                <div className="text-center text-xs text-gray-600 pt-2">— Thank you! Come again! —</div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="px-5 pb-5 pt-2 flex gap-2">
                            <button
                                onClick={() => onVoid(transaction.localRef)}
                                className="flex items-center gap-1.5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors"
                            >
                                <AlertTriangle size={14} />
                                Void
                            </button>
                            <button onClick={onNewOrder} className="btn-teal flex-1 flex items-center justify-center gap-2">
                                <RotateCcw size={16} />
                                New Order
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
