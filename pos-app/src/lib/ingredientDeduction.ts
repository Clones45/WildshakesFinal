import { db, type LocalTransactionItem } from './db'

export interface LowStockWarning {
    name: string
    remaining: number
    unit: string | null
}

// Instant, fully-offline ingredient deduction — advisory only, never blocks or gates a sale.
// Decrements today's local `ingredientStock.remaining` cache using the recipe links pulled
// down from `food_item_menu_links`, and reports any ingredient that just dropped to or below
// its min_stock_level so the caller can warn the cashier. The Postgres trigger on
// `transaction_items` remains the single source of truth once the sale syncs — this cache is
// purely a local, disposable mirror for instant UX while offline.
export async function deductIngredientsForSale(items: LocalTransactionItem[]): Promise<LowStockWarning[]> {
    const soldItems = items.filter(i => !i.cancelled)
    if (soldItems.length === 0) return []

    const productIds = [...new Set(soldItems.map(i => i.productId))]
    const links = await db.recipeLinks.where('productId').anyOf(productIds).toArray()
    if (links.length === 0) return []

    // Sum grams/pieces consumed per ingredient across the whole sale
    const consumedByIngredient = new Map<string, number>()
    for (const item of soldItems) {
        for (const link of links) {
            if (link.productId !== item.productId) continue
            const prev = consumedByIngredient.get(link.inventoryItemId) ?? 0
            consumedByIngredient.set(link.inventoryItemId, prev + link.quantityPerServing * item.quantity)
        }
    }
    if (consumedByIngredient.size === 0) return []

    const warnings: LowStockWarning[] = []

    await db.transaction('rw', db.ingredientStock, async () => {
        for (const [inventoryItemId, consumed] of consumedByIngredient) {
            const stock = await db.ingredientStock.get(inventoryItemId)
            if (!stock || stock.remaining === null) continue // no starting count logged today — nothing to warn against

            const newRemaining = stock.remaining - consumed
            await db.ingredientStock.update(inventoryItemId, { remaining: newRemaining })

            const min = stock.minStockLevel ?? 0
            if (newRemaining <= min) {
                warnings.push({ name: stock.name, remaining: newRemaining, unit: stock.unit })
            }
        }
    })

    return warnings
}
