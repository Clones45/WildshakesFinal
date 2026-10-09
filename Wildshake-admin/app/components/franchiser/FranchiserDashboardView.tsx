import type { CSSProperties } from 'react'
import StockWatchPanel from '@/components/franchiser/StockWatchPanel'
import type { FranchiseDashboardData } from '@/lib/franchise/dashboard'

/**
 * The franchise Dashboard as the branch owner sees it. Pure markup over the data
 * from loadFranchiseDashboard, so the owner's portal and the head office's franchise
 * page draw the very same screen from the very same numbers.
 *
 * inventoryHref: where the Stock Watch links lead (the owner's Inventory page, or
 * the Inventory tab of the head office's franchise page).
 */
export default function FranchiserDashboardView({ data, inventoryHref }: { data: FranchiseDashboardData; inventoryHref: string }) {
  const { branch, branches, todayRevenue, todayOrders, weekRevenue, voidedToday,
          chartData, payBreakdown, topItemsList, recentTx, activeStaff, stockWatches } = data

  const maxRevenue = Math.max(...chartData.map(d => d.revenue), 1)
  const dateNow = new Date().toLocaleDateString('en-PH', { timeZone: 'Asia/Manila',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })
  const timeNow = new Date().toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' })

  const payLabels: Record<string, string> = {
    cash: '💵 Cash', gcash: '📱 GCash', maya: '🟣 Maya',
    bank_transfer: '🏦 Bank', card: '💳 Card', other: '📎 Other'
  }

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1>{branches.length === 1 ? branch.name : `My Franchise (${branches.length} Branches)`} — Dashboard</h1>
          <p className="page-header-subtitle">{dateNow} · {timeNow}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {branches.map(b => (
            <span key={b.id} className={`badge ${b.active_device_id ? 'badge-success' : 'badge-warning'}`}
              style={{ fontSize: '0.72rem' }}>
              {b.active_device_id ? '●' : '○'} {b.name}
            </span>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="stat-grid">
        <div className="stat-card card-glow">
          <div className="stat-card-icon green">💵</div>
          <p className="stat-card-label">Today&apos;s Revenue</p>
          <p className="stat-card-value">₱{todayRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
          <p className="stat-card-trend neutral">From {todayOrders} order{todayOrders !== 1 ? 's' : ''}</p>
        </div>

        <div className="stat-card card-glow">
          <div className="stat-card-icon gold">📅</div>
          <p className="stat-card-label">This Week</p>
          <p className="stat-card-value">₱{weekRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
          <p className="stat-card-trend neutral">Last 7 days</p>
        </div>

        <div className="stat-card card-glow">
          <div className="stat-card-icon blue">👥</div>
          <p className="stat-card-label">Active Staff</p>
          <p className="stat-card-value">{activeStaff}</p>
          <p className="stat-card-trend neutral">Cashiers & managers</p>
        </div>

        <div className="stat-card card-glow">
          <div className="stat-card-icon red">🔴</div>
          <p className="stat-card-label">Voided Today</p>
          <p className="stat-card-value">{voidedToday}</p>
          <p className={`stat-card-trend ${voidedToday > 0 ? 'down' : 'up'}`}>
            {voidedToday > 0 ? 'Requires review' : 'No voids today'}
          </p>
        </div>
      </div>

      {/* Stock Watch: what needs restocking, most urgent first */}
      <StockWatchPanel watches={stockWatches} inventoryHref={inventoryHref} />

      {/* Charts Row */}
      <div className="chart-grid">
        {/* 7-day bar chart */}
        <div className="chart-card">
          <p className="chart-title">
            7-Day Revenue Trend
            <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>Live</span>
          </p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '130px' }}>
            {chartData.map((d, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', height: '100%', justifyContent: 'flex-end' }}>
                <span style={{ fontSize: '0.6rem', color: 'var(--color-accent)', fontWeight: 700 }}>
                  {d.revenue > 0 ? `₱${(d.revenue / 1000).toFixed(1)}k` : ''}
                </span>
                <div style={{
                  width: '100%',
                  height: `${(d.revenue / maxRevenue) * 90}%`,
                  minHeight: d.revenue > 0 ? '6px' : '2px',
                  background: d.isToday
                    ? 'linear-gradient(180deg, var(--color-accent), var(--color-accent-light))'
                    : 'linear-gradient(180deg, var(--color-primary), var(--color-primary-light))',
                  borderRadius: '4px 4px 0 0',
                  transition: 'height 0.5s ease',
                  opacity: d.isToday ? 1 : 0.65,
                }} />
                <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                  {d.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Payment breakdown */}
        <div className="chart-card">
          <p className="chart-title">Today&apos;s Payment Breakdown</p>
          {Object.keys(payBreakdown).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
              <p style={{ fontSize: '2rem' }}>💳</p>
              <p>No transactions yet today</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {Object.entries(payBreakdown).map(([method, amount]) => {
                const totalToday = Object.values(payBreakdown).reduce((a, b) => a + b, 0)
                const pct = totalToday > 0 ? (amount / totalToday) * 100 : 0
                return (
                  <div key={method}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{payLabels[method] || method}</span>
                      <span style={{ fontSize: '0.82rem', color: 'var(--color-accent)', fontWeight: 700 }}>
                        ₱{amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })} ({pct.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="stock-bar">
                      <div className="stock-bar-fill good" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Top Items + Recent Transactions row */}
      <div className="two-col-panel" style={{ '--panel-ratio': '1.6fr', marginTop: '1.25rem' } as CSSProperties}>
        {/* Top selling items today */}
        <div className="chart-card">
          <p className="chart-title">
            Top Items Today
            <span className="badge badge-muted" style={{ fontSize: '0.65rem' }}>by qty</span>
          </p>
          {topItemsList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)' }}>
              <p>No sales yet today</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {topItemsList.map((item, i) => (
                <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{
                    width: '24px', height: '24px', borderRadius: '50%',
                    background: i === 0 ? 'rgba(212,175,55,0.2)' : 'rgba(74,124,89,0.15)',
                    color: i === 0 ? 'var(--color-accent)' : 'var(--color-primary-light)',
                    fontWeight: 800, fontSize: '0.72rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {i + 1}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name}
                    </p>
                    <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{item.category}</p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-accent)' }}>×{item.qty}</p>
                    <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>₱{item.revenue.toFixed(0)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent transactions */}
        <div className="table-wrapper">
          <div className="table-header">
            <p className="table-title">Recent Transactions</p>
            <span className="badge badge-muted">Last 10</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Ref</th>
                <th>Cashier</th>
                <th>Amount</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {recentTx.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>
                    No transactions yet
                  </td>
                </tr>
              ) : (
                recentTx.map((tx) => (
                  <tr key={tx.id} style={{ opacity: tx.status === 'voided' ? 0.6 : 1 }}>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.73rem', color: 'var(--color-text-muted)' }}>
                      {(tx.local_ref || tx.id).slice(0, 10).toUpperCase()}
                    </td>
                    <td style={{ fontSize: '0.82rem' }}>
                      {(tx.users as unknown as { name: string } | null)?.name || '—'}
                    </td>
                    <td style={{ fontWeight: 700, color: 'var(--color-accent)' }}>
                      ₱{Number(tx.total_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ textTransform: 'capitalize', fontSize: '0.82rem' }}>
                      {tx.payment_method.replace('_', ' ')}
                    </td>
                    <td>
                      <span className={`badge badge-${tx.status === 'completed' ? 'success' : tx.status === 'voided' ? 'danger' : 'warning'}`}>
                        {tx.status}
                      </span>
                    </td>
                    <td style={{ color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>
                      {new Date(tx.created_at).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
