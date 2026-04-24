'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError('Invalid credentials. Access denied.')
      setLoading(false)
      return
    }

    // Middleware will verify app_metadata.role — redirect to dashboard
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <main className="login-page">
      <div className="login-split">
        <div className="login-image-side">
          <img src="/CompanyProfile.jpg" alt="Wildshakes Profile" className="login-cover-image" />
        </div>
        <div className="login-form-side">
          <div className="login-card">
            <div className="login-logo" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
              <img src="/logo.png" alt="Wildshakes Logo" style={{ width: '80px', height: '80px', objectFit: 'contain' }} />
              <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Wildshakes</h1>
              <p style={{ color: 'var(--color-text-dim)', fontSize: '0.875rem' }}>Master Admin Portal — Restricted Access</p>
            </div>

            {error && (
              <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
                🔒 {error}
              </div>
            )}

            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="email">Email Address</label>
                <input
                  id="email"
                  type="email"
                  className="form-input"
                  placeholder="admin@wildshakes.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="password">Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    className="form-input"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    style={{ paddingRight: '2.5rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-text-dim)',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-lg w-full"
                style={{ marginTop: '0.5rem', justifyContent: 'center' }}
                disabled={loading}
              >
                {loading ? (
                  <><span className="loading-spinner" /> Authenticating...</>
                ) : (
                  '🔐 Sign In to Admin Portal'
                )}
              </button>
            </form>

            <p style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-dim)' }}>
              This portal is restricted to authorized personnel only.<br />
              All access attempts are logged and monitored.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
