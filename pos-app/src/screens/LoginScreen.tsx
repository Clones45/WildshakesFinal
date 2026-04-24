import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../store/authStore'
import { useSyncStore } from '../store/syncStore'
import { Delete, Loader2, QrCode, Hash } from 'lucide-react'
import { QRScanner } from '../components/QRScanner'

type LoginTab = 'qr' | 'pin'

export function LoginScreen() {
    const { loginWithPin, loginWithQR, isLoading, error, clearError, branch } = useAuthStore()
    const { syncPending } = useSyncStore()

    const [tab, setTab] = useState<LoginTab>('qr')
    const [pin, setPin] = useState<string>('')
    const [shake, setShake] = useState(false)
    const [loginFailed, setLoginFailed] = useState(false)

    useEffect(() => {
        syncPending()
    }, [])

    // ── PIN handlers ─────────────────────────────────────────────────────────
    const handlePad = (val: string) => {
        clearError()
        if (val === 'backspace') { setPin(p => p.slice(0, -1)); return }
        if (pin.length >= 6) return
        const next = pin + val
        setPin(next)
        if (next.length === 6) handlePinLogin(next)
    }

    const handlePinLogin = async (pinValue: string) => {
        if (!branch) return
        const ok = await loginWithPin(pinValue, branch.id)
        if (!ok) {
            setShake(true)
            setTimeout(() => setShake(false), 600)
            setPin('')
        }
    }

    // ── QR handler ───────────────────────────────────────────────────────────
    const handleQRScan = async (token: string) => {
        if (!branch) return
        clearError()
        // DEBUG — remove after confirming QR scan works
        console.log('[QR Scan] Scanned token:', JSON.stringify(token), '| length:', token.length)
        const ok = await loginWithQR(token, branch.id)
        if (!ok) {
            setShake(true)
            setTimeout(() => setShake(false), 600)
            // Signal scanner to restart (loginFailed pulses true→false)
            setLoginFailed(true)
            setTimeout(() => setLoginFailed(false), 100)
        }
    }

    const padKeys = ['1','2','3','4','5','6','7','8','9','','0','backspace']

    return (
        <div className="fixed inset-0 bg-brand-950 overflow-hidden flex items-center justify-center">
            {/* ── Background glows ── */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="animate-glow absolute top-[-20%] left-[50%] -translate-x-1/2
                                w-[700px] h-[700px] rounded-full
                                bg-brand-600/20 blur-[120px]" />
                <div className="animate-glow absolute bottom-[-15%] right-[-10%]
                                w-[400px] h-[400px] rounded-full
                                bg-gold-500/10 blur-[100px]" />
                <div className="absolute inset-0"
                     style={{
                         backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(101,121,98,0.08) 0%, transparent 60%)',
                     }}
                />
                <div className="absolute inset-0 opacity-[0.03]"
                     style={{
                         backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
                                           linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
                         backgroundSize: '48px 48px',
                     }}
                />
            </div>

            {/* ── Main card ── */}
            <motion.div
                initial={{ opacity: 0, y: 24, scale: 0.97 }}
                animate={{ opacity: 1, y: 0,  scale: 1 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="relative z-10 w-full max-w-sm mx-4"
            >
                {/* Logo section */}
                <div className="text-center mb-6">
                    <motion.div
                        animate={{ y: [0, -8, 0] }}
                        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                        className="inline-block mb-3"
                    >
                        <img
                            src="/Wild-Shakes-PNG-Transparent-Square.png"
                            alt="Wildshakes"
                            className="w-24 h-24 object-contain mx-auto drop-shadow-2xl"
                            style={{ filter: 'drop-shadow(0 0 24px rgba(101,121,98,0.6))' }}
                        />
                    </motion.div>

                    <h1 className="font-serif text-4xl font-bold tracking-tight">
                        <span className="text-white">Wild</span>
                        <span className="text-gold-400">shakes</span>
                    </h1>
                    <p className="text-brand-400 text-xs font-semibold uppercase tracking-[0.2em] mt-1">
                        Nexus POS System
                    </p>
                    {branch && (
                        <div className="mt-3 inline-block px-4 py-1.5 rounded-full bg-brand-900 border border-brand-800">
                            <p className="text-gold-400 text-xs font-bold">{branch.name}</p>
                        </div>
                    )}
                </div>

                {/* ── Tab Toggle ── */}
                <div className="flex rounded-2xl bg-brand-900 border border-brand-800 p-1 mb-5 gap-1">
                    {([
                        { id: 'qr' as LoginTab,  label: 'Scan QR',  Icon: QrCode },
                        { id: 'pin' as LoginTab, label: 'Enter PIN', Icon: Hash },
                    ]).map(({ id, label, Icon }) => (
                        <button
                            key={id}
                            onClick={() => { setTab(id); clearError(); setPin('') }}
                            className={`flex-1 flex items-center justify-center gap-2 h-9 rounded-xl text-xs font-bold transition-all duration-200 ${
                                tab === id
                                    ? 'bg-brand-700 text-white shadow-sm'
                                    : 'text-brand-500 hover:text-brand-300'
                            }`}
                        >
                            <Icon size={14} />
                            {label}
                        </button>
                    ))}
                </div>

                {/* ── Error ── */}
                <AnimatePresence>
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                            className="mb-3 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-center font-semibold"
                        >
                            {error}
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence mode="wait">
                    {/* ── QR Tab ── */}
                    {tab === 'qr' && (
                        <motion.div
                            key="qr"
                            initial={{ opacity: 0, x: -16 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 16 }}
                            transition={{ duration: 0.2 }}
                        >
                            <motion.div animate={shake ? { x: [-8, 8, -6, 6, -3, 3, 0] } : {}} transition={{ duration: 0.4 }}>
                                <QRScanner onScan={handleQRScan} isLoading={isLoading} loginFailed={loginFailed} />
                            </motion.div>
                        </motion.div>
                    )}

                    {/* ── PIN Tab ── */}
                    {tab === 'pin' && (
                        <motion.div
                            key="pin"
                            initial={{ opacity: 0, x: 16 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -16 }}
                            transition={{ duration: 0.2 }}
                        >
                            {/* PIN dots */}
                            <motion.div
                                animate={shake ? { x: [-10, 10, -8, 8, -4, 4, 0] } : {}}
                                transition={{ duration: 0.4 }}
                                className="mb-4"
                            >
                                <div className="flex gap-2.5 justify-center">
                                    {Array.from({ length: 6 }).map((_, i) => (
                                        <motion.div
                                            key={i}
                                            animate={i < pin.length
                                                ? { scale: [1.2, 1], backgroundColor: '#657962' }
                                                : { scale: 1, backgroundColor: '#2E332D' }
                                            }
                                            transition={{ duration: 0.15 }}
                                            className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center ${
                                                i < pin.length
                                                    ? 'border-brand-500'
                                                    : 'border-brand-800 bg-brand-900'
                                            }`}
                                        >
                                            {i < pin.length && (
                                                <div className="w-2.5 h-2.5 rounded-full bg-white" />
                                            )}
                                        </motion.div>
                                    ))}
                                </div>
                            </motion.div>

                            {/* PIN Pad */}
                            <div className="grid grid-cols-3 gap-2">
                                {padKeys.map((key, idx) => {
                                    if (key === '') return <div key={idx} />
                                    if (key === 'backspace') {
                                        return (
                                            <motion.button
                                                key={idx}
                                                whileTap={{ scale: 0.92 }}
                                                onClick={() => handlePad('backspace')}
                                                className="h-14 rounded-2xl bg-brand-800 border border-brand-700 flex items-center justify-center hover:bg-brand-700 transition-colors"
                                            >
                                                <Delete size={18} className="text-brand-400" />
                                            </motion.button>
                                        )
                                    }
                                    return (
                                        <motion.button
                                            key={idx}
                                            whileTap={{ scale: 0.92 }}
                                            onClick={() => handlePad(key)}
                                            disabled={isLoading}
                                            className="h-14 rounded-2xl bg-brand-900 border border-brand-800
                                                       text-white text-xl font-bold
                                                       hover:bg-brand-800 hover:border-brand-600
                                                       active:bg-brand-700
                                                       transition-all duration-100
                                                       disabled:opacity-40"
                                        >
                                            {isLoading ? (
                                                <Loader2 size={16} className="animate-spin mx-auto text-brand-400" />
                                            ) : key}
                                        </motion.button>
                                    )
                                })}
                            </div>

                            <p className="text-center text-brand-600 text-[11px] mt-4">
                                Enter your 6-digit Staff PIN
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Bottom brand tag */}
                <div className="mt-6 text-center">
                    <div className="inline-flex items-center gap-1.5 text-[10px] text-brand-700 font-semibold uppercase tracking-widest">
                        <span className="w-8 h-px bg-brand-800 inline-block" />
                        Powered by Wildshakes Nexus
                        <span className="w-8 h-px bg-brand-800 inline-block" />
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
