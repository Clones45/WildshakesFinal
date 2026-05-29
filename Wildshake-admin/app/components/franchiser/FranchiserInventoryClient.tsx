'use client'

import React, { useState, useCallback, useTransition, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

/* ─── Types ────────────────────────────────────────────────────── */
interface Category {
  id: string
  name: string
  sheet_type: 'food' | 'commissary' | 'commissary_home'
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

interface MenuLog {
  id: string
  product_id: string
  starting_stock: number | null
  additional_stock: number | null
  notes: string | null
}

interface FoodMenuLink {
  id: string
  inventory_item_id: string
  product_id: string
}

interface Props {
  branchId: string | null
  branchName: string
  categories: Category[]
  items: InventoryItem[]
  todayLogs: DailyLog[]
  today: string
  products: Product[]
  menuLogs: MenuLog[]
  foodMenuLinks: FoodMenuLink[]
  soldMap: Record<string, number>
  cancelledMap: Record<string, number>
  voidedMap: Record<string, number>
}

/* ─── Sheet Tab Config ─────────────────────────────────────────── */
const SHEET_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  food:             { label: 'Food Items',        icon: '🍝', color: '#e67e22' },
  commissary:       { label: 'Commissary (CSL)',   icon: '🏭', color: '#2980b9' },
  commissary_home:  { label: 'Commissary Home',    icon: '🏠', color: '#8e44ad' },
  menu_items:       { label: 'Menu Items',         icon: '📋', color: '#16a085' },
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
  products, menuLogs, foodMenuLinks,
  soldMap, cancelledMap, voidedMap,
}: Props) {
  const supabase = createClient()
  const [, startTransition] = useTransition()

  /* local state mirror */
  const [logs, setLogs] = useState<Record<string, DailyLog>>(() => {
    const map: Record<string, DailyLog> = {}
    for (const log of todayLogs) map[log.inventory_item_id] = log
    return map
  })

  const [mLogs, setMLogs] = useState<Record<string, MenuLog>>(() => {
    const map: Record<string, MenuLog> = {}
    for (const log of menuLogs) map[log.product_id] = log
    return map
  })

  /* food item → product links (editable client-side) */
  const [links, setLinks] = useState<FoodMenuLink[]>(foodMenuLinks)

  const [activeSheet, setActiveSheet] = useState<string>('menu_items')
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState('')
  const [showOnlyLow, setShowOnlyLow] = useState(false)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

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

  /* Group products by POS category for Menu Items tab */
  const productsByCategory = useCallback(() => {
    const grouped: Record<string, Product[]> = {}
    for (const p of products) {
      if (!grouped[p.category]) grouped[p.category] = []
      grouped[p.category].push(p)
    }
    return grouped
  }, [products])

  /* Compute ending for menu item: starting + additional - sold */
  function menuEnding(productId: string) {
    const log = mLogs[productId]
    const start = log?.starting_stock ?? null
    const add   = log?.additional_stock ?? 0
    const sold  = soldMap[productId] ?? 0
    if (start === null) return null
    return Math.max(0, start + add - sold)
  }

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
  const allItems = items
  const filledCount = Object.values(logs).filter(l => l.ending_stock !== null || l.starting_stock !== null).length
  const menuFilledCount = Object.values(mLogs).filter(l => l.starting_stock !== null).length
  const lowCount = allItems.filter(i => {
    const log = logs[i.id]
    return getStockStatus(log?.ending_stock ?? null, i.min_stock_level) === 'low'
  }).length
  const outCount = allItems.filter(i => {
    const log = logs[i.id]
    return getStockStatus(log?.ending_stock ?? null, i.min_stock_level) === 'out'
  }).length

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
  }

  /* ── Save menu item field ──────────────────────────────────────── */
  async function saveMenuField(
    product: Product,
    field: 'starting_stock' | 'additional_stock' | 'notes',
    value: string
  ) {
    if (!branchId) return
    const parsed = field === 'notes' ? value : (value === '' ? null : parseFloat(value))
    const existingLog = mLogs[product.id]

    const newLog: MenuLog = {
      ...(existingLog ?? {
        id: '',
        product_id: product.id,
        starting_stock: null,
        additional_stock: null,
        notes: null,
      }),
      [field]: parsed,
    }
    setMLogs(prev => ({ ...prev, [product.id]: newLog }))
    setSaving(prev => ({ ...prev, [`m_${product.id}`]: true }))

    try {
      if (existingLog?.id) {
        await supabase
          .from('menu_item_daily_logs')
          .update({ [field]: parsed })
          .eq('id', existingLog.id)
      } else {
        const { data, error } = await supabase
          .from('menu_item_daily_logs')
          .insert({
            branch_id: branchId,
            product_id: product.id,
            log_date: today,
            [field]: parsed,
          })
          .select('id')
          .single()
        if (!error && data) {
          setMLogs(prev => ({
            ...prev,
            [product.id]: { ...newLog, id: data.id },
          }))
        }
      }
    } catch {
      // silent fail
    } finally {
      setSaving(prev => ({ ...prev, [`m_${product.id}`]: false }))
    }
  }

  /* ── Copy yesterday's ending → today's starting ───────────────── */
  async function copyFromYesterday() {
    if (!branchId) return
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

    if (activeSheet === 'menu_items') {
      const { data: yestLogs } = await supabase
        .from('menu_item_daily_logs')
        .select('product_id, starting_stock, additional_stock')
        .eq('branch_id', branchId)
        .eq('log_date', yesterday)

      if (!yestLogs || yestLogs.length === 0) {
        showToast('No yesterday menu logs found.')
        return
      }
      startTransition(async () => {
        for (const yl of yestLogs) {
          const sold = soldMap[yl.product_id] ?? 0
          const add  = yl.additional_stock ?? 0
          const start = yl.starting_stock ?? 0
          const yesterdayEnding = Math.max(0, start + add - sold)
          const product = products.find(p => p.id === yl.product_id)
          if (product && !mLogs[yl.product_id]?.starting_stock) {
            await saveMenuField(product, 'starting_stock', String(yesterdayEnding))
          }
        }
        showToast('✅ Copied yesterday\'s ending → today\'s menu starting.')
      })
    } else {
      const { data: yestLogs } = await supabase
        .from('daily_inventory_logs')
        .select('inventory_item_id, ending_stock')
        .eq('branch_id', branchId)
        .eq('log_date', yesterday)

      if (!yestLogs || yestLogs.length === 0) {
        showToast('No yesterday logs found.')
        return
      }
      startTransition(async () => {
        for (const yl of yestLogs) {
          if (yl.ending_stock !== null && !logs[yl.inventory_item_id]?.starting_stock) {
            await saveField(
              { id: yl.inventory_item_id } as InventoryItem,
              'starting_stock',
              String(yl.ending_stock)
            )
          }
        }
        showToast(`✅ Copied yesterday's ending → today's starting.`)
      })
    }
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
  const sheetTypes = ['menu_items', 'food', 'commissary', 'commissary_home']
  const categoriesBySheet = categories.filter(c => c.sheet_type === activeSheet)

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
        </div>
      </div>

      {/* KPI Summary */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '1.25rem' }}>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: 'rgba(22,160,133,0.15)', color: '#16a085' }}>📋</div>
          <p className="stat-card-label">Menu Items Tracked</p>
          <p className="stat-card-value">{menuFilledCount}</p>
          <p className="stat-card-trend neutral">of {products.length} products</p>
        </div>
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

      {/* ── MENU ITEMS TAB ──────────────────────────────────────────── */}
      {activeSheet === 'menu_items' && (
        <div className="table-wrapper">
          <div className="table-header" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
            <p className="table-title">📋 Menu Items — POS Inventory Tracker</p>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <div className="table-search">
                🔍
                <input
                  type="text"
                  placeholder="Search products…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: '1rem', padding: '0.5rem 1rem', flexWrap: 'wrap', fontSize: '0.74rem', color: 'var(--color-text-muted)', background: 'var(--color-surface-2)', borderBottom: '1px solid var(--color-border)' }}>
            <span>✏️ <strong>Editable</strong> — Starting, Additional, Notes</span>
            <span>🔒 <strong>Auto-filled</strong> — Sold, Cancelled, Voided from POS</span>
            <span style={{ color: '#16a085' }}>🟢 <strong>Ending</strong> = Starting + Additional − Sold</span>
          </div>

          {Object.entries(productsByCategory()).map(([category, catProducts]) => {
            const filtered = catProducts.filter(p =>
              !search || p.name.toLowerCase().includes(search.toLowerCase())
            )
            if (filtered.length === 0) return null

            return (
              <div key={category} style={{ marginBottom: '2rem' }}>
                {/* Category Header */}
                <div style={{
                  padding: '0.5rem 1rem',
                  background: 'rgba(22,160,133,0.08)',
                  borderLeft: '3px solid #16a085',
                  borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                  marginBottom: '0',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                  color: '#16a085',
                }}>
                  {category}
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: '28%' }}>Product</th>
                        <th style={{ width: '7%', textAlign: 'center' }}>Unit</th>
                        <th style={{ width: '9%', textAlign: 'center' }}>Starting ✏️</th>
                        <th style={{ width: '9%', textAlign: 'center' }}>Additional ✏️</th>
                        <th style={{ width: '8%', textAlign: 'center', color: '#27ae60' }}>Sold 🔒</th>
                        <th style={{ width: '8%', textAlign: 'center', color: '#e67e22' }}>Cancelled 🔒</th>
                        <th style={{ width: '8%', textAlign: 'center', color: '#dc3545' }}>Voided 🔒</th>
                        <th style={{ width: '9%', textAlign: 'center', color: '#16a085' }}>Ending 🔒</th>
                        <th style={{ width: '7%', textAlign: 'center' }}>Status</th>
                        <th style={{ width: '9%' }}>Notes ✏️</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(product => {
                        const log = mLogs[product.id]
                        const sold      = soldMap[product.id] ?? 0
                        const cancelled = cancelledMap[product.id] ?? 0
                        const voided    = voidedMap[product.id] ?? 0
                        const ending    = menuEnding(product.id)
                        const isSaving  = saving[`m_${product.id}`]

                        const status = ending !== null
                          ? ending === 0 ? 'out' : 'ok'
                          : 'unset'

                        const rowBg = status === 'out'
                          ? 'rgba(220,53,69,0.05)'
                          : undefined

                        return (
                          <tr key={product.id} style={{ background: rowBg }}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                {isSaving && <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>💾</span>}
                                <div>
                                  <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{product.name}</span>
                                  {!product.is_available && (
                                    <span style={{ marginLeft: '0.4rem', fontSize: '0.68rem', color: '#dc3545', background: 'rgba(220,53,69,0.1)', padding: '1px 5px', borderRadius: '4px' }}>
                                      Unavailable
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>pcs</td>
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="number" min="0" step="1" placeholder="—"
                                defaultValue={log?.starting_stock ?? ''}
                                onBlur={e => saveMenuField(product, 'starting_stock', e.target.value)}
                                style={inputStyle}
                              />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="number" min="0" step="1" placeholder="0"
                                defaultValue={log?.additional_stock ?? ''}
                                onBlur={e => saveMenuField(product, 'additional_stock', e.target.value)}
                                style={inputStyle}
                              />
                            </td>
                            {/* Sold — read-only, from POS */}
                            <td style={{ textAlign: 'center' }}>
                              <span style={{
                                display: 'inline-block',
                                minWidth: '40px',
                                padding: '0.25rem 0.5rem',
                                borderRadius: 'var(--radius-sm)',
                                background: sold > 0 ? 'rgba(39,174,96,0.12)' : 'transparent',
                                color: sold > 0 ? '#27ae60' : 'var(--color-text-muted)',
                                fontWeight: sold > 0 ? 700 : 400,
                                fontSize: '0.85rem',
                                textAlign: 'center',
                              }}>
                                {sold}
                              </span>
                            </td>
                            {/* Cancelled — read-only */}
                            <td style={{ textAlign: 'center' }}>
                              <span style={{
                                display: 'inline-block', minWidth: '40px',
                                padding: '0.25rem 0.5rem', borderRadius: 'var(--radius-sm)',
                                background: cancelled > 0 ? 'rgba(230,126,34,0.12)' : 'transparent',
                                color: cancelled > 0 ? '#e67e22' : 'var(--color-text-muted)',
                                fontWeight: cancelled > 0 ? 700 : 400,
                                fontSize: '0.85rem', textAlign: 'center',
                              }}>
                                {cancelled}
                              </span>
                            </td>
                            {/* Voided — read-only */}
                            <td style={{ textAlign: 'center' }}>
                              <span style={{
                                display: 'inline-block', minWidth: '40px',
                                padding: '0.25rem 0.5rem', borderRadius: 'var(--radius-sm)',
                                background: voided > 0 ? 'rgba(220,53,69,0.12)' : 'transparent',
                                color: voided > 0 ? '#dc3545' : 'var(--color-text-muted)',
                                fontWeight: voided > 0 ? 700 : 400,
                                fontSize: '0.85rem', textAlign: 'center',
                              }}>
                                {voided}
                              </span>
                            </td>
                            {/* Ending — auto-computed */}
                            <td style={{ textAlign: 'center' }}>
                              <span style={{
                                display: 'inline-block', minWidth: '52px',
                                padding: '0.3rem 0.5rem', borderRadius: 'var(--radius-sm)',
                                background: ending === null
                                  ? 'transparent'
                                  : ending === 0
                                    ? 'rgba(220,53,69,0.12)'
                                    : 'rgba(22,160,133,0.12)',
                                color: ending === null
                                  ? 'var(--color-text-muted)'
                                  : ending === 0 ? '#dc3545' : '#16a085',
                                fontWeight: 700, fontSize: '0.88rem', textAlign: 'center',
                                border: ending !== null ? '1px solid rgba(22,160,133,0.25)' : 'none',
                              }}>
                                {ending === null ? '—' : ending}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {status === 'unset' && <span style={{ color: 'var(--color-text-muted)', fontSize: '0.72rem' }}>—</span>}
                              {status === 'ok'    && <span style={{ color: '#27ae60', fontSize: '0.72rem', fontWeight: 700 }}>✅ OK</span>}
                              {status === 'out'   && <span style={{ color: '#dc3545', fontSize: '0.72rem', fontWeight: 700 }}>🔴 Out</span>}
                            </td>
                            <td>
                              <input
                                type="text" placeholder="Note…"
                                defaultValue={log?.notes ?? ''}
                                onBlur={e => saveMenuField(product, 'notes', e.target.value)}
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
        </div>
      )}

      {/* ── FOOD / COMMISSARY TABS ──────────────────────────────────── */}
      {activeSheet !== 'menu_items' && (
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

          {activeSheet === 'food' && (
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
                        <th style={{ width: activeSheet === 'food' ? '22%' : '35%' }}>Item</th>
                        {activeSheet === 'food' && (
                          <th style={{ width: '18%' }}>Menu Item Tags 🏷️</th>
                        )}
                        <th style={{ width: '8%', textAlign: 'center' }}>Unit</th>
                        <th style={{ width: '10%', textAlign: 'center' }}>Starting</th>
                        <th style={{ width: '10%', textAlign: 'center' }}>Additional</th>
                        {activeSheet === 'food' && (
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
                            {activeSheet === 'food' && (
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
                            {activeSheet === 'food' && (
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
                                  ? `${log?.starting_stock ?? 0} + ${log?.additional_stock ?? 0} − ${activeSheet === 'food' ? (log?.used_stock ?? 0) + ' used' : log?.ending_stock ?? 0} = ${ending}`
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
      )}

      {/* Legend */}
      <div style={{
        marginTop: '1rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap',
        fontSize: '0.78rem', color: 'var(--color-text-muted)',
      }}>
        {activeSheet === 'menu_items' ? (
          <>
            <span>✅ <strong>OK</strong> — has ending stock</span>
            <span>🔴 <strong>Out</strong> — ending reached zero</span>
            <span>💾 auto-saves on field blur</span>
          </>
        ) : (
          <>
            <span>✅ <strong>OK</strong> — above minimum level</span>
            <span>⚠️ <strong>Low</strong> — at or below minimum</span>
            <span>🔴 <strong>Out</strong> — zero stock</span>
            <span>💾 auto-saves on field blur</span>
          </>
        )}
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
