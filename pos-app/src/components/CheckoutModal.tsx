import { motion, AnimatePresence } from 'framer-motion'
import { useCartStore } from '../store/cartStore'
import { X, CreditCard, Smartphone, Banknote, Check } from 'lucide-react'

interface CheckoutModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: (method: string, tendered: number) => Promise<void>
    isProcessing: boolean
}

const PAYMENT_METHODS = [
    { id: 'cash', label: 'Cash', icon: Banknote, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/30' },
    { id: 'gcash', label: 'GCash', icon: Smartphone, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30' },
    { id: 'card', label: 'Card', icon: CreditCard, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/30' },
]

const QUICK_AMOUNTS = [20, 50, 100, 200, 500, 1000]

export function CheckoutModal({ isOpen, onClose, onConfirm, isProcessing }: CheckoutModalProps) {
    const { paymentMethod, setPaymentMethod, cashTendered, setCashTendered, total, change, items } = useCartStore()

    const tot = total()
    const chg = change()

    const handleQuickAmount = (amount: number) => {
        setCashTendered(Math.ceil(tot / amount) * amount)
    }

    const handleExactAmount = () => setCashTendered(tot)

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
                        className="bg-surface-800 border border-surface-500 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-5 border-b border-surface-600">
                            <div>
                                <h2 className="text-xl font-bold text-white">Checkout</h2>
                                <p className="text-gray-500 text-sm">{items.length} item{items.length !== 1 ? 's' : ''}</p>
                            </div>
                            <button onClick={onClose} className="w-9 h-9 rounded-xl bg-surface-600 flex items-center justify-center hover:bg-surface-500 transition-colors">
                                <X size={16} className="text-gray-400" />
                            </button>
                        </div>

                        <div className="p-6 space-y-5">
                            {/* Total */}
                            <div className="text-center py-4 bg-surface-700 rounded-2xl border border-surface-500">
                                <p className="text-gray-400 text-sm mb-1">Amount Due</p>
                                <p className="text-5xl font-extrabold text-teal-400">₱{tot.toFixed(2)}</p>
                            </div>

                            {/* Payment method */}
                            <div>
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Payment Method</p>
                                <div className="grid grid-cols-3 gap-2">
                                    {PAYMENT_METHODS.map((m) => (
                                        <button
                                            key={m.id}
                                            onClick={() => setPaymentMethod(m.id as never)}
                                            className={`py-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${paymentMethod === m.id ? `${m.bg} ${m.color}` : 'border-surface-500 bg-surface-700 text-gray-500 hover:border-surface-400'
                                                }`}
                                        >
                                            <m.icon size={20} />
                                            <span className="text-xs font-semibold">{m.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Cash section */}
                            <AnimatePresence>
                                {paymentMethod === 'cash' && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="space-y-3"
                                    >
                                        <div>
                                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Cash Tendered</p>
                                            <div className="flex gap-2">
                                                <input
                                                    type="number"
                                                    value={cashTendered || ''}
                                                    onChange={(e) => setCashTendered(parseFloat(e.target.value) || 0)}
                                                    placeholder="Enter amount"
                                                    className="input-field text-lg font-bold flex-1"
                                                />
                                                <button onClick={handleExactAmount} className="btn-ghost text-xs px-3 whitespace-nowrap">Exact</button>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-3 gap-2">
                                            {QUICK_AMOUNTS.map((a) => (
                                                <button
                                                    key={a}
                                                    onClick={() => handleQuickAmount(a)}
                                                    className="py-2 rounded-xl bg-surface-600 border border-surface-500 text-white text-sm font-medium hover:border-brand-500/50 active:scale-95 transition-all"
                                                >
                                                    ₱{a}
                                                </button>
                                            ))}
                                        </div>

                                        {cashTendered >= tot && (
                                            <motion.div
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                className="flex justify-between items-center py-3 px-4 bg-green-500/10 border border-green-500/30 rounded-xl"
                                            >
                                                <span className="text-green-400 font-semibold">Change</span>
                                                <span className="text-green-400 font-bold text-xl">₱{chg.toFixed(2)}</span>
                                            </motion.div>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Confirm button */}
                        <div className="px-6 pb-6">
                            <button
                                onClick={() => onConfirm(paymentMethod, cashTendered)}
                                disabled={isProcessing || (paymentMethod === 'cash' && cashTendered < tot)}
                                className="w-full btn-teal py-4 text-lg flex items-center justify-center gap-2 disabled:opacity-40"
                            >
                                {isProcessing ? (
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <Check size={20} />
                                        Confirm Payment
                                    </>
                                )}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
