'use client'

import { useState, useMemo, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { hasDeliveryPrice, getDeliveryPrice } from '@/lib/deliveryPricing'

interface Product {
  id: string
  name: string
  category: string
  price: number
  image_url: string | null
  is_available: boolean
}

interface Override {
  product_id: string
  is_available: boolean
}

interface Props {
  branchId: string
  branchName: string
  products: Product[]
  overrides: Override[]
}

export default function FranchiserMenuClient({ branchId, branchName, products, overrides }: Props) {
  const supabase = createClient()
  const [isPending, startTransition] = useTransition()

  // Build initial availability map: product_id → true/false
  // No override row = available; override row with is_available=false = hidden
  const [availability, setAvailability] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {}
    products.forEach(p => { map[p.id] = true })
    overrides.forEach(o => { map[o.product_id] = o.is_available })
    return map
  })

  const [saving, setSaving] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('All')
  const [filterStatus, setFilterStatus] = useState<'all' | 'available' | 'out'>('all')

  const categories = useMemo(() => ['All', ...new Set(products.map(p => p.category))], [products])

  const filtered = useMemo(() => {
    return products.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
      
      if (filterCategory === 'delivery') {
         if (!hasDeliveryPrice(p.name, p.category)) return false
      } else {
         const matchCat = filterCategory === 'All' || p.category === filterCategory
         if (!matchCat) return false
      }

      const isAvail = availability[p.id] !== false
      const matchStatus =
        filterStatus === 'all' ? true :
        filterStatus === 'available' ? isAvail :
        !isAvail
      return matchSearch && matchStatus
    })
  }, [products, search, filterCategory, filterStatus, availability])

  function resolveDeliveryPrice(p: Product) {
    let qualifier = undefined
    if (p.category.includes('Petite')) qualifier = 'Petite'
    else if (p.category.includes('Grande')) qualifier = 'Grande'
    else if (p.category === 'Coffee Hot') qualifier = 'Hot'
    else if (p.category === 'Coffee Iced') qualifier = 'Cold'
    return getDeliveryPrice(p.name, qualifier, p.category)
  }

  const availableCount = products.filter(p => availability[p.id] !== false).length
  const outCount = products.length - availableCount

  async function toggleItem(productId: string) {
    const current = availability[productId] !== false
    const next = !current

    setSaving(productId)
    setAvailability(prev => ({ ...prev, [productId]: next }))

    startTransition(async () => {
      if (next) {
        // Removing the restriction — delete the override row
        await supabase
          .from('branch_menu_availability')
          .delete()
          .eq('branch_id', branchId)
          .eq('product_id', productId)
      } else {
        // Marking as out of stock — upsert override row
        await supabase
          .from('branch_menu_availability')
          .upsert(
            { branch_id: branchId, product_id: productId, is_available: false, updated_at: new Date().toISOString() },
            { onConflict: 'branch_id,product_id' }
          )
      }
      setSaving(null)
    })
  }

  async function markAllAvailable() {
    setSaving('all')
    await supabase
      .from('branch_menu_availability')
      .delete()
      .eq('branch_id', branchId)
    setAvailability(prev => {
      const next = { ...prev }
      products.forEach(p => { next[p.id] = true })
      return next
    })
    setSaving(null)
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 1000 }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text)', marginBottom: '0.25rem' }}>
          🍹 Menu Availability
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
          {branchName} · Control which items are available on your POS. Prices and names are managed by Wildshakes HQ.
        </p>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {[
          { label: 'Total Items', value: products.length, color: 'var(--color-text)' },
          { label: 'Available', value: availableCount, color: '#22c55e' },
          { label: 'Out of Stock', value: outCount, color: '#ef4444' },
        ].map(stat => (
          <div key={stat.label} style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: '0.75rem 1.25rem',
            minWidth: 120,
          }}>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{stat.label}</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 800, color: stat.color }}>{stat.value}</p>
          </div>
        ))}

        {outCount > 0 && (
          <button
            onClick={markAllAvailable}
            disabled={saving === 'all'}
            style={{
              marginLeft: 'auto',
              alignSelf: 'center',
              padding: '0.5rem 1rem',
              background: 'rgba(34,197,94,0.1)',
              border: '1px solid rgba(34,197,94,0.3)',
              borderRadius: 'var(--radius-md)',
              color: '#22c55e',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              opacity: saving === 'all' ? 0.6 : 1,
            }}
          >
            ✓ Mark All Available
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search items…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: '1 1 200px',
            padding: '0.5rem 0.875rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            color: 'var(--color-text)',
            fontSize: '0.875rem',
          }}
        />
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          style={{
            padding: '0.5rem 0.875rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            color: 'var(--color-text)',
            fontSize: '0.875rem',
          }}
        >
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
          <option value="delivery">🛵 FoodPanda & Grab Menu</option>
        </select>
        <div style={{ display: 'flex', gap: '0.375rem' }}>
          {(['all', 'available', 'out'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilterStatus(f)}
              style={{
                padding: '0.5rem 0.875rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid',
                borderColor: filterStatus === f ? 'var(--color-primary)' : 'var(--color-border)',
                background: filterStatus === f ? 'rgba(74,124,89,0.12)' : 'var(--color-surface)',
                color: filterStatus === f ? 'var(--color-primary-light)' : 'var(--color-text-muted)',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {f === 'all' ? 'All' : f === 'available' ? '✓ Available' : '✗ Out of Stock'}
            </button>
          ))}
        </div>
      </div>

      {/* Product grid */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
          No items match your filters.
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: '0.875rem',
        }}>
          {filtered.map(product => {
            const isAvail = availability[product.id] !== false
            const isSaving = saving === product.id
            return (
              <div
                key={product.id}
                style={{
                  background: 'var(--color-surface)',
                  border: `1px solid ${isAvail ? 'var(--color-border)' : 'rgba(239,68,68,0.4)'}`,
                  borderRadius: 'var(--radius-lg)',
                  overflow: 'hidden',
                  opacity: isAvail ? 1 : 0.65,
                  transition: 'all 0.2s',
                  position: 'relative',
                }}
              >
                {/* Image */}
                <div style={{ width: '100%', height: 100, background: 'var(--color-bg)', position: 'relative', overflow: 'hidden' }}>
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>
                      🍹
                    </div>
                  )}
                  {/* Out of stock overlay */}
                  {!isAvail && (
                    <div style={{
                      position: 'absolute', inset: 0,
                      background: 'rgba(0,0,0,0.5)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ color: '#ef4444', fontWeight: 800, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'center' }}>
                        Out of<br />Stock
                      </span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div style={{ padding: '0.625rem 0.75rem' }}>
                  <p style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--color-text)', marginBottom: '0.125rem', lineHeight: 1.2 }}>
                    {product.name}
                  </p>
                  <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
                    {product.category} · ₱{Number(product.price).toFixed(0)}
                    {filterCategory === 'delivery' && resolveDeliveryPrice(product) && (
                       <span style={{ color: '#e8005e', marginLeft: '0.25rem', fontWeight: 700 }}>
                          (Delivery: ₱{resolveDeliveryPrice(product)})
                       </span>
                    )}
                  </p>

                  {/* Toggle */}
                  <button
                    onClick={() => toggleItem(product.id)}
                    disabled={isSaving || isPending}
                    style={{
                      width: '100%',
                      padding: '0.375rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid',
                      borderColor: isAvail ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.4)',
                      background: isAvail ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)',
                      color: isAvail ? '#ef4444' : '#22c55e',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: isSaving ? 'wait' : 'pointer',
                      opacity: isSaving ? 0.6 : 1,
                      transition: 'all 0.2s',
                    }}
                  >
                    {isSaving ? '…' : isAvail ? '✗ Mark Out of Stock' : '✓ Mark Available'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
