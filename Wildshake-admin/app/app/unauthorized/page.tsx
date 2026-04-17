import Link from 'next/link'

export default function UnauthorizedPage() {
  return (
    <main className="login-page">
      <div className="login-card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚫</div>
        <h2 style={{ color: 'var(--color-danger-light)', marginBottom: '0.75rem' }}>Access Denied</h2>
        <p style={{ marginBottom: '1.5rem' }}>
          Your account does not have permission to access the Master Admin Portal.
          This incident has been logged.
        </p>
        <Link href="/login" className="btn btn-ghost">
          ← Return to Login
        </Link>
      </div>
    </main>
  )
}
