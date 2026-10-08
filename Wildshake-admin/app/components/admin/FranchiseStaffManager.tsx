'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { addBranchStaff, setBranchStaffActive, setBranchStaffPin } from '@/lib/actions/masterFranchise'

interface Branch { id: string; name: string }
export interface FranchiseStaffMember {
  id: string; name: string; email: string | null; role: string; pin_code: string | null
  is_active: boolean; created_at: string; branch_id: string | null
}

const ROLES = [
  { value: 'cashier', label: '🧾 Cashier' },
  { value: 'manager', label: '👑 Manager' },
  { value: 'barista', label: '☕ Barista' },
  { value: 'crew', label: '👤 Crew Member' },
  { value: 'kitchen_staff', label: '🍳 Kitchen Staff' },
  { value: 'delivery_rider', label: '🛵 Delivery Rider' },
]
const ROLE_LABEL = Object.fromEntries(ROLES.map(r => [r.value, r.label]))
const PIN_ROLES = new Set(['cashier', 'manager'])

/**
 * The franchise's POS staff, editable by head office: add a person, switch them on or
 * off, or give them a new till PIN. Same powers the franchise owner has on My Staff.
 */
export default function FranchiseStaffManager({ branches, staff: initial }: { branches: Branch[]; staff: FranchiseStaffMember[] }) {
  const router = useRouter()
  const [staff, setStaff] = useState(initial)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', role: 'cashier', pin: '', branch: branches[0]?.id ?? '' })
  const [pinFor, setPinFor] = useState<{ id: string; pin: string } | null>(null)

  const branchName = (id: string | null) => branches.find(b => b.id === id)?.name ?? '—'
  const say = (text: string, bad = false) => { setMsg({ text, bad }); setTimeout(() => setMsg(null), bad ? 6000 : 3000) }

  async function add() {
    setBusy('add')
    const r = await addBranchStaff({ branch_id: form.branch, name: form.name, role: form.role, pin_code: form.pin || null })
    setBusy(null)
    if ('error' in r) return say(r.error, true)
    setStaff(s => [...s, r.staff as FranchiseStaffMember])
    setForm(f => ({ ...f, name: '', pin: '' }))
    setAdding(false)
    say(`${r.staff.name} added. They can sign in on the till now.`)
    router.refresh()
  }

  async function toggle(m: FranchiseStaffMember) {
    if (m.is_active && !confirm(`Deactivate ${m.name}? They will no longer be able to sign in on the till.`)) return
    setBusy(m.id)
    const r = await setBranchStaffActive(m.id, !m.is_active)
    setBusy(null)
    if ('error' in r) return say(r.error, true)
    setStaff(s => s.map(x => x.id === m.id ? { ...x, is_active: !m.is_active } : x))
    say(`${m.name} ${m.is_active ? 'deactivated' : 'reactivated'}.`)
  }

  async function savePin() {
    if (!pinFor) return
    setBusy(pinFor.id)
    const r = await setBranchStaffPin(pinFor.id, pinFor.pin)
    setBusy(null)
    if ('error' in r) return say(r.error, true)
    setStaff(s => s.map(x => x.id === pinFor.id ? { ...x, pin_code: pinFor.pin } : x))
    say('PIN changed.')
    setPinFor(null)
  }

  const pinNeeded = PIN_ROLES.has(form.role)

  return (
    <div className="table-wrapper">
      <div className="table-header" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
        <p className="table-title">Staff Members</p>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span className="badge badge-muted">{staff.length} total · {staff.filter(s => s.is_active).length} active</span>
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(a => !a)}>{adding ? 'Close' : '+ Add staff'}</button>
        </div>
      </div>

      {msg && (
        <div className={`alert ${msg.bad ? 'alert-danger' : 'alert-success'}`} style={{ margin: '0.75rem 1rem' }}>{msg.text}</div>
      )}

      {adding && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end', padding: '0.75rem 1rem', background: 'var(--color-surface-2)' }}>
          <div className="form-group" style={{ margin: 0, flex: '1 1 180px' }}>
            <label className="form-label">Name</label>
            <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Position</label>
            <select className="form-select" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Till PIN{pinNeeded ? '' : ' (optional)'}</label>
            <input className="form-input" inputMode="numeric" maxLength={6} value={form.pin} style={{ width: '110px' }}
              onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 6) }))} placeholder="6 digits" />
          </div>
          {branches.length > 1 && (
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Branch</label>
              <select className="form-select" value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value }))}>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
          <button className="btn btn-primary btn-sm" disabled={busy === 'add' || !form.name.trim() || !form.branch || (pinNeeded && form.pin.length !== 6)} onClick={add}>
            {busy === 'add' ? 'Adding…' : 'Add'}
          </button>
        </div>
      )}

      <table>
        <thead><tr><th>Name</th><th>Role</th><th>Branch</th><th>PIN</th><th>Status</th><th>Joined</th><th></th></tr></thead>
        <tbody>
          {staff.length === 0 ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>No staff added yet</td></tr>
          ) : staff.map(s => (
            <tr key={s.id} style={{ opacity: s.is_active ? 1 : 0.6 }}>
              <td><div style={{ fontWeight: 600 }}>{s.name}</div><div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>{s.email || '—'}</div></td>
              <td><span className={`badge ${s.role === 'manager' ? 'badge-warning' : 'badge-muted'}`}>{ROLE_LABEL[s.role] ?? s.role}</span></td>
              <td style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>{branchName(s.branch_id)}</td>
              <td>
                {pinFor?.id === s.id ? (
                  <span style={{ display: 'inline-flex', gap: '0.35rem' }}>
                    <input className="form-input" inputMode="numeric" maxLength={6} autoFocus value={pinFor.pin} style={{ width: '90px', padding: '0.25rem 0.4rem' }}
                      onChange={e => setPinFor({ id: s.id, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })} placeholder="6 digits" />
                    <button className="btn btn-primary btn-sm" disabled={busy === s.id || pinFor.pin.length !== 6} onClick={savePin}>Save</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setPinFor(null)}>×</button>
                  </span>
                ) : s.pin_code ? <span className="badge badge-success">✓ Set</span> : <span className="badge badge-danger">Not Set</span>}
              </td>
              <td><span className={`badge badge-${s.is_active ? 'success' : 'muted'}`}>{s.is_active ? 'Active' : 'Inactive'}</span></td>
              <td style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{new Date(s.created_at).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                {s.branch_id && (
                  <>
                    <button className="btn btn-ghost btn-sm" disabled={busy === s.id} onClick={() => setPinFor({ id: s.id, pin: '' })}>🔑 PIN</button>
                    <button className={`btn btn-sm ${s.is_active ? 'btn-ghost' : 'btn-primary'}`} disabled={busy === s.id} onClick={() => toggle(s)}>
                      {s.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
