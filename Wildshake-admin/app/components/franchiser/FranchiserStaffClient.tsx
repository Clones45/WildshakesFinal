'use client'

import { useState, useTransition } from 'react'
import { createFranchiserStaff, updateStaffStatus, updateStaffPin } from '@/lib/actions/franchiser'
import { grantPortalAccess, revokePortalAccess, updateStaffPanels } from '@/lib/actions/staff'
import StaffQRModal from '@/components/franchiser/StaffQRModal'
import PortalAccessFields from '@/components/staff/PortalAccessFields'
import { PANELS } from '@/lib/portal/panels'

export interface StaffMember {
  id: string
  name: string
  email: string | null
  role: string
  pin_code: string | null
  qr_access_token: string | null
  is_active: boolean
  created_at: string
  has_portal_access?: boolean
  panels?: string[] | null
}

interface Props {
  branchId: string
  branchName: string
  staff: StaffMember[]
  isOwner: boolean
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
  { value: 'staff',           label: 'Office / Portal Staff', icon: '💻', color: 'badge-muted', description: 'No POS login — web portal access only' },
]

const ROLE_MAP = Object.fromEntries(ALL_ROLES.map(r => [r.value, r]))

export default function FranchiserStaffClient({ branchId, branchName, staff: initialStaff, isOwner }: Props) {
  const [staff, setStaff] = useState(initialStaff)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editPin, setEditPin]   = useState<{ id: string; name: string; pin: string } | null>(null)
  const [qrTarget, setQrTarget] = useState<StaffMember | null>(null)
  const [portalTarget, setPortalTarget] = useState<StaffMember | null>(null)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')
  const [isPending, startTransition] = useTransition()
  const [showAddPin, setShowAddPin]   = useState(false)
  const [showEditPin, setShowEditPin] = useState(false)

  // Add staff form state
  const [form, setForm] = useState({ name: '', role: 'cashier', pin_code: '', grantPortal: false })
  const [portalEmail, setPortalEmail]       = useState('')
  const [portalPassword, setPortalPassword] = useState('')
  const [portalPanels, setPortalPanels]     = useState<string[]>(['dashboard'])

  // Edit-permissions / grant-portal-access modal state (existing staff row)
  const [portalForm, setPortalForm] = useState({ email: '', password: '', panels: [] as string[] })

  const pinRequired = PIN_REQUIRED_ROLES.has(form.role)

  function flash(msg: string, isError = false) {
    if (isError) { setError(msg); setTimeout(() => setError(''), 5000) }
    else          { setSuccess(msg); setTimeout(() => setSuccess(''), 4000) }
  }

  // ── PIN strength validator ──────────────────────────────────────
  function validatePin(pin: string): string | null {
    if (pin.length !== 6) return 'PIN must be exactly 6 digits.'

    // Block all same digits: 111111, 222222
    if (/^(\d)\1{5}$/.test(pin))
      return 'PIN cannot be all the same digit (e.g. 111111).'

    // Block sequential ascending: 123456, 234567, 345678 …
    const digits = pin.split('').map(Number)
    const isAscending = digits.every((d, i) => i === 0 || d === digits[i - 1] + 1)
    if (isAscending) return 'PIN cannot be a sequential number (e.g. 123456).'

    // Block sequential descending: 654321, 987654 …
    const isDescending = digits.every((d, i) => i === 0 || d === digits[i - 1] - 1)
    if (isDescending) return 'PIN cannot be a reverse sequential number (e.g. 654321).'

    return null // ✅ Valid
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
    if (pinRequired) {
      const pinError = validatePin(form.pin_code)
      if (pinError) { flash(pinError, true); return }
    }
    if (form.grantPortal && (!portalEmail || portalPassword.length < 6)) {
      flash('Email and a password of at least 6 characters are required to grant portal access.', true)
      return
    }

    startTransition(async () => {
      const fd = new FormData()
      fd.set('branch_id', branchId)
      fd.set('name', form.name)
      fd.set('role', form.role)
      fd.set('pin_code', form.pin_code)
      const res = await createFranchiserStaff(fd)
      if (res.error) { flash(res.error, true); return }

      let newMember = res.staff!

      if (form.grantPortal) {
        const portalFd = new FormData()
        portalFd.set('email', portalEmail)
        portalFd.set('password', portalPassword)
        portalPanels.forEach(p => portalFd.append('panels', p))
        const portalRes = await grantPortalAccess(newMember.id, portalFd)
        if (portalRes.error) {
          flash(`Staff created, but portal access failed: ${portalRes.error}`, true)
        } else {
          newMember = { ...newMember, email: portalEmail, has_portal_access: true, panels: portalPanels }
        }
      }

      setStaff(prev => [...prev, newMember])
      setForm({ name: '', role: 'cashier', pin_code: '', grantPortal: false })
      setPortalEmail(''); setPortalPassword(''); setPortalPanels(['dashboard'])
      setShowAddModal(false)
      flash(`${newMember.name} added successfully!`)
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
    if (!editPin) return
    const pinError = validatePin(editPin.pin)
    if (pinError) { flash(pinError, true); return }
    startTransition(async () => {
      const res = await updateStaffPin(editPin.id, editPin.pin)
      if (res.error) { flash(res.error, true); return }
      setStaff(prev => prev.map(s => s.id === editPin.id ? { ...s, pin_code: editPin.pin } : s))
      setEditPin(null)
      flash('PIN updated successfully.')
    })
  }

  function openPortalModal(member: StaffMember) {
    setPortalForm({
      email: member.email || '',
      password: '',
      // Editing an existing portal account shows their real current panels;
      // granting portal access to a PIN-only staffer for the first time starts
      // with just Dashboard checked as a sensible default (fully optional).
      panels: member.has_portal_access ? (member.panels || []) : ['dashboard'],
    })
    setPortalTarget(member)
  }

  async function handleSavePortal() {
    if (!portalTarget) return

    if (portalTarget.has_portal_access) {
      startTransition(async () => {
        const res = await updateStaffPanels(portalTarget.id, portalForm.panels)
        if (res.error) { flash(res.error, true); return }
        setStaff(prev => prev.map(s => s.id === portalTarget.id ? { ...s, panels: portalForm.panels } : s))
        setPortalTarget(null)
        flash('Panel permissions updated.')
      })
      return
    }

    if (!portalForm.email || portalForm.password.length < 6) {
      flash('Email and a password of at least 6 characters are required.', true)
      return
    }

    startTransition(async () => {
      const fd = new FormData()
      fd.set('email', portalForm.email)
      fd.set('password', portalForm.password)
      portalForm.panels.forEach(p => fd.append('panels', p))
      const res = await grantPortalAccess(portalTarget.id, fd)
      if (res.error) { flash(res.error, true); return }
      setStaff(prev => prev.map(s => s.id === portalTarget.id
        ? { ...s, email: portalForm.email, has_portal_access: true, panels: portalForm.panels }
        : s))
      setPortalTarget(null)
      flash('Portal access granted.')
    })
  }

  async function handleRevokePortal(member: StaffMember) {
    if (!confirm(`Remove portal access for ${member.name}? They will no longer be able to log into the web admin.`)) return
    startTransition(async () => {
      const res = await revokePortalAccess(member.id)
      if (res.error) { flash(res.error, true); return }
      setStaff(prev => prev.map(s => s.id === member.id ? { ...s, has_portal_access: false, panels: [] } : s))
      flash(`Portal access removed for ${member.name}.`)
    })
  }

  function handleQRTokenUpdated(staffId: string, newToken: string) {
    setStaff(prev => prev.map(s => s.id === staffId ? { ...s, qr_access_token: newToken } : s))
    // Update the modal target's token in-place so the QR re-renders immediately
    setQrTarget(prev => prev && prev.id === staffId ? { ...prev, qr_access_token: newToken } : prev)
    flash('Access QR updated successfully.')
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
        {isOwner && (
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            + Add Staff Member
          </button>
        )}
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
          <p className="table-title">My Staff</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>PIN</th>
              <th>Access QR</th>
              <th>Portal Access</th>
              <th>Status</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {staff.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--color-text-muted)' }}>
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
                      {isOwner && (
                        <button
                          onClick={() => { setShowEditPin(false); setEditPin({ id: member.id, name: member.name, pin: member.pin_code || '' }) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary-light)', fontSize: '0.75rem', fontWeight: 600 }}
                        >
                          ✏️ Change
                        </button>
                      )}
                    </div>
                  ) : (
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>N/A</span>
                  )}
                </td>
                <td>
                  {PIN_REQUIRED_ROLES.has(member.role) ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span
                        onClick={() => setQrTarget(member)}
                        title="View / Generate Access QR"
                        style={{
                          cursor: 'pointer',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '8px',
                          background: member.qr_access_token ? 'rgba(74,222,128,0.12)' : 'rgba(250,204,21,0.12)',
                          color: member.qr_access_token ? 'var(--color-success, #4ade80)' : 'var(--color-warning, #facc15)',
                          border: `1px solid ${member.qr_access_token ? 'rgba(74,222,128,0.3)' : 'rgba(250,204,21,0.3)'}`,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {member.qr_access_token ? '📲 Active' : '⚠️ None'}
                      </span>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>N/A</span>
                  )}
                </td>
                <td>
                  {member.has_portal_access ? (
                    <span className="badge badge-success" style={{ fontSize: '0.72rem' }}>
                      🔑 {(member.panels || []).length} panel{(member.panels || []).length !== 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>— POS only</span>
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
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {PIN_REQUIRED_ROLES.has(member.role) && (
                      <button
                        onClick={() => setQrTarget(member)}
                        disabled={isPending}
                        className="btn btn-sm btn-ghost"
                        title="View / Generate Access QR"
                      >
                        📲 QR
                      </button>
                    )}
                    {isOwner && (
                      <button
                        onClick={() => openPortalModal(member)}
                        disabled={isPending}
                        className="btn btn-sm btn-ghost"
                        title={member.has_portal_access ? 'Edit panel permissions' : 'Grant portal access'}
                      >
                        {member.has_portal_access ? '✏️ Permissions' : '🔑 Grant Portal'}
                      </button>
                    )}
                    {isOwner && member.has_portal_access && (
                      <button
                        onClick={() => handleRevokePortal(member)}
                        disabled={isPending}
                        className="btn btn-sm btn-ghost"
                        title="Remove portal (web) access"
                      >
                        🚫 Revoke Portal
                      </button>
                    )}
                    {isOwner && (
                      <button
                        onClick={() => handleToggleActive(member)}
                        disabled={isPending}
                        className={`btn btn-sm ${member.is_active ? 'btn-ghost' : 'btn-primary'}`}
                      >
                        {member.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    )}
                  </div>
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
                    <div style={{ position: 'relative' }}>
                      <input
                        className="form-input"
                        type={showAddPin ? 'text' : 'password'}
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="e.g. 123456"
                        value={form.pin_code}
                        onChange={e => setForm(f => ({ ...f, pin_code: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                        style={{ fontFamily: 'monospace', letterSpacing: '0.25em', fontSize: '1.2rem', paddingRight: '2.5rem' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowAddPin(v => !v)}
                        title={showAddPin ? 'Hide PIN' : 'Show PIN'}
                        style={{
                          position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)',
                          background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.95rem',
                          color: 'var(--color-text-muted)', padding: '0.2rem',
                        }}
                      >
                        {showAddPin ? '🙈' : '👁️'}
                      </button>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                      🔐 Required — this staff logs in on the POS terminal using this PIN.
                    </p>
                  </div>
                )}

                <div className="form-group" style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.grantPortal}
                      onChange={e => setForm(f => ({ ...f, grantPortal: e.target.checked }))}
                    />
                    <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Also grant web portal access</span>
                  </label>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                    Lets this person log into the admin portal (separate from the PIN above) with only the panels you choose.
                  </p>
                </div>

                {form.grantPortal && (
                  <PortalAccessFields
                    panels={PANELS.franchise}
                    email={portalEmail}
                    password={portalPassword}
                    selectedPanels={portalPanels}
                    onEmailChange={setPortalEmail}
                    onPasswordChange={setPortalPassword}
                    onPanelsChange={setPortalPanels}
                  />
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
                <div style={{ position: 'relative' }}>
                  <input
                    className="form-input"
                    type={showEditPin ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={6}
                    autoFocus
                    value={editPin.pin}
                    onChange={e => setEditPin(p => p ? { ...p, pin: e.target.value.replace(/\D/g, '').slice(0, 6) } : null)}
                    style={{ fontFamily: 'monospace', letterSpacing: '0.3em', fontSize: '1.4rem', textAlign: 'center', paddingRight: '2.5rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPin(v => !v)}
                    title={showEditPin ? 'Hide PIN' : 'Show PIN'}
                    style={{
                      position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.95rem',
                      color: 'var(--color-text-muted)', padding: '0.2rem',
                    }}
                  >
                    {showEditPin ? '🙈' : '👁️'}
                  </button>
                </div>
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

      {/* Grant Portal Access / Edit Permissions Modal */}
      {portalTarget && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setPortalTarget(null) }}>
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">
                {portalTarget.has_portal_access ? 'Edit Permissions' : 'Grant Portal Access'} — {portalTarget.name}
              </h3>
              <button className="modal-close" onClick={() => setPortalTarget(null)}>✕</button>
            </div>
            <div className="modal-body">
              {portalTarget.has_portal_access ? (
                <PortalAccessFields
                  panels={PANELS.franchise}
                  email=""
                  password=""
                  selectedPanels={portalForm.panels}
                  onEmailChange={() => {}}
                  onPasswordChange={() => {}}
                  onPanelsChange={panels => setPortalForm(f => ({ ...f, panels }))}
                  showCredentials={false}
                />
              ) : (
                <PortalAccessFields
                  panels={PANELS.franchise}
                  email={portalForm.email}
                  password={portalForm.password}
                  selectedPanels={portalForm.panels}
                  onEmailChange={email => setPortalForm(f => ({ ...f, email }))}
                  onPasswordChange={password => setPortalForm(f => ({ ...f, password }))}
                  onPanelsChange={panels => setPortalForm(f => ({ ...f, panels }))}
                />
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setPortalTarget(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSavePortal} disabled={isPending}>
                {isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {qrTarget && (
        <StaffQRModal
          staff={qrTarget}
          onClose={() => setQrTarget(null)}
          onTokenUpdated={handleQRTokenUpdated}
        />
      )}
    </div>
  )
}
