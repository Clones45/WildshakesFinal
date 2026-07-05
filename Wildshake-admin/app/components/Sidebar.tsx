'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PANELS, isPanelGranted, type GrantedPanels } from '@/lib/portal/panels'

interface SidebarProps {
  userEmail?: string
  lowStockCount?: number
  grantedPanels?: GrantedPanels
}

export default function Sidebar({ userEmail, lowStockCount = 0, grantedPanels = 'all' }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const navItems = PANELS.master_admin.filter(item => isPanelGranted(grantedPanels, item.key))
  const isOwner  = grantedPanels === 'all'

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
        {isOwner && (
          <Link href="/staff" className="btn btn-ghost btn-sm w-full" style={{ marginTop: '0.5rem', justifyContent: 'center' }}>
            🔑 Manage Staff
          </Link>
        )}
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
