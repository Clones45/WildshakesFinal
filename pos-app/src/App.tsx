import { useEffect } from 'react'
import { useAuthStore } from './store/authStore'
import { DeviceSetupScreen } from './screens/DeviceSetupScreen';
import { LoginScreen } from './screens/LoginScreen'
import { POSScreen } from './screens/POSScreen'
import { Toaster } from 'react-hot-toast'


export default function App() {
  const { user, sessionToken, branch, clearError } = useAuthStore()
  
  // Clear any stale errors on mount
  useEffect(() => {
    clearError()
  }, [])

  // Phase 1: Device is not claimed by any branch
  // We check the store's branch. Even if localstorage has something, we rely on the store
  // (which is persisted).
  const isClaimed = !!branch

  // Phase 2/3: Device is claimed. Is a cashier logged in?
  const isCashierLoggedIn = !!(user && sessionToken)

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
      {!isClaimed && <DeviceSetupScreen />}
      {isClaimed && !isCashierLoggedIn && <LoginScreen />}
      {isClaimed && isCashierLoggedIn && <POSScreen />}
    </>
  )
}
