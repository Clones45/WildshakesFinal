import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCartStore } from '../store/cartStore'
import {
    X, Banknote, Landmark, Check, AlertCircle, ChevronDown,
    Plus, Trash2, SplitSquareVertical,
} from 'lucide-react'

interface CheckoutModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: (method: string, tendered: number, referenceNumber: string, bankName: string, orderType: 'dine-in' | 'take-out' | 'pickup', splits?: SplitEntry[]) => Promise<void>
    isProcessing: boolean
}

export interface SplitEntry {
    id: string
    method: string
    amount: number
    referenceNumber: string
    bankName: string
}

const PAYMENT_METHODS = [
    { id: 'cash',          label: 'Cash',          icon: Banknote,    color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/30' },
    { id: 'gcash',         label: 'GCash',         image: '/GCash.png', color: 'text-blue-400',  bg: 'bg-blue-500/10 border-blue-500/30' },
    { id: 'maya',          label: 'Maya',          image: '/Maya.png',  color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/30' },
    { id: 'bank_transfer', label: 'Bank Transfer', icon: Landmark,    color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/30' },
]

const BANK_OPTIONS = ['BDO', 'BPI', 'Metrobank', 'Landbank', 'UnionBank', 'Security Bank', 'PNB', 'RCBC', 'Other']

const getSmartQuickAmounts = (total: number) => {
    if (total <= 0) return [50, 100, 200, 500, 1000]
    const amounts = new Set<number>()
    ;[10, 50, 100, 500, 1000].forEach(d => {
        const r = Math.ceil(total / d) * d
        if (r > total) amounts.add(r)
    })
    ;[50, 100, 200, 500, 1000].forEach(b => { if (b > total) amounts.add(b) })
    return Array.from(amounts).sort((a, b) => a - b).slice(0, 6)
}

function methodMeta(id: string) {
    return PAYMENT_METHODS.find(m => m.id === id) ?? PAYMENT_METHODS[0]
}

// ── Single-method payment fields ─────────────────────────────────────────────
function SingleMethodFields({ method, tot }: { method: string; tot: number }) {
    const { cashTendered, setCashTendered, referenceNumber, setReferenceNumber, bankName, setBankName } = useCartStore()
    const isGcashMaya = method === 'gcash' || method === 'maya'
    const isBank = method === 'bank_transfer'
    const requiredDigits = isGcashMaya ? 6 : 5
    const refValid = referenceNumber.length === requiredDigits
    const chg = Math.max(0, cashTendered - tot)

    if (method === 'cash') return (
        <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Cash Tendered</p>
            <div className="flex gap-2">
                <input type="number" autoFocus value={cashTendered || ''} onChange={e => setCashTendered(parseFloat(e.target.value) || 0)}
                    placeholder="Enter amount" className="input-field text-lg font-bold flex-1" />
                <button onClick={() => setCashTendered(tot)} className="btn-ghost text-xs px-3 whitespace-nowrap">Exact</button>
            </div>
            <div className="grid grid-cols-3 gap-2">
                {getSmartQuickAmounts(tot).map(a => (
                    <button key={a} onClick={() => setCashTendered(Math.ceil(tot / a) * a)}
                        className="py-2 rounded-xl bg-surface-600 border border-surface-500 text-white text-sm font-medium hover:border-brand-500/50 active:scale-95 transition-all">
                        ₱{a}
                    </button>
                ))}
            </div>
            {cashTendered >= tot && (
                <div className="flex justify-between items-center py-3 px-4 bg-green-500/10 border border-green-500/30 rounded-xl">
                    <span className="text-green-400 font-semibold">Change</span>
                    <span className="text-green-400 font-bold text-xl">₱{chg.toFixed(2)}</span>
                </div>
            )}
        </div>
    )

    if (isGcashMaya) return (
        <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Reference Number <span className="text-red-400">*</span></p>
            <p className="text-xs text-gray-500">Last <strong className="text-white">6 digits</strong> of {method === 'gcash' ? 'GCash' : 'Maya'} reference</p>
            <div className="relative">
                <input type="text" autoFocus inputMode="numeric" maxLength={6} value={referenceNumber}
                    onChange={e => setReferenceNumber(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="e.g. 123456"
                    className={`input-field text-2xl font-bold tracking-[0.35em] w-full text-center transition-all ${refValid ? 'border-green-500/50 bg-green-500/5' : ''}`} />
                {refValid && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute right-3 top-1/2 -translate-y-1/2"><Check size={18} className="text-green-400" /></motion.div>}
            </div>
            {!refValid && referenceNumber.length > 0 && (
                <div className="flex items-center gap-1.5 text-amber-400 text-xs"><AlertCircle size={12} /><span>{6 - referenceNumber.length} more digit(s) required</span></div>
            )}
        </div>
    )

    if (isBank) return (
        <div className="space-y-3">
            <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Select Bank <span className="text-red-400">*</span></p>
                <div className="relative">
                    <select value={bankName} onChange={e => setBankName(e.target.value)}
                        className={`input-field w-full appearance-none pr-8 transition-all ${bankName ? 'border-amber-500/40 bg-amber-500/5 text-white' : 'text-gray-500'}`}>
                        <option value="">— Select bank —</option>
                        {BANK_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                </div>
            </div>
            <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Reference Number <span className="text-red-400">*</span></p>
                <p className="text-xs text-gray-500 mb-2">Last <strong className="text-white">5 digits</strong> of transfer reference</p>
                <div className="relative">
                    <input type="text" inputMode="numeric" maxLength={5} value={referenceNumber}
                        onChange={e => setReferenceNumber(e.target.value.replace(/\D/g, '').slice(0, 5))}
                        placeholder="e.g. 12345"
                        className={`input-field text-2xl font-bold tracking-[0.35em] w-full text-center transition-all ${refValid ? 'border-green-500/50 bg-green-500/5' : ''}`} />
                    {refValid && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute right-3 top-1/2 -translate-y-1/2"><Check size={18} className="text-green-400" /></motion.div>}
                </div>
                {!refValid && referenceNumber.length > 0 && (
                    <div className="flex items-center gap-1.5 text-amber-400 text-xs mt-1"><AlertCircle size={12} /><span>{5 - referenceNumber.length} more digit(s) required</span></div>
                )}
            </div>
            {refValid && bankName && (
                <div className="flex items-center gap-2 py-2 px-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 text-sm font-semibold">
                    <Check size={14} />{bankName} — Ref …{referenceNumber}
                </div>
            )}
        </div>
    )

    return null
}

// ── Split payment row ─────────────────────────────────────────────────────────
function SplitRow({
    entry, remainingAfterOthers, onChange, onRemove,
}: {
    entry: SplitEntry
    remainingAfterOthers: number
    onChange: (patch: Partial<SplitEntry>) => void
    onRemove: () => void
}) {
    const isGcashMaya = entry.method === 'gcash' || entry.method === 'maya'
    const isBank = entry.method === 'bank_transfer'
    const requiredDigits = isGcashMaya ? 6 : 5
    const refValid = (isGcashMaya || isBank) ? entry.referenceNumber.length === requiredDigits : true
    const needsRef = isGcashMaya || isBank
    const meta = methodMeta(entry.method)

    return (
        <div className="bg-surface-700 border border-surface-500 rounded-2xl p-3 space-y-2">
            {/* Method selector row */}
            <div className="flex items-center gap-2">
                <div className="flex gap-1.5 flex-1 flex-wrap">
                    {PAYMENT_METHODS.map(m => (
                        <button key={m.id} onClick={() => onChange({ method: m.id, referenceNumber: '', bankName: '' })}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all flex-shrink-0 ${entry.method === m.id ? `${m.bg} ${m.color}` : 'bg-surface-600 border-surface-500 text-gray-300 hover:border-surface-400'}`}>
                            {m.image ? <img src={m.image} alt={m.label} className="w-3.5 h-3.5 object-contain flex-shrink-0" /> : m.icon && <m.icon size={13} className="flex-shrink-0" />}
                            <span className="whitespace-nowrap">{m.label}</span>
                        </button>
                    ))}
                </div>
                <button onClick={onRemove} className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors flex-shrink-0">
                    <Trash2 size={13} />
                </button>
            </div>

            {/* Amount + quick-fill */}
            <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">₱</span>
                    <input type="number" min={0} step={0.01}
                        value={entry.amount || ''}
                        onChange={e => onChange({ amount: parseFloat(e.target.value) || 0 })}
                        placeholder="0.00"
                        className="input-field pl-7 font-bold text-sm w-full" />
                </div>
                {remainingAfterOthers > 0 && (
                    <button onClick={() => onChange({ amount: parseFloat(remainingAfterOthers.toFixed(2)) })}
                        className="btn-ghost text-xs px-2.5 whitespace-nowrap">
                        ₱{remainingAfterOthers.toFixed(2)}
                    </button>
                )}
            </div>

            {/* Ref number for e-wallet / bank */}
            {needsRef && (
                <div>
                    <p className="text-[10px] text-gray-500 mb-1 font-semibold uppercase tracking-wider">
                        {isBank ? 'Bank' : ''} Ref ({requiredDigits} digits) <span className="text-red-400">*</span>
                    </p>
                    {isBank && (
                        <div className="relative mb-1.5">
                            <select value={entry.bankName} onChange={e => onChange({ bankName: e.target.value })}
                                className={`input-field w-full appearance-none pr-8 text-sm transition-all ${entry.bankName ? 'border-amber-500/40 text-white' : 'text-gray-500'}`}>
                                <option value="">— Select bank —</option>
                                {BANK_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                            <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                        </div>
                    )}
                    <div className="relative">
                        <input type="text" inputMode="numeric" maxLength={requiredDigits}
                            value={entry.referenceNumber}
                            onChange={e => onChange({ referenceNumber: e.target.value.replace(/\D/g, '').slice(0, requiredDigits) })}
                            placeholder={`Last ${requiredDigits} digits`}
                            className={`input-field text-sm tracking-widest w-full text-center transition-all ${refValid ? 'border-green-500/50 bg-green-500/5' : ''}`} />
                        {refValid && <div className="absolute right-2.5 top-1/2 -translate-y-1/2"><Check size={14} className="text-green-400" /></div>}
                    </div>
                </div>
            )}

            {/* Row status chip */}
            <div className={`flex items-center justify-between text-xs px-2 py-1 rounded-lg ${meta.bg} ${meta.color}`}>
                <span className="font-semibold">{meta.label}</span>
                <span className="font-bold">₱{entry.amount.toFixed(2)}</span>
            </div>
        </div>
    )
}

// ── Main modal ────────────────────────────────────────────────────────────────
export function CheckoutModal({ isOpen, onClose, onConfirm, isProcessing }: CheckoutModalProps) {
    const {
        paymentMethod, setPaymentMethod,
        cashTendered, referenceNumber, bankName,
        total, items, deliveryPlatform,
    } = useCartStore()

    const tot = total()

    const [isSplit, setIsSplit] = useState(false)
    const [splits, setSplits] = useState<SplitEntry[]>([])
    const [orderType, setOrderType] = useState<'dine-in' | 'take-out' | 'pickup'>(deliveryPlatform ? 'pickup' : 'dine-in')

    const newEntry = useCallback((): SplitEntry => ({
        id: crypto.randomUUID(),
        method: 'cash',
        amount: 0,
        referenceNumber: '',
        bankName: '',
    }), [])

    const addSplit = () => {
        const existing = splits.reduce((s, e) => s + e.amount, 0)
        const rem = Math.max(0, parseFloat((tot - existing).toFixed(2)))
        setSplits(prev => [...prev, { ...newEntry(), amount: rem }])
    }

    const removeSplit = (id: string) => setSplits(prev => prev.filter(e => e.id !== id))

    const updateSplit = (id: string, patch: Partial<SplitEntry>) =>
        setSplits(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))

    const splitTotal = splits.reduce((s, e) => s + e.amount, 0)
    const splitRemaining = parseFloat((tot - splitTotal).toFixed(2))
    const splitValid = splitTotal >= tot && splits.length >= 2 && splits.every(e => {
        const needsRef = e.method === 'gcash' || e.method === 'maya' || e.method === 'bank_transfer'
        const reqDigits = (e.method === 'gcash' || e.method === 'maya') ? 6 : 5
        const refOk = needsRef ? e.referenceNumber.length === reqDigits : true
        const bankOk = e.method === 'bank_transfer' ? e.bankName.length > 0 : true
        return e.amount > 0 && refOk && bankOk
    })

    // Single mode validity
    const isGcashMaya = paymentMethod === 'gcash' || paymentMethod === 'maya'
    const isBank = paymentMethod === 'bank_transfer'
    const requiredDigits = isGcashMaya ? 6 : 5
    const refValid = referenceNumber.length === requiredDigits
    const bankValid = isBank ? bankName.length > 0 : true
    const isDelivery = !!deliveryPlatform
    const deliveryValid = referenceNumber.length > 0

    const singleValid = !isProcessing && (
        isDelivery ? deliveryValid : (paymentMethod === 'cash' ? cashTendered >= tot : refValid && bankValid)
    )

    const canConfirm = !isProcessing && (isSplit ? splitValid : singleValid)

    const handleConfirm = async () => {
        if (isDelivery) {
            await onConfirm('other', tot, referenceNumber, '', 'pickup')
        } else if (isSplit) {
            const primaryMethod = splits.map(s => s.method).join('+')
            await onConfirm(primaryMethod, splitTotal, '', '', orderType, splits)
        } else {
            await onConfirm(paymentMethod, cashTendered, referenceNumber, bankName, orderType)
        }
    }

    const handleToggleSplit = () => {
        setIsSplit(prev => {
            if (!prev && splits.length === 0) {
                setSplits([{ ...newEntry(), amount: 0 }, { ...newEntry(), method: 'gcash', amount: 0 }])
            }
            return !prev
        })
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                    onClick={e => { if (e.target === e.currentTarget) onClose() }}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="bg-surface-800 border border-surface-500 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-5 border-b border-surface-600 flex-shrink-0">
                            <div>
                                <h2 className="text-xl font-bold text-white">Checkout</h2>
                                <p className="text-gray-500 text-sm">{items.length} item{items.length !== 1 ? 's' : ''}</p>
                            </div>
                            <button onClick={onClose} className="w-9 h-9 rounded-xl bg-surface-600 flex items-center justify-center hover:bg-surface-500 transition-colors">
                                <X size={16} className="text-gray-400" />
                            </button>
                        </div>

                        <div className="overflow-y-auto flex-1 p-6 space-y-5">
                        {/* Order Type */}
                        <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Order Type</p>
                            {isDelivery ? (
                                <div className="grid grid-cols-1 gap-2">
                                    <button
                                        disabled
                                        className="py-3 rounded-xl border font-bold text-sm bg-indigo-500/15 border-indigo-500/50 text-indigo-400"
                                    >
                                        🛍️ Pickup ({deliveryPlatform === 'foodpanda' ? 'Foodpanda' : 'Grab'})
                                    </button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => setOrderType('dine-in')}
                                        className={`py-3 rounded-xl border font-bold text-sm transition-all ${
                                            orderType === 'dine-in'
                                                ? 'bg-teal-500/15 border-teal-500/50 text-teal-400'
                                                : 'bg-surface-700 border-surface-500 text-gray-500 hover:border-surface-400'
                                        }`}
                                    >
                                        🍽️ Dine-in
                                    </button>
                                    <button
                                        onClick={() => setOrderType('take-out')}
                                        className={`py-3 rounded-xl border font-bold text-sm transition-all ${
                                            orderType === 'take-out'
                                                ? 'bg-amber-500/15 border-amber-500/50 text-amber-400'
                                                : 'bg-surface-700 border-surface-500 text-gray-500 hover:border-surface-400'
                                        }`}
                                    >
                                        🥡 Take-out
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Total */}
                        <div className="text-center py-4 bg-surface-700 rounded-2xl border border-surface-500">
                            <p className="text-gray-400 text-sm mb-1">Amount Due</p>
                            <p className="text-5xl font-extrabold text-teal-400">₱{tot.toFixed(2)}</p>
                        </div>

                            {isDelivery ? (
                                <div className="space-y-3 pt-2 border-t border-surface-600">
                                    <div>
                                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Delivery Rider Receipt Code <span className="text-red-400">*</span></p>
                                        <p className="text-xs text-gray-500 mb-2">Enter the transaction code provided by the {deliveryPlatform} rider.</p>
                                        <div className="relative">
                                            <input type="text" autoFocus value={referenceNumber}
                                                onChange={e => useCartStore.getState().setReferenceNumber(e.target.value)}
                                                placeholder="e.g. FP-12345"
                                                className={`input-field text-lg font-bold w-full text-center transition-all ${referenceNumber.length > 0 ? 'border-green-500/50 bg-green-500/5' : ''}`} />
                                            {referenceNumber.length > 0 && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute right-3 top-1/2 -translate-y-1/2"><Check size={18} className="text-green-400" /></motion.div>}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {/* Split toggle */}
                                    <button
                                        onClick={handleToggleSplit}
                                        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-bold transition-all ${
                                            isSplit
                                                ? 'bg-violet-500/15 border-violet-500/40 text-violet-400'
                                                : 'bg-surface-700 border-surface-500 text-gray-400 hover:border-violet-500/30 hover:text-violet-400'
                                        }`}
                                    >
                                        <SplitSquareVertical size={16} />
                                        {isSplit ? 'Split Payment ON — tap to use single payment' : 'Split Payment (Cash + Card / E-Wallet)'}
                                    </button>
        
                                    <AnimatePresence mode="wait">
                                        {isSplit ? (
                                            <motion.div key="split" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                                                {/* Running totals */}
                                                <div className="flex justify-between items-center text-xs font-semibold px-1">
                                                    <span className="text-gray-400">Collected: <span className="text-white">₱{splitTotal.toFixed(2)}</span></span>
                                                    {splitRemaining > 0
                                                        ? <span className="text-amber-400">Remaining: ₱{splitRemaining.toFixed(2)}</span>
                                                        : <span className="text-green-400 flex items-center gap-1"><Check size={12} />Covered</span>
                                                    }
                                                </div>
        
                                                {/* Split rows */}
                                                {splits.map((entry, idx) => {
                                                    const othersTotal = splits.filter(e => e.id !== entry.id).reduce((s, e) => s + e.amount, 0)
                                                    const remForThis = parseFloat((tot - othersTotal).toFixed(2))
                                                    return (
                                                        <div key={entry.id}>
                                                            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1.5 px-1">Payment {idx + 1}</p>
                                                            <SplitRow
                                                                entry={entry}
                                                                remainingAfterOthers={remForThis > 0 ? remForThis : 0}
                                                                onChange={patch => updateSplit(entry.id, patch)}
                                                                onRemove={() => removeSplit(entry.id)}
                                                            />
                                                        </div>
                                                    )
                                                })}
        
                                                {/* Add another split */}
                                                <button onClick={addSplit}
                                                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-surface-500 text-gray-500 hover:border-brand-500/40 hover:text-brand-400 text-sm font-semibold transition-all">
                                                    <Plus size={15} /> Add Another Payment Method
                                                </button>
                                            </motion.div>
                                        ) : (
                                            <motion.div key="single" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
                                                {/* Method selector */}
                                                <div>
                                                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Payment Method</p>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {PAYMENT_METHODS.map(m => (
                                                            <button key={m.id} onClick={() => setPaymentMethod(m.id as never)}
                                                                className={`py-3 px-4 rounded-xl border flex items-center gap-2.5 transition-all ${paymentMethod === m.id ? `${m.bg} ${m.color} font-bold` : 'border-surface-500 bg-surface-700 text-gray-500 hover:border-surface-400'}`}>
                                                                {m.image ? <img src={m.image} alt={m.label} className="w-5 h-5 object-contain" /> : m.icon && <m.icon size={18} />}
                                                                <span className="text-sm font-semibold">{m.label}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
        
                                                {/* Dynamic fields */}
                                                <AnimatePresence mode="wait">
                                                    <motion.div key={paymentMethod} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                                                        <SingleMethodFields method={paymentMethod} tot={tot} />
                                                    </motion.div>
                                                </AnimatePresence>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </>
                            )}
                        </div>

                        {/* Confirm */}
                        <div className="px-6 pb-6 flex-shrink-0">
                            <button onClick={handleConfirm} disabled={!canConfirm}
                                className="w-full btn-teal py-4 text-lg flex items-center justify-center gap-2 disabled:opacity-40">
                                {isProcessing
                                    ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    : <><Check size={20} />Confirm Payment</>
                                }
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
