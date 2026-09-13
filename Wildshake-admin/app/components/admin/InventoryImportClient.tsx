'use client'

import React, { useState, useCallback, useRef } from 'react'
import { SHEET_TYPES, SHEET_LABELS, isSheetType } from '@/lib/inventory/sheets'
import { importRecipeLinks, createItemsFromImport } from '@/lib/actions/masterInventory'

/* ─── Types ─────────────────────────────────────────────────────── */
interface Product { id: string; name: string; category: string; price: number; is_available: boolean }
interface InventoryItem { id: string; name: string; unit: string | null; category_id: string }
interface InventoryCategory { id: string; name: string; sheet_type: string }
interface Branch { id: string; name: string }

interface ParsedLink {
  ingredientName: string     // from the CSV item column
  unitSize: number | null    // from the Grams/Pc column
  menuItemName: string       // from the CSV column header
  categoryGroup: string      // from the row above the header
  quantityPerServing: number // the cell value
}

interface MatchedLink {
  parsed: ParsedLink
  inventoryItemId: string | null
  inventoryItemName: string | null
  productId: string | null
  productName: string | null
  conflictIngredient: boolean
  conflictProduct: boolean
}

interface CommitResult { inserted: number; updated: number; skipped: number; errors: string[] }

interface Props {
  products: Product[]
  inventoryItems: InventoryItem[]
  categories: InventoryCategory[]
  branches: Branch[]
}

type Step = 'upload' | 'parse' | 'match' | 'preview' | 'commit' | 'done'

/* ─── Fuzzy match helper ────────────────────────────────────────── */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function fuzzyScore(a: string, b: string): number {
  const na = normalize(a)
  const nb = normalize(b)
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.85
  const setA = new Set(na.split(''))
  const setB = new Set(nb.split(''))
  const intersection = [...setA].filter(c => setB.has(c)).length
  const union = new Set([...na.split(''), ...nb.split('')]).size
  return intersection / union
}

function bestMatch<T extends { name: string }>(query: string, candidates: T[]): T | null {
  if (!candidates.length) return null
  let best: T | null = null
  let bestScore = 0
  for (const c of candidates) {
    const s = fuzzyScore(query, c.name)
    if (s > bestScore) { bestScore = s; best = c }
  }
  return bestScore >= 0.5 ? best : null
}

/* ─── CSV parser ────────────────────────────────────────────────── */
function parseInventoryCSV(raw: string): ParsedLink[] {
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

  const parseCsvLine = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { inQuotes = !inQuotes }
      else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = '' }
      else { current += ch }
    }
    result.push(current.trim())
    return result
  }

  // The header row is the one holding a cell that literally reads "Items"; its column
  // is the ingredient-name column (it shifts between sheet exports).
  let headerRowIdx = -1
  let itemCol = -1
  for (let r = 0; r < Math.min(lines.length, 10); r++) {
    const row = parseCsvLine(lines[r])
    const c = row.findIndex(cell => cell.trim().toLowerCase() === 'items')
    if (c !== -1) { headerRowIdx = r; itemCol = c; break }
  }
  if (headerRowIdx === -1 || headerRowIdx === 0) return []

  const categoryRow = parseCsvLine(lines[headerRowIdx - 1])
  const headerRow   = parseCsvLine(lines[headerRowIdx])
  const unitCol      = itemCol + 1
  const firstMenuCol = itemCol + 2

  const colCategoryMap: string[] = []
  let currentCat = ''
  for (let c = 0; c < headerRow.length; c++) {
    if (categoryRow[c] && categoryRow[c].trim()) currentCat = categoryRow[c].trim()
    colCategoryMap[c] = currentCat
  }

  const links: ParsedLink[] = []
  for (let r = headerRowIdx + 1; r < lines.length; r++) {
    const row = parseCsvLine(lines[r])
    const ingredientName = row[itemCol]?.trim()
    if (!ingredientName) continue
    const unitSize = row[unitCol] ? parseFloat(row[unitCol]) || null : null
    for (let c = firstMenuCol; c < headerRow.length; c++) {
      const menuItemName = headerRow[c]?.trim()
      if (!menuItemName) continue
      const cellVal = row[c]?.trim()
      if (!cellVal) continue
      const qty = parseFloat(cellVal)
      if (isNaN(qty) || qty === 0) continue
      links.push({ ingredientName, unitSize, menuItemName, categoryGroup: colCategoryMap[c] || 'Unknown', quantityPerServing: qty })
    }
  }
  return links
}

