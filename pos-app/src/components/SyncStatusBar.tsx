import { Wifi, WifiOff, RefreshCw, AlertCircle } from 'lucide-react'
import { useSyncStore } from '../store/syncStore'
import { motion, AnimatePresence } from 'framer-motion'

export function SyncStatusBar() {
    const { isOnline, isSyncing, pendingCount, lastSyncAt, syncPending } = useSyncStore()

    return (
        <div className="flex items-center gap-2">
            <AnimatePresence mode="wait">
                {isOnline ? (
                    <motion.div
                        key="online"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/30"
                    >
                        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse-slow" />
                        <Wifi size={12} className="text-green-400" />
                        <span className="text-green-400 text-xs font-medium">Online</span>
                    </motion.div>
                ) : (
                    <motion.div
                        key="offline"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/30"
                    >
                        <span className="w-2 h-2 rounded-full bg-red-400" />
                        <WifiOff size={12} className="text-red-400" />
                        <span className="text-red-400 text-xs font-medium">Offline</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {pendingCount > 0 && (
                <button
                    onClick={syncPending}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 transition-colors"
                >
                    <RefreshCw size={11} className={`text-amber-400 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span className="text-amber-400 text-xs font-medium">
                        {isSyncing ? 'Syncing…' : `${pendingCount} pending`}
                    </span>
                </button>
            )}

            {!isOnline && (
                <div className="flex items-center gap-1 text-amber-400/70 text-xs">
                    <AlertCircle size={11} />
                    <span>Orders saved locally</span>
                </div>
            )}

            {lastSyncAt && isOnline && pendingCount === 0 && (
                <span className="text-gray-600 text-xs hidden md:block">
                    Synced {new Date(lastSyncAt).toLocaleTimeString()}
                </span>
            )}
        </div>
    )
}
