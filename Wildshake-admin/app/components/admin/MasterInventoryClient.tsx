'use client'

import React, { useMemo, useState } from 'react'
import { SHEET_TYPES, SHEET_LABELS, isRecipeSheet, type SheetType } from '@/lib/inventory/sheets'
import {
  createItem, updateItem, setItemActive, deleteItem, moveItem, setItemBranches,
  createCategory, renameCategory, moveCategory, deleteCategory,
  setRecipeLink, removeRecipeLink,
  type ItemRow, type CategoryRow, type LinkRow,
} from '@/lib/actions/masterInventory'

/* ─── Types ─────────────────────────────────────────────────────── */
export interface HistoryRow {
  id: string
  created_at: string
  actor_email: string | null
  area: string
  action: string
  summary: string
  branch_id: string | null
}
interface Product { id: string; name: string; category: string; is_available: boolean }
interface Branch { id: string; name: string; franchise: string | null }

interface Props {
  categories: CategoryRow[]
  items: ItemRow[]
  tags: { inventory_item_id: string; entity_id: string }[]
  links: LinkRow[]
  products: Product[]
  branches: Branch[]
  logCounts: Record<string, number>
  /** null = the inventory_history table does not exist yet. */
  history: HistoryRow[] | null
}

type Tab = 'items' | 'recipes' | 'categories' | 'history'

/* ─── Styles ─────────────────────────────────────────────────────── */
const cell: React.CSSProperties = {
  padding: '0.3rem 0.45rem',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--color-text)',
  fontSize: '0.82rem',
  outline: 'none',
}
const numCell: React.CSSProperties = { ...cell, width: '70px', textAlign: 'center' }
const chip = (on: boolean, color = '#16a085'): React.CSSProperties => ({
  fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', cursor: 'pointer',
  border: `1px solid ${on ? color : 'var(--color-border)'}`,
  background: on ? `${color}22` : 'transparent',
  color: on ? color : 'var(--color-text-muted)',
  whiteSpace: 'nowrap', userSelect: 'none',
})
const smallBtn: React.CSSProperties = {
  fontSize: '0.72rem', padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', cursor: 'pointer',
}
const dangerBtn: React.CSSProperties = { ...smallBtn, color: 'var(--color-danger-light)', borderColor: 'rgba(192,57,43,0.4)' }
const manilaWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })

const AREA_LABEL: Record<string, string> = {
  item: 'Item', category: 'Category', tags: 'Branches', recipe: 'Recipe', daily_log: 'Daily count', availability: 'Menu availability', import: 'Import',
}

