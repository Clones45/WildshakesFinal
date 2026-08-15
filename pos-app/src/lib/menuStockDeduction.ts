import { db, type LocalTransactionItem } from './db'

/** At or below this many left, the cashier gets a warning on the menu card. */
export const LOW_STOCK_THRESHOLD = 5

export interface MenuStockWarning {
    name: string
    remaining: number
    soldOut: boolean
}

// Instant, fully-offline countdown of the per-branch "N left" a cashier sets in Stock
// Control. Advisory only — it never blocks a sale. The Postgres trigger on
// `transaction_items` is the source of truth once the sale syncs; this keeps the tablet's
// own copy honest in the meantime so the low-stock warning appears immediately and works
// with no signal.
//
// Items with no number set (stock_qty === null) are untracked and left alone.
export async function deductMenuStockForSale(items: LocalTransactionItem[]): Promise<MenuStockWarning[]> {
    const soldItems = items.filter(i => !i.cancelled)
    if (soldItems.length === 0) return []

    // One sale can hold the same product on several lines (different variants)
    const soldByProduct = new Map<string, number>()
    for (const item of soldItems) {
        soldByProduct.set(item.productId, (soldByProduct.get(item.productId) ?? 0) + item.quantity)
    }

    const warnings: MenuStockWarning[] = []

    await db.transaction('rw', db.products, async () => {
        for (const [productId, sold] of soldByProduct) {
            const product = await db.products.get(productId)
            if (!product || product.stock_qty === null || product.stock_qty === undefined) continue

            const remaining = product.stock_qty - sold
            await db.products.update(productId, { stock_qty: remaining })

            if (remaining <= LOW_STOCK_THRESHOLD) {
                warnings.push({ name: product.name, remaining, soldOut: remaining <= 0 })
            }
        }
    })

    return warnings
}
