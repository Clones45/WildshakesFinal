// Shared-stock rule
// =================
// When a branch puts a count on one menu item, that count often really describes a
// shared thing sitting in the kitchen. "5" on Chicken Wings Solo means five wings —
// and a Large party tray eats five wings at once, so it should read as sold out the
// moment fewer than five remain.
//
// The cascade is deliberately limited to ingredients counted in whole units (portion
// and piece). Those are the ones where "5 left" genuinely means five of a shared item.
// Ingredients measured by weight are excluded on purpose: a count of 2 on a pasta dish
// would otherwise imply "60 g of butter" and take out every other dish using butter —
// half the menu gone mid-service for no visible reason.

/** Units whose counts describe whole shared items rather than a weight. */
const SHAREABLE_UNITS = new Set(['portion', 'pc'])

export interface StockProduct {
    id: string
    /** The branch's own remaining count from Stock Control. null = untracked. */
    stock_qty?: number | null
}

export interface StockRecipeLink {
    productId: string
    inventoryItemId: string
    quantityPerServing: number
}

/**
 * Works out how many of each product can still be sold, given both its own count and
 * any shared ingredient a counted product implies a budget for.
 *
 * Returns a map of product id → remaining, where null means "not tracked, sell freely".
 */
export function computeEffectiveStock(
    products: StockProduct[],
    links: StockRecipeLink[],
    unitByIngredient: Map<string, string | null>,
): Map<string, number | null> {
    const linksByProduct = new Map<string, StockRecipeLink[]>()
    for (const l of links) {
        const list = linksByProduct.get(l.productId)
        if (list) list.push(l)
        else linksByProduct.set(l.productId, [l])
    }

    const isShareable = (ingredientId: string) => {
        const unit = unitByIngredient.get(ingredientId)
        return unit !== undefined && unit !== null && SHAREABLE_UNITS.has(unit)
    }

    // 1. A counted product implies how much of each shared ingredient is left.
    //    Where several counted products point at the same ingredient, believe the
    //    smallest — it is the safest reading.
    const budget = new Map<string, number>()
    for (const p of products) {
        const own = p.stock_qty
        if (own === null || own === undefined) continue
        for (const l of linksByProduct.get(p.id) ?? []) {
            if (!isShareable(l.inventoryItemId) || l.quantityPerServing <= 0) continue
            const implied = own * l.quantityPerServing
            const current = budget.get(l.inventoryItemId)
            budget.set(l.inventoryItemId, current === undefined ? implied : Math.min(current, implied))
        }
    }

    // 2. Every product is then limited by its own count and by each shared ingredient
    //    it draws on — whichever runs out first.
    const effective = new Map<string, number | null>()
    for (const p of products) {
        const caps: number[] = []
        if (p.stock_qty !== null && p.stock_qty !== undefined) caps.push(p.stock_qty)

        for (const l of linksByProduct.get(p.id) ?? []) {
            const available = budget.get(l.inventoryItemId)
            if (available === undefined || l.quantityPerServing <= 0) continue
            caps.push(Math.floor(available / l.quantityPerServing))
        }

        effective.set(p.id, caps.length === 0 ? null : Math.min(...caps))
    }
    return effective
}
