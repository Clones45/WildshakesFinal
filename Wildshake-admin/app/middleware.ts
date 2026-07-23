import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error('Middleware: Missing Supabase environment variables')
    return NextResponse.next({ request })
  }

  // Prefer a secret API key + the real end-user IP so Supabase's per-IP auth
  // rate limits are keyed per branch device, not per Vercel edge IP (every
  // branch would otherwise share one 30-request bucket). Requires a new
  // "secret" key from Project Settings > API Keys (the legacy service_role
  // key is not accepted for this) in SUPABASE_SECRET_KEY, and "IP Address
  // Forwarding" enabled under Authentication > Rate Limits. Falls back to
  // the anon key (no forwarding, current behavior) until both are set up.
  const secretKey = process.env.SUPABASE_SECRET_KEY
  const forwardedFor = request.headers.get('x-forwarded-for')

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    secretKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      ...(secretKey && forwardedFor
        ? { global: { headers: { 'sb-forwarded-for': forwardedFor } } }
        : {}),
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() re-validates against Supabase instead of just reading the JWT
  // out of cookies (getSession()) — it's also where an expiring token
  // actually gets refreshed. Doing that once, here, means every downstream
  // layout/page auth check reuses this same already-fresh session (via the
  // cache()-memoized server client in lib/supabase/server.ts) instead of
  // each independently racing to refresh it — that race is what was causing
  // "Invalid Refresh Token" / "Session not found" errors under concurrency.
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Protected routes — require authentication
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Role check: master_admin has full access, franchisee only to /franchiser
  const role = (user.app_metadata as Record<string, string>)?.role

  if (role === 'franchisee') {
    if (!pathname.startsWith('/franchiser')) {
      return NextResponse.redirect(new URL('/franchiser/dashboard', request.url))
    }
    return supabaseResponse
  }

  if (role === 'commissary') {
    if (!pathname.startsWith('/commissary-portal')) {
      return NextResponse.redirect(new URL('/commissary-portal/dashboard', request.url))
    }
    return supabaseResponse
  }

  if (role !== 'master_admin') {
    return NextResponse.redirect(new URL('/unauthorized', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|images/|fonts/|login|unauthorized|api/auth|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|apk)$).*)',
  ],
}
