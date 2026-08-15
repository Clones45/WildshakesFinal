'use client'

import React, { useState, useCallback, useTransition, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

/* ─── Types ────────────────────────────────────────────────────── */
interface Category {
  id: string
  name: string
  sheet_type: 'food' | 'shake' | 'coffee_general' | 'commissary' | 'commissary_home'
  sort_order: number
}

interface InventoryItem {
  id: string
  category_id: string
  name: string
  unit: string | null
  min_stock_level: number | null
  sort_order: number
}

interface DailyLog {
  id: string
  inventory_item_id: string
  starting_stock: number | null
  additional_stock: number | null
  used_stock: number | null
  ending_stock: number | null
  notes: string | null
}

interface Product {
  id: string
  name: string
  category: string
  price: number
  is_available: boolean
}

interface FoodMenuLink {
  id: string
  inventory_item_id: string
  product_id: string
}

interface IncomingShipment {
  id: string
  quantity_sent: number
  quantity_unit: string | null
  status: string
  notes: string | null
  sent_at: string | null
  created_at: string
  inventory_item_id: string | null
  inventory_items: { id: string; name: string; unit: string | null } | null
}

interface Props {
  branchId: string | null
  branchName: string
  categories: Category[]
  items: InventoryItem[]
  todayLogs: DailyLog[]
  today: string
  products: Product[]
  foodMenuLinks: FoodMenuLink[]
  soldMap: Record<string, number>
  cancelledMap: Record<string, number>
  voidedMap: Record<string, number>
  incomingShipments?: IncomingShipment[]
}

/* ─── Sheet Tab Config ─────────────────────────────────────────── */
const SHEET_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  food:             { label: 'Food Items',        icon: '🍝', color: '#e67e22' },
  shake:            { label: 'Shakes',            icon: '🥤', color: '#d63384' },
  coffee_general:   { label: 'Coffee',             icon: '☕', color: '#795548' },
  commissary:       { label: 'Commissary (CSL)',   icon: '🏭', color: '#2980b9' },
  commissary_home:  { label: 'Commissary Home',    icon: '🏠', color: '#8e44ad' },
}

/* ─── Status helper ────────────────────────────────────────────── */
function getStockStatus(ending: number | null, min: number | null) {
  if (ending === null) return 'unset'
  if (min === null || min === 0) {
    if (ending === 0) return 'out'
    return 'ok'
  }
  if (ending === 0) return 'out'
  if (ending <= min) return 'low'
  return 'ok'
}

/* Shared input style */
const inputStyle: React.CSSProperties = {
  width: '72px',
  padding: '0.3rem 0.4rem',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--color-text)',
  fontSize: '0.82rem',
  textAlign: 'center',
  outline: 'none',
  transition: 'border-color 0.15s',
}

const readonlyStyle: React.CSSProperties = {
  ...inputStyle,
  background: 'var(--color-surface-2)',
  color: 'var(--color-text-muted)',
  cursor: 'not-allowed',
  borderColor: 'transparent',
}

const endingStyle: React.CSSProperties = {
  ...inputStyle,
  background: 'rgba(22,160,133,0.08)',
  border: '1px solid rgba(22,160,133,0.3)',
  color: '#16a085',
  fontWeight: 700,
  cursor: 'not-allowed',
}

