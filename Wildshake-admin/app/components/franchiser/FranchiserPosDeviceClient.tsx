'use client'

interface Props {
  branchId: string
  branchName: string
  branchLocation: string
  activeDeviceId: string | null
  lastActivityAt: string | null
}

export default function FranchiserPosDeviceClient({ branchId, branchName, branchLocation, activeDeviceId, lastActivityAt }: Props) {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1>POS Device Status</h1>
          <p className="page-header-subtitle">Manage the active POS terminal for {branchName}</p>
        </div>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
        <div className="table-wrapper" style={{ padding: '2rem' }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Branch Details</h2>
          <p><strong>Name:</strong> {branchName}</p>
          <p><strong>Location:</strong> {branchLocation}</p>
          <p><strong>Branch ID:</strong> <span style={{ fontFamily: 'monospace' }}>{branchId}</span></p>
        </div>

        <div className="table-wrapper" style={{ padding: '2rem' }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Terminal Status</h2>
          <div style={{ marginBottom: '1rem' }}>
            <strong>Active Device ID:</strong><br/>
            {activeDeviceId ? (
              <span style={{ fontFamily: 'monospace', color: 'var(--color-primary)' }}>{activeDeviceId}</span>
            ) : (
              <span style={{ color: 'var(--color-text-muted)' }}>No device registered</span>
            )}
          </div>
          <div>
            <strong>Last Activity:</strong><br/>
            {lastActivityAt ? (
              <span>{new Date(lastActivityAt).toLocaleString()}</span>
            ) : (
              <span style={{ color: 'var(--color-text-muted)' }}>No recent activity</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
