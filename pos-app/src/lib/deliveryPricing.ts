/**
 * deliveryPricing.ts
 *
 * FoodPanda & Grab delivery prices, extracted from "GRAB AND FOOD PANDA.xlsx".
 * These prices override the normal POS prices for delivery orders.
 *
 * Key format for size-based products: "ProductName:Petite" or "ProductName:Grande"
 * Key format for temp-based (coffee):  "ProductName:Hot"   or "ProductName:Iced"
 * Key format for all others:           "ProductName"
 * Key format when a name is shared by
 * more than one menu category:         "Category|ProductName"
 *
 * Pearl add-on: +35 (handled in PearlsPickerModal — price unchanged for delivery)
 */

// ─── Fruitshakes ──────────────────────────────────────────────────────────────
const FRUITSHAKES: Record<string, number> = {
    'Avocado:Petite': 145,                  'Avocado:Grande': 175,
    'Mango:Petite': 145,                    'Mango:Grande': 175,
    'Avo-Mango Combo:Petite': 165,          'Avo-Mango Combo:Grande': 195,
    'Blueberry Creamcheese:Petite': 165,    'Blueberry Creamcheese:Grande': 195,
    'Strawberry Creamcheese:Petite': 165,   'Strawberry Creamcheese:Grande': 195,
    'Durian:Petite': 165,                   'Durian:Grande': 195,
    'Buko:Petite': 145,                     'Buko:Grande': 175,
    'Ube with Cheese:Petite': 165,          'Ube with Cheese:Grande': 195,
    'Matcha Strawberry:Petite': 165,        'Matcha Strawberry:Grande': 195,
    'Melon:Petite': 145,                    'Melon:Grande': 175,
    'Chocolate Strawberry:Petite': 165,     'Chocolate Strawberry:Grande': 195,
    'Guyabano:Petite': 145,                 'Guyabano:Grande': 175,
    'Peach Mango:Petite': 165,              'Peach Mango:Grande': 195,
    'Green Apple and Kiwi:Petite': 165,     'Green Apple and Kiwi:Grande': 195,
    'Salted Mango Caramel:Petite': 165,     'Salted Mango Caramel:Grande': 195,
    'Buko Pandan:Petite': 165,              'Buko Pandan:Grande': 195,
    'Watermelon:Petite': 165,               'Watermelon:Grande': 195,
}

// ─── Milkshakes ───────────────────────────────────────────────────────────────
const MILKSHAKES: Record<string, number> = {
    'Chocolate Kisses:Petite': 145,         'Chocolate Kisses:Grande': 175,
    'Oreo Milo:Petite': 145,               'Oreo Milo:Grande': 175,
    'Cookies and Cream:Petite': 145,        'Cookies and Cream:Grande': 175,
    'Strawberry:Petite': 145,              'Strawberry:Grande': 175,
    'Salted Caramel:Petite': 145,          'Salted Caramel:Grande': 175,
    'Matcha:Petite': 145,                  'Matcha:Grande': 175,
    'Coffee Crumble:Petite': 145,          'Coffee Crumble:Grande': 175,
    'Dark Mocha:Petite': 145,              'Dark Mocha:Grande': 175,
    'Matcha Oreo:Petite': 165,             'Matcha Oreo:Grande': 195,
    'Cappuccino:Petite': 145,              'Cappuccino:Grande': 175,
}

// ─── Coffee ───────────────────────────────────────────────────────────────────
const COFFEE: Record<string, number> = {
    'Americano:Hot': 120,               'Americano:Cold': 140,
    'Cafe Latte:Hot': 150,              'Cafe Latte:Cold': 160,
    'Cappuccino:Hot': 150,              'Cappuccino:Cold': 160,
    'Spanish Latte:Hot': 155,           'Spanish Latte:Cold': 165,
    'White Chocolate Mocha:Hot': 155,   'White Chocolate Mocha:Cold': 165,
    'Dark Chocolate Mocha:Hot': 155,    'Dark Chocolate Mocha:Cold': 165,
    'Matcha Espresso Fusion:Hot': 170,  'Matcha Espresso Fusion:Cold': 180,
    'Matcha Latte:Hot': 155,            'Matcha Latte:Cold': 165,
    'Vanilla Latte:Hot': 155,           'Vanilla Latte:Cold': 165,
    'Caramel Latte:Hot': 155,           'Caramel Latte:Cold': 165,
    'Caramel Macchiato:Hot': 170,       'Caramel Macchiato:Cold': 180,
    'Hazelnut:Hot': 155,                'Hazelnut:Cold': 165,
}

// ─── Pasta ────────────────────────────────────────────────────────────────────
const PASTA: Record<string, number> = {
    'Creamy Carbonara': 185,
    'Classic Pesto': 185,
    'Spaghetti with Meatballs': 185,
    'Cream Black Truffle': 205,
    'Wild Specialty Spaghetti': 195,
    'Aglio e Olio': 195,
    'Baked Mac': 215,
    'Lasagna': 245,
}

