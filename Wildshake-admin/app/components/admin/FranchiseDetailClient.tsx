'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'

interface Branch { id: string; name: string; location: string | null; active_device_id: string | null; status: string }
interface StaffMember { id: string; name: string; email: string | null; role: string; pin_code: string | null; is_active: boolean; created_at: string }
interface SalesTx { total_amount: number; discount_amount: number; payment_method: string; status: string; created_at: string }
interface TxItem { quantity: number; unit_price: number; subtotal: number; products: { name: string; category: string } | null }
interface Transaction {
  id: string; total_amount: number; status: string; payment_method: string
  reference_number: string | null; bank_name: string | null; discount_type: string
  discount_amount: number; created_at: string; void_reason: string | null
  table_number: string | null
  delivery_platform: 'foodpanda' | 'grab' | null
  users: { name: string } | null
  branches: { name: string } | null
  transaction_items: TxItem[]
}
interface ChartPoint { label: string; revenue: number; isToday: boolean }
interface TopItem { name: string; category: string; qty: number; revenue: number }
interface StockProduct { id: string; name: string; category: string; price: number; image_url: string | null }
interface StockOverride { product_id: string; is_available: boolean; branch_id: string }
// Inventory interfaces
interface InvCategory { id: string; name: string; sheet_type: string; sort_order: number }
interface InvItem { id: string; category_id: string; name: string; unit: string; min_stock_level: number | null; sort_order: number }
interface InvLog { id: string; inventory_item_id: string; starting_stock: number | null; additional_stock: number | null; used_stock: number | null; ending_stock: number | null; notes: string | null }
interface MenuItemLog { id: string; product_id: string; starting_stock: number | null; additional_stock: number | null; notes: string | null }
interface FoodMenuLink { inventory_item_id: string; product_id: string }

interface Props {
  franchise: { id: string; name: string; owner_name: string; owner_email: string; region: string | null; status: string; created_at: string }
  branches: Branch[]
  activeTab: 'dashboard' | 'sales' | 'transactions' | 'staff' | 'stock' | 'inventory'
  todayRevenue: number; todayOrders: number
  chartData: ChartPoint[]
  payBreakdown: Record<string, number>
  topItemsList: TopItem[]
  salesTransactions: SalesTx[]
  transactions: Transaction[]
  staff: StaffMember[]
  allProducts: StockProduct[]
  stockOverrides: StockOverride[]
  // Inventory (read-only)
  invCategories: InvCategory[]
  invItems: InvItem[]
  invLogs: InvLog[]
  menuItemLogs: MenuItemLog[]
  foodMenuLinks: FoodMenuLink[]
  invSoldMap: Record<string, number>
  invCancelledMap: Record<string, number>
  invVoidedMap: Record<string, number>
  invProducts: StockProduct[]
}

const TABS = [
  { id: 'dashboard',    label: '📊 Dashboard' },
  { id: 'sales',        label: '📈 Sales' },
  { id: 'transactions', label: '🧾 Transactions' },
  { id: 'staff',        label: '👥 Staff' },
  { id: 'stock',        label: '🍹 Stock' },
  { id: 'inventory',    label: '📦 Inventory' },
] as const

const PAY_LABELS: Record<string, string> = { cash: '💵 Cash', gcash: '📱 GCash', maya: '🟣 Maya', bank_transfer: '🏦 Bank', other: '📎 Other' }

