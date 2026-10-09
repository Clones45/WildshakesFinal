'use client'

import React, { useMemo, useState, type CSSProperties } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { manilaDay } from '@/lib/manila'
import { resolvePeriod, shiftDay } from '@/lib/period'
import { toCsv, downloadCsv, safeFilename } from '@/lib/inventory/csv'
import SalesDatePicker from './SalesDatePicker'
import { withParams } from '@/lib/href'

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

export interface Tx {
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
  /** Month being viewed, yyyy-mm. The server fetches only this month. */
  month: string
  /** Today in Manila, yyyy-mm-dd — nothing after it can be picked. */
  today: string
  /** The day the server chose for this address, yyyy-mm-dd, or '' for the whole month. */
  initialDay: string
  /** Every transaction in the month, newest first. */
  transactions: Tx[]
  /** Where a change of month navigates to. The owner's portal by default; the head office's franchise page passes its own address. */
  basePath?: string
}

// A whole month at a busy branch is over a thousand rows; draw them in batches
// so the page stays quick, with the totals still over every row.
const PAGE = 200

// Same labels as the Sales Report and the POS so the three screens read alike.
const MONTH_LABEL = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
const DAY_LABEL = (day: string) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
const activePill: CSSProperties = {
  background: 'var(--color-primary)',
  borderColor: 'var(--color-primary)',
  color: '#fff',
}

