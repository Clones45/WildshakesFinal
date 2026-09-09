import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

// A month picker drawn by the app, so it looks the same on every device.
//
// The admin Sales Report uses the browser's own <input type="month">. On a
// desktop that is a popover with a year at the top, a 4x3 grid of months, and
// "Clear" / "This month" links. On the tablet, the same input is handed to
// Android, which draws a completely different native dialog. This component
// reproduces the desktop widget so the POS matches the report exactly.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad2 = (n: number) => String(n).padStart(2, '0')

function monthTitle(month: string) {
    const [y, m] = month.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

interface MonthPickerProps {
    /** Selected month, yyyy-mm. */
    value: string
    /** Latest selectable month, yyyy-mm — anything later is greyed out. */
    max: string
    /** Highlight the trigger while the month filter is the one in use. */
    active: boolean
    onChange: (month: string) => void
    /** "Clear" — the caller decides what the list falls back to. */
    onClear: () => void
}

export function MonthPicker({ value, max, active, onChange, onClear }: MonthPickerProps) {
    const [open, setOpen] = useState(false)
    const [year, setYear] = useState(() => Number(value.slice(0, 4)))
    const rootRef = useRef<HTMLDivElement>(null)

    const [maxY, maxM] = max.split('-').map(Number)
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`

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

    const isFuture = (y: number, m: number) => y > maxY || (y === maxY && m > maxM)
    const pick = (month: string) => {
        const [y, m] = month.split('-').map(Number)
        if (isFuture(y, m)) return
        onChange(month)
        setOpen(false)
    }

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                onClick={() => {
                    // Open on the year of whatever is currently selected.
                    if (!open) setYear(Number(value.slice(0, 4)))
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
                {monthTitle(value)}
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        role="dialog"
                        aria-label="Pick a month"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.12 }}
                        className="absolute left-0 top-full mt-1.5 z-50 w-60 rounded-xl bg-surface-700 border border-surface-500 shadow-2xl p-3"
                    >
                        {/* Year */}
                        <div className="flex items-center justify-between mb-2">
                            <button
                                type="button"
                                onClick={() => setYear((y) => y - 1)}
                                aria-label="Previous year"
                                className="w-7 h-7 rounded-lg text-gray-300 hover:bg-surface-600 flex items-center justify-center"
                            >
                                <ChevronLeft size={14} />
                            </button>
                            <span className="text-sm font-bold text-white tracking-wide">{year}</span>
                            <button
                                type="button"
                                onClick={() => setYear((y) => y + 1)}
                                disabled={year >= maxY}
                                aria-label="Next year"
                                className="w-7 h-7 rounded-lg text-gray-300 hover:bg-surface-600 flex items-center justify-center disabled:opacity-30 disabled:hover:bg-transparent"
                            >
                                <ChevronRight size={14} />
                            </button>
                        </div>

                        {/* Months, 4 x 3 like the browser widget */}
                        <div className="grid grid-cols-4 gap-1">
                            {MONTHS.map((name, i) => {
                                const key = `${year}-${pad2(i + 1)}`
                                const selected = key === value
                                const disabled = isFuture(year, i + 1)
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => pick(key)}
                                        disabled={disabled}
                                        className={`h-8 rounded-lg text-xs font-semibold transition-all ${selected
                                            ? 'bg-teal-500 text-white'
                                            : disabled
                                                ? 'text-gray-600 cursor-default'
                                                : 'text-gray-200 hover:bg-surface-600'
                                            }`}
                                    >
                                        {name}
                                    </button>
                                )
                            })}
                        </div>

                        {/* Footer links, as on the browser widget */}
                        <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-surface-600 text-xs font-semibold">
                            <button
                                type="button"
                                onClick={() => { onClear(); setOpen(false) }}
                                className="text-teal-400 hover:text-teal-300"
                            >
                                Clear
                            </button>
                            <button
                                type="button"
                                onClick={() => pick(currentMonth)}
                                className="text-teal-400 hover:text-teal-300"
                            >
                                This month
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
