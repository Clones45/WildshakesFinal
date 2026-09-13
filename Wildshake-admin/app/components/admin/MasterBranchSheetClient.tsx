'use client'

import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import SalesDatePicker from '@/components/franchiser/SalesDatePicker'
import { SHEET_TYPES, SHEET_LABELS, isRecipeSheet, getStockStatus, computeEnding, type SheetType } from '@/lib/inventory/sheets'
import {
  saveDailyLog, copyPreviousDay, setBranchAvailability,
  type ItemRow, type CategoryRow, type LinkRow, type LogRow, type AvailabilityRow,
} from '@/lib/actions/masterInventory'

interface Product { id: string; name: string; category: string; is_available: boolean }
interface Branch { id: string; name: string; franchise: string | null }

interface Props {
  branches: Branch[]
  branchId: string
  branchName: string
  day: string
  today: string
  categories: CategoryRow[]
  items: ItemRow[]
  logs: LogRow[]
  links: LinkRow[]
  products: Product[]
  overrides: AvailabilityRow[]
}

const inputStyle: React.CSSProperties = {
  width: '72px', padding: '0.3rem 0.4rem',
  background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
  color: 'var(--color-text)', fontSize: '0.82rem', textAlign: 'center', outline: 'none',
}
const dayTitle = (ymd: string) =>
  new Date(`${ymd}T00:00:00+08:00`).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

