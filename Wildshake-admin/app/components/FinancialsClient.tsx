'use client'

import { useState } from 'react'

interface Transaction {
  id: string
  total_amount: number
  discount_amount: number
  payment_method: string
  status: string
  created_at: string
  branches: { name: string } | null
}

interface FinancialsClientProps {
  transactions: Transaction[]
  branches: { id: string; name: string }[]
}

function groupByField<T>(items: T[], keyFn: (i: T) => string) {
  const map: Record<string, number> = {}
  items.forEach(item => {
    const key = keyFn(item)
    map[key] = (map[key] || 0) + Number((item as unknown as { total_amount: number }).total_amount)
  })
  return Object.entries(map).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
}

export default function FinancialsClient({ transactions, branches }: FinancialsClientProps) {
  const [filter, setFilter] = useState('all') // 'all' | branch id
  const [dateRange, setDateRange] = useState('30') // days

  const cutoff = new Date(Date.now() - parseInt(dateRange) * 24 * 60 * 60 * 1000)

  const filtered = transactions.filter(t => {
    const dateOk = new Date(t.created_at) >= cutoff
    const branchOk = filter === 'all' || t.branches?.name === branches.find(b => b.id === filter)?.name
    return dateOk && branchOk
  })

  const totalRevenue    = filtered.reduce((s, t) => s + Number(t.total_amount), 0)
  const totalDiscount   = filtered.reduce((s, t) => s + Number(t.discount_amount), 0)
  const netRevenue      = totalRevenue - totalDiscount

  const byBranch  = groupByField(filtered, t => t.branches?.name || 'Unknown')
  const byPayment = groupByField(filtered, t => t.payment_method)
  const maxBranch  = Math.max(...byBranch.map(b => b.value), 1)
  const maxPayment = Math.max(...byPayment.map(p => p.value), 1)

  // CSV Export
  function handleExport() {
    const header = 'Date,Branch,Amount,Discount,Payment Method\n'
    const rows = filtered.map(t =>
      `${new Date(t.created_at).toLocaleDateString('en-PH')},${t.branches?.name || ''},${t.total_amount},${t.discount_amount},${t.payment_method}`
    ).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `wildshakes-revenue-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Financial Analytics</h1>
          <p className="page-header-subtitle">Aggregated revenue insights across all franchise outlets</p>
        </div>
        <div className="flex gap-1">
          <select
            className="form-select"
            style={{ width: 'auto' }}
            value={dateRange}
            onChange={e => setDateRange(e.target.value)}
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last 12 months</option>
          </select>
          <select
            className="form-select"
            style={{ width: 'auto' }}
            value={filter}
            onChange={e => setFilter(e.target.value)}
          >
            <option value="all">All Branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button className="btn btn-ghost" onClick={handleExport}>📥 Export CSV</button>
        </div>
      </div>

      {/* Revenue KPI row */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '2rem' }}>
        <div className="stat-card">
          <div className="stat-card-icon green">💰</div>
          <p className="stat-card-label">Gross Revenue</p>
          <p className="stat-card-value">₱{totalRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon gold">🏷️</div>
          <p className="stat-card-label">Total Discounts</p>
          <p className="stat-card-value">₱{totalDiscount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon blue">📈</div>
          <p className="stat-card-label">Net Revenue</p>
          <p className="stat-card-value">₱{netRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      <div className="chart-grid">
        {/* Revenue by Branch */}
        <div className="chart-card">
          <p className="chart-title">Revenue by Branch</p>
          {byBranch.length === 0 ? (
            <p className="text-muted text-sm">No data for selected period</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {byBranch.map((item, i) => (
                <div key={i}>
                  <div className="flex justify-between" style={{ marginBottom: '0.3rem' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{item.label}</span>
                    <span style={{ fontSize: '0.875rem', color: 'var(--color-accent)', fontWeight: 700 }}>
                      ₱{item.value.toLocaleString('en-PH', { minimumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className="stock-bar">
                    <div
                      className="stock-bar-fill good"
                      style={{ width: `${(item.value / maxBranch) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Revenue by Payment Method */}
        <div className="chart-card">
          <p className="chart-title">Revenue by Payment Method</p>
          {byPayment.length === 0 ? (
            <p className="text-muted text-sm">No data for selected period</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {byPayment.map((item, i) => {
                const colors = ['var(--color-primary)', 'var(--color-accent)', 'var(--color-info)', 'var(--color-success)']
                return (
                  <div key={i}>
                    <div className="flex justify-between" style={{ marginBottom: '0.3rem' }}>
                      <span style={{ fontSize: '0.875rem', fontWeight: 600, textTransform: 'capitalize' }}>
                        {item.label === 'gcash' ? 'GCash' : item.label}
                      </span>
                      <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)' }}>
                        {((item.value / totalRevenue) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="stock-bar">
                      <div
                        style={{
                          height: '100%',
                          borderRadius: '999px',
                          background: colors[i % colors.length],
                          width: `${(item.value / maxPayment) * 100}%`,
                          transition: 'width 0.5s ease',
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Transaction Table */}
      <div className="table-wrapper mt-3">
        <div className="table-header">
          <p className="table-title">Transaction Detail</p>
          <span className="badge badge-muted">{filtered.length} records</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Branch</th>
              <th>Gross</th>
              <th>Discount</th>
              <th>Net</th>
              <th>Payment</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 50).map(t => (
              <tr key={t.id}>
                <td style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  {new Date(t.created_at).toLocaleDateString('en-PH')}
                </td>
                <td>{t.branches?.name || '—'}</td>
                <td style={{ fontWeight: 600 }}>₱{Number(t.total_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                <td style={{ color: 'var(--color-warning)' }}>
                  {Number(t.discount_amount) > 0 ? `-₱${Number(t.discount_amount).toFixed(2)}` : '—'}
                </td>
                <td style={{ fontWeight: 700, color: 'var(--color-accent)' }}>
                  ₱{(Number(t.total_amount) - Number(t.discount_amount)).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </td>
                <td style={{ textTransform: 'capitalize' }}>{t.payment_method}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>
                  No transactions in selected period
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
