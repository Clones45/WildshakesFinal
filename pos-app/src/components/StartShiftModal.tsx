import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Wallet, Loader2, LogOut } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useShiftStore, rememberedStartingCash } from '../store/shiftStore'
import { useAuthStore } from '../store/authStore'

// A cashier with no open shift is asked for the cash in the drawer before their
// shift begins. That figure is the starting cash the shift report builds on, so
// the drawer is computed at close instead of counted. Prefilled with what was
// entered last time; can't be dismissed — the shift has to start from a number.

const money = (n: number) => `₱${n.toFixed(2)}`

export function StartShiftModal() {
    const { user, branch, logoutCashier } = useAuthStore()
    const { awaitingStart, startShift } = useShiftStore()
    const [input, setInput] = useState(() => String(rememberedStartingCash()))
    const [busy, setBusy] = useState(false)

    const open = awaitingStart && !!user && !!branch
    const amount = Math.max(0, parseFloat(input) || 0)

    const start = async () => {
        if (!user || !branch) return
        if (input.trim() === '') { toast.error('Enter the cash in the drawer.'); return }
        setBusy(true)
        try {
            await startShift(user, branch, amount)
            toast.success(`Shift started with ${money(amount)} in the drawer`)
        } catch {
            toast.error('Could not start the shift. Try again.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    key="start-shift"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="bg-surface-800 border border-surface-500 rounded-3xl w-full max-w-sm shadow-2xl"
                    >
                        <div className="px-6 py-5 border-b border-surface-600 flex items-center gap-2">
                            <Wallet size={18} className="text-brand-400" />
                            <div>
                                <h2 className="text-lg font-bold text-white">Start your shift</h2>
                                <p className="text-gray-500 text-xs">{user?.name} · {branch?.name}</p>
                            </div>
                        </div>

                        <div className="p-5 space-y-3">
                            <p className="text-sm text-gray-300">How much cash is in the drawer right now?</p>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₱</span>
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    min={0}
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') void start() }}
                                    placeholder="0.00"
                                    className="input-field pl-7 text-lg font-bold"
                                    autoFocus
                                    aria-label="Starting cash"
                                />
                            </div>
                            <p className="text-[11px] text-gray-500">
                                This is the float your shift report starts from. Count it once, then tap Start.
                            </p>
                        </div>

                        <div className="px-5 pb-5 flex gap-2">
                            <button
                                onClick={logoutCashier}
                                disabled={busy}
                                className="btn-ghost flex items-center justify-center gap-1.5 text-sm px-3 disabled:opacity-40"
                                title="Not you? Log out"
                            >
                                <LogOut size={14} /> Log out
                            </button>
                            <button onClick={start} disabled={busy} className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm disabled:opacity-60">
                                {busy ? <Loader2 size={14} className="animate-spin" /> : <Wallet size={14} />}
                                Start shift
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
