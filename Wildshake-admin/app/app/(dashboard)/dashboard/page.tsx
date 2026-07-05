import { createClient } from '@/lib/supabase/server'
import { requirePanelAccess } from '@/lib/portal/access'

async function getDashboardData() {
  const supabase = await createClient()

  // Philippine Standard Time = UTC+8. Use PHT midnight as "today" cutoff
  // so transactions made after 12:00 AM Manila time are counted as today.
  const PHT_OFFSET_MS = 8 * 60 * 60 * 1000
  const nowPHT = new Date(Date.now() + PHT_OFFSET_MS)
  const todayPHT = new Date(nowPHT)
  todayPHT.setUTCHours(0, 0, 0, 0)                     // midnight PHT → in UTC
  const todayUTC = new Date(todayPHT.getTime() - PHT_OFFSET_MS)  // back to UTC

  const weekAgo  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000)
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [
    { data: todayTx },
    { data: totalFranchises },
    { data: recentTx },
    { data: lowStock },
    { data: revenueByDay },
    { data: branchRevenue },
    { data: allBranches },
  ] = await Promise.all([
    supabase
      .from('transactions')
      .select('total_amount, status, payment_method, branch_id')
      .gte('created_at', todayUTC.toISOString())
      .eq('status', 'completed'),

    supabase.from('franchises').select('id, name, status, region'),

    supabase
      .from('transactions')
      .select('id, total_amount, status, payment_method, created_at, local_ref, branches(name), users(name)')
      .order('created_at', { ascending: false })
      .limit(15),

    supabase
      .from('inventory')
      .select('id, current_stock, safety_level, ingredients(name), branches(name)')
      .filter('current_stock', 'lt', 'safety_level'),

    // 7-day trend
    supabase
      .from('transactions')
      .select('total_amount, created_at, status, branch_id')
      .eq('status', 'completed')
      .gte('created_at', weekAgo.toISOString())
      .order('created_at', { ascending: true }),

    // 30-day revenue per branch
    supabase
      .from('transactions')
      .select('total_amount, branch_id, branches(name, franchise_id)')
      .eq('status', 'completed')
      .gte('created_at', monthAgo.toISOString()),

    supabase
      .from('branches')
      .select('id, name, franchise_id, status, active_device_id')
      .eq('status', 'active'),
  ])

  const todayRevenue = (todayTx || []).reduce((sum, t) => sum + Number(t.total_amount), 0)
  const todayCount   = (todayTx || []).length

  // Payment method breakdown today
  const todayPayBreakdown: Record<string, number> = {}
  for (const t of todayTx || []) {
    todayPayBreakdown[t.payment_method] = (todayPayBreakdown[t.payment_method] || 0) + Number(t.total_amount)
  }

  // 7-day chart
  const chartData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() + PHT_OFFSET_MS)    // shift to PHT
    d.setUTCDate(d.getUTCDate() - (6 - i))
    const label   = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Manila' })
    const dateStr = d.toISOString().split('T')[0]      // YYYY-MM-DD in PHT
    const revenue = (revenueByDay || [])
      .filter(t => {
        // Convert stored UTC timestamp to PHT date string for comparison
        const txPHT = new Date(new Date(t.created_at).getTime() + PHT_OFFSET_MS)
        return txPHT.toISOString().split('T')[0] === dateStr
      })
      .reduce((sum, t) => sum + Number(t.total_amount), 0)
    return { label, revenue, isToday: i === 6 }
  })

  // Per-branch 30-day revenue
  const branchMap: Record<string, { name: string; revenue: number; txCount: number }> = {}
  for (const t of branchRevenue || []) {
    const b = t.branches as unknown as { name: string; franchise_id: string } | null
    if (!b) continue
    const bid = t.branch_id as string
    if (!branchMap[bid]) branchMap[bid] = { name: b.name, revenue: 0, txCount: 0 }
    branchMap[bid].revenue  += Number(t.total_amount)
    branchMap[bid].txCount  += 1
  }
  const branchLeaderboard = Object.values(branchMap).sort((a, b) => b.revenue - a.revenue)

  return {
    todayRevenue,
    todayCount,
    franchises: totalFranchises || [],
    recentTx: recentTx || [],
    lowStock: lowStock || [],
    chartData,
    todayPayBreakdown,
    branchLeaderboard,
    allBranches: allBranches || [],
  }
}

