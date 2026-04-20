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

          {/* Status indicator */}
          <div style={{
            padding: '1.25rem',
            borderRadius: 'var(--radius-md)',
            background: (isOnline && !released)
              ? 'rgba(74, 124, 89, 0.08)'
              : 'rgba(255, 193, 7, 0.06)',
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
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={handleReleaseDevice}
                      disabled={isPending}
                    >
                      {isPending ? <><span className="loading-spinner" /> Releasing…</> : 'Yes, Release Device'}
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setConfirmed(false)}
                    >
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
              { step: '1', icon: '📱', text: 'Open the Wildshakes POS app on your tablet or phone.' },
              { step: '2', icon: '🔑', text: 'Tap "Set Up Device" and log in with your franchisee email and password.' },
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
