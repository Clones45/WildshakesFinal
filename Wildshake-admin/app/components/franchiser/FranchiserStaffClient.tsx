'use client'

import { useState, useTransition } from 'react'
import { createFranchiserStaff, updateStaffStatus, updateStaffPin } from '@/lib/actions/franchiser'

export interface StaffMember {
  id: string
  name: string
  email: string | null
  role: string
  pin_code: string | null
  is_active: boolean
  created_at: string
}

interface Props {
  branchId: string
  branchName: string
  staff: StaffMember[]
}

// Roles that require a PIN (they authenticate on the POS terminal)
const PIN_REQUIRED_ROLES = new Set(['cashier', 'manager'])

const ALL_ROLES = [
  { value: 'cashier',         label: 'Cashier',           icon: '🧾', color: 'badge-info',    description: 'Handles orders & payments' },
  { value: 'manager',         label: 'Manager',           icon: '👑', color: 'badge-warning', description: 'Supervises operations & can void transactions' },
  { value: 'barista',         label: 'Barista',           icon: '☕', color: 'badge-muted',   description: 'Prepares beverages' },
  { value: 'crew',            label: 'Crew Member',       icon: '👤', color: 'badge-muted',   description: 'General branch staff' },
  { value: 'kitchen_staff',   label: 'Kitchen Staff',     icon: '🍳', color: 'badge-muted',   description: 'Prepares food items' },
  { value: 'delivery_rider',  label: 'Delivery Rider',    icon: '🛵', color: 'badge-muted',   description: 'Handles deliveries' },
  { value: 'supervisor',      label: 'Supervisor',        icon: '🏷️', color: 'badge-warning', description: 'Assists manager in daily operations' },
  { value: 'investor',        label: 'Investor',          icon: '📊', color: 'badge-success', description: 'Branch co-owner / silent investor' },
]

const ROLE_MAP = Object.fromEntries(ALL_ROLES.map(r => [r.value, r]))

