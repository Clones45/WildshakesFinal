// Shared-stock rule
// =================
// When a branch puts a count on one menu item, that count SOMETIMES really describes a
// shared thing sitting in the kitchen. "5" on Chicken Wings Solo means five wings — and
// a Large party tray eats five wings at once, so it should read as sold out the moment
// fewer than five remain.
//
// It was first built to fire for any ingredient counted in whole units (portion or
// piece), on the idea that those are the ones where "5 left" means five of a shared
// item. That was too broad: Bun, Patty and Cheese Slice are also piece-counted, so
// setting "4 left" on Beef Burger silently sold out Crispy Chicken Burger and every
// other product touching Bun too — a real report from a franchisee who wanted Beef
// Burger's count to stand on its own.
//
// A bun genuinely IS shared kitchen stock, same as a wing is. The difference is intent:
// "4 left" on Beef Burger is read as a cap on Beef Burger orders, not a claim about how
// many buns are in the kitchen — while "5 left" on Chicken Wings Solo IS meant as a claim
// about the wings themselves, since wings and their trays are just different servings of
// the exact same thing. That distinction can't be inferred from the unit, so the cascade
// now only fires for ingredients named here, not for every portion/piece item.
export const SHAREABLE_INGREDIENT_NAMES: ReadonlySet<string> = new Set([
    'Wings',
])

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
 * @param shareableIngredientIds  inventory_item ids whose name is in
 *   SHAREABLE_INGREDIENT_NAMES — build with the ids actually present, e.g.
 *   `new Set(ingredients.filter(i => SHAREABLE_INGREDIENT_NAMES.has(i.name)).map(i => i.inventoryItemId))`.
 *
 * Returns a map of product id → remaining, where null means "not tracked, sell freely".
 */
export function computeEffectiveStock(
    products: StockProduct[],
    links: StockRecipeLink[],
    shareableIngredientIds: Set<string>,
): Map<string, number | null> {
    const linksByProduct = new Map<string, StockRecipeLink[]>()
    for (const l of links) {
        const list = linksByProduct.get(l.productId)
        if (list) list.push(l)
        else linksByProduct.set(l.productId, [l])
    }

    const isShareable = (ingredientId: string) => shareableIngredientIds.has(ingredientId)

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
