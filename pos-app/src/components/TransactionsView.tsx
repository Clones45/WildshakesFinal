import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { ManagerPinModal } from './ManagerPinModal'
import {
    X, ReceiptText, Loader2, Filter, RefreshCw,
    Banknote, Smartphone, QrCode, Landmark,
    CheckCircle2, XCircle, Tag, MapPin, Clock,
} from 'lucide-react'

interface TransactionsViewProps {
    isOpen: boolean
    onClose: () => void
}

type PaymentFilter = 'all' | 'cash' | 'gcash' | 'maya' | 'bank_transfer'
type StatusFilter = 'all' | 'completed' | 'voided' | 'discounted'

interface TxRow {
    id: string
    total_amount: number
    payment_method: string
    reference_number: string | null
    status: string
    discount_type: string
    discount_amount: number
    table_number: string | null
    local_ref: string | null
    void_reason: string | null
    cashier_id: string | null
    cashier_name?: string
    created_at: string
}

const PAYMENT_ICONS: Record<string, React.ElementType> = {
    cash: Banknote,
    gcash: Smartphone,
    maya: QrCode,
    bank_transfer: Landmark,
}

const PAYMENT_COLORS: Record<string, string> = {
    cash: 'text-green-400 bg-green-500/10 border-green-500/20',
    gcash: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    maya: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    bank_transfer: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
}

const PAYMENT_LABELS: Record<string, string> = {
    cash: 'Cash',
    gcash: 'GCash',
    maya: 'Maya',
    bank_transfer: 'Bank Transfer',
}

const STATUS_FILTER_OPTIONS: { id: StatusFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'completed', label: 'Completed' },
    { id: 'voided', label: 'Voided' },
    { id: 'discounted', label: 'Discounted' },
]

const PAYMENT_FILTER_OPTIONS: { id: PaymentFilter; label: string }[] = [
    { id: 'all', label: 'All Methods' },
    { id: 'cash', label: 'Cash' },
    { id: 'gcash', label: 'GCash' },
    { id: 'maya', label: 'Maya' },
    { id: 'bank_transfer', label: 'Bank Transfer' },
]

function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString('en-PH', {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    })
}

