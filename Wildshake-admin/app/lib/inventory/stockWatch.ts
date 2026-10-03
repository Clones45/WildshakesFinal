/**
 * Stock Watch: what a branch needs to restock, ranked by urgency.
 *
 * Pure: takes the rows a page already loads (items, categories, this branch's
 * daily logs for the look-back window, recipe links, products) and returns a
 * ranked list with a plain-language reason for each line.
 *
 * How stock on hand is worked out
 *   The till writes a Used figure for every ingredient sold, every trading day,
 *   but staff enter a starting count only now and then. So an item counted today
 *   is judged on today's sheet, and an item not counted today is judged on its
 *   last count inside COUNT_LOOKBACK_DAYS with everything sold (and added) since
 *   taken off. Such a line carries `asOf`, the date of that count, and the panel
 *   says it is an estimate. An item with no count in the window is reported in
 *   `unknown` and left out.
 *
 * How daily use is worked out
 *   Average of the item's Used figures over the USAGE_DAYS days before today,
 *   divided by the branch's trading days in that window (days with any Used
 *   figure at all). A day the branch traded but sold none of the item counts as
 *   zero use, which is what happened. Sheets with no Used figures (commissary)
 *   get no rate and no "running out soon" line.
 *
 * Four levels, most urgent first
 *   out     - stock on hand is zero. Menu items that use it are hidden on the till.
 *   low     - stock on hand is at or below the item's minimum.
 *   soon    - above minimum, but at the daily rate it is gone within SOON_DAYS days.
 *   recount - the estimate says out or low, yet the item still sold on the branch's
 *             latest trading day, so stock was added without being written down.
 *             Nothing can be said about the real level until it is counted again;
 *             these are listed by daily use so the ones that matter get counted first.
 *
 * The suggested top-up brings the item back to its minimum, or to COVER_DAYS of
 * normal use if that is more, so a fast-moving item is not topped up to a
 * minimum it will burn through by tomorrow.
 */
import { computeEnding, getStockStatus, isSheetType, SHEET_LABELS, byName } from './sheets'
import { manilaDay } from '../manila'

export const COUNT_LOOKBACK_DAYS = 30
export const USAGE_DAYS = 7
export const SOON_DAYS = 2
export const COVER_DAYS = 3

export interface WatchItem { id: string; category_id: string; name: string; unit: string | null; min_stock_level: number | null }
export interface WatchCategory { id: string; sheet_type: string }
export interface WatchLog {
  inventory_item_id: string
  log_date: string
  starting_stock: number | null
  additional_stock: number | null
  used_stock: number | null
}
export interface WatchLink { inventory_item_id: string; product_id: string }
export interface WatchProduct { id: string; name: string }

export type AlertLevel = 'out' | 'low' | 'soon' | 'recount'

export interface StockAlert {
  itemId: string
  name: string
  unit: string | null
  sheetType: string
  sheetLabel: string
  level: AlertLevel
  /** Stock on hand: today's ending, or the last count with sales since taken off. Meaningless for a recount line. */
  ending: number
  min: number | null
  /** yyyy-mm-dd of the count the estimate starts from; null when today's sheet has the count. */
  asOf: string | null
  /** Amount to get back to the minimum, or to COVER_DAYS of normal use if that is more. Null when there is nothing to go on. */
  topUp: number | null
  /** Average used per trading day over the last USAGE_DAYS days; null when the branch has no Used figures in that window. */
  avgDailyUse: number | null
  /** Days of stock left at that rate; null when the rate is unknown or zero. */
  daysLeft: number | null
  /** Menu items whose recipe uses this ingredient. */
  menuItems: string[]
  reason: string
}

