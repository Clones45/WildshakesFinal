'use client'

import { ALWAYS_ON_PANEL, type PanelDef } from '@/lib/portal/panels'

interface Props {
  panels: PanelDef[]
  email: string
  password: string
  selectedPanels: string[]
  onEmailChange: (v: string) => void
  onPasswordChange: (v: string) => void
  onPanelsChange: (panels: string[]) => void
  // When editing an existing portal account, credentials aren't part of this
  // form (there's a separate reset-password flow) -- only panels are shown.
  showCredentials?: boolean
}

// Shared email/password/panel-checkbox form used by all 3 tiers' staff-management
// UIs when granting or editing portal access, so the form only exists once.
export default function PortalAccessFields({
  panels, email, password, selectedPanels, onEmailChange, onPasswordChange, onPanelsChange,
  showCredentials = true,
}: Props) {
  function togglePanel(key: string) {
    if (key === ALWAYS_ON_PANEL) return
    onPanelsChange(
      selectedPanels.includes(key)
        ? selectedPanels.filter(p => p !== key)
        : [...selectedPanels, key]
    )
  }

  return (
    <>
      {showCredentials && (
        <>
          <div className="form-group">
            <label className="form-label">Email *</label>
            <input
              className="form-input"
              type="email"
              value={email}
              onChange={e => onEmailChange(e.target.value)}
              placeholder="staff@example.com"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password *</label>
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={e => onPasswordChange(e.target.value)}
              placeholder="Set an initial password"
              minLength={6}
              required
            />
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
              🔐 The staff member can log in with this right away — they can change it later.
            </p>
          </div>
        </>
      )}
      <div className="form-group">
        <label className="form-label">Panel Access</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          {panels.map(p => (
            <label
              key={p.key}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                fontSize: '0.85rem', opacity: p.key === ALWAYS_ON_PANEL ? 0.6 : 1,
                cursor: p.key === ALWAYS_ON_PANEL ? 'default' : 'pointer',
              }}
            >
              <input
                type="checkbox"
                name="panels"
                value={p.key}
                checked={p.key === ALWAYS_ON_PANEL || selectedPanels.includes(p.key)}
                disabled={p.key === ALWAYS_ON_PANEL}
                onChange={() => togglePanel(p.key)}
              />
              {p.icon} {p.label}
            </label>
          ))}
        </div>
      </div>
    </>
  )
}
