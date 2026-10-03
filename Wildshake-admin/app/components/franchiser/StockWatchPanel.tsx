import Link from 'next/link'
import { COUNT_LOOKBACK_DAYS, COVER_DAYS, SOON_DAYS, fmtDays, fmtQty, type AlertLevel, type StockAlert, type StockWatch } from '@/lib/inventory/stockWatch'

/**
 * Dashboard panel: what the branch needs to restock, most urgent first, and
 * which items need a fresh count before anything can be said about them.
 * Pure markup over a StockWatch; the page computes the numbers.
 */

const LEVEL: Record<AlertLevel, { label: string; icon: string; badge: string; bar: string }> = {
  out:     { label: 'Out',         icon: '🔴', badge: 'badge-danger',  bar: 'low'  },
  low:     { label: 'Low',         icon: '⚠️', badge: 'badge-warning', bar: 'warn' },
  soon:    { label: 'Running out', icon: '⏳', badge: 'badge-muted',   bar: 'good' },
  recount: { label: 'Recount',     icon: '🧮', badge: 'badge-muted',   bar: 'good' },
}
const MAX_ROWS = 10
const MAX_RECOUNT_CHIPS = 12

const dayLabel = (ymd: string) =>
  new Date(`${ymd}T00:00:00+08:00`).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' })

const muted: React.CSSProperties = { fontSize: '0.72rem', color: 'var(--color-text-muted)' }

export default function StockWatchPanel({ watches, inventoryHref }: {
  watches: { branchName: string; watch: StockWatch }[]
  inventoryHref: string
}) {
  const multi = watches.length > 1
  return (
    <>
      {watches.map(({ branchName, watch }) => (
        <StockWatchCard key={branchName} title={multi ? `Stock Watch — ${branchName}` : 'Stock Watch'} watch={watch} inventoryHref={inventoryHref} />
      ))}
    </>
  )
}

function StockWatchCard({ title, watch, inventoryHref }: { title: string; watch: StockWatch; inventoryHref: string }) {
  const judged = watch.counted + watch.fromEarlier
  const actionable = watch.alerts.filter(a => a.level !== 'recount')
  const recount = watch.alerts.filter(a => a.level === 'recount')
  const rows = actionable.slice(0, MAX_ROWS)
  const more = actionable.length - rows.length
  const allGood = judged > 0 && actionable.length === 0 && recount.length === 0

  return (
    <div className="table-wrapper" style={{ marginBottom: '1.5rem' }}>
      <div className="table-header" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
        <p className="table-title">📦 {title}</p>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {watch.out > 0 && <span className="badge badge-danger">{watch.out} out</span>}
          {watch.low > 0 && <span className="badge badge-warning">{watch.low} low</span>}
          {watch.soon > 0 && <span className="badge badge-muted">{watch.soon} running out soon</span>}
          {watch.recount > 0 && <span className="badge badge-muted">{watch.recount} need a recount</span>}
          {allGood && <span className="badge badge-success">All good</span>}
          <Link href={`${inventoryHref}?low=1`} className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>Open inventory →</Link>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', padding: '0.5rem 1rem', fontSize: '0.74rem', color: 'var(--color-text-muted)', background: 'var(--color-surface-2)' }}>
        <span>🧮 Counted today: <strong style={{ color: 'var(--color-text)' }}>{watch.counted} of {watch.total}</strong> items</span>
        {watch.fromEarlier > 0 && <span>🕘 {watch.fromEarlier} estimated from their last count with sales since taken off</span>}
        {watch.unknown > 0 && <span style={{ color: 'var(--color-warning)' }}>❔ {watch.unknown} not counted in the last {COUNT_LOOKBACK_DAYS} days, so they cannot be judged</span>}
        <span>➕ Top-up = back to the minimum, or {COVER_DAYS} days of normal use if that is more</span>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
          {judged === 0 ? (
            <>No counts in the last {COUNT_LOOKBACK_DAYS} days. Fill in the inventory sheet once and this list keeps itself up to date from sales.</>
          ) : recount.length > 0 ? (
            <>Nothing is out or low among the items that can be judged. The ones below need a fresh count first.</>
          ) : (
            <>✅ Everything counted is above its minimum and not running out within {SOON_DAYS} days.</>
          )}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: '24%' }}>Item</th>
                <th style={{ width: '10%' }}>Status</th>
                <th style={{ width: '16%' }}>Left</th>
                <th style={{ width: '12%' }}>Days left</th>
                <th style={{ width: '10%' }}>Top-up</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(a => <AlertRow key={a.itemId} a={a} inventoryHref={inventoryHref} />)}
            </tbody>
          </table>
        </div>
      )}

      {more > 0 && (
        <div style={{ padding: '0.6rem 1rem', fontSize: '0.78rem', color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border)' }}>
          …and {more} more. <Link href={`${inventoryHref}?low=1`} style={{ color: 'var(--color-accent)' }}>See them all on the inventory page</Link>.
        </div>
      )}

      {recount.length > 0 && <RecountStrip items={recount} inventoryHref={inventoryHref} />}
    </div>
  )
}

