export default function Loading() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: '1rem' }}>
      <div className="loading-spinner" style={{ width: '40px', height: '40px', borderTopColor: 'var(--color-primary)' }}></div>
      <p style={{ color: 'var(--color-text-dim)', fontWeight: 500 }}>Loading sales data...</p>
    </div>
  )
}
