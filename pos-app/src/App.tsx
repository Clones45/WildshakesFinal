import { useEffect } from 'react'
import { useAuthStore } from './store/authStore'
import { useCartStore } from './store/cartStore'
import { DeviceSetupScreen } from './screens/DeviceSetupScreen';
import { LoginScreen } from './screens/LoginScreen'
import { POSScreen } from './screens/POSScreen'
import { Toaster, toast } from 'react-hot-toast'
import { setupAppUpdates, applyPendingUpdate, applyPendingUpdateWhenSettled } from './lib/appUpdate'


export default function App() {
  const { user, sessionToken, branch, clearError } = useAuthStore()

  // Clear any stale errors on mount
  useEffect(() => {
    clearError()
  }, [])

  // Keep this tablet on the latest deploy. A new build restarts the app only when
  // the cart is empty: at once if it already is, otherwise right after this sale.
  useEffect(() => {
    setupAppUpdates({
      isSafeToReload: () => useCartStore.getState().items.length === 0,
      onUpdateReady: () => {
        toast((t) => (
          <span className="flex items-center gap-3">
            <span>New version ready — it will apply after this sale.</span>
            <button
              onClick={() => { toast.dismiss(t.id); applyPendingUpdate() }}
              className="px-2.5 py-1 rounded-lg bg-brand-500 text-white text-xs font-bold whitespace-nowrap"
            >
              Restart now
            </button>
          </span>
        ), { id: 'app-update', duration: Infinity, icon: '⬆️' })
      },
    })
    // The moment the cart empties (a sale just finished), apply a waiting update.
    return useCartStore.subscribe((s) => { if (s.items.length === 0) applyPendingUpdateWhenSettled() })
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
            background: '#1a2118',
            color: '#f0f5f0',
            border: '1px solid #2e3d2b',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: '600',
          },
          success: { iconTheme: { primary: '#c9a227', secondary: '#1a2118' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#1a2118' } },
        }}
      />
      {!isClaimed && <DeviceSetupScreen />}
      {isClaimed && !isCashierLoggedIn && <LoginScreen />}
      {isClaimed && isCashierLoggedIn && <POSScreen />}
      {/* Which build this tablet is running — kept off the selling screen. */}
      {!isCashierLoggedIn && (
        <p className="fixed bottom-1.5 inset-x-0 text-center text-[10px] text-brand-700 opacity-70 tracking-wide pointer-events-none select-none">
          Build {__BUILD_ID__}
        </p>
      )}
    </>
  )
}
