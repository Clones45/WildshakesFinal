'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { setScopedItemTags } from '@/lib/actions/inventorySetup'

interface Category { id: string; name: string; sheet_type: string }
interface InventoryItem {
  id: string
  name: string
  unit: string | null
  min_stock_level: number | null
  is_active: boolean
  category_id: string
}
interface DailyLog {
  id: string
  branch_id: string
  inventory_item_id: string
  log_date: string
  starting_stock: number | null
  additional_stock: number | null
  used_stock: number | null
  ending_stock: number | null
}
interface Branch { id: string; name: string; franchise_id: string }
interface Franchise { id: string; name: string }
interface ItemTag { id: string; inventory_item_id: string; entity_type: 'branch' | 'commissary'; entity_id: string }

interface Props {
  commissaryId: string
  commissaryName: string
  categories: Category[]
  inventoryItems: InventoryItem[]
  franchises: Franchise[]
  branches: Branch[]
  todayLogs: DailyLog[]
  itemTags?: ItemTag[]
}

const SHEET_LABELS: Record<string, string> = {
  commissary: '🏭 CSL',
  commissary_home: '🏠 Home',
  food: '🍝 Food',
  food_2: '🍕 Food 2',
  production: '⚙️ Production',
  coffee_general: '☕ Coffee & General',
  shake: '🥤 Shake',
}

