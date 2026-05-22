'use client'

import { useState, useTransition } from 'react'
import { logShipment, updateShipmentStatus, createIngredient, setInventoryLevel } from '@/lib/actions/commissary'
import { createInventoryItem, updateInventoryItemStatus } from '@/lib/actions/inventorySetup'

interface InventoryItem {
  id: string
  current_stock: number
  safety_level: number
  ingredients: { id: string; name: string; unit_of_measure: string } | null
  branches: { id: string; name: string } | null
}

interface Shipment {
  id: string
  quantity_sent: number
  unit_cost: number
  status: string
  notes: string | null
  created_at: string
  ingredients: { name: string } | null
  branches: { name: string } | null
}

interface CommissaryClientProps {
  inventory: InventoryItem[]
  shipments: Shipment[]
  branches: { id: string; name: string }[]
  ingredients: { id: string; name: string; unit_of_measure: string }[]
  inventoryCategories?: { id: string; name: string; sheet_type: string }[]
  inventoryItems?: { id: string; category_id: string; name: string; unit: string | null; min_stock_level: number; is_active: boolean }[]
}

export default function CommissaryClient({ inventory, shipments, branches, ingredients, inventoryCategories = [], inventoryItems = [] }: CommissaryClientProps) {
  const [activeTab, setActiveTab] = useState<'commissary' | 'franchise_inventory'>('commissary')
  const [modal, setModal] = useState<'shipment' | 'ingredient' | 'stock' | 'inventory_item' | null>(null)
  const [formError, setFormError]   = useState('')
  const [formSuccess, setFormSuccess] = useState('')
  const [isPending, startTransition] = useTransition()

  const lowStock = inventory.filter(i => i.current_stock < i.safety_level)
  const byBranch = branches.map(b => ({
    ...b,
    items: inventory.filter(i => i.branches?.id === b.id),
  }))

  function openModal(m: 'shipment' | 'ingredient' | 'stock') {
    setFormError(''); setFormSuccess(''); setModal(m)
  }

  async function handleLogShipment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError('')
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await logShipment(fd)
      if (result.error) { setFormError(result.error); return }
      setFormSuccess('Shipment logged!')
      setTimeout(() => { setModal(null); setFormSuccess('') }, 1500)
    })
  }

  async function handleAddIngredient(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError('')
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await createIngredient(fd)
      if (result.error) { setFormError(result.error); return }
      setFormSuccess('Ingredient added!')
      setTimeout(() => { setModal(null); setFormSuccess('') }, 1500)
    })
  }

  async function handleSetStock(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError('')
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await setInventoryLevel(fd)
      if (result.error) { setFormError(result.error); return }
      setFormSuccess('Stock level updated!')
      setTimeout(() => { setModal(null); setFormSuccess('') }, 1500)
    })
  }

  async function handleCreateInventoryItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError('')
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await createInventoryItem(fd)
      if (result.error) { setFormError(result.error); return }
      setFormSuccess('Franchise inventory item added!')
      setTimeout(() => { setModal(null); setFormSuccess('') }, 1500)
    })
  }

  async function handleToggleInventoryItem(id: string, current: boolean) {
    startTransition(async () => {
      await updateInventoryItemStatus(id, !current)
    })
  }

  async function handleStatus(id: string, status: string) {
    startTransition(async () => { await updateShipmentStatus(id, status) })
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Commissary & Supply Chain</h1>
          <p className="page-header-subtitle">Track ingredient stock levels across all branches and log shipments</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => openModal('ingredient')}>🧪 Add Ingredient</button>
        <button className="btn btn-ghost btn-sm" onClick={() => openModal('stock')}>📋 Set Stock Level</button>
        <button className="btn btn-accent" onClick={() => openModal('shipment')}>🚚 Log Shipment</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid var(--color-border)', marginBottom: '1.5rem' }}>
        <button
          onClick={() => setActiveTab('commissary')}
          style={{
            padding: '0.6rem 1.25rem', border: 'none', background: 'none', cursor: 'pointer',
            borderBottom: activeTab === 'commissary' ? '2px solid var(--color-accent)' : '2px solid transparent',
            color: activeTab === 'commissary' ? 'var(--color-accent)' : 'var(--color-text-muted)',
            fontWeight: activeTab === 'commissary' ? 700 : 400, fontSize: '0.88rem', transition: 'all 0.15s',
          }}
        >
          🏭 Commissary Stock & Shipments
        </button>
        <button
          onClick={() => setActiveTab('franchise_inventory')}
          style={{
            padding: '0.6rem 1.25rem', border: 'none', background: 'none', cursor: 'pointer',
            borderBottom: activeTab === 'franchise_inventory' ? '2px solid var(--color-accent)' : '2px solid transparent',
            color: activeTab === 'franchise_inventory' ? 'var(--color-accent)' : 'var(--color-text-muted)',
            fontWeight: activeTab === 'franchise_inventory' ? 700 : 400, fontSize: '0.88rem', transition: 'all 0.15s',
          }}
        >
          📋 Franchiser Inventory Setup
        </button>
      </div>

      {activeTab === 'commissary' && (
        <>
          {/* Summary row */}
          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-card-icon green">📦</div>
          <p className="stat-card-label">Total SKUs Tracked</p>
          <p className="stat-card-value">{inventory.length}</p>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon red">⚠️</div>
          <p className="stat-card-label">Low Stock Items</p>
          <p className="stat-card-value">{lowStock.length}</p>
          {lowStock.length > 0 && <p className="stat-card-trend down">Immediate restock needed</p>}
        </div>
        <div className="stat-card">
          <div className="stat-card-icon gold">🚚</div>
          <p className="stat-card-label">Shipments (Total)</p>
          <p className="stat-card-value">{shipments.length}</p>
        </div>
      </div>

      {/* Low Stock Alert Banner */}
      {lowStock.length > 0 && (
        <div className="alert alert-danger" style={{ marginBottom: '1.5rem', alignItems: 'flex-start' }}>
          <span style={{ fontSize: '1.2rem' }}>🚨</span>
          <div>
            <strong>Low Stock Alert</strong>
            <p style={{ color: 'var(--color-danger-light)', marginTop: '0.25rem', fontSize: '0.875rem' }}>
              {lowStock.map(i => `${i.ingredients?.name} at ${i.branches?.name}`).join(' · ')}
            </p>
          </div>
        </div>
      )}

      {/* Branch inventory grids */}
      {byBranch.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
          No branches found. Register franchises and their branches first.
        </div>
      ) : (
        byBranch.map(branch => (
          <div key={branch.id} className="card" style={{ marginBottom: '1.25rem' }}>
            <div className="flex justify-between items-center" style={{ marginBottom: '1rem' }}>
              <h3 style={{ color: 'var(--color-text)' }}>🏪 {branch.name}</h3>
              <span className="badge badge-muted">{branch.items.length} SKUs</span>
            </div>
            {branch.items.length === 0 ? (
              <p className="text-muted text-sm">No inventory data for this branch.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                {branch.items.map(item => {
                  const pct = item.safety_level > 0
                    ? Math.min((item.current_stock / item.safety_level) * 100, 100)
                    : 100
                  const level = pct < 30 ? 'low' : pct < 70 ? 'warn' : 'good'
                  return (
                    <div key={item.id} style={{ background: 'var(--color-surface-2)', borderRadius: '10px', padding: '0.9rem' }}>
                      <p style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                        {item.ingredients?.name || 'Unknown'}
                      </p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
                        {item.current_stock} / {item.safety_level} {item.ingredients?.unit_of_measure}
                      </p>
                      <div className="stock-bar">
                        <div className={`stock-bar-fill ${level}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))
      )}

      {/* Shipment History */}
      <div className="table-wrapper mt-3">
        <div className="table-header">
          <p className="table-title">Shipment Log</p>
          <span className="badge badge-muted">{shipments.length} records</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Ingredient</th>
              <th>Branch</th>
              <th>Qty Sent</th>
              <th>Unit Cost</th>
              <th>Status</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {shipments.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>
                  No shipments logged yet
                </td>
              </tr>
            ) : (
              shipments.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.ingredients?.name || '—'}</td>
                  <td>{s.branches?.name || '—'}</td>
                  <td>{s.quantity_sent}</td>
                  <td>₱{Number(s.unit_cost).toFixed(2)}</td>
                  <td>
                    <span className={`badge badge-${s.status === 'received' ? 'success' : s.status === 'rejected' ? 'danger' : 'warning'}`}>
                      {s.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                    {new Date(s.created_at).toLocaleDateString('en-PH')}
                  </td>
                  <td>
                    {s.status === 'in_transit' && (
                      <div className="flex gap-1">
                        <button className="btn btn-ghost btn-sm" onClick={() => handleStatus(s.id, 'received')} disabled={isPending}>
                          ✅ Receive
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleStatus(s.id, 'rejected')} disabled={isPending}>
                          ✕
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      </>
      )}

      {activeTab === 'franchise_inventory' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <p className="text-sm text-muted">Manage the items that franchisers see on their Daily Inventory sheets.</p>
            <button className="btn btn-accent btn-sm" onClick={() => setModal('inventory_item')}>➕ Add Inventory Item</button>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Item Name</th>
                  <th>Unit</th>
                  <th>Min Stock</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {inventoryItems.map(item => {
                  const cat = inventoryCategories.find(c => c.id === item.category_id)
                  return (
                    <tr key={item.id}>
                      <td><span className="badge badge-muted">{cat?.name || 'Unknown'}</span></td>
                      <td style={{ fontWeight: 600 }}>{item.name}</td>
                      <td>{item.unit || '—'}</td>
                      <td>{item.min_stock_level}</td>
                      <td>
                        <span className={`badge ${item.is_active ? 'badge-success' : 'badge-danger'}`}>
                          {item.is_active ? 'Active' : 'Hidden'}
                        </span>
                      </td>
                      <td>
                        <button 
                          className="btn btn-ghost btn-sm" 
                          onClick={() => handleToggleInventoryItem(item.id, item.is_active)}
                          disabled={isPending}
                        >
                          {item.is_active ? 'Hide' : 'Show'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {inventoryItems.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                      No inventory items setup yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Log Shipment Modal ── */}
      {modal === 'shipment' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <p className="modal-title">🚚 Log New Shipment</p>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            {formError   && <div className="alert alert-danger">{formError}</div>}
            {formSuccess && <div className="alert alert-success">✅ {formSuccess}</div>}
            <form onSubmit={handleLogShipment}>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Branch *</label>
                    <select name="branch_id" className="form-select" required>
                      <option value="">Select branch…</option>
                      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Ingredient *</label>
                    <select name="ingredient_id" className="form-select" required>
                      <option value="">Select ingredient…</option>
                      {ingredients.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit_of_measure})</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Quantity Sent *</label>
                    <input name="quantity" type="number" step="0.01" min="0.01" className="form-input" placeholder="e.g. 50" required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Unit Cost (₱)</label>
                    <input name="unit_cost" type="number" step="0.01" min="0" className="form-input" placeholder="e.g. 12.50" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <textarea name="notes" className="form-textarea" placeholder="Optional notes…" style={{ minHeight: '70px' }} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isPending}>
                  {isPending ? <><span className="loading-spinner" /> Logging…</> : '🚚 Log Shipment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Add Ingredient Modal ── */}
      {modal === 'ingredient' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <p className="modal-title">🧪 Add New Ingredient</p>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            {formError   && <div className="alert alert-danger">{formError}</div>}
            {formSuccess && <div className="alert alert-success">✅ {formSuccess}</div>}
            <form onSubmit={handleAddIngredient}>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Ingredient Name *</label>
                    <input name="name" className="form-input" placeholder="e.g. Mango Puree" required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Unit of Measure *</label>
                    <input name="unit_of_measure" className="form-input" placeholder="e.g. kg, L, pcs" required />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Cost per Unit (₱)</label>
                  <input name="cost_per_unit" type="number" step="0.01" min="0" className="form-input" placeholder="e.g. 45.00" />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isPending}>
                  {isPending ? <><span className="loading-spinner" /> Adding…</> : '🧪 Add Ingredient'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Set Stock Level Modal ── */}
      {modal === 'stock' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <p className="modal-title">📋 Set / Update Stock Level</p>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            {formError   && <div className="alert alert-danger">{formError}</div>}
            {formSuccess && <div className="alert alert-success">✅ {formSuccess}</div>}
            <form onSubmit={handleSetStock}>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Branch *</label>
                    <select name="branch_id" className="form-select" required>
                      <option value="">Select branch…</option>
                      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Ingredient *</label>
                    <select name="ingredient_id" className="form-select" required>
                      <option value="">Select ingredient…</option>
                      {ingredients.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit_of_measure})</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Current Stock *</label>
                    <input name="current_stock" type="number" step="0.01" min="0" className="form-input" placeholder="e.g. 120" required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Safety Level *</label>
                    <input name="safety_level" type="number" step="0.01" min="0" className="form-input" placeholder="e.g. 50" required />
                  </div>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
                  If a record already exists for this branch + ingredient, it will be updated.
                </p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isPending}>
                  {isPending ? <><span className="loading-spinner" /> Saving…</> : '📋 Save Stock Level'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Add Inventory Item Modal ── */}
      {modal === 'inventory_item' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <p className="modal-title">➕ Add Franchise Inventory Item</p>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            {formError && <div className="alert alert-danger">{formError}</div>}
            <form onSubmit={handleCreateInventoryItem}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Category *</label>
                  <select name="category_id" className="form-select" required>
                    <option value="">Select category...</option>
                    {inventoryCategories.map(c => <option key={c.id} value={c.id}>{c.name} ({c.sheet_type})</option>)}
                  </select>
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Item Name *</label>
                    <input name="name" className="form-input" required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Unit of Measure</label>
                    <input name="unit" className="form-input" placeholder="e.g. pcs, L" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Min Stock Level</label>
                    <input name="min_stock_level" type="number" step="0.5" className="form-input" defaultValue={0} />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isPending}>
                  {isPending ? <span className="loading-spinner" /> : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
