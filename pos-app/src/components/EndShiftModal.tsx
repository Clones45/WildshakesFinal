import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    X, ClipboardCheck, Loader2, Printer, Check, AlertTriangle, ShieldCheck, Minus, Plus,
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useShiftStore, type ShiftSummary } from '../store/shiftStore'
import { useAuthStore } from '../store/authStore'
import { buildShiftReportText, printShiftReport } from '../lib/printer'
import { ManagerPinModal } from './ManagerPinModal'

// End Shift in three steps:
//   1. Count  — tap how many of each note and coin (or type a total). The float
//               is included on purpose; forgetting it was the usual cause of a
//               drawer "short by exactly P3,000".
//   2. Review — the report exactly as it will print, with the difference. A
//               drawer that doesn't match needs a written reason; P100 or more
//               needs a manager's PIN. Cancel goes back; nothing has closed.
//   3. Closed — the shift is saved first, then printed. A printer problem loses
//               nothing: Print again is right there, and any closed shift can be
//               reprinted later from Transactions > Shift reports.

interface EndShiftModalProps {
    isOpen: boolean
    onClose: () => void
    onShiftEnded: () => void
}

const money = (n: number | null | undefined) => `₱${(n ?? 0).toFixed(2)}`

// Philippine notes and coins, largest first. Loose change is typed as an amount.
const DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 1] as const
// A difference this size or more needs a manager to sign off before the shift closes.
const MANAGER_PIN_THRESHOLD = 100

export function EndShiftModal({ isOpen, onClose, onShiftEnded }: EndShiftModalProps) {
    // All state lives in EndShiftFlow, which mounts fresh each time the modal
    // opens, so nothing needs resetting by hand.
    return (
        <AnimatePresence>
            {isOpen && <EndShiftFlow key="end-shift-flow" onClose={onClose} onShiftEnded={onShiftEnded} />}
        </AnimatePresence>
    )
}

type Step = 'count' | 'review' | 'done'

