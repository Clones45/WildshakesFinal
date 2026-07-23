import { redirect, unstable_rethrow } from 'next/navigation'
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
//
// Wrapped in try/catch: a transient Supabase failure (network blip, rate limit)
// used to bubble up as an unhandled render-time crash. unstable_rethrow lets
// Next's own redirect()/notFound() control-flow errors pass through untouched,
// so only a genuinely unexpected error falls through to the /login fallback.
export async function requirePanelAccess(tenantType: TenantType, panelKey: string) {
  if (!PANELS[tenantType].some(p => p.key === panelKey)) {
    throw new Error(`Unknown panel "${panelKey}" for tenant type "${tenantType}"`)
  }

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const perms = await getPortalPermissions(supabase, user)
    if (!isPanelGranted(perms.grantedPanels, panelKey)) redirect('/unauthorized')

    return { supabase, user, ...perms }
  } catch (err) {
    unstable_rethrow(err)
    console.error('[requirePanelAccess] unexpected auth error:', err)
    redirect('/login')
  }
}

// Call at the top of a tier's dashboard/page.tsx specifically. Dashboard is a
// normal togglable panel like any other (some staff shouldn't see it), so unlike
// requirePanelAccess() this doesn't dead-end at /unauthorized when it's missing --
// it sends the staffer to their first granted panel instead, since a staffer
// still needs somewhere to land after login (middleware always routes post-login
// to .../dashboard without knowing about per-staff panels).
export async function requireDashboardOrFirstPanel(tenantType: TenantType) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const perms = await getPortalPermissions(supabase, user)

    if (isPanelGranted(perms.grantedPanels, 'dashboard')) {
      return { supabase, user, ...perms }
    }

    const grantedPanels = perms.grantedPanels
    const firstPanel = grantedPanels === 'all'
      ? undefined
      : PANELS[tenantType].find(p => grantedPanels.includes(p.key))

    if (firstPanel) redirect(firstPanel.href)
    redirect('/unauthorized')
  } catch (err) {
    unstable_rethrow(err)
    console.error('[requireDashboardOrFirstPanel] unexpected auth error:', err)
    redirect('/login')
  }
}

// For pages that are never delegable to staff at all (master admin / commissary
// staff management itself has no panel key in PANELS -- it's always owner-only).
export async function requireOwner() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const perms = await getPortalPermissions(supabase, user)
    if (perms.isStaff) redirect('/unauthorized')

    return { supabase, user }
  } catch (err) {
    unstable_rethrow(err)
    console.error('[requireOwner] unexpected auth error:', err)
    redirect('/login')
  }
}
