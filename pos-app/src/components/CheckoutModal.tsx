import { motion, AnimatePresence } from 'framer-motion'
import { useCartStore } from '../store/cartStore'
import { X, Banknote, Smartphone, QrCode, Landmark, Check, AlertCircle } from 'lucide-react'

interface CheckoutModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: (method: string, tendered: number, referenceNumber: string) => Promise<void>
    isProcessing: boolean
}

const PAYMENT_METHODS = [
    { id: 'cash',          label: 'Cash',          icon: Banknote,    color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/30' },
    { id: 'gcash',         label: 'GCash',         icon: Smartphone,  color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/30' },
    { id: 'maya',          label: 'Maya',          icon: QrCode,      color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/30' },
    { id: 'bank_transfer', label: 'Bank Transfer', icon: Landmark,    color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/30' },
]

const DIGITAL_METHODS = ['gcash', 'maya', 'bank_transfer']

const getSmartQuickAmounts = (total: number) => {
    if (total <= 0) return [50, 100, 200, 500, 1000]
    const amounts = new Set<number>()
    
    const roundUp10 = Math.ceil(total / 10) * 10
    if (roundUp10 > total) amounts.add(roundUp10)
    
    const roundUp50 = Math.ceil(total / 50) * 50
    if (roundUp50 > total) amounts.add(roundUp50)
    
    const roundUp100 = Math.ceil(total / 100) * 100
    if (roundUp100 > total) amounts.add(roundUp100)
    
    const roundUp500 = Math.ceil(total / 500) * 500
    if (roundUp500 > total) amounts.add(roundUp500)
    
    const roundUp1000 = Math.ceil(total / 1000) * 1000
    if (roundUp1000 > total) amounts.add(roundUp1000)
    
    ;[50, 100, 200, 500, 1000].forEach(b => {
        if (b > total) amounts.add(b)
    })

    return Array.from(amounts).sort((a, b) => a - b).slice(0, 6)
}

export function CheckoutModal({ isOpen, onClose, onConfirm, isProcessing }: CheckoutModalProps) {
    const {
        paymentMethod, setPaymentMethod,
        cashTendered, setCashTendered,
        referenceNumber, setReferenceNumber,
        total, change, items,
    } = useCartStore()

    const tot = total()
    const chg = change()
    const isDigital = DIGITAL_METHODS.includes(paymentMethod)
    const refValid = referenceNumber.length === 5

    const handleQuickAmount = (amount: number) => {
        setCashTendered(Math.ceil(tot / amount) * amount)
    }

    const handleExactAmount = () => setCashTendered(tot)

    const canConfirm = !isProcessing &&
        (paymentMethod === 'cash' ? cashTendered >= tot : refValid)

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

                            {/* Payment method — 2×2 grid */}
                            <div>
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Payment Method</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {PAYMENT_METHODS.map((m) => (
                                        <button
                                            key={m.id}
                                            onClick={() => setPaymentMethod(m.id as never)}
                                            className={`py-3 px-4 rounded-xl border flex items-center gap-2.5 transition-all ${paymentMethod === m.id
                                                ? `${m.bg} ${m.color} font-bold`
                                                : 'border-surface-500 bg-surface-700 text-gray-500 hover:border-surface-400'
                                                }`}
                                        >
                                            <m.icon size={18} />
                                            <span className="text-sm font-semibold">{m.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Cash section */}
                            <AnimatePresence mode="wait">
                                {paymentMethod === 'cash' && (
                                    <motion.div
                                        key="cash"
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="space-y-3 overflow-hidden"
                                    >
                                        <div>
                                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Cash Tendered</p>
                                            <div className="flex gap-2">
                                                <input
                                                    type="number"
                                                    autoFocus
                                                    value={cashTendered || ''}
                                                    onChange={(e) => setCashTendered(parseFloat(e.target.value) || 0)}
                                                    placeholder="Enter amount"
                                                    className="input-field text-lg font-bold flex-1"
                                                />
                                                <button onClick={handleExactAmount} className="btn-ghost text-xs px-3 whitespace-nowrap">Exact</button>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-3 gap-2">
                                            {getSmartQuickAmounts(tot).map((a) => (
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

                                {/* Reference Number — shown for GCash / Maya / Bank Transfer */}
                                {isDigital && (
                                    <motion.div
                                        key="digital"
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="space-y-2 overflow-hidden"
                                    >
                                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                                            Reference Number <span className="text-red-400">*</span>
                                        </p>
                                        <p className="text-xs text-gray-500">Enter the last 5 digits of the transaction reference</p>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                autoFocus
                                                inputMode="numeric"
                                                maxLength={5}
                                                value={referenceNumber}
                                                onChange={(e) => setReferenceNumber(e.target.value.replace(/\D/g, '').slice(0, 5))}
                                                placeholder="e.g. 12345"
                                                className={`input-field text-2xl font-bold tracking-[0.35em] w-full text-center transition-all ${refValid ? 'border-green-500/50 bg-green-500/5' : ''}`}
                                            />
                                            {refValid && (
                                                <motion.div
                                                    initial={{ scale: 0 }}
                                                    animate={{ scale: 1 }}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2"
                                                >
                                                    <Check size={18} className="text-green-400" />
                                                </motion.div>
                                            )}
                                        </div>
                                        {!refValid && referenceNumber.length > 0 && (
                                            <div className="flex items-center gap-1.5 text-amber-400 text-xs">
                                                <AlertCircle size={12} />
                                                <span>{5 - referenceNumber.length} more digit{5 - referenceNumber.length !== 1 ? 's' : ''} required</span>
                                            </div>
                                        )}
                                        {!refValid && referenceNumber.length === 0 && (
                                            <p className="text-xs text-gray-600">Required for {PAYMENT_METHODS.find(m => m.id === paymentMethod)?.label} payments</p>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Confirm button */}
                        <div className="px-6 pb-6">
                            <button
                                onClick={() => onConfirm(paymentMethod, cashTendered, referenceNumber)}
                                disabled={!canConfirm}
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
