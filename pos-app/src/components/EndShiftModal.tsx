import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ClipboardCheck, Loader2, Printer, Check, AlertTriangle } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useShiftStore, rememberedCommission, type ShiftSummary, type PlatformCommission } from '../store/shiftStore'
import { useAuthStore } from '../store/authStore'
import { buildShiftReportText, printShiftReport } from '../lib/printer'

// End Shift in three steps. Cash is not counted here: the drawer is computed
// from the starting cash entered when the shift began, plus cash taken, minus
// cash refunded.
//   1. Cut    — the percentage FoodPanda and Grab keep of their gross, which
//               the report deducts. Prefilled with what was entered last time.
//   2. Review — the report exactly as it will print. Cancel goes back; nothing
//               has closed.
//   3. Closed — the shift is saved first, then printed. A printer problem loses
//               nothing: Print again is right there, and any closed shift can be
//               reprinted later from Transactions > Shift reports.

interface EndShiftModalProps {
    isOpen: boolean
    onClose: () => void
    onShiftEnded: () => void
}

const money = (n: number | null | undefined) => `₱${(n ?? 0).toFixed(2)}`

export function EndShiftModal({ isOpen, onClose, onShiftEnded }: EndShiftModalProps) {
    // All state lives in EndShiftFlow, which mounts fresh each time the modal
    // opens, so nothing needs resetting by hand.
    return (
        <AnimatePresence>
            {isOpen && <EndShiftFlow key="end-shift-flow" onClose={onClose} onShiftEnded={onShiftEnded} />}
        </AnimatePresence>
    )
}

type Step = 'commission' | 'review' | 'done'

const clampPct = (raw: string) => Math.min(100, Math.max(0, parseFloat(raw) || 0))