export function TransactionsView({ isOpen, onClose }: TransactionsViewProps) {
    const { branch } = useAuthStore()
    const [transactions, setTransactions] = useState<TxRow[]>([])
    const [loading, setLoading] = useState(false)
    const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all')
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
    const [totals, setTotals] = useState({ count: 0, revenue: 0 })

    const fetchTransactions = useCallback(async () => {
        if (!branch?.id) return
        setLoading(true)
        try {
            let query = supabase
                .from('transactions')
                .select('id, total_amount, payment_method, reference_number, status, discount_type, discount_amount, table_number, local_ref, void_reason, cashier_id, created_at')
                .eq('branch_id', branch.id)
                .neq('status', 'pending')         // exclude held orders
                .order('created_at', { ascending: false })
                .limit(200)

            if (paymentFilter !== 'all') {
                query = query.eq('payment_method', paymentFilter)
            }

            if (statusFilter === 'voided') {
                query = query.eq('status', 'voided')
            } else if (statusFilter === 'completed') {
                query = query.eq('status', 'completed')
            } else if (statusFilter === 'discounted') {
                query = query.eq('status', 'completed').neq('discount_type', 'none')
            }

            const { data, error } = await query
            if (error) throw error

            const rows = (data ?? []) as TxRow[]

            // Batch-fetch cashier names
            const cashierIds = [...new Set(rows.map((r) => r.cashier_id).filter(Boolean))] as string[]
            let nameMap: Record<string, string> = {}
            if (cashierIds.length > 0) {
                const { data: users } = await supabase
                    .from('users')
                    .select('id, name')
                    .in('id', cashierIds)
                if (users) {
                    nameMap = Object.fromEntries((users as { id: string; name: string }[]).map((u) => [u.id, u.name]))
                }
            }

            const enriched = rows.map((r) => ({
                ...r,
                cashier_name: r.cashier_id ? (nameMap[r.cashier_id] ?? 'Unknown') : '—',
            }))

            const completedRows = enriched.filter((r) => r.status === 'completed')
            setTotals({
                count: completedRows.length,
                revenue: completedRows.reduce((s, r) => s + r.total_amount, 0),
            })
            setTransactions(enriched)
        } catch (err) {
            console.error('Failed to load transactions', err)
        } finally {
            setLoading(false)
        }
    }, [branch?.id, paymentFilter, statusFilter])

    useEffect(() => {
        if (isOpen) fetchTransactions()
    }, [isOpen, fetchTransactions])

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                    />

                    {/* Panel */}
                    <motion.div
                        className="fixed top-0 right-0 h-full w-full max-w-lg bg-surface-800 border-l border-surface-600 flex flex-col z-50 shadow-2xl"
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    >
                        {/* Header */}
                        <div className="px-5 py-4 border-b border-surface-600 flex items-center justify-between flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-brand-500/20 flex items-center justify-center">
                                    <ReceiptText size={16} className="text-brand-400" />
                                </div>
                                <div>
                                    <h2 className="font-bold text-white text-base">Transactions</h2>
                                    <p className="text-gray-500 text-xs">Manager view · {branch?.name}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={fetchTransactions}
                                    disabled={loading}
                                    className="w-9 h-9 rounded-xl bg-surface-600 flex items-center justify-center text-gray-400 hover:text-white hover:bg-surface-500 transition-all"
                                >
                                    <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                                </button>
                                <button
                                    onClick={onClose}
                                    className="w-9 h-9 rounded-xl bg-surface-600 flex items-center justify-center text-gray-400 hover:text-white hover:bg-surface-500 transition-all"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Summary bar */}
                        <div className="px-5 py-3 border-b border-surface-700 flex gap-4 bg-surface-900/40 flex-shrink-0">
                            <div>
                                <p className="text-xs text-gray-500">Transactions</p>
                                <p className="text-white font-bold text-lg leading-tight">{totals.count}</p>
                            </div>
                            <div className="w-px bg-surface-600" />
                            <div>
                                <p className="text-xs text-gray-500">Revenue</p>
                                <p className="text-teal-400 font-bold text-lg leading-tight">₱{totals.revenue.toFixed(2)}</p>
                            </div>
                        </div>

                        {/* Filters */}
                        <div className="px-4 py-3 border-b border-surface-700 space-y-2 flex-shrink-0">
                            <div className="flex items-center gap-2">
                                <Filter size={12} className="text-gray-500" />
                                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Payment Method</p>
                            </div>
                            <div className="flex gap-1.5 flex-wrap">
                                {PAYMENT_FILTER_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.id}
                                        onClick={() => setPaymentFilter(opt.id)}
                                        className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${paymentFilter === opt.id
                                            ? 'bg-brand-500 border-brand-500 text-white'
                                            : 'border-surface-500 text-gray-400 hover:border-surface-400'
                                            }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                            <div className="flex gap-1.5 flex-wrap">
                                {STATUS_FILTER_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.id}
                                        onClick={() => setStatusFilter(opt.id)}
                                        className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${statusFilter === opt.id
                                            ? 'bg-surface-400 border-surface-300 text-white'
                                            : 'border-surface-600 text-gray-500 hover:border-surface-400'
                                            }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Transaction list */}
                        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center h-40 gap-3 text-gray-500">
                                    <Loader2 size={28} className="animate-spin text-brand-400" />
                                    <p className="text-sm">Loading transactions…</p>
                                </div>
                            ) : transactions.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-40 gap-3 text-gray-600">
                                    <ReceiptText size={36} className="opacity-40" />
                                    <p className="text-sm">No transactions found</p>
                                    <p className="text-xs">Try adjusting the filters</p>
                                </div>
                            ) : (
                                transactions.map((tx) => {
                                    const PayIcon = PAYMENT_ICONS[tx.payment_method] ?? Banknote
                                    const payColor = PAYMENT_COLORS[tx.payment_method] ?? PAYMENT_COLORS.cash
                                    const payLabel = PAYMENT_LABELS[tx.payment_method] ?? tx.payment_method
                                    const isVoided = tx.status === 'voided'
                                    const isDiscounted = tx.discount_type !== 'none' && tx.discount_amount > 0
                                    const tableNum = tx.table_number ?? tx.local_ref

                                    return (
                                        <motion.div
                                            key={tx.id}
                                            layout
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className={`rounded-2xl border p-4 space-y-3 transition-all ${isVoided
                                                ? 'bg-red-500/5 border-red-500/20 opacity-70'
                                                : 'bg-surface-700 border-surface-600'
                                                }`}
                                        >
                                            {/* Top row */}
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        {/* Status badge */}
                                                        {isVoided ? (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-bold">
                                                                <XCircle size={10} /> Voided
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-bold">
                                                                <CheckCircle2 size={10} /> Completed
                                                            </span>
                                                        )}
                                                        {isDiscounted && (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs font-bold">
                                                                <Tag size={10} /> {tx.discount_type}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-3 mt-1.5">
                                                        <div className="flex items-center gap-1 text-gray-500 text-xs">
                                                            <Clock size={10} />
                                                            {formatDateTime(tx.created_at)}
                                                        </div>
                                                        {tableNum && (
                                                            <div className="flex items-center gap-1 text-teal-400 text-xs">
                                                                <MapPin size={10} />
                                                                Table #{tableNum}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <p className="text-gray-500 text-xs mt-0.5">
                                                        Cashier: <span className="text-gray-300">{tx.cashier_name}</span>
                                                    </p>
                                                </div>
                                                <div className="text-right flex-shrink-0">
                                                    <p className={`font-bold text-lg ${isVoided ? 'text-gray-500 line-through' : 'text-white'}`}>
                                                        ₱{tx.total_amount.toFixed(2)}
                                                    </p>
                                                    {isDiscounted && (
                                                        <p className="text-yellow-400 text-xs">-₱{tx.discount_amount.toFixed(2)}</p>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Payment method + reference */}
                                            <div className="flex items-center justify-between">
                                                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${payColor}`}>
                                                    <PayIcon size={12} />
                                                    {payLabel}
                                                </div>
                                                {tx.reference_number && (
                                                    <p className="text-gray-400 text-xs font-mono">
                                                        Ref: <span className="text-white tracking-widest">…{tx.reference_number}</span>
                                                    </p>
                                                )}
                                            </div>

                                            {/* Void reason */}
                                            {isVoided && tx.void_reason && (
                                                <p className="text-red-300/70 text-xs italic px-2 py-1.5 bg-red-500/5 rounded-lg border border-red-500/10">
                                                    Reason: {tx.void_reason}
                                                </p>
                                            )}
                                        </motion.div>
                                    )
                                })
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}

// ── Wrapper with manager PIN gate ────────────────────────────────────────────
export function TransactionsViewGated({ isOpen, onClose }: TransactionsViewProps) {
    const [pinPassed, setPinPassed] = useState(false)
    const [showPin, setShowPin] = useState(false)
    const { user } = useAuthStore()

    useEffect(() => {
        if (isOpen) {
            const isManager = user?.role === 'manager' || user?.role === 'investor'
            if (isManager) {
                setPinPassed(true)
            } else {
                setPinPassed(false)
                setShowPin(true)
            }
        } else {
            setPinPassed(false)
            setShowPin(false)
        }
    }, [isOpen, user?.role])

    if (!isOpen) return null

    return (
        <>
            <TransactionsView isOpen={pinPassed} onClose={onClose} />
            <ManagerPinModal
                isOpen={showPin}
                title="Manager Access — Transactions"
                onSuccess={() => { setShowPin(false); setPinPassed(true) }}
                onClose={() => { setShowPin(false); onClose() }}
            />
        </>
    )
}
