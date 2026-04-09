import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../store/authStore'
import { supabase, type Branch } from '../lib/supabase'
import { Loader2, Delete, Coffee } from 'lucide-react'
import { useEffect } from 'react'

export function LoginScreen() {
    const { loginWithPin, isLoading, error, clearError } = useAuthStore()
    const [branches, setBranches] = useState<Branch[]>([])
    const [selectedBranch, setSelectedBranch] = useState<string>('')
    const [pin, setPin] = useState<string>('')
    const [shake, setShake] = useState(false)

    useEffect(() => {
        supabase.from('branches').select('*').eq('status', 'active').then(({ data }) => {
            if (data) setBranches(data as Branch[])
        })
    }, [])

    const handlePad = (val: string) => {
        clearError()
        if (val === 'backspace') {
            setPin((p) => p.slice(0, -1))
            return
        }
        if (pin.length >= 6) return
        const next = pin + val
        setPin(next)
        if (next.length === 6) handleLogin(next)
    }

    const handleLogin = async (pinValue: string) => {
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
                <div className="text-center mb-10">
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
                                className={`w-full text-left px-4 py-3 rounded-xl border transition-all duration-200 ${selectedBranch === b.id
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
                                className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center transition-all duration-200 ${i < pin.length
                                    ? 'border-brand-500 bg-brand-500/20'
                                    : 'border-surface-500 bg-surface-700'
                                    }`}
                            >
                                {i < pin.length && (
                                    <div className="w-3 h-3 rounded-full bg-brand-400" />
                                )}
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

                <p className="text-center text-gray-600 text-xs mt-6">
                    Enter your 6-digit PIN to sign in
                </p>
            </div>
        </div>
    )
}
