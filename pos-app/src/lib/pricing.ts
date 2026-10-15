// What an item costs on the till, in the mode the cashier is in.
//
// Every menu item has a normal price and, when it is sold on a delivery app, a price
// for FoodPanda and a price for Grab, set separately by head office. A branch may
// have its own figure for any of the three; a blank branch figure means "same as the
// menu". Pure functions: the menu hook and every picker use these so the number on
// the grid, in the picker and in the cart is always the same one.

export type DeliveryPlatform = 'foodpanda' | 'grab'

export interface PricedLike {
    price: number | string
    foodpanda_price: number | string | null | undefined
    grab_price: number | string | null | undefined
}

/** A branch's own prices for one item; a null column means the menu's price applies. */
export interface BranchPriceRow {
    price: number | string | null
    foodpanda_price: number | string | null
    grab_price: number | string | null
}

/** Numbers arrive from the database as numbers or strings; blanks become null. */
export const toNum = (v: unknown): number | null =>
    v === null || v === undefined || v === '' ? null : Number(v)

/**
 * The platform's price for an item, or null when it is not offered there, in which
 * case the till charges the normal price. Zero is a real price: the item goes out free
 * on that platform (packaging such as a pizza box).
 */
export function deliveryPriceFor(product: PricedLike, platform: DeliveryPlatform | null | undefined): number | null {
    if (!platform) return null
    return toNum(platform === 'foodpanda' ? product.foodpanda_price : product.grab_price)
}

/** The price to show and charge right now: the platform's, or the normal one. */
export function priceFor(product: PricedLike, platform: DeliveryPlatform | null | undefined): number {
    return deliveryPriceFor(product, platform) ?? Number(product.price)
}

/** Apply a branch's own prices to a menu row. */
export function applyBranchPrices<T extends PricedLike>(product: T, own: BranchPriceRow | null | undefined): T & { price: number; foodpanda_price: number | null; grab_price: number | null } {
    return {
        ...product,
        price: toNum(own?.price) ?? Number(product.price),
        foodpanda_price: toNum(own?.foodpanda_price) ?? toNum(product.foodpanda_price),
        grab_price: toNum(own?.grab_price) ?? toNum(product.grab_price),
    }
}
