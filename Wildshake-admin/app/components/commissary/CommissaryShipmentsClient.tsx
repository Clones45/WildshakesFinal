'use client'

import { useState, useTransition } from 'react'
import { createCommissaryShipmentFromCommissary } from '@/lib/actions/commissaryBranch'
import { markShipmentSent, markShipmentReceived, cancelShipment } from '@/lib/actions/commissary'

interface Branch { id: string; name: string }
interface InventoryItem { id: string; name: string; unit: string | null; category?: { name: string } }
interface Franchise { id: string; name: string; branches: Branch[] }
interface Shipment {
  id: string
  quantity_sent: number
  quantity_unit: string | null
  status: string
  notes: string | null
  created_at: string
  sent_at: string | null
  received_at: string | null
  branches: { id: string; name: string } | null
  inventory_items: { id: string; name: string; unit: string | null } | null
}

interface Props {
  commissaryId: string
  franchises: Franchise[]
  inventoryItems: InventoryItem[]
  shipments: Shipment[]
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'warning',
  in_transit: 'blue',
  received: 'success',
  rejected: 'danger',
  cancelled: 'muted',
}

export default function CommissaryShipmentsClient({ commissaryId, franchises, inventoryItems, shipments }: Props) {
  const [showModal, setShowModal]       = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [formError, setFormError]       = useState('')
  const [formSuccess, setFormSuccess]   = useState('')
  const [selectedFranchise, setSelectedFranchise] = useState('')
  const [isPending, startTransition]    = useTransition()

  // Flatten branches from selected franchise for the modal
  const availableBranches = franchises.find(f => f.id === selectedFranchise)?.branches || []

  const filtered = shipments.filter(s =>
    statusFilter === 'all' || s.status === statusFilter
  )

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError('')
    setFormSuccess('')
    const fd = new FormData(e.currentTarget)
    fd.set('source_commissary_id', commissaryId)
    startTransition(async () => {
      const result = await createCommissaryShipmentFromCommissary(fd)
      if (result.error) { setFormError(result.error); return }
      setFormSuccess('Shipment created successfully!')
      setTimeout(() => { setShowModal(false); setFormSuccess('') }, 1500)
    })
  }

  function handleAction(fn: () => Promise<{ error?: string } | void>) {
    startTransition(async () => { await fn() })
  }

  const pending   = shipments.filter(s => s.status === 'pending').length
  const inTransit = shipments.filter(s => s.status === 'in_transit').length
  const received  = shipments.filter(s => s.status === 'received').length

  return (
    <>
      <div className="page-header">
        <div>
          <h1>📦 Shipments</h1>
          <p className="page-header-subtitle">Deploy inventory to your franchisee branches</p>
        </div>
        <button className="btn btn-accent" onClick={() => setShowModal(true)}>
          🚚 Create Shipment
        </button>
      </div>

      {/* Stats */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-card-icon gold">📋</div>
          <p className="stat-card-label">Pending</p>
          <p className="stat-card-value">{pending}</p>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon blue">🚚</div>
          <p className="stat-card-label">In Transit</p>
          <p className="stat-card-value">{inTransit}</p>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon green">✅</div>
          <p className="stat-card-label">Received</p>
          <p className="stat-card-value">{received}</p>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon green">📦</div>
          <p className="stat-card-label">Total Shipments</p>
          <p className="stat-card-value">{shipments.length}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="table-wrapper">
        <div className="table-header">
          <p className="table-title">Shipment History</p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {(['all', 'pending', 'in_transit', 'received', 'rejected', 'cancelled'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-ghost'}`}
              >
                {s === 'all' ? 'All' : s.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Branch</th>
              <th>Item</th>
              <th>Quantity</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2.5rem' }}>
                  No shipments found.
                </td>
              </tr>
            ) : (
              filtered.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.branches?.name ?? '—'}</td>
                  <td>{s.inventory_items?.name ?? '—'}</td>
                  <td>{s.quantity_sent} {s.quantity_unit || s.inventory_items?.unit || ''}</td>
                  <td>
                    <span className={`badge badge-${STATUS_COLORS[s.status] ?? 'muted'}`}>
                      {s.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                    {new Date(s.created_at).toLocaleDateString('en-PH')}
                  </td>
                  <td>
                    <div className="flex gap-1">
                      {s.status === 'pending' && (
                        <>
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={isPending}
                            onClick={() => handleAction(() => markShipmentSent(s.id))}
                          >
                            Mark Sent
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            disabled={isPending}
                            onClick={() => handleAction(() => cancelShipment(s.id))}
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      {s.status === 'in_transit' && (
                        <span className="badge badge-muted" style={{ fontSize: '0.72rem' }}>
                          Awaiting franchisee
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Shipment Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <p className="modal-title">🚚 Create Shipment</p>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>

            {formError   && <div className="alert alert-danger">{formError}</div>}
            {formSuccess && <div className="alert alert-success">{formSuccess}</div>}

            <form onSubmit={handleCreate}>
              <div className="modal-body">
                {/* Select Franchise first, then Branch */}
                <div className="form-group">
                  <label className="form-label">Franchisee *</label>
                  <select
                    className="form-input"
                    value={selectedFranchise}
                    onChange={e => setSelectedFranchise(e.target.value)}
                    required
                  >
                    <option value="">Select franchisee…</option>
                    {franchises.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Branch *</label>
                  <select name="branch_id" className="form-input" required disabled={!selectedFranchise}>
                    <option value="">Select branch…</option>
                    {availableBranches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Item *</label>
                  <select name="inventory_item_id" className="form-input" required>
                    <option value="">Select item…</option>
                    {inventoryItems.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.name} {item.unit ? `(${item.unit})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Quantity *</label>
                    <input
                      name="quantity"
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="form-input"
                      placeholder="e.g. 10"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Unit (optional)</label>
                    <input
                      name="quantity_unit"
                      className="form-input"
                      placeholder="e.g. kg, pcs"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Notes (optional)</label>
                  <textarea name="notes" className="form-input" rows={2} placeholder="Delivery notes…" />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isPending}>
                  {isPending ? <><span className="loading-spinner" />Creating…</> : '🚚 Create Shipment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
