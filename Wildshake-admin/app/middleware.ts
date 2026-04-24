import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error('Middleware: Missing Supabase environment variables')
    return NextResponse.next({ request })
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
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

  // Refresh session — do NOT remove this
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Allow login page always
  if (pathname.startsWith('/login')) {
    if (user) {
      const role = (user.app_metadata as Record<string, string>)?.role
      if (role === 'franchisee') {
        return NextResponse.redirect(new URL('/franchiser/dashboard', request.url))
      }
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return supabaseResponse
  }

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

  if (role !== 'master_admin') {
    return NextResponse.redirect(new URL('/unauthorized', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|unauthorized|api/auth|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