export default async function DashboardPage() {
  await requirePanelAccess('master_admin', 'dashboard')

  const {
    todayRevenue, todayCount, franchises, recentTx, lowStock,
    chartData, todayPayBreakdown, branchLeaderboard, allBranches,
  } = await getDashboardData()

  const activeFranchises = franchises.filter(f => f.status === 'active').length
  const maxRevenue       = Math.max(...chartData.map(d => d.revenue), 1)
  const maxBranch        = Math.max(...branchLeaderboard.map(b => b.revenue), 1)
  const maxPay           = Math.max(...Object.values(todayPayBreakdown), 1)

  const payLabels: Record<string, string> = {
    cash: '💵 Cash', gcash: '📱 GCash', maya: '🟣 Maya',
    bank_transfer: '🏦 Bank', card: '💳 Card', other: '📎 Other',
  }

  const activeBranches   = allBranches.filter(b => b.active_device_id).length
  const inactiveBranches = allBranches.filter(b => !b.active_device_id).length

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
          <span className="badge badge-muted">{activeFranchises} active franchises</span>
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

      {/* POS Status Banner */}
      <div style={{
        display: 'flex', gap: '1rem', margin: '1.25rem 0',
        padding: '0.875rem 1.25rem',
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>🖥️ POS Status:</span>
        <span className="badge badge-success">● {activeBranches} Branches Online</span>
        {inactiveBranches > 0 && (
          <span className="badge badge-warning">○ {inactiveBranches} Unclaimed</span>
        )}
        {allBranches.map(b => (
          <span key={b.id} style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: b.active_device_id ? 'var(--color-success)' : '#555', display: 'inline-block' }} />
            {b.name}
          </span>
        ))}
      </div>

      {/* Charts Row */}
      <div className="chart-grid">
        {/* 7-day Revenue Trend */}
        <div className="chart-card">
          <p className="chart-title">
            7-Day Revenue Trend
            <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>Live</span>
          </p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '120px' }}>
            {chartData.map((d, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', height: '100%', justifyContent: 'flex-end' }}>
                {d.revenue > 0 && (
                  <span style={{ fontSize: '0.58rem', color: 'var(--color-accent)', fontWeight: 700 }}>
                    ₱{(d.revenue / 1000).toFixed(1)}k
                  </span>
                )}
                <div style={{
                  width: '100%',
                  height: `${(d.revenue / maxRevenue) * 90}%`,
                  minHeight: d.revenue > 0 ? '6px' : '2px',
                  background: d.isToday
                    ? 'linear-gradient(180deg, var(--color-accent), var(--color-accent-light))'
                    : 'linear-gradient(180deg, var(--color-primary), var(--color-primary-light))',
                  borderRadius: '4px 4px 0 0',
                  transition: 'height 0.5s ease',
                  opacity: d.isToday ? 1 : 0.7,
                }} />
                <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{d.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Today's Payment Breakdown */}
        <div className="chart-card">
          <p className="chart-title">Today&apos;s Payment Methods</p>
          {Object.keys(todayPayBreakdown).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
              <p style={{ fontSize: '2rem' }}>💳</p>
              <p>No transactions yet today</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {Object.entries(todayPayBreakdown).sort(([, a], [, b]) => b - a).map(([method, amount]) => {
                const pct = todayRevenue > 0 ? (amount / todayRevenue) * 100 : 0
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

      {/* Branch Leaderboard + Low Stock row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginTop: '1.25rem' }}>
        {/* 30-Day Branch Revenue Leaderboard */}
        <div className="chart-card">
          <p className="chart-title">
            30-Day Revenue by Branch
            <span className="badge badge-muted" style={{ fontSize: '0.65rem' }}>all outlets</span>
          </p>
          {branchLeaderboard.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
              <p style={{ fontSize: '2rem' }}>🏪</p>
              <p>No revenue data yet</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {branchLeaderboard.map((b, i) => (
                <div key={b.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{
                        width: '20px', height: '20px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.65rem', fontWeight: 800, flexShrink: 0,
                        background: i === 0 ? 'rgba(212,175,55,0.2)' : 'rgba(74,124,89,0.12)',
                        color: i === 0 ? 'var(--color-accent)' : 'var(--color-primary-light)',
                      }}>
                        {i + 1}
                      </span>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{b.name}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.82rem', color: 'var(--color-accent)', fontWeight: 700 }}>
                        ₱{b.revenue.toLocaleString('en-PH', { minimumFractionDigits: 0 })}
                      </span>
                      <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', marginLeft: '0.5rem' }}>
                        {b.txCount} txns
                      </span>
                    </div>
                  </div>
                  <div className="stock-bar">
                    <div className="stock-bar-fill good" style={{ width: `${(b.revenue / maxBranch) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
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
              {lowStock.slice(0, 6).map((item) => {
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
                      <div className="stock-bar-fill low" style={{ width: `${pct}%` }} />
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

      {/* Recent Transactions — All Branches */}
      <div className="table-wrapper mt-3">
        <div className="table-header">
          <p className="table-title">Recent Transactions — All Branches</p>
          <span className="badge badge-muted">Last 15</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Ref / ID</th>
              <th>Branch</th>
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
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>
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
                    {(tx.branches as unknown as { name: string } | null)?.name || '—'}
                  </td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                    {(tx.users as unknown as { name: string } | null)?.name || '—'}
                  </td>
                  <td style={{ fontWeight: 700, color: tx.status === 'voided' ? 'var(--color-danger-light)' : 'var(--color-accent)' }}>
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
