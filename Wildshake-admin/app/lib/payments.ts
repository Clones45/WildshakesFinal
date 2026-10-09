/**
 * What was paid by each method for one sale.
 *
 * A sale paid in one go is all one method. A split sale is broken into its parts
 * so cash goes to Cash and GCash to GCash in every breakdown: a "split" is a way
 * of paying, not a kind of money. Any change comes out of the cash, so the cash
 * part is what is left of the sale after the other methods, never what was
 * handed over. Where a split has no cash part, the parts are made to add up to
 * the sale so no breakdown drifts from the sales total.
 */

export interface PaymentPart { method: string; amount: number }

export interface PaidSale {
  payment_method: string
  total_amount: number | string
  split_payments?: { method: string; amount: number | string }[] | null
}

export function paymentParts(sale: PaidSale): PaymentPart[] {
  const total = Number(sale.total_amount) || 0
  const parts = (sale.split_payments ?? []).filter(p => p && typeof p.method === 'string' && Number.isFinite(Number(p.amount)))
  if (sale.payment_method !== 'split' || parts.length === 0) return [{ method: sale.payment_method, amount: total }]

  const byMethod: Record<string, number> = {}
  for (const p of parts) byMethod[p.method] = (byMethod[p.method] ?? 0) + Number(p.amount)

  const nonCash = Object.entries(byMethod).filter(([m]) => m !== 'cash').reduce((s, [, a]) => s + a, 0)
  if ('cash' in byMethod) {
    byMethod.cash = Math.max(0, total - nonCash)
  } else {
    const drift = total - nonCash
    if (drift !== 0) {
      const last = parts[parts.length - 1].method
      byMethod[last] = (byMethod[last] ?? 0) + drift
    }
  }
  return Object.entries(byMethod).map(([method, amount]) => ({ method, amount: Math.round(amount * 100) / 100 }))
}

/** Add one sale to a method-keyed breakdown, part by part. */
export function addToBreakdown(breakdown: Record<string, number>, sale: PaidSale): void {
  for (const { method, amount } of paymentParts(sale)) {
    breakdown[method] = (breakdown[method] ?? 0) + amount
  }
}

/** "cash ₱100 + gcash ₱40" for a split, or the plain method name. */
export function describePayment(sale: PaidSale): string {
  const parts = paymentParts(sale)
  if (sale.payment_method !== 'split' || parts.length <= 1) return sale.payment_method
  return parts.map(p => `${p.method} ₱${p.amount.toFixed(2)}`).join(' + ')
}