export default function FranchiserTransactionsClient({ branchName, month, today, initialDay, transactions, basePath = '/franchiser/transactions' }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [search, setSearch]     = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(PAGE)

  // The day in view ('' = the whole month) is read from the address bar, never kept
  // apart from it, so a refresh, the Back button and a copied link all show the same
  // day. resolvePeriod is the same rule the server used to choose the month; the
  // server's own choice stands in only while a change of month is on its way.
  const fromUrl = resolvePeriod(searchParams.get('month'), searchParams.get('day'), today)
  const selectedDay = fromUrl.month === month ? fromUrl.day : initialDay

  const yesterday  = shiftDay(today, -1)
  const rangeLabel = selectedDay ? DAY_LABEL(selectedDay) : MONTH_LABEL(month)

  // Pick a day ('' = the whole month) in a month.
  // Same month: everything needed is already here, so only the address changes.
  // Next.js passes the new address to useSearchParams without asking the server
  // again, and the list narrows at once. Another month: navigate, so the server
  // fetches it (the page's loading screen shows meanwhile).
  const pick = (m: string, d: string) => {
    const href = withParams(basePath, { month: m, day: d })
    if (m !== month) { router.push(href); return }
    setVisibleCount(PAGE)
    setExpanded(null)
    window.history.replaceState(null, '', href)
  }

  // Which Manila day each sale belongs to, worked out once per load. An 11pm sale
  // must not be filed under the next day just because UTC has already rolled over.
  const dayOf = useMemo(() => new Map(transactions.map(tx => [tx.id, manilaDay(tx.created_at)])), [transactions])
  const inRange = transactions.filter(tx => selectedDay === '' || dayOf.get(tx.id) === selectedDay)

  const q = search.trim().toLowerCase()
  const filtered = inRange.filter(tx => {
    const statusOk = statusFilter === 'all' || tx.status === statusFilter
    const ref      = (tx.local_ref || tx.reference_number || tx.id).toLowerCase()
    const cashier  = (tx.users?.name || '').toLowerCase()
    const searchOk = !q || ref.includes(q) || cashier.includes(q)
    return statusOk && searchOk
  })
  const narrowed = q !== '' || statusFilter !== 'all'

  const completed    = filtered.filter(t => t.status === 'completed')
  const totalRevenue = completed.reduce((s, t) => s + Number(t.total_amount), 0)
  const totalVoided  = filtered.filter(t => t.status === 'voided').length

  function exportCSV() {
    const header = ['Ref', 'Date', 'Time', 'Branch', 'Cashier', 'Amount', 'Discount', 'Discount type', 'Payment', 'Status']
    const rows = filtered.map(tx => [
      (tx.local_ref || tx.reference_number || tx.id).slice(-8).toUpperCase(),
      dayOf.get(tx.id) ?? manilaDay(tx.created_at),
      new Date(tx.created_at).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' }),
      tx.branches?.name ?? '',
      tx.users?.name ?? '',
      Number(tx.total_amount).toFixed(2),
      Number(tx.discount_amount).toFixed(2),
      tx.discount_type && tx.discount_type !== 'none' ? tx.discount_type : '',
      tx.payment_method,
      tx.status,
    ])
    downloadCsv(`${safeFilename(branchName)}-transactions-${selectedDay || month}.csv`, toCsv(header, rows))
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
          <p className="page-header-subtitle">Every sale at {branchName}. Pick a day, or a whole month.</p>
        </div>
        <div className="flex gap-1" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Today and yesterday in one tap; the calendar for any other day, or a
              whole month. It is the same calendar as the Sales Report and the POS. */}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={selectedDay === today ? activePill : undefined}
            onClick={() => pick(today.slice(0, 7), today)}
          >
            Today
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={selectedDay === yesterday ? activePill : undefined}
            onClick={() => pick(yesterday.slice(0, 7), yesterday)}
          >
            Yesterday
          </button>
          <SalesDatePicker month={month} day={selectedDay} today={today} onPick={pick} />
          <button className="btn btn-ghost" onClick={exportCSV}>📥 Export CSV</button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="stat-grid" style={{ marginBottom: '1.25rem' }}>
        <div className="stat-card">
          <div className="stat-card-icon green">✅</div>
          <p className="stat-card-label">Completed Revenue</p>
          <p className="stat-card-value">₱{totalRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
          <p className="stat-card-trend neutral">{completed.length} transactions · {rangeLabel}</p>
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
          <p className="stat-card-label">Transactions</p>
          <p className="stat-card-value">{filtered.length}</p>
          <p className="stat-card-trend neutral">{narrowed ? `of ${inRange.length} · ${rangeLabel}` : rangeLabel}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="table-wrapper">
        <div className="table-header" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <p className="table-title">Transactions</p>
            <span className="badge badge-muted">{rangeLabel}</span>
          </div>
          <div className="flex gap-1" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="table-search">
              🔍
              <input
                type="text"
                placeholder="Search ref or cashier…"
                value={search}
                onChange={e => { setSearch(e.target.value); setVisibleCount(PAGE) }}
              />
            </div>
            <select
              className="form-select"
              style={{ width: 'auto' }}
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setVisibleCount(PAGE) }}
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="voided">Voided</option>
              <option value="pending">Pending</option>
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
                  {inRange.length === 0
                    ? `No transactions ${selectedDay ? 'on' : 'in'} ${rangeLabel}`
                    : 'No transactions match your filters'}
                </td>
              </tr>
            ) : (
              filtered.slice(0, visibleCount).map(tx => (
                <React.Fragment key={tx.id}>
                  <tr
                    style={{ opacity: tx.status === 'voided' ? 0.65 : 1, cursor: 'pointer' }}
                    onClick={() => setExpanded(expanded === tx.id ? null : tx.id)}
                  >
                    <td style={{ fontFamily: 'monospace', fontSize: '0.73rem', color: 'var(--color-text-muted)' }}>
                      {(tx.local_ref || tx.reference_number || tx.id).slice(-8).toUpperCase()}
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>
                      <div>{new Date(tx.created_at).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}</div>
                      <div style={{ color: 'var(--color-text-muted)', fontSize: '0.72rem' }}>
                        {new Date(tx.created_at).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' })}
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
            {filtered.length > visibleCount && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '0.75rem' }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setVisibleCount(n => n + PAGE)}>
                    Show more · {filtered.length - visibleCount} of {filtered.length} not shown
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
