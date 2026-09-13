import { useEffect, useState } from 'react'
import { ClipboardCheck, Printer, Loader2, Eye, EyeOff, CloudOff } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { db, type LocalShift } from '../lib/db'
import { summaryForReprint } from '../store/shiftStore'
import { buildShiftReportText, printShiftReport } from '../lib/printer'

// Closed shifts on this tablet, newest first, each reprintable. Lives inside the
// manager-only Transactions screen. A reprint is marked REPRINT on paper so it
// can't be passed off as the original.

interface ShiftReportsPanelProps {
    branchId: string
    branchName: string
}

const money = (n: number | null | undefined) => `₱${(n ?? 0).toFixed(2)}`
const when = (iso?: string) =>
    iso ? new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

export function ShiftReportsPanel({ branchId, branchName }: ShiftReportsPanelProps) {
    const [shifts, setShifts] = useState<LocalShift[] | null>(null)
    const [printing, setPrinting] = useState<string | null>(null)
    const [openPreview, setOpenPreview] = useState<string | null>(null)
    const [previewText, setPreviewText] = useState<Record<string, string>>({})

    useEffect(() => {
        let cancelled = false
        db.shifts
            .where('branchId').equals(branchId)
            .filter((s) => s.status === 'closed')
            .toArray()
            .then((rows) => {
                if (cancelled) return
                rows.sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''))
                setShifts(rows.slice(0, 60))
            })
        return () => { cancelled = true }
    }, [branchId])

    const reprint = async (shift: LocalShift) => {
        setPrinting(shift.localRef)
        try {
            const summary = await summaryForReprint(shift)
            const ok = await printShiftReport(summary, branchName, { reprint: true })
            if (ok) toast.success(`Shift #${shift.shiftNumber} report reprinted`)
        } finally {
            setPrinting(null)
        }
    }

    const togglePreview = async (shift: LocalShift) => {
        if (openPreview === shift.localRef) { setOpenPreview(null); return }
        if (!previewText[shift.localRef]) {
            const summary = await summaryForReprint(shift)
            const text = buildShiftReportText(summary, branchName, { reprint: true })
            setPreviewText((p) => ({ ...p, [shift.localRef]: text }))
        }
        setOpenPreview(shift.localRef)
    }

    if (shifts === null) {
        return (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-gray-500">
                <Loader2 size={28} className="animate-spin text-brand-400" />
                <p className="text-sm">Loading shift reports…</p>
            </div>
        )
    }

    if (shifts.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-gray-600">
                <ClipboardCheck size={36} className="opacity-40" />
                <p className="text-sm">No closed shifts on this tablet yet</p>
            </div>
        )
    }

    return (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {shifts.map((s) => {
                const cut = (s.foodpandaCommission ?? 0) + (s.grabCommission ?? 0)
                const isOpen = openPreview === s.localRef
                return (
                    <div key={s.localRef} className="rounded-2xl border border-surface-600 bg-surface-700 p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <p className="text-white font-bold">
                                    Shift #{s.shiftNumber}
                                    <span className="text-gray-400 font-normal"> · {s.cashierName} ({s.cashierRole})</span>
                                </p>
                                <p className="text-gray-500 text-xs mt-0.5">{when(s.openedAt)} → {when(s.closedAt)}</p>
                            </div>
                            {s.syncStatus !== 'synced' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold whitespace-nowrap">
                                    <CloudOff size={10} /> Not yet synced
                                </span>
                            )}
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="rounded-xl bg-surface-800 py-2">
                                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Cash in drawer</p>
                                <p className="text-white text-sm font-bold">{money(s.expectedCash)}</p>
                            </div>
                            <div className="rounded-xl bg-surface-800 py-2">
                                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Net sales</p>
                                <p className="text-white text-sm font-bold">{money(s.netSales)}</p>
                            </div>
                            <div className="rounded-xl bg-surface-800 py-2">
                                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Platform cut</p>
                                <p className={`text-sm font-bold ${cut > 0 ? 'text-red-300' : 'text-gray-400'}`}>{cut > 0 ? '-' : ''}{money(cut)}</p>
                            </div>
                        </div>

                        {isOpen && previewText[s.localRef] && (
                            <pre className="text-[11px] leading-snug text-gray-200 bg-surface-900 rounded-xl p-3 overflow-x-auto font-mono whitespace-pre">
                                {previewText[s.localRef]}
                            </pre>
                        )}

                        <div className="flex gap-2">
                            <button
                                onClick={() => togglePreview(s)}
                                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-surface-600 hover:bg-surface-500 border border-surface-500 text-gray-200 text-xs font-bold transition-all"
                            >
                                {isOpen ? <EyeOff size={13} /> : <Eye size={13} />}
                                {isOpen ? 'Hide' : 'View'}
                            </button>
                            <button
                                onClick={() => reprint(s)}
                                disabled={printing === s.localRef}
                                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-brand-500 hover:bg-brand-400 text-white text-xs font-bold transition-all disabled:opacity-50"
                            >
                                {printing === s.localRef ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />}
                                {printing === s.localRef ? 'Printing…' : 'Reprint'}
                            </button>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
