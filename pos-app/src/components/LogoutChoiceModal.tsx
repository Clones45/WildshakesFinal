import { motion, AnimatePresence } from 'framer-motion'
import { LogOut, ClipboardCheck, X } from 'lucide-react'
import type { LocalShift } from '../lib/db'

// Signing out while a shift is open is a choice, not an accident:
//   - End the shift first (count the drawer, print the report), then sign out.
//   - Just sign out: the shift and its drawer stay open for whoever logs in next.
//     The till ends it by itself at 1:00 AM if nobody does.
// Before this, a cashier who signed out without ending the shift had it closed
// silently the moment someone else logged in, with no printout, and the next
// person's shift started from zero.

interface LogoutChoiceModalProps {
    isOpen: boolean
    shift: LocalShift | null
    onEndShift: () => void
    onJustLogout: () => void
    onClose: () => void
}

const timeOf = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true })

export function LogoutChoiceModal({ isOpen, shift, onEndShift, onJustLogout, onClose }: LogoutChoiceModalProps) {
    return (
        <AnimatePresence>
            {isOpen && shift && (
                <motion.div
                    key="logout-choice-backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 1200,
                        background: 'rgba(10, 10, 20, 0.65)', backdropFilter: 'blur(6px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
                    }}
                >
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0, y: 12 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.95, opacity: 0, y: 12 }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-md rounded-2xl bg-surface-800 border border-surface-600 shadow-2xl overflow-hidden"
                    >
                        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-600">
                            <div>
                                <h3 className="text-white font-bold text-base">Sign out</h3>
                                <p className="text-xs text-gray-400 mt-0.5">
                                    Shift #{shift.shiftNumber} is still open · started by {shift.cashierName} at {timeOf(shift.openedAt)}
                                </p>
                            </div>
                            <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ padding: '0.25rem' }} aria-label="Cancel">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-4 space-y-3">
                            <button
                                onClick={onEndShift}
                                className="w-full text-left rounded-xl border border-brand-500/40 bg-brand-500/10 hover:bg-brand-500/20 transition-colors px-4 py-3 flex items-start gap-3"
                            >
                                <ClipboardCheck size={22} className="text-brand-300 mt-0.5 shrink-0" />
                                <span>
                                    <span className="block text-white font-semibold">End the shift, then sign out</span>
                                    <span className="block text-xs text-gray-400 mt-0.5">
                                        Closes the drawer and prints the shift report. Use this at closing time, or when the next person starts their own drawer.
                                    </span>
                                </span>
                            </button>

                            <button
                                onClick={onJustLogout}
                                className="w-full text-left rounded-xl border border-surface-600 bg-surface-700 hover:bg-surface-600 transition-colors px-4 py-3 flex items-start gap-3"
                            >
                                <LogOut size={22} className="text-gray-300 mt-0.5 shrink-0" />
                                <span>
                                    <span className="block text-white font-semibold">Just sign out — someone else continues this shift</span>
                                    <span className="block text-xs text-gray-400 mt-0.5">
                                        The next person who logs in carries on with the same drawer, and all of today&apos;s sales stay on one report.
                                        The till ends the shift by itself at 1:00 AM if nobody does.
                                    </span>
                                </span>
                            </button>
                        </div>

                        <div className="px-5 py-3 border-t border-surface-600 flex justify-end">
                            <button onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