export interface StockWatch {
  day: string
  /** Items the branch sees on its sheets. */
  total: number
  /** Items with a starting count today. */
  counted: number
  /** Items judged from an earlier count with sales since taken off. */
  fromEarlier: number
  /** Items with no count in the look-back window; they do not appear in alerts. */
  unknown: number
  out: number
  low: number
  soon: number
  recount: number
  /** yyyy-mm-dd of the latest day the till recorded any use, or null. */
  lastTradingDay: string | null
  alerts: StockAlert[]
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** "12", "0.5", "1234.5" - whole numbers without a decimal, otherwise one decimal. */
export const fmtQty = (n: number): string => (Number.isInteger(n) ? String(n) : String(round1(n)))

/** "under a day", "1 day", "1.5 days". */
export const fmtDays = (d: number): string => {
  if (d < 1) return 'under a day'
  const r = round1(d)
  return `${r} day${r === 1 ? '' : 's'}`
}

/** yyyy-mm-dd shifted by n days, in Manila. */
export const shiftDay = (day: string, n: number): string =>
  manilaDay(new Date(`${day}T12:00:00+08:00`).getTime() + n * 86_400_000)

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function buildStockWatch(input: {
  day: string
  items: WatchItem[]
  categories: WatchCategory[]
  logs: WatchLog[]
  links?: WatchLink[]
  products?: WatchProduct[]
}): StockWatch {
  const { day } = input
  const usageFrom = shiftDay(day, -USAGE_DAYS)
  const lookbackFrom = shiftDay(day, -COUNT_LOOKBACK_DAYS)

  const sheetOf = new Map(input.categories.map(c => [c.id, c.sheet_type]))
  const productName = new Map((input.products ?? []).map(p => [p.id, p.name]))
  const menuByItem = new Map<string, string[]>()
  for (const l of input.links ?? []) {
    const name = productName.get(l.product_id)
    if (!name) continue
    const arr = menuByItem.get(l.inventory_item_id) ?? []
    if (!arr.includes(name)) arr.push(name)
    menuByItem.set(l.inventory_item_id, arr)
  }

  // Logs per item, newest first, inside the look-back window. Trading days are
  // the days the till recorded any use at all in the usage window; the latest
  // trading day (today included) is the day that proves an item is still selling.
  const logsOf = new Map<string, WatchLog[]>()
  const tradingDays = new Set<string>()
  let lastTradingDay: string | null = null
  for (const l of input.logs) {
    if (l.log_date < lookbackFrom || l.log_date > day) continue
    const arr = logsOf.get(l.inventory_item_id) ?? []
    arr.push(l)
    logsOf.set(l.inventory_item_id, arr)
    if (l.used_stock !== null && l.used_stock > 0) {
      if (l.log_date >= usageFrom && l.log_date < day) tradingDays.add(l.log_date)
      if (lastTradingDay === null || l.log_date > lastTradingDay) lastTradingDay = l.log_date
    }
  }
  for (const arr of logsOf.values()) arr.sort((a, b) => (a.log_date < b.log_date ? 1 : a.log_date > b.log_date ? -1 : 0))

  const watch: StockWatch = {
    day, total: input.items.length,
    counted: 0, fromEarlier: 0, unknown: 0, out: 0, low: 0, soon: 0, recount: 0, lastTradingDay, alerts: [],
  }

  for (const item of input.items) {
    const logs = logsOf.get(item.id) ?? []

    const avgDailyUse = tradingDays.size === 0 ? null
      : logs.filter(l => l.log_date >= usageFrom && l.log_date < day).reduce((s, l) => s + (l.used_stock ?? 0), 0) / tradingDays.size

    // Stock on hand: today's sheet if it has a starting count, otherwise the last
    // count in the window with everything used (and added) since taken off.
    const today = logs.find(l => l.log_date === day)
    let ending = computeEnding(today?.starting_stock ?? null, today?.additional_stock ?? null, today?.used_stock ?? null)
    let asOf: string | null = null
    if (ending === null) {
      const last = logs.find(l => l.log_date < day && l.starting_stock !== null)
      if (!last) { watch.unknown++; continue }
      const base = computeEnding(last.starting_stock, last.additional_stock, last.used_stock) as number
      const since = logs.filter(l => l.log_date > last.log_date)
      const usedSince = since.reduce((s, l) => s + (l.used_stock ?? 0), 0)
      const addedSince = since.reduce((s, l) => s + (l.additional_stock ?? 0), 0)
      ending = Math.max(0, base + addedSince - usedSince)
      asOf = last.log_date
      watch.fromEarlier++
    } else {
      watch.counted++
    }

    const status = getStockStatus(ending, item.min_stock_level)
    const daysLeft = avgDailyUse !== null && avgDailyUse > 0 ? ending / avgDailyUse : null
    // An estimate that says out or low, for an item that still sold on the latest
    // trading day, is a stale count rather than an empty shelf.
    const stillSelling = asOf !== null && lastTradingDay !== null
      && logs.some(l => l.log_date === lastTradingDay && l.used_stock !== null && l.used_stock > 0)
    const level: AlertLevel | null =
      (status === 'out' || status === 'low') && stillSelling ? 'recount'
      : status === 'out' ? 'out'
      : status === 'low' ? 'low'
      : daysLeft !== null && daysLeft < SOON_DAYS ? 'soon'
      : null
    if (!level) continue

    const min = item.min_stock_level
    const target = Math.max(min ?? 0, avgDailyUse !== null ? avgDailyUse * COVER_DAYS : 0)
    const topUp = level === 'recount' ? null : target > 0 ? Math.max(0, round1(target - ending)) : null
    const menuItems = menuByItem.get(item.id) ?? []
    const u = item.unit ? ` ${item.unit}` : ''
    const rate = avgDailyUse !== null && avgDailyUse > 0 ? `${fmtQty(round1(avgDailyUse))}${u} a day` : ''
    const useNote = rate ? ` Uses about ${rate}.` : ''

    let reason: string
    if (level === 'recount') {
      reason = `Last counted ${asOf}. By the sales since it should be ${status === 'out' ? 'gone' : 'below minimum'}, yet it still sold ${lastTradingDay === day ? 'today' : 'on the last trading day'}, so stock came in without being written down. Count it to get a true figure.`
        + useNote
    } else if (level === 'out') {
      reason = 'Nothing left.'
        + (menuItems.length ? ` ${plural(menuItems.length, 'menu item')} hidden on the till until it is restocked.` : '')
        + useNote
    } else if (level === 'low') {
      reason = `${fmtQty(ending)}${u} left, minimum is ${fmtQty(min ?? 0)}.` + useNote
    } else {
      reason = `Above minimum, but at about ${rate} it runs out in ${fmtDays(daysLeft as number)}.`
    }

    const sheetType = sheetOf.get(item.category_id) ?? ''
    watch.alerts.push({
      itemId: item.id, name: item.name, unit: item.unit, sheetType,
      sheetLabel: isSheetType(sheetType) ? SHEET_LABELS[sheetType].label : sheetType,
      level, ending: round1(ending), min, asOf, topUp,
      avgDailyUse: avgDailyUse === null ? null : round1(avgDailyUse),
      daysLeft: level === 'recount' || daysLeft === null ? null : round1(daysLeft),
      menuItems, reason,
    })
    watch[level]++
  }

  // Most urgent first: out, low, soon, then recount. Within out, the one that hides
  // the most menu items; within low, the one furthest below its minimum; within
  // soon, the one with the fewest days left; within recount, the one the branch
  // uses most. Ties go A to Z.
  const rank: Record<AlertLevel, number> = { out: 0, low: 1, soon: 2, recount: 3 }
  const ratio = (a: StockAlert) => (a.min ? a.ending / a.min : 0)
  watch.alerts.sort((a, b) =>
    rank[a.level] - rank[b.level]
    || (a.level === 'out' ? b.menuItems.length - a.menuItems.length : 0)
    || (a.level === 'low' ? ratio(a) - ratio(b) : 0)
    || (a.level === 'soon' ? (a.daysLeft ?? 99) - (b.daysLeft ?? 99) : 0)
    || (a.level === 'recount' ? (b.avgDailyUse ?? 0) - (a.avgDailyUse ?? 0) : 0)
    || byName(a, b))

  return watch
}
