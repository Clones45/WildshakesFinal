import { redirect } from 'next/navigation'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { PANELS, isPanelGranted, type GrantedPanels, type TenantType } from '@/lib/portal/panels'

export interface PortalPermissions {
  isStaff: boolean
  grantedPanels: GrantedPanels
}

// Panels are always re-read from public.users here, never trusted from the JWT --
// app_metadata is only refreshed on token refresh (up to ~1hr), so reading fresh
// means a revoked panel (or a deactivated account) takes effect on the staffer's
// very next request instead of waiting out the token TTL.
export async function getPortalPermissions(
  supabase: SupabaseClient,
  user: User
): Promise<PortalPermissions> {
  const isStaff = !!(user.app_metadata as Record<string, unknown> | null)?.is_staff

  if (!isStaff) return { isStaff: false, grantedPanels: 'all' }

  const { data } = await supabase
    .from('users')
    .select('panels, is_active')
    .eq('auth_id', user.id)
    .single()

  if (!data || !data.is_active) redirect('/unauthorized')

  return { isStaff: true, grantedPanels: (data.panels ?? []) as string[] }
}

// Call at the top of a tenant page.tsx with that page's own panel key. Redirects
// to /login if unauthenticated, or /unauthorized if the panel isn't granted.
// Returns the Supabase client + user it already fetched so the calling page can
// reuse them for its own queries instead of creating a second client and paying
// for a second auth.getUser() network round trip.
export async function requirePanelAccess(tenantType: TenantType, panelKey: string) {
  if (!PANELS[tenantType].some(p => p.key === panelKey)) {
    throw new Error(`Unknown panel "${panelKey}" for tenant type "${tenantType}"`)
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const perms = await getPortalPermissions(supabase, user)
  if (!isPanelGranted(perms.grantedPanels, panelKey)) redirect('/unauthorized')

  return { supabase, user, ...perms }
}

// For pages that are never delegable to staff at all (master admin / commissary
// staff management itself has no panel key in PANELS -- it's always owner-only).
export async function requireOwner() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const perms = await getPortalPermissions(supabase, user)
  if (perms.isStaff) redirect('/unauthorized')

  return { supabase, user }
}
