'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'

// One calendar for picking a single day or a whole month, drawn by the app.
//
// The POS Transactions panel has an identical twin (DatePicker), so managers
// learn the control once. Browser-native date and month inputs draw differently
// on every device — a full calendar on a desktop, an unrelated spinner dialog
// on a tablet — which this avoids entirely.

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

interface SalesDatePickerProps {
  /** Month in view, yyyy-mm. */
  month: string
  /** '' = the whole month; otherwise one day, yyyy-mm-dd. */
  day: string
  /** Today (Manila), yyyy-mm-dd — nothing after it can be picked. */
  today: string
  onPick: (month: string, day: string) => void
}

const navBtn: CSSProperties = {
  width: 28, height: 28, borderRadius: 'var(--radius-sm)', border: 'none', background: 'transparent',
  color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1,
}
const linkBtn: CSSProperties = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  color: 'var(--color-accent)', fontWeight: 600, fontSize: '0.8rem',
}

export default function SalesDatePicker({ month, day, today, onPick }: SalesDatePickerProps) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(month)
  const rootRef = useRef<HTMLDivElement>(null)
  const todayMonth = today.slice(0, 7)

  // Close on a click outside, or Escape.
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
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => {
          // Open on the month currently in use.
          if (!open) setView(month)
          setOpen(o => !o)
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        📅 {day ? dayTitle(day) : `${monthTitle(month)} · Whole month`}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Pick a day or a month"
          style={{
            position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 50, width: 292,
            background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-card)', padding: '0.75rem',
          }}
        >
          {/* Month in view */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <button type="button" style={navBtn} onClick={() => setView(v => shiftMonth(v, -1))} aria-label="Previous month">‹</button>
            <span style={{ color: 'var(--color-text)', fontWeight: 700, fontSize: '0.9rem' }}>{monthTitle(view)}</span>
            <button
              type="button"
              style={{ ...navBtn, opacity: view >= todayMonth ? 0.3 : 1, cursor: view >= todayMonth ? 'default' : 'pointer' }}
              onClick={() => setView(v => shiftMonth(v, 1))}
              disabled={view >= todayMonth}
              aria-label="Next month"
            >›</button>
          </div>

          {/* Weekday headings */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
            {WEEKDAYS.map(w => (
              <div key={w} style={{ textAlign: 'center', fontSize: '0.65rem', fontWeight: 600, color: 'var(--color-text-dim)' }}>{w}</div>
            ))}
          </div>

          {/* Days */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
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
                  style={{
                    height: 34, borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', fontWeight: 600,
                    cursor: disabled ? 'default' : 'pointer',
                    background: selected ? 'var(--color-accent)' : 'transparent',
                    color: selected ? '#0F1A14' : disabled ? 'var(--color-text-dim)' : 'var(--color-text)',
                    border: isToday && !selected ? '1px solid var(--color-accent)' : '1px solid transparent',
                  }}
                >
                  {Number(d.slice(8))}
                </button>
              )
            })}
          </div>

          {/* Footer links */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginTop: '0.6rem', paddingTop: '0.5rem', borderTop: '1px solid var(--color-border)',
          }}>
            <button
              type="button"
              style={{ ...linkBtn, color: !day && view === month ? 'var(--color-text)' : 'var(--color-accent)' }}
              onClick={() => choose(view, '')}
            >
              Whole month
            </button>
            <button type="button" style={linkBtn} onClick={() => choose(todayMonth, today)}>Today</button>
          </div>
        </div>
      )}
    </div>
  )
}
