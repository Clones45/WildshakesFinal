/**
 * Add or replace query values on an address that may already carry some.
 *
 * The branch portal's screens live at their own addresses (/franchiser/sales), but
 * the same screens also sit inside the head office's franchise page, where the
 * address already says which tab is open (/franchises/<id>?tab=sales). A screen that
 * builds its next address with this helper works in both places.
 *
 *   withParams('/franchiser/sales', { month: '2026-10' })            -> '/franchiser/sales?month=2026-10'
 *   withParams('/franchises/x?tab=sales', { month: '2026-10', day: '' }) -> '/franchises/x?tab=sales&month=2026-10'
 *
 * An empty or missing value removes that key.
 */
export function withParams(base: string, params: Record<string, string | null | undefined>): string {
  const q = base.indexOf('?')
  const path = q === -1 ? base : base.slice(0, q)
  const usp = new URLSearchParams(q === -1 ? '' : base.slice(q + 1))
  for (const [key, value] of Object.entries(params)) {
    if (value) usp.set(key, value)
    else usp.delete(key)
  }
  const s = usp.toString()
  return s ? `${path}?${s}` : path
}
