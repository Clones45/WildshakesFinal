'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import {
  createCommissaryShipment, markShipmentSent, cancelShipment,
  logShipment, updateShipmentStatus, createIngredient, setInventoryLevel,
} from '@/lib/actions/commissary'
import { createInventoryItem, updateInventoryItemStatus, setInventoryItemTags } from '@/lib/actions/inventorySetup'

/* ─── Types ─────────────────────────────────────────────────────── */
interface Branch {
  id: string; name: string; location: string | null; franchise_id: string
  franchises: { name: string; owner_name: string } | null
}
interface Franchise { id: string; name: string; owner_name: string }
interface CommCategory { id: string; name: string; sheet_type: string; sort_order: number }
interface CommItem { id: string; category_id: string; name: string; unit: string | null; min_stock_level: number | null; sort_order: number; is_active: boolean }
interface Shipment {
  id: string; quantity_sent: number; quantity_unit: string | null; unit_cost: number
  status: string; notes: string | null; rejected_reason: string | null
  sent_at: string | null; received_at: string | null; created_at: string
  branch_id: string
  branches: { id: string; name: string; franchise_id: string } | null
  inventory_item_id: string | null
  inventory_items: { id: string; name: string; unit: string | null } | null
  ingredient_id: string | null
  ingredients: { name: string } | null
}
interface DailyLog {
  id: string; branch_id: string; inventory_item_id: string
  starting_stock: number | null; additional_stock: number | null
  used_stock: number | null; ending_stock: number | null; notes: string | null
}
interface InventoryItem { id: string; category_id: string; name: string; unit: string | null; min_stock_level: number; is_active: boolean }
interface ItemTag { id: string; inventory_item_id: string; entity_type: 'branch' | 'commissary'; entity_id: string }

interface Props {
  branches: Branch[]
  franchises: Franchise[]
  commCategories: CommCategory[]
  commItems: CommItem[]
  shipments: Shipment[]
  todayLogs: DailyLog[]
  ingredients: { id: string; name: string; unit_of_measure: string }[]
  inventory: { id: string; current_stock: number; safety_level: number; ingredients: { id: string; name: string; unit_of_measure: string } | null; branches: { id: string; name: string } | null }[]
  inventoryCategories: { id: string; name: string; sheet_type: string }[]
  inventoryItems: InventoryItem[]
  commissaryBranches: { id: string; name: string; region?: string | null }[]
  itemTags: ItemTag[]
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'badge-warning',
  in_transit: 'badge-info',
  received: 'badge-success',
  rejected: 'badge-danger',
  cancelled: 'badge-muted',
}

const STATUS_LABEL: Record<string, string> = {
  pending: '⏳ Pending',
  in_transit: '🚚 In Transit',
  received: '✅ Received',
  rejected: '✕ Rejected',
  cancelled: '— Cancelled',
}

function fmt(n: number | null) { return n === null ? '—' : String(n) }