export default function FranchiseDetailClient({
  franchise, branches, activeTab,
  todayRevenue, todayOrders, chartData, payBreakdown, topItemsList,
  salesTransactions, transactions, staff,
  allProducts, stockOverrides,
  invCategories, invItems, invLogs, menuItemLogs, foodMenuLinks,
  invSoldMap, invCancelledMap, invVoidedMap, invProducts,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [tab, setTab] = useState(activeTab)
  const [txExpanded, setTxExpanded] = useState<string | null>(null)
  const [salesPeriod, setSalesPeriod] = useState('30')
  const [stockSearch, setStockSearch] = useState('')
  const [stockFilter, setStockFilter] = useState<'all' | 'available' | 'out'>('all')
  const [invSheet, setInvSheet] = useState<'food_items' | 'menu_items' | 'commissary'>('menu_items')

  const changeTab = (t: typeof tab) => {
    setTab(t)
    router.replace(`${pathname}?tab=${t}`, { scroll: false })
  }

  const maxChart = Math.max(...chartData.map(d => d.revenue), 1)
  const weekRevenue = chartData.reduce((s, d) => s + d.revenue, 0)

  // Sales tab calculations
  const salesCutoff = new Date(Date.now() - parseInt(salesPeriod) * 24 * 60 * 60 * 1000)
  const filteredSales = salesTransactions.filter(t => new Date(t.created_at) >= salesCutoff)
  const salesRevenue = filteredSales.reduce((s, t) => s + Number(t.total_amount), 0)
  const salesDiscount = filteredSales.reduce((s, t) => s + Number(t.discount_amount), 0)
  const salesPay: Record<string, number> = {}
  filteredSales.forEach(t => { salesPay[t.payment_method] = (salesPay[t.payment_method] || 0) + Number(t.total_amount) })
  const maxPay = Math.max(...Object.values(salesPay), 1)

  // Delivery breakdown (from transactions prop which has delivery_platform)
  const deliveryCutoff = new Date(Date.now() - parseInt(salesPeriod) * 24 * 60 * 60 * 1000)
  const deliveryTxs = transactions.filter(tx => tx.status === 'completed' && new Date(tx.created_at) >= deliveryCutoff && tx.delivery_platform)
  const foodpandaRevenue = deliveryTxs.filter(tx => tx.delivery_platform === 'foodpanda').reduce((s, tx) => s + Number(tx.total_amount), 0)
  const grabRevenue = deliveryTxs.filter(tx => tx.delivery_platform === 'grab').reduce((s, tx) => s + Number(tx.total_amount), 0)
  const foodpandaOrders = deliveryTxs.filter(tx => tx.delivery_platform === 'foodpanda').length
  const grabOrders = deliveryTxs.filter(tx => tx.delivery_platform === 'grab').length

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: '1.25rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h1 style={{ margin: 0 }}>{franchise.name}</h1>
            <span className={`badge badge-${franchise.status === 'active' ? 'success' : 'danger'}`}>{franchise.status}</span>
          </div>
          <p className="page-header-subtitle">{franchise.owner_name} · {franchise.owner_email} · {franchise.region || 'No region'}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {branches.map(b => (
            <span key={b.id} className={`badge ${b.active_device_id ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '0.72rem' }}>
              {b.active_device_id ? '●' : '○'} {b.name}
            </span>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid var(--color-border)', marginBottom: '1.5rem' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => changeTab(t.id)}
            style={{
              padding: '0.6rem 1.25rem', border: 'none', background: 'none', cursor: 'pointer',
              borderBottom: tab === t.id ? '2px solid var(--color-accent)' : '2px solid transparent',
              color: tab === t.id ? 'var(--color-accent)' : 'var(--color-text-muted)',
              fontWeight: tab === t.id ? 700 : 400, fontSize: '0.88rem', transition: 'all 0.15s',
            }}
          >{t.label}</button>
        ))}
      </div>

      {/* ── DASHBOARD TAB ── */}
      {tab === 'dashboard' && (
        <div>
          <div className="stat-grid">
            <div className="stat-card card-glow">
              <div className="stat-card-icon green">💵</div>
              <p className="stat-card-label">Today&apos;s Revenue</p>
              <p className="stat-card-value">₱{todayRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
              <p className="stat-card-trend neutral">From {todayOrders} order{todayOrders !== 1 ? 's' : ''}</p>
            </div>
            <div className="stat-card card-glow">
              <div className="stat-card-icon blue">📅</div>
              <p className="stat-card-label">7-Day Revenue</p>
              <p className="stat-card-value">₱{weekRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
              <p className="stat-card-trend neutral">Last 7 days</p>
            </div>
            <div className="stat-card card-glow">
              <div className="stat-card-icon gold">👥</div>
              <p className="stat-card-label">Branches</p>
              <p className="stat-card-value">{branches.length}</p>
              <p className="stat-card-trend neutral">{branches.filter(b => b.active_device_id).length} POS online</p>
            </div>
            <div className="stat-card card-glow">
              <div className="stat-card-icon green">🧑‍💼</div>
              <p className="stat-card-label">Staff</p>
              <p className="stat-card-value">{staff.length}</p>
              <p className="stat-card-trend neutral">{staff.filter(s => s.is_active).length} active</p>
            </div>
          </div>

          <div className="chart-grid" style={{ marginTop: '1.25rem' }}>
            {/* 7-day bar chart */}
            <div className="chart-card" style={{ gridColumn: 'span 1' }}>
              <p className="chart-title">7-Day Revenue Trend</p>
              {weekRevenue === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>📊 No sales this week</div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '130px' }}>
                  {chartData.map((d, i) => (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%', justifyContent: 'flex-end' }}>
                      {d.revenue > 0 && <span style={{ fontSize: '0.55rem', color: 'var(--color-accent)', fontWeight: 700 }}>₱{d.revenue >= 1000 ? `${(d.revenue/1000).toFixed(1)}k` : d.revenue.toFixed(0)}</span>}
                      <div style={{ width: '100%', height: `${Math.max((d.revenue / maxChart) * 100, d.revenue > 0 ? 4 : 1)}%`, minHeight: d.revenue > 0 ? '6px' : '2px', background: d.isToday ? 'linear-gradient(180deg,var(--color-accent),var(--color-accent-light))' : 'linear-gradient(180deg,var(--color-primary),var(--color-primary-light))', borderRadius: '4px 4px 0 0', opacity: d.isToday ? 1 : 0.65 }} />
                      <span style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)' }}>{d.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Payment breakdown */}
            <div className="chart-card">
              <p className="chart-title">Today&apos;s Payment Breakdown</p>
              {Object.keys(payBreakdown).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>💳 No payments today</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {Object.entries(payBreakdown).sort(([,a],[,b]) => b-a).map(([method, amount]) => {
                    const pct = todayRevenue > 0 ? (amount / todayRevenue) * 100 : 0
                    return (
                      <div key={method}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{PAY_LABELS[method] || method}</span>
                          <span style={{ fontSize: '0.82rem', color: 'var(--color-accent)', fontWeight: 700 }}>₱{amount.toLocaleString('en-PH', { minimumFractionDigits: 0 })} ({pct.toFixed(0)}%)</span>
                        </div>
                        <div className="stock-bar"><div className="stock-bar-fill good" style={{ width: `${pct}%` }} /></div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Top Items */}
          {topItemsList.length > 0 && (
            <div className="chart-card" style={{ marginTop: '1.25rem' }}>
              <p className="chart-title">Top Selling Items (Last 30 Days)</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {topItemsList.map((item, i) => (
                  <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, background: i === 0 ? 'rgba(212,175,55,0.2)' : 'rgba(74,124,89,0.12)', color: i === 0 ? 'var(--color-accent)' : 'var(--color-primary-light)', fontWeight: 800, fontSize: '0.72rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i+1}</span>
                    <div style={{ flex: 1 }}><p style={{ fontSize: '0.82rem', fontWeight: 600, margin: 0 }}>{item.name}</p><p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', margin: 0 }}>{item.category} · ×{item.qty} sold</p></div>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-accent)' }}>₱{item.revenue.toLocaleString('en-PH', { minimumFractionDigits: 0 })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {/* ── SALES TAB ── */}
      {tab === 'sales' && (
        <>
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
              <select className="form-select" style={{ width: 'auto' }} value={salesPeriod} onChange={e => setSalesPeriod(e.target.value)}>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
              </select>
            </div>
            <div className="stat-grid">
              <div className="stat-card card-glow"><div className="stat-card-icon green">💰</div><p className="stat-card-label">Gross Revenue</p><p className="stat-card-value">₱{salesRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p><p className="stat-card-trend neutral">{filteredSales.length} transactions</p></div>
              <div className="stat-card card-glow"><div className="stat-card-icon blue">📉</div><p className="stat-card-label">Net Revenue</p><p className="stat-card-value">₱{(salesRevenue - salesDiscount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p><p className="stat-card-trend neutral">After ₱{salesDiscount.toFixed(2)} discounts</p></div>
              <div className="stat-card card-glow"><div className="stat-card-icon gold">📊</div><p className="stat-card-label">Avg Order</p><p className="stat-card-value">₱{filteredSales.length > 0 ? (salesRevenue / filteredSales.length).toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '0.00'}</p><p className="stat-card-trend neutral">Per transaction</p></div>
            </div>
            <div className="chart-card" style={{ marginTop: '1.25rem' }}>
              <p className="chart-title">Payment Method Breakdown</p>
              {Object.keys(salesPay).length === 0 ? <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>No data</div> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {Object.entries(salesPay).sort(([,a],[,b]) => b-a).map(([method, amount]) => {
                    const pct = salesRevenue > 0 ? (amount / salesRevenue) * 100 : 0
                    return (
                      <div key={method}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{PAY_LABELS[method] || method}</span>
                          <span style={{ fontSize: '0.82rem', color: 'var(--color-accent)', fontWeight: 700 }}>₱{amount.toLocaleString('en-PH', { minimumFractionDigits: 0 })} ({pct.toFixed(0)}%)</span>
                        </div>
                        <div className="stock-bar"><div className="stock-bar-fill good" style={{ width: `${(amount/maxPay)*100}%` }} /></div>
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
                  <p className="stat-card-trend neutral">{grabOrders} order{grabOrders !== 1 ? 's' : ''}</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── TRANSACTIONS TAB ── */}
      {tab === 'transactions' && (
        <div className="table-wrapper">
          <div className="table-header">
            <p className="table-title">All Transactions</p>
            <span className="badge badge-muted">{transactions.length} records</span>
          </div>
          <table>
            <thead><tr><th>Date</th><th>Branch</th><th>Cashier</th><th>Method</th><th>Platform</th><th>Status</th><th>Amount</th><th></th></tr></thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>No transactions yet</td></tr>
              ) : transactions.map(tx => (
                <>
                  <tr key={tx.id} onClick={() => setTxExpanded(txExpanded === tx.id ? null : tx.id)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontSize: '0.8rem' }}>
                      <div>{new Date(tx.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</div>
                      <div style={{ color: 'var(--color-text-muted)' }}>{new Date(tx.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</div>
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>{tx.branches?.name || '—'}</td>
                    <td style={{ fontSize: '0.8rem' }}>{tx.users?.name || '—'}</td>
                    <td><span style={{ fontSize: '0.75rem' }}>{PAY_LABELS[tx.payment_method] || tx.payment_method}</span></td>
                    <td>
                      {tx.delivery_platform === 'foodpanda' && (
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(232,0,94,0.15)', color: '#e8005e', border: '1px solid rgba(232,0,94,0.3)' }}>🐼 FoodPanda</span>
                      )}
                      {tx.delivery_platform === 'grab' && (
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(0,177,79,0.15)', color: '#00b14f', border: '1px solid rgba(0,177,79,0.3)' }}>🟢 Grab</span>
                      )}
                      {!tx.delivery_platform && <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>—</span>}
                    </td>
                    <td><span className={`badge badge-${tx.status === 'completed' ? 'success' : tx.status === 'voided' ? 'danger' : 'warning'}`}>{tx.status}</span></td>
                    <td style={{ fontWeight: 700, color: tx.status === 'voided' ? 'var(--color-danger-light)' : 'var(--color-accent)' }}>₱{Number(tx.total_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                    <td><button className="btn btn-ghost btn-sm">{txExpanded === tx.id ? '▲' : '▼'}</button></td>
                  </tr>
                  {txExpanded === tx.id && (
                    <tr key={`${tx.id}-exp`} style={{ background: 'rgba(74,124,89,0.04)' }}>
                      <td colSpan={8} style={{ padding: '0.75rem 1.25rem' }}>
                        {tx.void_reason && <div style={{ marginBottom: '0.5rem', padding: '0.5rem 0.75rem', background: 'rgba(220,53,69,0.08)', borderRadius: 6, fontSize: '0.8rem', color: 'var(--color-danger-light)', border: '1px solid rgba(220,53,69,0.2)' }}>🚫 Void Reason: {tx.void_reason}</div>}
                        {tx.bank_name && <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '0.4rem' }}>🏦 Bank: {tx.bank_name}{tx.reference_number && ` · Ref …${tx.reference_number}`}</div>}
                        {!tx.bank_name && tx.reference_number && <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '0.4rem' }}>🔢 Ref …{tx.reference_number}</div>}
                        <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                          <thead><tr style={{ borderBottom: '1px solid var(--color-border)' }}><th style={{ textAlign: 'left', padding: '0.25rem 0.5rem', fontWeight: 600 }}>Item</th><th style={{ textAlign: 'center', padding: '0.25rem 0.5rem', fontWeight: 600 }}>Qty</th><th style={{ textAlign: 'right', padding: '0.25rem 0.5rem', fontWeight: 600 }}>Subtotal</th></tr></thead>
                          <tbody>
                            {tx.transaction_items.map((item, i) => (
                              <tr key={i}><td style={{ padding: '0.25rem 0.5rem' }}>{item.products?.name || '—'}</td><td style={{ textAlign: 'center', padding: '0.25rem 0.5rem' }}>{item.quantity}</td><td style={{ textAlign: 'right', padding: '0.25rem 0.5rem', color: 'var(--color-accent)' }}>₱{Number(item.subtotal).toFixed(2)}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── STAFF TAB ── */}
      {tab === 'staff' && (
        <div className="table-wrapper">
          <div className="table-header">
            <p className="table-title">Staff Members</p>
            <span className="badge badge-muted">{staff.length} total · {staff.filter(s => s.is_active).length} active</span>
          </div>
          <table>
            <thead><tr><th>Name</th><th>Role</th><th>Branch</th><th>PIN Set</th><th>Status</th><th>Joined</th></tr></thead>
            <tbody>
              {staff.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>No staff added yet</td></tr>
              ) : staff.map(s => (
                <tr key={s.id}>
                  <td><div style={{ fontWeight: 600 }}>{s.name}</div><div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>{s.email || '—'}</div></td>
                  <td><span className={`badge ${s.role === 'manager' ? 'badge-warning' : 'badge-muted'}`}>{s.role}</span></td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>—</td>
                  <td>{s.pin_code ? <span className="badge badge-success">✓ Set</span> : <span className="badge badge-danger">Not Set</span>}</td>
                  <td><span className={`badge badge-${s.is_active ? 'success' : 'muted'}`}>{s.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{new Date(s.created_at).toLocaleDateString('en-PH')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {/* ── STOCK TAB ── */}
      {tab === 'stock' && (() => {
        const outOfStockIds = new Set(stockOverrides.map(o => o.product_id))
        const filtered = allProducts.filter(p => {
          const matchSearch = p.name.toLowerCase().includes(stockSearch.toLowerCase()) ||
                              p.category.toLowerCase().includes(stockSearch.toLowerCase())
          const isOut = outOfStockIds.has(p.id)
          const matchFilter = stockFilter === 'all' ? true : stockFilter === 'out' ? isOut : !isOut
          return matchSearch && matchFilter
        })
        const outCount = allProducts.filter(p => outOfStockIds.has(p.id)).length

        return (
          <div>
            {/* Stats */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
              {[
                { label: 'Total Items', value: allProducts.length, color: 'var(--color-text)' },
                { label: 'Available', value: allProducts.length - outCount, color: '#22c55e' },
                { label: 'Out of Stock', value: outCount, color: '#ef4444' },
              ].map(s => (
                <div key={s.label} className="stat-card" style={{ minWidth: 120, padding: '0.75rem 1.25rem' }}>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: 800, color: s.color }}>{s.value}</p>
                </div>
              ))}
              <div style={{ marginLeft: 'auto', alignSelf: 'center', padding: '0.4rem 0.75rem', background: 'rgba(74,124,89,0.08)', borderRadius: 8, fontSize: '0.75rem', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                🔒 View only — franchisee controls stock
              </div>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Search items…"
                value={stockSearch}
                onChange={e => setStockSearch(e.target.value)}
                style={{ flex: '1 1 200px', padding: '0.5rem 0.875rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: '0.875rem' }}
              />
              <div style={{ display: 'flex', gap: '0.375rem' }}>
                {(['all', 'available', 'out'] as const).map(f => (
                  <button key={f} onClick={() => setStockFilter(f)} style={{
                    padding: '0.5rem 0.875rem', borderRadius: 'var(--radius-md)', border: '1px solid',
                    borderColor: stockFilter === f ? 'var(--color-primary)' : 'var(--color-border)',
                    background: stockFilter === f ? 'rgba(74,124,89,0.12)' : 'var(--color-surface)',
                    color: stockFilter === f ? 'var(--color-primary-light)' : 'var(--color-text-muted)',
                    fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                  }}>
                    {f === 'all' ? 'All' : f === 'available' ? '✓ Available' : '✗ Out of Stock'}
                  </button>
                ))}
              </div>
            </div>

            {/* Product table */}
            <div className="table-wrapper">
              <div className="table-header">
                <p className="table-title">Menu Items</p>
                <span className="badge badge-muted">{filtered.length} of {allProducts.length} shown</span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Status at Branch</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>No items match your filters.</td></tr>
                  ) : filtered.map(p => {
                    const isOut = outOfStockIds.has(p.id)
                    return (
                      <tr key={p.id} style={{ opacity: isOut ? 0.65 : 1 }}>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{p.name}</div>
                        </td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{p.category}</td>
                        <td style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-accent)' }}>₱{Number(p.price).toFixed(0)}</td>
                        <td>
                          {isOut
                            ? <span className="badge badge-danger">✗ Out of Stock</span>
                            : <span className="badge badge-success">✓ Available</span>
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}

      {/* ── INVENTORY TAB ── */}
      {tab === 'inventory' && (() => {
        // Build lookup maps
        const logByItemId: Record<string, InvLog> = {}
        for (const l of invLogs) logByItemId[l.inventory_item_id] = l

        const mLogByProductId: Record<string, MenuItemLog> = {}
        for (const l of menuItemLogs) mLogByProductId[l.product_id] = l

        const productById: Record<string, StockProduct> = {}
        for (const p of invProducts) productById[p.id] = p

        // Filter items by current sub-sheet
        const sheetCategories = invCategories.filter(c => c.sheet_type === invSheet)
        const catIds = new Set(sheetCategories.map(c => c.id))
        const sheetItems = invItems.filter(i => catIds.has(i.category_id))

        // For menu_items sheet, use products directly
        const menuProducts = invProducts  // all POS products used as menu items

        const sheetLabels: Record<string, string> = {
          food_items: '🥩 Food Items',
          menu_items: '🍹 Menu Items',
          commissary: '🏭 Commissary',
        }

        return (
          <div>
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {(['menu_items', 'food_items', 'commissary'] as const).map(s => (
                  <button key={s} onClick={() => setInvSheet(s)} style={{
                    padding: '0.45rem 1rem', borderRadius: 'var(--radius-pill)', border: '1px solid',
                    borderColor: invSheet === s ? 'var(--color-primary)' : 'var(--color-border)',
                    background: invSheet === s ? 'rgba(74,124,89,0.15)' : 'transparent',
                    color: invSheet === s ? 'var(--color-primary-light)' : 'var(--color-text-muted)',
                    fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer',
                  }}>
                    {sheetLabels[s]}
                  </button>
                ))}
              </div>
              <div style={{ padding: '0.35rem 0.75rem', background: 'rgba(74,124,89,0.08)', borderRadius: 8, fontSize: '0.72rem', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                🔒 Read-only — today’s snapshot
              </div>
            </div>

            {/* MENU ITEMS sheet */}
            {invSheet === 'menu_items' && (
              <div className="table-wrapper">
                <div className="table-header">
                  <p className="table-title">Menu Items — Today</p>
                  <span className="badge badge-muted">{menuProducts.length} items</span>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Category</th>
                      <th style={{ textAlign: 'center' }}>Starting</th>
                      <th style={{ textAlign: 'center' }}>Additional</th>
                      <th style={{ textAlign: 'center' }}>Sold</th>
                      <th style={{ textAlign: 'center' }}>Cancelled</th>
                      <th style={{ textAlign: 'center' }}>Voided</th>
                      <th style={{ textAlign: 'center' }}>Ending</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {menuProducts.length === 0 ? (
                      <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>No menu items found.</td></tr>
                    ) : menuProducts.map(p => {
                      const mLog = mLogByProductId[p.id]
                      const start = mLog?.starting_stock ?? null
                      const add   = mLog?.additional_stock ?? 0
                      const sold      = invSoldMap[p.id] ?? 0
                      const cancelled = invCancelledMap[p.id] ?? 0
                      const voided    = invVoidedMap[p.id] ?? 0
                      const ending = start !== null ? Math.max(0, start + add - sold) : null
                      const isOut = ending !== null && ending === 0
                      return (
                        <tr key={p.id} style={{ opacity: isOut ? 0.7 : 1 }}>
                          <td style={{ fontWeight: 600, fontSize: '0.85rem' }}>{p.name}</td>
                          <td style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{p.category}</td>
                          <td style={{ textAlign: 'center', fontSize: '0.85rem' }}>{start ?? <span style={{ color: 'var(--color-text-dim)' }}>—</span>}</td>
                          <td style={{ textAlign: 'center', fontSize: '0.85rem', color: add > 0 ? 'var(--color-success)' : undefined }}>{add || '—'}</td>
                          <td style={{ textAlign: 'center', fontSize: '0.85rem', color: sold > 0 ? 'var(--color-accent)' : undefined }}>{sold || '—'}</td>
                          <td style={{ textAlign: 'center', fontSize: '0.85rem', color: cancelled > 0 ? 'var(--color-warning)' : undefined }}>{cancelled || '—'}</td>
                          <td style={{ textAlign: 'center', fontSize: '0.85rem', color: voided > 0 ? 'var(--color-danger-light)' : undefined }}>{voided || '—'}</td>
                          <td style={{ textAlign: 'center', fontSize: '0.85rem', fontWeight: 700, color: isOut ? 'var(--color-danger-light)' : 'var(--color-success)' }}>
                            {ending !== null ? ending : <span style={{ color: 'var(--color-text-dim)' }}>—</span>}
                          </td>
                          <td>
                            {ending === null
                              ? <span className="badge badge-muted">No log</span>
                              : isOut
                                ? <span className="badge badge-danger">Out</span>
                                : <span className="badge badge-success">OK</span>
                            }
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* FOOD ITEMS / COMMISSARY sheets */}
            {(invSheet === 'food_items' || invSheet === 'commissary') && (() => {
              if (sheetCategories.length === 0) return (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>No {sheetLabels[invSheet]} categories found.</div>
              )
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {sheetCategories.map(cat => {
                    const catItemList = sheetItems.filter(i => i.category_id === cat.id)
                    if (catItemList.length === 0) return null
                    return (
                      <div key={cat.id} className="table-wrapper">
                        <div className="table-header">
                          <p className="table-title">{cat.name}</p>
                          <span className="badge badge-muted">{catItemList.length} items</span>
                        </div>
                        <table>
                          <thead>
                            <tr>
                              <th>Item</th>
                              <th>Unit</th>
                              <th style={{ textAlign: 'center' }}>Starting</th>
                              <th style={{ textAlign: 'center' }}>Additional</th>
                              <th style={{ textAlign: 'center' }}>Used</th>
                              <th style={{ textAlign: 'center' }}>Ending</th>
                              <th>Status</th>
                              <th>Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {catItemList.map(item => {
                              const log = logByItemId[item.id]
                              const start  = log?.starting_stock ?? null
                              const add    = log?.additional_stock ?? 0
                              const used   = log?.used_stock ?? 0
                              const ending = start !== null ? Math.max(0, start + add - used) : null
                              const min    = item.min_stock_level ?? 0
                              const isLow  = ending !== null && min > 0 && ending <= min
                              const isOut  = ending !== null && ending === 0
                              return (
                                <tr key={item.id} style={{ opacity: isOut ? 0.65 : 1 }}>
                                  <td style={{ fontWeight: 600, fontSize: '0.85rem' }}>{item.name}</td>
                                  <td style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{item.unit}</td>
                                  <td style={{ textAlign: 'center', fontSize: '0.85rem' }}>{start ?? <span style={{ color: 'var(--color-text-dim)' }}>—</span>}</td>
                                  <td style={{ textAlign: 'center', fontSize: '0.85rem', color: add > 0 ? 'var(--color-success)' : undefined }}>{add || '—'}</td>
                                  <td style={{ textAlign: 'center', fontSize: '0.85rem', color: used > 0 ? 'var(--color-warning)' : undefined }}>{used || '—'}</td>
                                  <td style={{ textAlign: 'center', fontSize: '0.85rem', fontWeight: 700,
                                    color: isOut ? 'var(--color-danger-light)' : isLow ? 'var(--color-warning)' : 'var(--color-success)' }}>
                                    {ending !== null ? ending : <span style={{ color: 'var(--color-text-dim)' }}>—</span>}
                                  </td>
                                  <td>
                                    {ending === null
                                      ? <span className="badge badge-muted">No log</span>
                                      : isOut ? <span className="badge badge-danger">Out</span>
                                      : isLow ? <span className="badge badge-warning">Low</span>
                                      : <span className="badge badge-success">OK</span>
                                    }
                                  </td>
                                  <td style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', maxWidth: 180 }}>{log?.notes || '—'}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        )
      })()}
    </div>
  )
}
