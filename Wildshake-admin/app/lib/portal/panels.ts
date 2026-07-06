export type TenantType = 'franchise' | 'commissary' | 'master_admin'

export interface PanelDef {
  key: string
  label: string
  href: string
  icon: string
}

// Single source of truth for the panel catalog per tier. Consumed by the
// sidebars (nav filtering), the staff-management UI (permission checkboxes),
// and the DB's users_panels_subset_check constraint (kept in sync manually --
// see the Phase 1 migration).
export const PANELS: Record<TenantType, PanelDef[]> = {
  franchise: [
    { key: 'dashboard',     label: 'Dashboard',         href: '/franchiser/dashboard',     icon: '📊' },
    { key: 'sales',         label: 'Sales Reports',     href: '/franchiser/sales',         icon: '📈' },
    { key: 'transactions',  label: 'Transactions',      href: '/franchiser/transactions',  icon: '🧾' },
    { key: 'inventory',     label: 'Inventory',         href: '/franchiser/inventory',     icon: '📦' },
    { key: 'staff',         label: 'My Staff',          href: '/franchiser/staff',         icon: '👥' },
    { key: 'menu',          label: 'Menu Availability', href: '/franchiser/menu',          icon: '🍹' },
    { key: 'pos_device',    label: 'POS Device',        href: '/franchiser/pos-device',    icon: '🖥️' },
    { key: 'announcements', label: 'Announcements',     href: '/franchiser/announcements', icon: '📣' },
  ],
  commissary: [
    { key: 'dashboard',   label: 'Dashboard',   href: '/commissary-portal/dashboard',   icon: '📊' },
    { key: 'franchisees', label: 'Franchisees', href: '/commissary-portal/franchisees', icon: '🏪' },
    { key: 'shipments',   label: 'Shipments',   href: '/commissary-portal/shipments',   icon: '📦' },
    { key: 'inventory',   label: 'Inventory',   href: '/commissary-portal/inventory',   icon: '🗂️' },
    { key: 'reports',     label: 'Reports',     href: '/commissary-portal/reports',     icon: '📈' },
  ],
  master_admin: [
    { key: 'dashboard',  label: 'Dashboard',  href: '/dashboard',  icon: '📊' },
    { key: 'franchises', label: 'Franchises', href: '/franchises', icon: '🏪' },
    { key: 'commissary', label: 'Commissary', href: '/commissary', icon: '📦' },
    { key: 'menu',       label: 'Menu',       href: '/menu',       icon: '🍹' },
    { key: 'financials', label: 'Financials', href: '/financials', icon: '💰' },
    { key: 'broadcast',  label: 'Broadcast',  href: '/broadcast',  icon: '📣' },
  ],
}

// 'all' means "not a restricted staff session" (an owner, or no restriction applies).
export type GrantedPanels = 'all' | string[]

export function isPanelGranted(granted: GrantedPanels, key: string): boolean {
  if (granted === 'all') return true
  return granted.includes(key)
}

// Maps the tenant-tier role string stored in Supabase Auth app_metadata
// ('franchisee' | 'commissary' | 'master_admin') to the public.users.tenant_type
// value ('franchise' | 'commissary' | 'master_admin') used for panel scoping.
// These two vocabularies differ deliberately: 'franchisee' identifies the
// *role/tier*, 'franchise' identifies the *tenant_type* of a users row.
export function roleToTenantType(role: string): TenantType {
  if (role === 'franchisee') return 'franchise'
  if (role === 'commissary') return 'commissary'
  if (role === 'master_admin') return 'master_admin'
  throw new Error(`Unknown tenant role "${role}"`)
}

export function validatePanelSubset(tenantType: TenantType, panels: string[]): string | null {
  const valid = new Set(PANELS[tenantType].map(p => p.key))
  for (const p of panels) {
    if (!valid.has(p)) return `Unknown panel "${p}" for this account type.`
  }
  return null
}