function EndShiftFlow({ onClose, onShiftEnded }: Omit<EndShiftModalProps, 'isOpen'>) {
    const { branch, user } = useAuthStore()
    const { currentShift, isEnding, previewSummary, endShift } = useShiftStore()

    const [step, setStep] = useState<Step>('count')
    const [countMode, setCountMode] = useState<'denominations' | 'total'>('denominations')
    const [counts, setCounts] = useState<Record<string, number>>({})
    const [otherInput, setOtherInput] = useState('')
    const [totalInput, setTotalInput] = useState('')
    const [note, setNote] = useState('')
    const [preview, setPreview] = useState<ShiftSummary | null>(null)
    const [closed, setClosed] = useState<ShiftSummary | null>(null)
    const [printState, setPrintState] = useState<'idle' | 'printing' | 'ok' | 'failed'>('idle')
    const [showPin, setShowPin] = useState(false)

    const otherAmount = Math.max(0, parseFloat(otherInput) || 0)
    const denomTotal = DENOMINATIONS.reduce((s, d) => s + d * (counts[String(d)] ?? 0), 0) + otherAmount
    const actualCash = countMode === 'denominations' ? denomTotal : Math.max(0, parseFloat(totalInput) || 0)
    const hasCount = countMode === 'denominations'
        ? DENOMINATIONS.some((d) => (counts[String(d)] ?? 0) > 0) || otherAmount > 0
        : totalInput.trim() !== ''

    // What gets stored and printed as the count — only when the counter was used.
    const denominations = useMemo(() => {
        if (countMode !== 'denominations') return undefined
        const out: Record<string, number> = {}
        for (const d of DENOMINATIONS) if ((counts[String(d)] ?? 0) > 0) out[String(d)] = counts[String(d)]
        if (otherAmount > 0) out.other = otherAmount
        return out
    }, [countMode, counts, otherAmount])

    // Live figures for whatever has been counted so far.
    useEffect(() => {
        let cancelled = false
        previewSummary(actualCash).then((p) => { if (!cancelled) setPreview(p) })
        return () => { cancelled = true }
    }, [actualCash, previewSummary])

    const difference = preview?.cashDifference ?? 0
    const balanced = Math.abs(difference) < 0.01
    const isManager = user?.role === 'manager' || user?.role === 'investor'
    const needsNote = !balanced
    const needsPin = !balanced && Math.abs(difference) >= MANAGER_PIN_THRESHOLD && !isManager

    const reportText = useMemo(() => {
        if (!preview || !branch) return ''
        return buildShiftReportText(
            { ...preview, differenceNote: note.trim() || undefined, denominations },
            branch.name,
        )
    }, [preview, branch, note, denominations])

    const setCount = (d: number, next: number) =>
        setCounts((c) => ({ ...c, [String(d)]: Math.max(0, Math.min(9999, Math.floor(next) || 0)) }))

    const goReview = () => {
        if (!hasCount) { toast.error('Count the drawer first.'); return }
        setStep('review')
    }

    const print = async (summary: ShiftSummary) => {
        if (!branch) return
        setPrintState('printing')
        const ok = await printShiftReport(summary, branch.name)
        setPrintState(ok ? 'ok' : 'failed')
    }

    // Save first, print second — a printer problem must never lose the close.
    const finishClose = async () => {
        if (!branch) return
        const summary = await endShift(actualCash, { differenceNote: note, denominations })
        if (!summary) return
        setClosed(summary)
        setStep('done')
        await print(summary)
    }

    const proceed = () => {
        if (needsNote && !note.trim()) { toast.error('Enter the reason for the difference.'); return }
        if (needsPin) { setShowPin(true); return }
        void finishClose()
    }

    if (!currentShift && step !== 'done') return null
    const shiftNumber = closed?.shiftNumber ?? currentShift?.shiftNumber

    const differenceBanner = (
        <div className={`rounded-xl px-4 py-3 text-sm font-bold flex justify-between ${balanced
            ? 'bg-teal-500/10 border border-teal-500/30 text-teal-400'
            : difference > 0
                ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
                : 'bg-red-500/10 border border-red-500/30 text-red-400'
            }`}>
            <span>{balanced ? 'Drawer matches' : difference > 0 ? 'Drawer is over' : 'Drawer is short'}</span>
            <span>{difference >= 0 ? '+' : ''}{money(difference)}</span>
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
                            {step === 'count' && `End Shift #${shiftNumber}`}
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
                    {step === 'count' && currentShift && (
                        <>
                            <div className="rounded-2xl bg-surface-700 border border-surface-600 p-4 space-y-1.5 text-sm">
                                <div className="flex justify-between text-gray-400">
                                    <span>Starting cash (float)</span>
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

                            <p className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                                Count <strong>everything</strong> in the drawer, including the {money(currentShift.startingCash)} starting cash.
                            </p>

                            {/* How to count */}
                            <div className="flex gap-1.5">
                                {([['denominations', 'Count notes & coins'], ['total', 'Type a total']] as const).map(([m, label]) => (
                                    <button
                                        key={m}
                                        onClick={() => setCountMode(m)}
                                        className={`flex-1 py-1.5 rounded-full text-xs font-semibold border transition-all ${countMode === m
                                            ? 'bg-brand-500 border-brand-500 text-white'
                                            : 'border-surface-500 text-gray-400 hover:border-surface-400'
                                            }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>

                            {countMode === 'denominations' ? (
                                <div className="space-y-2">
                                    <div className="grid grid-cols-2 gap-2">
                                        {DENOMINATIONS.map((d) => {
                                            const n = counts[String(d)] ?? 0
                                            return (
                                                <div key={d} className="flex items-center gap-1.5 rounded-xl bg-surface-700 border border-surface-600 px-2 py-1.5">
                                                    <span className="w-12 text-xs font-bold text-gray-300">₱{d}</span>
                                                    <button onClick={() => setCount(d, n - 1)} className="w-7 h-7 rounded-lg bg-surface-600 hover:bg-surface-500 text-gray-200 flex items-center justify-center" aria-label={`Fewer ₱${d}`}>
                                                        <Minus size={12} />
                                                    </button>
                                                    <input
                                                        type="number"
                                                        inputMode="numeric"
                                                        min={0}
                                                        value={n === 0 ? '' : n}
                                                        placeholder="0"
                                                        onChange={(e) => setCount(d, Number(e.target.value))}
                                                        className="w-full min-w-0 bg-transparent text-center text-white font-bold outline-none text-sm"
                                                        aria-label={`How many ₱${d}`}
                                                    />
                                                    <button onClick={() => setCount(d, n + 1)} className="w-7 h-7 rounded-lg bg-surface-600 hover:bg-surface-500 text-gray-200 flex items-center justify-center" aria-label={`More ₱${d}`}>
                                                        <Plus size={12} />
                                                    </button>
                                                </div>
                                            )
                                        })}
                                    </div>
                                    <div className="flex items-center gap-2 rounded-xl bg-surface-700 border border-surface-600 px-3 py-1.5">
                                        <span className="text-xs font-bold text-gray-300 whitespace-nowrap">Loose change</span>
                                        <span className="text-gray-500 font-bold">₱</span>
                                        <input
                                            type="number"
                                            inputMode="decimal"
                                            min={0}
                                            step="0.25"
                                            value={otherInput}
                                            onChange={(e) => setOtherInput(e.target.value)}
                                            placeholder="0.00"
                                            className="w-full min-w-0 bg-transparent text-right text-white font-bold outline-none text-sm"
                                            aria-label="Loose change amount"
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Total cash in drawer</p>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₱</span>
                                        <input
                                            type="number"
                                            inputMode="decimal"
                                            min={0}
                                            value={totalInput}
                                            onChange={(e) => setTotalInput(e.target.value)}
                                            placeholder="0.00"
                                            className="input-field pl-7"
                                            autoFocus
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-between items-center text-sm px-1">
                                <span className="text-gray-400">Counted</span>
                                <span className="text-white font-bold text-base">{money(actualCash)}</span>
                            </div>
                            {hasCount && preview && differenceBanner}
                        </>
                    )}

                    {step === 'review' && (
                        <>
                            <p className="text-xs text-gray-400">This is exactly what will print. Check it, then Proceed.</p>
                            <pre className="text-[11px] leading-snug text-gray-100 bg-surface-900 border border-surface-600 rounded-xl p-3 overflow-x-auto font-mono whitespace-pre max-h-[38vh] overflow-y-auto">
                                {reportText}
                            </pre>
                            {differenceBanner}
                            {needsNote && (
                                <div>
                                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                                        Why is the drawer {difference > 0 ? 'over' : 'short'}? <span className="text-red-400">*</span>
                                    </p>
                                    <textarea
                                        value={note}
                                        onChange={(e) => setNote(e.target.value.slice(0, 200))}
                                        rows={2}
                                        placeholder="e.g. Gave change from own pocket earlier; petty cash for ice not recorded"
                                        className="input-field text-sm resize-none"
                                    />
                                    <p className="text-[11px] text-gray-500 mt-1">Printed on the report and kept with the shift.</p>
                                </div>
                            )}
                            {needsPin && (
                                <p className="flex items-center gap-2 text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                                    <ShieldCheck size={14} className="flex-shrink-0" />
                                    A difference of {money(MANAGER_PIN_THRESHOLD)} or more needs a manager's PIN to close.
                                </p>
                            )}
                        </>
                    )}

                    {step === 'done' && closed && (
                        <>
                            <div className="rounded-2xl bg-surface-700 border border-surface-600 p-4 space-y-1.5 text-sm">
                                <div className="flex justify-between text-gray-400"><span>Expected cash</span><span className="text-white font-semibold">{money(closed.expectedCash)}</span></div>
                                <div className="flex justify-between text-gray-400"><span>Counted</span><span className="text-white font-semibold">{money(closed.actualCash)}</span></div>
                                <div className="flex justify-between text-gray-400"><span>Difference</span>
                                    <span className={`font-bold ${Math.abs(closed.cashDifference ?? 0) < 0.01 ? 'text-teal-400' : (closed.cashDifference ?? 0) > 0 ? 'text-amber-400' : 'text-red-400'}`}>
                                        {(closed.cashDifference ?? 0) >= 0 ? '+' : ''}{money(closed.cashDifference)}
                                    </span>
                                </div>
                                <div className="h-px bg-surface-600 my-2" />
                                <div className="flex justify-between text-gray-400"><span>Net sales</span><span className="text-white font-semibold">{money(closed.netSales)}</span></div>
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
                    {step === 'count' && (
                        <>
                            <button onClick={onClose} className="btn-ghost flex-1 text-sm">Cancel</button>
                            <button onClick={goReview} disabled={!hasCount} className="btn-primary flex-1 text-sm disabled:opacity-50">
                                Review report →
                            </button>
                        </>
                    )}
                    {step === 'review' && (
                        <>
                            <button onClick={() => setStep('count')} disabled={isEnding} className="btn-ghost flex-1 text-sm disabled:opacity-40">
                                Cancel
                            </button>
                            <button onClick={proceed} disabled={isEnding} className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm disabled:opacity-60">
                                {isEnding ? <Loader2 size={14} className="animate-spin" /> : needsPin ? <ShieldCheck size={14} /> : <Printer size={14} />}
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

            <ManagerPinModal
                isOpen={showPin}
                title="Manager approval — drawer difference"
                onSuccess={() => { setShowPin(false); void finishClose() }}
                onClose={() => setShowPin(false)}
            />
        </motion.div>
    )
}
