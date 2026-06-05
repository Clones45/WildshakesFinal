'use client'

import { useState } from 'react'

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

interface Props {
  commissaryId: string
  commissaryName: string
  categories: Category[]
  inventoryItems: InventoryItem[]
  franchises: Franchise[]
  branches: Branch[]
  todayLogs: DailyLog[]
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
  commissaryId, commissaryName, categories, inventoryItems, franchises, branches, todayLogs
}: Props) {
  const [selectedBranch, setSelectedBranch] = useState('all')
  const [sheetFilter, setSheetFilter]       = useState('all')
  const [search, setSearch]                 = useState('')

  // Items are already filtered server-side via junction table
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

  return (
    <>
      <div className="page-header">
        <div>
          <h1>🗂️ Inventory</h1>
          <p className="page-header-subtitle">Monitor franchisee stock levels across all branches</p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="form-select" value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)} style={{ width: 'auto' }}>
          <option value="all">All Branches</option>
          {franchises.map(f => {
            const fBranches = branches.filter(b => b.franchise_id === f.id)
            return fBranches.map(b => (
              <option key={b.id} value={b.id}>{b.name} ({f.name})</option>
            ))
          })}
        </select>

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

      {/* Stock Table per Branch */}
      {visibleBranches.map(branch => {
        const franchise = franchises.find(f => f.id === branch.franchise_id)
        const rows = displayItems.map(item => {
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

      {visibleBranches.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
          No branches found for this filter.
        </div>
      )}
    </>
  )
}
