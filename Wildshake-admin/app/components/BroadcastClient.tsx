'use client'

import { useState, useTransition, type CSSProperties } from 'react'
import { createAnnouncement, deactivateAnnouncement } from '@/lib/actions/broadcast'

interface Announcement {
  id: string
  title: string
  body: string
  priority: string
  target: string
  is_active: boolean
  created_at: string
  franchises: { name: string } | null
}

export default function BroadcastClient({
  announcements,
  franchises,
}: {
  announcements: Announcement[]
  franchises: { id: string; name: string }[]
}) {
  const [target, setTarget]           = useState('all')
  const [formError, setFormError]     = useState('')
  const [formSuccess, setFormSuccess] = useState('')
  const [isPending, startTransition]  = useTransition()

  async function handleSend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError('')
    setFormSuccess('')
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await createAnnouncement(fd)
      if (result.error) { setFormError(result.error); return }
      setFormSuccess('Announcement broadcast successfully! ✅');
      (e.target as HTMLFormElement).reset()
      setTarget('all')
      setTimeout(() => setFormSuccess(''), 3000)
    })
  }

  async function handleDeactivate(id: string) {
    startTransition(async () => { await deactivateAnnouncement(id) })
  }

  const active   = announcements.filter(a => a.is_active)
  const archived = announcements.filter(a => !a.is_active)

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Global Broadcast</h1>
          <p className="page-header-subtitle">Send system updates and announcements to all franchisees</p>
        </div>
        <div className="flex gap-1 items-center">
          <span className="badge badge-success">📡 {active.length} Active</span>
          <span className="badge badge-muted">{archived.length} Archived</span>
        </div>
      </div>

      <div className="two-col-panel" style={{ '--panel-ratio': '1.5fr', alignItems: 'start' } as CSSProperties}>
        {/* Compose Panel */}
        <div className="card" style={{ position: 'sticky', top: '1.5rem' }}>
          <h3 style={{ color: 'var(--color-text)', marginBottom: '1.25rem' }}>📣 Compose Announcement</h3>

          {formError   && <div className="alert alert-danger"   style={{ marginBottom: '1rem' }}>{formError}</div>}
          {formSuccess && <div className="alert alert-success"  style={{ marginBottom: '1rem' }}>{formSuccess}</div>}

          <form onSubmit={handleSend} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Title *</label>
              <input name="title" className="form-input" placeholder="e.g. New menu pricing effective May 1" required />
            </div>

            <div className="form-group">
              <label className="form-label">Message *</label>
              <textarea name="body" className="form-textarea" style={{ minHeight: '120px' }}
                placeholder="Write your announcement here…" required />
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Priority</label>
                <select name="priority" className="form-select">
                  <option value="normal">🟢 Normal</option>
                  <option value="high">🟡 High</option>
                  <option value="critical">🔴 Critical</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Send To</label>
                <select name="target" className="form-select" value={target} onChange={e => setTarget(e.target.value)}>
                  <option value="all">🌐 All Franchises</option>
                  <option value="specific">🏪 Specific Franchise</option>
                </select>
              </div>
            </div>

            {target === 'specific' && (
              <div className="form-group">
                <label className="form-label">Select Franchise</label>
                <select name="target_franchise_id" className="form-select" required>
                  <option value="">Choose franchise…</option>
                  {franchises.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
            )}

            <button type="submit" className="btn btn-accent btn-lg w-full" style={{ justifyContent: 'center' }} disabled={isPending}>
              {isPending ? <><span className="loading-spinner" /> Sending…</> : '📣 Broadcast Now'}
            </button>
          </form>
        </div>

        {/* Announcements Feed */}
        <div>
          <h3 style={{ color: 'var(--color-text)', marginBottom: '1rem' }}>Active Broadcasts</h3>
          {active.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
              No active announcements
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', marginBottom: '1.5rem' }}>
              {active.map(a => (
                <AnnouncementCard key={a.id} announcement={a} onDeactivate={handleDeactivate} isPending={isPending} />
              ))}
            </div>
          )}

          {archived.length > 0 && (
            <>
              <h3 style={{ color: 'var(--color-text-muted)', marginBottom: '0.75rem', fontSize: '1rem' }}>
                Archived
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {archived.slice(0, 5).map(a => (
                  <AnnouncementCard key={a.id} announcement={a} archived />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

function AnnouncementCard({
  announcement: a,
  onDeactivate,
  isPending,
  archived = false,
}: {
  announcement: Announcement
  onDeactivate?: (id: string) => void
  isPending?: boolean
  archived?: boolean
}) {
  return (
    <div className="card" style={{ opacity: archived ? 0.6 : 1, transition: 'opacity 0.2s' }}>
      <div className="flex justify-between items-center" style={{ marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div className="flex gap-1 items-center">
          <span className={`badge badge-${a.priority}`}>{a.priority.toUpperCase()}</span>
          <span className="badge badge-muted">
            {a.target === 'all' ? '🌐 All' : `🏪 ${a.franchises?.name || 'Specific'}`}
          </span>
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          {new Date(a.created_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
        </span>
      </div>
      <p style={{ fontWeight: 700, color: 'var(--color-text)', marginBottom: '0.35rem' }}>{a.title}</p>
      <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', lineHeight: '1.55' }}>{a.body}</p>
      {!archived && onDeactivate && (
        <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onDeactivate(a.id)}
            disabled={isPending}
          >
            🗃️ Archive
          </button>
        </div>
      )}
    </div>
  )
}
