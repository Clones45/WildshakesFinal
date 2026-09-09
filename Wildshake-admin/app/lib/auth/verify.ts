import type { SupabaseClient } from '@supabase/supabase-js'

export interface VerifiedUser {
  id: string
  email?: string
  app_metadata: Record<string, unknown>
}

// Establish the caller's identity from their session cookie.
//
// Prefer getClaims(): with this project's asymmetric (ES256) signing keys it
// verifies the access token's signature LOCALLY against a cached JWKS — with no
// call to Supabase's auth server. getUser(), by contrast, hits /auth/v1/user on
// every request. That check runs in the middleware AND in each portal layout,
// on every page load and every RSC link prefetch; across all branches sharing a
// single Vercel egress IP it tripped Supabase's per-IP auth rate limit, and a
// rate-limited getUser() returns no user — which the layouts read as "logged
// out" and bounce to /login mid-session (the "logs me out when I click anything"
// report). Local verification isn't rate-limited, so it removes that failure.
//
// Falls back to getUser() when there are no valid local claims — e.g. the access
// token has expired and needs a refresh-token round trip (getClaims goes through
// getSession, which refreshes and re-verifies). The fallback means this is never
// less safe, and never less capable, than a bare getUser().
export async function getVerifiedUser(
  supabase: SupabaseClient,
): Promise<VerifiedUser | null> {
  try {
    const { data, error } = await supabase.auth.getClaims()
    const claims = data?.claims as unknown as
      | { sub?: string; email?: string; app_metadata?: Record<string, unknown> }
      | undefined
    if (!error && claims?.sub) {
      return {
        id: claims.sub,
        email: claims.email,
        app_metadata: claims.app_metadata ?? {},
      }
    }
  } catch {
    // Local verification unavailable (e.g. JWKS fetch failed) — fall through to
    // a network validation, i.e. exactly the previous behaviour.
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return {
    id: user.id,
    email: user.email,
    app_metadata: (user.app_metadata ?? {}) as Record<string, unknown>,
  }
}
