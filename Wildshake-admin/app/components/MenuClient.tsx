'use client'

import { useState, useTransition } from 'react'
import {
  createProduct, updateProduct, deleteProduct,
  toggleProductAvailability, updateMenuItemPrice,
} from '@/lib/actions/menu'
import { hasDeliveryPrice, getDeliveryPrice } from '@/lib/deliveryPricing'

interface Product {
  id: string
  name: string
  category: string
  price: number
  image_url: string | null
  is_available: boolean
  created_at: string
}

interface MenuItem {
  id: string
  category: string
  item_name: string
  cost_per_serving: number
  old_price: number
  new_price: number
  old_margin: string
  new_margin: string
  profit_in_peso: string
}

export default function MenuClient({
  products,
  menuItems,
}: {
  products: Product[]
  menuItems: MenuItem[]
}) {
  const [tab, setTab]               = useState<'products' | 'pricing'>('products')
  const [showModal, setShowModal]   = useState(false)
  const [editing, setEditing]       = useState<Product | null>(null)
  const [search, setSearch]         = useState('')
  const [filterCat, setFilterCat]   = useState('all')
  const [formError, setFormError]   = useState('')
  const [formSuccess, setFormSuccess] = useState('')
  const [isPending, startTransition] = useTransition()

  const categories = ['all', ...Array.from(new Set(products.map(p => p.category))).sort()]

  const filtered = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
    if (filterCat === 'delivery') {
      return matchSearch && hasDeliveryPrice(p.name, p.category)
    }
    const matchCat    = filterCat === 'all' || p.category === filterCat
    return matchSearch && matchCat
  })

  function resolveDeliveryPrice(p: Product) {
    let qualifier = undefined
    if (p.category.includes('Petite')) qualifier = 'Petite'
    else if (p.category.includes('Grande')) qualifier = 'Grande'
    else if (p.category === 'Coffee Hot') qualifier = 'Hot'
    else if (p.category === 'Coffee Iced') qualifier = 'Cold'
    return getDeliveryPrice(p.name, qualifier, p.category)
  }

  function openAdd()           { setEditing(null); setFormError(''); setFormSuccess(''); setShowModal(true) }
  function openEdit(p: Product){ setEditing(p);    setFormError(''); setFormSuccess(''); setShowModal(true) }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError('')
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = editing
        ? await updateProduct(editing.id, fd)
        : await createProduct(fd)
      if (result.error) { setFormError(result.error); return }
      setFormSuccess(editing ? 'Product updated!' : 'Product added to POS menu!')
      setTimeout(() => { setShowModal(false); setFormSuccess('') }, 1200)
    })
  }

  async function handleToggle(p: Product) {
    startTransition(async () => { await toggleProductAvailability(p.id, !p.is_available) })
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this item from the POS menu?')) return
    startTransition(async () => { await deleteProduct(id) })
  }

  // ── Pricing tab state
  const [pricingEdit, setPricingEdit] = useState<string | null>(null)
  const pricingCats = Array.from(new Set(menuItems.map(m => m.category))).sort()
  const [pricingFilter, setPricingFilter] = useState('all')
  const filteredPricing = menuItems.filter(m => pricingFilter === 'all' || m.category === pricingFilter)

  async function handlePriceUpdate(e: React.FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const r = await updateMenuItemPrice(id, fd)
      if (!r.error) setPricingEdit(null)
    })
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Menu Management</h1>
          <p className="page-header-subtitle">Manage the live POS menu and pricing reference</p>
        </div>
        <div className="flex gap-1">
          {tab === 'products' && (
            <button className="btn btn-accent" onClick={openAdd}>➕ Add Item</button>
          )}
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 mb-6" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '0' }}>
        {(['products', 'pricing'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '0.6rem 1.25rem',
              fontWeight: 600,
              fontSize: '0.875rem',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: tab === t ? 'var(--color-accent)' : 'var(--color-text-muted)',
              borderBottom: tab === t ? '2px solid var(--color-accent)' : '2px solid transparent',
              transition: 'all 0.2s',
            }}
          >
            {t === 'products' ? '🍹 POS Products' : '💰 Pricing Reference'}
          </button>
        ))}
      </div>

      {/* ── PRODUCTS TAB ── */}
      {tab === 'products' && (
        <>
          {/* Stats */}
          <div className="stat-grid" style={{ marginBottom: '1.5rem' }}>
            <div className="stat-card">
              <div className="stat-card-icon green">🍹</div>
              <p className="stat-card-label">Total Products</p>
              <p className="stat-card-value">{products.length}</p>
            </div>
            <div className="stat-card">
              <div className="stat-card-icon blue">✅</div>
              <p className="stat-card-label">Available</p>
              <p className="stat-card-value">{products.filter(p => p.is_available).length}</p>
            </div>
            <div className="stat-card">
              <div className="stat-card-icon gold">🏷️</div>
              <p className="stat-card-label">Categories</p>
              <p className="stat-card-value">{categories.length - 1}</p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-2 mb-4" style={{ flexWrap: 'wrap' }}>
            <div className="table-search" style={{ flex: 1, minWidth: '180px' }}>
              🔍<input type="text" placeholder="Search products…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="form-select" style={{ width: 'auto' }} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
              {categories.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>)}
              <option value="delivery">🛵 FoodPanda & Grab Menu</option>
            </select>
          </div>

          {/* Product Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
            {filtered.length === 0 && (
              <div className="card" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                {products.length === 0 ? 'No products yet. Add your first menu item!' : 'No results found.'}
              </div>
            )}
            {filtered.map(p => (
              <div key={p.id} className="card" style={{ position: 'relative', opacity: p.is_available ? 1 : 0.55 }}>
                {/* Category badge */}
                <div className="flex justify-between items-center" style={{ marginBottom: '0.5rem' }}>
                  <span className="badge badge-muted" style={{ fontSize: '0.65rem' }}>{p.category}</span>
                  <span className={`badge badge-${p.is_available ? 'success' : 'muted'}`} style={{ fontSize: '0.65rem' }}>
                    {p.is_available ? '● Live' : '● Hidden'}
                  </span>
                </div>
                <p style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.25rem' }}>{p.name}</p>
                <p style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-accent)', marginBottom: '0.75rem' }}>
                  ₱{Number(p.price).toFixed(2)}
                  {filterCat === 'delivery' && resolveDeliveryPrice(p) && (
                     <span style={{ fontSize: '0.85rem', color: '#e8005e', marginLeft: '0.5rem', fontWeight: 700 }}>
                        (Delivery: ₱{resolveDeliveryPrice(p)})
                     </span>
                  )}
                </p>
                <div className="flex gap-1">
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)} style={{ flex: 1 }}>✏️ Edit</button>
                  <button
                    className={`btn btn-sm ${p.is_available ? 'btn-ghost' : 'btn-accent'}`}
                    onClick={() => handleToggle(p)}
                    disabled={isPending}
                    style={{ flex: 1 }}
                  >
                    {p.is_available ? '🙈 Hide' : '✅ Show'}
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id)} disabled={isPending}>🗑️</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── PRICING REFERENCE TAB ── */}
      {tab === 'pricing' && (
        <>
          <div className="flex gap-2 mb-4">
            <select className="form-select" style={{ width: 'auto' }} value={pricingFilter} onChange={e => setPricingFilter(e.target.value)}>
              <option value="all">All Categories</option>
              {pricingCats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="table-wrapper">
            <div className="table-header">
              <p className="table-title">Menu Pricing Reference</p>
              <span className="badge badge-muted">{filteredPricing.length} items</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Item</th>
                  <th>Cost/Serving</th>
                  <th>Old Price</th>
                  <th>New Price</th>
                  <th>New Margin</th>
                  <th>Profit</th>
                  <th>Edit</th>
                </tr>
              </thead>
              <tbody>
                {filteredPricing.map(m => (
                  <tr key={m.id}>
                    <td style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{m.category}</td>
                    <td style={{ fontWeight: 600 }}>{m.item_name}</td>
                    <td>₱{Number(m.cost_per_serving).toFixed(2)}</td>
                    <td style={{ textDecoration: 'line-through', color: 'var(--color-text-muted)' }}>₱{m.old_price}</td>
                    {pricingEdit === m.id ? (
                      <>
                        <td colSpan={3}>
                          <form onSubmit={e => handlePriceUpdate(e, m.id)} className="flex gap-1" id={`price-form-${m.id}`}>
                            <input
                              name="old_price"
                              type="number"
                              defaultValue={m.old_price}
                              className="form-input"
                              style={{ width: '80px', padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
                            />
                            <input
                              name="new_price"
                              type="number"
                              defaultValue={m.new_price}
                              className="form-input"
                              style={{ width: '80px', padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
                            />
                            <button type="submit" className="btn btn-accent btn-sm" disabled={isPending}>Save</button>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPricingEdit(null)}>✕</button>
                          </form>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ fontWeight: 700, color: 'var(--color-accent)' }}>₱{m.new_price}</td>
                        <td><span className="badge badge-success">{m.new_margin}</span></td>
                        <td style={{ color: 'var(--color-success)' }}>₱{String(m.profit_in_peso).trim()}</td>
                      </>
                    )}
                    <td>
                      {pricingEdit !== m.id && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setPricingEdit(m.id)}>✏️</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Add / Edit Product Modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <p className="modal-title">{editing ? '✏️ Edit Product' : '➕ Add New Product'}</p>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            {formError   && <div className="alert alert-danger">{formError}</div>}
            {formSuccess && <div className="alert alert-success">✅ {formSuccess}</div>}
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Product Name *</label>
                    <input name="name" className="form-input" defaultValue={editing?.name || ''} placeholder="e.g. Mango Shake" required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Category *</label>
                    <input
                      name="category"
                      className="form-input"
                      defaultValue={editing?.category || ''}
                      placeholder="e.g. Fruitshakes Grande"
                      list="category-list"
                      required
                    />
                    <datalist id="category-list">
                      {Array.from(new Set(products.map(p => p.category))).map(c => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Price (₱) *</label>
                    <input name="price" type="number" step="0.01" min="0" className="form-input" defaultValue={editing?.price || ''} placeholder="e.g. 160" required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Availability</label>
                    <select name="is_available" className="form-select" defaultValue={editing ? String(editing.is_available) : 'true'}>
                      <option value="true">✅ Available (Live on POS)</option>
                      <option value="false">🙈 Hidden (Off POS)</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Image URL</label>
                  <input name="image_url" className="form-input" defaultValue={editing?.image_url || ''} placeholder="https://… (optional)" />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isPending}>
                  {isPending ? <><span className="loading-spinner" /> Saving…</> : (editing ? '💾 Save Changes' : '➕ Add to Menu')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
