'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { createFranchise, updateFranchiseStatus } from '@/lib/actions/franchises'
import { createCommissaryBranch, updateCommissaryBranchStatus } from '@/lib/actions/commissaryBranch'

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
  parent_commissary_id: string | null
  branches?: Branch[]
}

interface CommissaryBranch {
  id: string
  name: string
  contact_email: string
  region: string | null
  status: string
  created_at: string
}

interface Props {
  franchises: Franchise[]
  commissaryBranches: CommissaryBranch[]
}

export default function FranchisesClient({ franchises, commissaryBranches }: Props) {
  const [activeTab, setActiveTab]     = useState<'franchises' | 'commissary'>('franchises')
  const [showModal, setShowModal]     = useState(false)
  const [showCommModal, setShowCommModal] = useState(false)
  const [search, setSearch]           = useState('')
  const [formError, setFormError]     = useState('')
  const [formSuccess, setFormSuccess] = useState('')
  const [newCredentials, setNewCredentials] = useState<{
    email: string; password: string; branchName?: string; isCommissary?: boolean
  } | null>(null)
  const [isPending, startTransition]  = useTransition()

  // ── Franchise tab ──────────────────────────────────────────────────
  const commMap = Object.fromEntries(commissaryBranches.map(c => [c.id, c]))

  const filteredFranchises = franchises.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    f.owner_name.toLowerCase().includes(search.toLowerCase()) ||
    (f.region || '').toLowerCase().includes(search.toLowerCase())
  )

  const filteredCommissary = commissaryBranches.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.region || '').toLowerCase().includes(search.toLowerCase())
  )

  // Direct franchises = those with no parent commissary
  const directFranchises       = franchises.filter(f => !f.parent_commissary_id)
  const commissaryFranchises   = franchises.filter(f => f.parent_commissary_id)

  async function handleCreateFranchise(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError('')
    setFormSuccess('')
    setNewCredentials(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await createFranchise(fd)
      if (result.error) { setFormError(result.error); return }
      setFormSuccess('Franchise registered successfully!')
      if (result.credentials) setNewCredentials({ ...result.credentials, branchName: result.branchName })
    })
  }

  async function handleCreateCommissary(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError('')
    setFormSuccess('')
    setNewCredentials(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await createCommissaryBranch(fd)
      if (result.error) { setFormError(result.error); return }
      setFormSuccess('Commissary branch created successfully!')
      if (result.credentials) setNewCredentials({ ...result.credentials, isCommissary: true })
    })
  }

  async function handleFranchiseStatus(id: string, status: string) {
    startTransition(async () => { await updateFranchiseStatus(id, status) })
  }

  async function handleCommissaryStatus(id: string, status: string) {
    startTransition(async () => { await updateCommissaryBranchStatus(id, status) })
  }

  function closeModal() {
    setShowModal(false); setShowCommModal(false)
    setFormError(''); setFormSuccess(''); setNewCredentials(null)
  }

  const totalBranches = franchises.reduce((s, f) => s + (f.branches?.length || 0), 0)
  const activePOS     = franchises.reduce((s, f) => s + (f.branches || []).filter(b => b.active_device_id).length, 0)

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Franchise Management</h1>
          <p className="page-header-subtitle">Manage franchisee partners and commissary branches</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {activeTab === 'commissary' ? (
            <button className="btn btn-accent" onClick={() => setShowCommModal(true)}>
              🏭 Add Commissary Branch
            </button>
          ) : (
            <button className="btn btn-accent" onClick={() => setShowModal(true)}>
              ➕ Register Franchise
            </button>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="stat-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-card-icon green">🏪</div>
          <p className="stat-card-label">Total Franchises</p>
          <p className="stat-card-value">{franchises.length}</p>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon blue">🏭</div>
          <p className="stat-card-label">Commissary Branches</p>
          <p className="stat-card-value">{commissaryBranches.length}</p>
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

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
        {([
          { key: 'franchises', label: `🏪 Franchises (${franchises.length})` },
          { key: 'commissary', label: `🏭 Commissary Branches (${commissaryBranches.length})` },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setSearch('') }}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid',
              borderColor: activeTab === tab.key ? 'var(--color-primary)' : 'transparent',
              background: activeTab === tab.key ? 'rgba(74,124,89,0.12)' : 'transparent',
              color: activeTab === tab.key ? 'var(--color-primary-light)' : 'var(--color-text-muted)',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="table-wrapper">
        <div className="table-header">
          <p className="table-title">
            {activeTab === 'franchises' ? 'All Franchises' : 'All Commissary Branches'}
          </p>
          <div className="table-search">
            🔍
            <input
              type="text"
              placeholder={activeTab === 'franchises' ? 'Search franchises…' : 'Search commissary…'}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* ── Franchises Tab ── */}
        {activeTab === 'franchises' && (
          <table>
            <thead>
              <tr>
                <th>Franchise</th>
                <th>Owner</th>
                <th>Parent</th>
                <th>Region</th>
                <th>Branches</th>
                <th>Status</th>
                <th>Registered</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredFranchises.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2.5rem' }}>
                    {franchises.length === 0 ? 'No franchises registered yet.' : 'No results found.'}
                  </td>
                </tr>
              ) : (
                filteredFranchises.map(f => {
                  const branches = f.branches || []
                  const parentComm = f.parent_commissary_id ? commMap[f.parent_commissary_id] : null
                  return (
                    <tr key={f.id}>
                      <td>
                        <Link href={`/franchises/${f.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                          <div style={{ fontWeight: 700, color: 'var(--color-accent)', cursor: 'pointer' }}>{f.name}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>{f.owner_email}</div>
                        </Link>
                      </td>
                      <td>{f.owner_name}</td>
                      <td>
                        {parentComm ? (
                          <span className="badge badge-muted" style={{ fontSize: '0.7rem' }}>
                            🏭 {parentComm.name}
                          </span>
                        ) : (
                          <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                            ⭐ Main Admin
                          </span>
                        )}
                      </td>
                      <td>{f.region || '—'}</td>
                      <td>
                        {branches.length === 0 ? (
                          <span className="badge badge-danger">⚠ No Branch</span>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            {branches.map(b => (
                              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                                <span style={{
                                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                                  background: b.active_device_id ? 'var(--color-success)' : '#555',
                                  display: 'inline-block',
                                }} />
                                <span>{b.name}</span>
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
                            <button className="btn btn-ghost btn-sm" onClick={() => handleFranchiseStatus(f.id, 'active')} disabled={isPending}>
                              Activate
                            </button>
                          )}
                          {f.status === 'active' && (
                            <button className="btn btn-danger btn-sm" onClick={() => handleFranchiseStatus(f.id, 'suspended')} disabled={isPending}>
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
        )}

        {/* ── Commissary Branches Tab ── */}
        {activeTab === 'commissary' && (
          <table>
            <thead>
              <tr>
                <th>Commissary Branch</th>
                <th>Email</th>
                <th>Region</th>
                <th>Franchisees</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCommissary.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2.5rem' }}>
                    {commissaryBranches.length === 0 ? 'No commissary branches yet.' : 'No results found.'}
                  </td>
                </tr>
              ) : (
                filteredCommissary.map(c => {
                  const franchiseeCount = franchises.filter(f => f.parent_commissary_id === c.id).length
                  return (
                    <tr key={c.id}>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--color-accent)' }}>🏭 {c.name}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>{c.contact_email}</div>
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>{c.contact_email}</td>
                      <td>{c.region || '—'}</td>
                      <td>
                        <span className="badge badge-muted">{franchiseeCount} franchisee{franchiseeCount !== 1 ? 's' : ''}</span>
                      </td>
                      <td>
                        <span className={`badge badge-${c.status === 'active' ? 'success' : c.status === 'suspended' ? 'danger' : 'warning'}`}>
                          {c.status}
                        </span>
                      </td>
                      <td style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                        {new Date(c.created_at).toLocaleDateString('en-PH')}
                      </td>
                      <td>
                        <div className="flex gap-1">
                          {c.status !== 'active' && (
                            <button className="btn btn-ghost btn-sm" onClick={() => handleCommissaryStatus(c.id, 'active')} disabled={isPending}>
                              Activate
                            </button>
                          )}
                          {c.status === 'active' && (
                            <button className="btn btn-danger btn-sm" onClick={() => handleCommissaryStatus(c.id, 'suspended')} disabled={isPending}>
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
        )}
      </div>

      {/* ── Create Franchise Modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <p className="modal-title">Register New Franchise</p>
              <button className="modal-close" onClick={closeModal}>✕</button>
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
                      {newCredentials.branchName && <div>🏪 <strong>Branch:</strong> {newCredentials.branchName}</div>}
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={closeModal}>Done</button>
                  </>
                )}
              </div>
            )}
            {!formSuccess && (
              <form onSubmit={handleCreateFranchise}>
                <div className="modal-body">
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label">Franchise Name *</label>
                      <input name="name" className="form-input" placeholder="e.g. Wildshakes BGC" required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Region / Location *</label>
                      <input name="region" className="form-input" placeholder="e.g. Metro Manila" required />
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
                    <label className="form-label">Assign to Commissary Branch (optional)</label>
                    <select name="parent_commissary_id" className="form-input">
                      <option value="">— Direct under Main Admin —</option>
                      {commissaryBranches.filter(c => c.status === 'active').map(c => (
                        <option key={c.id} value={c.id}>🏭 {c.name}</option>
                      ))}
                    </select>
                    <p style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                      If blank, Main Admin will be the parent commissary.
                    </p>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Portal Password *</label>
                    <input name="password" type="password" className="form-input" placeholder="Min. 8 characters" minLength={8} required />
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-ghost" onClick={closeModal}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={isPending}>
                    {isPending ? <><span className="loading-spinner" />Creating…</> : '✅ Register Franchise'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── Create Commissary Branch Modal ── */}
      {showCommModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <p className="modal-title">🏭 Create Commissary Branch</p>
              <button className="modal-close" onClick={closeModal}>✕</button>
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
                      <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
                        This account logs in to the Commissary Portal at /commissary-portal
                      </div>
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={closeModal}>Done</button>
                  </>
                )}
              </div>
            )}
            {!formSuccess && (
              <form onSubmit={handleCreateCommissary}>
                <div className="modal-body">
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label">Branch Name *</label>
                      <input name="name" className="form-input" placeholder="e.g. Commissary Davao" required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Region / Location</label>
                      <input name="region" className="form-input" placeholder="e.g. Davao City" />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Contact Email *</label>
                    <input name="contact_email" type="email" className="form-input" placeholder="commissary@email.com" required />
                    <p style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                      This will be the login email for the commissary portal.
                    </p>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Portal Password *</label>
                    <input name="password" type="password" className="form-input" placeholder="Min. 8 characters" minLength={8} required />
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-ghost" onClick={closeModal}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={isPending}>
                    {isPending ? <><span className="loading-spinner" />Creating…</> : '🏭 Create Commissary Branch'}
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
