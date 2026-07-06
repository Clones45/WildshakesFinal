'use client'

import { useState, useTransition } from 'react'
import { updateStaffStatus } from '@/lib/actions/franchiser'
import { createStaffMember, updateStaffPanels } from '@/lib/actions/staff'
import PortalAccessFields from '@/components/staff/PortalAccessFields'
import { PANELS } from '@/lib/portal/panels'

export interface AdminStaffMember {
  id: string
  name: string
  email: string | null
  is_active: boolean
  created_at: string
  has_portal_access: boolean
  panels: string[] | null
}

interface Props {
  staff: AdminStaffMember[]
}

export default function AdminStaffClient({ staff: initialStaff }: Props) {
  const [staff, setStaff] = useState(initialStaff)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editTarget, setEditTarget] = useState<AdminStaffMember | null>(null)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')
  const [isPending, startTransition] = useTransition()

  const [form, setForm] = useState({ name: '', email: '', password: '', panels: ['dashboard'] as string[] })
  const [editPanels, setEditPanels] = useState<string[]>([])

  function flash(msg: string, isError = false) {
    if (isError) { setError(msg); setTimeout(() => setError(''), 5000) }
    else          { setSuccess(msg); setTimeout(() => setSuccess(''), 4000) }
  }

  async function handleAddStaff(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.email.trim() || form.password.length < 6) {
      flash('Name, email, and a password of at least 6 characters are required.', true)
      return
    }
    startTransition(async () => {
      const fd = new FormData()
      fd.set('name', form.name)
      fd.set('email', form.email)
      fd.set('password', form.password)
      form.panels.forEach(p => fd.append('panels', p))
      const res = await createStaffMember(fd)
      if (res.error) { flash(res.error, true); return }
      setStaff(prev => [...prev, res.staff as AdminStaffMember])
      setForm({ name: '', email: '', password: '', panels: ['dashboard'] })
      setShowAddModal(false)
      flash(`${res.staff!.name} added successfully!`)
    })
  }

  async function handleToggleActive(member: AdminStaffMember) {
    startTransition(async () => {
      const res = await updateStaffStatus(member.id, !member.is_active)
      if (res.error) { flash(res.error, true); return }
      setStaff(prev => prev.map(s => s.id === member.id ? { ...s, is_active: !s.is_active } : s))
      flash(`${member.name} ${!member.is_active ? 'activated' : 'deactivated'}.`)
    })
  }

  function openEditModal(member: AdminStaffMember) {
    setEditPanels(member.panels || [])
    setEditTarget(member)
  }

  async function handleSavePanels() {
    if (!editTarget) return
    startTransition(async () => {
      const res = await updateStaffPanels(editTarget.id, editPanels)
      if (res.error) { flash(res.error, true); return }
      setStaff(prev => prev.map(s => s.id === editTarget.id ? { ...s, panels: editPanels } : s))
      setEditTarget(null)
      flash('Panel permissions updated.')
    })
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Staff Management</h1>
          <p className="page-header-subtitle">{staff.length} staff member{staff.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          + Add Staff Member
        </button>
      </div>

      {error   && <div className="alert alert-danger"  style={{ marginBottom: '1rem' }}>⚠️ {error}</div>}
      {success && <div className="alert alert-success" style={{ marginBottom: '1rem' }}>✅ {success}</div>}

      <div className="table-wrapper">
        <div className="table-header">
          <p className="table-title">Portal Staff</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Panels</th>
              <th>Status</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {staff.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--color-text-muted)' }}>
                  No staff members yet.
                </td>
              </tr>
            ) : staff.map(member => (
              <tr key={member.id} style={{ opacity: member.is_active ? 1 : 0.5 }}>
                <td style={{ fontWeight: 600 }}>{member.name}</td>
                <td style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>{member.email}</td>
                <td>
                  <span className="badge badge-success" style={{ fontSize: '0.72rem' }}>
                    🔑 {(member.panels || []).length} panel{(member.panels || []).length !== 1 ? 's' : ''}
                  </span>
                </td>
                <td>
                  <span className={`badge ${member.is_active ? 'badge-success' : 'badge-danger'}`}>
                    {member.is_active ? '● Active' : '○ Inactive'}
                  </span>
                </td>
                <td style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                  {new Date(member.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <button onClick={() => openEditModal(member)} disabled={isPending} className="btn btn-sm btn-ghost">
                      ✏️ Permissions
                    </button>
                    <button
                      onClick={() => handleToggleActive(member)}
                      disabled={isPending}
                      className={`btn btn-sm ${member.is_active ? 'btn-ghost' : 'btn-primary'}`}
                    >
                      {member.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowAddModal(false) }}>
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">Add Staff Member</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAddStaff}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  <input
                    className="form-input"
                    placeholder="e.g. Maria Santos"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    required
                  />
                </div>
                <PortalAccessFields
                  panels={PANELS.master_admin}
                  email={form.email}
                  password={form.password}
                  selectedPanels={form.panels}
                  onEmailChange={email => setForm(f => ({ ...f, email }))}
                  onPasswordChange={password => setForm(f => ({ ...f, password }))}
                  onPanelsChange={panels => setForm(f => ({ ...f, panels }))}
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isPending}>
                  {isPending ? 'Adding…' : '+ Add Staff'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editTarget && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setEditTarget(null) }}>
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">Edit Permissions — {editTarget.name}</h3>
              <button className="modal-close" onClick={() => setEditTarget(null)}>✕</button>
            </div>
            <div className="modal-body">
              <PortalAccessFields
                panels={PANELS.master_admin}
                email=""
                password=""
                selectedPanels={editPanels}
                onEmailChange={() => {}}
                onPasswordChange={() => {}}
                onPanelsChange={setEditPanels}
                showCredentials={false}
              />
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setEditTarget(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSavePanels} disabled={isPending}>
                {isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
