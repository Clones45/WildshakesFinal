'use client'

import React, { useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

/* ─── Types ────────────────────────────────────────────────────────────── */
interface Product { id: string; name: string; category: string; price: number; is_available: boolean }
interface InventoryItem { id: string; name: string; unit: string | null; category_id: string }
interface InventoryCategory { id: string; name: string; sheet_type: string }

interface ParsedLink {
  ingredientName: string     // from CSV row[0]
  unitSize: number | null    // from CSV row[1]
  menuItemName: string       // from CSV col header (row 4)
  categoryGroup: string      // from CSV row 3
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

interface CommitResult {
  inserted: number
  updated: number
  skipped: number
  errors: string[]
}

interface Props {
  products: Product[]
  inventoryItems: InventoryItem[]
  categories: InventoryCategory[]
}

type Step = 'upload' | 'parse' | 'match' | 'preview' | 'commit' | 'done'

/* ─── Fuzzy match helper ────────────────────────────────────────────────── */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function fuzzyScore(a: string, b: string): number {
  const na = normalize(a)
  const nb = normalize(b)
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.85
  // Count common chars
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

/* ─── CSV Parser ────────────────────────────────────────────────────────── */
function parseInventoryCSV(raw: string): ParsedLink[] {
  // Split lines, handle both \r\n and \n
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

  // Row 3 (index 2) = category group headers (e.g. PASTA, Burger with Fries…)
  // Row 4 (index 3) = column headers: Items, Grams/Pc, [menu items…]
  // Rows 5+ (index 4+) = ingredient rows

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

  // Find the header row by locating a cell that literally reads "Items" —
  // its column position tells us where the ingredient-name column is (this
  // shifts between sheets: column A on some exports, column B on others).
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

  // Build a column → category map
  // Category label spans from where it appears until the next non-empty label
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

      links.push({
        ingredientName,
        unitSize,
        menuItemName,
        categoryGroup: colCategoryMap[c] || 'Unknown',
        quantityPerServing: qty,
      })
    }
  }

  return links
}

/* ─── Main Component ────────────────────────────────────────────────────── */
export default function InventoryImportClient({ products, inventoryItems, categories }: Props) {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('upload')
  const [dragOver, setDragOver] = useState(false)
  const [fileName, setFileName] = useState('')
  const [parsedLinks, setParsedLinks] = useState<ParsedLink[]>([])
  const [matchedLinks, setMatchedLinks] = useState<MatchedLink[]>([])
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null)
  const [isCommitting, setIsCommitting] = useState(false)
  const [commitProgress, setCommitProgress] = useState(0)
  const [overwriteMode, setOverwriteMode] = useState<'update' | 'skip'>('update')

  // For manual override in match step
  const [overrideIngredient, setOverrideIngredient] = useState<Record<number, string>>({})
  const [overrideProduct, setOverrideProduct]       = useState<Record<number, string>>({})

  /* ── File handling ─────────────────────────────────────────────────────── */
  const handleFile = useCallback((file: File) => {
    if (!file) return
    setFileName(file.name)

    const reader = new FileReader()
    reader.onload = (e) => {
      const raw = e.target?.result as string
      const links = parseInventoryCSV(raw)
      setParsedLinks(links)
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

  /* ── Match step ────────────────────────────────────────────────────────── */
  function buildMatches() {
    const matched: MatchedLink[] = parsedLinks.map((link, i) => {
      const ingId   = overrideIngredient[i] ?? ''
      const prodId  = overrideProduct[i] ?? ''

      // Auto-match if no override
      const ingMatch  = ingId  ? inventoryItems.find(x => x.id === ingId)  ?? null : bestMatch(link.ingredientName, inventoryItems)
      const prodMatch = prodId ? products.find(x => x.id === prodId) ?? null        : bestMatch(link.menuItemName,   products)

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
    setMatchedLinks(matched)
    setStep('match')
  }

  function applyOverrides() {
    const updated = matchedLinks.map((ml, i) => {
      const ingId  = overrideIngredient[i]
      const prodId = overrideProduct[i]
      const ingMatch  = ingId  ? inventoryItems.find(x => x.id === ingId)  ?? null : inventoryItems.find(x => x.id === ml.inventoryItemId) ?? null
      const prodMatch = prodId ? products.find(x => x.id === prodId) ?? null        : products.find(x => x.id === ml.productId) ?? null
      return {
        ...ml,
        inventoryItemId:   ingMatch?.id   ?? null,
        inventoryItemName: ingMatch?.name ?? null,
        productId:         prodMatch?.id   ?? null,
        productName:       prodMatch?.name ?? null,
        conflictIngredient: !ingMatch,
        conflictProduct:    !prodMatch,
      }
    })
    setMatchedLinks(updated)
    setStep('preview')
  }

  /* ── Commit ────────────────────────────────────────────────────────────── */
  async function commitImport() {
    setIsCommitting(true)
    setCommitProgress(0)

    const validLinks = matchedLinks.filter(ml => ml.inventoryItemId && ml.productId)
    const result: CommitResult = { inserted: 0, updated: 0, skipped: 0, errors: [] }

    for (let i = 0; i < validLinks.length; i++) {
      const ml = validLinks[i]
      setCommitProgress(Math.round(((i + 1) / validLinks.length) * 100))

      try {
        // Check if the link already exists
        const { data: existing } = await supabase
          .from('food_item_menu_links')
          .select('id')
          .eq('inventory_item_id', ml.inventoryItemId!)
          .eq('product_id', ml.productId!)
          .maybeSingle()

        if (existing) {
          if (overwriteMode === 'update') {
            await supabase
              .from('food_item_menu_links')
              .update({ quantity_per_serving: ml.parsed.quantityPerServing })
              .eq('id', existing.id)
            result.updated++
          } else {
            result.skipped++
          }
        } else {
          await supabase
            .from('food_item_menu_links')
            .insert({
              inventory_item_id: ml.inventoryItemId!,
              product_id: ml.productId!,
              quantity_per_serving: ml.parsed.quantityPerServing,
            })
          result.inserted++
        }
      } catch (err: any) {
        result.errors.push(`${ml.inventoryItemName} ↔ ${ml.productName}: ${err.message ?? 'Unknown error'}`)
      }
    }

    setCommitResult(result)
    setIsCommitting(false)
    setStep('done')
  }

  /* ── Helpers ─────────────────────────────────────────────────────────── */
  const conflictCount  = matchedLinks.filter(ml => ml.conflictIngredient || ml.conflictProduct).length
  const validCount     = matchedLinks.filter(ml => ml.inventoryItemId && ml.productId).length
  const skippableCount = matchedLinks.length - validCount

  const groupedByCategory = matchedLinks.reduce<Record<string, MatchedLink[]>>((acc, ml) => {
    const cat = ml.parsed.categoryGroup
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(ml)
    return acc
  }, {})

  /* ─── Styles ────────────────────────────────────────────────────────── */
  const cardStyle: React.CSSProperties = {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-lg)',
    padding: '2rem',
    boxShadow: 'var(--shadow-card)',
  }

  const badgeStyle = (ok: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    padding: '0.15rem 0.6rem',
    borderRadius: 'var(--radius-pill)',
    fontSize: '0.7rem',
    fontWeight: 700,
    background: ok ? 'rgba(76,175,114,0.12)' : 'rgba(192,57,43,0.12)',
    color: ok ? 'var(--color-success)' : 'var(--color-danger-light)',
    border: `1px solid ${ok ? 'rgba(76,175,114,0.3)' : 'rgba(192,57,43,0.3)'}`,
  })

  /* ─── Stepper bar ────────────────────────────────────────────────────── */
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

      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
          <a href="/franchiser/inventory" style={{
            color: 'var(--color-text-muted)', fontSize: '0.85rem',
            display: 'flex', alignItems: 'center', gap: '0.35rem',
          }}>← Back to Inventory</a>
        </div>
        <h1 style={{ margin: 0, color: 'var(--color-text)', fontFamily: 'Playfair Display, serif' }}>
          📥 Recipe Import
        </h1>
        <p style={{ marginTop: '0.4rem', color: 'var(--color-text-muted)' }}>
          Upload the Wildshakes Food & Drinks inventory CSV to link ingredients to POS menu items.
        </p>
      </div>

      {/* Stepper */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0', marginBottom: '2.5rem',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '1rem 1.5rem',
      }}>
        {steps.map((s, i) => {
          const sIdx = stepOrder.indexOf(s.key)
          const done = sIdx < currentIdx
          const active = sIdx === currentIdx
          return (
            <React.Fragment key={s.key}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem', flex: 1 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: done ? 'var(--color-primary)' : active ? 'var(--color-accent)' : 'var(--color-surface-3)',
                  border: `2px solid ${active ? 'var(--color-accent)' : done ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  fontSize: done ? '1rem' : '0.85rem',
                  transition: 'all 0.3s ease',
                  boxShadow: active ? '0 0 12px rgba(212,175,55,0.4)' : 'none',
                }}>
                  {done ? '✓' : s.icon}
                </div>
                <span style={{
                  fontSize: '0.7rem', fontWeight: active ? 700 : 500,
                  color: active ? 'var(--color-accent)' : done ? 'var(--color-primary-light)' : 'var(--color-text-muted)',
                }}>
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div style={{
                  height: 2, flex: 2,
                  background: sIdx < currentIdx ? 'var(--color-primary)' : 'var(--color-border)',
                  transition: 'background 0.3s ease',
                  marginBottom: '1.2rem',
                }} />
              )}
            </React.Fragment>
          )
        })}
      </div>

      {/* ── STEP 1: UPLOAD ────────────────────────────────────────────── */}
      {step === 'upload' && (
        <div style={cardStyle}>
          <h3 style={{ marginBottom: '1.5rem' }}>Upload Inventory CSV</h3>

          <div
            onDrop={onDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? 'var(--color-accent)' : 'var(--color-border)'}`,
              borderRadius: 'var(--radius-lg)',
              padding: '4rem 2rem',
              textAlign: 'center',
              cursor: 'pointer',
              background: dragOver ? 'rgba(212,175,55,0.06)' : 'var(--color-surface-2)',
              transition: 'all 0.2s ease',
            }}
          >
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📄</div>
            <p style={{ color: 'var(--color-text)', fontWeight: 600, marginBottom: '0.5rem' }}>
              Drop your CSV file here, or click to browse
            </p>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
              Accepts: <code style={{ color: 'var(--color-accent)' }}>.csv</code> — the Wildshakes Food &amp; Drinks Inventory export
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={onFileChange}
            style={{ display: 'none' }}
          />

          <div style={{
            marginTop: '1.5rem',
            padding: '1rem',
            background: 'rgba(74,124,89,0.08)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.82rem',
            color: 'var(--color-text-muted)',
          }}>
            <strong style={{ color: 'var(--color-primary-light)' }}>Expected format:</strong> The CSV must have ingredient names in column A, unit sizes in column B, and POS menu item names across row 4, with category groups in row 3. This matches the "Food Output" sheet from the Wildshakes inventory XLSX.
          </div>
        </div>
      )}

      {/* ── STEP 2: PARSE REVIEW ──────────────────────────────────────── */}
      {step === 'parse' && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
            <div>
              <h3 style={{ marginBottom: '0.25rem' }}>Parsed Data Review</h3>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                📄 <strong style={{ color: 'var(--color-text)' }}>{fileName}</strong>
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <span style={{
                background: 'rgba(76,175,114,0.12)', color: 'var(--color-success)',
                border: '1px solid rgba(76,175,114,0.3)',
                borderRadius: 'var(--radius-pill)', padding: '0.3rem 1rem', fontSize: '0.85rem', fontWeight: 700,
              }}>
                {parsedLinks.length.toLocaleString()} recipe links found
              </span>
            </div>
          </div>

          {/* Summary by category */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
            {Object.entries(
              parsedLinks.reduce<Record<string, number>>((acc, l) => {
                acc[l.categoryGroup] = (acc[l.categoryGroup] ?? 0) + 1
                return acc
              }, {})
            ).map(([cat, count]) => (
              <div key={cat} style={{
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem 1rem',
              }}>
                <p style={{ color: 'var(--color-text)', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.2rem' }}>{cat || 'Uncategorized'}</p>
                <p style={{ color: 'var(--color-accent)', fontWeight: 700, fontSize: '1.1rem', margin: 0 }}>{count}</p>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.7rem', margin: 0 }}>links</p>
              </div>
            ))}
          </div>

          {/* Sample table */}
          <div style={{ marginBottom: '1.5rem' }}>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
              Showing first 10 of {parsedLinks.length} links:
            </p>
            <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: 'var(--color-surface-3)' }}>
                    {['Category', 'Menu Item', 'Ingredient', 'Qty/Serving', 'Unit Size'].map(h => (
                      <th key={h} style={{ padding: '0.6rem 0.8rem', textAlign: 'left', color: 'var(--color-text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedLinks.slice(0, 10).map((l, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '0.5rem 0.8rem', color: 'var(--color-text-muted)' }}>{l.categoryGroup}</td>
                      <td style={{ padding: '0.5rem 0.8rem', color: 'var(--color-text)', fontWeight: 500 }}>{l.menuItemName}</td>
                      <td style={{ padding: '0.5rem 0.8rem', color: 'var(--color-text)' }}>{l.ingredientName}</td>
                      <td style={{ padding: '0.5rem 0.8rem', color: 'var(--color-accent)', fontWeight: 700 }}>{l.quantityPerServing}</td>
                      <td style={{ padding: '0.5rem 0.8rem', color: 'var(--color-text-muted)' }}>{l.unitSize ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button onClick={() => setStep('upload')} className="btn btn-ghost btn-sm">← Re-upload</button>
            <button onClick={buildMatches} className="btn btn-primary" style={{ marginLeft: 'auto' }}>
              Run Auto-Match →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: MATCH ─────────────────────────────────────────────── */}
      {step === 'match' && (
        <div>
          <div style={{ ...cardStyle, marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h3 style={{ marginBottom: '0.25rem' }}>Match Review</h3>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                  Review auto-matched items. Fix any <span style={{ color: 'var(--color-danger-light)' }}>❌ unmatched</span> rows before proceeding.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <span style={badgeStyle(true)}>✓ {validCount} matched</span>
                {conflictCount > 0 && <span style={badgeStyle(false)}>✗ {conflictCount} unmatched</span>}
              </div>
            </div>

            {/* Overwrite mode toggle */}
            <div style={{
              background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem',
              display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap',
            }}>
              <span style={{ color: 'var(--color-text-muted)', fontSize: '0.82rem', fontWeight: 600 }}>On duplicate link:</span>
              {(['update', 'skip'] as const).map(mode => (
                <label key={mode} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.82rem' }}>
                  <input
                    type="radio" name="overwrite" value={mode}
                    checked={overwriteMode === mode}
                    onChange={() => setOverwriteMode(mode)}
                    style={{ accentColor: 'var(--color-accent)' }}
                  />
                  <span style={{ color: 'var(--color-text)' }}>
                    {mode === 'update' ? '🔄 Update quantity' : '⏭️ Skip existing'}
                  </span>
                </label>
              ))}
            </div>

            {/* Grouped match table */}
            {Object.entries(groupedByCategory).map(([cat, catLinks]) => (
              <div key={cat} style={{ marginBottom: '1.5rem' }}>
                <div style={{
                  background: 'var(--color-surface-3)', padding: '0.4rem 0.8rem',
                  borderRadius: 'var(--radius-sm)', marginBottom: '0.5rem',
                  fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-accent)',
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                }}>
                  {cat} ({catLinks.length} links)
                </div>
                <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--color-surface-3)' }}>
                        <th style={{ padding: '0.5rem 0.7rem', textAlign: 'left', color: 'var(--color-text-muted)', fontWeight: 600 }}>CSV Ingredient</th>
                        <th style={{ padding: '0.5rem 0.7rem', textAlign: 'left', color: 'var(--color-text-muted)', fontWeight: 600 }}>→ DB Ingredient</th>
                        <th style={{ padding: '0.5rem 0.7rem', textAlign: 'left', color: 'var(--color-text-muted)', fontWeight: 600 }}>CSV Menu Item</th>
                        <th style={{ padding: '0.5rem 0.7rem', textAlign: 'left', color: 'var(--color-text-muted)', fontWeight: 600 }}>→ DB Product</th>
                        <th style={{ padding: '0.5rem 0.7rem', textAlign: 'right', color: 'var(--color-text-muted)', fontWeight: 600 }}>Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {catLinks.map((ml, _i) => {
                        const globalIdx = matchedLinks.indexOf(ml)
                        const rowOk = !ml.conflictIngredient && !ml.conflictProduct
                        return (
                          <tr key={globalIdx} style={{
                            borderTop: '1px solid var(--color-border)',
                            background: rowOk ? 'transparent' : 'rgba(192,57,43,0.05)',
                          }}>
                            {/* CSV Ingredient */}
                            <td style={{ padding: '0.4rem 0.7rem', color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>
                              {ml.parsed.ingredientName}
                            </td>
                            {/* DB Ingredient match / override */}
                            <td style={{ padding: '0.4rem 0.7rem' }}>
                              {ml.conflictIngredient ? (
                                <select
                                  value={overrideIngredient[globalIdx] ?? ''}
                                  onChange={(e) => setOverrideIngredient(prev => ({ ...prev, [globalIdx]: e.target.value }))}
                                  style={{
                                    background: 'var(--color-surface-3)', color: 'var(--color-text)',
                                    border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-sm)',
                                    padding: '0.2rem 0.5rem', fontSize: '0.75rem', width: '100%',
                                  }}
                                >
                                  <option value="">— Select ingredient —</option>
                                  {inventoryItems.map(ii => (
                                    <option key={ii.id} value={ii.id}>{ii.name}</option>
                                  ))}
                                </select>
                              ) : (
                                <span style={{ color: 'var(--color-success)', fontSize: '0.78rem' }}>✓ {ml.inventoryItemName}</span>
                              )}
                            </td>
                            {/* CSV Menu Item */}
                            <td style={{ padding: '0.4rem 0.7rem', color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>
                              {ml.parsed.menuItemName}
                            </td>
                            {/* DB Product match / override */}
                            <td style={{ padding: '0.4rem 0.7rem' }}>
                              {ml.conflictProduct ? (
                                <select
                                  value={overrideProduct[globalIdx] ?? ''}
                                  onChange={(e) => setOverrideProduct(prev => ({ ...prev, [globalIdx]: e.target.value }))}
                                  style={{
                                    background: 'var(--color-surface-3)', color: 'var(--color-text)',
                                    border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-sm)',
                                    padding: '0.2rem 0.5rem', fontSize: '0.75rem', width: '100%',
                                  }}
                                >
                                  <option value="">— Select product —</option>
                                  {products.map(p => (
                                    <option key={p.id} value={p.id}>{p.name} ({p.category})</option>
                                  ))}
                                </select>
                              ) : (
                                <span style={{ color: 'var(--color-success)', fontSize: '0.78rem' }}>✓ {ml.productName}</span>
                              )}
                            </td>
                            {/* Quantity */}
                            <td style={{ padding: '0.4rem 0.7rem', textAlign: 'right', color: 'var(--color-accent)', fontWeight: 700, fontSize: '0.8rem' }}>
                              {ml.parsed.quantityPerServing}
                            </td>
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
              <button onClick={applyOverrides} className="btn btn-primary">
                Preview Import ({validCount} links) →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 4: PREVIEW ───────────────────────────────────────────── */}
      {step === 'preview' && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h3 style={{ marginBottom: '0.25rem' }}>Import Preview</h3>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                Review the final import before committing to the database.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span style={badgeStyle(true)}>✓ {validCount} will be imported</span>
              {skippableCount > 0 && (
                <span style={badgeStyle(false)}>✗ {skippableCount} will be skipped (unmatched)</span>
              )}
            </div>
          </div>

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            {[
              { label: 'Recipe Links', value: validCount, icon: '🔗', color: 'var(--color-success)' },
              { label: 'Skipped (unmatched)', value: skippableCount, icon: '⏭️', color: 'var(--color-warning)' },
              { label: 'Duplicate mode', value: overwriteMode === 'update' ? 'Update qty' : 'Skip', icon: '🔄', color: 'var(--color-info)' },
            ].map(c => (
              <div key={c.label} style={{
                background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)', padding: '1rem',
              }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>{c.icon}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: c.color }}>{c.value}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{c.label}</div>
              </div>
            ))}
          </div>

          {/* Preview table */}
          <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginBottom: '1.5rem', maxHeight: '400px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr style={{ background: 'var(--color-surface-3)' }}>
                  {['Category', 'Menu Item (Product)', 'Ingredient', 'Qty / Serving'].map(h => (
                    <th key={h} style={{ padding: '0.6rem 0.8rem', textAlign: 'left', color: 'var(--color-text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matchedLinks.filter(ml => ml.inventoryItemId && ml.productId).map((ml, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '0.45rem 0.8rem', color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>{ml.parsed.categoryGroup}</td>
                    <td style={{ padding: '0.45rem 0.8rem', color: 'var(--color-text)', fontWeight: 500 }}>{ml.productName}</td>
                    <td style={{ padding: '0.45rem 0.8rem', color: 'var(--color-text)' }}>{ml.inventoryItemName}</td>
                    <td style={{ padding: '0.45rem 0.8rem', color: 'var(--color-accent)', fontWeight: 700, textAlign: 'right' }}>{ml.parsed.quantityPerServing}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'space-between' }}>
            <button onClick={() => setStep('match')} className="btn btn-ghost btn-sm">← Back to Match</button>
            <button
              onClick={commitImport}
              className="btn btn-primary"
              style={{ background: 'var(--color-primary)', fontWeight: 700 }}
            >
              🚀 Commit {validCount} Links to Database
            </button>
          </div>
        </div>
      )}

      {/* ── COMMIT PROGRESS ────────────────────────────────────────────── */}
      {isCommitting && (
        <div style={cardStyle}>
          <h3 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>⏳ Importing…</h3>
          <div style={{ background: 'var(--color-surface-2)', borderRadius: 'var(--radius-pill)', height: '12px', overflow: 'hidden', marginBottom: '1rem' }}>
            <div style={{
              height: '100%', borderRadius: 'var(--radius-pill)',
              background: 'linear-gradient(90deg, var(--color-primary), var(--color-accent))',
              width: `${commitProgress}%`,
              transition: 'width 0.3s ease',
            }} />
          </div>
          <p style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
            {commitProgress}% — writing recipe links to Supabase…
          </p>
        </div>
      )}

      {/* ── STEP 5: DONE ──────────────────────────────────────────────── */}
      {step === 'done' && commitResult && (
        <div style={cardStyle}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ fontSize: '4rem', marginBottom: '0.75rem' }}>🎉</div>
            <h3 style={{ color: 'var(--color-text)', marginBottom: '0.5rem' }}>Import Complete!</h3>
            <p style={{ color: 'var(--color-text-muted)' }}>Recipe links have been saved to Supabase.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            {[
              { label: 'Inserted', value: commitResult.inserted, icon: '✅', color: 'var(--color-success)' },
              { label: 'Updated', value: commitResult.updated, icon: '🔄', color: 'var(--color-info)' },
              { label: 'Skipped', value: commitResult.skipped, icon: '⏭️', color: 'var(--color-text-muted)' },
            ].map(c => (
              <div key={c.label} style={{
                background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)', padding: '1.25rem', textAlign: 'center',
              }}>
                <div style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>{c.icon}</div>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: c.color }}>{c.value}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{c.label}</div>
              </div>
            ))}
          </div>

          {commitResult.errors.length > 0 && (
            <div style={{
              background: 'rgba(192,57,43,0.08)', border: '1px solid rgba(192,57,43,0.3)',
              borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '1.5rem',
            }}>
              <p style={{ color: 'var(--color-danger-light)', fontWeight: 600, marginBottom: '0.5rem' }}>
                ⚠️ {commitResult.errors.length} errors:
              </p>
              <ul style={{ paddingLeft: '1.25rem' }}>
                {commitResult.errors.map((e, i) => (
                  <li key={i} style={{ color: 'var(--color-danger-light)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/franchiser/inventory" className="btn btn-primary">
              📦 Go to Inventory
            </a>
            <button onClick={() => {
              setStep('upload')
              setParsedLinks([])
              setMatchedLinks([])
              setCommitResult(null)
              setFileName('')
              setOverrideIngredient({})
              setOverrideProduct({})
            }} className="btn btn-ghost btn-sm">
              🔄 Import Another File
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
