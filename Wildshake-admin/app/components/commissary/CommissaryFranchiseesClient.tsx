'use client'

import { useState, useTransition } from 'react'
import { createFranchiseeUnderCommissary, updateCommissaryBranchStatus } from '@/lib/actions/commissaryBranch'
import { updateFranchiseStatus } from '@/lib/actions/franchises'

interface Branch {
  id: string
  name: string
  location: string | null
  status: string
  active_device_id: string | null
}

interface Franchise {
  id: string
  name: string
  owner_name: string
  owner_email: string
  region: string | null
  status: string
  created_at: string
  branches?: Branch[]
}

interface Props {
  franchises: Franchise[]
  commissaryId: string
}

export default function CommissaryFranchiseesClient({ franchises, commissaryId }: Props) {
  const [showModal, setShowModal]     = useState(false)
  const [search, setSearch]           = useState('')
  const [formError, setFormError]     = useState('')
  const [formSuccess, setFormSuccess] = useState('')
  const [newCredentials, setNewCredentials] = useState<{
    email: string; password: string; branchName?: string
  } | null>(null)
  const [isPending, startTransition] = useTransition()

  const filtered = franchises.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    f.owner_name.toLowerCase().includes(search.toLowerCase())
  )

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError('')
    setFormSuccess('')
    setNewCredentials(null)
    const fd = new FormData(e.currentTarget)
    fd.set('parent_commissary_id', commissaryId)
    startTransition(async () => {
      const result = await createFranchiseeUnderCommissary(fd)
      if (result.error) { setFormError(result.error); return }
      setFormSuccess('Franchisee registered successfully!')
      if (result.credentials) setNewCredentials({ ...result.credentials, branchName: result.branchName })
    })
  }

  async function handleStatusChange(id: string, status: string) {
    startTransition(async () => { await updateFranchiseStatus(id, status) })
  }

  const totalBranches = franchises.reduce((s, f) => s + (f.branches?.length || 0), 0)
  const activePOS     = franchises.reduce((s, f) => s + (f.branches || []).filter(b => b.active_device_id).length, 0)

  return (
    <>
      <div className="page-header">
        <div>
          <h1>🏪 Franchisees</h1>
          <p className="page-header-subtitle">Manage franchisees under your commissary branch</p>
        </div>
        <button className="btn btn-accent" onClick={() => setShowModal(true)}>
          ➕ Add Franchisee
        </button>
      </div>

      {/* Stats */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-card-icon green">🏪</div>
          <p className="stat-card-label">Total Franchisees</p>
          <p className="stat-card-value">{franchises.length}</p>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon blue">✅</div>
          <p className="stat-card-label">Active</p>
          <p className="stat-card-value">{franchises.filter(f => f.status === 'active').length}</p>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon gold">🏬</div>
          <p className="stat-card-label">Total Branches</p>
          <p className="stat-card-value">{totalBranches}</p>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon green">🖥️</div>
          <p className="stat-card-label">POS Online</p>
          <p className="stat-card-value">{activePOS}</p>
        </div>
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <div className="table-header">
          <p className="table-title">All Franchisees</p>
          <div className="table-search">
            🔍
            <input
              type="text"
              placeholder="Search franchisees…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Franchise</th>
              <th>Owner</th>
              <th>Region</th>
              <th>Branches</th>
              <th>Status</th>
              <th>Registered</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2.5rem' }}>
                  {franchises.length === 0
                    ? 'No franchisees yet. Add your first one!'
                    : 'No results found.'}
                </td>
              </tr>
            ) : (
              filtered.map(f => {
                const branches = f.branches || []
                return (
                  <tr key={f.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--color-accent)' }}>{f.name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>{f.owner_email}</div>
                    </td>
                    <td>{f.owner_name}</td>
                    <td>{f.region || '—'}</td>
                    <td>
                      {branches.length === 0 ? (
                        <span className="badge badge-danger">⚠ No Branch</span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          {branches.map(b => (
                            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                              <span style={{
                                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                                background: b.active_device_id ? 'var(--color-success)' : '#555',
                                display: 'inline-block',
                              }} />
                              {b.name}
                              {b.active_device_id && (
                                <span className="badge badge-success" style={{ fontSize: '0.62rem', padding: '0.1rem 0.4rem' }}>POS</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`badge badge-${f.status === 'active' ? 'success' : f.status === 'suspended' ? 'danger' : 'warning'}`}>
                        {f.status}
                      </span>
                    </td>
                    <td style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                      {new Date(f.created_at).toLocaleDateString('en-PH')}
                    </td>
                    <td>
                      <div className="flex gap-1">
                        {f.status !== 'active' && (
                          <button className="btn btn-ghost btn-sm" onClick={() => handleStatusChange(f.id, 'active')} disabled={isPending}>
                            Activate
                          </button>
                        )}
                        {f.status === 'active' && (
                          <button className="btn btn-danger btn-sm" onClick={() => handleStatusChange(f.id, 'suspended')} disabled={isPending}>
                            Suspend
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Create Franchisee Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <p className="modal-title">Register New Franchisee</p>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>

            {formError   && <div className="alert alert-danger">{formError}</div>}
            {formSuccess && (
              <div className="alert alert-success">
                <p style={{ fontWeight: 700, marginBottom: '0.5rem' }}>✅ {formSuccess}</p>
                {newCredentials && (
                  <>
                    <div style={{
                      background: 'var(--color-bg-card)', borderRadius: '8px',
                      padding: '0.875rem', fontFamily: 'monospace', fontSize: '0.85rem',
                      border: '1px solid var(--color-border)', marginBottom: '0.75rem',
                    }}>
                      <div>📧 <strong>Email:</strong> {newCredentials.email}</div>
                      <div>🔑 <strong>Password:</strong> {newCredentials.password}</div>
                      {newCredentials.branchName && (
                        <div>🏪 <strong>Branch created:</strong> {newCredentials.branchName}</div>
                      )}
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => { setShowModal(false); setFormSuccess(''); setNewCredentials(null) }}
                    >
                      Done
                    </button>
                  </>
                )}
              </div>
            )}

            {!formSuccess && (
              <form onSubmit={handleCreate}>
                <div className="modal-body">
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label">Franchise Name *</label>
                      <input name="name" className="form-input" placeholder="e.g. Wildshakes Davao" required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Region / Location *</label>
                      <input name="region" className="form-input" placeholder="e.g. Davao City" required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Owner Name *</label>
                      <input name="owner_name" className="form-input" placeholder="Full name" required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Owner Email *</label>
                      <input name="owner_email" type="email" className="form-input" placeholder="owner@email.com" required />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Portal Password *</label>
                    <input name="password" type="password" className="form-input" placeholder="Min. 8 characters" minLength={8} required />
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={isPending}>
                    {isPending ? <><span className="loading-spinner" />Creating…</> : '✅ Register Franchisee'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