/**
 * Items whose estimate says out or low although they kept selling: stock came in
 * without being written down. Ordered by daily use so the ones that matter most
 * get counted first.
 */
function RecountStrip({ items, inventoryHref }: { items: StockAlert[]; inventoryHref: string }) {
  const dates = items.map(a => a.asOf).filter((d): d is string => !!d).sort()
  const when = dates.length === 0 ? '' : dates[0] === dates[dates.length - 1]
    ? `on ${dayLabel(dates[0])}` : `between ${dayLabel(dates[0])} and ${dayLabel(dates[dates.length - 1])}`
  const shown = items.slice(0, MAX_RECOUNT_CHIPS)
  const sheets = [...new Set(items.map(a => a.sheetType))]

  return (
    <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--color-border)', background: 'rgba(212,175,55,0.05)' }}>
      <p style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--color-text)', marginBottom: '0.25rem' }}>
        🧮 Count these first — {items.length} item{items.length === 1 ? '' : 's'} still selling, last counted {when}
      </p>
      <p style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)', lineHeight: 1.45, marginBottom: '0.6rem' }}>
        By the sales since their last count they should be empty, yet they kept selling, so stock came in without being written down.
        Nothing can be said about their real level until they are counted again. The busiest items come first.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
        {shown.map(a => (
          <Link key={a.itemId} href={`${inventoryHref}?sheet=${encodeURIComponent(a.sheetType)}`} title={a.reason}
            className="badge badge-muted" style={{ textDecoration: 'none', fontSize: '0.74rem', padding: '4px 10px' }}>
            {a.name}
            {a.avgDailyUse !== null && a.avgDailyUse > 0 && <span style={{ opacity: 0.7 }}> · {fmtQty(a.avgDailyUse)}{a.unit ? ` ${a.unit}` : ''}/day</span>}
          </Link>
        ))}
        {items.length > shown.length && <span style={muted}>+{items.length - shown.length} more</span>}
        {sheets.length === 1 && (
          <Link href={`${inventoryHref}?sheet=${encodeURIComponent(sheets[0])}`} style={{ ...muted, color: 'var(--color-accent)', marginLeft: 'auto' }}>Open that sheet →</Link>
        )}
      </div>
    </div>
  )
}

function AlertRow({ a, inventoryHref }: { a: StockAlert; inventoryHref: string }) {
  const lv = LEVEL[a.level]
  const u = a.unit ? ` ${a.unit}` : ''
  const pct = a.min && a.min > 0 ? Math.min(100, (a.ending / a.min) * 100) : a.level === 'soon' ? 100 : 0
  const rowBg = a.level === 'out' ? 'rgba(220,53,69,0.06)' : a.level === 'low' ? 'rgba(230,126,34,0.06)' : undefined

  return (
    <tr style={{ background: rowBg }}>
      <td>
        <Link href={`${inventoryHref}?low=1&sheet=${encodeURIComponent(a.sheetType)}`} style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--color-text)', textDecoration: 'none' }}>
          {a.name}
        </Link>
        <div style={muted}>
          {a.sheetLabel}
          {a.menuItems.length > 0 && (
            <span title={a.menuItems.join(', ')}> · in {a.menuItems.length} menu item{a.menuItems.length === 1 ? '' : 's'}</span>
          )}
        </div>
      </td>
      <td>
        <span className={`badge ${lv.badge}`} style={{ whiteSpace: 'nowrap' }}>{lv.icon} {lv.label}</span>
      </td>
      <td>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: a.level === 'out' ? '#dc3545' : a.level === 'low' ? '#e67e22' : 'var(--color-text)' }}>
          {fmtQty(a.ending)}{u}
          {a.min !== null && a.min > 0 && <span style={{ ...muted, fontWeight: 500 }}> / min {fmtQty(a.min)}</span>}
        </div>
        <div className="stock-bar" style={{ maxWidth: '140px' }}><div className={`stock-bar-fill ${lv.bar}`} style={{ width: `${pct}%` }} /></div>
        {a.asOf && <div style={muted} title="Last count with everything sold since taken off. Count it today for an exact figure.">est. from count on {dayLabel(a.asOf)}</div>}
      </td>
      <td>
        {a.daysLeft !== null ? (
          <>
            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{a.ending === 0 ? '0' : `~${fmtDays(a.daysLeft)}`}</div>
            <div style={muted}>at {fmtQty(a.avgDailyUse as number)}{u}/day</div>
          </>
        ) : (
          <span style={muted} title="No Used figures in the last week to go on">—</span>
        )}
      </td>
      <td>
        {a.topUp !== null && a.topUp > 0 ? (
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#16a085', whiteSpace: 'nowrap' }}>+{fmtQty(a.topUp)}{u}</span>
        ) : a.level === 'out' ? (
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#16a085' }}>Restock</span>
        ) : (
          <span style={muted}>—</span>
        )}
      </td>
      <td style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>{a.reason}</td>
    </tr>
  )
}
