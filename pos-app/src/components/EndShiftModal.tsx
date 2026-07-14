import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ClipboardCheck, Loader2, Printer } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useShiftStore, type ShiftSummary } from '../store/shiftStore'
import { useAuthStore } from '../store/authStore'
import { printShiftReport } from '../lib/printer'

interface EndShiftModalProps {
    isOpen: boolean
    onClose: () => void
    onShiftEnded: () => void
}

const money = (n: number | null | undefined) => `₱${(n ?? 0).toFixed(2)}`

export function EndShiftModal({ isOpen, onClose, onShiftEnded }: EndShiftModalProps) {
    const { branch } = useAuthStore()
    const { currentShift, isEnding, previewSummary, endShift } = useShiftStore()
    const [actualCashInput, setActualCashInput] = useState('')
    const [preview, setPreview] = useState<ShiftSummary | null>(null)

    const actualCash = parseFloat(actualCashInput) || 0

    useEffect(() => {
        if (!isOpen) { setActualCashInput(''); setPreview(null); return }
        previewSummary(0).then(setPreview)
    }, [isOpen])

    // Recompute the preview whenever the counted amount changes, so Expected/Difference stay live.
    useEffect(() => {
        if (!isOpen) return
        previewSummary(actualCash).then(setPreview)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [actualCashInput, isOpen])

    const handleConfirm = async () => {
        if (!actualCashInput) {
            toast.error('Enter the counted cash amount.')
            return
        }
        const summary = await endShift(actualCash)
        if (!summary || !branch) return
        await printShiftReport(summary, branch.name)
        toast.success('Shift closed!')
        onShiftEnded()
    }

    if (!currentShift) return null

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                    onClick={(e) => { if (e.target === e.currentTarget && !isEnding) onClose() }}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="bg-surface-800 border border-surface-500 rounded-3xl w-full max-w-sm shadow-2xl max-h-[90vh] overflow-y-auto"
                    >
                        <div className="flex items-center justify-between px-6 py-5 border-b border-surface-600">
                            <div className="flex items-center gap-2">
                                <ClipboardCheck size={18} className="text-brand-400" />
                                <h2 className="text-lg font-bold text-white">End Shift #{currentShift.shiftNumber}</h2>
                            </div>
                            <button onClick={onClose} disabled={isEnding} className="w-8 h-8 rounded-xl bg-surface-600 flex items-center justify-center hover:bg-surface-500 transition-colors disabled:opacity-40">
                                <X size={14} className="text-gray-400" />
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            <div className="rounded-2xl bg-surface-700 border border-surface-600 p-4 space-y-1.5 text-sm">
                                <div className="flex justify-between text-gray-400">
                                    <span>Starting cash</span>
                                    <span className="text-white font-semibold">{money(currentShift.startingCash)}</span>
                                </div>
                                <div className="flex justify-between text-gray-400">
                                    <span>Gross sales</span>
                                    <span className="text-white font-semibold">{money(preview?.grossSales)}</span>
                                </div>
                                <div className="flex justify-between text-gray-400">
                                    <span>Net sales</span>
                                    <span className="text-white font-semibold">{money(preview?.netSales)}</span>
                                </div>
                                <div className="h-px bg-surface-600 my-2" />
                                <div className="flex justify-between text-gray-400">
                                    <span>Expected cash in drawer</span>
                                    <span className="text-teal-400 font-bold">{money(preview?.expectedCash)}</span>
                                </div>
                            </div>

                            <div>
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
                                    Count the drawer — enter actual cash
                                </p>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₱</span>
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        value={actualCashInput}
                                        onChange={(e) => setActualCashInput(e.target.value)}
                                        placeholder="0.00"
                                        className="input-field pl-7"
                                        autoFocus
                                    />
                                </div>
                            </div>

                            {actualCashInput && preview && (
                                <div className={`rounded-xl px-4 py-3 text-sm font-bold flex justify-between ${
                                    Math.abs(preview.cashDifference ?? 0) < 0.01
                                        ? 'bg-teal-500/10 border border-teal-500/30 text-teal-400'
                                        : (preview.cashDifference ?? 0) > 0
                                            ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
                                            : 'bg-red-500/10 border border-red-500/30 text-red-400'
                                }`}>
                                    <span>Difference</span>
                                    <span>{(preview.cashDifference ?? 0) >= 0 ? '+' : ''}{money(preview.cashDifference)}</span>
                                </div>
                            )}
                        </div>

                        <div className="px-5 pb-5 flex gap-2">
                            <button onClick={onClose} disabled={isEnding} className="btn-ghost flex-1 text-sm disabled:opacity-40">
                                Cancel
                            </button>
                            <button onClick={handleConfirm} disabled={isEnding} className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm disabled:opacity-60">
                                {isEnding ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                                Confirm &amp; Print
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
