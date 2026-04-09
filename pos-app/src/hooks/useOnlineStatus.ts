import { useEffect } from 'react'
import { useSyncStore } from '../store/syncStore'

export function useOnlineStatus() {
    const { setOnline, refreshPendingCount } = useSyncStore()

    useEffect(() => {
        refreshPendingCount()
        const handleOnline = () => setOnline(true)
        const handleOffline = () => setOnline(false)
        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)
        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
        }
    }, [])
}
