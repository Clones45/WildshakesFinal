/**
 * CSV exports for inventory, shared by the franchiser and master-admin pages.
 *
 * Pure functions: they take the same rows the pages already hold and return text.
 * Files open cleanly in Excel (UTF-8 byte-order mark, CRLF line endings, quoted cells).
 */
import { SHEET_TYPES, SHEET_LABELS, getStockStatus, computeEnding, isSheetType, byName } from './sheets'

export interface CsvCategory { id: string; name: string; sheet_type: string; sort_order: number }
export interface CsvItem {
  id: string
  category_id: string
  name: string
  unit: string | null
  min_stock_level: number | null
  sort_order: number
  is_active?: boolean
}
export interface CsvLog {
  inventory_item_id: string
  starting_stock: number | null
  additional_stock: number | null
  used_stock: number | null
  notes?: string | null
}
export interface CsvLink { inventory_item_id: string; product_id: string; quantity_per_serving?: number | null }
export interface CsvProduct { id: string; name: string; category?: string }
export interface CsvBranch { id: string; name: string }

/** One cell: quoted when it holds a comma, quote or line break. */
export const csvCell = (v: unknown): string => {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const toCsv = (header: string[], rows: unknown[][]): string =>
  '﻿' + [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n'

/** "Wildshake Gensa - Main" -> "Wildshake-Gensa-Main": one dash per run of anything else. */
export const safeFilename = (s: string): string =>
  s.trim().replace(/[^A-Za-z0-9._]+/g, '-').replace(/^-+|-+$/g, '') || 'export'

const STATUS_LABEL = { unset: 'Not counted', ok: 'OK', low: 'Low', out: 'Out' } as const

/** Categories keep the order head office set for them; items inside them are A to Z (byName). */
const bySort = <T extends { sort_order: number; name: string }>(a: T, b: T) =>
  a.sort_order - b.sort_order || a.name.localeCompare(b.name)

function recipeIndex(links: CsvLink[], products: CsvProduct[], unitOf: Map<string, string | null>): Map<string, string> {
  // Petite and Grande shakes share a name: when a name repeats, add the category so the
  // file reads "Avocado - Fruitshakes Petite (1 pc)" rather than the same words twice.
  const nameCount = new Map<string, number>()
  for (const p of products) nameCount.set(p.name, (nameCount.get(p.name) ?? 0) + 1)
  const nameOf = new Map(products.map(p => [p.id, (nameCount.get(p.name) ?? 0) > 1 && p.category ? `${p.name} - ${p.category}` : p.name]))
  const parts = new Map<string, string[]>()
  for (const l of links) {
    const name = nameOf.get(l.product_id) ?? 'Unknown menu item'
    const q = l.quantity_per_serving
    const unit = unitOf.get(l.inventory_item_id)
    const text = q === null || q === undefined ? name : `${name} (${q}${unit ? ' ' + unit : ''})`
    const arr = parts.get(l.inventory_item_id) ?? []
    arr.push(text)
    parts.set(l.inventory_item_id, arr)
  }
  return new Map([...parts].map(([k, v]) => [k, v.sort().join(' | ')]))
}

/** Sheets in display order, followed by any sheet type the code does not know (never silently dropped). */
function sheetOrder(categories: CsvCategory[]): string[] {
  const known: string[] = [...SHEET_TYPES]
  const extra = [...new Set(categories.map(c => c.sheet_type))].filter(s => !isSheetType(s)).sort()
  return [...known, ...extra]
}
const sheetLabel = (s: string) => (isSheetType(s) ? SHEET_LABELS[s].label : s)

// ---------------------------------------------------------------------------
// Daily sheet: one row per item the branch sees, with that day's counts
// ---------------------------------------------------------------------------

export const SHEET_CSV_HEADER = [
  'Branch', 'Date', 'Sheet', 'Category', 'Item', 'Unit', 'Minimum',
  'Starting', 'Additional', 'Used', 'Ending', 'Status', 'Recipe (menu items)', 'Notes',
]

export function buildSheetRows(input: {
  branchName: string
  day: string
  categories: CsvCategory[]
  items: CsvItem[]
  logs: CsvLog[]
  links?: CsvLink[]
  products?: CsvProduct[]
}): unknown[][] {
  const logByItem = new Map(input.logs.map(l => [l.inventory_item_id, l]))
  const unitOf = new Map(input.items.map(i => [i.id, i.unit]))
  const recipes = recipeIndex(input.links ?? [], input.products ?? [], unitOf)
  const cats = [...input.categories].sort(bySort)
  const items = input.items.filter(i => i.is_active !== false).sort(byName)
  const rows: unknown[][] = []
  for (const sheet of sheetOrder(cats)) {
    for (const cat of cats.filter(c => c.sheet_type === sheet)) {
      for (const item of items.filter(i => i.category_id === cat.id)) {
        const log = logByItem.get(item.id)
        const ending = computeEnding(log?.starting_stock ?? null, log?.additional_stock ?? null, log?.used_stock ?? null)
        const status = getStockStatus(ending, item.min_stock_level)
        rows.push([
          input.branchName, input.day, sheetLabel(sheet), cat.name, item.name, item.unit ?? '', item.min_stock_level ?? '',
          log?.starting_stock ?? '', log?.additional_stock ?? '', log?.used_stock ?? '', ending ?? '',
          STATUS_LABEL[status], recipes.get(item.id) ?? '', log?.notes ?? '',
        ])
      }
    }
  }
  return rows
}

// ---------------------------------------------------------------------------
// Item list (setup): every item with its branches and recipe
// ---------------------------------------------------------------------------

export const ITEMS_CSV_HEADER = ['Sheet', 'Category', 'Item', 'Unit', 'Minimum', 'Status', 'Branches', 'Recipe (menu items)']

export function buildItemsRows(input: {
  categories: CsvCategory[]
  items: CsvItem[]
  branches: CsvBranch[]
  itemBranches: Record<string, string[]>
  links: CsvLink[]
  products: CsvProduct[]
}): unknown[][] {
  const branchName = new Map(input.branches.map(b => [b.id, b.name]))
  const unitOf = new Map(input.items.map(i => [i.id, i.unit]))
  const recipes = recipeIndex(input.links, input.products, unitOf)
  const cats = [...input.categories].sort(bySort)
  const items = [...input.items].sort(byName)
  const rows: unknown[][] = []
  for (const sheet of sheetOrder(cats)) {
    for (const cat of cats.filter(c => c.sheet_type === sheet)) {
      for (const item of items.filter(i => i.category_id === cat.id)) {
        // A tag left behind by a deleted branch has no name to show; leave it out rather than print an id.
        const branches = (input.itemBranches[item.id] ?? []).map(id => branchName.get(id)).filter((n): n is string => !!n).sort().join(' | ')
        rows.push([
          sheetLabel(sheet), cat.name, item.name, item.unit ?? '', item.min_stock_level ?? '',
          item.is_active === false ? 'Retired' : 'Active', branches, recipes.get(item.id) ?? '',
        ])
      }
    }
  }
  return rows
}

// ---------------------------------------------------------------------------
// Browser download (client components only)
// ---------------------------------------------------------------------------

export function downloadCsv(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoking at once can cancel the download in some browsers; give it a moment.
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}
