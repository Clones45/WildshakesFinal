'use client'

import React, { useState } from 'react'

interface TxItem {
  quantity: number
  unit_price: number
  subtotal: number
  notes?: string | null
  cancelled?: boolean | null
  products: { name: string; category: string } | null
}

const SIZE_FROM_CATEGORY: Record<string, string> = {
  'Fruitshakes Grande': 'Grande',
  'Fruitshakes Petite': 'Petite',
  'Milkshakes Grande':  'Grande',
  'Milkshakes Petite':  'Petite',
}

interface SplitPaymentEntry {
  method: string
  amount: number
  referenceNumber?: string
  bankName?: string
}

interface Tx {
  id: string
  local_ref: string | null
  reference_number: string | null
  bank_name: string | null
  split_payments: SplitPaymentEntry[] | null
  total_amount: number
  discount_type: string | null
  discount_amount: number
  payment_method: string
  status: string
  created_at: string
  void_reason: string | null
  table_number: string | null
  delivery_platform: 'foodpanda' | 'grab' | null
  users: { name: string } | null
  branches: { name: string } | null
  transaction_items: TxItem[]
}

interface Props {
  branchName: string
  transactions: Tx[]
}

export default function FranchiserTransactionsClient({ branchName, transactions }: Props) {
  const [search, setSearch]     = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFilter, setDateFilter]     = useState('30')
  const [expanded, setExpanded] = useState<string | null>(null)

  const cutoff = new Date(Date.now() - parseInt(dateFilter) * 24 * 60 * 60 * 1000)

  const filtered = transactions.filter(tx => {
    const dateOk   = new Date(tx.created_at) >= cutoff
    const statusOk = statusFilter === 'all' || tx.status === statusFilter
    const ref      = (tx.local_ref || tx.reference_number || tx.id).toLowerCase()
    const cashier  = (tx.users?.name || '').toLowerCase()
    const searchOk = !search || ref.includes(search.toLowerCase()) || cashier.includes(search.toLowerCase())
    return dateOk && statusOk && searchOk
  })

  const totalRevenue = filtered.filter(t => t.status === 'completed').reduce((s, t) => s + Number(t.total_amount), 0)
  const totalVoided  = filtered.filter(t => t.status === 'voided').length

  function exportCSV() {
    const header = 'Ref,Date,Cashier,Amount,Discount,Payment,Status\n'
    const rows = filtered.map(tx =>
      `${(tx.local_ref || tx.reference_number || tx.id).slice(-8).toUpperCase()},${new Date(tx.created_at).toLocaleString()},${tx.users?.name || ''},${tx.total_amount},${tx.discount_amount},${tx.payment_method},${tx.status}`
    ).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${branchName}-transactions-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const payLabels: Record<string, string> = {
    cash: '💵', gcash: '📱', maya: '🟣', bank_transfer: '🏦', card: '💳', other: '📎', split: '🔀'
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Transaction History</h1>
          <p className="page-header-subtitle">All transactions for {branchName}</p>
        </div>
        <button className="btn btn-ghost" onClick={exportCSV}>📥 Export CSV</button>
      </div>

      {/* Summary KPIs */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '1.25rem' }}>
        <div className="stat-card">
          <div className="stat-card-icon green">✅</div>
          <p className="stat-card-label">Completed Revenue</p>
          <p className="stat-card-value">₱{totalRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
          <p className="stat-card-trend neutral">{filtered.filter(t => t.status === 'completed').length} transactions</p>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon red">🔴</div>
          <p className="stat-card-label">Voided</p>
          <p className="stat-card-value">{totalVoided}</p>
          <p className={`stat-card-trend ${totalVoided > 0 ? 'down' : 'up'}`}>
            {totalVoided > 0 ? 'Requires review' : 'No voids'}
          </p>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon gold">🧾</div>
          <p className="stat-card-label">Total Shown</p>
          <p className="stat-card-value">{filtered.length}</p>
          <p className="stat-card-trend neutral">of {transactions.length} loaded</p>
        </div>
      </div>

      {/* Filters */}
      <div className="table-wrapper">
        <div className="table-header" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
          <p className="table-title">Transactions</p>
          <div className="flex gap-1" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="table-search">
              🔍
              <input
                type="text"
                placeholder="Search ref or cashier…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select className="form-select" style={{ width: 'auto' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="voided">Voided</option>
              <option value="pending">Pending</option>
            </select>
            <select className="form-select" style={{ width: 'auto' }} value={dateFilter} onChange={e => setDateFilter(e.target.value)}>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Ref #</th>
              <th>Date &amp; Time</th>
              <th>Cashier</th>
              <th>Amount</th>
              <th>Payment</th>
              <th>Status</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '3rem' }}>
                  No transactions match your filters
                </td>
              </tr>
            ) : (
              filtered.map(tx => (
                <React.Fragment key={tx.id}>
                  <tr
                    style={{ opacity: tx.status === 'voided' ? 0.65 : 1, cursor: 'pointer' }}
                    onClick={() => setExpanded(expanded === tx.id ? null : tx.id)}
                  >
                    <td style={{ fontFamily: 'monospace', fontSize: '0.73rem', color: 'var(--color-text-muted)' }}>
                      {(tx.local_ref || tx.reference_number || tx.id).slice(-8).toUpperCase()}
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>
                      <div>{new Date(tx.created_at).toLocaleDateString('en-PH')}</div>
                      <div style={{ color: 'var(--color-text-muted)', fontSize: '0.72rem' }}>
                        {new Date(tx.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td style={{ fontSize: '0.82rem' }}>
                      {tx.users?.name || '—'}
                      {tx.branches && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{tx.branches.name}</div>
                      )}
                    </td>
                    <td>
                      <span style={{ fontWeight: 700, color: tx.status === 'voided' ? 'var(--color-danger-light)' : 'var(--color-accent)' }}>
                        ₱{Number(tx.total_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </span>
                      {Number(tx.discount_amount) > 0 && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                          -{tx.discount_type} ₱{Number(tx.discount_amount).toFixed(2)}
                        </div>
                      )}
                      {/* Cancelled items pill */}
                      {(tx.transaction_items || []).some(i => i.cancelled) && (
                        <div style={{
                          display: 'inline-block', marginTop: '3px',
                          fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.04em',
                          background: 'rgba(220,53,69,0.12)', color: '#dc3545',
                          border: '1px solid rgba(220,53,69,0.25)',
                          borderRadius: '99px', padding: '1px 7px',
                        }}>
                          ⚠ {(tx.transaction_items || []).filter(i => i.cancelled).length} cancelled
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>
                      {payLabels[tx.payment_method] || '📎'} {tx.payment_method.replace('_', ' ')}
                      {tx.payment_method === 'split' && tx.split_payments && tx.split_payments.length > 0 && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                          {tx.split_payments.map((s, i) => (
                            <span key={i}>
                              {payLabels[s.method] || ''} {s.method.replace('_', ' ')} ₱{s.amount.toFixed(2)}
                              {i < tx.split_payments!.length - 1 ? ' + ' : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`badge badge-${tx.status === 'completed' ? 'success' : tx.status === 'voided' ? 'danger' : 'warning'}`}>
                        {tx.status}
                      </span>
                      {tx.delivery_platform === 'foodpanda' && (
                        <div style={{ marginTop: 4 }}>
                          <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'rgba(232,0,94,0.15)', color: '#e8005e', border: '1px solid rgba(232,0,94,0.3)' }}>🐼 FoodPanda</span>
                        </div>
                      )}
                      {tx.delivery_platform === 'grab' && (
                        <div style={{ marginTop: 4 }}>
                          <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'rgba(0,177,79,0.15)', color: '#00b14f', border: '1px solid rgba(0,177,79,0.3)' }}>🟢 Grab</span>
                        </div>
                      )}
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm">
                        {expanded === tx.id ? '▲' : '▼'}
                      </button>
                    </td>
                  </tr>

                  {/* Expandable items row */}
                  {expanded === tx.id && (
                    <tr key={`${tx.id}-items`} style={{ background: 'rgba(74,124,89,0.04)' }}>
                      <td colSpan={7} style={{ padding: '0.75rem 1.25rem' }}>
                        {tx.void_reason && (
                          <div style={{
                            marginBottom: '0.5rem', padding: '0.5rem 0.75rem',
                            background: 'rgba(220,53,69,0.08)', borderRadius: '6px',
                            fontSize: '0.8rem', color: 'var(--color-danger-light)',
                            border: '1px solid rgba(220,53,69,0.2)',
                          }}>
                            🚫 Void Reason: {tx.void_reason}
                          </div>
                        )}
                        {tx.table_number && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '0.4rem' }}>
                            🪑 Table: {tx.table_number}
                          </div>
                        )}
                        {tx.bank_name && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '0.4rem' }}>
                            🏦 Bank: {tx.bank_name} {tx.reference_number && `· Ref …${tx.reference_number}`}
                          </div>
                        )}
                        {!tx.bank_name && tx.reference_number && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '0.4rem' }}>
                            🔢 Ref …{tx.reference_number}
                          </div>
                        )}
                        <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                              <th style={{ textAlign: 'left', padding: '0.3rem 0.5rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Item</th>
                              <th style={{ textAlign: 'center', padding: '0.3rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Qty</th>
                              <th style={{ textAlign: 'right', padding: '0.3rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Price</th>
                              <th style={{ textAlign: 'right', padding: '0.3rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Subtotal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(tx.transaction_items || []).map((item, idx) => {
                              const isCancelled = !!item.cancelled
                              return (
                                <tr key={idx} style={{
                                  background: isCancelled ? 'rgba(220,53,69,0.10)' : undefined,
                                  borderLeft: isCancelled ? '3px solid #dc3545' : '3px solid transparent',
                                }}>
                                  <td style={{ padding: '0.4rem 0.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                      <span style={{ textDecoration: isCancelled ? 'line-through' : 'none', color: isCancelled ? '#dc3545' : undefined, fontWeight: isCancelled ? 600 : undefined }}>
                                        {item.products?.name || 'Unknown'}
                                      </span>
                                      {(() => {
                                        const sizeLabel = SIZE_FROM_CATEGORY[item.products?.category ?? '']
                                        if (!sizeLabel) return null
                                        return (
                                          <span style={{
                                            fontSize: '0.68rem', fontWeight: 800,
                                            background: isCancelled ? '#dc3545' : '#7c3aed',
                                            color: '#fff', borderRadius: '4px',
                                            padding: '1px 6px', letterSpacing: '0.05em',
                                            textDecoration: 'none',
                                          }}>
                                            {sizeLabel}
                                          </span>
                                        )
                                      })()}
                                      {isCancelled && (
                                        <span style={{ fontSize: '0.7rem', fontWeight: 800, background: '#dc3545', color: '#fff', borderRadius: '4px', padding: '1px 7px', letterSpacing: '0.05em' }}>
                                          cancelled
                                        </span>
                                      )}
                                      {item.notes && !isCancelled && (
                                        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.72rem' }}> — {item.notes}</span>
                                      )}
                                    </div>
                                  </td>
                                  <td style={{ textAlign: 'center', padding: '0.4rem 0.3rem', textDecoration: isCancelled ? 'line-through' : 'none', color: isCancelled ? '#dc3545' : undefined }}>×{item.quantity}</td>
                                  <td style={{ textAlign: 'right', padding: '0.4rem 0.3rem', color: isCancelled ? '#dc3545' : 'var(--color-text-muted)', textDecoration: isCancelled ? 'line-through' : 'none' }}>
                                    ₱{Number(item.unit_price).toFixed(2)}
                                  </td>
                                  <td style={{ textAlign: 'right', padding: '0.4rem 0.3rem', fontWeight: 700, color: isCancelled ? '#dc3545' : undefined, textDecoration: isCancelled ? 'line-through' : 'none' }}>
                                    {isCancelled ? <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#dc3545', textDecoration: 'none', display: 'inline-block' }}>not charged</span> : `₱${Number(item.subtotal).toFixed(2)}`}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
