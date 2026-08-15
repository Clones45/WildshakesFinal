'use client'

import { useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'

interface Tx {
  total_amount: number
  discount_amount: number
  payment_method: string
  status: string
  delivery_platform: 'foodpanda' | 'grab' | null
  created_at: string
}

interface TopItem {
  quantity: number
  subtotal: number
  cancelled?: boolean | null
  products: { name: string; category: string } | null
  transactions: { branch_id: string; status: string; created_at: string } | null
}

interface Props {
  branchName: string
  /** Month being viewed, YYYY-MM. The server fetches only this month. */
  month: string
  /** Today in Manila, YYYY-MM-DD — used to cap the month picker. */
  today: string
  transactions: Tx[]
  topItems?: TopItem[]
}

/**
 * Which Manila day a timestamp belongs to.
 * The branches trade on Philippine time, so an 11pm sale must not be filed under
 * the next day just because UTC has already rolled over.
 */
const manilaDay = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(iso))

const MONTH_LABEL = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

const DAY_LABEL = (day: string) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

export default function FranchiserSalesClient({
  branchName, month, today, transactions, topItems = [],
}: Props) {
  const router = useRouter()
  // '' = the whole month; otherwise a single YYYY-MM-DD
  const [selectedDay, setSelectedDay] = useState('')

  // Every day in the month, so the picker still offers days with no sales
  const [yr, mo] = month.split('-').map(Number)
  const daysInMonth = new Date(yr, mo, 0).getDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => `${month}-${pad(i + 1)}`)
    .filter(d => d <= today)   // never offer a day that hasn't happened yet

  const inScope = (iso: string) =>
    selectedDay === '' ? true : manilaDay(iso) === selectedDay

  const filtered = transactions.filter(t => inScope(t.created_at))
  const rangeLabel = selectedDay === '' ? MONTH_LABEL(month) : DAY_LABEL(selectedDay)

  const totalRevenue  = filtered.reduce((s, t) => s + Number(t.total_amount), 0)
  const totalDiscount = filtered.reduce((s, t) => s + Number(t.discount_amount), 0)
  const netRevenue    = totalRevenue - totalDiscount
  const avgOrder      = filtered.length > 0 ? totalRevenue / filtered.length : 0

  // Payment breakdown
  const payBreakdown: Record<string, number> = {}
  for (const t of filtered) {
    payBreakdown[t.payment_method] = (payBreakdown[t.payment_method] || 0) + Number(t.total_amount)
  }
  const maxPay = Math.max(...Object.values(payBreakdown), 1)

  // Delivery platform breakdown
  const foodpandaRevenue = filtered.filter(t => t.delivery_platform === 'foodpanda').reduce((s, t) => s + Number(t.total_amount), 0)
  const grabRevenue = filtered.filter(t => t.delivery_platform === 'grab').reduce((s, t) => s + Number(t.total_amount), 0)
  const foodpandaOrders = filtered.filter(t => t.delivery_platform === 'foodpanda').length
  const grabOrders = filtered.filter(t => t.delivery_platform === 'grab').length

  // Revenue per day. One bar for a single day, otherwise every day of the month.
  const chartDayList = selectedDay === '' ? monthDays : [selectedDay]
  const chartData = chartDayList.map(day => {
    const onThisDay = filtered.filter(t => manilaDay(t.created_at) === day)
    return {
      day,
      label: String(Number(day.slice(8))),   // day of month, e.g. "17"
      fullLabel: DAY_LABEL(day),
      revenue: onThisDay.reduce((s, t) => s + Number(t.total_amount), 0),
      count: onThisDay.length,
      isToday: day === today,
    }
  })
  const maxRevenue = Math.max(...chartData.map(d => d.revenue), 1)

  // Top items — held to the same day or month as everything else on the page.
  // This used to sum every row the server sent regardless of the date filter, so the
  // list disagreed with the totals above it.
  const itemMap: Record<string, { name: string; category: string; qty: number; revenue: number }> = {}
  for (const row of topItems) {
    const prod = row.products
    if (!prod) continue
    if (row.cancelled) continue
    const soldAt = row.transactions?.created_at
    if (!soldAt || !inScope(soldAt)) continue
    if (!itemMap[prod.name]) itemMap[prod.name] = { name: prod.name, category: prod.category, qty: 0, revenue: 0 }
    itemMap[prod.name].qty     += Number(row.quantity)
    itemMap[prod.name].revenue += Number(row.subtotal)
  }
  const topItemsList = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue).slice(0, 8)

  const payLabels: Record<string, string> = {
    cash: '💵 Cash', gcash: '📱 GCash', maya: '🟣 Maya',
    bank_transfer: '🏦 Bank Transfer', card: '💳 Card', other: '📎 Other',
  }

  // Daily table (sorted desc)
  const dailyTable = [...chartData].reverse()

  function exportCSV() {
    const header = 'Date,Transactions,Revenue\n'
    const rows = chartData.map(d => `${d.day},${d.count},${d.revenue.toFixed(2)}`).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${branchName}-sales-${selectedDay || month}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Sales Report</h1>
          <p className="page-header-subtitle">Performance analytics for {branchName}</p>
        </div>
        <div className="flex gap-1" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Pick the month — reloads the page so the server fetches that month */}
          <input
            type="month"
            className="form-select"
            style={{ width: 'auto' }}
            value={month}
            max={today.slice(0, 7)}
            onChange={e => {
              const next = e.target.value
              if (!next) return
              setSelectedDay('')
              router.push(`/franchiser/sales?month=${next}`)
            }}
            aria-label="Month"
          />
          {/* Then pick a day inside it, or leave it on the whole month */}
          <select
            className="form-select"
            style={{ width: 'auto' }}
            value={selectedDay}
            onChange={e => setSelectedDay(e.target.value)}
            aria-label="Day"
          >
            <option value="">Whole month</option>
            {monthDays.map(d => (
              <option key={d} value={d}>{DAY_LABEL(d)}</option>
            ))}
          </select>
          <button className="btn btn-ghost" onClick={exportCSV}>📥 Export CSV</button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="stat-grid">
        <div className="stat-card card-glow">
          <div className="stat-card-icon green">💰</div>
          <p className="stat-card-label">Gross Revenue</p>
          <p className="stat-card-value">₱{totalRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
          <p className="stat-card-trend neutral">{filtered.length} transactions</p>
        </div>
        <div className="stat-card card-glow">
          <div className="stat-card-icon blue">📈</div>
          <p className="stat-card-label">Net Revenue</p>
          <p className="stat-card-value">₱{netRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
          <p className="stat-card-trend neutral">After ₱{totalDiscount.toFixed(2)} discounts</p>
        </div>
        <div className="stat-card card-glow">
          <div className="stat-card-icon gold">🧾</div>
          <p className="stat-card-label">Avg Order Value</p>
          <p className="stat-card-value">₱{avgOrder.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
          <p className="stat-card-trend neutral">Per transaction</p>
        </div>
      </div>

      {/* Charts */}
      <div className="chart-grid" style={{ marginTop: '1.25rem' }}>
        {/* Revenue Trend Bar Chart */}
        <div className="chart-card" style={{ gridColumn: 'span 1' }}>
          <p className="chart-title">
            Daily Revenue Trend
            <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>Live</span>
          </p>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
              <p style={{ fontSize: '2rem' }}>📊</p>
              <p>No sales data for this period</p>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '130px', overflowX: 'auto' }}>
              {chartData.map((d, i) => (
                <div
                  key={i}
                  style={{ flex: '0 0 auto', minWidth: '28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%', justifyContent: 'flex-end' }}
                  title={`${d.fullLabel}: ₱${d.revenue.toFixed(0)} (${d.count} orders)`}
                >
                  {d.revenue > 0 && (
                    <span style={{ fontSize: '0.55rem', color: 'var(--color-accent)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      ₱{d.revenue >= 1000 ? `${(d.revenue / 1000).toFixed(1)}k` : d.revenue.toFixed(0)}
                    </span>
                  )}
                  <div style={{
                    width: '100%',
                    height: `${Math.max((d.revenue / maxRevenue) * 100, d.revenue > 0 ? 4 : 1)}%`,
                    minHeight: d.revenue > 0 ? '6px' : '2px',
                    background: d.isToday
                      ? 'linear-gradient(180deg, var(--color-accent), var(--color-accent-light))'
                      : 'linear-gradient(180deg, var(--color-primary), var(--color-primary-light))',
                    borderRadius: '4px 4px 0 0',
                    opacity: d.isToday ? 1 : 0.65,
                    transition: 'height 0.5s ease',
                  }} />
                  <span style={{ fontSize: '0.55rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                    {d.label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Payment Breakdown */}
        <div className="chart-card">
          <p className="chart-title">Payment Method Breakdown</p>
          {Object.keys(payBreakdown).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
              <p style={{ fontSize: '2rem' }}>💳</p>
              <p>No payment data</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {Object.entries(payBreakdown)
                .sort(([, a], [, b]) => b - a)
                .map(([method, amount]) => {
                  const pct = totalRevenue > 0 ? (amount / totalRevenue) * 100 : 0
                  return (
                    <div key={method}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{payLabels[method] || method}</span>
                        <span style={{ fontSize: '0.82rem', color: 'var(--color-accent)', fontWeight: 700 }}>
                          ₱{amount.toLocaleString('en-PH', { minimumFractionDigits: 0 })} ({pct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="stock-bar">
                        <div className="stock-bar-fill good" style={{ width: `${(amount / maxPay) * 100}%` }} />
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      </div>

      {/* Delivery Breakdown */}
      {(foodpandaOrders > 0 || grabOrders > 0) && (
        <div className="chart-card" style={{ marginTop: '1.25rem' }}>
          <p className="chart-title">🛵 Delivery Platform Breakdown</p>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div className="stat-card card-glow" style={{ flex: 1, minWidth: 140, border: '1px solid rgba(232,0,94,0.3)', background: 'rgba(232,0,94,0.06)' }}>
              <div className="stat-card-icon" style={{ background: 'rgba(232,0,94,0.15)', fontSize: '1.3rem' }}>🐼</div>
              <p className="stat-card-label">FoodPanda Revenue</p>
              <p className="stat-card-value" style={{ color: '#e8005e' }}>₱{foodpandaRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
              <p className="stat-card-trend neutral">{foodpandaOrders} order{foodpandaOrders !== 1 ? 's' : ''}</p>
            </div>
            <div className="stat-card card-glow" style={{ flex: 1, minWidth: 140, border: '1px solid rgba(0,177,79,0.3)', background: 'rgba(0,177,79,0.06)' }}>
              <div className="stat-card-icon" style={{ background: 'rgba(0,177,79,0.15)', fontSize: '1.3rem' }}>🟢</div>
              <p className="stat-card-label">Grab Revenue</p>
              <p className="stat-card-value" style={{ color: '#00b14f' }}>₱{grabRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
              <p className="stat-card-trend neutral">{grabOrders} order{grabOrders !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>
      )}

      {/* Top Items + Daily Table */}
      <div className="two-col-panel" style={{ '--panel-ratio': '1.4fr', marginTop: '1.25rem' } as CSSProperties}>
        {/* Top Selling Items */}
        <div className="chart-card">
          <p className="chart-title">
            Top Selling Items
            <span className="badge badge-muted" style={{ fontSize: '0.65rem' }}>by revenue</span>
          </p>
          {topItemsList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)' }}>
              <p>No items data</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {topItemsList.map((item, i) => (
                <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{
                    width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0,
                    background: i === 0 ? 'rgba(212,175,55,0.2)' : i === 1 ? 'rgba(192,192,192,0.15)' : 'rgba(74,124,89,0.12)',
                    color: i === 0 ? 'var(--color-accent)' : i === 1 ? '#aaa' : 'var(--color-primary-light)',
                    fontWeight: 800, fontSize: '0.72rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {i + 1}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.82rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name}
                    </p>
                    <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{item.category} · ×{item.qty} sold</p>
                  </div>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-accent)', flexShrink: 0 }}>
                    ₱{item.revenue.toLocaleString('en-PH', { minimumFractionDigits: 0 })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Daily Summary Table */}
        <div className="table-wrapper">
          <div className="table-header">
            <p className="table-title">Daily Breakdown</p>
            <span className="badge badge-muted">{rangeLabel}</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Orders</th>
                <th>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {dailyTable.filter(d => d.revenue > 0).map((d, i) => (
                <tr key={i}>
                  <td style={{ fontSize: '0.82rem' }}>{d.fullLabel}</td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>{d.count}</td>
                  <td style={{ fontWeight: 700, color: 'var(--color-accent)' }}>
                    ₱{d.revenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
              {dailyTable.filter(d => d.revenue > 0).length === 0 && (
                <tr>
                  <td colSpan={3} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>
                    No sales data for this period
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
