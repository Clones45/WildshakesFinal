'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const navItems = [
  { href: '/franchiser/dashboard',     label: 'Dashboard',     icon: '📊' },
  { href: '/franchiser/sales',         label: 'Sales Reports', icon: '📈' },
  { href: '/franchiser/transactions',  label: 'Transactions',  icon: '🧾' },
  { href: '/franchiser/staff',         label: 'My Staff',      icon: '👥' },
  { href: '/franchiser/pos-device',    label: 'POS Device',    icon: '🖥️' },
  { href: '/franchiser/announcements', label: 'Announcements', icon: '📣' },
]

interface FranchiserSidebarProps {
  userEmail?: string
  ownerName?: string
  franchiseName?: string
  branchName?: string
  deviceClaimed?: boolean
}

export default function FranchiserSidebar({
  userEmail, ownerName, franchiseName, branchName, deviceClaimed
}: FranchiserSidebarProps) {
  const pathname = usePathname()
  const router   = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const initials = ownerName
    ? ownerName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : 'FR'

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <span className="sidebar-logo-text">🌿 Wildshakes</span>
        <span className="sidebar-logo-sub">Franchiser Portal</span>
        <div className="sidebar-badge" style={{
          background: 'rgba(74, 124, 89, 0.15)',
          border: '1px solid rgba(74, 124, 89, 0.3)',
          color: 'var(--color-primary-light)',
        }}>
          🏪 {branchName || 'My Branch'}
        </div>
        {/* POS Device status pill */}
        <div style={{ marginTop: '0.5rem' }}>
          <span className={`badge ${deviceClaimed ? 'badge-success' : 'badge-warning'}`}
            style={{ fontSize: '0.6rem' }}>
            {deviceClaimed ? '● POS Active' : '○ No POS Device'}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <p className="sidebar-section-label">My Branch</p>
        {navItems.map(item => {
          const isActive = item.href === '/franchiser/dashboard'
            ? pathname === '/franchiser/dashboard'
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

      {/* Franchise Info */}
      <div style={{
        padding: '0.75rem 1.25rem',
        margin: '0 0.75rem 0.5rem',
        background: 'rgba(74, 124, 89, 0.06)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        fontSize: '0.72rem',
      }}>
        <p style={{ color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>
          Franchise
        </p>
        <p style={{ color: 'var(--color-text)', fontWeight: 600 }}>{franchiseName || '—'}</p>
      </div>

      {/* User Footer */}
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-avatar">{initials}</div>
          <div className="sidebar-user-info">
            <p className="sidebar-user-name">{ownerName || userEmail || 'Owner'}</p>
            <p className="sidebar-user-role">Franchisee</p>
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
