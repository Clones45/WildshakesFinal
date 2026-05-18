export default function InventoryLoading() {
  return (
    <div style={{ padding: '1rem 0' }}>
      {/* Page Header Skeleton */}
      <div className="page-header" style={{ marginBottom: '2rem' }}>
        <div>
          <div style={{ width: '280px', height: '36px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', marginBottom: '0.5rem', animation: 'pulse 1.5s ease-in-out infinite' }}></div>
          <div style={{ width: '380px', height: '16px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', animation: 'pulse 1.5s ease-in-out infinite', animationDelay: '0.1s' }}></div>
        </div>
        <div style={{ width: '180px', height: '32px', background: 'var(--color-surface)', borderRadius: 'var(--radius-pill)', animation: 'pulse 1.5s ease-in-out infinite', animationDelay: '0.2s' }}></div>
      </div>

      {/* KPI Summary Skeleton */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '1.25rem' }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="stat-card" style={{ animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.15 + 0.3}s` }}>
            <div style={{ width: '40px', height: '40px', background: 'var(--color-border)', borderRadius: 'var(--radius-md)', marginBottom: '0.75rem' }}></div>
            <div style={{ width: '80px', height: '12px', background: 'var(--color-border)', borderRadius: '4px', marginBottom: '0.5rem' }}></div>
            <div style={{ width: '40px', height: '28px', background: 'var(--color-border)', borderRadius: '6px' }}></div>
          </div>
        ))}
      </div>

      {/* Sheet Tabs Skeleton */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {[100, 140, 140].map((w, i) => (
          <div key={i} style={{ width: `${w}px`, height: '36px', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.1}s` }}></div>
        ))}
      </div>

      {/* Table Skeleton */}
      <div className="table-wrapper" style={{ animation: 'pulse 1.5s ease-in-out infinite', animationDelay: '0.5s' }}>
        <div className="table-header" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ width: '120px', height: '24px', background: 'var(--color-border)', borderRadius: 'var(--radius-sm)' }}></div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ width: '200px', height: '32px', background: 'var(--color-bg)', borderRadius: 'var(--radius-pill)' }}></div>
            <div style={{ width: '100px', height: '20px', background: 'var(--color-border)', borderRadius: '4px' }}></div>
          </div>
        </div>

        <div style={{ padding: '0.5rem 1rem', background: 'rgba(74, 124, 89, 0.05)', borderLeft: '3px solid var(--color-border)', width: '150px', margin: '1rem', height: '24px', borderRadius: '0 var(--radius-sm) var(--radius-sm) 0' }}></div>

        <table style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: '35%' }}><div style={{ width: '40px', height: '12px', background: 'var(--color-border)', borderRadius: '4px' }}></div></th>
              <th style={{ width: '8%' }}><div style={{ width: '30px', height: '12px', background: 'var(--color-border)', borderRadius: '4px', margin: '0 auto' }}></div></th>
              <th style={{ width: '13%' }}><div style={{ width: '60px', height: '12px', background: 'var(--color-border)', borderRadius: '4px', margin: '0 auto' }}></div></th>
              <th style={{ width: '13%' }}><div style={{ width: '60px', height: '12px', background: 'var(--color-border)', borderRadius: '4px', margin: '0 auto' }}></div></th>
              <th style={{ width: '13%' }}><div style={{ width: '60px', height: '12px', background: 'var(--color-border)', borderRadius: '4px', margin: '0 auto' }}></div></th>
              <th style={{ width: '8%' }}><div style={{ width: '40px', height: '12px', background: 'var(--color-border)', borderRadius: '4px', margin: '0 auto' }}></div></th>
              <th style={{ width: '10%' }}><div style={{ width: '40px', height: '12px', background: 'var(--color-border)', borderRadius: '4px' }}></div></th>
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5].map((i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(74, 124, 89, 0.08)' }}>
                <td style={{ padding: '0.9rem 1.5rem' }}>
                  <div style={{ width: `${60 + Math.random() * 40}%`, height: '16px', background: 'var(--color-surface)', borderRadius: '4px' }}></div>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <div style={{ width: '20px', height: '14px', background: 'var(--color-surface)', borderRadius: '4px', margin: '0 auto' }}></div>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <div style={{ width: '72px', height: '28px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', margin: '0 auto' }}></div>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <div style={{ width: '72px', height: '28px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', margin: '0 auto' }}></div>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <div style={{ width: '72px', height: '28px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', margin: '0 auto' }}></div>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <div style={{ width: '30px', height: '14px', background: 'var(--color-surface)', borderRadius: '4px', margin: '0 auto' }}></div>
                </td>
                <td>
                  <div style={{ width: '100%', height: '28px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)' }}></div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