/* ─── Component ─────────────────────────────────────────────────── */
export default function MasterInventoryClient(props: Props) {
  const { products, branches, logCounts, history } = props

  const [categories, setCategories] = useState<CategoryRow[]>(props.categories)
  const [items, setItems] = useState<ItemRow[]>(props.items)
  const [links, setLinks] = useState<LinkRow[]>(props.links)
  const [itemBranches, setBranchMap] = useState<Record<string, string[]>>(() => {
    const m: Record<string, string[]> = {}
    for (const t of props.tags) (m[t.inventory_item_id] ??= []).push(t.entity_id)
    return m
  })

  const [tab, setTab] = useState<Tab>('items')
  const [sheet, setSheet] = useState<SheetType>('food')
  const [search, setSearch] = useState('')
  const [showRetired, setShowRetired] = useState(false)
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null)
  const [recipeFor, setRecipeFor] = useState<string | null>(null)
  const [newItemOpen, setNewItemOpen] = useState(false)
  const [historyHint, setHistoryHint] = useState(false)
  const [recipeProduct, setRecipeProduct] = useState<string>('')
  const [productSearch, setProductSearch] = useState('')

  const productById = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products])
  const itemById = useMemo(() => Object.fromEntries(items.map(i => [i.id, i])), [items])
  const catById = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories])
  const linksByItem = useMemo(() => {
    const m: Record<string, LinkRow[]> = {}
    for (const l of links) (m[l.inventory_item_id] ??= []).push(l)
    return m
  }, [links])
  const linksByProduct = useMemo(() => {
    const m: Record<string, LinkRow[]> = {}
    for (const l of links) (m[l.product_id] ??= []).push(l)
    return m
  }, [links])

  function say(text: string, bad = false) {
    setToast({ text, bad })
    setTimeout(() => setToast(null), bad ? 5000 : 2800)
  }
  function noteHistory(recorded: boolean) {
    if (!recorded && !historyHint) setHistoryHint(true)
  }
  async function run<T extends { error?: string; ok?: true; historyRecorded?: boolean }>(key: string, work: () => Promise<T>, onOk: (r: T) => void, okText?: string) {
    setBusy(b => ({ ...b, [key]: true }))
    try {
      const r = await work()
      if ('error' in r && r.error) { say(r.error, true); return }
      if (r.historyRecorded === false) noteHistory(false)
      onOk(r)
      if (okText) say(okText)
    } catch (e) {
      say(e instanceof Error ? e.message : 'Something went wrong.', true)
    } finally {
      setBusy(b => ({ ...b, [key]: false }))
    }
  }

  /* ── Items ─────────────────────────────────────────────────── */
  const sheetCategories = categories.filter(c => c.sheet_type === sheet)
  const visibleItems = (catId: string) =>
    items.filter(i => i.category_id === catId
      && (showRetired || i.is_active)
      && (!search || i.name.toLowerCase().includes(search.toLowerCase())))

  const saveItemField = (item: ItemRow, patch: Parameters<typeof updateItem>[1]) =>
    run(item.id, () => updateItem(item.id, patch), r => {
      if ('item' in r && r.item) setItems(list => list.map(i => (i.id === item.id ? r.item : i)))
    })

  const toggleBranch = (item: ItemRow, branchId: string) => {
    const current = itemBranches[item.id] ?? []
    const next = current.includes(branchId) ? current.filter(b => b !== branchId) : [...current, branchId]
    setBranchMap(m => ({ ...m, [item.id]: next }))
    run(`tags-${item.id}`, () => setItemBranches(item.id, next), r => {
      if ('branch_ids' in r && r.branch_ids) setBranchMap(m => ({ ...m, [item.id]: r.branch_ids as string[] }))
    })
  }

  const reorderItems = (order: string[]) =>
    setItems(list => list.map(i => (order.includes(i.id) ? { ...i, sort_order: order.indexOf(i.id) + 1 } : i))
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)))

  /* ── Render helpers ───────────────────────────────────────── */
  const info = SHEET_LABELS[sheet]
  const retiredCount = items.filter(i => !i.is_active).length

  return (
    <div>
      {toast && (
        <div style={{
          position: 'fixed', top: '1.25rem', right: '1.25rem', zIndex: 9999,
          background: toast.bad ? 'rgba(192,57,43,0.95)' : 'var(--color-surface-2)',
          border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
          padding: '0.75rem 1.25rem', boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
          color: toast.bad ? '#fff' : 'var(--color-text)', fontSize: '0.85rem', fontWeight: 600, maxWidth: '420px',
        }}>
          {toast.text}
        </div>
      )}

      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Inventory Setup</h1>
          <p className="page-header-subtitle">
            Items, categories, branch visibility and recipes for every branch. One recipe serves all branches.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <a href="/inventory/branches" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>🏪 Branch sheets</a>
          <a href="/inventory/import" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>📥 Import recipes</a>
          <button className="btn btn-primary btn-sm" onClick={() => setNewItemOpen(true)}>＋ New item</button>
        </div>
      </div>

      {historyHint && (
        <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
          Saved, but the change history is not switched on yet. Run <code>add_inventory_history_migration.sql</code> in the Supabase SQL editor once and every change will be recorded from then on.
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {([['items', '📦 Items'], ['recipes', '🍳 Recipes by menu item'], ['categories', '🗂️ Categories'], ['history', '🕘 History']] as [Tab, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`btn btn-sm ${tab === key ? 'btn-primary' : 'btn-ghost'}`}>{label}</button>
        ))}
      </div>

      {/* ── ITEMS ───────────────────────────────────────────────── */}
      {tab === 'items' && (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            {SHEET_TYPES.map(s => {
              const li = SHEET_LABELS[s]
              const on = s === sheet
              return (
                <button key={s} onClick={() => setSheet(s)} style={{
                  padding: '0.45rem 1rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: '0.84rem',
                  border: on ? `2px solid ${li.color}` : '2px solid var(--color-border)',
                  background: on ? `${li.color}22` : 'var(--color-surface)',
                  color: on ? li.color : 'var(--color-text-muted)', fontWeight: on ? 700 : 500,
                }}>
                  {li.icon} {li.label}
                </button>
              )
            })}
          </div>
          <div style={{
            display: 'flex', gap: '0.6rem', alignItems: 'flex-start', padding: '0.7rem 1rem', marginBottom: '1rem',
            background: `${info.color}0f`, borderLeft: `3px solid ${info.color}`, borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
            fontSize: '0.82rem', color: 'var(--color-text-muted)', lineHeight: 1.45,
          }}>
            <span style={{ fontSize: '1.05rem' }}>{info.icon}</span>
            <span><strong style={{ color: info.color }}>{info.label}</strong> — {info.desc}</span>
          </div>

          <div className="table-wrapper">
            <div className="table-header" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
              <p className="table-title">{info.icon} {info.label}</p>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="table-search">🔍<input type="text" placeholder="Search items…" value={search} onChange={e => setSearch(e.target.value)} /></div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={showRetired} onChange={e => setShowRetired(e.target.checked)} /> Show retired ({retiredCount})
                </label>
              </div>
            </div>
            <div style={{ padding: '0.5rem 1rem', fontSize: '0.74rem', color: 'var(--color-text-muted)', background: 'var(--color-surface-2)', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <span>✏️ Name, unit and minimum save when you leave the box</span>
              <span>🏪 Click a branch to show or hide the item there</span>
              {isRecipeSheet(sheet) && <span>🍳 Recipe = which menu items use it and how much per serving</span>}
            </div>

            {sheetCategories.map(cat => {
              const rows = visibleItems(cat.id)
              if (rows.length === 0 && search) return null
              return (
                <div key={cat.id} style={{ marginBottom: '1.5rem' }}>
                  <div style={{
                    padding: '0.5rem 1rem', background: `${info.color}11`, borderLeft: `3px solid ${info.color}`,
                    fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: info.color,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span>{cat.name}</span>
                    <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-muted)' }}>{rows.length} item{rows.length === 1 ? '' : 's'}</span>
                  </div>
                  {rows.length === 0 ? (
                    <div style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>No items here yet.</div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table>
                        <thead>
                          <tr>
                            <th style={{ width: '24%' }}>Item</th>
                            <th style={{ width: '8%' }}>Unit</th>
                            <th style={{ width: '8%', textAlign: 'center' }}>Minimum</th>
                            <th style={{ width: '18%' }}>Branches</th>
                            {isRecipeSheet(sheet) && <th style={{ width: '14%' }}>Recipe</th>}
                            <th style={{ width: '14%' }}>Category</th>
                            <th style={{ width: '14%', textAlign: 'right' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((item, idx) => {
                            const mine = itemBranches[item.id] ?? []
                            const itemLinks = linksByItem[item.id] ?? []
                            const canDelete = (logCounts[item.id] ?? 0) === 0 && itemLinks.length === 0
                            const isBusy = !!busy[item.id]
                            return (
                              <tr key={item.id} style={{ opacity: item.is_active ? 1 : 0.55 }}>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <input type="text" defaultValue={item.name} style={{ ...cell, width: '100%' }} disabled={isBusy}
                                      onBlur={e => { if (e.target.value.trim() !== item.name) saveItemField(item, { name: e.target.value }) }} />
                                    {!item.is_active && <span className="badge badge-muted" style={{ whiteSpace: 'nowrap' }}>Retired</span>}
                                  </div>
                                </td>
                                <td>
                                  <input type="text" defaultValue={item.unit ?? ''} placeholder="pc, g, ml" style={{ ...cell, width: '64px' }} disabled={isBusy}
                                    onBlur={e => { if ((e.target.value.trim() || null) !== item.unit) saveItemField(item, { unit: e.target.value }) }} />
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <input type="number" min="0" step="0.5" defaultValue={item.min_stock_level ?? ''} style={numCell} disabled={isBusy}
                                    onBlur={e => {
                                      const v = e.target.value === '' ? null : Number(e.target.value)
                                      if (v !== item.min_stock_level) saveItemField(item, { min_stock_level: v })
                                    }} />
                                </td>
                                <td>
                                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                    {branches.map(b => (
                                      <span key={b.id} style={chip(mine.includes(b.id))} title={b.franchise ?? ''} onClick={() => !busy[`tags-${item.id}`] && toggleBranch(item, b.id)}>
                                        {mine.includes(b.id) ? '✓ ' : ''}{b.name}
                                      </span>
                                    ))}
                                    {branches.length === 0 && <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>No branches</span>}
                                  </div>
                                </td>
                                {isRecipeSheet(sheet) && (
                                  <td>
                                    <button style={{ ...smallBtn, color: itemLinks.length ? '#16a085' : 'var(--color-text-muted)' }} onClick={() => setRecipeFor(item.id)}>
                                      🍳 {itemLinks.length === 0 ? 'Not in any recipe' : `${itemLinks.length} menu item${itemLinks.length === 1 ? '' : 's'}`}
                                    </button>
                                  </td>
                                )}
                                <td>
                                  <select className="form-select" value={item.category_id} disabled={isBusy} style={{ fontSize: '0.78rem', padding: '0.3rem 0.4rem', width: '100%' }}
                                    onChange={e => saveItemField(item, { category_id: e.target.value })}>
                                    {SHEET_TYPES.map(s => (
                                      <optgroup key={s} label={SHEET_LABELS[s].label}>
                                        {categories.filter(c => c.sheet_type === s).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                      </optgroup>
                                    ))}
                                  </select>
                                </td>
                                <td>
                                  <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                    <button style={smallBtn} title="Move up" disabled={idx === 0 || isBusy}
                                      onClick={() => run(item.id, () => moveItem(item.id, 'up'), r => { if ('order' in r && r.order) reorderItems(r.order as string[]) })}>▲</button>
                                    <button style={smallBtn} title="Move down" disabled={idx === rows.length - 1 || isBusy}
                                      onClick={() => run(item.id, () => moveItem(item.id, 'down'), r => { if ('order' in r && r.order) reorderItems(r.order as string[]) })}>▼</button>
                                    {item.is_active ? (
                                      <button style={smallBtn} disabled={isBusy}
                                        onClick={() => { if (confirm(`Retire "${item.name}"? It disappears from every branch sheet but keeps its history. You can restore it later.`)) run(item.id, () => setItemActive(item.id, false), r => { if ('item' in r && r.item) setItems(l => l.map(i => (i.id === item.id ? r.item : i))) }, 'Retired.') }}>
                                        Retire
                                      </button>
                                    ) : (
                                      <button style={smallBtn} disabled={isBusy}
                                        onClick={() => run(item.id, () => setItemActive(item.id, true), r => { if ('item' in r && r.item) setItems(l => l.map(i => (i.id === item.id ? r.item : i))) }, 'Restored.')}>
                                        Restore
                                      </button>
                                    )}
                                    {canDelete && (
                                      <button style={dangerBtn} disabled={isBusy}
                                        onClick={() => { if (confirm(`Delete "${item.name}" permanently? It has no counts or recipes behind it, so nothing else is affected.`)) run(item.id, () => deleteItem(item.id), () => { setItems(l => l.filter(i => i.id !== item.id)) }, 'Deleted.') }}>
                                        Delete
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
            {sheetCategories.length === 0 && (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>This sheet has no categories yet. Add one on the Categories tab.</div>
            )}
          </div>
        </>
      )}

      {/* ── RECIPES BY MENU ITEM ───────────────────────────────── */}
      {tab === 'recipes' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(300px, 2fr)', gap: '1rem' }}>
          <div className="table-wrapper" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            <div className="table-header"><p className="table-title">Menu items</p></div>
            <div style={{ padding: '0.5rem 0.75rem' }}>
              <input type="text" placeholder="Search menu…" value={productSearch} onChange={e => setProductSearch(e.target.value)} style={{ ...cell, width: '100%' }} />
            </div>
            {products.filter(p => !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase())).map(p => {
              const n = (linksByProduct[p.id] ?? []).length
              const on = recipeProduct === p.id
              return (
                <div key={p.id} onClick={() => setRecipeProduct(p.id)} style={{
                  padding: '0.45rem 0.75rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: '0.5rem',
                  background: on ? 'rgba(22,160,133,0.12)' : 'transparent', borderLeft: on ? '3px solid #16a085' : '3px solid transparent', fontSize: '0.82rem',
                }}>
                  <span style={{ color: p.is_available ? 'var(--color-text)' : 'var(--color-text-muted)' }}>{p.name} <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>{p.category}</span></span>
                  <span style={{ fontSize: '0.7rem', color: n ? '#16a085' : 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{n} ingredient{n === 1 ? '' : 's'}</span>
                </div>
              )
            })}
          </div>
          <div className="table-wrapper">
            {!recipeProduct ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Pick a menu item on the left to see and edit its recipe.</div>
            ) : (
              <RecipeEditor
                title={`${productById[recipeProduct]?.name ?? 'Menu item'} — ingredients per serving`}
                rows={(linksByProduct[recipeProduct] ?? []).map(l => ({ link: l, label: itemById[l.inventory_item_id]?.name ?? 'Unknown item', unit: itemById[l.inventory_item_id]?.unit ?? null }))}
                options={items.filter(i => i.is_active && isRecipeSheet(catById[i.category_id]?.sheet_type ?? '') && !(linksByProduct[recipeProduct] ?? []).some(l => l.inventory_item_id === i.id))
                  .map(i => ({ id: i.id, label: `${i.name}${i.unit ? ` (${i.unit})` : ''}`, group: catById[i.category_id]?.name ?? '' }))}
                optionLabel="Add ingredient"
                side="item"
                busy={busy}
                onSet={(id, qty) => run(`link-${recipeProduct}-${id}`, () => setRecipeLink({ inventory_item_id: id, product_id: recipeProduct, quantity_per_serving: qty }), r => {
                  if ('link' in r && r.link) setLinks(l => [...l.filter(x => x.id !== r.link.id), r.link])
                }, 'Recipe saved.')}
                onRemove={link => run(`link-${link.id}`, () => removeRecipeLink(link.id), () => setLinks(l => l.filter(x => x.id !== link.id)), 'Removed from recipe.')}
              />
            )}
          </div>
        </div>
      )}

      {/* ── CATEGORIES ─────────────────────────────────────────── */}
      {tab === 'categories' && (
        <div className="table-wrapper">
          <div className="table-header"><p className="table-title">Categories by sheet</p></div>
          <div style={{ padding: '0.5rem 1rem', fontSize: '0.74rem', color: 'var(--color-text-muted)', background: 'var(--color-surface-2)' }}>
            The seven sheets are fixed. Categories inside them can be added, renamed and reordered; an empty category can be deleted.
          </div>
          {SHEET_TYPES.map(s => {
            const li = SHEET_LABELS[s]
            const cats = categories.filter(c => c.sheet_type === s)
            return (
              <div key={s} style={{ marginBottom: '1.25rem' }}>
                <div style={{ padding: '0.5rem 1rem', background: `${li.color}11`, borderLeft: `3px solid ${li.color}`, fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: li.color }}>
                  {li.icon} {li.label}
                </div>
                <div style={{ padding: '0.5rem 1rem' }}>
                  {cats.map((c, idx) => {
                    const count = items.filter(i => i.category_id === c.id).length
                    return (
                      <div key={c.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.3rem 0', flexWrap: 'wrap' }}>
                        <input type="text" defaultValue={c.name} style={{ ...cell, minWidth: '220px', flex: 1 }} disabled={!!busy[c.id]}
                          onBlur={e => { if (e.target.value.trim() !== c.name) run(c.id, () => renameCategory(c.id, e.target.value), r => { if ('category' in r && r.category) setCategories(l => l.map(x => (x.id === c.id ? r.category : x))) }, 'Renamed.') }} />
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', minWidth: '60px' }}>{count} item{count === 1 ? '' : 's'}</span>
                        <button style={smallBtn} disabled={idx === 0 || !!busy[c.id]} onClick={() => run(c.id, () => moveCategory(c.id, 'up'), r => { if ('order' in r && r.order) applyCategoryOrder(r.order as string[]) })}>▲</button>
                        <button style={smallBtn} disabled={idx === cats.length - 1 || !!busy[c.id]} onClick={() => run(c.id, () => moveCategory(c.id, 'down'), r => { if ('order' in r && r.order) applyCategoryOrder(r.order as string[]) })}>▼</button>
                        {count === 0 && (
                          <button style={dangerBtn} disabled={!!busy[c.id]} onClick={() => { if (confirm(`Delete the empty category "${c.name}"?`)) run(c.id, () => deleteCategory(c.id), () => setCategories(l => l.filter(x => x.id !== c.id)), 'Deleted.') }}>Delete</button>
                        )}
                      </div>
                    )
                  })}
                  <NewCategoryRow sheet={s} busy={!!busy[`newcat-${s}`]} onCreate={name => run(`newcat-${s}`, () => createCategory({ name, sheet_type: s }), r => { if ('category' in r && r.category) setCategories(l => [...l, r.category]) }, 'Category added.')} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── HISTORY ────────────────────────────────────────────── */}
      {tab === 'history' && (
        <div className="table-wrapper">
          <div className="table-header"><p className="table-title">Change history</p></div>
          {history === null ? (
            <div className="alert alert-warning" style={{ margin: '1rem' }}>
              History is not switched on yet. Run <code>add_inventory_history_migration.sql</code> (in the Wildshake-admin/app folder) once in the Supabase SQL editor. Changes made before that still saved; they just were not written down.
            </div>
          ) : history.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>No changes recorded yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr><th style={{ width: '14%' }}>When</th><th style={{ width: '20%' }}>Who</th><th style={{ width: '12%' }}>Area</th><th>What changed</th></tr></thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{manilaWhen(h.created_at)}</td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{h.actor_email ?? '—'}</td>
                      <td><span className="badge badge-muted">{AREA_LABEL[h.area] ?? h.area}</span></td>
                      <td style={{ fontSize: '0.82rem' }}>{h.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Recipe modal for one item ───────────────────────────── */}
      {recipeFor && itemById[recipeFor] && (
        <div className="modal-overlay" onClick={() => setRecipeFor(null)}>
          <div className="modal" style={{ maxWidth: '640px', width: '95%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">🍳 {itemById[recipeFor].name}{itemById[recipeFor].unit ? ` (${itemById[recipeFor].unit})` : ''}</h3>
              <button className="modal-close" onClick={() => setRecipeFor(null)}>×</button>
            </div>
            <div className="modal-body">
              <RecipeEditor
                title="Menu items that use this ingredient, and how much per serving"
                rows={(linksByItem[recipeFor] ?? []).map(l => ({ link: l, label: productById[l.product_id]?.name ?? 'Unknown menu item', unit: itemById[recipeFor]?.unit ?? null }))}
                options={products.filter(p => !(linksByItem[recipeFor] ?? []).some(l => l.product_id === p.id)).map(p => ({ id: p.id, label: p.name, group: p.category }))}
                optionLabel="Add menu item"
                side="product"
                busy={busy}
                onSet={(id, qty) => run(`link-${id}-${recipeFor}`, () => setRecipeLink({ inventory_item_id: recipeFor, product_id: id, quantity_per_serving: qty }), r => {
                  if ('link' in r && r.link) setLinks(l => [...l.filter(x => x.id !== r.link.id), r.link])
                }, 'Recipe saved.')}
                onRemove={link => run(`link-${link.id}`, () => removeRecipeLink(link.id), () => setLinks(l => l.filter(x => x.id !== link.id)), 'Removed from recipe.')}
              />
            </div>
            <div className="modal-footer"><button className="btn btn-ghost btn-sm" onClick={() => setRecipeFor(null)}>Done</button></div>
          </div>
        </div>
      )}

      {/* ── New item modal ──────────────────────────────────────── */}
      {newItemOpen && (
        <NewItemModal
          categories={categories}
          branches={branches}
          defaultSheet={sheet}
          busy={!!busy.newitem}
          onClose={() => setNewItemOpen(false)}
          onCreate={input => run('newitem', () => createItem(input), r => {
            if ('item' in r && r.item) {
              setItems(l => [...l, r.item])
              setBranchMap(m => ({ ...m, [r.item.id]: input.branch_ids }))
              setNewItemOpen(false)
              const s = catById[input.category_id]?.sheet_type
              if (s && s !== sheet) setSheet(s as SheetType)
            }
          }, 'Item created.')}
        />
      )}
    </div>
  )

  function applyCategoryOrder(order: string[]) {
    setCategories(list => list.map(c => (order.includes(c.id) ? { ...c, sort_order: order.indexOf(c.id) + 1 } : c))
      .sort((a, b) => a.sheet_type.localeCompare(b.sheet_type) || a.sort_order - b.sort_order || a.name.localeCompare(b.name)))
  }
}

/* ─── Recipe editor (shared by the item modal and the menu-item tab) ─── */
function RecipeEditor({ title, rows, options, optionLabel, side, busy, onSet, onRemove }: {
  title: string
  rows: { link: LinkRow; label: string; unit: string | null }[]
  options: { id: string; label: string; group: string }[]
  optionLabel: string
  /** Which side of a link the caller wants back from onSet: the menu item or the ingredient. */
  side: 'product' | 'item'
  busy: Record<string, boolean>
  onSet: (otherId: string, qty: number) => void
  onRemove: (link: LinkRow) => void
}) {
  const [addId, setAddId] = useState('')
  const [addQty, setAddQty] = useState('')
  const groups = [...new Set(options.map(o => o.group))]
  return (
    <div>
      <div className="table-header"><p className="table-title" style={{ fontSize: '0.85rem' }}>{title}</p></div>
      {rows.length === 0 ? (
        <div style={{ padding: '1rem', fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>Nothing linked yet. Add one below.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Name</th><th style={{ width: '160px', textAlign: 'center' }}>Per serving</th><th style={{ width: '90px' }}></th></tr></thead>
            <tbody>
              {rows.map(({ link, label, unit }) => (
                <tr key={link.id}>
                  <td style={{ fontSize: '0.84rem' }}>{label}</td>
                  <td style={{ textAlign: 'center' }}>
                    <input type="number" min="0" step="0.01" defaultValue={link.quantity_per_serving ?? ''} placeholder="amount" style={numCell}
                      disabled={!!busy[`link-${link.id}`]}
                      onBlur={e => { const v = Number(e.target.value); if (e.target.value !== '' && v > 0 && v !== Number(link.quantity_per_serving)) onSet(side === 'product' ? link.product_id : link.inventory_item_id, v) }} />
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginLeft: '0.35rem' }}>{unit ?? ''}</span>
                    {link.quantity_per_serving === null && <div style={{ fontSize: '0.68rem', color: '#e67e22' }}>No amount set: nothing is deducted</div>}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button style={dangerBtn} disabled={!!busy[`link-${link.id}`]} onClick={() => onRemove(link)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem 1rem', alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--color-border)' }}>
        <select className="form-select" value={addId} onChange={e => setAddId(e.target.value)} style={{ flex: 1, minWidth: '200px', fontSize: '0.8rem' }}>
          <option value="">— {optionLabel} —</option>
          {groups.map(g => (
            <optgroup key={g} label={g}>{options.filter(o => o.group === g).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</optgroup>
          ))}
        </select>
        <input type="number" min="0" step="0.01" placeholder="per serving" value={addQty} onChange={e => setAddQty(e.target.value)} style={{ ...numCell, width: '110px' }} />
        <button className="btn btn-primary btn-sm" disabled={!addId || !(Number(addQty) > 0)} onClick={() => { onSet(addId, Number(addQty)); setAddId(''); setAddQty('') }}>Add</button>
      </div>
    </div>
  )
}

function NewCategoryRow({ sheet, busy, onCreate }: { sheet: SheetType; busy: boolean; onCreate: (name: string) => void }) {
  const [name, setName] = useState('')
  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', paddingTop: '0.4rem' }}>
      <input type="text" placeholder={`New category in ${SHEET_LABELS[sheet].label}…`} value={name} onChange={e => setName(e.target.value)} style={{ ...cell, minWidth: '220px', flex: 1 }}
        onKeyDown={e => { if (e.key === 'Enter' && name.trim()) { onCreate(name); setName('') } }} />
      <button className="btn btn-ghost btn-sm" disabled={busy || !name.trim()} onClick={() => { onCreate(name); setName('') }}>＋ Add</button>
    </div>
  )
}

function NewItemModal({ categories, branches, defaultSheet, busy, onClose, onCreate }: {
  categories: CategoryRow[]
  branches: Branch[]
  defaultSheet: SheetType
  busy: boolean
  onClose: () => void
  onCreate: (input: { name: string; category_id: string; unit: string | null; min_stock_level: number | null; branch_ids: string[] }) => void
}) {
  const firstCat = categories.find(c => c.sheet_type === defaultSheet)?.id ?? categories[0]?.id ?? ''
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState(firstCat)
  const [unit, setUnit] = useState('')
  const [min, setMin] = useState('0')
  const [branchIds, setBranchIds] = useState<string[]>(branches.map(b => b.id))
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '520px', width: '95%' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h3 className="modal-title">New inventory item</h3><button className="modal-close" onClick={onClose}>×</button></div>
        <div className="modal-body">
          <div className="form-group"><label className="form-label">Name</label><input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Bell Pepper" autoFocus /></div>
          <div className="form-group"><label className="form-label">Category</label>
            <select className="form-select" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              {SHEET_TYPES.map(s => (
                <optgroup key={s} label={SHEET_LABELS[s].label}>{categories.filter(c => c.sheet_type === s).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
              ))}
            </select>
          </div>
          <div className="form-grid">
            <div className="form-group"><label className="form-label">Unit</label><input className="form-input" value={unit} onChange={e => setUnit(e.target.value)} placeholder="pc, g, ml, kg" /></div>
            <div className="form-group"><label className="form-label">Minimum stock (warning level)</label><input className="form-input" type="number" min="0" step="0.5" value={min} onChange={e => setMin(e.target.value)} /></div>
          </div>
          <div className="form-group"><label className="form-label">Show at branches</label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {branches.map(b => (
                <span key={b.id} style={chip(branchIds.includes(b.id))} onClick={() => setBranchIds(ids => (ids.includes(b.id) ? ids.filter(x => x !== b.id) : [...ids, b.id]))}>
                  {branchIds.includes(b.id) ? '✓ ' : ''}{b.name}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" disabled={busy || !name.trim() || !categoryId}
            onClick={() => onCreate({ name, category_id: categoryId, unit: unit || null, min_stock_level: min === '' ? null : Number(min), branch_ids: branchIds })}>
            {busy ? 'Creating…' : 'Create item'}
          </button>
        </div>
      </div>
    </div>
  )
}
