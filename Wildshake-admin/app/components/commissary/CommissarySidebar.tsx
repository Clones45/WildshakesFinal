'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PANELS, isPanelGranted, type GrantedPanels } from '@/lib/portal/panels'

interface Props {
  userEmail?: string
  commissaryName?: string
  region?: string | null
  grantedPanels?: GrantedPanels
}

export default function CommissarySidebar({ userEmail, commissaryName, region, grantedPanels = 'all' }: Props) {
  const pathname = usePathname()
  const router   = useRouter()

  const navItems = PANELS.commissary.filter(item => isPanelGranted(grantedPanels, item.key))
  const isOwner  = grantedPanels === 'all'

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const initials = commissaryName
    ? commissaryName.slice(0, 2).toUpperCase()
    : (userEmail?.slice(0, 2).toUpperCase() ?? 'CB')

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <img src="/logo.png" alt="Wildshakes" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
          <span className="sidebar-logo-text">Wildshakes</span>
        </div>
        <span className="sidebar-logo-sub">🏭 Commissary Branch</span>
      </div>

      {/* Branch Info */}
      {commissaryName && (
        <div style={{
          padding: '0.625rem 1rem',
          margin: '0 0.75rem 0.5rem',
          background: 'rgba(74,124,89,0.08)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid rgba(74,124,89,0.15)',
        }}>
          <p style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--color-accent)', marginBottom: '0.1rem' }}>
            {commissaryName}
          </p>
          {region && (
            <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>📍 {region}</p>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="sidebar-nav">
        <p className="sidebar-section-label">Navigation</p>
        {navItems.map(item => {
          const isActive = item.href === '/commissary-portal/dashboard'
            ? pathname === '/commissary-portal/dashboard'
            : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link${isActive ? ' active' : ''}`}
            >
              <span className="icon">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User Footer */}
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-avatar">{initials}</div>
          <div className="sidebar-user-info">
            <p className="sidebar-user-name">{userEmail || 'Commissary'}</p>
            <p className="sidebar-user-role">Commissary Manager</p>
          </div>
        </div>
        {isOwner && (
          <Link href="/commissary-portal/staff" className="btn btn-ghost btn-sm w-full" style={{ marginTop: '0.5rem', justifyContent: 'center' }}>
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
