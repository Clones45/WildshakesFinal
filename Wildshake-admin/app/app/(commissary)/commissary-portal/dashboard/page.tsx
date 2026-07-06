import { requireDashboardOrFirstPanel } from '@/lib/portal/access'

export default async function CommissaryDashboardPage() {
  const { supabase, user } = await requireDashboardOrFirstPanel('commissary')
  const commissaryId = (user?.app_metadata as Record<string, string>)?.commissary_id

  const today = new Date().toISOString().split('T')[0]

  const [
    { data: franchises },
    { data: shipments },
    { data: todayLogs },
    { data: commissary },
  ] = await Promise.all([
    supabase
      .from('franchises')
      .select('id, name, owner_name, status, branches(id, name)')
      .eq('parent_commissary_id', commissaryId)
      .eq('status', 'active'),

    supabase
      .from('commissary_shipments')
      .select('id, status, quantity_sent, created_at, branches(name), inventory_items(name)')
      .eq('source_commissary_id', commissaryId)
      .order('created_at', { ascending: false })
      .limit(10),

    supabase
      .from('daily_inventory_logs')
      .select('id, branch_id, inventory_item_id, ending_stock')
      .eq('log_date', today),

    supabase
      .from('commissary_branches')
      .select('id, name, region, status')
      .eq('id', commissaryId)
      .single(),
  ])

  const allBranches  = (franchises || []).flatMap(f => (f.branches as { id: string }[]) || [])
  const pendingShips = (shipments || []).filter(s => s.status === 'pending').length
  const inTransit    = (shipments || []).filter(s => s.status === 'in_transit').length

  return (
    <>
      <div className="page-header">
        <div>
          <h1>📊 Dashboard</h1>
          <p className="page-header-subtitle">
            {commissary?.name} — {commissary?.region || 'Commissary Overview'}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="stat-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-card-icon green">🏪</div>
          <p className="stat-card-label">Franchisees</p>
          <p className="stat-card-value">{(franchises || []).length}</p>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon blue">🏬</div>
          <p className="stat-card-label">Total Branches</p>
          <p className="stat-card-value">{allBranches.length}</p>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon gold">📦</div>
          <p className="stat-card-label">Pending Shipments</p>
          <p className="stat-card-value">{pendingShips}</p>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon green">🚚</div>
          <p className="stat-card-label">In Transit</p>
          <p className="stat-card-value">{inTransit}</p>
        </div>
      </div>

      {/* Recent Shipments */}
      <div className="table-wrapper">
        <div className="table-header">
          <p className="table-title">Recent Shipments</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>Branch</th>
              <th>Item</th>
              <th>Qty</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {(shipments || []).length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>
                  No shipments yet.
                </td>
              </tr>
            ) : (
              (shipments || []).map(s => (
                <tr key={s.id}>
                  <td>{((s.branches as unknown) as { name: string } | null)?.name ?? '—'}</td>
                  <td>{((s.inventory_items as unknown) as { name: string } | null)?.name ?? '—'}</td>
                  <td>{s.quantity_sent}</td>
                  <td>
                    <span className={`badge badge-${
                      s.status === 'received' ? 'success' :
                      s.status === 'in_transit' ? 'warning' :
                      s.status === 'rejected' ? 'danger' : 'muted'
                    }`}>{s.status}</span>
                  </td>
                  <td style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                    {new Date(s.created_at).toLocaleDateString('en-PH')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
