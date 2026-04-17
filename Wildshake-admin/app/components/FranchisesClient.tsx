'use client'

import { useState, useTransition } from 'react'
import { createFranchise, updateFranchiseStatus } from '@/lib/actions/franchises'

interface Franchise {
  id: string
  name: string
  owner_name: string
  owner_email: string
  region: string | null
  status: string
  created_at: string
}

export default function FranchisesClient({ franchises }: { franchises: Franchise[] }) {
  const [showModal, setShowModal]   = useState(false)
  const [search, setSearch]         = useState('')
  const [formError, setFormError]   = useState('')
  const [formSuccess, setFormSuccess] = useState('')
  const [newCredentials, setNewCredentials] = useState<{ email: string; password: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  const filtered = franchises.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    f.owner_name.toLowerCase().includes(search.toLowerCase()) ||
    (f.region || '').toLowerCase().includes(search.toLowerCase())
  )

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError('')
    setFormSuccess('')
    setNewCredentials(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await createFranchise(fd)
      if (result.error) { setFormError(result.error); return }
      setFormSuccess('Franchise registered! Login credentials generated:')
      if (result.credentials) setNewCredentials(result.credentials)
    })
  }

  async function handleStatusChange(id: string, status: string) {
    startTransition(async () => {
      await updateFranchiseStatus(id, status)
    })
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Franchise Management</h1>
          <p className="page-header-subtitle">Register, manage, and monitor all franchise partners</p>
        </div>
        <button className="btn btn-accent" onClick={() => setShowModal(true)}>
          ➕ Register Franchise
        </button>
      </div>

      {/* Stats Row */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-card-icon green">🏪</div>
          <p className="stat-card-label">Total Franchises</p>
          <p className="stat-card-value">{franchises.length}</p>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon blue">✅</div>
          <p className="stat-card-label">Active</p>
          <p className="stat-card-value">{franchises.filter(f => f.status === 'active').length}</p>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon gold">⏳</div>
          <p className="stat-card-label">Pending</p>
          <p className="stat-card-value">{franchises.filter(f => f.status === 'pending').length}</p>
        </div>
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <div className="table-header">
          <p className="table-title">All Franchises</p>
          <div className="table-search">
            🔍
            <input
              type="text"
              placeholder="Search franchises…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Franchise Name</th>
              <th>Owner</th>
              <th>Email</th>
              <th>Region</th>
              <th>Status</th>
              <th>Registered</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2.5rem' }}>
                  {franchises.length === 0 ? 'No franchises registered yet. Add your first one!' : 'No results found.'}
                </td>
              </tr>
            ) : (
              filtered.map(f => (
                <tr key={f.id}>
                  <td style={{ fontWeight: 600 }}>{f.name}</td>
                  <td>{f.owner_name}</td>
                  <td style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>{f.owner_email}</td>
                  <td>{f.region || '—'}</td>
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
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleStatusChange(f.id, 'active')}
                          disabled={isPending}
                        >
                          Activate
                        </button>
                      )}
                      {f.status === 'active' && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleStatusChange(f.id, 'suspended')}
                          disabled={isPending}
                        >
                          Suspend
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <p className="modal-title">Register New Franchise</p>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>

            {formError   && <div className="alert alert-danger">{formError}</div>}
            {formSuccess && (
              <div className="alert alert-success">
                ✅ {formSuccess}
                {newCredentials && (
                  <div style={{ marginTop: '0.75rem', background: 'var(--color-bg-card)', borderRadius: '8px', padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                    <div>📧 <strong>Email:</strong> {newCredentials.email}</div>
                    <div>🔑 <strong>Password:</strong> {newCredentials.password}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '0.4rem' }}>Share these with the franchisee. They can log in via the POS Owner Login tab.</div>
                  </div>
                )}
                {!newCredentials && (
                  <button className="btn btn-ghost btn-sm" style={{ marginTop: '0.5rem' }} onClick={() => { setShowModal(false); setFormSuccess(''); setNewCredentials(null) }}>Close</button>
                )}
              </div>
            )}

            <form onSubmit={handleCreate}>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Franchise Name *</label>
                    <input name="name" className="form-input" placeholder="e.g. Wildshakes BGC" required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Region</label>
                    <input name="region" className="form-input" placeholder="e.g. Metro Manila" />
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
                  <label className="form-label">Initial Portal Password *</label>
                  <input name="password" type="password" className="form-input" placeholder="Min. 8 characters" minLength={8} required />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isPending}>
                  {isPending ? <><span className="loading-spinner" /> Creating…</> : '✅ Register Franchise'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