export default function CommissaryInventoryClient({
  commissaryId, commissaryName, categories, inventoryItems, franchises, branches, todayLogs, itemTags = []
}: Props) {
  const [tab, setTab] = useState<'stock' | 'catalog'>('stock')
  const [selectedBranch, setSelectedBranch] = useState('all')
  const [sheetFilter, setSheetFilter]       = useState('all')
  const [search, setSearch]                 = useState('')
  const [isPending, startTransition] = useTransition()

  // Local state for tags to allow optimistic updates
  const [localTags, setLocalTags] = useState<ItemTag[]>(itemTags)
  
  // Create a map for quick tag lookups
  const tagsByItem: Record<string, ItemTag[]> = {}
  for (const t of localTags) {
    if (!tagsByItem[t.inventory_item_id]) tagsByItem[t.inventory_item_id] = []
    tagsByItem[t.inventory_item_id].push(t)
  }

  // Filter items by search
  const visibleItems = inventoryItems
  const searchedItems = visibleItems.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase())
  )

  // Filter by sheet type
  const filteredCategories = categories.filter(c =>
    sheetFilter === 'all' || c.sheet_type === sheetFilter
  )

  const catIds = new Set(filteredCategories.map(c => c.id))
  const displayItems = searchedItems.filter(i => catIds.has(i.category_id))

  // Filter branches by selected franchise branch
  const visibleBranches = selectedBranch === 'all'
    ? branches
    : branches.filter(b => b.id === selectedBranch)

  function getLog(branchId: string, itemId: string) {
    return todayLogs.find(l => l.branch_id === branchId && l.inventory_item_id === itemId)
  }

  function fmt(v: number | null | undefined) {
    return v == null ? '—' : v
  }

  function tabStyle(id: string) {
    const active = tab === id
    return {
      padding: '0.6rem 1.25rem', border: 'none', background: 'none', cursor: 'pointer',
      borderBottom: active ? '2px solid var(--color-accent)' : '2px solid transparent',
      color: active ? 'var(--color-accent)' : 'var(--color-text-muted)',
      fontWeight: active ? 700 : 400, fontSize: '0.88rem', transition: 'all 0.15s',
    } as React.CSSProperties
  }

  /* ── Inline Tag Picker (Restricted to this Commissary's Franchises) ── */
  function ScopedInlineTagPicker({ itemId }: { itemId: string }) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)
    const [saving, setSaving] = useState(false)

    // Only look at tags for the franchisee branches (not "self")
    const myChildBranches = branches.filter(b => b.franchise_id !== 'self')
    const myChildBranchIds = new Set(myChildBranches.map(b => b.id))
    
    const currentTags = localTags.filter(t => t.inventory_item_id === itemId && t.entity_type === 'branch' && myChildBranchIds.has(t.entity_id))
    const checkedKeys = new Set(currentTags.map(t => t.entity_id))

    useEffect(() => {
      if (!open) return
      function handleClick(e: MouseEvent) {
        if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
      }
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }, [open])

    async function handleToggle(branchId: string) {
      const isChecked = checkedKeys.has(branchId)
      
      // Optimistic update
      let newTags = [...localTags]
      if (isChecked) {
        newTags = newTags.filter(t => !(t.inventory_item_id === itemId && t.entity_type === 'branch' && t.entity_id === branchId))
      } else {
        newTags.push({ id: `temp-${Date.now()}`, inventory_item_id: itemId, entity_type: 'branch', entity_id: branchId })
      }
      setLocalTags(newTags)
      
      const newEntityIds = newTags
        .filter(t => t.inventory_item_id === itemId && t.entity_type === 'branch' && myChildBranchIds.has(t.entity_id))
        .map(t => t.entity_id)

      setSaving(true)
      startTransition(async () => {
        await setScopedItemTags(itemId, Array.from(myChildBranchIds), newEntityIds)
        setSaving(false)
      })
    }

    const tagLabels = currentTags.map(t => branches.find(b => b.id === t.entity_id)?.name || 'Branch')

    return (
      <div ref={ref} style={{ position: 'relative' }}>
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
            <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>＋ Assign to franchises…</span>
          ) : (
            tagLabels.map((l, i) => (
              <span key={i} className="badge badge-muted" style={{ fontSize: '0.6rem', whiteSpace: 'nowrap', padding: '1px 5px' }}>🏪 {l}</span>
            ))
          )}
          {saving && <span className="loading-spinner" style={{ width: 12, height: 12, marginLeft: 4 }} />}
        </button>

        {open && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, zIndex: 100,
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)', boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            padding: '0.5rem', minWidth: 220, maxHeight: 320, overflowY: 'auto',
            marginTop: '0.25rem',
          }}>
            {franchises.filter(f => f.id !== 'self').map(f => {
              const fBranches = myChildBranches.filter(b => b.franchise_id === f.id)
              if (fBranches.length === 0) return null
              return (
                <div key={f.id} style={{ marginTop: '0.35rem' }}>
                  <p style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-text-muted)', padding: '0.2rem 0.4rem', margin: 0 }}>🏪 {f.name}</p>
                  {fBranches.map(b => {
                    const checked = checkedKeys.has(b.id)
                    return (
                      <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.4rem', cursor: 'pointer', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', background: checked ? 'rgba(74,124,89,0.1)' : 'transparent' }}>
                        <input type="checkbox" checked={checked} onChange={() => handleToggle(b.id)} style={{ accentColor: 'var(--color-primary)' }} />
                        {b.name}
                      </label>
                    )
                  })}
                </div>
              )
            })}
            <p style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', padding: '0.4rem 0.4rem 0.15rem', margin: 0, borderTop: '1px solid var(--color-border)', marginTop: '0.35rem' }}>
              {checkedKeys.size === 0 ? 'Not assigned to any franchise.' : `${checkedKeys.size} selected.`}
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>🗂️ Inventory</h1>
          <p className="page-header-subtitle">Monitor franchisee stock levels and assign items to franchises</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid var(--color-border)', marginBottom: '1.5rem' }}>
        <button style={tabStyle('stock')} onClick={() => setTab('stock')}>📊 Stock Levels</button>
        <button style={tabStyle('catalog')} onClick={() => setTab('catalog')}>📦 Franchise Assignments</button>
      </div>

      {/* Filters (Shared) */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {tab === 'stock' && (
          <select className="form-select" value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)} style={{ width: 'auto' }}>
            <option value="all">All Branches</option>
            {franchises.map(f => {
              const fBranches = branches.filter(b => b.franchise_id === f.id)
              if (fBranches.length === 0) return null
              return fBranches.map(b => (
                <option key={b.id} value={b.id}>{b.name} ({f.name})</option>
              ))
            })}
          </select>
        )}

        <select className="form-select" value={sheetFilter} onChange={e => setSheetFilter(e.target.value)} style={{ width: 'auto' }}>
          <option value="all">All Sheets</option>
          {Object.entries(SHEET_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>

        <input
          className="form-input"
          placeholder="Search items…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '200px' }}
        />
      </div>

      {/* TAB 1: Stock Levels */}
      {tab === 'stock' && visibleBranches.map(branch => {
        const franchise = franchises.find(f => f.id === branch.franchise_id)
        
        // Filter displayItems to ONLY show items tagged to THIS branch
        const branchItems = displayItems.filter(item => {
          const tags = tagsByItem[item.id] || []
          // Main Stock (self) always sees all items assigned to the commissary
          if (branch.franchise_id === 'self') return true
          return tags.some(t => t.entity_id === branch.id)
        })

        if (branchItems.length === 0 && search === '') return null // Skip branches with no assigned items

        const rows = branchItems.map(item => {
          const log = getLog(branch.id, item.id)
          const cat = categories.find(c => c.id === item.category_id)
          return { item, log, cat }
        })

        const hasData = rows.some(r => r.log)

        return (
          <div key={branch.id} className="table-wrapper" style={{ marginBottom: '1.25rem' }}>
            <div className="table-header">
              <div>
                <p className="table-title">{branch.name}</p>
                <p style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                  {franchise?.name}
                  {!hasData && ' · No logs today'}
                </p>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Category</th>
                  <th style={{ textAlign: 'center' }}>Start</th>
                  <th style={{ textAlign: 'center' }}>Added</th>
                  <th style={{ textAlign: 'center' }}>Used</th>
                  <th style={{ textAlign: 'center' }}>End</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '1.5rem' }}>
                      No items match current filters.
                    </td>
                  </tr>
                ) : (
                  rows.map(({ item, log, cat }) => (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 600, fontSize: '0.85rem' }}>{item.name}</td>
                      <td>
                        <span className="badge badge-muted" style={{ fontSize: '0.65rem' }}>
                          {SHEET_LABELS[cat?.sheet_type ?? '']?.split(' ')[0] ?? '📦'} {cat?.name}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center', fontSize: '0.85rem' }}>{fmt(log?.starting_stock)}</td>
                      <td style={{ textAlign: 'center', fontSize: '0.85rem', color: log?.additional_stock ? 'var(--color-success)' : undefined }}>
                        {fmt(log?.additional_stock)}
                      </td>
                      <td style={{ textAlign: 'center', fontSize: '0.85rem' }}>{fmt(log?.used_stock)}</td>
                      <td style={{ textAlign: 'center', fontSize: '0.85rem', fontWeight: 600 }}>
                        {fmt(log?.ending_stock)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )
      })}

      {/* TAB 2: Item Catalog (Assignments) */}
      {tab === 'catalog' && (
        <div className="table-wrapper">
          <div className="table-header">
            <p className="table-title">Item Franchise Assignments</p>
            <p style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
              Assign items provided by Master Admin to your specific franchisee branches.
            </p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th>Franchise Assignments</th>
              </tr>
            </thead>
            <tbody>
              {displayItems.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '1.5rem' }}>
                    No items available.
                  </td>
                </tr>
              ) : (
                displayItems.map(item => {
                  const cat = categories.find(c => c.id === item.category_id)
                  return (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 600, fontSize: '0.85rem' }}>{item.name}</td>
                      <td>
                        <span className="badge badge-muted" style={{ fontSize: '0.65rem' }}>
                          {SHEET_LABELS[cat?.sheet_type ?? '']?.split(' ')[0] ?? '📦'} {cat?.name}
                        </span>
                      </td>
                      <td>
                        <ScopedInlineTagPicker itemId={item.id} />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
