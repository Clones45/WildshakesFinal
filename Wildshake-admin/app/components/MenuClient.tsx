'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  createProduct, updateProduct, deleteProduct, toggleProductAvailability, clearBranchPrice,
  type BranchPriceRow,
} from '@/lib/actions/menu'

interface Product {
  id: string
  name: string
  category: string
  price: number
  /** FoodPanda & Grab price (one shared price), or null when not offered on delivery. */
  delivery_price: number | null
  image_url: string | null
  is_available: boolean
  created_at: string
}
interface Branch { id: string; name: string; franchise: string | null }

const peso = (v: number | string | null | undefined) => (v === null || v === undefined ? '—' : `₱${Number(v).toFixed(2)}`)
/** A delivery price of zero means the item goes out free on FoodPanda and Grab. */
const delivery = (v: number | string | null | undefined) => (v !== null && v !== undefined && Number(v) === 0 ? 'Free' : peso(v))

/**
 * Head office's live POS menu. Every item has a normal price and, if it is sold on
 * FoodPanda and Grab, one shared delivery price. Saving a price asks which branches
 * it is for: all of them, or ticked ones only. Branch-only prices are listed on the
 * item's card and can be reset so the branch follows the menu again.
 */
export default function MenuClient({ products, branches, branchPrices }: { products: Product[]; branches: Branch[]; branchPrices: BranchPriceRow[] }) {
  const [showModal, setShowModal]   = useState(false)
  const [editing, setEditing]       = useState<Product | null>(null)
  const [search, setSearch]         = useState('')
  const [filterCat, setFilterCat]   = useState('all')
  const [formError, setFormError]   = useState('')
  const [formSuccess, setFormSuccess] = useState('')
  const [scope, setScope]           = useState<'all' | 'branches'>('all')
  const [picked, setPicked]         = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  const categories = ['all', ...Array.from(new Set(products.map(p => p.category))).sort()]
  const branchName = (id: string) => branches.find(b => b.id === id)?.name ?? 'Branch'

  /** Branch-only prices by item, only those that actually differ from the menu. */
  const ownPrices = useMemo(() => {
    const m: Record<string, BranchPriceRow[]> = {}
    for (const r of branchPrices) {
      if (r.price === null && r.delivery_price === null) continue
      ;(m[r.product_id] ??= []).push(r)
    }
    for (const rows of Object.values(m)) rows.sort((a, b) => branchName(a.branch_id).localeCompare(branchName(b.branch_id)))
    return m
  }, [branchPrices, branches]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
    if (filterCat === 'delivery') return matchSearch && p.delivery_price !== null
    if (filterCat === 'branch_prices') return matchSearch && !!ownPrices[p.id]
    return matchSearch && (filterCat === 'all' || p.category === filterCat)
  })

  function openAdd()            { setEditing(null); setScope('all'); setPicked(new Set()); setFormError(''); setFormSuccess(''); setShowModal(true) }
  function openEdit(p: Product) { setEditing(p);    setScope('all'); setPicked(new Set()); setFormError(''); setFormSuccess(''); setShowModal(true) }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError('')
    const fd = new FormData(e.currentTarget)
    if (editing && scope === 'branches' && picked.size === 0) { setFormError('Tick at least one branch, or apply the price to all branches.'); return }
    startTransition(async () => {
      const result = editing ? await updateProduct(editing.id, fd) : await createProduct(fd)
      if (result.error) { setFormError(result.error); return }
      setFormSuccess(editing
        ? (scope === 'branches' ? `Saved. The new prices apply at ${[...picked].map(branchName).join(', ')}; the tills update within seconds.` : 'Saved. Every till updates within seconds.')
        : 'Added to the POS menu. Every till shows it within seconds.')
      setTimeout(() => { setShowModal(false); setFormSuccess('') }, 1600)
    })
  }

  async function handleToggle(p: Product) {
    startTransition(async () => { await toggleProductAvailability(p.id, !p.is_available) })
  }
  async function handleDelete(id: string) {
    if (!confirm('Remove this item from the POS menu at every branch?')) return
    startTransition(async () => { await deleteProduct(id) })
  }
  async function handleReset(r: BranchPriceRow, p: Product) {
    if (!confirm(`Put ${branchName(r.branch_id)} back on the menu price for ${p.name}?`)) return
    startTransition(async () => { const res = await clearBranchPrice(r.branch_id, p.id); if (res.error) alert(res.error) })
  }

  const togglePick = (id: string) => setPicked(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  /** What a branch pays for the item being edited right now. */
  const currentAt = (branchId: string, p: Product) => {
    const own = branchPrices.find(r => r.branch_id === branchId && r.product_id === p.id)
    return { price: own?.price ?? p.price, delivery: own?.delivery_price ?? p.delivery_price, isOwn: !!own && (own.price !== null || own.delivery_price !== null) }
  }

  const deliveryCount = products.filter(p => p.delivery_price !== null).length
  const ownCount = Object.keys(ownPrices).length

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Menu Management</h1>
          <p className="page-header-subtitle">The live POS menu at every branch: items, prices, and FoodPanda &amp; Grab prices</p>
        </div>
        <button className="btn btn-accent" onClick={openAdd}>➕ Add Item</button>
      </div>

      <div className="stat-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card"><div className="stat-card-icon green">🍹</div><p className="stat-card-label">Menu items</p><p className="stat-card-value">{products.length}</p><p className="stat-card-trend neutral">{products.filter(p => p.is_available).length} shown on the tills</p></div>
        <div className="stat-card"><div className="stat-card-icon gold">🏷️</div><p className="stat-card-label">Categories</p><p className="stat-card-value">{categories.length - 1}</p></div>
        <div className="stat-card"><div className="stat-card-icon" style={{ background: 'rgba(232,0,94,0.15)', color: '#e8005e' }}>🛵</div><p className="stat-card-label">On FoodPanda &amp; Grab</p><p className="stat-card-value">{deliveryCount}</p><p className="stat-card-trend neutral">items with a delivery price</p></div>
        <div className="stat-card"><div className="stat-card-icon blue">🏪</div><p className="stat-card-label">Branch-only prices</p><p className="stat-card-value">{ownCount}</p><p className="stat-card-trend neutral">{ownCount ? 'items priced differently somewhere' : 'every branch on the menu price'}</p></div>
      </div>

      <div className="flex gap-2 mb-4" style={{ flexWrap: 'wrap' }}>
        <div className="table-search" style={{ flex: 1, minWidth: '180px' }}>
          🔍<input type="text" placeholder="Search items…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-select" style={{ width: 'auto' }} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          {categories.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>)}
          <option value="delivery">🛵 FoodPanda &amp; Grab Menu</option>
          <option value="branch_prices">🏪 Items with branch-only prices</option>
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
        {filtered.length === 0 && (
          <div className="card" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
            {products.length === 0 ? 'No items yet. Add your first menu item!' : 'No results found.'}
          </div>
        )}
        {filtered.map(p => (
          <div key={p.id} className="card" style={{ position: 'relative', opacity: p.is_available ? 1 : 0.55 }}>
            <div className="flex justify-between items-center" style={{ marginBottom: '0.5rem' }}>
              <span className="badge badge-muted" style={{ fontSize: '0.65rem' }}>{p.category}</span>
              <span className={`badge badge-${p.is_available ? 'success' : 'muted'}`} style={{ fontSize: '0.65rem' }}>
                {p.is_available ? '● Live' : '● Hidden'}
              </span>
            </div>
            <p style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.25rem' }}>{p.name}</p>
            <p style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-accent)', marginBottom: p.delivery_price === null ? '0.75rem' : '0.1rem' }}>
              {peso(p.price)}
            </p>
            {p.delivery_price !== null && (
              <p style={{ fontSize: '0.8rem', color: '#e8005e', fontWeight: 700, marginBottom: '0.75rem' }}>🛵 FoodPanda &amp; Grab {delivery(p.delivery_price)}</p>
            )}
            {ownPrices[p.id] && (
              <div style={{ marginBottom: '0.75rem', padding: '0.5rem 0.6rem', borderRadius: 'var(--radius-sm)', background: 'rgba(52,152,219,0.08)', border: '1px solid rgba(52,152,219,0.25)', fontSize: '0.75rem' }}>
                <div style={{ fontWeight: 700, marginBottom: '0.25rem', color: 'var(--color-text-muted)' }}>Branch-only prices</div>
                {ownPrices[p.id].map(r => (
                  <div key={r.branch_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.1rem 0' }}>
                    <span>
                      <strong>{branchName(r.branch_id)}</strong>{' '}
                      {r.price !== null && <span>{peso(r.price)}</span>}
                      {r.price !== null && r.delivery_price !== null && ' · '}
                      {r.delivery_price !== null && <span style={{ color: '#e8005e' }}>🛵 {delivery(r.delivery_price)}</span>}
                    </span>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.68rem', padding: '0.1rem 0.4rem' }} disabled={isPending} title="Back to the menu price" onClick={() => handleReset(r, p)}>Reset</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-1">
              <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)} style={{ flex: 1 }}>✏️ Edit</button>
              <button className={`btn btn-sm ${p.is_available ? 'btn-ghost' : 'btn-accent'}`} onClick={() => handleToggle(p)} disabled={isPending} style={{ flex: 1 }}>
                {p.is_available ? '🙈 Hide' : '✅ Show'}
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id)} disabled={isPending}>🗑️</button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <p className="modal-title">{editing ? `✏️ Edit ${editing.name}` : '➕ Add New Item'}</p>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            {formError   && <div className="alert alert-danger">{formError}</div>}
            {formSuccess && <div className="alert alert-success">✅ {formSuccess}</div>}
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Item name *</label>
                    <input name="name" className="form-input" defaultValue={editing?.name || ''} placeholder="e.g. Mango" required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Category *</label>
                    <input name="category" className="form-input" defaultValue={editing?.category || ''} placeholder="e.g. Fruitshakes Grande" list="category-list" required />
                    <datalist id="category-list">
                      {Array.from(new Set(products.map(p => p.category))).map(c => <option key={c} value={c} />)}
                    </datalist>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Price (₱) *</label>
                    <input name="price" type="number" step="0.01" min="0" className="form-input" defaultValue={editing?.price ?? ''} placeholder="e.g. 160" required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">FoodPanda &amp; Grab price (₱)</label>
                    <input name="delivery_price" type="number" step="0.01" min="0" className="form-input" defaultValue={editing?.delivery_price ?? ''} placeholder="blank = not on delivery, 0 = free" />
                    <p style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>One shared price for both platforms. Leave blank if the item is not offered on delivery; enter 0 for packaging that goes out free on delivery orders.</p>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Availability</label>
                    <select name="is_available" className="form-select" defaultValue={editing ? String(editing.is_available) : 'true'}>
                      <option value="true">✅ Shown on the tills</option>
                      <option value="false">🙈 Hidden from the tills</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Image URL</label>
                    <input name="image_url" className="form-input" defaultValue={editing?.image_url || ''} placeholder="https://… (optional)" />
                  </div>
                </div>

                {editing && (
                  <div style={{ marginTop: '0.75rem', padding: '0.75rem 0.9rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface-2)' }}>
                    <p className="form-label" style={{ marginBottom: '0.5rem' }}>Apply the prices to</p>
                    <input type="hidden" name="scope" value={scope} />
                    <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '0.4rem', cursor: 'pointer' }}>
                      <input type="radio" name="scope_pick" checked={scope === 'all'} onChange={() => setScope('all')} />
                      <span><strong>All branches</strong><br /><span style={{ fontSize: '0.74rem', color: 'var(--color-text-muted)' }}>Every till gets these prices. A changed price also clears any branch-only price for this item.</span></span>
                    </label>
                    <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', cursor: 'pointer' }}>
                      <input type="radio" name="scope_pick" checked={scope === 'branches'} onChange={() => setScope('branches')} />
                      <span><strong>Only these branches</strong><br /><span style={{ fontSize: '0.74rem', color: 'var(--color-text-muted)' }}>The ticked branches get these prices; the others keep what they have. The menu&apos;s own price stays as it is.</span></span>
                    </label>
                    {scope === 'branches' && (
                      <div style={{ marginTop: '0.6rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.4rem' }}>
                        {branches.map(b => {
                          const now = currentAt(b.id, editing)
                          return (
                            <label key={b.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.4rem 0.6rem', borderRadius: 'var(--radius-sm)', border: `1px solid ${picked.has(b.id) ? 'var(--color-accent)' : 'var(--color-border)'}`, cursor: 'pointer', fontSize: '0.8rem' }}>
                              <input type="checkbox" name="branch_ids" value={b.id} checked={picked.has(b.id)} onChange={() => togglePick(b.id)} />
                              <span style={{ flex: 1 }}>
                                <strong>{b.name}</strong>{b.franchise ? <span style={{ color: 'var(--color-text-muted)' }}> · {b.franchise}</span> : null}
                                <br />
                                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                                  now {peso(now.price)}{now.delivery !== null ? ` · 🛵 ${delivery(now.delivery)}` : ''}{now.isOwn ? ' (branch-only)' : ''}
                                </span>
                              </span>
                            </label>
                          )
                        })}
                        {branches.length === 0 && <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>No branches exist yet.</span>}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isPending}>
                  {isPending ? <><span className="loading-spinner" /> Saving…</> : (editing ? '💾 Save' : '➕ Add to Menu')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
