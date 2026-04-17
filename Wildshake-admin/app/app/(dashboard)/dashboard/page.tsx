import { createClient } from '@/lib/supabase/server'

async function getDashboardData() {
  const supabase = await createClient()

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [
    { data: todayTx },
    { data: totalFranchises },
    { data: recentTx },
    { data: lowStock },
    { data: revenueByDay },
  ] = await Promise.all([
    supabase
      .from('transactions')
      .select('total_amount, status')
      .gte('created_at', today.toISOString())
      .eq('status', 'completed'),

    supabase.from('franchises').select('id, name, status'),

    supabase
      .from('transactions')
      .select('id, total_amount, status, payment_method, created_at, branches(name)')
      .order('created_at', { ascending: false })
      .limit(8),

    supabase
      .from('inventory')
      .select('id, current_stock, safety_level, ingredients(name), branches(name)')
      .filter('current_stock', 'lt', 'safety_level'),

    supabase
      .from('transactions')
      .select('total_amount, created_at, status')
      .eq('status', 'completed')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: true }),
  ])

  const todayRevenue = (todayTx || []).reduce((sum, t) => sum + Number(t.total_amount), 0)
  const todayCount   = (todayTx || []).length

  // Group revenue by day for chart
  const chartData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const label = d.toLocaleDateString('en-US', { weekday: 'short' })
    const dateStr = d.toISOString().split('T')[0]
    const revenue = (revenueByDay || [])
      .filter(t => t.created_at.startsWith(dateStr))
      .reduce((sum, t) => sum + Number(t.total_amount), 0)
    return { label, revenue }
  })

  return {
    todayRevenue,
    todayCount,
    franchises: totalFranchises || [],
    recentTx: recentTx || [],
    lowStock: lowStock || [],
    chartData,
  }
}

export default async function DashboardPage() {
  const { todayRevenue, todayCount, franchises, recentTx, lowStock, chartData } =
    await getDashboardData()

  const activeFranchises  = franchises.filter(f => f.status === 'active').length
  const maxRevenue = Math.max(...chartData.map(d => d.revenue), 1)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Command Center</h1>
          <p className="page-header-subtitle">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex gap-1">
          <span className="badge badge-success">● Live</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="stat-grid">
        <div className="stat-card card-glow">
          <div className="stat-card-icon green">💵</div>
          <p className="stat-card-label">Today&apos;s Revenue</p>
          <p className="stat-card-value">₱{todayRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
          <p className="stat-card-trend up">↑ All branches combined</p>
        </div>

        <div className="stat-card card-glow">
          <div className="stat-card-icon gold">🧾</div>
          <p className="stat-card-label">Transactions Today</p>
          <p className="stat-card-value">{todayCount}</p>
          <p className="stat-card-trend neutral">across all outlets</p>
        </div>

        <div className="stat-card card-glow">
          <div className="stat-card-icon blue">🏪</div>
          <p className="stat-card-label">Active Franchises</p>
          <p className="stat-card-value">{activeFranchises}</p>
          <p className="stat-card-trend neutral">{franchises.length} total registered</p>
        </div>

        <div className="stat-card card-glow">
          <div className="stat-card-icon red">⚠️</div>
          <p className="stat-card-label">Low Stock Alerts</p>
          <p className="stat-card-value">{lowStock.length}</p>
          <p className="stat-card-trend down">{lowStock.length > 0 ? 'Requires attention' : 'All stocks healthy'}</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="chart-grid">
        {/* Revenue Trend */}
        <div className="chart-card">
          <p className="chart-title">
            7-Day Revenue Trend
            <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>Live</span>
          </p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '120px' }}>
            {chartData.map((d, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', height: '100%', justifyContent: 'flex-end' }}>
                <div
                  style={{
                    width: '100%',
                    height: `${(d.revenue / maxRevenue) * 100}%`,
                    minHeight: d.revenue > 0 ? '4px' : '2px',
                    background: i === 6
                      ? 'linear-gradient(180deg, var(--color-accent), var(--color-accent-light))'
                      : 'linear-gradient(180deg, var(--color-primary), var(--color-primary-light))',
                    borderRadius: '4px 4px 0 0',
                    transition: 'height 0.5s ease',
                    opacity: i === 6 ? 1 : 0.7,
                  }}
                />
                <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{d.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Low Stock Alerts */}
        <div className="chart-card">
          <p className="chart-title">
            Low Stock Alerts
            {lowStock.length > 0 && <span className="badge badge-danger">{lowStock.length} items</span>}
          </p>
          {lowStock.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-success)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✅</div>
              <p style={{ color: 'var(--color-success)' }}>All inventory levels are healthy</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {lowStock.slice(0, 5).map((item) => {
                const pct = item.safety_level > 0
                  ? Math.min((item.current_stock / item.safety_level) * 100, 100)
                  : 0
                return (
                  <div key={item.id}>
                    <div className="flex justify-between" style={{ marginBottom: '0.25rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                        {(item.ingredients as unknown as { name: string } | null)?.name || 'Unknown'}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-danger-light)' }}>
                        {item.current_stock} / {item.safety_level}
                      </span>
                    </div>
                    <div className="stock-bar">
                      <div
                        className="stock-bar-fill low"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '0.15rem' }}>
                      {(item.branches as unknown as { name: string } | null)?.name || 'Unknown branch'}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="table-wrapper mt-3">
        <div className="table-header">
          <p className="table-title">Recent Transactions — All Branches</p>
          <span className="badge badge-muted">Last 8</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Transaction ID</th>
              <th>Branch</th>
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
                <tr key={tx.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    {tx.id.slice(0, 8)}…
                  </td>
                  <td>{(tx.branches as unknown as { name: string } | null)?.name || '—'}</td>
                  <td style={{ fontWeight: 600, color: 'var(--color-accent)' }}>
                    ₱{Number(tx.total_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ textTransform: 'capitalize' }}>{tx.payment_method}</td>
                  <td>
                    <span className={`badge badge-${tx.status === 'completed' ? 'success' : tx.status === 'voided' ? 'danger' : 'warning'}`}>
                      {tx.status}
                    </span>
                  </td>
                  <td style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                    {new Date(tx.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
