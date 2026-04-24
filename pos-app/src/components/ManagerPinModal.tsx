import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, X, Delete, Loader2, KeyRound, QrCode } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { QRScanner } from './QRScanner'

type AuthTab = 'pin' | 'qr'

interface ManagerPinModalProps {
    isOpen: boolean
    title: string
    onSuccess: (managerId: string) => void
    onClose: () => void
}

export function ManagerPinModal({ isOpen, title, onSuccess, onClose }: ManagerPinModalProps) {
    const { branch: _branch } = useAuthStore() // kept for potential future branch-scoped lookups
    const [tab, setTab] = useState<AuthTab>('pin')
    const [pin, setPin] = useState('')
    const [error, setError] = useState('')
    const [shake, setShake] = useState(false)
    const [checking, setChecking] = useState(false)
    const [qrFailed, setQrFailed] = useState(false)

    const padKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'backspace']

    const handleClose = () => {
        setPin('')
        setError('')
        setTab('pin')
        setQrFailed(false)
        onClose()
    }

    // ── PIN verification ────────────────────────────────────────────────────
    const handlePad = async (val: string) => {
        setError('')
        if (val === 'backspace') { setPin((p) => p.slice(0, -1)); return }
        if (pin.length >= 6) return
        const next = pin + val
        setPin(next)
        if (next.length === 6) await verifyPin(next)
    }

    const verifyPin = async (pinValue: string) => {
        setChecking(true)
        const managerId = await lookupManager({ pin_code: pinValue })
        setChecking(false)
        if (managerId) {
            setPin('')
            onSuccess(managerId)
        } else {
            setError('Invalid manager PIN')
            setShake(true)
            setTimeout(() => { setShake(false); setPin('') }, 600)
        }
    }

    // ── QR verification ─────────────────────────────────────────────────────
    const handleQRScan = async (token: string) => {
        setChecking(true)
        const managerId = await lookupManager({ qr_access_token: token })
        setChecking(false)
        if (managerId) {
            onSuccess(managerId)
        } else {
            setError('Invalid or non-manager QR code')
            setQrFailed(true)
            setTimeout(() => { setQrFailed(false); setError('') }, 100)
        }
    }

    // ── Shared: lookup a manager by PIN or QR token ─────────────────────────
    const lookupManager = async (
        filter: { pin_code?: string; qr_access_token?: string }
    ): Promise<string | null> => {
        // Always try Supabase first
        try {
            // Build query incrementally (Supabase builder is immutable — must reassign)
            let q = supabase
                .from('users')
                .select('id')
                .in('role', ['manager', 'investor'])
                .eq('is_active', true)
                .limit(1)

            if (filter.pin_code)        q = q.eq('pin_code', filter.pin_code)
            if (filter.qr_access_token) q = q.eq('qr_access_token', filter.qr_access_token)

            const { data } = await q
            if (data && data.length > 0) return (data[0] as { id: string }).id
        } catch {
            // fall through to Dexie
        }

        // Offline fallback
        try {
            const { db } = await import('../lib/db')
            const all = await db.users
                .filter(u => u.is_active && (u.role === 'manager' || u.role === 'investor'))
                .toArray()

            const match = all.find(u =>
                filter.pin_code
                    ? u.pin_code === filter.pin_code
                    : u.qr_access_token === filter.qr_access_token
            )
            if (match) return match.id
        } catch { /* ignore */ }

        return null
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="bg-surface-800 border border-surface-500 rounded-3xl w-80 shadow-2xl overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-600">
                            <div className="flex items-center gap-2">
                                <Shield size={16} className="text-brand-400" />
                                <p className="text-white font-semibold text-sm">{title}</p>
                            </div>
                            <button onClick={handleClose} className="w-7 h-7 rounded-lg bg-surface-600 flex items-center justify-center hover:bg-surface-500">
                                <X size={12} className="text-gray-400" />
                            </button>
                        </div>

                        {/* Tab switcher */}
                        <div className="flex mx-5 mt-4 bg-surface-700 rounded-xl p-1 gap-1">
                            {(['pin', 'qr'] as AuthTab[]).map(t => (
                                <button
                                    key={t}
                                    onClick={() => { setTab(t); setError(''); setPin('') }}
                                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
                                        tab === t
                                            ? 'bg-brand-600 text-white shadow'
                                            : 'text-gray-400 hover:text-gray-200'
                                    }`}
                                >
                                    {t === 'pin' ? <KeyRound size={13} /> : <QrCode size={13} />}
                                    {t === 'pin' ? 'PIN' : 'QR Code'}
                                </button>
                            ))}
                        </div>

                        <div className="p-5">
                            {/* ── PIN tab ── */}
                            {tab === 'pin' && (
                                <>
                                    <p className="text-gray-500 text-xs text-center mb-4">Enter manager PIN</p>

                                    <motion.div
                                        animate={shake ? { x: [-6, 6, -5, 5, -3, 3, 0] } : {}}
                                        transition={{ duration: 0.4 }}
                                        className="flex gap-2.5 justify-center mb-4"
                                    >
                                        {Array.from({ length: 6 }).map((_, i) => (
                                            <div key={i} className={`w-9 h-9 rounded-xl border-2 flex items-center justify-center transition-all ${i < pin.length ? 'border-brand-500 bg-brand-500/20' : 'border-surface-500 bg-surface-700'}`}>
                                                {i < pin.length && <div className="w-2.5 h-2.5 rounded-full bg-brand-400" />}
                                            </div>
                                        ))}
                                    </motion.div>

                                    {error && <p className="text-red-400 text-xs text-center mb-3">{error}</p>}

                                    <div className="grid grid-cols-3 gap-2">
                                        {padKeys.map((key, idx) => {
                                            if (key === '') return <div key={idx} />
                                            if (key === 'backspace') return (
                                                <button key={idx} onClick={() => handlePad('backspace')} className="h-12 rounded-xl bg-surface-600 flex items-center justify-center active:scale-90 hover:bg-surface-500 transition-all">
                                                    <Delete size={16} className="text-gray-400" />
                                                </button>
                                            )
                                            return (
                                                <button key={idx} onClick={() => handlePad(key)} className="h-12 rounded-xl bg-surface-700 border border-surface-500 text-lg font-bold text-white active:scale-90 hover:bg-surface-600 transition-all">
                                                    {checking ? <Loader2 size={16} className="animate-spin mx-auto text-gray-400" /> : key}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </>
                            )}

                            {/* ── QR tab ── */}
                            {tab === 'qr' && (
                                <>
                                    <p className="text-gray-500 text-xs text-center mb-3">
                                        Scan manager's QR card
                                    </p>
                                    {checking ? (
                                        <div className="flex flex-col items-center justify-center h-36 gap-3">
                                            <Loader2 size={28} className="animate-spin text-brand-400" />
                                            <p className="text-gray-400 text-xs">Verifying…</p>
                                        </div>
                                    ) : (
                                        <QRScanner
                                            onScan={handleQRScan}
                                            isLoading={checking}
                                            loginFailed={qrFailed}
                                        />
                                    )}
                                    {error && <p className="text-red-400 text-xs text-center mt-3">{error}</p>}
                                </>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
