import { cache } from 'react'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Memoized per request: every createClient() call within the same render
// pass (layout + page + any access.ts helper they call) gets back the SAME
// client instance instead of each building an independent one from scratch.
// That collapses what used to be 2-4 separate auth.getUser() calls per
// request into one, removing the race between them to refresh the same
// token (see middleware.ts for the other half of this fix).
export const createClient = cache(async () => {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Middleware handles cookie updates
          }
        },
      },
    }
  )
})