/* ─── Component ─────────────────────────────────────────────────── */
export default function FranchiserInventoryClient({
  branchId, branchName, categories, items, todayLogs, today,
  products, foodMenuLinks,
  soldMap, cancelledMap, voidedMap,
  incomingShipments = [],
}: Props) {
  const supabase = createClient()
  const [, startTransition] = useTransition()

  /* local state mirror */
  const [logs, setLogs] = useState<Record<string, DailyLog>>(() => {
    const map: Record<string, DailyLog> = {}
    for (const log of todayLogs) map[log.inventory_item_id] = log
    return map
  })

  /* food item → product links (editable client-side) */
  const [links, setLinks] = useState<FoodMenuLink[]>(foodMenuLinks)

  const [activeSheet, setActiveSheet] = useState<string>('food')
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState('')
  const [showOnlyLow, setShowOnlyLow] = useState(false)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [shipmentProcessing, setShipmentProcessing] = useState<Record<string, boolean>>({})
  const [localShipments, setLocalShipments] = useState<IncomingShipment[]>(incomingShipments)

  /* Tag picker state per food item */
  const [tagPickerOpen, setTagPickerOpen] = useState<string | null>(null)
  const [tagSearch, setTagSearch] = useState('')
  const tagPickerRef = useRef<HTMLDivElement>(null)

  /* ── Helpers ─────────────────────────────────────────────────── */
  function showToast(msg: string) {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 3000)
  }

  const itemsByCategory = useCallback((catId: string) =>
    items.filter(i => i.category_id === catId && (
      !search || i.name.toLowerCase().includes(search.toLowerCase())
    )), [items, search])

  /* Compute ending for food item: starting + additional - used */
  function foodEnding(item: InventoryItem) {
    const log  = logs[item.id]
    const start = log?.starting_stock ?? null
    const add   = log?.additional_stock ?? 0
    const used  = log?.used_stock ?? 0
    if (start === null) return null
    return Math.max(0, start + add - used)
  }

  /* Stats */
  // ending_stock is never persisted to the DB anywhere in this app — it's always computed
  // on the fly from starting + additional - used (see foodEnding() above). Reading the raw
  // column here made Low/Out of Stock always show zero regardless of real stock levels.
  const allItems = items
  const filledCount = Object.values(logs).filter(l => l.starting_stock !== null).length
  const lowCount = allItems.filter(i => getStockStatus(foodEnding(i), i.min_stock_level) === 'low').length
  const outCount = allItems.filter(i => getStockStatus(foodEnding(i), i.min_stock_level) === 'out').length

  /* ── Auto-sync POS product availability from food item ending ─── */
  // Uses branch_menu_availability (per-branch override, same table as Menu Availability page)
  async function syncProductAvailability(itemId: string, updatedLog: DailyLog) {
    if (!branchId) return
    const linkedProductIds = links
      .filter(l => l.inventory_item_id === itemId)
      .map(l => l.product_id)
    if (linkedProductIds.length === 0) return

    const start = updatedLog.starting_stock ?? null
    if (start === null) return  // no starting stock yet — don't touch availability

    const add  = updatedLog.additional_stock ?? 0
    const used = updatedLog.used_stock ?? 0
    const ending = Math.max(0, start + add - used)
    const isAvailable = ending > 0

    const item = items.find(i => i.id === itemId)
    const linkedNames = products
      .filter(p => linkedProductIds.includes(p.id))
      .map(p => p.name)
      .join(', ')

    if (isAvailable) {
      // Restocked: remove the out-of-stock override row so it shows as available
      await supabase
        .from('branch_menu_availability')
        .delete()
        .eq('branch_id', branchId)
        .in('product_id', linkedProductIds)
      showToast(`✅ "${item?.name}" restocked — POS products available again: ${linkedNames}`)
    } else {
      // Out: upsert an override row marking each linked product unavailable at this branch
      await supabase
        .from('branch_menu_availability')
        .upsert(
          linkedProductIds.map(pid => ({
            branch_id: branchId,
            product_id: pid,
            is_available: false,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: 'branch_id,product_id' }
        )
      showToast(`🔴 "${item?.name}" is out — auto-marked sold out in POS: ${linkedNames}`)
    }
  }

  /* ── Save food item field ──────────────────────────────────────── */
  async function saveField(
    item: InventoryItem,
    field: 'starting_stock' | 'additional_stock' | 'notes',
    value: string
  ) {
    if (!branchId) return
    const parsed = field === 'notes' ? value : (value === '' ? null : parseFloat(value))
    const existingLog = logs[item.id]

    const newLog: DailyLog = {
      ...(existingLog ?? {
        id: '',
        inventory_item_id: item.id,
        starting_stock: null,
        additional_stock: null,
        used_stock: null,
        ending_stock: null,
        notes: null,
      }),
      [field]: parsed,
    }
    setLogs(prev => ({ ...prev, [item.id]: newLog }))
    setSaving(prev => ({ ...prev, [item.id]: true }))

    try {
      if (existingLog?.id) {
        await supabase
          .from('daily_inventory_logs')
          .update({ [field]: parsed })
          .eq('id', existingLog.id)
      } else {
        const { data, error } = await supabase
          .from('daily_inventory_logs')
          .insert({
            branch_id: branchId,
            inventory_item_id: item.id,
            log_date: today,
            [field]: parsed,
          })
          .select('id')
          .single()
        if (!error && data) {
          setLogs(prev => ({
            ...prev,
            [item.id]: { ...newLog, id: data.id },
          }))
        }
      }
    } catch {
      // silent fail
    } finally {
      setSaving(prev => ({ ...prev, [item.id]: false }))
    }

    // After saving, sync POS product availability based on new ending
    const currentLog = logs[item.id] ?? newLog
    await syncProductAvailability(item.id, { ...currentLog, [field]: typeof parsed === 'number' ? parsed : currentLog[field] })
  }

  /* ── Incoming shipment actions ─────────────────────────────────── */
  async function handleReceiveShipment(shipmentId: string, itemId: string | null, qty: number) {
    if (!branchId || !itemId) return
    setShipmentProcessing(prev => ({ ...prev, [shipmentId]: true }))
    try {
      const { markShipmentReceived } = await import('@/lib/actions/commissary')
      const r = await markShipmentReceived(shipmentId)
      if (r?.error) { showToast(`❌ ${r.error}`); return }

      // Optimistically remove from list
      setLocalShipments(prev => prev.filter(s => s.id !== shipmentId))

      // Also bump additional_stock in local state
      const existing = logs[itemId]
      const newAdd = (existing?.additional_stock ?? 0) + qty
      if (existing) {
        const updated = { ...existing, additional_stock: newAdd }
        setLogs(prev => ({ ...prev, [itemId]: updated }))
      }
      showToast(`✅ Shipment received! ${qty} added to additional stock.`)
    } finally {
      setShipmentProcessing(prev => ({ ...prev, [shipmentId]: false }))
    }
  }

  async function handleRejectShipment(shipmentId: string, reason?: string) {
    setShipmentProcessing(prev => ({ ...prev, [shipmentId]: true }))
    try {
      const { markShipmentRejected } = await import('@/lib/actions/commissary')
      const r = await markShipmentRejected(shipmentId, reason)
      if (r?.error) { showToast(`❌ ${r.error}`); return }
      setLocalShipments(prev => prev.filter(s => s.id !== shipmentId))
      showToast('Shipment rejected.')
    } finally {
      setShipmentProcessing(prev => ({ ...prev, [shipmentId]: false }))
    }
  }

  /* ── Copy yesterday's ending → today's starting ───────────────── */
  // ending is never persisted (see the Stats note above) — recomputed here from yesterday's
  // starting/additional/used, same formula as foodEnding(). "yesterday" is
  // derived from the `today` prop (already Asia/Manila-correct) rather than a naive
  // Date.now() - 86400000, which can land on the wrong calendar day near midnight.
  async function copyFromYesterday() {
    if (!branchId) return
    const anchor = new Date(today + 'T12:00:00')
    anchor.setDate(anchor.getDate() - 1)
    const yesterday = anchor.toISOString().split('T')[0]

    const { data: yestLogs } = await supabase
      .from('daily_inventory_logs')
      .select('inventory_item_id, starting_stock, additional_stock, used_stock')
      .eq('branch_id', branchId)
      .eq('log_date', yesterday)

    if (!yestLogs || yestLogs.length === 0) {
      showToast('No yesterday logs found.')
      return
    }
    startTransition(async () => {
      for (const yl of yestLogs) {
        if (yl.starting_stock === null || logs[yl.inventory_item_id]?.starting_stock) continue
        const yesterdayEnding = Math.max(0, yl.starting_stock + (yl.additional_stock ?? 0) - (yl.used_stock ?? 0))
        await saveField(
          { id: yl.inventory_item_id } as InventoryItem,
          'starting_stock',
          String(yesterdayEnding)
        )
      }
      showToast(`✅ Copied yesterday's ending → today's starting.`)
    })
  }

  /* ── Food item tag management ─────────────────────────────────── */
  function getLinkedProductIds(itemId: string) {
    return links.filter(l => l.inventory_item_id === itemId).map(l => l.product_id)
  }

  async function toggleProductLink(inventoryItemId: string, productId: string) {
    const existing = links.find(l => l.inventory_item_id === inventoryItemId && l.product_id === productId)
    if (existing) {
      // Remove link
      setLinks(prev => prev.filter(l => l.id !== existing.id))
      await supabase.from('food_item_menu_links').delete().eq('id', existing.id)
    } else {
      // Add link
      const { data, error } = await supabase
        .from('food_item_menu_links')
        .insert({ inventory_item_id: inventoryItemId, product_id: productId })
        .select('id, inventory_item_id, product_id')
        .single()
      if (!error && data) {
        setLinks(prev => [...prev, data])
      }
    }
  }

  /* ── Filter helpers ──────────────────────────────────────────── */
  const sheetTypes = ['food', 'shake', 'coffee_general', 'commissary', 'commissary_home']
  const categoriesBySheet = categories.filter(c => c.sheet_type === activeSheet)
  // Food, Shake, and Coffee ingredients are all recipe-linked (food_item_menu_links) and get
  // their "Used" auto-summed from POS sales + a menu-item tag picker; Commissary sheets don't.
  const isRecipeLinkedSheet = activeSheet === 'food' || activeSheet === 'shake' || activeSheet === 'coffee_general'

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <div>
      {/* Toast */}
      {toastMsg && (
        <div style={{
          position: 'fixed', top: '1.25rem', right: '1.25rem', zIndex: 9999,
          background: 'var(--color-surface-2)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: '0.75rem 1.25rem',
          boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
          color: 'var(--color-text)',
          fontSize: '0.85rem',
          fontWeight: 600,
        }}>
          {toastMsg}
        </div>
      )}

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1>Daily Inventory Check</h1>
          <p className="page-header-subtitle">
            {branchName} — {new Date(today + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={copyFromYesterday}>
            📋 Copy Yesterday's Ending
          </button>
          <a
            href="/franchiser/inventory/import"
            className="btn btn-ghost btn-sm"
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
              border: '1px solid rgba(212,175,55,0.4)', color: 'var(--color-accent)' }}
          >
            📥 Import Recipes
          </a>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="stat-grid" style={{ marginBottom: '1.25rem' }}>
        <div className="stat-card">
          <div className="stat-card-icon green">✅</div>
          <p className="stat-card-label">Food Items Checked</p>
          <p className="stat-card-value">{filledCount}</p>
          <p className="stat-card-trend neutral">of {allItems.length} total</p>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: 'rgba(230,126,34,0.15)', color: '#e67e22' }}>⚠️</div>
          <p className="stat-card-label">Low Stock</p>
          <p className="stat-card-value" style={{ color: lowCount > 0 ? '#e67e22' : undefined }}>{lowCount}</p>
          <p className={`stat-card-trend ${lowCount > 0 ? 'down' : 'up'}`}>
            {lowCount > 0 ? 'Needs reorder' : 'All good'}
          </p>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon red">🔴</div>
          <p className="stat-card-label">Out of Stock</p>
          <p className="stat-card-value" style={{ color: outCount > 0 ? 'var(--color-danger-light)' : undefined }}>{outCount}</p>
          <p className={`stat-card-trend ${outCount > 0 ? 'down' : 'up'}`}>
            {outCount > 0 ? 'Urgent reorder!' : 'None depleted'}
          </p>
        </div>
      </div>

      {/* Sheet Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {sheetTypes.map(sheet => {
          const info = SHEET_LABELS[sheet]
          return (
            <button
              key={sheet}
              onClick={() => setActiveSheet(sheet)}
              style={{
                padding: '0.5rem 1.1rem',
                borderRadius: 'var(--radius-md)',
                border: activeSheet === sheet
                  ? `2px solid ${info.color}`
                  : '2px solid var(--color-border)',
                background: activeSheet === sheet
                  ? `${info.color}22`
                  : 'var(--color-surface)',
                color: activeSheet === sheet ? info.color : 'var(--color-text-muted)',
                fontWeight: activeSheet === sheet ? 700 : 500,
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {info.icon} {info.label}
            </button>
          )
        })}
      </div>


        <div className="table-wrapper">
          <div className="table-header" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
            <p className="table-title">{SHEET_LABELS[activeSheet].icon} {SHEET_LABELS[activeSheet].label}</p>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="table-search">
                🔍
                <input
                  type="text"
                  placeholder="Search items…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showOnlyLow}
                  onChange={e => setShowOnlyLow(e.target.checked)}
                  style={{ accentColor: '#e67e22' }}
                />
                Low/Out only
              </label>
            </div>
          </div>

          {isRecipeLinkedSheet && (
            <div style={{ display: 'flex', gap: '1rem', padding: '0.5rem 1rem', flexWrap: 'wrap', fontSize: '0.74rem', color: 'var(--color-text-muted)', background: 'var(--color-surface-2)', borderBottom: '1px solid var(--color-border)' }}>
              <span>🏷️ <strong>Menu Tags</strong> — link this food item to POS products</span>
              <span style={{ color: '#16a085' }}>🔵 <strong>Used</strong> = auto-summed from POS sales of tagged products</span>
              <span style={{ color: '#16a085' }}>🟢 <strong>Ending</strong> = Starting + Additional − Used</span>
            </div>
          )}

          {categoriesBySheet.map(cat => {
            const catItems = itemsByCategory(cat.id).filter(item => {
              if (!showOnlyLow) return true
              const ending = foodEnding(item)
              const status = getStockStatus(ending, item.min_stock_level)
              return status === 'low' || status === 'out'
            })
            if (catItems.length === 0) return null

            return (
              <div key={cat.id} style={{ marginBottom: '2rem' }}>
                {/* Category Header */}
                <div style={{
                  padding: '0.5rem 1rem',
                  background: `${SHEET_LABELS[activeSheet].color}11`,
                  borderLeft: `3px solid ${SHEET_LABELS[activeSheet].color}`,
                  borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                  marginBottom: '0',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                  color: SHEET_LABELS[activeSheet].color,
                }}>
                  {cat.name}
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: isRecipeLinkedSheet ? '22%' : '35%' }}>Item</th>
                        {isRecipeLinkedSheet && (
                          <th style={{ width: '18%' }}>Menu Item Tags 🏷️</th>
                        )}
                        <th style={{ width: '8%', textAlign: 'center' }}>Unit</th>
                        <th style={{ width: '10%', textAlign: 'center' }}>Starting</th>
                        <th style={{ width: '10%', textAlign: 'center' }}>Additional</th>
                        {isRecipeLinkedSheet && (
                          <th style={{ width: '9%', textAlign: 'center', color: '#2980b9' }}>Used 🔒</th>
                        )}
                        <th style={{ width: '10%', textAlign: 'center', color: '#16a085' }}>Ending</th>
                        <th style={{ width: '8%', textAlign: 'center' }}>Status</th>
                        <th style={{ width: '10%' }}>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {catItems.map(item => {
                        const log = logs[item.id]
                        const isSaving = saving[item.id]
                        const ending = foodEnding(item)
                        const status = getStockStatus(ending, item.min_stock_level)
                        const used   = log?.used_stock ?? 0

                        const rowBg = status === 'out'
                          ? 'rgba(220,53,69,0.06)'
                          : status === 'low'
                            ? 'rgba(230,126,34,0.06)'
                            : undefined

                        const linkedIds = getLinkedProductIds(item.id)
                        const linkedProducts = products.filter(p => linkedIds.includes(p.id))

                        return (
                          <tr key={item.id} style={{ background: rowBg }}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {isSaving && <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', animation: 'pulse 1s infinite' }}>💾</span>}
                                <span style={{ fontWeight: 500, fontSize: '0.85rem' }}>{item.name}</span>
                              </div>
                            </td>

                            {/* ── Tag Picker (food only) ─────────────────────── */}
                            {isRecipeLinkedSheet && (
                              <td style={{ position: 'relative' }}>
                                <div
                                  style={{ cursor: 'pointer', minHeight: '32px', display: 'flex', flexWrap: 'wrap', gap: '3px', alignItems: 'center', padding: '3px 6px', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--color-border)', background: 'var(--color-surface)' }}
                                  onClick={() => {
                                    setTagPickerOpen(tagPickerOpen === item.id ? null : item.id)
                                    setTagSearch('')
                                  }}
                                >
                                  {linkedProducts.length === 0 ? (
                                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>+ Add tags…</span>
                                  ) : (
                                    linkedProducts.map(p => (
                                      <span key={p.id} style={{
                                        fontSize: '0.68rem', fontWeight: 600,
                                        background: 'rgba(22,160,133,0.15)', color: '#16a085',
                                        padding: '2px 6px', borderRadius: '999px',
                                        border: '1px solid rgba(22,160,133,0.3)',
                                        whiteSpace: 'nowrap',
                                      }}>
                                        {p.name}
                                      </span>
                                    ))
                                  )}
                                </div>

                                {/* Dropdown */}
                                {tagPickerOpen === item.id && (
                                  <div
                                    ref={tagPickerRef}
                                    style={{
                                      position: 'absolute', top: '100%', left: 0, zIndex: 500,
                                      width: '260px', maxHeight: '240px', overflowY: 'auto',
                                      background: 'var(--color-surface-2)',
                                      border: '1px solid var(--color-border)',
                                      borderRadius: 'var(--radius-md)',
                                      boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                                      padding: '0.5rem',
                                    }}
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <input
                                      autoFocus
                                      type="text"
                                      placeholder="Search products…"
                                      value={tagSearch}
                                      onChange={e => setTagSearch(e.target.value)}
                                      style={{ width: '100%', marginBottom: '0.5rem', padding: '0.3rem 0.5rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: '0.8rem', outline: 'none' }}
                                    />
                                    {products
                                      .filter(p => !tagSearch || p.name.toLowerCase().includes(tagSearch.toLowerCase()))
                                      .map(p => {
                                        const isLinked = linkedIds.includes(p.id)
                                        return (
                                          <div
                                            key={p.id}
                                            onClick={() => toggleProductLink(item.id, p.id)}
                                            style={{
                                              display: 'flex', alignItems: 'center', gap: '0.5rem',
                                              padding: '0.35rem 0.5rem', borderRadius: 'var(--radius-sm)',
                                              cursor: 'pointer', fontSize: '0.8rem',
                                              background: isLinked ? 'rgba(22,160,133,0.12)' : 'transparent',
                                              color: isLinked ? '#16a085' : 'var(--color-text)',
                                              fontWeight: isLinked ? 600 : 400,
                                              marginBottom: '1px',
                                              transition: 'background 0.1s',
                                            }}
                                          >
                                            <span style={{ width: '14px', textAlign: 'center' }}>{isLinked ? '✓' : ''}</span>
                                            <span style={{ flex: 1 }}>{p.name}</span>
                                            <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>{p.category}</span>
                                          </div>
                                        )
                                      })}
                                    <button
                                      onClick={() => setTagPickerOpen(null)}
                                      style={{ width: '100%', marginTop: '0.5rem', padding: '0.3rem', fontSize: '0.75rem', color: 'var(--color-text-muted)', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                                    >
                                      Done
                                    </button>
                                  </div>
                                )}
                              </td>
                            )}

                            <td style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>
                              {item.unit || '—'}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="number" min="0" step="0.5" placeholder="—"
                                defaultValue={log?.starting_stock ?? ''}
                                onBlur={e => saveField(item, 'starting_stock', e.target.value)}
                                style={inputStyle}
                              />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="number" min="0" step="0.5" placeholder="0"
                                defaultValue={log?.additional_stock ?? ''}
                                onBlur={e => saveField(item, 'additional_stock', e.target.value)}
                                style={inputStyle}
                              />
                            </td>

                            {/* Used (food only) — read-only */}
                            {isRecipeLinkedSheet && (
                              <td style={{ textAlign: 'center' }}>
                                <span style={{
                                  display: 'inline-block', minWidth: '40px',
                                  padding: '0.25rem 0.5rem', borderRadius: 'var(--radius-sm)',
                                  background: used > 0 ? 'rgba(41,128,185,0.12)' : 'transparent',
                                  color: used > 0 ? '#2980b9' : 'var(--color-text-muted)',
                                  fontWeight: used > 0 ? 700 : 400,
                                  fontSize: '0.85rem', textAlign: 'center',
                                }}>
                                  {linkedIds.length === 0 ? '—' : used}
                                </span>
                              </td>
                            )}

                            {/* Ending — computed */}
                            <td style={{ textAlign: 'center' }}>
                              <span style={{
                                display: 'inline-block', minWidth: '52px',
                                padding: '0.3rem 0.5rem', borderRadius: 'var(--radius-sm)',
                                background: ending === null
                                  ? 'transparent'
                                  : status === 'out'
                                    ? 'rgba(220,53,69,0.12)'
                                    : status === 'low'
                                      ? 'rgba(230,126,34,0.12)'
                                      : 'rgba(22,160,133,0.12)',
                                color: ending === null
                                  ? 'var(--color-text-muted)'
                                  : status === 'out' ? '#dc3545'
                                    : status === 'low' ? '#e67e22'
                                      : '#16a085',
                                fontWeight: 700, fontSize: '0.88rem', textAlign: 'center',
                                border: ending !== null ? '1px solid rgba(22,160,133,0.25)' : 'none',
                              }}
                                title={ending !== null
                                  ? `${log?.starting_stock ?? 0} + ${log?.additional_stock ?? 0} − ${isRecipeLinkedSheet ? (log?.used_stock ?? 0) + ' used' : log?.ending_stock ?? 0} = ${ending}`
                                  : 'Enter starting stock to compute ending'}
                              >
                                {ending === null ? '—' : ending}
                              </span>
                            </td>

                            <td style={{ textAlign: 'center' }}>
                              {status === 'unset' && <span style={{ color: 'var(--color-text-muted)', fontSize: '0.72rem' }}>—</span>}
                              {status === 'ok'    && <span style={{ color: '#27ae60', fontSize: '0.72rem', fontWeight: 700 }}>✅ OK</span>}
                              {status === 'low'   && <span style={{ color: '#e67e22', fontSize: '0.72rem', fontWeight: 700 }}>⚠️ Low</span>}
                              {status === 'out'   && <span style={{ color: '#dc3545', fontSize: '0.72rem', fontWeight: 700 }}>🔴 Out</span>}
                            </td>
                            <td>
                              <input
                                type="text" placeholder="Note…"
                                defaultValue={log?.notes ?? ''}
                                onBlur={e => saveField(item, 'notes', e.target.value)}
                                style={{ ...inputStyle, width: '100%', textAlign: 'left' }}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}

          {categoriesBySheet.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
              No items found.
            </div>
          )}
        </div>

      {/* Legend */}
      <div style={{
        marginTop: '1rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap',
        fontSize: '0.78rem', color: 'var(--color-text-muted)',
      }}>
        <span>✅ <strong>OK</strong> — above minimum level</span>
        <span>⚠️ <strong>Low</strong> — at or below minimum</span>
        <span>🔴 <strong>Out</strong> — zero stock</span>
        <span>💾 auto-saves on field blur</span>
      </div>

      {/* Close tag picker on outside click */}
      {tagPickerOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 499 }}
          onClick={() => setTagPickerOpen(null)}
        />
      )}
    </div>
  )
}
