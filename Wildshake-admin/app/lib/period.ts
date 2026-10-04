/**
 * The day-or-month choice behind the portal's calendar (Transaction History).
 *
 * Pure functions on yyyy-mm and yyyy-mm-dd strings, the same on the server and in
 * the browser. Calendar arithmetic only: no clock and no time zone, so a day never
 * shifts whatever zone the server (UTC on Vercel) or the browser is on.
 */

const pad2 = (n: number) => String(n).padStart(2, '0')
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** True for a yyyy-mm-dd that exists on the calendar (no 31 April, no 29 February 2026). */
export function isRealDay(ymd: string): boolean {
  if (!DAY_RE.test(ymd)) return false
  const [y, m, d] = ymd.split('-').map(Number)
  return m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** The calendar day `by` days after a yyyy-mm-dd (before it when `by` is negative). */
export function shiftDay(ymd: string, by: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + by)).toISOString().slice(0, 10)
}

/** First instant of a month and of the month after it, in Manila time. Half-open: start <= t < end. */
export function manilaMonthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number)
  const nextY = m === 12 ? y + 1 : y
  const nextM = m === 12 ? 1 : m + 1
  return {
    start: `${y}-${pad2(m)}-01T00:00:00+08:00`,
    end: `${nextY}-${pad2(nextM)}-01T00:00:00+08:00`,
  }
}

/**
 * Which day or month to show, from a page's ?month= and ?day= values.
 *   a real day, up to today   -> that day, in its own month
 *   a month, up to this one   -> the whole month (day '')
 *   anything else, or nothing -> today
 * The server uses it to choose which month to fetch, and the browser to read the
 * address bar, so the two always agree.
 */
export function resolvePeriod(monthParam: unknown, dayParam: unknown, today: string): { month: string; day: string } {
  if (typeof dayParam === 'string' && isRealDay(dayParam) && dayParam <= today) {
    return { month: dayParam.slice(0, 7), day: dayParam }
  }
  if (typeof monthParam === 'string' && MONTH_RE.test(monthParam) && monthParam <= today.slice(0, 7)) {
    return { month: monthParam, day: '' }
  }
  return { month: today.slice(0, 7), day: today }
}
