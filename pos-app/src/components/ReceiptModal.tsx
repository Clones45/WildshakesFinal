import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, RotateCcw, AlertTriangle, Printer } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import type { LocalTransaction } from '../lib/db'

interface ReceiptModalProps {
    isOpen: boolean
    transaction: LocalTransaction | null
    onClose: () => void
    onVoid: (localRef: string, reason: string) => void
    onNewOrder: () => void
}

function printReceipt(transaction: LocalTransaction, branchName: string, cashierName: string) {
    const W = 32 // 58mm paper = 32 chars per line at default font

    // ── Helpers ────────────────────────────────────────────────────────────────

    /** Center a string within W characters. Truncates if too long. */
    const center = (str: string): string => {
        const s = str.slice(0, W)
        const pad = Math.max(0, Math.floor((W - s.length) / 2))
        return ' '.repeat(pad) + s
    }

    /** Left-align label, right-align value, space-padded to exactly W chars.
     *  Truncates label if the combined length would exceed W. */
    const leftRight = (left: string, right: string): string => {
        const maxLeft = W - right.length - 1
        const l = left.slice(0, maxLeft)
        const gap = W - l.length - right.length
        return l + ' '.repeat(Math.max(1, gap)) + right
    }

    /** A dashed divider line */
    const divider = '-'.repeat(W)

    // ── Date / time (compact) ─────────────────────────────────────────────────
    const now = new Date(transaction.createdAt)
    const dateStr = now.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    const timeStr = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true })

    // ── Items ─────────────────────────────────────────────────────────────────
    const activeItems  = transaction.items.filter(i => !(i as any).cancelled)
    const cancelledItems = transaction.items.filter(i => (i as any).cancelled)

    const itemLines = activeItems.flatMap(item => {
        const price = `P${item.subtotal.toFixed(2)}`
        const label = `${item.productName} x${item.quantity}`
        const lines: string[] = [leftRight(label, price)]
        if ((item as any).notes) {
            // indent notes, truncated to fit
            lines.push(`  >${(item as any).notes}`.slice(0, W))
        }
        return lines
    })

    const cancelledLines = cancelledItems.length > 0
        ? [
            divider,
            center('CANCELLED (not charged)'),
            ...cancelledItems.map(i =>
                `[X] ${i.productName} x${i.quantity}`.slice(0, W)
            ),
          ]
        : []

    // ── Totals ────────────────────────────────────────────────────────────────
    const subtotal = transaction.totalAmount + transaction.discountAmount
    const totalLines: string[] = [
        leftRight('Subtotal', `P${subtotal.toFixed(2)}`),
    ]
    if (transaction.discountAmount > 0) {
        totalLines.push(leftRight(`${transaction.discountType} disc.`, `-P${transaction.discountAmount.toFixed(2)}`))
    }
    totalLines.push(leftRight('TOTAL', `P${transaction.totalAmount.toFixed(2)}`))
    totalLines.push(leftRight('Payment', transaction.paymentMethod.replace('_', ' ').toUpperCase()))
    if (transaction.referenceNumber) {
        totalLines.push(leftRight('Ref#', transaction.referenceNumber.slice(0, 12)))
    }

    // ── Assemble receipt ──────────────────────────────────────────────────────
    const lines: string[] = [
        center('WILDSHAKES CAFE'),
        center(branchName.slice(0, W)),
        center(`${dateStr} ${timeStr}`),
        divider,
        `Cashier: ${cashierName}`.slice(0, W),
        `Ref: ${transaction.localRef.slice(0, 12).toUpperCase()}`,
        ...(transaction.tableNumber ? [`Table: #${transaction.tableNumber}`] : []),
        divider,
        ...itemLines,
        ...cancelledLines,
        divider,
        ...totalLines,
        divider,
        center('-- Thank you! Come again! --'),
        '\n\n\n', // feed past the tear bar
    ]

    const receipt = lines.join('\n')

    // ── Fire RawBT Android Intent (hidden anchor pattern) ────────────────────
    // Browsers block programmatic window.location.href for intent:// URIs.
    // A hidden <a> click is treated as a user-gesture navigation and is allowed.
    const encodedData = encodeURIComponent(receipt)
    const intentUrl =
        'intent:' + encodedData +
        '#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;'

    const a = document.createElement('a')
    a.href = intentUrl
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
}

