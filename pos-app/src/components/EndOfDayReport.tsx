import { useEffect, useState } from 'react'
import { CalendarDays, Printer, Loader2, Eye, EyeOff, CloudOff } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import { buildDayReportText, printDayReport, type DayReportShift } from '../lib/printer'

// End of Day: one report for a chosen day, covering every shift closed that day.
// A branch where several people share the till ends up with several shift
// reports a day; the owner wants one page. The day's shifts come from the
// server, so a day this tablet never saw (or no longer holds) still prints,
// with the tablet's own copies as the fallback when it is offline. Lives at the
// top of the manager-only Shift reports screen.

interface EndOfDayReportProps {
    branchId: string
    branchName: string
}

/** yyyy-mm-dd in Manila for a Date (default now). */
const manilaDay = (d: Date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(d)
const shiftDay = (ymd: string, by: number) => {
    const [y, m, d] = ymd.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d + by)).toISOString().slice(0, 10)
}
const money = (n: number | null | undefined) => `₱${(n ?? 0).toFixed(2)}`

type ServerShift = {
    local_ref: string; shift_number: number; cashier_name: string; cashier_role: string
    opened_at: string; closed_at: string | null; starting_cash: number; expected_cash: number | null
    gross_sales: number | null; discounts: number | null; refunds: number | null; net_sales: number | null
    cash_sales: number | null; gcash_sales: number | null; maya_sales: number | null; bank_transfer_sales: number | null
    foodpanda_sales: number | null; grab_sales: number | null
    foodpanda_commission_pct: number | null; grab_commission_pct: number | null
    foodpanda_commission: number | null; grab_commission: number | null; net_after_commission: number | null
    paid_in: number | null; paid_out: number | null
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v))

function fromServer(r: ServerShift): DayReportShift {
    return {
        localRef: r.local_ref, shiftNumber: r.shift_number, cashierName: r.cashier_name, cashierRole: r.cashier_role,
        openedAt: r.opened_at, closedAt: r.closed_at ?? r.opened_at,
        startingCash: num(r.starting_cash), expectedCash: num(r.expected_cash),
        grossSales: num(r.gross_sales), discounts: num(r.discounts), refunds: num(r.refunds), netSales: num(r.net_sales),
        cashSales: num(r.cash_sales), gcashSales: num(r.gcash_sales), mayaSales: num(r.maya_sales), bankTransferSales: num(r.bank_transfer_sales),
        foodpandaSales: num(r.foodpanda_sales), grabSales: num(r.grab_sales),
        foodpandaCommissionPct: num(r.foodpanda_commission_pct), grabCommissionPct: num(r.grab_commission_pct),
        foodpandaCommission: num(r.foodpanda_commission), grabCommission: num(r.grab_commission),
        netAfterCommission: r.net_after_commission === null ? num(r.net_sales) : num(r.net_after_commission),
        paidIn: num(r.paid_in), paidOut: num(r.paid_out),
    }
}

/** Every shift closed on a Manila day: the server's rows, plus any of this tablet's not yet synced. */
async function loadDay(branchId: string, day: string): Promise<{ shifts: DayReportShift[]; fromServer: boolean }> {
    const start = `${day}T00:00:00+08:00`
    const end = `${shiftDay(day, 1)}T00:00:00+08:00`

    const local = await db.shifts
        .where('branchId').equals(branchId)
        .filter(s => s.status === 'closed' && s.openedAt >= new Date(start).toISOString() && s.openedAt < new Date(end).toISOString())
        .toArray()
    const localRows: DayReportShift[] = local.map(s => ({
        localRef: s.localRef, shiftNumber: s.shiftNumber, cashierName: s.cashierName, cashierRole: s.cashierRole,
        openedAt: s.openedAt, closedAt: s.closedAt ?? s.openedAt,
        startingCash: s.startingCash, expectedCash: s.expectedCash ?? 0,
        grossSales: s.grossSales ?? 0, discounts: s.discounts ?? 0, refunds: s.refunds ?? 0, netSales: s.netSales ?? 0,
        cashSales: s.cashSales ?? 0, gcashSales: s.gcashSales ?? 0, mayaSales: s.mayaSales ?? 0, bankTransferSales: s.bankTransferSales ?? 0,
        foodpandaSales: s.foodpandaSales ?? 0, grabSales: s.grabSales ?? 0,
        foodpandaCommissionPct: s.foodpandaCommissionPct ?? 0, grabCommissionPct: s.grabCommissionPct ?? 0,
        foodpandaCommission: s.foodpandaCommission ?? 0, grabCommission: s.grabCommission ?? 0,
        netAfterCommission: s.netAfterCommission ?? s.netSales ?? 0,
        paidIn: s.paidIn, paidOut: s.paidOut, coveredBy: s.coveredBy, closedBy: s.closedBy,
    }))

    let serverRows: DayReportShift[] | null = null
    if (navigator.onLine) {
        try {
            const { data, error } = await supabase
                .from('shifts')
                .select('local_ref, shift_number, cashier_name, cashier_role, opened_at, closed_at, starting_cash, expected_cash, gross_sales, discounts, refunds, net_sales, cash_sales, gcash_sales, maya_sales, bank_transfer_sales, foodpanda_sales, grab_sales, foodpanda_commission_pct, grab_commission_pct, foodpanda_commission, grab_commission, net_after_commission, paid_in, paid_out')
                .eq('branch_id', branchId)
                .eq('status', 'closed')
                .gte('opened_at', start)
                .lt('opened_at', end)
                .order('opened_at')
            if (!error && data) serverRows = (data as unknown as ServerShift[]).map(fromServer)
        } catch {
            // offline or the request failed — the tablet's own copies stand
        }
    }

    const byRef = new Map<string, DayReportShift>()
    for (const r of serverRows ?? []) byRef.set(r.localRef, r)
    for (const r of localRows) {
        // The tablet's copy carries who else worked it and how it closed; the server's figures stand.
        const existing = byRef.get(r.localRef)
        byRef.set(r.localRef, existing ? { ...existing, coveredBy: r.coveredBy, closedBy: r.closedBy } : r)
    }
    const shifts = [...byRef.values()].sort((a, b) => a.openedAt.localeCompare(b.openedAt))
    return { shifts, fromServer: serverRows !== null }
}