export default function FranchiserStaffClient({ branchId, branchName, staff: initialStaff }: Props) {
  const [staff, setStaff] = useState(initialStaff)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editPin, setEditPin]   = useState<{ id: string; name: string; pin: string } | null>(null)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')
  const [isPending, startTransition] = useTransition()

  // Add staff form state
  const [form, setForm] = useState({ name: '', role: 'cashier', pin_code: '' })

  const pinRequired = PIN_REQUIRED_ROLES.has(form.role)

  function flash(msg: string, isError = false) {
    if (isError) { setError(msg); setTimeout(() => setError(''), 4000) }
    else          { setSuccess(msg); setTimeout(() => setSuccess(''), 4000) }
  }

  function handleRoleChange(newRole: string) {
    // Clear PIN when switching to a role that doesn't require it
    setForm(f => ({
      ...f,
      role: newRole,
      pin_code: PIN_REQUIRED_ROLES.has(newRole) ? f.pin_code : '',
    }))
  }

  async function handleAddStaff(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      flash('Name is required.', true); return
    }
    if (pinRequired && form.pin_code.length !== 6) {
      flash('PIN must be exactly 6 digits for this role.', true); return
    }
    startTransition(async () => {
      const fd = new FormData()
      fd.set('branch_id', branchId)
      fd.set('name', form.name)
      fd.set('role', form.role)
      fd.set('pin_code', form.pin_code)
      const res = await createFranchiserStaff(fd)
      if (res.error) { flash(res.error, true); return }
      setStaff(prev => [...prev, res.staff!])
      setForm({ name: '', role: 'cashier', pin_code: '' })
      setShowAddModal(false)
      flash(`${res.staff!.name} added successfully!`)
    })
  }

  async function handleToggleActive(member: StaffMember) {
    startTransition(async () => {
      const res = await updateStaffStatus(member.id, !member.is_active)
      if (res.error) { flash(res.error, true); return }
      setStaff(prev => prev.map(s => s.id === member.id ? { ...s, is_active: !s.is_active } : s))
      flash(`${member.name} ${!member.is_active ? 'activated' : 'deactivated'}.`)
    })
  }

  async function handleSavePin() {
    if (!editPin || editPin.pin.length !== 6) { flash('PIN must be exactly 6 digits.', true); return }
    startTransition(async () => {
      const res = await updateStaffPin(editPin.id, editPin.pin)
      if (res.error) { flash(res.error, true); return }
      setStaff(prev => prev.map(s => s.id === editPin.id ? { ...s, pin_code: editPin.pin } : s))
      setEditPin(null)
      flash('PIN updated successfully.')
    })
  }

  const activeCount   = staff.filter(s => s.is_active).length
  const managerCount  = staff.filter(s => s.role === 'manager').length
  const cashierCount  = staff.filter(s => s.role === 'cashier').length

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Staff Management</h1>
          <p className="page-header-subtitle">{branchName} — {staff.length} staff member{staff.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          + Add Staff Member
        </button>
      </div>

      {/* Flash messages */}
      {error   && <div className="alert alert-danger"   style={{ marginBottom: '1rem' }}>⚠️ {error}</div>}
      {success && <div className="alert alert-success"  style={{ marginBottom: '1rem' }}>✅ {success}</div>}

      {/* Summary pills */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <span className="badge badge-success">{activeCount} Active</span>
        <span className="badge badge-warning">{managerCount} Manager{managerCount !== 1 ? 's' : ''}</span>
        <span className="badge badge-info">{cashierCount} Cashier{cashierCount !== 1 ? 's' : ''}</span>
      </div>

      {/* Staff Table */}
      <div className="table-wrapper">
        <div className="table-header">
          <p className="table-title">My Branch Staff</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>PIN</th>
              <th>Status</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {staff.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--color-text-muted)' }}>
                  No staff members yet — add your first cashier!
                </td>
              </tr>
            ) : staff.map(member => (
              <tr key={member.id} style={{ opacity: member.is_active ? 1 : 0.5 }}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%',
                      background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: '0.75rem', color: 'white', flexShrink: 0,
                    }}>
                      {member.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text)' }}>{member.name}</p>
                      {member.email && <p style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>{member.email}</p>}
                    </div>
                  </div>
                </td>
                <td>
                  <span className={`badge ${ROLE_MAP[member.role]?.color || 'badge-muted'}`}>
                    {ROLE_MAP[member.role]?.icon} {ROLE_MAP[member.role]?.label || member.role}
                  </span>
                </td>
                <td>
                  {PIN_REQUIRED_ROLES.has(member.role) ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.875rem', letterSpacing: '0.12em' }}>
                        {member.pin_code ? '●'.repeat(member.pin_code.length) : <span style={{ color: 'var(--color-danger)', fontFamily: 'inherit' }}>Not set</span>}
                      </span>
                      <button
                        onClick={() => setEditPin({ id: member.id, name: member.name, pin: member.pin_code || '' })}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary-light)', fontSize: '0.75rem', fontWeight: 600 }}
                      >
                        ✏️ Change
                      </button>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>N/A</span>
                  )}
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
                  <button
                    onClick={() => handleToggleActive(member)}
                    disabled={isPending}
                    className={`btn btn-sm ${member.is_active ? 'btn-ghost' : 'btn-primary'}`}
                  >
                    {member.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Staff Modal */}
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
                <div className="form-group">
                  <label className="form-label">Position / Role</label>
                  <select
                    className="form-select"
                    value={form.role}
                    onChange={e => handleRoleChange(e.target.value)}
                  >
                    {ALL_ROLES.map(r => (
                      <option key={r.value} value={r.value}>
                        {r.icon} {r.label}
                      </option>
                    ))}
                  </select>
                  {ROLE_MAP[form.role] && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                      {ROLE_MAP[form.role].description}
                    </p>
                  )}
                </div>

                {pinRequired && (
                  <div className="form-group">
                    <label className="form-label">6-Digit PIN *</label>
                    <input
                      className="form-input"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="e.g. 123456"
                      value={form.pin_code}
                      onChange={e => setForm(f => ({ ...f, pin_code: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                      style={{ fontFamily: 'monospace', letterSpacing: '0.25em', fontSize: '1.2rem' }}
                    />
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                      🔐 Required — this staff logs in on the POS terminal using this PIN.
                    </p>
                  </div>
                )}
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

      {/* Edit PIN Modal */}
      {editPin && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setEditPin(null) }}>
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">Change PIN — {editPin.name}</h3>
              <button className="modal-close" onClick={() => setEditPin(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">New 6-Digit PIN</label>
                <input
                  className="form-input"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  value={editPin.pin}
                  onChange={e => setEditPin(p => p ? { ...p, pin: e.target.value.replace(/\D/g, '').slice(0, 6) } : null)}
                  style={{ fontFamily: 'monospace', letterSpacing: '0.3em', fontSize: '1.4rem', textAlign: 'center' }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setEditPin(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSavePin} disabled={isPending || editPin.pin.length !== 6}>
                {isPending ? 'Saving…' : 'Save PIN'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