export function ReceiptModal({ isOpen, transaction, onVoid, onNewOrder }: ReceiptModalProps) {
    const { user, branch } = useAuthStore()
    const [showVoidPrompt, setShowVoidPrompt] = useState(false)
    const [voidReason, setVoidReason] = useState('')

    // Reset state when modal opens/closes
    useEffect(() => {
        if (!isOpen) {
            setShowVoidPrompt(false)
            setVoidReason('')
        }
    }, [isOpen])

    if (!transaction) return null

    const now = new Date(transaction.createdAt)
    const dateStr = now.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    const timeStr = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    const paymentLabel = transaction.paymentMethod.replace('_', ' ')

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
                            <p className="text-gray-400 text-sm mt-1">{branch?.name} · {timeStr}</p>
                        </div>

                        {/* Receipt body */}
                        <div className="px-6 py-4 font-mono text-xs max-h-72 overflow-y-auto space-y-1">
                            {/* Header */}
                            <div className="text-center pb-2 border-b border-dashed border-surface-600">
                                <p className="font-bold text-white text-sm">WILDSHAKES CAFE</p>
                                <p className="text-gray-400">{branch?.location}</p>
                                <p className="text-gray-500">{dateStr}</p>
                            </div>

                            {/* Meta */}
                            <div className="py-1.5 border-b border-dashed border-surface-600 space-y-0.5 text-gray-400">
                                <div className="flex justify-between">
                                    <span>Cashier</span>
                                    <span className="text-white">{user?.name ?? '—'}</span>
                                </div>
                                {transaction.tableNumber && (
                                    <div className="flex justify-between">
                                        <span>Table</span>
                                        <span className="text-white">#{transaction.tableNumber}</span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span>Ref#</span>
                                    <span className="text-white">{transaction.localRef.slice(0, 12).toUpperCase()}</span>
                                </div>
                            </div>

                            {/* Items */}
                            <div className="py-2 space-y-1.5">
                                {transaction.items.map((item, i) => {
                                    const isCancelled = !!(item as any).cancelled
                                    return (
                                        <div key={i} className={isCancelled ? 'opacity-60' : ''}>
                                            <div className="flex justify-between text-xs">
                                                <span className={`flex-1 ${
                                                    isCancelled
                                                        ? 'line-through text-red-400'
                                                        : 'text-gray-300'
                                                }`}>
                                                    {item.productName} ×{item.quantity}
                                                    {isCancelled && <span className="no-underline ml-1 text-red-400 text-[10px] font-bold not-italic">[cancelled]</span>}
                                                </span>
                                                <span className={`ml-2 ${
                                                    isCancelled ? 'line-through text-red-400' : 'text-white'
                                                }`}>
                                                    ₱{item.subtotal.toFixed(2)}
                                                </span>
                                            </div>
                                            {(item as any).notes && !isCancelled && (
                                                <p className="text-gray-500 text-[10px] italic pl-2">↳ {(item as any).notes}</p>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>

                            {/* Totals */}
                            <div className="border-t border-dashed border-surface-600 pt-2 space-y-1">
                                <div className="flex justify-between text-gray-400">
                                    <span>Subtotal</span>
                                    <span>₱{(transaction.totalAmount + transaction.discountAmount).toFixed(2)}</span>
                                </div>
                                {transaction.discountAmount > 0 && (
                                    <div className="flex justify-between text-amber-400">
                                        <span className="capitalize">{transaction.discountType} disc.</span>
                                        <span>-₱{transaction.discountAmount.toFixed(2)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between font-bold border-t border-dashed border-surface-600 pt-1">
                                    <span className="text-white">TOTAL</span>
                                    <span className="text-teal-400 text-sm">₱{transaction.totalAmount.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-gray-400">
                                    <span>Payment</span>
                                    <span className="capitalize text-white">{paymentLabel}</span>
                                </div>
                                {transaction.referenceNumber && (
                                    <div className="flex justify-between text-gray-400">
                                        <span>Ref#</span>
                                        <span className="text-white">{transaction.referenceNumber}</span>
                                    </div>
                                )}
                                <div className="text-center text-gray-600 pt-2">— Thank you! Come again! —</div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="px-5 pb-5 pt-3 space-y-2">
                            {showVoidPrompt ? (
                                <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2">
                                    <input
                                        autoFocus
                                        type="text"
                                        placeholder="Reason for voiding (required)"
                                        value={voidReason}
                                        onChange={e => setVoidReason(e.target.value)}
                                        className="w-full px-3 py-2 bg-surface-900 border border-surface-600 rounded-lg text-white text-sm outline-none focus:border-red-500 transition-colors"
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setShowVoidPrompt(false)}
                                            className="flex-1 py-2 rounded-xl bg-surface-700 text-gray-300 text-sm font-medium hover:bg-surface-600 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            disabled={!voidReason.trim()}
                                            onClick={() => onVoid(transaction.localRef, voidReason.trim())}
                                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-50 transition-colors"
                                        >
                                            <AlertTriangle size={14} />
                                            Confirm Void
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <button
                                        onClick={() => printReceipt(transaction, branch?.name ?? 'Wildshakes', user?.name ?? 'Staff')}
                                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-500/10 border border-brand-500/30 text-brand-400 text-sm font-semibold hover:bg-brand-500/20 transition-colors"
                                    >
                                        <Printer size={15} />
                                        Print Receipt
                                    </button>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setShowVoidPrompt(true)}
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
                                </>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