export function EndOfDayReport({ branchId, branchName }: EndOfDayReportProps) {
    const today = manilaDay()
    const [day, setDay] = useState(shiftDay(today, -1))
    const [loading, setLoading] = useState(false)
    const [printing, setPrinting] = useState(false)
    const [showText, setShowText] = useState(false)
    const [result, setResult] = useState<{ day: string; shifts: DayReportShift[]; fromServer: boolean } | null>(null)

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        loadDay(branchId, day)
            .then(r => { if (!cancelled) setResult({ day, ...r }) })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [branchId, day])

    const shifts = result?.day === day ? result.shifts : []
    const text = shifts.length > 0 ? buildDayReportText(day, shifts, branchName) : ''
    const netSales = shifts.reduce((s, x) => s + x.netSales, 0)
    const netAfter = shifts.reduce((s, x) => s + x.netAfterCommission, 0)
    const cash = shifts.reduce((s, x) => s + x.cashSales, 0)

    const print = async () => {
        if (!text) return
        setPrinting(true)
        try {
            const ok = await printDayReport(text)
            if (ok) toast.success(`End of day report for ${dayLabel(day)} printed`)
        } finally {
            setPrinting(false)
        }
    }

    const dayLabel = (ymd: string) =>
        new Date(`${ymd}T00:00:00+08:00`).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric' })

    const pill = (label: string, value: string, active: boolean) => (
        <button
            key={value}
            onClick={() => setDay(value)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${active ? 'bg-brand-500 border-brand-400 text-white' : 'bg-surface-700 border-surface-600 text-gray-300 hover:bg-surface-600'}`}
        >
            {label}
        </button>
    )

    return (
        <div className="rounded-2xl border border-brand-500/30 bg-brand-500/5 p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <p className="text-white font-bold flex items-center gap-2"><CalendarDays size={16} className="text-brand-300" /> End of Day report</p>
                    <p className="text-gray-400 text-xs mt-0.5">One printout for the whole day: every shift closed that day, added up.</p>
                </div>
                {result && !result.fromServer && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold whitespace-nowrap">
                        <CloudOff size={10} /> Offline: this tablet&apos;s copies only
                    </span>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
                {pill('Yesterday', shiftDay(today, -1), day === shiftDay(today, -1))}
                {pill('Today', today, day === today)}
                <input
                    type="date"
                    value={day}
                    max={today}
                    onChange={e => { if (e.target.value && e.target.value <= today) setDay(e.target.value) }}
                    className="input-field py-1.5 text-xs w-auto"
                    aria-label="Pick a day"
                />
            </div>

            {loading ? (
                <div className="flex items-center gap-2 text-gray-400 text-sm py-2"><Loader2 size={16} className="animate-spin text-brand-400" /> Loading {dayLabel(day)}…</div>
            ) : shifts.length === 0 ? (
                <p className="text-gray-400 text-sm py-2">No closed shifts on {dayLabel(day)}{day === today ? ' yet. A shift still open is not included until it is ended.' : '.'}</p>
            ) : (
                <>
                    <div className="grid grid-cols-4 gap-2 text-center">
                        <div className="rounded-xl bg-surface-800 py-2">
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Shifts</p>
                            <p className="text-white text-sm font-bold">{shifts.length}</p>
                        </div>
                        <div className="rounded-xl bg-surface-800 py-2">
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Net sales</p>
                            <p className="text-white text-sm font-bold">{money(netSales)}</p>
                        </div>
                        <div className="rounded-xl bg-surface-800 py-2">
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Cash taken</p>
                            <p className="text-white text-sm font-bold">{money(cash)}</p>
                        </div>
                        <div className="rounded-xl bg-surface-800 py-2">
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">After platform cut</p>
                            <p className="text-white text-sm font-bold">{money(netAfter)}</p>
                        </div>
                    </div>
                    {day === today && <p className="text-amber-400/90 text-xs">Today so far: a shift still open is not included until it is ended.</p>}

                    {showText && (
                        <pre className="text-[11px] leading-snug text-gray-200 bg-surface-900 rounded-xl p-3 overflow-x-auto font-mono whitespace-pre">{text}</pre>
                    )}

                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowText(v => !v)}
                            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-surface-600 hover:bg-surface-500 border border-surface-500 text-gray-200 text-xs font-bold transition-all"
                        >
                            {showText ? <EyeOff size={13} /> : <Eye size={13} />}
                            {showText ? 'Hide' : 'View'}
                        </button>
                        <button
                            onClick={print}
                            disabled={printing}
                            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-brand-500 hover:bg-brand-400 text-white text-xs font-bold transition-all disabled:opacity-50"
                        >
                            {printing ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />}
                            {printing ? 'Printing…' : `Print ${dayLabel(day)}`}
                        </button>
                    </div>
                </>
            )}
        </div>
    )
}
