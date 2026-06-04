'use client'

import { useState } from 'react'

interface Transaction {
  id: string
  total_amount: number
  discount_amount: number
  payment_method: string
  status: string
  created_at: string
  branch_id: string
}

interface Branch { id: string; name: string; franchise_id: string }
interface Franchise { id: string; name: string }

interface Props {
  franchises: Franchise[]
  branches: Branch[]
  transactions: Transaction[]
}

export default function CommissaryReportsClient({ franchises, branches, transactions }: Props) {
  const [selectedFranchise, setSelectedFranchise] = useState('all')
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0])

  const branchIdToFranchise = Object.fromEntries(
    branches.map(b => [b.id, franchises.find(f => f.id === b.franchise_id)])
  )

  const filtered = transactions.filter(t => {
    const date = t.created_at.split('T')[0]
    const matchDate = date >= dateFrom && date <= dateTo
    if (!matchDate) return false
    if (selectedFranchise === 'all') return true
    const franchise = branchIdToFranchise[t.branch_id]
    return franchise?.id === selectedFranchise
  })

  const completed = filtered.filter(t => t.status === 'completed')
  const totalRevenue = completed.reduce((s, t) => s + Number(t.total_amount), 0)
  const totalDiscount = completed.reduce((s, t) => s + Number(t.discount_amount), 0)

  // Group by franchise
  const byFranchise = franchises.map(f => {
    const fBranchIds = new Set(branches.filter(b => b.franchise_id === f.id).map(b => b.id))
    const fTxns = completed.filter(t => fBranchIds.has(t.branch_id))
    const revenue = fTxns.reduce((s, t) => s + Number(t.total_amount), 0)
    return { franchise: f, txCount: fTxns.length, revenue }
  }).filter(r => r.txCount > 0 || selectedFranchise === 'all')

  // Group by date for chart-like table
  const byDate: Record<string, number> = {}
  completed.forEach(t => {
    const date = t.created_at.split('T')[0]
    byDate[date] = (byDate[date] || 0) + Number(t.total_amount)
  })
  const dateEntries = Object.entries(byDate).sort(([a], [b]) => b.localeCompare(a))

  function peso(v: number) {
    return `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>📈 Reports</h1>
          <p className="page-header-subtitle">Sales performance across your franchisee network</p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          className="form-select"
          value={selectedFranchise}
          onChange={e => setSelectedFranchise(e.target.value)}
          style={{ width: 'auto' }}
        >
          <option value="all">All Franchisees</option>
          {franchises.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input type="date" className="form-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: 'auto' }} />
          <span style={{ color: 'var(--color-text-muted)' }}>→</span>
          <input type="date" className="form-input" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width: 'auto' }} />
        </div>
      </div>

      {/* Summary Stats */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-card-icon green">💰</div>
          <p className="stat-card-label">Total Revenue</p>
          <p className="stat-card-value" style={{ fontSize: '1.1rem' }}>{peso(totalRevenue)}</p>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon blue">🧾</div>
          <p className="stat-card-label">Transactions</p>
          <p className="stat-card-value">{completed.length}</p>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon gold">🏷️</div>
          <p className="stat-card-label">Total Discounts</p>
          <p className="stat-card-value" style={{ fontSize: '1.1rem' }}>{peso(totalDiscount)}</p>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon green">📊</div>
          <p className="stat-card-label">Avg per Transaction</p>
          <p className="stat-card-value" style={{ fontSize: '1.1rem' }}>
            {completed.length > 0 ? peso(totalRevenue / completed.length) : '—'}
          </p>
        </div>
      </div>

      {/* By Franchise */}
      <div className="table-wrapper" style={{ marginBottom: '1.5rem' }}>
        <div className="table-header">
          <p className="table-title">Sales by Franchisee</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>Franchisee</th>
              <th style={{ textAlign: 'right' }}>Transactions</th>
              <th style={{ textAlign: 'right' }}>Revenue</th>
              <th style={{ textAlign: 'right' }}>Share</th>
            </tr>
          </thead>
          <tbody>
            {byFranchise.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>
                  No sales in this period.
                </td>
              </tr>
            ) : (
              byFranchise.map(({ franchise, txCount, revenue }) => (
                <tr key={franchise.id}>
                  <td style={{ fontWeight: 600 }}>{franchise.name}</td>
                  <td style={{ textAlign: 'right' }}>{txCount}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-accent)' }}>{peso(revenue)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--color-text-muted)' }}>
                    {totalRevenue > 0 ? `${((revenue / totalRevenue) * 100).toFixed(1)}%` : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* By Date */}
      <div className="table-wrapper">
        <div className="table-header">
          <p className="table-title">Daily Sales Breakdown</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th style={{ textAlign: 'right' }}>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {dateEntries.length === 0 ? (
              <tr>
                <td colSpan={2} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>
                  No daily data.
                </td>
              </tr>
            ) : (
              dateEntries.map(([date, revenue]) => (
                <tr key={date}>
                  <td>{new Date(date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-accent)' }}>{peso(revenue)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