function EndShiftFlow({ onClose, onShiftEnded }: Omit<EndShiftModalProps, 'isOpen'>) {
    const { branch } = useAuthStore()
    const { currentShift, isEnding, previewSummary, endShift } = useShiftStore()

    const [step, setStep] = useState<Step>('commission')
    const [fpInput, setFpInput] = useState(() => String(rememberedCommission().foodpandaCommissionPct || ''))
    const [grabInput, setGrabInput] = useState(() => String(rememberedCommission().grabCommissionPct || ''))
    const [preview, setPreview] = useState<ShiftSummary | null>(null)
    const [closed, setClosed] = useState<ShiftSummary | null>(null)
    const [printState, setPrintState] = useState<'idle' | 'printing' | 'ok' | 'failed'>('idle')

    const commission: PlatformCommission = useMemo(
        () => ({ foodpandaCommissionPct: clampPct(fpInput), grabCommissionPct: clampPct(grabInput) }),
        [fpInput, grabInput],
    )

    // Live figures for the percentages entered so far.
    useEffect(() => {
        let cancelled = false
        previewSummary(commission).then((p) => { if (!cancelled) setPreview(p) })
        return () => { cancelled = true }
    }, [commission, previewSummary])

    const reportText = useMemo(
        () => (preview && branch ? buildShiftReportText(preview, branch.name) : ''),
        [preview, branch],
    )

    const print = async (summary: ShiftSummary) => {
        if (!branch) return
        setPrintState('printing')
        const ok = await printShiftReport(summary, branch.name)
        setPrintState(ok ? 'ok' : 'failed')
    }

    // Save first, print second — a printer problem must never lose the close.
    const proceed = async () => {
        if (!branch) return
        const summary = await endShift(commission)
        if (!summary) { toast.error('Could not close the shift.'); return }
        setClosed(summary)
        setStep('done')
        await print(summary)
    }

    if (!currentShift && step !== 'done') return null
    const shiftNumber = closed?.shiftNumber ?? currentShift?.shiftNumber
    const totalCommission = (preview?.foodpandaCommission ?? 0) + (preview?.grabCommission ?? 0)

    const commissionRow = (label: string, sales: number | undefined, value: string, setValue: (v: string) => void, cut: number | undefined) => (
        <div className="rounded-xl bg-surface-700 border border-surface-600 px-3 py-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-sm">
                <span className="text-white font-semibold">{label}</span>
                <span className="text-gray-400">sales <span className="text-white font-semibold">{money(sales)}</span></span>
            </div>
            <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 whitespace-nowrap">Cut %</span>
                <div className="relative flex-1">
                    <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={100}
                        step="0.5"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder="0"
                        className="input-field pr-8 text-right"
                        aria-label={`${label} commission percentage`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">%</span>
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap">= <span className="text-red-300 font-semibold">-{money(cut)}</span></span>
            </div>
        </div>
    )

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget && step !== 'done' && !isEnding) onClose() }}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-surface-800 border border-surface-500 rounded-3xl w-full max-w-md shadow-2xl max-h-[92vh] flex flex-col"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-surface-600 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        {step === 'done'
                            ? <Check size={18} className="text-teal-400" />
                            : <ClipboardCheck size={18} className="text-brand-400" />}
                        <h2 className="text-lg font-bold text-white">
                            {step === 'commission' && `End Shift #${shiftNumber}`}
                            {step === 'review' && 'Review shift report'}
                            {step === 'done' && `Shift #${shiftNumber} closed`}
                        </h2>
                    </div>
                    {step !== 'done' && (
                        <button onClick={onClose} disabled={isEnding} className="w-8 h-8 rounded-xl bg-surface-600 flex items-center justify-center hover:bg-surface-500 transition-colors disabled:opacity-40">
                            <X size={14} className="text-gray-400" />
                        </button>
                    )}
                </div>

                {/* Body */}
                <div className="p-5 space-y-4 overflow-y-auto">
                    {step === 'commission' && currentShift && (
                        <>
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
                                    <span>Cash in drawer</span>
                                    <span className="text-teal-400 font-bold">{money(preview?.expectedCash)}</span>
                                </div>
                            </div>

                            <div>
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
                                    FoodPanda &amp; Grab commission
                                </p>
                                <div className="space-y-2">
                                    {commissionRow('FoodPanda', preview?.foodpandaSales, fpInput, setFpInput, preview?.foodpandaCommission)}
                                    {commissionRow('Grab', preview?.grabSales, grabInput, setGrabInput, preview?.grabCommission)}
                                </div>
                            </div>

                            <div className="rounded-xl px-4 py-3 text-sm font-bold flex justify-between bg-teal-500/10 border border-teal-500/30 text-teal-400">
                                <span>Net after commission</span>
                                <span>{money(preview?.netAfterCommission)}</span>
                            </div>
                            {totalCommission > 0 && (
                                <p className="text-[11px] text-gray-500 text-center">
                                    {money(totalCommission)} kept by FoodPanda and Grab, deducted from net sales.
                                </p>
                            )}
                        </>
                    )}

                    {step === 'review' && (
                        <>
                            <p className="text-xs text-gray-400">This is exactly what will print. Check it, then Proceed.</p>
                            <pre className="text-[11px] leading-snug text-gray-100 bg-surface-900 border border-surface-600 rounded-xl p-3 overflow-x-auto font-mono whitespace-pre max-h-[52vh] overflow-y-auto">
                                {reportText}
                            </pre>
                        </>
                    )}

                    {step === 'done' && closed && (
                        <>
                            <div className="rounded-2xl bg-surface-700 border border-surface-600 p-4 space-y-1.5 text-sm">
                                <div className="flex justify-between text-gray-400"><span>Cash in drawer</span><span className="text-white font-semibold">{money(closed.expectedCash)}</span></div>
                                <div className="flex justify-between text-gray-400"><span>Net sales</span><span className="text-white font-semibold">{money(closed.netSales)}</span></div>
                                <div className="flex justify-between text-gray-400"><span>FoodPanda &amp; Grab cut</span><span className="text-red-300 font-semibold">-{money((closed.foodpandaCommission ?? 0) + (closed.grabCommission ?? 0))}</span></div>
                                <div className="h-px bg-surface-600 my-2" />
                                <div className="flex justify-between text-gray-400"><span>Net after commission</span><span className="text-teal-400 font-bold">{money(closed.netAfterCommission)}</span></div>
                            </div>
                            <div className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold ${printState === 'ok' ? 'bg-teal-500/10 border border-teal-500/30 text-teal-400'
                                : printState === 'failed' ? 'bg-red-500/10 border border-red-500/30 text-red-400'
                                    : 'bg-surface-700 border border-surface-600 text-gray-300'}`}>
                                {printState === 'printing' && <><Loader2 size={14} className="animate-spin" /> Printing the shift report…</>}
                                {printState === 'ok' && <><Check size={14} /> Shift report printed.</>}
                                {printState === 'failed' && <><AlertTriangle size={14} /> The report did not print. The shift is saved — tap Print again.</>}
                                {printState === 'idle' && <>Shift saved.</>}
                            </div>
                            <p className="text-[11px] text-gray-500">
                                Need another copy later? Transactions → Shift reports → Reprint.
                            </p>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 pb-5 pt-2 flex gap-2 flex-shrink-0">
                    {step === 'commission' && (
                        <>
                            <button onClick={onClose} className="btn-ghost flex-1 text-sm">Cancel</button>
                            <button onClick={() => setStep('review')} disabled={!preview} className="btn-primary flex-1 text-sm disabled:opacity-50">
                                Review report →
                            </button>
                        </>
                    )}
                    {step === 'review' && (
                        <>
                            <button onClick={() => setStep('commission')} disabled={isEnding} className="btn-ghost flex-1 text-sm disabled:opacity-40">
                                Cancel
                            </button>
                            <button onClick={proceed} disabled={isEnding} className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm disabled:opacity-60">
                                {isEnding ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                                Proceed
                            </button>
                        </>
                    )}
                    {step === 'done' && closed && (
                        <>
                            <button
                                onClick={() => print(closed)}
                                disabled={printState === 'printing'}
                                className="btn-ghost flex-1 flex items-center justify-center gap-2 text-sm disabled:opacity-40"
                            >
                                <Printer size={14} /> Print again
                            </button>
                            <button onClick={onShiftEnded} className="btn-primary flex-1 text-sm">Done</button>
                        </>
                    )}
                </div>
            </motion.div>
        </motion.div>
    )
}
