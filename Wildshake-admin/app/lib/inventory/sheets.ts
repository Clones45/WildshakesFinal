/**
 * The seven inventory sheets, shared by the franchiser and master-admin inventory pages.
 *
 * Sheets are fixed in code (the apps key their tabs and descriptions off these values);
 * categories inside a sheet are data and can be created, renamed and reordered freely.
 */
export type SheetType =
  | 'food' | 'food_2' | 'production' | 'shake' | 'coffee_general' | 'commissary' | 'commissary_home'

export const SHEET_TYPES: SheetType[] = [
  'food', 'food_2', 'production', 'shake', 'coffee_general', 'commissary', 'commissary_home',
]

/** Sheets whose items are recipe-linked: "Used" is summed from POS sales x amount per serving. */
export const RECIPE_SHEETS: SheetType[] = ['food', 'food_2', 'production', 'shake', 'coffee_general']

export const isSheetType = (s: string): s is SheetType => (SHEET_TYPES as string[]).includes(s)
export const isRecipeSheet = (s: string): boolean => (RECIPE_SHEETS as string[]).includes(s)

export const SHEET_LABELS: Record<SheetType, { label: string; icon: string; color: string; desc: string }> = {
  food:            { label: 'Food Items',       icon: '🍝', color: '#e67e22', desc: 'Everyday food stock you buy and keep on hand — burger, wings and pasta ingredients, sauces, and the like.' },
  food_2:          { label: 'Food 2',           icon: '🍕', color: '#c0392b', desc: 'The rest of your bought food stock — condiments, and the pizza, rice-meal and pastry ingredients.' },
  production:      { label: 'Production',       icon: '⚙️', color: '#607d8b', desc: 'Items the branch prepares in-house — cooked beef and chicken portions, patties, sauces made on site.' },
  shake:           { label: 'Shakes',           icon: '🥤', color: '#d63384', desc: 'Ingredients and cups for the fruit shakes and milkshakes.' },
  coffee_general:  { label: 'Coffee',           icon: '☕', color: '#795548', desc: 'Coffee ingredients, plus general supplies like cups, lids and trays.' },
  commissary:      { label: 'Commissary (CSL)', icon: '🏭', color: '#2980b9', desc: 'Commissary store stock — counted at the central store, not the branch.' },
  commissary_home: { label: 'Commissary Home',  icon: '🏠', color: '#8e44ad', desc: 'Commissary home stock — counted at the central kitchen, not the branch.' },
}

export type StockStatus = 'unset' | 'ok' | 'low' | 'out'

export function getStockStatus(ending: number | null, min: number | null): StockStatus {
  if (ending === null) return 'unset'
  if (ending === 0) return 'out'
  if (min === null || min === 0) return 'ok'
  if (ending <= min) return 'low'
  return 'ok'
}

/** Ending = Starting + Additional - Used, never below zero; null until a starting count exists. */
export function computeEnding(start: number | null, add: number | null, used: number | null): number | null {
  if (start === null) return null
  return Math.max(0, start + (add ?? 0) - (used ?? 0))
}
