export default function Loading() {
  return (
    <div style={{ padding: '2rem' }}>
      {/* Breadcrumb skeleton */}
      <div style={{ width: 160, height: 16, borderRadius: 6, background: 'var(--color-surface)', marginBottom: '1.5rem' }} />

      {/* Header skeleton */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <div style={{ width: 220, height: 32, borderRadius: 8, background: 'var(--color-surface)', marginBottom: '0.5rem' }} />
          <div style={{ width: 300, height: 14, borderRadius: 6, background: 'var(--color-surface)' }} />
        </div>
        <div style={{ width: 120, height: 28, borderRadius: 20, background: 'var(--color-surface)' }} />
      </div>

      {/* Tabs skeleton */}
      <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid var(--color-border)', marginBottom: '1.5rem' }}>
        {[80, 60, 110, 60, 60].map((w, i) => (
          <div key={i} style={{ width: w, height: 36, borderRadius: '6px 6px 0 0', background: 'var(--color-surface)', margin: '0 2px' }} />
        ))}
      </div>

      {/* Stat cards skeleton */}
      <div className="stat-grid">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="stat-card" style={{ animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.1}s` }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--color-border)', marginBottom: '0.75rem' }} />
            <div style={{ width: '60%', height: 12, borderRadius: 4, background: 'var(--color-border)', marginBottom: '0.5rem' }} />
            <div style={{ width: '80%', height: 28, borderRadius: 6, background: 'var(--color-border)' }} />
          </div>
        ))}
      </div>

      {/* Chart skeleton */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px', marginTop: '1.5rem' }}>
        <div className="loading-spinner" style={{ width: '36px', height: '36px', borderTopColor: 'var(--color-primary)' }}></div>
      </div>
    </div>
  )
}
