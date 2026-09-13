import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Last line of defence: if a screen throws, show staff something calm and
// recoverable instead of a raw stack trace on a white page. Nothing is lost —
// sales, holds and shifts are already saved on the tablet — so the right
// action is simply to restart the app.
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null; showDetails: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null, showDetails: false }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[POS] Screen crashed:', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    const message = this.state.error?.message ?? 'Unknown error'
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0f1a14', color: '#f0f4f1', fontFamily: 'system-ui, sans-serif', padding: 24,
      }}>
        <div style={{ maxWidth: 440, width: '100%', background: '#1a2e20', border: '1px solid rgba(74,124,89,0.35)', borderRadius: 20, padding: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>⚠️</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>Something went wrong</h1>
          <p style={{ color: '#7fa88a', fontSize: 14, lineHeight: 1.5, margin: '0 0 20px' }}>
            The app hit a problem on this screen. Nothing is lost — your sales, held orders and shift are saved on this tablet. Restart to continue.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{ width: '100%', padding: '14px 18px', borderRadius: 14, border: 'none', background: '#657962', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}
          >
            Restart app
          </button>
          <button
            onClick={() => this.setState((s) => ({ showDetails: !s.showDetails }))}
            style={{ marginTop: 12, background: 'none', border: 'none', color: '#4d7059', fontSize: 12, cursor: 'pointer' }}
          >
            {this.state.showDetails ? 'Hide details' : 'Show details for support'}
          </button>
          {this.state.showDetails && (
            <pre style={{ marginTop: 10, textAlign: 'left', fontSize: 11, color: '#7fa88a', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 160, overflow: 'auto', background: '#0f1a14', padding: 10, borderRadius: 10 }}>
              {message}{'\n'}{this.state.error?.stack?.split('\n').slice(1, 4).join('\n')}
            </pre>
          )}
        </div>
      </div>
    )
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