/* ─── Main component ───────────────────────────────────────────── */
export default function InventoryImportClient({ products, inventoryItems: initialItems, categories, branches }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>(initialItems)
  const [step, setStep] = useState<Step>('upload')
  const [dragOver, setDragOver] = useState(false)
  const [fileName, setFileName] = useState('')
  const [parsedLinks, setParsedLinks] = useState<ParsedLink[]>([])
  const [matchedLinks, setMatchedLinks] = useState<MatchedLink[]>([])
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null)
  const [isCommitting, setIsCommitting] = useState(false)
  const [overwriteMode, setOverwriteMode] = useState<'update' | 'skip'>('update')
  const [historyHint, setHistoryHint] = useState(false)

  // Manual overrides in the match step (by row index)
  const [overrideIngredient, setOverrideIngredient] = useState<Record<number, string>>({})
  const [overrideProduct, setOverrideProduct]       = useState<Record<number, string>>({})

  // "Create missing ingredients" panel
  const firstRecipeCategory = categories.find(c => c.sheet_type === 'food')?.id ?? categories[0]?.id ?? ''
  const [newItems, setNewItems] = useState<Record<string, { include: boolean; name: string; category_id: string; unit: string }>>({})
  const [newItemBranches, setNewItemBranches] = useState<string[]>(branches.map(b => b.id))
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  /* ── File handling ─────────────────────────────────────────── */
  const handleFile = useCallback((file: File) => {
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      const raw = e.target?.result as string
      setParsedLinks(parseInventoryCSV(raw))
      setStep('parse')
    }
    reader.readAsText(file)
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  /* ── Matching ──────────────────────────────────────────────── */
  function computeMatches(items: InventoryItem[], ovIng: Record<number, string>, ovProd: Record<number, string>): MatchedLink[] {
    return parsedLinks.map((link, i) => {
      const ingId  = ovIng[i] ?? ''
      const prodId = ovProd[i] ?? ''
      const ingMatch  = ingId  ? items.find(x => x.id === ingId) ?? null   : bestMatch(link.ingredientName, items)
      const prodMatch = prodId ? products.find(x => x.id === prodId) ?? null : bestMatch(link.menuItemName, products)
      return {
        parsed: link,
        inventoryItemId:   ingMatch?.id   ?? null,
        inventoryItemName: ingMatch?.name ?? null,
        productId:         prodMatch?.id   ?? null,
        productName:       prodMatch?.name ?? null,
        conflictIngredient: !ingMatch,
        conflictProduct:    !prodMatch,
      }
    })
  }

  function buildMatches() {
    const matched = computeMatches(inventoryItems, overrideIngredient, overrideProduct)
    setMatchedLinks(matched)
    // Seed the "create missing" panel with every ingredient name that found no match
    const missing: Record<string, { include: boolean; name: string; category_id: string; unit: string }> = {}
    for (const m of matched) {
      if (m.conflictIngredient && !missing[m.parsed.ingredientName]) {
        missing[m.parsed.ingredientName] = { include: true, name: m.parsed.ingredientName, category_id: firstRecipeCategory, unit: 'g' }
      }
    }
    setNewItems(missing)
    setStep('match')
  }

  function applyOverrides() {
    setMatchedLinks(computeMatches(inventoryItems, overrideIngredient, overrideProduct))
    setStep('preview')
  }

  const missingNames = Object.keys(newItems).filter(n => matchedLinks.some(m => m.conflictIngredient && m.parsed.ingredientName === n && !overrideIngredient[matchedLinks.indexOf(m)]))

  async function createMissing() {
    const toCreate = missingNames.filter(n => newItems[n].include).map(n => ({
      name: newItems[n].name.trim() || n,
      category_id: newItems[n].category_id,
      unit: newItems[n].unit.trim() || null,
      branch_ids: newItemBranches,
      csvName: n,
    }))
    if (toCreate.length === 0) return
    setCreating(true); setCreateError('')
    try {
      const r = await createItemsFromImport(toCreate.map(t => ({ name: t.name, category_id: t.category_id, unit: t.unit, branch_ids: t.branch_ids })))
      if ('error' in r) { setCreateError(r.error); return }
      if (r.historyRecorded === false) setHistoryHint(true)
      const created = r.created.map(c => ({ id: c.id, name: c.name, unit: c.unit, category_id: c.category_id }))
      const nextItems = [...inventoryItems, ...created]
      setInventoryItems(nextItems)
      // Point every unmatched row for that CSV name at the new item, then re-match
      const nextOv = { ...overrideIngredient }
      matchedLinks.forEach((m, i) => {
        if (!m.conflictIngredient || nextOv[i]) return
        const want = toCreate.find(t => t.csvName === m.parsed.ingredientName)
        const made = want ? created.find(c => c.name === want.name) : undefined
        if (made) nextOv[i] = made.id
      })
      setOverrideIngredient(nextOv)
      setMatchedLinks(computeMatches(nextItems, nextOv, overrideProduct))
      if (r.errors.length) setCreateError(r.errors.join(' · '))
    } finally {
      setCreating(false)
    }
  }

  /* ── Commit ────────────────────────────────────────────────── */
  async function commitImport() {
    setIsCommitting(true)
    setStep('commit')
    const valid = matchedLinks.filter(ml => ml.inventoryItemId && ml.productId)
    try {
      const r = await importRecipeLinks(
        valid.map(ml => ({ inventory_item_id: ml.inventoryItemId!, product_id: ml.productId!, quantity_per_serving: ml.parsed.quantityPerServing })),
        overwriteMode
      )
      if ('error' in r) {
        setCommitResult({ inserted: 0, updated: 0, skipped: 0, errors: [r.error] })
      } else {
        if (r.historyRecorded === false) setHistoryHint(true)
        setCommitResult({ inserted: r.inserted, updated: r.updated, skipped: r.skipped, errors: r.errors })
      }
    } catch (err) {
      setCommitResult({ inserted: 0, updated: 0, skipped: 0, errors: [err instanceof Error ? err.message : 'Unknown error'] })
    } finally {
      setIsCommitting(false)
      setStep('done')
    }
  }

  /* ── Helpers ───────────────────────────────────────────────── */
  const conflictCount  = matchedLinks.filter(ml => ml.conflictIngredient || ml.conflictProduct).length
  const validCount     = matchedLinks.filter(ml => ml.inventoryItemId && ml.productId).length
  const skippableCount = matchedLinks.length - validCount

  const groupedByCategory = matchedLinks.reduce<Record<string, MatchedLink[]>>((acc, ml) => {
    const cat = ml.parsed.categoryGroup
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(ml)
    return acc
  }, {})

  const cardStyle: React.CSSProperties = {
    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-lg)', padding: '2rem', boxShadow: 'var(--shadow-card)',
  }
  const badgeStyle = (ok: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.15rem 0.6rem',
    borderRadius: 'var(--radius-pill)', fontSize: '0.7rem', fontWeight: 700,
    background: ok ? 'rgba(76,175,114,0.12)' : 'rgba(192,57,43,0.12)',
    color: ok ? 'var(--color-success)' : 'var(--color-danger-light)',
    border: `1px solid ${ok ? 'rgba(76,175,114,0.3)' : 'rgba(192,57,43,0.3)'}`,
  })
  const selectStyle: React.CSSProperties = {
    background: 'var(--color-surface-3)', color: 'var(--color-text)', border: '1px solid var(--color-danger)',
    borderRadius: 'var(--radius-sm)', padding: '0.2rem 0.5rem', fontSize: '0.75rem', width: '100%',
  }
  const th: React.CSSProperties = { padding: '0.5rem 0.7rem', textAlign: 'left', color: 'var(--color-text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }

  const steps: { key: Step; label: string; icon: string }[] = [
    { key: 'upload',  label: 'Upload',  icon: '📁' },
    { key: 'parse',   label: 'Review',  icon: '🔍' },
    { key: 'match',   label: 'Match',   icon: '🔗' },
    { key: 'preview', label: 'Preview', icon: '📋' },
    { key: 'commit',  label: 'Import',  icon: '✅' },
  ]
  const stepOrder: Step[] = ['upload', 'parse', 'match', 'preview', 'commit', 'done']
  const currentIdx = stepOrder.indexOf(step)

  return (
    <div style={{ padding: '2rem', maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <a href="/inventory" style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>← Back to Inventory Setup</a>
        <h1 style={{ margin: '0.5rem 0 0', color: 'var(--color-text)', fontFamily: 'Playfair Display, serif' }}>📥 Recipe Import</h1>
        <p style={{ marginTop: '0.4rem', color: 'var(--color-text-muted)' }}>
          Upload the Wildshakes Food &amp; Drinks inventory CSV to set how much of each ingredient every menu item uses. One recipe serves all branches.
        </p>
      </div>

      {historyHint && (
        <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
          Saved, but the change history is not switched on yet. Run <code>add_inventory_history_migration.sql</code> once in the Supabase SQL editor.
        </div>
      )}

      {/* Stepper */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '2.5rem', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '1rem 1.5rem' }}>
        {steps.map((s, i) => {
          const sIdx = stepOrder.indexOf(s.key)
          const done = sIdx < currentIdx
          const active = sIdx === currentIdx
          return (
            <React.Fragment key={s.key}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem', flex: 1 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: done ? 'var(--color-primary)' : active ? 'var(--color-accent)' : 'var(--color-surface-3)',
                  border: `2px solid ${active ? 'var(--color-accent)' : done ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  fontSize: done ? '1rem' : '0.85rem', boxShadow: active ? '0 0 12px rgba(212,175,55,0.4)' : 'none',
                }}>{done ? '✓' : s.icon}</div>
                <span style={{ fontSize: '0.7rem', fontWeight: active ? 700 : 500, color: active ? 'var(--color-accent)' : done ? 'var(--color-primary-light)' : 'var(--color-text-muted)' }}>{s.label}</span>
              </div>
              {i < steps.length - 1 && <div style={{ height: 2, flex: 2, background: sIdx < currentIdx ? 'var(--color-primary)' : 'var(--color-border)', marginBottom: '1.2rem' }} />}
            </React.Fragment>
          )
        })}
      </div>

      {/* ── STEP 1: UPLOAD ─────────────────────────────────────── */}
      {step === 'upload' && (
        <div style={cardStyle}>
          <h3 style={{ marginBottom: '1.5rem' }}>Upload Inventory CSV</h3>
          <div
            onDrop={onDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? 'var(--color-accent)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-lg)',
              padding: '4rem 2rem', textAlign: 'center', cursor: 'pointer',
              background: dragOver ? 'rgba(212,175,55,0.06)' : 'var(--color-surface-2)',
            }}
          >
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📄</div>
            <p style={{ color: 'var(--color-text)', fontWeight: 600, marginBottom: '0.5rem' }}>Drop your CSV file here, or click to browse</p>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Accepts: <code style={{ color: 'var(--color-accent)' }}>.csv</code> — the Wildshakes Food &amp; Drinks Inventory export</p>
          </div>
          <input ref={fileInputRef} type="file" accept=".csv" onChange={onFileChange} style={{ display: 'none' }} />
          <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(74,124,89,0.08)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
            <strong style={{ color: 'var(--color-primary-light)' }}>Expected format:</strong> a row of menu-item names with a cell reading <em>Items</em> at the start, the row above it naming the menu groups, and one ingredient per row below with the amount used per serving in each menu-item column.
          </div>
        </div>
      )}

      {/* ── STEP 2: PARSE REVIEW ──────────────────────────────── */}
      {step === 'parse' && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h3 style={{ marginBottom: '0.25rem' }}>Parsed Data Review</h3>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>📄 <strong style={{ color: 'var(--color-text)' }}>{fileName}</strong></p>
            </div>
            <span style={badgeStyle(parsedLinks.length > 0)}>{parsedLinks.length.toLocaleString()} recipe links found</span>
          </div>
          {parsedLinks.length === 0 && (
            <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>No recipe links could be read from this file. Check that it has an <em>Items</em> header cell.</div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
            {Object.entries(parsedLinks.reduce<Record<string, number>>((acc, l) => { acc[l.categoryGroup] = (acc[l.categoryGroup] ?? 0) + 1; return acc }, {})).map(([cat, count]) => (
              <div key={cat} style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem' }}>
                <p style={{ color: 'var(--color-text)', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.2rem' }}>{cat || 'Uncategorized'}</p>
                <p style={{ color: 'var(--color-accent)', fontWeight: 700, fontSize: '1.1rem', margin: 0 }}>{count}</p>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.7rem', margin: 0 }}>links</p>
              </div>
            ))}
          </div>
          <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginBottom: '1.5rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead><tr style={{ background: 'var(--color-surface-3)' }}>{['Category', 'Menu Item', 'Ingredient', 'Qty/Serving', 'Unit Size'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {parsedLinks.slice(0, 10).map((l, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '0.5rem 0.8rem', color: 'var(--color-text-muted)' }}>{l.categoryGroup}</td>
                    <td style={{ padding: '0.5rem 0.8rem', fontWeight: 500 }}>{l.menuItemName}</td>
                    <td style={{ padding: '0.5rem 0.8rem' }}>{l.ingredientName}</td>
                    <td style={{ padding: '0.5rem 0.8rem', color: 'var(--color-accent)', fontWeight: 700 }}>{l.quantityPerServing}</td>
                    <td style={{ padding: '0.5rem 0.8rem', color: 'var(--color-text-muted)' }}>{l.unitSize ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button onClick={() => setStep('upload')} className="btn btn-ghost btn-sm">← Re-upload</button>
            <button onClick={buildMatches} disabled={parsedLinks.length === 0} className="btn btn-primary" style={{ marginLeft: 'auto' }}>Run Auto-Match →</button>
          </div>
        </div>
      )}

      {/* ── STEP 3: MATCH ─────────────────────────────────────── */}
      {step === 'match' && (
        <div>
          {missingNames.length > 0 && (
            <div style={{ ...cardStyle, marginBottom: '1.5rem', borderColor: 'rgba(230,126,34,0.5)' }}>
              <h3 style={{ marginBottom: '0.25rem' }}>🆕 Ingredients not in the system yet ({missingNames.length})</h3>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                These CSV ingredients matched nothing. Create them here in one go (pick the category and unit), or untick a row and choose an existing item in the table below instead.
              </p>
              <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginBottom: '1rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead><tr style={{ background: 'var(--color-surface-3)' }}><th style={th}></th><th style={th}>CSV name</th><th style={th}>Name to create</th><th style={th}>Category</th><th style={th}>Unit</th></tr></thead>
                  <tbody>
                    {missingNames.map(n => {
                      const row = newItems[n]
                      return (
                        <tr key={n} style={{ borderTop: '1px solid var(--color-border)', opacity: row.include ? 1 : 0.5 }}>
                          <td style={{ padding: '0.4rem 0.7rem' }}><input type="checkbox" checked={row.include} onChange={e => setNewItems(m => ({ ...m, [n]: { ...row, include: e.target.checked } }))} /></td>
                          <td style={{ padding: '0.4rem 0.7rem', color: 'var(--color-text-muted)' }}>{n}</td>
                          <td style={{ padding: '0.4rem 0.7rem' }}><input className="form-input" value={row.name} onChange={e => setNewItems(m => ({ ...m, [n]: { ...row, name: e.target.value } }))} style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem' }} /></td>
                          <td style={{ padding: '0.4rem 0.7rem' }}>
                            <select className="form-select" value={row.category_id} onChange={e => setNewItems(m => ({ ...m, [n]: { ...row, category_id: e.target.value } }))} style={{ fontSize: '0.78rem', padding: '0.3rem 0.4rem' }}>
                              {SHEET_TYPES.map(s => (
                                <optgroup key={s} label={SHEET_LABELS[s].label}>{categories.filter(c => c.sheet_type === s).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
                              ))}
                              {categories.filter(c => !isSheetType(c.sheet_type)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: '0.4rem 0.7rem' }}><input className="form-input" value={row.unit} placeholder="g, pc, ml" onChange={e => setNewItems(m => ({ ...m, [n]: { ...row, unit: e.target.value } }))} style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem', width: '80px' }} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Show the new items at:</span>
                {branches.map(b => {
                  const on = newItemBranches.includes(b.id)
                  return (
                    <span key={b.id} onClick={() => setNewItemBranches(ids => (on ? ids.filter(x => x !== b.id) : [...ids, b.id]))} style={{
                      fontSize: '0.72rem', fontWeight: 700, padding: '2px 9px', borderRadius: '999px', cursor: 'pointer', userSelect: 'none',
                      border: `1px solid ${on ? '#16a085' : 'var(--color-border)'}`, background: on ? 'rgba(22,160,133,0.15)' : 'transparent', color: on ? '#16a085' : 'var(--color-text-muted)',
                    }}>{on ? '✓ ' : ''}{b.name}</span>
                  )
                })}
                <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} disabled={creating || missingNames.filter(n => newItems[n].include).length === 0} onClick={createMissing}>
                  {creating ? 'Creating…' : `Create ${missingNames.filter(n => newItems[n].include).length} item(s)`}
                </button>
              </div>
              {createError && <p style={{ color: 'var(--color-danger-light)', fontSize: '0.8rem', marginTop: '0.75rem' }}>{createError}</p>}
            </div>
          )}

          <div style={{ ...cardStyle, marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h3 style={{ marginBottom: '0.25rem' }}>Match Review</h3>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Check the auto-matches. Fix any <span style={{ color: 'var(--color-danger-light)' }}>❌ unmatched</span> rows before going on; unmatched rows are skipped.</p>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <span style={badgeStyle(true)}>✓ {validCount} matched</span>
                {conflictCount > 0 && <span style={badgeStyle(false)}>✗ {conflictCount} unmatched</span>}
              </div>
            </div>

            <div style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--color-text-muted)', fontSize: '0.82rem', fontWeight: 600 }}>When a link already exists:</span>
              {(['update', 'skip'] as const).map(mode => (
                <label key={mode} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.82rem' }}>
                  <input type="radio" name="overwrite" value={mode} checked={overwriteMode === mode} onChange={() => setOverwriteMode(mode)} style={{ accentColor: 'var(--color-accent)' }} />
                  <span>{mode === 'update' ? '🔄 Update the amount' : '⏭️ Keep the existing amount'}</span>
                </label>
              ))}
            </div>

            {Object.entries(groupedByCategory).map(([cat, catLinks]) => (
              <div key={cat} style={{ marginBottom: '1.5rem' }}>
                <div style={{ background: 'var(--color-surface-3)', padding: '0.4rem 0.8rem', borderRadius: 'var(--radius-sm)', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {cat} ({catLinks.length} links)
                </div>
                <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead><tr style={{ background: 'var(--color-surface-3)' }}><th style={th}>CSV Ingredient</th><th style={th}>→ Inventory item</th><th style={th}>CSV Menu Item</th><th style={th}>→ Menu item</th><th style={{ ...th, textAlign: 'right' }}>Qty</th></tr></thead>
                    <tbody>
                      {catLinks.map(ml => {
                        const globalIdx = matchedLinks.indexOf(ml)
                        const rowOk = !ml.conflictIngredient && !ml.conflictProduct
                        return (
                          <tr key={globalIdx} style={{ borderTop: '1px solid var(--color-border)', background: rowOk ? 'transparent' : 'rgba(192,57,43,0.05)' }}>
                            <td style={{ padding: '0.4rem 0.7rem', color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>{ml.parsed.ingredientName}</td>
                            <td style={{ padding: '0.4rem 0.7rem' }}>
                              {ml.conflictIngredient ? (
                                <select value={overrideIngredient[globalIdx] ?? ''} onChange={(e) => setOverrideIngredient(prev => ({ ...prev, [globalIdx]: e.target.value }))} style={selectStyle}>
                                  <option value="">— Select item —</option>
                                  {inventoryItems.map(ii => <option key={ii.id} value={ii.id}>{ii.name}</option>)}
                                </select>
                              ) : <span style={{ color: 'var(--color-success)', fontSize: '0.78rem' }}>✓ {ml.inventoryItemName}</span>}
                            </td>
                            <td style={{ padding: '0.4rem 0.7rem', color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>{ml.parsed.menuItemName}</td>
                            <td style={{ padding: '0.4rem 0.7rem' }}>
                              {ml.conflictProduct ? (
                                <select value={overrideProduct[globalIdx] ?? ''} onChange={(e) => setOverrideProduct(prev => ({ ...prev, [globalIdx]: e.target.value }))} style={selectStyle}>
                                  <option value="">— Select menu item —</option>
                                  {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.category})</option>)}
                                </select>
                              ) : <span style={{ color: 'var(--color-success)', fontSize: '0.78rem' }}>✓ {ml.productName}</span>}
                            </td>
                            <td style={{ padding: '0.4rem 0.7rem', textAlign: 'right', color: 'var(--color-accent)', fontWeight: 700 }}>{ml.parsed.quantityPerServing}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <button onClick={() => setStep('parse')} className="btn btn-ghost btn-sm">← Back</button>
              <button onClick={applyOverrides} className="btn btn-primary">Preview Import →</button>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 4: PREVIEW ───────────────────────────────────── */}
      {step === 'preview' && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h3 style={{ marginBottom: '0.25rem' }}>Import Preview</h3>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Check the final list before it is saved. Every branch deducts by these amounts from the next sale on.</p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span style={badgeStyle(true)}>✓ {validCount} will be imported</span>
              {skippableCount > 0 && <span style={badgeStyle(false)}>✗ {skippableCount} skipped (unmatched)</span>}
            </div>
          </div>
          <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginBottom: '1.5rem', maxHeight: '400px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}><tr style={{ background: 'var(--color-surface-3)' }}>{['Category', 'Menu item', 'Ingredient', 'Per serving'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {matchedLinks.filter(ml => ml.inventoryItemId && ml.productId).map((ml, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '0.45rem 0.8rem', color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>{ml.parsed.categoryGroup}</td>
                    <td style={{ padding: '0.45rem 0.8rem', fontWeight: 500 }}>{ml.productName}</td>
                    <td style={{ padding: '0.45rem 0.8rem' }}>{ml.inventoryItemName}</td>
                    <td style={{ padding: '0.45rem 0.8rem', color: 'var(--color-accent)', fontWeight: 700, textAlign: 'right' }}>{ml.parsed.quantityPerServing}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'space-between' }}>
            <button onClick={() => setStep('match')} className="btn btn-ghost btn-sm">← Back to Match</button>
            <button onClick={commitImport} disabled={validCount === 0} className="btn btn-primary" style={{ fontWeight: 700 }}>🚀 Save {validCount} recipe links</button>
          </div>
        </div>
      )}

      {/* ── COMMIT ────────────────────────────────────────────── */}
      {step === 'commit' && isCommitting && (
        <div style={cardStyle}>
          <h3 style={{ marginBottom: '1rem', textAlign: 'center' }}>⏳ Saving recipes…</h3>
          <p style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>This takes a few seconds for a full sheet.</p>
        </div>
      )}

      {/* ── STEP 5: DONE ──────────────────────────────────────── */}
      {step === 'done' && commitResult && (
        <div style={cardStyle}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ fontSize: '4rem', marginBottom: '0.75rem' }}>{commitResult.errors.length && !commitResult.inserted && !commitResult.updated ? '⚠️' : '🎉'}</div>
            <h3 style={{ color: 'var(--color-text)', marginBottom: '0.5rem' }}>Import finished</h3>
            <p style={{ color: 'var(--color-text-muted)' }}>Tills pick up the new amounts within about half a minute.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            {[
              { label: 'New links', value: commitResult.inserted, icon: '✅', color: 'var(--color-success)' },
              { label: 'Amounts updated', value: commitResult.updated, icon: '🔄', color: 'var(--color-info)' },
              { label: 'Unchanged or skipped', value: commitResult.skipped, icon: '⏭️', color: 'var(--color-text-muted)' },
            ].map(c => (
              <div key={c.label} style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '1.25rem', textAlign: 'center' }}>
                <div style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>{c.icon}</div>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: c.color }}>{c.value}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{c.label}</div>
              </div>
            ))}
          </div>
          {commitResult.errors.length > 0 && (
            <div style={{ background: 'rgba(192,57,43,0.08)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '1.5rem' }}>
              <p style={{ color: 'var(--color-danger-light)', fontWeight: 600, marginBottom: '0.5rem' }}>⚠️ {commitResult.errors.length} problem(s):</p>
              <ul style={{ paddingLeft: '1.25rem' }}>{commitResult.errors.map((e, i) => <li key={i} style={{ color: 'var(--color-danger-light)', fontSize: '0.8rem' }}>{e}</li>)}</ul>
            </div>
          )}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/inventory" className="btn btn-primary">⚙️ Back to Inventory Setup</a>
            <button onClick={() => { setStep('upload'); setParsedLinks([]); setMatchedLinks([]); setCommitResult(null); setFileName(''); setOverrideIngredient({}); setOverrideProduct({}); setNewItems({}) }} className="btn btn-ghost btn-sm">🔄 Import another file</button>
          </div>
        </div>
      )}
    </div>
  )
}
