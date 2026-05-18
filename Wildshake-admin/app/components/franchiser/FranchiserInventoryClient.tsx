'use client'

import React, { useState, useCallback, useTransition } from 'react'
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
  ending_stock: number | null
  notes: string | null
}

interface Props {
  branchId: string | null
  branchName: string
  categories: Category[]
  items: InventoryItem[]
  todayLogs: DailyLog[]
  today: string
}

/* ─── Sheet Tab Labels ─────────────────────────────────────────── */
const SHEET_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  food:             { label: 'Food Items',        icon: '🍝', color: '#e67e22' },
  commissary:       { label: 'Commissary (CSL)',   icon: '🏭', color: '#2980b9' },
  commissary_home:  { label: 'Commissary Home',    icon: '🏠', color: '#8e44ad' },
}

/* ─── Status helper ────────────────────────────────────────────── */
function getStockStatus(ending: number | null, min: number | null) {
  if (ending === null) return 'unset'
  if (min === null || min === 0) return 'ok'
  if (ending === 0) return 'out'
  if (ending <= min) return 'low'
  return 'ok'
}

/* ─── Component ─────────────────────────────────────────────────── */
export default function FranchiserInventoryClient({
  branchId, branchName, categories, items, todayLogs, today,
}: Props) {
  const supabase = createClient()
  const [, startTransition] = useTransition()

  /* local state mirror of logs so edits are instant */
  const [logs, setLogs] = useState<Record<string, DailyLog>>(() => {
    const map: Record<string, DailyLog> = {}
    for (const log of todayLogs) map[log.inventory_item_id] = log
    return map
  })

  const [activeSheet, setActiveSheet] = useState<string>('food')
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState('')
  const [showOnlyLow, setShowOnlyLow] = useState(false)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  /* Group items by category */
  const categoriesBySheet = categories.filter(c => c.sheet_type === activeSheet)
  const itemsByCategory = useCallback((catId: string) =>
    items.filter(i => i.category_id === catId && (
      !search || i.name.toLowerCase().includes(search.toLowerCase())
    )), [items, search])

  /* Stats */
  const allItems = items
  const logsToday = Object.values(logs)
  const filledCount = logsToday.filter(l => l.ending_stock !== null).length
  const lowCount = allItems.filter(i => {
    const log = logs[i.id]
    return getStockStatus(log?.ending_stock ?? null, i.min_stock_level) === 'low'
  }).length
  const outCount = allItems.filter(i => {
    const log = logs[i.id]
    return getStockStatus(log?.ending_stock ?? null, i.min_stock_level) === 'out'
  }).length

  /* Save a single field for one item */
  async function saveField(
    item: InventoryItem,
    field: 'starting_stock' | 'additional_stock' | 'ending_stock' | 'notes',
    value: string
  ) {
    if (!branchId) return
    const parsed = field === 'notes' ? value : (value === '' ? null : parseFloat(value))
    const existingLog = logs[item.id]

    const newLog = {
      ...(existingLog ?? {
        id: '',
        inventory_item_id: item.id,
        starting_stock: null,
        additional_stock: null,
        ending_stock: null,
        notes: null,
      }),
      [field]: parsed,
    }
    setLogs(prev => ({ ...prev, [item.id]: newLog }))
    setSaving(prev => ({ ...prev, [item.id]: true }))

    try {
      if (existingLog?.id) {
        // Update existing log
        await supabase
          .from('daily_inventory_logs')
          .update({ [field]: parsed })
          .eq('id', existingLog.id)
      } else {
        // Insert new log row
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
      // silent fail; user sees last typed value
    } finally {
      setSaving(prev => ({ ...prev, [item.id]: false }))
    }
  }

  function showToast(msg: string) {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 2500)
  }

  /* Copy yesterday's ending as today's starting for an item */
  async function copyFromYesterday() {
    if (!branchId) return
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    const { data: yestLogs } = await supabase
      .from('daily_inventory_logs')
      .select('inventory_item_id, ending_stock')
      .eq('branch_id', branchId)
      .eq('log_date', yesterday)

    if (!yestLogs || yestLogs.length === 0) {
      showToast('No yesterday logs found to copy from.')
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
      showToast(`✅ Copied ${yestLogs.length} starting values from yesterday.`)
    })
  }

  const sheetTypes = ['food', 'commissary', 'commissary_home']

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
            Manual daily tracking for {branchName} — {new Date(today + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={copyFromYesterday}>
            📋 Copy Yesterday's Ending
          </button>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '1.25rem' }}>
        <div className="stat-card">
          <div className="stat-card-icon green">✅</div>
          <p className="stat-card-label">Items Checked</p>
          <p className="stat-card-value">{filledCount}</p>
          <p className="stat-card-trend neutral">of {allItems.length} total items</p>
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
      <div style={{
        display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap',
      }}>
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

      {/* Filters */}
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

        {/* Inventory Table per Category */}
        {categoriesBySheet.map(cat => {
          const catItems = itemsByCategory(cat.id).filter(item => {
            if (!showOnlyLow) return true
            const log = logs[item.id]
            const status = getStockStatus(log?.ending_stock ?? null, item.min_stock_level)
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

              <table>
                <thead>
                  <tr>
                    <th style={{ width: '35%' }}>Item</th>
                    <th style={{ width: '8%', textAlign: 'center' }}>Unit</th>
                    <th style={{ width: '13%', textAlign: 'center' }}>Starting</th>
                    <th style={{ width: '13%', textAlign: 'center' }}>Additional</th>
                    <th style={{ width: '13%', textAlign: 'center' }}>Ending</th>
                    <th style={{ width: '8%', textAlign: 'center' }}>Status</th>
                    <th style={{ width: '10%' }}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {catItems.map(item => {
                    const log = logs[item.id]
                    const status = getStockStatus(log?.ending_stock ?? null, item.min_stock_level)
                    const isSaving = saving[item.id]

                    const rowBg = status === 'out'
                      ? 'rgba(220,53,69,0.06)'
                      : status === 'low'
                        ? 'rgba(230,126,34,0.06)'
                        : undefined

                    return (
                      <tr key={item.id} style={{ background: rowBg }}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {isSaving && (
                              <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', animation: 'pulse 1s infinite' }}>💾</span>
                            )}
                            <span style={{ fontWeight: 500, fontSize: '0.85rem' }}>{item.name}</span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>
                          {item.unit || '—'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            placeholder="—"
                            defaultValue={log?.starting_stock ?? ''}
                            onBlur={e => saveField(item, 'starting_stock', e.target.value)}
                            style={inputStyle}
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            placeholder="0"
                            defaultValue={log?.additional_stock ?? ''}
                            onBlur={e => saveField(item, 'additional_stock', e.target.value)}
                            style={inputStyle}
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            placeholder="—"
                            defaultValue={log?.ending_stock ?? ''}
                            onBlur={e => saveField(item, 'ending_stock', e.target.value)}
                            style={{
                              ...inputStyle,
                              ...(status === 'out' ? {
                                borderColor: 'rgba(220,53,69,0.5)',
                                background: 'rgba(220,53,69,0.08)'
                              } : status === 'low' ? {
                                borderColor: 'rgba(230,126,34,0.5)',
                                background: 'rgba(230,126,34,0.08)'
                              } : {})
                            }}
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {status === 'unset' && <span style={{ color: 'var(--color-text-muted)', fontSize: '0.72rem' }}>—</span>}
                          {status === 'ok'    && <span style={{ color: '#27ae60', fontSize: '0.72rem', fontWeight: 700 }}>✅ OK</span>}
                          {status === 'low'   && <span style={{ color: '#e67e22', fontSize: '0.72rem', fontWeight: 700 }}>⚠️ Low</span>}
                          {status === 'out'   && <span style={{ color: '#dc3545', fontSize: '0.72rem', fontWeight: 700 }}>🔴 Out</span>}
                        </td>
                        <td>
                          <input
                            type="text"
                            placeholder="Note…"
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
        marginTop: '1rem',
        display: 'flex', gap: '1.5rem', flexWrap: 'wrap',
        fontSize: '0.78rem', color: 'var(--color-text-muted)',
      }}>
        <span>✅ <strong>OK</strong> — above minimum level</span>
        <span>⚠️ <strong>Low</strong> — at or below minimum</span>
        <span>🔴 <strong>Out</strong> — zero stock</span>
        <span>💾 auto-saves on field blur</span>
      </div>
    </div>
  )
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