export default function MasterBranchSheetClient({
  branches, branchId, branchName, day, today, categories, items, links, products, overrides: initialOverrides, logs: initialLogs,
}: Props) {
  const router = useRouter()
  const [logs, setLogs] = useState<Record<string, LogRow>>(() => Object.fromEntries(initialLogs.map(l => [l.inventory_item_id, l])))
  const [overrides, setOverrides] = useState<Record<string, AvailabilityRow>>(() => Object.fromEntries(initialOverrides.map(o => [o.product_id, o])))
  const [sheet, setSheet] = useState<SheetType>('food')
  const [section, setSection] = useState<'sheet' | 'menu'>('sheet')
  const [search, setSearch] = useState('')
  const [showOnlyLow, setShowOnlyLow] = useState(false)
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null)
  const [historyHint, setHistoryHint] = useState(false)
  const [usedDraft, setUsedDraft] = useState<Record<string, string>>({})
  const [reasonFor, setReasonFor] = useState<{ item: ItemRow; value: string } | null>(null)
  const [reason, setReason] = useState('')

  const productById = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products])
  const linksByItem = useMemo(() => {
    const m: Record<string, LinkRow[]> = {}
    for (const l of links) (m[l.inventory_item_id] ??= []).push(l)
    return m
  }, [links])

  function say(text: string, bad = false) {
    setToast({ text, bad })
    setTimeout(() => setToast(null), bad ? 5000 : 2800)
  }
  async function run<T extends { error?: string; historyRecorded?: boolean }>(key: string, work: () => Promise<T>, onOk: (r: T) => void, okText?: string) {
    setBusy(b => ({ ...b, [key]: true }))
    try {
      const r = await work()
      if ('error' in r && r.error) { say(r.error, true); return false }
      if (r.historyRecorded === false) setHistoryHint(true)
      onOk(r)
      if (okText) say(okText)
      return true
    } catch (e) {
      say(e instanceof Error ? e.message : 'Something went wrong.', true)
      return false
    } finally {
      setBusy(b => ({ ...b, [key]: false }))
    }
  }

  const go = (b: string, d: string) => router.push(`/inventory/branches?branch=${b}&day=${d}`)

  const ending = (item: ItemRow) => {
    const l = logs[item.id]
    return computeEnding(l?.starting_stock ?? null, l?.additional_stock ?? null, l?.used_stock ?? null)
  }

  function saveField(item: ItemRow, field: 'starting_stock' | 'additional_stock' | 'notes', raw: string) {
    const current = logs[item.id]
    const currentVal = current ? current[field] : null
    const value = field === 'notes' ? raw : (raw === '' ? null : Number(raw))
    if ((currentVal ?? (field === 'notes' ? '' : null)) === value) return
    return run(item.id, () => saveDailyLog({ branch_id: branchId, inventory_item_id: item.id, log_date: day, field, value }), r => {
      if ('log' in r && r.log) setLogs(m => ({ ...m, [item.id]: r.log }))
    })
  }

  async function confirmUsed() {
    if (!reasonFor) return
    const { item, value } = reasonFor
    const ok = await run(item.id, () => saveDailyLog({
      branch_id: branchId, inventory_item_id: item.id, log_date: day, field: 'used_stock', value: value === '' ? null : Number(value), reason,
    }), r => { if ('log' in r && r.log) setLogs(m => ({ ...m, [item.id]: r.log })) }, 'Used updated.')
    if (ok) {
      setUsedDraft(d => { const n = { ...d }; delete n[item.id]; return n })
      setReasonFor(null); setReason('')
    }
  }
  function cancelUsed() {
    if (reasonFor) setUsedDraft(d => { const n = { ...d }; delete n[reasonFor.item.id]; return n })
    setReasonFor(null); setReason('')
  }

  const copyPrevious = () => run('copy', () => copyPreviousDay({ branch_id: branchId, log_date: day }), r => {
    if ('logs' in r && r.logs) {
      setLogs(m => { const n = { ...m }; for (const l of r.logs as LogRow[]) n[l.inventory_item_id] = l; return n })
      say(r.copied ? `Copied ${r.from} ending into Starting for ${r.copied} item(s).` : `Nothing to copy: every item already has a Starting count.`)
    }
  })

  const setAvail = (p: Product, is_available: boolean, stock_qty: number | null) =>
    run(`av-${p.id}`, () => setBranchAvailability({ branch_id: branchId, product_id: p.id, is_available, stock_qty }), r => {
      if ('row' in r && r.row) {
        const row = r.row as AvailabilityRow
        setOverrides(m => {
          const n = { ...m }
          if (row.is_available && row.stock_qty === null) delete n[p.id]; else n[p.id] = row
          return n
        })
      }
    })

  /* ── Stats ─────────────────────────────────────────────────── */
  const filled = items.filter(i => logs[i.id]?.starting_stock !== null && logs[i.id]?.starting_stock !== undefined).length
  const lowCount = items.filter(i => getStockStatus(ending(i), i.min_stock_level) === 'low').length
  const outCount = items.filter(i => getStockStatus(ending(i), i.min_stock_level) === 'out').length
  const info = SHEET_LABELS[sheet]
  const recipeSheet = isRecipeSheet(sheet)
  const sheetCategories = categories.filter(c => c.sheet_type === sheet)
  const isPast = day < today

  return (
    <div>
      {toast && (
        <div style={{
          position: 'fixed', top: '1.25rem', right: '1.25rem', zIndex: 9999,
          background: toast.bad ? 'rgba(192,57,43,0.95)' : 'var(--color-surface-2)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)', padding: '0.75rem 1.25rem', boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
          color: toast.bad ? '#fff' : 'var(--color-text)', fontSize: '0.85rem', fontWeight: 600, maxWidth: '420px',
        }}>{toast.text}</div>
      )}

      <div className="page-header">
        <div>
          <h1>Branch Sheet</h1>
          <p className="page-header-subtitle">{branchName} — {dayTitle(day)}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="form-select" value={branchId} onChange={e => go(e.target.value, day)} style={{ minWidth: '180px' }}>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}{b.franchise ? ` · ${b.franchise}` : ''}</option>)}
          </select>
          <SalesDatePicker
            month={day.slice(0, 7)}
            day={day}
            today={today}
            onPick={(m, d) => go(branchId, d || (m === today.slice(0, 7) ? today : `${m}-01`))}
          />
          <button className="btn btn-ghost btn-sm" disabled={!!busy.copy} onClick={copyPrevious}>📋 Copy previous day&apos;s ending</button>
          <a href="/inventory" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>⚙️ Setup</a>
        </div>
      </div>

      {isPast && (
        <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
          You are viewing a past day. Anything you change here alters that day&apos;s counts only; today&apos;s sheet is untouched.
        </div>
      )}
      {historyHint && (
        <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
          Saved, but the change history is not switched on yet. Run <code>add_inventory_history_migration.sql</code> once in the Supabase SQL editor.
        </div>
      )}

      <div className="stat-grid" style={{ marginBottom: '1.25rem' }}>
        <div className="stat-card"><div className="stat-card-icon green">✅</div><p className="stat-card-label">Items counted</p><p className="stat-card-value">{filled}</p><p className="stat-card-trend neutral">of {items.length} shown at this branch</p></div>
        <div className="stat-card"><div className="stat-card-icon" style={{ background: 'rgba(230,126,34,0.15)', color: '#e67e22' }}>⚠️</div><p className="stat-card-label">Low stock</p><p className="stat-card-value" style={{ color: lowCount ? '#e67e22' : undefined }}>{lowCount}</p><p className={`stat-card-trend ${lowCount ? 'down' : 'up'}`}>{lowCount ? 'Needs reorder' : 'All good'}</p></div>
        <div className="stat-card"><div className="stat-card-icon red">🔴</div><p className="stat-card-label">Out of stock</p><p className="stat-card-value" style={{ color: outCount ? 'var(--color-danger-light)' : undefined }}>{outCount}</p><p className={`stat-card-trend ${outCount ? 'down' : 'up'}`}>{outCount ? 'Linked menu items hidden' : 'None depleted'}</p></div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button className={`btn btn-sm ${section === 'sheet' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSection('sheet')}>📦 Daily counts</button>
        <button className={`btn btn-sm ${section === 'menu' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSection('menu')}>🍹 Menu availability &amp; limits</button>
      </div>

      {section === 'sheet' && (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            {SHEET_TYPES.map(s => {
              const li = SHEET_LABELS[s]; const on = s === sheet
              return (
                <button key={s} onClick={() => setSheet(s)} style={{
                  padding: '0.45rem 1rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: '0.84rem',
                  border: on ? `2px solid ${li.color}` : '2px solid var(--color-border)', background: on ? `${li.color}22` : 'var(--color-surface)',
                  color: on ? li.color : 'var(--color-text-muted)', fontWeight: on ? 700 : 500,
                }}>{li.icon} {li.label}</button>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', padding: '0.7rem 1rem', marginBottom: '1rem', background: `${info.color}0f`, borderLeft: `3px solid ${info.color}`, borderRadius: '0 var(--radius-sm) var(--radius-sm) 0', fontSize: '0.82rem', color: 'var(--color-text-muted)', lineHeight: 1.45 }}>
            <span style={{ fontSize: '1.05rem' }}>{info.icon}</span>
            <span><strong style={{ color: info.color }}>{info.label}</strong> — {info.desc}</span>
          </div>

          <div className="table-wrapper">
            <div className="table-header" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
              <p className="table-title">{info.icon} {info.label} — {branchName}</p>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="table-search">🔍<input type="text" placeholder="Search items…" value={search} onChange={e => setSearch(e.target.value)} /></div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={showOnlyLow} onChange={e => setShowOnlyLow(e.target.checked)} style={{ accentColor: '#e67e22' }} /> Low/Out only
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '1rem', padding: '0.5rem 1rem', flexWrap: 'wrap', fontSize: '0.74rem', color: 'var(--color-text-muted)', background: 'var(--color-surface-2)' }}>
              <span>💾 Starting, Additional and Notes save when you leave the box</span>
              {recipeSheet && <span style={{ color: '#2980b9' }}>🔵 <strong>Used</strong> is counted from sales; changing it asks for a reason</span>}
              <span style={{ color: '#16a085' }}>🟢 <strong>Ending</strong> = Starting + Additional − Used</span>
            </div>

            {sheetCategories.map(cat => {
              const rows = items.filter(i => i.category_id === cat.id
                && (!search || i.name.toLowerCase().includes(search.toLowerCase()))
                && (!showOnlyLow || ['low', 'out'].includes(getStockStatus(ending(i), i.min_stock_level))))
              if (rows.length === 0) return null
              return (
                <div key={cat.id} style={{ marginBottom: '2rem' }}>
                  <div style={{ padding: '0.5rem 1rem', background: `${info.color}11`, borderLeft: `3px solid ${info.color}`, fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: info.color }}>{cat.name}</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: recipeSheet ? '20%' : '32%' }}>Item</th>
                          {recipeSheet && <th style={{ width: '20%' }}>Recipe</th>}
                          <th style={{ width: '7%', textAlign: 'center' }}>Unit</th>
                          <th style={{ width: '9%', textAlign: 'center' }}>Starting</th>
                          <th style={{ width: '9%', textAlign: 'center' }}>Additional</th>
                          {recipeSheet && <th style={{ width: '9%', textAlign: 'center', color: '#2980b9' }}>Used</th>}
                          <th style={{ width: '9%', textAlign: 'center', color: '#16a085' }}>Ending</th>
                          <th style={{ width: '7%', textAlign: 'center' }}>Status</th>
                          <th style={{ width: '12%' }}>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(item => {
                          const log = logs[item.id]
                          const end = ending(item)
                          const status = getStockStatus(end, item.min_stock_level)
                          const itemLinks = linksByItem[item.id] ?? []
                          const rowBg = status === 'out' ? 'rgba(220,53,69,0.06)' : status === 'low' ? 'rgba(230,126,34,0.06)' : undefined
                          const usedValue = usedDraft[item.id] ?? (log?.used_stock ?? '')
                          return (
                            <tr key={item.id} style={{ background: rowBg }}>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  {busy[item.id] && <span style={{ fontSize: '0.65rem' }}>💾</span>}
                                  <span style={{ fontWeight: 500, fontSize: '0.85rem' }}>{item.name}</span>
                                </div>
                              </td>
                              {recipeSheet && (
                                <td>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                                    {itemLinks.length === 0 ? <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>Not in any recipe</span> : itemLinks.map(l => (
                                      <span key={l.id} title={productById[l.product_id]?.name} style={{ fontSize: '0.66rem', fontWeight: 600, background: 'rgba(22,160,133,0.12)', color: '#16a085', padding: '2px 6px', borderRadius: '999px', border: '1px solid rgba(22,160,133,0.3)', whiteSpace: 'nowrap' }}>
                                        {productById[l.product_id]?.name ?? '?'}{l.quantity_per_serving !== null ? ` · ${l.quantity_per_serving}${item.unit ? ` ${item.unit}` : ''}` : ' · no amount'}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                              )}
                              <td style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>{item.unit || '—'}</td>
                              <td style={{ textAlign: 'center' }}>
                                <input key={`s-${item.id}-${log?.starting_stock ?? 'x'}`} type="number" min="0" step="0.5" placeholder="—" defaultValue={log?.starting_stock ?? ''} style={inputStyle}
                                  onBlur={e => saveField(item, 'starting_stock', e.target.value)} />
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <input key={`a-${item.id}-${log?.additional_stock ?? 'x'}`} type="number" min="0" step="0.5" placeholder="0" defaultValue={log?.additional_stock ?? ''} style={inputStyle}
                                  onBlur={e => saveField(item, 'additional_stock', e.target.value)} />
                              </td>
                              {recipeSheet && (
                                <td style={{ textAlign: 'center' }}>
                                  <input type="number" min="0" step="0.01" placeholder="0" value={usedValue} style={{ ...inputStyle, color: '#2980b9', fontWeight: 700 }}
                                    onChange={e => setUsedDraft(d => ({ ...d, [item.id]: e.target.value }))}
                                    onBlur={e => {
                                      const v = e.target.value
                                      const cur = log?.used_stock ?? null
                                      const same = (v === '' && cur === null) || (v !== '' && Number(v) === cur)
                                      if (same) { setUsedDraft(d => { const n = { ...d }; delete n[item.id]; return n }); return }
                                      setReasonFor({ item, value: v }); setReason('')
                                    }} />
                                </td>
                              )}
                              <td style={{ textAlign: 'center' }}>
                                <span style={{
                                  display: 'inline-block', minWidth: '52px', padding: '0.3rem 0.5rem', borderRadius: 'var(--radius-sm)', fontWeight: 700, fontSize: '0.88rem',
                                  background: end === null ? 'transparent' : status === 'out' ? 'rgba(220,53,69,0.12)' : status === 'low' ? 'rgba(230,126,34,0.12)' : 'rgba(22,160,133,0.12)',
                                  color: end === null ? 'var(--color-text-muted)' : status === 'out' ? '#dc3545' : status === 'low' ? '#e67e22' : '#16a085',
                                  border: end !== null ? '1px solid rgba(22,160,133,0.25)' : 'none',
                                }} title={end !== null ? `${log?.starting_stock ?? 0} + ${log?.additional_stock ?? 0} − ${log?.used_stock ?? 0}` : 'Enter a starting count to get an ending'}>
                                  {end === null ? '—' : end}
                                </span>
                              </td>
                              <td style={{ textAlign: 'center', fontSize: '0.72rem', fontWeight: 700 }}>
                                {status === 'unset' && <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
                                {status === 'ok' && <span style={{ color: '#27ae60' }}>✅ OK</span>}
                                {status === 'low' && <span style={{ color: '#e67e22' }}>⚠️ Low</span>}
                                {status === 'out' && <span style={{ color: '#dc3545' }}>🔴 Out</span>}
                              </td>
                              <td>
                                <input key={`n-${item.id}-${log?.notes ?? ''}`} type="text" placeholder="Note…" defaultValue={log?.notes ?? ''} style={{ ...inputStyle, width: '100%', textAlign: 'left' }}
                                  onBlur={e => saveField(item, 'notes', e.target.value)} />
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
            {items.length === 0 && (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                No items are shown at this branch yet. Tag items to it on the Setup page.
              </div>
            )}
          </div>
        </>
      )}

      {section === 'menu' && (
        <div className="table-wrapper">
          <div className="table-header" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
            <p className="table-title">🍹 Menu availability &amp; daily limits — {branchName}</p>
            <div className="table-search">🔍<input type="text" placeholder="Search menu…" value={search} onChange={e => setSearch(e.target.value)} /></div>
          </div>
          <div style={{ padding: '0.5rem 1rem', fontSize: '0.74rem', color: 'var(--color-text-muted)', background: 'var(--color-surface-2)' }}>
            Sold out hides the item on this branch&apos;s till. A daily limit counts down with each sale and hides the item at zero; blank means no limit. The till picks up changes within about half a minute.
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Menu item</th><th style={{ width: '18%' }}>Category</th><th style={{ width: '16%', textAlign: 'center' }}>At this branch</th><th style={{ width: '16%', textAlign: 'center' }}>Daily limit</th><th style={{ width: '12%' }}></th></tr></thead>
              <tbody>
                {products.filter(p => p.is_available && (!search || p.name.toLowerCase().includes(search.toLowerCase()))).map(p => {
                  const o = overrides[p.id]
                  const available = o ? o.is_available : true
                  const limit = o?.stock_qty ?? null
                  const b = !!busy[`av-${p.id}`]
                  return (
                    <tr key={p.id} style={{ opacity: available ? 1 : 0.6 }}>
                      <td style={{ fontWeight: 500, fontSize: '0.85rem' }}>{p.name}</td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{p.category}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button className={`btn btn-sm ${available ? 'btn-ghost' : 'btn-danger'}`} disabled={b} onClick={() => setAvail(p, !available, limit)}>
                          {available ? '✅ Available' : '🔴 Sold out'}
                        </button>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input key={`l-${p.id}-${limit ?? 'x'}`} type="number" min="0" step="1" placeholder="none" defaultValue={limit ?? ''} style={inputStyle} disabled={b}
                          onBlur={e => { const v = e.target.value === '' ? null : Math.floor(Number(e.target.value)); if (v !== limit) setAvail(p, available, v) }} />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {o && <button className="btn btn-ghost btn-sm" disabled={b} onClick={() => setAvail(p, true, null)}>Reset</button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {reasonFor && (
        <div className="modal-overlay" onClick={cancelUsed}>
          <div className="modal" style={{ maxWidth: '460px', width: '95%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3 className="modal-title">Change Used for {reasonFor.item.name}</h3><button className="modal-close" onClick={cancelUsed}>×</button></div>
            <div className="modal-body">
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
                Used is normally counted from sales. You are setting it to <strong style={{ color: 'var(--color-text)' }}>{reasonFor.value === '' ? 'blank' : reasonFor.value}</strong> (was {logs[reasonFor.item.id]?.used_stock ?? 'blank'}). Say why, so the history explains it.
              </p>
              <textarea className="form-textarea" autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. spoiled batch thrown out, recount after stocktake…" style={{ minHeight: '80px' }} />
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost btn-sm" onClick={cancelUsed}>Cancel</button>
              <button className="btn btn-primary btn-sm" disabled={!reason.trim() || !!busy[reasonFor.item.id]} onClick={confirmUsed}>Save with reason</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