// ─── Chicken Wings ────────────────────────────────────────────────────────────
const CHICKEN_WINGS: Record<string, number> = {
    'Buffalo Wings with Fries': 210,
    'Soy Garlic Wings with Fries': 210,
    'Garlic Parmesan Wings with Fries': 210,
    'Honey Sriracha Wings with Fries': 210,
    'BBQ Wings with Fries': 210,
    // Scoped: "Chicken Poppers" also exists as a rice meal, which is not on the delivery list
    'Chicken Wings|Chicken Poppers': 210,
    'Chicken Wings Solo (Any Flavor)': 180,
}

// ─── Burger and Fries ─────────────────────────────────────────────────────────
const BURGER_FRIES: Record<string, number> = {
    'Beef Burger': 135,
    'Beef Burger with Fries': 165,
    'Crispy Chicken Burger': 135,
    'Crispy Chicken Burger with Fries': 150,
    'Fries Solo': 110,
    'Fries Large': 150,
    'Fries With Cheesy Beef': 175,
}

// ─── Tortilla Pizza ───────────────────────────────────────────────────────────
// The price sheet writes these with a "Pizza" suffix; the menu does not. Keys are
// scoped by category because "Cream Black Truffle" is also a pasta and a party tray.
const TORTILLA_PIZZA: Record<string, number> = {
    'Tortilla Pizza|Tripple Cheese': 200,
    'Tortilla Pizza|Classic Meat': 240,
    'Tortilla Pizza|Creamy Spinach Dip': 250,
    'Tortilla Pizza|Cream Black Truffle': 250,
}

// ─── Pica Pica ────────────────────────────────────────────────────────────────
const PICA_PICA: Record<string, number> = {
    'Cheese Sticks': 165,
    'Nachos Cheese': 195,
    'Nachos Beef in White Sauce': 245,
    'Nachos Overload': 265,
    'Quesadilla Beef': 190,
    'Quesadilla Mixed Cheese': 170,
    'Quesadilla Salpicao': 190,
}

// ─── Rice Meals ───────────────────────────────────────────────────────────────
const RICE_MEALS: Record<string, number> = {
    'Creamy Beef with Mushroom': 185,
    'Beef Tapa': 185,
    'Chicken ala King': 185,
    'Steak Burger Au Jus': 185,
    'Swedish Meatballs': 185,
    'Beef Salpicao': 185,
    'Extra Rice': 35,
    // The sheet lists one line, "Savory Chicken Wings 185", covering every wings rice meal
    'Chicken Wings Rice Meals|Buffalo Wings': 185,
    'Chicken Wings Rice Meals|Soy Garlic Wings': 185,
    'Chicken Wings Rice Meals|Honey Sriracha Wings': 185,
    'Chicken Wings Rice Meals|BBQ Wings': 185,
    'Chicken Wings Rice Meals|Garlic Parmesan Wings': 185,
}

// ─── Combined master map ──────────────────────────────────────────────────────
export const DELIVERY_PRICES: Record<string, number> = {
    ...FRUITSHAKES,
    ...MILKSHAKES,
    ...COFFEE,
    ...PASTA,
    ...CHICKEN_WINGS,
    ...BURGER_FRIES,
    ...TORTILLA_PIZZA,
    ...PICA_PICA,
    ...RICE_MEALS,
}

/**
 * Menu categories that do not appear on the FoodPanda / Grab price sheet at all.
 *
 * These must never fall through to a plain-name lookup: a Party Tray shares its name
 * with the single-serving pasta ("Creamy Carbonara" is both a P170 plate and a P885
 * tray), so a name-only match would ring up a tray at the price of one plate.
 * Returning null here makes them fall back to the normal menu price instead.
 */
const NO_DELIVERY_CATEGORIES = new Set([
    'Party Tray Small (3-4)',
    'Party Tray Large (8-10)',
])

/**
 * Returns the delivery price for a product, or null if not found (use normal price).
 * @param productName  Exact product name from the products table
 * @param qualifier    "Petite" | "Grande" | "Hot" | "Cold" — for size/temp-based items
 * @param category     Product category. Always pass it when available: several names are
 *                     shared across categories at very different prices.
 */
export function getDeliveryPrice(productName: string, qualifier?: string, category?: string): number | null {
    if (category) {
        // Category-scoped key wins over the plain name
        const scoped = `${category}|${productName}`
        if (scoped in DELIVERY_PRICES) return DELIVERY_PRICES[scoped]
        if (NO_DELIVERY_CATEGORIES.has(category)) return null
    }
    // Try qualified key next (e.g. "Mango:Petite")
    if (qualifier) {
        const key = `${productName}:${qualifier}`
        if (key in DELIVERY_PRICES) return DELIVERY_PRICES[key]
    }
    // Try plain name (non-size/non-temp items)
    if (productName in DELIVERY_PRICES) return DELIVERY_PRICES[productName]
    return null
}

/** True if a product has any delivery price override */
export function hasDeliveryPrice(productName: string, category?: string): boolean {
    if (category) {
        if (`${category}|${productName}` in DELIVERY_PRICES) return true
        if (NO_DELIVERY_CATEGORIES.has(category)) return false
    }
    return Object.keys(DELIVERY_PRICES).some(k => k === productName || k.startsWith(productName + ':'))
}
