import { useAuthStore } from './store/authStore'
import { LoginScreen } from './screens/LoginScreen'
import { POSScreen } from './screens/POSScreen'
import { Toaster } from 'react-hot-toast'

export default function App() {
  const { user, sessionToken } = useAuthStore()
  const isAuthenticated = !!(user && sessionToken)

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1a1a28',
            color: '#f4f4f8',
            border: '1px solid #333355',
            borderRadius: '12px',
            fontSize: '14px',
          },
          success: { iconTheme: { primary: '#14b8a6', secondary: '#0a0a0f' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#0a0a0f' } },
        }}
      />
      {isAuthenticated ? <POSScreen /> : <LoginScreen />}
    </>
  )
}
