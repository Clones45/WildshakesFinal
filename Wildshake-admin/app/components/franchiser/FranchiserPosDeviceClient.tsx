'use client'

import { useState, useTransition } from 'react'

interface Props {
  branchId: string
  branchName: string
  branchLocation: string
  activeDeviceId: string | null
  lastActivityAt: string | null
}

export default function FranchiserPosDeviceClient({
  branchId, branchName, branchLocation, activeDeviceId, lastActivityAt
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [confirmed, setConfirmed]    = useState(false)
  const [released, setReleased]      = useState(false)
  const [error, setError]            = useState<string | null>(null)

  const isOnline = !!activeDeviceId
  const deviceShort = activeDeviceId ? activeDeviceId.slice(0, 12) + '…' : null

  const lastActivityLabel = lastActivityAt
    ? new Date(lastActivityAt).toLocaleString('en-PH', {
        dateStyle: 'medium', timeStyle: 'short',
      })
    : 'No recent activity'

  const minutesSinceActivity = lastActivityAt
    ? Math.floor((Date.now() - new Date(lastActivityAt).getTime()) / 60000)
    : null

  async function handleReleaseDevice() {
    if (!confirmed) { setConfirmed(true); return }
    setError(null)

    startTransition(async () => {
      try {
        const res = await fetch('/api/release-device', {
          method: 'POST',
          body: JSON.stringify({ branchId }),
          headers: { 'Content-Type': 'application/json' },
        })
        if (!res.ok) throw new Error((await res.json()).error || 'Failed to release device')
        setReleased(true)
        setConfirmed(false)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Unknown error')
        setConfirmed(false)
      }
    })
  }

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1>POS Device</h1>
          <p className="page-header-subtitle">Manage the active POS terminal for {branchName}</p>
        </div>
        <span className={`badge ${isOnline && !released ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '0.85rem', padding: '0.4rem 0.85rem' }}>
          {isOnline && !released ? '● POS Online' : '○ No POS Device'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>

        {/* ── APK Download Card (full width) ──────────────────────────── */}
        <div className="chart-card" style={{
          display: 'flex', flexDirection: 'column', gap: '1.25rem',
          gridColumn: '1 / -1',
          background: 'linear-gradient(135deg, rgba(74,124,89,0.08) 0%, rgba(212,175,55,0.06) 100%)',
          border: '1px solid rgba(74,124,89,0.3)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            {/* App info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
              <div style={{
                width: '64px', height: '64px', borderRadius: 'var(--radius-md)',
                background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-light))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '2rem', flexShrink: 0,
                boxShadow: 'var(--shadow-glow)',
              }}>
                🧾
              </div>
              <div>
                <p style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-text)', marginBottom: '0.2rem' }}>
                  Wildshakes POS App
                </p>
                <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '0.4rem' }}>
                  For Android tablets &amp; phones
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {[
                    { label: '📦 POS-APP.apk', color: 'rgba(74,124,89,0.15)', text: 'var(--color-primary-light)', border: 'rgba(74,124,89,0.3)' },
                    { label: 'Android 7.0+',   color: 'rgba(212,175,55,0.12)', text: 'var(--color-accent)',       border: 'rgba(212,175,55,0.3)' },
                    { label: '~0.5 MB',         color: 'rgba(255,255,255,0.04)', text: 'var(--color-text-muted)', border: 'var(--color-border)' },
                  ].map(tag => (
                    <span key={tag.label} style={{
                      fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px',
                      background: tag.color, color: tag.text, border: `1px solid ${tag.border}`,
                    }}>
                      {tag.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Download button */}
            <a
              href="/POS-APP.apk"
              download="Wildshakes-POS.apk"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.6rem',
                padding: '0.75rem 1.75rem',
                background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-light))',
                color: 'white', fontWeight: 700, fontSize: '0.92rem',
                borderRadius: 'var(--radius-pill)',
                textDecoration: 'none',
                boxShadow: '0 4px 20px rgba(74,124,89,0.4)',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap',
              }}
            >
              ⬇️ Download APK
            </a>
          </div>

          {/* Install tip */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
            padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)',
            background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.2)',
            fontSize: '0.78rem', color: 'var(--color-warning)',
          }}>
            <span style={{ flexShrink: 0 }}>⚠️</span>
            <span>
              Before installing, enable <strong>Install from Unknown Sources</strong> in your Android settings
              (Settings → Security → Unknown Sources). This is required for sideloaded APKs.
            </span>
          </div>
        </div>

        {/* Branch Info Card */}
        <div className="chart-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p className="chart-title">Branch Details</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.875rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>Branch Name</span>
              <span style={{ fontWeight: 700 }}>{branchName}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>Location</span>
              <span>{branchLocation || '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
              <span style={{ color: 'var(--color-text-muted)', fontWeight: 600, flexShrink: 0 }}>Branch ID</span>
              <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--color-text-muted)', wordBreak: 'break-all', textAlign: 'right' }}>
                {branchId}
              </span>
            </div>
          </div>
        </div>

        {/* POS Terminal Status Card */}
        <div className="chart-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p className="chart-title">Terminal Status</p>

          <div style={{
            padding: '1.25rem', borderRadius: 'var(--radius-md)',
            background: (isOnline && !released) ? 'rgba(74, 124, 89, 0.08)' : 'rgba(255, 193, 7, 0.06)',
            border: `1px solid ${(isOnline && !released) ? 'rgba(74, 124, 89, 0.25)' : 'rgba(255, 193, 7, 0.2)'}`,
            display: 'flex', flexDirection: 'column', gap: '0.75rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '2rem' }}>{(isOnline && !released) ? '🖥️' : '📵'}</span>
              <div>
                <p style={{ fontWeight: 700, fontSize: '1rem', color: (isOnline && !released) ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                  {(isOnline && !released) ? 'Device Active' : 'No Device Bound'}
                </p>
                <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                  {(isOnline && !released) ? 'POS is ready to process orders' : 'Set up a POS device to start selling'}
                </p>
              </div>
            </div>

            {(isOnline && !released) && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                  <span style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>Device ID</span>
                  <span style={{ fontFamily: 'monospace', color: 'var(--color-text)' }}>{deviceShort}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                  <span style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>Last Activity</span>
                  <span style={{ color: minutesSinceActivity !== null && minutesSinceActivity < 60 ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                    {lastActivityLabel}
                    {minutesSinceActivity !== null && (
                      <span style={{ fontSize: '0.72rem', marginLeft: '0.4rem', opacity: 0.7 }}>
                        ({minutesSinceActivity < 60
                          ? `${minutesSinceActivity}m ago`
                          : `${Math.floor(minutesSinceActivity / 60)}h ago`})
                      </span>
                    )}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Release device button */}
          {(isOnline && !released) && (
            <div>
              {error && (
                <div className="alert alert-danger" style={{ marginBottom: '0.5rem', fontSize: '0.82rem' }}>
                  {error}
                </div>
              )}
              {confirmed ? (
                <div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--color-warning)', marginBottom: '0.5rem', fontWeight: 600 }}>
                    ⚠️ This will log the POS device out. Are you sure?
                  </p>
                  <div className="flex gap-1">
                    <button className="btn btn-danger btn-sm" onClick={handleReleaseDevice} disabled={isPending}>
                      {isPending ? <><span className="loading-spinner" /> Releasing…</> : 'Yes, Release Device'}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmed(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--color-danger-light)' }}
                  onClick={() => setConfirmed(true)}
                >
                  🔓 Release Device
                </button>
              )}
            </div>
          )}
        </div>

        {/* Setup Instructions Card */}
        <div className="chart-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p className="chart-title">POS Setup Instructions</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', fontSize: '0.82rem' }}>
            {[
              { step: '1', icon: '⬇️', text: 'Download the Wildshakes POS APK from the button above and install it on your Android tablet or phone.' },
              { step: '2', icon: '🔑', text: 'Open the app, tap "Set Up Device" and log in with your franchisee email and password.' },
              { step: '3', icon: '🏪', text: `Select "${branchName}" from the branch list.` },
              { step: '4', icon: '✅', text: 'The device is now bound to this branch. Staff can log in with their PIN.' },
            ].map(item => (
              <div key={item.step} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <span style={{
                  width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(74, 124, 89, 0.15)', color: 'var(--color-primary-light)',
                  fontWeight: 800, fontSize: '0.72rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {item.step}
                </span>
                <div>
                  <span style={{ marginRight: '0.35rem' }}>{item.icon}</span>
                  <span style={{ color: 'var(--color-text)', lineHeight: 1.5 }}>{item.text}</span>
                </div>
              </div>
            ))}
          </div>
          {!isOnline && !released && (
            <div style={{
              padding: '0.75rem', borderRadius: 'var(--radius-md)',
              background: 'rgba(255,193,7,0.06)', border: '1px solid rgba(255,193,7,0.2)',
              fontSize: '0.78rem', color: 'var(--color-warning)',
            }}>
              ⚠️ No POS device is currently active. Follow the steps above to connect one.
            </div>
          )}
          {released && (
            <div className="alert alert-success" style={{ fontSize: '0.82rem' }}>
              ✅ Device released. The POS is now available for re-setup.
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
