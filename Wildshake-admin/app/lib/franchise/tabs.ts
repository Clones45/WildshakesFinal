/**
 * The tabs of the head office's franchise page: one for each screen of the branch
 * owner's portal, in the same order as the owner's menu, so the master admin sees
 * everything a franchise sees.
 */
export const FRANCHISE_TABS = [
  { id: 'dashboard',     label: '📊 Dashboard' },
  { id: 'sales',         label: '📈 Sales Report' },
  { id: 'transactions',  label: '🧾 Transactions' },
  { id: 'inventory',     label: '📦 Inventory' },
  { id: 'menu',          label: '🍹 Menu Availability' },
  { id: 'staff',         label: '👥 Staff' },
  { id: 'pos_device',    label: '🖥️ POS Device' },
  { id: 'announcements', label: '📣 Announcements' },
] as const

export type FranchiseTab = (typeof FRANCHISE_TABS)[number]['id']

/** The tab an address asks for; unknown values open the Dashboard. */
export function resolveFranchiseTab(value: unknown): FranchiseTab {
  if (value === 'stock') return 'menu' // the tab's old name, kept for saved links
  return FRANCHISE_TABS.some(t => t.id === value) ? (value as FranchiseTab) : 'dashboard'
}
