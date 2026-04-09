import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, X, Delete, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'

interface ManagerPinModalProps {
    isOpen: boolean
    title: string
    onSuccess: () => void
    onClose: () => void
}

export function ManagerPinModal({ isOpen, title, onSuccess, onClose }: ManagerPinModalProps) {
    const { branch } = useAuthStore()
    const [pin, setPin] = useState('')
    const [error, setError] = useState('')
    const [shake, setShake] = useState(false)
    const [checking, setChecking] = useState(false)

    const padKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'backspace']

    const handlePad = async (val: string) => {
        setError('')
        if (val === 'backspace') { setPin((p) => p.slice(0, -1)); return }
        if (pin.length >= 6) return
        const next = pin + val
        setPin(next)
        if (next.length === 6) await verify(next)
    }

    const verify = async (pinValue: string) => {
        setChecking(true)
        const { data } = await supabase
            .from('users')
            .select('id')
            .eq('pin_code', pinValue)
            .in('role', ['manager', 'investor'])
            .eq('branch_id', branch?.id ?? '')
            .eq('is_active', true)
            .limit(1)

        setChecking(false)
        if (data && data.length > 0) {
            setPin('')
            onSuccess()
            onClose()
        } else {
            setError('Invalid manager PIN')
            setShake(true)
            setTimeout(() => { setShake(false); setPin('') }, 600)
        }
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
                        className="bg-surface-800 border border-surface-500 rounded-3xl w-72 shadow-2xl overflow-hidden"
                    >
                        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-600">
                            <div className="flex items-center gap-2">
                                <Shield size={16} className="text-brand-400" />
                                <p className="text-white font-semibold text-sm">{title}</p>
                            </div>
                            <button onClick={onClose} className="w-7 h-7 rounded-lg bg-surface-600 flex items-center justify-center hover:bg-surface-500">
                                <X size={12} className="text-gray-400" />
                            </button>
                        </div>

                        <div className="p-5">
                            <p className="text-gray-500 text-xs text-center mb-4">Manager PIN required</p>

                            {/* PIN dots */}
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

                            {/* PIN pad */}
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
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
