import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

// One calendar for picking a single day or a whole month, drawn by the app.
//
// It is the same control as the Franchiser Portal's Sales Report (which has an
// identical twin, SalesDatePicker) so managers learn it once. Browser-native
// date inputs draw differently on every device — a full calendar on a desktop,
// an unrelated spinner dialog on the tablet — which this avoids entirely.

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const pad2 = (n: number) => String(n).padStart(2, '0')

const monthTitle = (month: string) => {
    const [y, m] = month.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
const dayTitle = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}
const shiftMonth = (month: string, by: number) => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1 + by, 1)
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

interface DatePickerProps {
    /** Month in view, yyyy-mm. */
    month: string
    /** '' = the whole month; otherwise one day, yyyy-mm-dd. */
    day: string
    /** Today, yyyy-mm-dd — nothing after it can be picked. */
    today: string
    /** Highlight the trigger while this picker's range is the one in use. */
    active: boolean
    onPick: (month: string, day: string) => void
}

export function DatePicker({ month, day, today, active, onPick }: DatePickerProps) {
    const [open, setOpen] = useState(false)
    const [view, setView] = useState(month)
    const rootRef = useRef<HTMLDivElement>(null)
    const todayMonth = today.slice(0, 7)

    // Close on a tap outside, or Escape.
    useEffect(() => {
        if (!open) return
        const onPointerDown = (e: MouseEvent | TouchEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
        }
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
        document.addEventListener('mousedown', onPointerDown)
        document.addEventListener('touchstart', onPointerDown)
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('mousedown', onPointerDown)
            document.removeEventListener('touchstart', onPointerDown)
            document.removeEventListener('keydown', onKey)
        }
    }, [open])

    const [vy, vm] = view.split('-').map(Number)
    const firstWeekday = new Date(vy, vm - 1, 1).getDay()
    const daysInView = new Date(vy, vm, 0).getDate()
    const cells: (string | null)[] = [
        ...Array<null>(firstWeekday).fill(null),
        ...Array.from({ length: daysInView }, (_, i) => `${view}-${pad2(i + 1)}`),
    ]
    while (cells.length % 7 !== 0) cells.push(null)

    const choose = (m: string, d: string) => { onPick(m, d); setOpen(false) }

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                onClick={() => {
                    // Open on the month currently in use.
                    if (!open) setView(month)
                    setOpen((o) => !o)
                }}
                aria-haspopup="dialog"
                aria-expanded={open}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${active
                    ? 'bg-teal-500 border-teal-500 text-white'
                    : 'border-surface-500 text-gray-400 hover:border-surface-400'
                    }`}
            >
                <CalendarDays size={12} />
                {day ? dayTitle(day) : `${monthTitle(month)} · Whole month`}
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        role="dialog"
                        aria-label="Pick a day or a month"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.12 }}
                        className="absolute left-0 top-full mt-1.5 z-50 w-64 rounded-xl bg-surface-700 border border-surface-500 shadow-2xl p-3"
                    >
                        {/* Month in view */}
                        <div className="flex items-center justify-between mb-2">
                            <button
                                type="button"
                                onClick={() => setView((v) => shiftMonth(v, -1))}
                                aria-label="Previous month"
                                className="w-7 h-7 rounded-lg text-gray-300 hover:bg-surface-600 flex items-center justify-center"
                            >
                                <ChevronLeft size={14} />
                            </button>
                            <span className="text-sm font-bold text-white">{monthTitle(view)}</span>
                            <button
                                type="button"
                                onClick={() => setView((v) => shiftMonth(v, 1))}
                                disabled={view >= todayMonth}
                                aria-label="Next month"
                                className="w-7 h-7 rounded-lg text-gray-300 hover:bg-surface-600 flex items-center justify-center disabled:opacity-30 disabled:hover:bg-transparent"
                            >
                                <ChevronRight size={14} />
                            </button>
                        </div>

                        {/* Weekday headings */}
                        <div className="grid grid-cols-7 mb-1">
                            {WEEKDAYS.map((w) => (
                                <div key={w} className="text-center text-[10px] font-semibold text-gray-500">{w}</div>
                            ))}
                        </div>

                        {/* Days */}
                        <div className="grid grid-cols-7 gap-0.5">
                            {cells.map((d, i) => {
                                if (!d) return <div key={`blank-${i}`} />
                                const selected = d === day
                                const isToday = d === today
                                const disabled = d > today
                                return (
                                    <button
                                        key={d}
                                        type="button"
                                        onClick={() => choose(view, d)}
                                        disabled={disabled}
                                        className={`h-8 rounded-lg text-xs font-semibold transition-all ${selected
                                            ? 'bg-teal-500 text-white'
                                            : disabled
                                                ? 'text-gray-600 cursor-default'
                                                : 'text-gray-200 hover:bg-surface-600'
                                            } ${isToday && !selected ? 'ring-1 ring-teal-400/70' : ''}`}
                                    >
                                        {Number(d.slice(8))}
                                    </button>
                                )
                            })}
                        </div>

                        {/* Footer links */}
                        <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-surface-600 text-xs font-semibold">
                            <button
                                type="button"
                                onClick={() => choose(view, '')}
                                className={`hover:text-teal-300 ${!day && view === month ? 'text-white' : 'text-teal-400'}`}
                            >
                                Whole month
                            </button>
                            <button
                                type="button"
                                onClick={() => choose(todayMonth, today)}
                                className="text-teal-400 hover:text-teal-300"
                            >
                                Today
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
