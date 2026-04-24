'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const navItems = [
  { href: '/dashboard',   label: 'Dashboard',     icon: '📊' },
  { href: '/franchises',  label: 'Franchises',    icon: '🏪' },
  { href: '/commissary',  label: 'Commissary',    icon: '📦' },
  { href: '/menu',        label: 'Menu',          icon: '🍹' },
  { href: '/financials',  label: 'Financials',    icon: '💰' },
  { href: '/broadcast',   label: 'Broadcast',     icon: '📣' },
]

interface SidebarProps {
  userEmail?: string
  lowStockCount?: number
}

export default function Sidebar({ userEmail, lowStockCount = 0 }: SidebarProps) {
  const pathname = usePathname()
  const router   = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const initials = userEmail
    ? userEmail.slice(0, 2).toUpperCase()
    : 'MA'

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <img src="/logo.png" alt="Wildshakes" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
          <span className="sidebar-logo-text">Wildshakes</span>
        </div>
        <span className="sidebar-logo-sub">Master Admin</span>
        <div className="sidebar-badge">
          ⚡ GOD MODE
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <p className="sidebar-section-label">Navigation</p>
        {navItems.map(item => {
          const isActive = item.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link${isActive ? ' active' : ''}`}
            >
              <span className="icon">{item.icon}</span>
              {item.label}
              {item.href === '/commissary' && lowStockCount > 0 && (
                <span className="badge-count">{lowStockCount}</span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* User Footer */}
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-avatar">{initials}</div>
          <div className="sidebar-user-info">
            <p className="sidebar-user-name">{userEmail || 'Admin'}</p>
            <p className="sidebar-user-role">Master Admin</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="btn btn-ghost btn-sm w-full"
          style={{ marginTop: '0.75rem', justifyContent: 'center' }}
        >
          🚪 Sign Out
        </button>
      </div>
    </aside>
  )
}
