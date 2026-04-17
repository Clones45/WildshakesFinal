import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../store/authStore'
import { supabase, type Branch } from '../lib/supabase'
import { Loader2, Delete, Coffee, Mail, Lock } from 'lucide-react'
import { useEffect } from 'react'

export function LoginScreen() {
    const { loginWithPin, loginWithEmail, isLoading, error, clearError } = useAuthStore()

    // ── Mode toggle ──────────────────────────────────────────────────────────
    const [mode, setMode] = useState<'staff' | 'owner'>('staff')

    // ── Staff PIN state ──────────────────────────────────────────────────────
    const [branches, setBranches] = useState<Branch[]>([])
    const [selectedBranch, setSelectedBranch] = useState<string>('')
    const [pin, setPin] = useState<string>('')
    const [shake, setShake] = useState(false)

    // ── Owner email state ────────────────────────────────────────────────────
    const [email, setEmail]       = useState('')
    const [password, setPassword] = useState('')

    useEffect(() => {
        supabase.from('branches').select('*').eq('status', 'active').then(({ data }) => {
            if (data) setBranches(data as Branch[])
        })
    }, [])

    // ── PIN handlers ─────────────────────────────────────────────────────────
    const handlePad = (val: string) => {
        clearError()
        if (val === 'backspace') { setPin((p) => p.slice(0, -1)); return }
        if (pin.length >= 6) return
        const next = pin + val
        setPin(next)
        if (next.length === 6) handlePinLogin(next)
    }

    const handlePinLogin = async (pinValue: string) => {
        if (!selectedBranch) {
            setShake(true)
            setTimeout(() => setShake(false), 600)
            setPin('')
            return
        }
        const ok = await loginWithPin(pinValue, selectedBranch)
        if (!ok) {
            setShake(true)
            setTimeout(() => setShake(false), 600)
            setPin('')
        }
    }

    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        clearError()
        await loginWithEmail(email, password)
    }

    const switchMode = (m: 'staff' | 'owner') => {
        setMode(m)
        clearError()
        setPin('')
        setEmail('')
        setPassword('')
    }

    const padKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'backspace']

    return (
        <div className="min-h-screen bg-surface-900 flex items-center justify-center relative overflow-hidden">
            {/* Ambient glow */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-brand-600/10 rounded-full blur-3xl" />
                <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-teal-500/5 rounded-full blur-3xl" />
            </div>

            <div className="relative z-10 w-full max-w-md px-6">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="flex items-center justify-center gap-3 mb-3">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-teal-500 flex items-center justify-center shadow-2xl shadow-brand-500/30">
                            <Coffee size={28} className="text-white" />
                        </div>
                    </div>
                    <h1 className="text-3xl font-extrabold text-white tracking-tight">
                        Wild<span className="text-brand-400">shakes</span>
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Nexus POS System</p>
                </div>

                {/* Mode toggle */}
                <div className="flex gap-2 mb-6 bg-surface-800 rounded-2xl p-1">
                    <button
                        onClick={() => switchMode('staff')}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                            mode === 'staff'
                                ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/30'
                                : 'text-gray-400 hover:text-gray-200'
                        }`}
                    >
                        👤 Staff Login
                    </button>
                    <button
                        onClick={() => switchMode('owner')}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                            mode === 'owner'
                                ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/30'
                                : 'text-gray-400 hover:text-gray-200'
                        }`}
                    >
                        🏪 Owner Login
                    </button>
                </div>

                <AnimatePresence mode="wait">
                    {/* ── STAFF PIN LOGIN ── */}
                    {mode === 'staff' && (
                        <motion.div
                            key="staff"
                            initial={{ opacity: 0, x: -16 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 16 }}
                            transition={{ duration: 0.2 }}
                        >
                            {/* Branch Selector */}
                            <div className="mb-6">
                                <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 block">
                                    Select Branch
                                </label>
                                <div className="grid grid-cols-1 gap-2">
                                    {branches.length === 0 && (
                                        <div className="text-center py-4 text-gray-600 text-sm">Loading branches…</div>
                                    )}
                                    {branches.map((b) => (
                                        <button
                                            key={b.id}
                                            onClick={() => { setSelectedBranch(b.id); clearError() }}
                                            className={`w-full text-left px-4 py-3 rounded-xl border transition-all duration-200 ${
                                                selectedBranch === b.id
                                                    ? 'border-brand-500 bg-brand-500/10 text-white'
                                                    : 'border-surface-500 bg-surface-700 text-gray-400 hover:border-surface-400'
                                            }`}
                                        >
                                            <div className="font-semibold">{b.name}</div>
                                            <div className="text-xs opacity-60">{b.location}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* PIN Display */}
                            <motion.div
                                animate={shake ? { x: [-8, 8, -6, 6, -4, 4, 0] } : {}}
                                transition={{ duration: 0.4 }}
                                className="mb-6"
                            >
                                <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 block">
                                    PIN Code
                                </label>
                                <div className="flex gap-3 justify-center">
                                    {Array.from({ length: 6 }).map((_, i) => (
                                        <div
                                            key={i}
                                            className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center transition-all duration-200 ${
                                                i < pin.length
                                                    ? 'border-brand-500 bg-brand-500/20'
                                                    : 'border-surface-500 bg-surface-700'
                                            }`}
                                        >
                                            {i < pin.length && <div className="w-3 h-3 rounded-full bg-brand-400" />}
                                        </div>
                                    ))}
                                </div>
                            </motion.div>

                            {/* Error */}
                            <AnimatePresence>
                                {error && (
                                    <motion.p
                                        initial={{ opacity: 0, y: -8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0 }}
                                        className="text-red-400 text-sm text-center mb-4 bg-red-500/10 rounded-xl py-2 px-4"
                                    >
                                        {error}
                                    </motion.p>
                                )}
                            </AnimatePresence>

                            {/* PIN Pad */}
                            <div className="grid grid-cols-3 gap-3">
                                {padKeys.map((key, idx) => {
                                    if (key === '') return <div key={idx} />
                                    if (key === 'backspace') {
                                        return (
                                            <button
                                                key={idx}
                                                onClick={() => handlePad('backspace')}
                                                className="h-16 rounded-2xl bg-surface-600 border border-surface-500 flex items-center justify-center active:scale-95 transition-all hover:bg-surface-500"
                                            >
                                                <Delete size={20} className="text-gray-400" />
                                            </button>
                                        )
                                    }
                                    return (
                                        <button
                                            key={idx}
                                            onClick={() => handlePad(key)}
                                            className="h-16 rounded-2xl bg-surface-700 border border-surface-500 text-2xl font-semibold text-white active:scale-95 transition-all hover:bg-surface-600 hover:border-brand-500/50"
                                        >
                                            {isLoading ? <Loader2 size={20} className="animate-spin mx-auto text-gray-400" /> : key}
                                        </button>
                                    )
                                })}
                            </div>

                            <p className="text-center text-gray-600 text-xs mt-6">Enter your 6-digit PIN to sign in</p>
                        </motion.div>
                    )}

                    {/* ── OWNER EMAIL LOGIN ── */}
                    {mode === 'owner' && (
                        <motion.div
                            key="owner"
                            initial={{ opacity: 0, x: 16 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -16 }}
                            transition={{ duration: 0.2 }}
                        >
                            <form onSubmit={handleEmailLogin} className="flex flex-col gap-4">
                                <div>
                                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 block">
                                        Email Address
                                    </label>
                                    <div className="relative">
                                        <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="owner@wildshakes.com"
                                            required
                                            className="w-full pl-11 pr-4 py-3.5 bg-surface-700 border border-surface-500 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-teal-500 transition-colors"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 block">
                                        Password
                                    </label>
                                    <div className="relative">
                                        <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="••••••••"
                                            required
                                            className="w-full pl-11 pr-4 py-3.5 bg-surface-700 border border-surface-500 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-teal-500 transition-colors"
                                        />
                                    </div>
                                </div>

                                {/* Error */}
                                <AnimatePresence>
                                    {error && (
                                        <motion.p
                                            initial={{ opacity: 0, y: -8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0 }}
                                            className="text-red-400 text-sm text-center bg-red-500/10 rounded-xl py-2 px-4"
                                        >
                                            {error}
                                        </motion.p>
                                    )}
                                </AnimatePresence>

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-teal-500 to-brand-500 text-white font-bold text-lg shadow-xl shadow-teal-500/20 active:scale-[0.98] transition-all hover:shadow-teal-500/40 disabled:opacity-60 flex items-center justify-center gap-2"
                                >
                                    {isLoading
                                        ? <><Loader2 size={20} className="animate-spin" /> Signing in…</>
                                        : '🏪 Sign In as Owner'
                                    }
                                </button>
                            </form>

                            <p className="text-center text-gray-600 text-xs mt-6">
                                Use the credentials provided by the Wildshakes admin
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}