export default function CommissaryClient({
  branches, franchises, commCategories, commItems, shipments, todayLogs,
  ingredients, inventory, inventoryCategories, inventoryItems, commissaryBranches, itemTags,
}: Props) {
  const commBranchMap = Object.fromEntries((commissaryBranches || []).map(c => [c.id, c]))
  const branchNameMap = Object.fromEntries(branches.map(b => [b.id, b.name]))
  const commNameMap   = Object.fromEntries((commissaryBranches || []).map(c => [c.id, c.name]))
  const [tab, setTab] = useState<'stock' | 'shipments' | 'catalog'>('stock')
  const [modal, setModal] = useState<'shipment' | 'ingredient' | 'stock_level' | 'inventory_item' | null>(null)
  const [formError, setFormError]     = useState('')
  const [formSuccess, setFormSuccess] = useState('')
  const [isPending, startTransition]  = useTransition()

  // Local copy of tags so inline edits reflect immediately
  const [localTags, setLocalTags] = useState<ItemTag[]>(itemTags || [])

  // Stock tab filters
  const [selectedBranch, setSelectedBranch] = useState<string>('all')
  const [sheetFilter, setSheetFilter]       = useState<string>('all')
  const [stockFilter, setStockFilter]       = useState<'all' | 'low' | 'out'>('all')

  // Sheet type labels
  const SHEET_LABELS: Record<string, string> = {
    commissary: '🏭 Commissary (CSL)',
    commissary_home: '🏠 Commissary Home',
    food: '🍝 Food',
    food_2: '🍕 Food 2',
    production: '⚙️ Production',
    coffee_general: '☕ Coffee & General',
    shake: '🥤 Shake',
  }

  // Shipments tab filters
  const [shipStatus, setShipStatus] = useState<string>('all')
  const [shipBranch, setShipBranch] = useState<string>('all')

  // Catalog tab filter
  const [catalogSheet, setCatalogSheet] = useState<string>('all')

  /* ── Build lookup maps ─────────────────────────────────────────── */
  const catById = Object.fromEntries(commCategories.map(c => [c.id, c]))
  const itemById = Object.fromEntries(commItems.map(i => [i.id, i]))
  const branchById = Object.fromEntries(branches.map(b => [b.id, b]))

  // Log keyed by branch_id + inventory_item_id
  const logKey = (branchId: string, itemId: string) => `${branchId}::${itemId}`
  const logMap: Record<string, DailyLog> = {}
  for (const l of todayLogs) logMap[logKey(l.branch_id, l.inventory_item_id)] = l

  // Many-to-many tag lookup: itemId -> array of tag labels (built from localTags)
  const itemTagsMap: Record<string, { labels: string[]; tags: ItemTag[] }> = {}
  for (const tag of localTags) {
    if (!itemTagsMap[tag.inventory_item_id]) {
      itemTagsMap[tag.inventory_item_id] = { labels: [], tags: [] }
    }
    const entry = itemTagsMap[tag.inventory_item_id]
    entry.tags.push(tag)
    if (tag.entity_type === 'branch') {
      entry.labels.push(`🏪 ${branchNameMap[tag.entity_id] ?? 'Branch'}`)
    } else {
      entry.labels.push(`🏭 ${commNameMap[tag.entity_id] ?? 'Commissary'}`)
    }
  }

  /* ── Inline Tag Picker Component ─────────────────────────────── */
  function InlineTagPicker({ itemId }: { itemId: string }) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)
    const [saving, setSaving] = useState(false)

    // Current tags for this item
    const currentTags = localTags.filter(t => t.inventory_item_id === itemId)
    const checkedKeys = new Set(currentTags.map(t => `${t.entity_type}::${t.entity_id}`))

    // Close on outside click
    useEffect(() => {
      if (!open) return
      function handleClick(e: MouseEvent) {
        if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
      }
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }, [open])

    async function handleToggle(entityType: 'branch' | 'commissary', entityId: string) {
      const key = `${entityType}::${entityId}`
      const isChecked = checkedKeys.has(key)

      // Optimistically update local state
      let newTags: ItemTag[]
      if (isChecked) {
        newTags = localTags.filter(t => !(t.inventory_item_id === itemId && t.entity_type === entityType && t.entity_id === entityId))
      } else {
        newTags = [...localTags, { id: `temp-${Date.now()}`, inventory_item_id: itemId, entity_type: entityType, entity_id: entityId }]
      }
      setLocalTags(newTags)

      // Build the full tag list for this item and save
      const itemNewTags = newTags
        .filter(t => t.inventory_item_id === itemId)
        .map(t => ({ entity_type: t.entity_type, entity_id: t.entity_id }))

      setSaving(true)
      startTransition(async () => {
        await setInventoryItemTags(itemId, itemNewTags)
        setSaving(false)
      })
    }

    const entry = itemTagsMap[itemId]
    const tagLabels = entry?.labels || []

    return (
      <div ref={ref} style={{ position: 'relative' }}>
        {/* Clickable tag display */}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          style={{
            display: 'flex', flexWrap: 'wrap', gap: '0.2rem', alignItems: 'center',
            background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
            padding: '0.25rem 0.5rem', cursor: 'pointer', minWidth: 80, minHeight: 28,
            transition: 'border-color 0.15s',
            borderColor: open ? 'var(--color-primary)' : 'var(--color-border)',
          }}
        >
          {tagLabels.length === 0 ? (
            <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>＋ Assign…</span>
          ) : (
            tagLabels.map((l, i) => (
              <span key={i} className="badge badge-muted" style={{ fontSize: '0.6rem', whiteSpace: 'nowrap', padding: '1px 5px' }}>{l}</span>
            ))
          )}
          {saving && <span className="loading-spinner" style={{ width: 12, height: 12, marginLeft: 4 }} />}
        </button>

        {/* Dropdown */}
        {open && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, zIndex: 100,
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)', boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            padding: '0.5rem', minWidth: 220, maxHeight: 320, overflowY: 'auto',
            marginTop: '0.25rem',
          }}>
            {/* Commissary Branches */}
            {(commissaryBranches || []).length > 0 && (
              <>
                <p style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-text-muted)', padding: '0.2rem 0.4rem', margin: 0 }}>🏭 Commissary</p>
                {(commissaryBranches || []).map(c => {
                  const key = `commissary::${c.id}`
                  const checked = checkedKeys.has(key)
                  return (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.4rem', cursor: 'pointer', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', background: checked ? 'rgba(74,124,89,0.1)' : 'transparent' }}>
                      <input type="checkbox" checked={checked} onChange={() => handleToggle('commissary', c.id)} style={{ accentColor: 'var(--color-primary)' }} />
                      {c.name}{c.region ? ` (${c.region})` : ''}
                    </label>
                  )
                })}
              </>
            )}

            {/* Franchise Branches */}
            {franchises.map(f => {
              const fBranches = branches.filter(b => b.franchise_id === f.id)
              if (fBranches.length === 0) return null
              return (
                <div key={f.id} style={{ marginTop: '0.35rem' }}>
                  <p style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-text-muted)', padding: '0.2rem 0.4rem', margin: 0 }}>🏪 {f.name}</p>
                  {fBranches.map(b => {
                    const key = `branch::${b.id}`
                    const checked = checkedKeys.has(key)
                    return (
                      <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.4rem', cursor: 'pointer', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', background: checked ? 'rgba(74,124,89,0.1)' : 'transparent' }}>
                        <input type="checkbox" checked={checked} onChange={() => handleToggle('branch', b.id)} style={{ accentColor: 'var(--color-primary)' }} />
                        {b.name}
                      </label>
                    )
                  })}
                </div>
              )
            })}

            {/* Hint */}
            <p style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', padding: '0.4rem 0.4rem 0.15rem', margin: 0, borderTop: '1px solid var(--color-border)', marginTop: '0.35rem' }}>
              {checkedKeys.size === 0
                ? 'No tags — visible to all branches.'
                : `${checkedKeys.size} selected — only these see this item.`}
            </p>
          </div>
        )}
      </div>
    )
  }

  /* ── Filtered branches for stock view ─────────────────────────── */
  const visibleBranches = selectedBranch === 'all' ? branches : branches.filter(b => b.id === selectedBranch)

  /* ── Stock stats ───────────────────────────────────────────────── */
  const commCatIds = new Set(commCategories.map(c => c.id))
  let outCount = 0, lowCount = 0
  for (const comm of commissaryBranches) {
    for (const item of commItems) {
      const l = logMap[logKey(comm.id, item.id)]
      const start = l?.starting_stock ?? null
      const end = start !== null ? Math.max(0, (start) + (l?.additional_stock ?? 0) - (l?.used_stock ?? 0)) : null
      const min = item.min_stock_level ?? 0
      if (end === 0) outCount++
      else if (end !== null && min > 0 && end <= min) lowCount++
    }
  }

  /* ── Shipment stats ────────────────────────────────────────────── */
  const pendingCount   = shipments.filter(s => s.status === 'pending').length
  const inTransitCount = shipments.filter(s => s.status === 'in_transit').length

  /* ── Actions ───────────────────────────────────────────────────── */
  function resetForm() { setFormError(''); setFormSuccess('') }
  function openModal(m: typeof modal) { resetForm(); setModal(m) }
  function closeModal() { setModal(null); resetForm() }

  async function handleCreateShipment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); resetForm()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const r = await createCommissaryShipment(fd)
      if (r.error) { setFormError(r.error); return }
      setFormSuccess('Shipment created!'); setTimeout(closeModal, 1500)
    })
  }

  async function handleSend(id: string) {
    startTransition(async () => { await markShipmentSent(id) })
  }
  async function handleCancel(id: string) {
    startTransition(async () => { await cancelShipment(id) })
  }

  async function handleAddIngredient(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); resetForm()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const r = await createIngredient(fd)
      if (r.error) { setFormError(r.error); return }
      setFormSuccess('Ingredient added!'); setTimeout(closeModal, 1500)
    })
  }

  async function handleSetStockLevel(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); resetForm()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const r = await setInventoryLevel(fd)
      if (r.error) { setFormError(r.error); return }
      setFormSuccess('Stock updated!'); setTimeout(closeModal, 1500)
    })
  }

  async function handleCreateInventoryItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); resetForm()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const r = await createInventoryItem(fd)
      if (r.error) { setFormError(r.error); return }
      setFormSuccess('Item added!'); setTimeout(closeModal, 1500)
    })
  }

  // (Tag modal removed — tagging is now inline in the table)

  async function handleToggleItem(id: string, current: boolean) {
    startTransition(async () => { await updateInventoryItemStatus(id, !current) })
  }

  /* ── Shared tab button style ───────────────────────────────────── */
  function tabStyle(id: string) {
    const active = tab === id
    return {
      padding: '0.6rem 1.25rem', border: 'none', background: 'none', cursor: 'pointer',
      borderBottom: active ? '2px solid var(--color-accent)' : '2px solid transparent',
      color: active ? 'var(--color-accent)' : 'var(--color-text-muted)',
      fontWeight: active ? 700 : 400, fontSize: '0.88rem', transition: 'all 0.15s',
    } as React.CSSProperties
  }

  return (
    <>
      {/* ── Page Header ──────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1>Commissary &amp; Supply Chain</h1>
          <p className="page-header-subtitle">Live franchise inventory • Shipment tracking • Item catalog</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => openModal('inventory_item')}>➕ Add Item</button>
          <button className="btn btn-accent" onClick={() => openModal('shipment')}>🚚 Create Shipment</button>
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid var(--color-border)', marginBottom: '1.5rem' }}>
        <button style={tabStyle('stock')} onClick={() => setTab('stock')}>📊 Live Stock</button>
        <button style={tabStyle('shipments')} onClick={() => setTab('shipments')}>
          🚚 Shipments
          {(pendingCount + inTransitCount) > 0 && (
            <span className="badge-count" style={{ marginLeft: '0.5rem', background: 'var(--color-warning)', color: '#0F1A14', padding: '1px 6px', borderRadius: 999, fontSize: '0.65rem', fontWeight: 800 }}>
              {pendingCount + inTransitCount}
            </span>
          )}
        </button>
        <button style={tabStyle('catalog')}>📦 Item Catalog</button>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TAB 1 — LIVE STOCK                                         */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {tab === 'stock' && (
        <div>
          {/* Summary cards */}
          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', marginBottom: '1.5rem' }}>
            <div className="stat-card"><div className="stat-card-icon green">🏭</div><p className="stat-card-label">Commissary Items</p><p className="stat-card-value">{commItems.length}</p></div>
            <div className="stat-card"><div className="stat-card-icon gold">🏪</div><p className="stat-card-label">Active Branches</p><p className="stat-card-value">{branches.length}</p></div>
            <div className="stat-card"><div className="stat-card-icon red">⚠️</div><p className="stat-card-label">Low Stock</p><p className="stat-card-value" style={{ color: lowCount > 0 ? 'var(--color-warning)' : undefined }}>{lowCount}</p>{lowCount > 0 && <p className="stat-card-trend down">Restock needed</p>}</div>
            <div className="stat-card"><div className="stat-card-icon red">🚫</div><p className="stat-card-label">Out of Stock</p><p className="stat-card-value" style={{ color: outCount > 0 ? 'var(--color-danger-light)' : undefined }}>{outCount}</p></div>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              className="form-select" style={{ width: 'auto' }}
              value={sheetFilter} onChange={e => setSheetFilter(e.target.value)}
            >
              <option value="all">All Sheets</option>
              <option value="commissary">🏭 Commissary (CSL)</option>
              <option value="commissary_home">🏠 Commissary Home</option>
              <option value="food">🍝 Food</option>
              <option value="food_2">🍕 Food 2</option>
              <option value="production">⚙️ Production</option>
              <option value="coffee_general">☕ Coffee & General</option>
              <option value="shake">🥤 Shake</option>
            </select>
            <div style={{ display: 'flex', gap: '0.375rem' }}>
              {(['all', 'low', 'out'] as const).map(f => (
                <button key={f} onClick={() => setStockFilter(f)} style={{
                  padding: '0.45rem 0.875rem', borderRadius: 'var(--radius-md)', border: '1px solid',
                  borderColor: stockFilter === f ? 'var(--color-primary)' : 'var(--color-border)',
                  background: stockFilter === f ? 'rgba(74,124,89,0.12)' : 'var(--color-surface)',
                  color: stockFilter === f ? 'var(--color-primary-light)' : 'var(--color-text-muted)',
                  fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                }}>
                  {f === 'all' ? 'All Status' : f === 'low' ? '⚠️ Low' : '🚫 Out'}
                </button>
              ))}
            </div>
          </div>

          {/* Stock table — group by commissary */}
          {commissaryBranches.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>No active commissaries found.</div>
          ) : commissaryBranches.map(comm => {
            const cats = commCategories.filter(c => sheetFilter === 'all' || c.sheet_type === sheetFilter)
            const rows: { item: CommItem; log: DailyLog | undefined; ending: number | null; status: string }[] = []

            for (const cat of cats) {
              const catItems = commItems.filter(i => {
                if (i.category_id !== cat.id) return false
                return true
              })
              for (const item of catItems) {
                const log = logMap[logKey(comm.id, item.id)]
                const start = log?.starting_stock ?? null
                const add   = log?.additional_stock ?? 0
                const used  = log?.used_stock ?? 0
                const ending = start !== null ? Math.max(0, start + add - used) : null
                const min    = item.min_stock_level ?? 0
                const status = ending === null ? 'unset' : ending === 0 ? 'out' : (min > 0 && ending <= min) ? 'low' : 'ok'
                if (stockFilter === 'low' && status !== 'low') continue
                if (stockFilter === 'out' && status !== 'out') continue
                rows.push({ item, log, ending, status })
              }
            }

            if (rows.length === 0 && stockFilter !== 'all') return null

            return (
              <div key={comm.id} className="card" style={{ marginBottom: '1.25rem', padding: 0, overflow: 'hidden' }}>
                {/* Branch header */}
                <div style={{
                  padding: '0.85rem 1.25rem',
                  background: 'linear-gradient(90deg, var(--color-surface-2), var(--color-surface))',
                  borderBottom: '1px solid var(--color-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>🏭 {comm.name}</span>
                    {comm.region && <span style={{ marginLeft: '0.6rem', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{comm.region}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {rows.filter(r => r.status === 'out').length > 0 && (
                      <span className="badge badge-danger">{rows.filter(r => r.status === 'out').length} Out</span>
                    )}
                    {rows.filter(r => r.status === 'low').length > 0 && (
                      <span className="badge badge-warning">{rows.filter(r => r.status === 'low').length} Low</span>
                    )}
                  </div>
                </div>

                {rows.length === 0 ? (
                  <p style={{ padding: '1.5rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>No commissary logs for today.</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Tagged</th>
                        <th>Category</th>
                        <th style={{ textAlign: 'center' }}>Starting</th>
                        <th style={{ textAlign: 'center' }}>Additional</th>
                        <th style={{ textAlign: 'center' }}>Used</th>
                        <th style={{ textAlign: 'center' }}>Ending</th>
                        <th style={{ textAlign: 'center' }}>Min</th>
                        <th>Status</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ item, log, ending, status }) => {
                        const cat = catById[item.category_id]
                        return (
                          <tr key={item.id} style={{ opacity: status === 'out' ? 0.7 : 1 }}>
                            <td style={{ fontWeight: 600, fontSize: '0.85rem' }}>{item.name}</td>
                            <td>
                              <InlineTagPicker itemId={item.id} />
                            </td>
                            <td>
                              <span className="badge badge-muted" style={{ fontSize: '0.65rem' }}>
                                {SHEET_LABELS[cat?.sheet_type ?? '']?.split(' ')[0] ?? '📦'} {cat?.name}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center', fontSize: '0.85rem' }}>{fmt(log?.starting_stock ?? null)}</td>
                            <td style={{ textAlign: 'center', fontSize: '0.85rem', color: (log?.additional_stock ?? 0) > 0 ? 'var(--color-success)' : undefined }}>
                              {fmt(log?.additional_stock ?? null)}
                            </td>
                            <td style={{ textAlign: 'center', fontSize: '0.85rem', color: (log?.used_stock ?? 0) > 0 ? 'var(--color-warning)' : undefined }}>
                              {fmt(log?.used_stock ?? null)}
                            </td>
                            <td style={{ textAlign: 'center', fontSize: '0.85rem', fontWeight: 700,
                              color: status === 'out' ? 'var(--color-danger-light)' : status === 'low' ? 'var(--color-warning)' : ending !== null ? 'var(--color-success)' : undefined }}>
                              {fmt(ending)}
                            </td>
                            <td style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                              {item.min_stock_level ?? '—'}
                            </td>
                            <td>
                              {status === 'unset' && <span className="badge badge-muted">No log</span>}
                              {status === 'out'   && <span className="badge badge-danger">Out</span>}
                              {status === 'low'   && <span className="badge badge-warning">Low</span>}
                              {status === 'ok'    && <span className="badge badge-success">OK</span>}
                            </td>
                            <td style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', maxWidth: 150 }}>{log?.notes || '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TAB 2 — SHIPMENTS                                          */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {tab === 'shipments' && (
        <div>
          {/* Shipment pipeline stats */}
          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px,1fr))', marginBottom: '1.5rem' }}>
            {[
              { label: 'Pending', count: shipments.filter(s => s.status === 'pending').length,   color: 'var(--color-warning)',      icon: '⏳' },
              { label: 'In Transit', count: shipments.filter(s => s.status === 'in_transit').length, color: 'var(--color-info)',    icon: '🚚' },
              { label: 'Received', count: shipments.filter(s => s.status === 'received').length,  color: 'var(--color-success)',     icon: '✅' },
              { label: 'Rejected', count: shipments.filter(s => s.status === 'rejected').length,  color: 'var(--color-danger-light)', icon: '✕' },
            ].map(s => (
              <div key={s.label} className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setShipStatus(s.label.toLowerCase().replace(' ', '_'))}>
                <div className="stat-card-icon" style={{ background: 'rgba(255,255,255,0.05)', fontSize: '1.1rem' }}>{s.icon}</div>
                <p className="stat-card-label">{s.label}</p>
                <p className="stat-card-value" style={{ color: s.count > 0 ? s.color : undefined }}>{s.count}</p>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            <select className="form-select" style={{ width: 'auto', minWidth: 180 }} value={shipBranch} onChange={e => setShipBranch(e.target.value)}>
              <option value="all">All Branches</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select className="form-select" style={{ width: 'auto' }} value={shipStatus} onChange={e => setShipStatus(e.target.value)}>
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="in_transit">In Transit</option>
              <option value="received">Received</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="table-wrapper">
            <div className="table-header">
              <p className="table-title">Shipment Log</p>
              <span className="badge badge-muted">{shipments.length} total</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Branch / Franchise</th>
                  <th>Qty</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Sent</th>
                  <th>Received</th>
                  <th>Notes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const filtered = shipments.filter(s =>
                    (shipStatus === 'all' || s.status === shipStatus) &&
                    (shipBranch === 'all' || s.branch_id === shipBranch)
                  )
                  if (filtered.length === 0) return (
                    <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>No shipments found.</td></tr>
                  )
                  return filtered.map(s => {
                    const franchise = franchises.find(f => f.id === s.branches?.franchise_id)
                    const itemName = s.inventory_items?.name || s.ingredients?.name || '—'
                    const unit = s.inventory_items?.unit || s.quantity_unit || ''
                    return (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 600, fontSize: '0.85rem' }}>{itemName}</td>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{s.branches?.name || '—'}</div>
                          {franchise && <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{franchise.name}</div>}
                        </td>
                        <td style={{ fontWeight: 700 }}>{s.quantity_sent} {unit}</td>
                        <td>
                          <span className={`badge ${STATUS_BADGE[s.status] || 'badge-muted'}`}>
                            {STATUS_LABEL[s.status] || s.status}
                          </span>
                          {s.rejected_reason && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--color-danger-light)', marginTop: '0.2rem' }}>
                              {s.rejected_reason}
                            </div>
                          )}
                        </td>
                        <td style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                          {new Date(s.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                        </td>
                        <td style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                          {s.sent_at ? new Date(s.sent_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '—'}
                        </td>
                        <td style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                          {s.received_at ? new Date(s.received_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '—'}
                        </td>
                        <td style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', maxWidth: 120 }}>{s.notes || '—'}</td>
                        <td>
                          <div className="flex gap-1">
                            {s.status === 'pending' && (
                              <>
                                <button className="btn btn-primary btn-sm" onClick={() => handleSend(s.id)} disabled={isPending}>
                                  🚚 Send
                                </button>
                                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger-light)' }} onClick={() => handleCancel(s.id)} disabled={isPending}>
                                  ✕
                                </button>
                              </>
                            )}
                            {s.status === 'in_transit' && (
                              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                                Awaiting franchiser
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TAB 3 — ITEM CATALOG (click handler for tab button above)  */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {tab === 'catalog' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <p className="text-sm text-muted">Manage the commissary items that appear on franchiser inventory sheets.</p>
          </div>

          {/* Sheet type filter for catalog */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            {['all', 'commissary', 'commissary_home', 'food', 'food_2', 'production', 'coffee_general', 'shake'].map(st => (
              <button key={st} onClick={() => setCatalogSheet(st)} style={{
                padding: '0.35rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid',
                borderColor: catalogSheet === st ? 'var(--color-primary)' : 'var(--color-border)',
                background: catalogSheet === st ? 'rgba(74,124,89,0.12)' : 'var(--color-surface)',
                color: catalogSheet === st ? 'var(--color-primary-light)' : 'var(--color-text-muted)',
                fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
              }}>
                {st === 'all' ? '📋 All' : SHEET_LABELS[st]}
              </button>
            ))}
          </div>

          {/* Group by category */}
          {inventoryCategories
            .filter(c => catalogSheet === 'all' || c.sheet_type === catalogSheet)
            .map(cat => {
              const catItems = inventoryItems.filter(i => i.category_id === cat.id)
              return (
                <div key={cat.id} className="table-wrapper" style={{ marginBottom: '1.25rem' }}>
                  <div className="table-header">
                    <p className="table-title">
                      {SHEET_LABELS[cat.sheet_type]?.split(' ')[0] ?? '📦'} {cat.name}
                    </p>
                    <span className="badge badge-muted">{catItems.length} items</span>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>Item Name</th>
                        <th>Unit</th>
                        <th>Min Stock</th>
                        <th>Tagged To</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {catItems.length === 0 ? (
                        <tr><td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)' }}>No items in this category.</td></tr>
                      ) : catItems.map(item => {
                        const entry = itemTagsMap[item.id]
                        const tagLabels = entry?.labels || []
                        return (
                        <tr key={item.id}>
                          <td style={{ fontWeight: 600 }}>{item.name}</td>
                          <td style={{ color: 'var(--color-text-muted)' }}>{item.unit || '—'}</td>
                          <td>{item.min_stock_level || '—'}</td>
                          <td>
                            <InlineTagPicker itemId={item.id} />
                          </td>
                          <td>
                            <span className={`badge ${item.is_active ? 'badge-success' : 'badge-danger'}`}>
                              {item.is_active ? 'Active' : 'Hidden'}
                            </span>
                          </td>
                          <td>
                            <button className="btn btn-ghost btn-sm" onClick={() => handleToggleItem(item.id, item.is_active)} disabled={isPending}>
                              {item.is_active ? 'Hide' : 'Show'}
                            </button>
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
              )
            })
          }

          {inventoryCategories.filter(c => catalogSheet === 'all' || c.sheet_type === catalogSheet).length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
              No commissary categories found. Add items using the ➕ Add Item button above.
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* MODALS                                                      */}
      {/* ═══════════════════════════════════════════════════════════ */}

      {/* Create Shipment Modal */}
      {modal === 'shipment' && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <p className="modal-title">🚚 Create Commissary Shipment</p>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>
            {formError   && <div className="alert alert-danger">{formError}</div>}
            {formSuccess && <div className="alert alert-success">✅ {formSuccess}</div>}
            <form onSubmit={handleCreateShipment}>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Branch *</label>
                    <select name="branch_id" className="form-select" required>
                      <option value="">Select branch…</option>
                      {franchises.map(f => (
                        <optgroup key={f.id} label={f.name}>
                          {branches.filter(b => b.franchise_id === f.id).map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Commissary Item *</label>
                    <select name="inventory_item_id" className="form-select" required>
                      <option value="">Select item…</option>
                      {commCategories.map(cat => (
                        <optgroup key={cat.id} label={`${cat.sheet_type === 'commissary_home' ? '🏠' : '🏭'} ${cat.name}`}>
                          {commItems.filter(i => i.category_id === cat.id).map(i => (
                            <option key={i.id} value={i.id}>{i.name}{i.unit ? ` (${i.unit})` : ''}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Quantity *</label>
                    <input name="quantity" type="number" step="0.5" min="0.5" className="form-input" placeholder="e.g. 10" required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Unit (optional override)</label>
                    <input name="quantity_unit" className="form-input" placeholder="e.g. pcs, L, kg" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <textarea name="notes" className="form-textarea" placeholder="Batch number, expiry date, etc." style={{ minHeight: '70px' }} />
                </div>
                <div style={{ padding: '0.6rem 0.875rem', background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', color: 'var(--color-warning)' }}>
                  💡 Shipment starts as <strong>Pending</strong>. Click <strong>Send</strong> in the shipment list when physically dispatched. The franchiser will then see it as incoming.
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isPending}>
                  {isPending ? <><span className="loading-spinner" /> Creating…</> : '🚚 Create Shipment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Inventory Item Modal */}
      {modal === 'inventory_item' && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <p className="modal-title">➕ Add Commissary Item</p>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>
            {formError   && <div className="alert alert-danger">{formError}</div>}
            {formSuccess && <div className="alert alert-success">✅ {formSuccess}</div>}
            <form onSubmit={handleCreateInventoryItem}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Category *</label>
                  <select name="category_id" className="form-select" required>
                    <option value="">Select category…</option>
                    {inventoryCategories.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.sheet_type})</option>
                    ))}
                  </select>
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Item Name *</label>
                    <input name="name" className="form-input" required placeholder="e.g. Pearl Sugar" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Unit</label>
                    <input name="unit" className="form-input" placeholder="e.g. pcs, L, kg" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Min Stock Level</label>
                    <input name="min_stock_level" type="number" step="0.5" className="form-input" defaultValue={0} />
                  </div>
                </div>
                <p style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                  After creating the item, use the inline tag picker in the Item Catalog to assign branches/commissaries.
                </p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isPending}>
                  {isPending ? <span className="loading-spinner" /> : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tag management is now inline — no modal needed */}
    </>
  )
}
