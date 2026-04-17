import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../store/authStore'
import { supabase, type Branch } from '../lib/supabase'
import { Mail, Lock, Loader2 } from 'lucide-react'

export function SetupScreen() {
    const { claimBranchForDevice, isLoading, error, clearError } = useAuthStore()

    const [step, setStep] = useState<'auth' | 'branch'>('auth')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPass, setShowPass] = useState(false)
    const [authLoading, setAuthLoading] = useState(false)
    const [authError, setAuthError] = useState<string | null>(null)

    const [branches, setBranches] = useState<Branch[]>([])
    const [branchesLoading, setBranchesLoading] = useState(false)

    const handleEmailAuth = async (e: React.FormEvent) => {
        e.preventDefault()
        clearError()
        setAuthError(null)
        setAuthLoading(true)

        try {
            // Temporarily sign in just to fetch branches for this owner
            const { data: authData, error: supabaseError } = await supabase.auth.signInWithPassword({
                email,
                password,
            })

            if (supabaseError) throw supabaseError

            const role = authData.user?.app_metadata?.role
            if (role !== 'franchisee' && role !== 'master_admin') {
                throw new Error('This account is not authorized for POS setup.')
            }

            const franchiseId = authData.user?.app_metadata?.franchise_id

            // Fetch branches for this franchise (or all if master_admin)
            setBranchesLoading(true)
            let query = supabase.from('branches').select('*').eq('status', 'active')
            if (role === 'franchisee' && franchiseId) {
                query = query.eq('franchise_id', franchiseId)
            }
            
            const { data: branchesData, error: branchErr } = await query

            if (branchErr) throw branchErr

            setBranches(branchesData as Branch[])
            setStep('branch')
        } catch (err: any) {
            setAuthError(err.message || 'Authentication failed.')
            await supabase.auth.signOut()
        } finally {
            setAuthLoading(false)
            setBranchesLoading(false)
        }
    }

    const handleClaimBranch = async (branchId: string) => {
        const { success, error: claimErr } = await claimBranchForDevice(email, password, branchId)
        if (!success) {
            setAuthError(claimErr || 'Failed to claim branch.')
        }
        // If success, App.tsx will automatically unmount this component
    }

    return (
        <div className="fixed inset-0 bg-brand-950 overflow-hidden flex items-center justify-center">
            {/* ── Background glows ── */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="animate-glow absolute top-[-20%] left-[50%] -translate-x-1/2
                                w-[700px] h-[700px] rounded-full
                                bg-gold-600/10 blur-[120px]" />
                <div className="animate-glow absolute bottom-[-15%] right-[-10%]
                                w-[400px] h-[400px] rounded-full
                                bg-brand-500/10 blur-[100px]" />
                <div className="absolute inset-0"
                     style={{ backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(201,162,39,0.05) 0%, transparent 60%)' }}
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
                <div className="text-center mb-6">
                    <img
                        src="/Wild-Shakes-PNG-Transparent-Square.png"
                        alt="Wildshakes"
                        className="w-20 h-20 object-contain mx-auto drop-shadow-xl mb-4 opacity-80"
                        style={{ filter: 'grayscale(30%) sepia(20%)' }}
                    />
                    <h1 className="font-serif text-3xl font-bold tracking-tight text-white">
                        Device Setup
                    </h1>
                    <p className="text-gold-400 text-xs font-semibold uppercase tracking-[0.1em] mt-2">
                        {step === 'auth' ? 'Owner Authentication' : 'Select Branch to Claim'}
                    </p>
                </div>

                <AnimatePresence mode="wait">
                    {/* Error */}
                    {(error || authError) && (
                        <motion.div
                            key="error"
                            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                            className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-center font-semibold"
                        >
                            {error || authError}
                        </motion.div>
                    )}

                    {step === 'auth' && (
                        <motion.div
                            key="auth"
                            initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                        >
                            <form onSubmit={handleEmailAuth} className="flex flex-col gap-4">
                                <div>
                                    <div className="relative">
                                        <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-500" />
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={e => setEmail(e.target.value)}
                                            placeholder="owner@wildshakes.com"
                                            required
                                            className="w-full pl-12 pr-4 py-4 rounded-xl bg-brand-900 border border-brand-800 text-white placeholder-brand-600 text-sm focus:outline-none focus:border-gold-500 transition-colors"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <div className="relative">
                                        <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-500" />
                                        <input
                                            type={showPass ? 'text' : 'password'}
                                            value={password}
                                            onChange={e => setPassword(e.target.value)}
                                            placeholder="••••••••"
                                            required
                                            className="w-full pl-12 pr-12 py-4 rounded-xl bg-brand-900 border border-brand-800 text-white placeholder-brand-600 text-sm focus:outline-none focus:border-gold-500 transition-colors"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPass(s => !s)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-500 hover:text-brand-300 text-xs font-bold"
                                        >
                                            {showPass ? 'Hide' : 'Show'}
                                        </button>
                                    </div>
                                </div>

                                <motion.button
                                    type="submit"
                                    disabled={authLoading}
                                    whileTap={{ scale: 0.97 }}
                                    className="w-full mt-2 py-4 rounded-xl bg-gold-500 text-brand-950 font-bold shadow-lg shadow-gold-500/20 hover:shadow-gold-500/40 disabled:opacity-60 transition-all flex items-center justify-center gap-2"
                                >
                                    {authLoading ? <Loader2 size={18} className="animate-spin" /> : 'Continue'}
                                </motion.button>
                            </form>
                        </motion.div>
                    )}

                    {step === 'branch' && (
                        <motion.div
                            key="branch"
                            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                        >
                            {branchesLoading ? (
                                <div className="flex justify-center py-8">
                                    <Loader2 size={24} className="animate-spin text-gold-500" />
                                </div>
                            ) : branches.length === 0 ? (
                                <div className="text-center py-6 bg-brand-900 rounded-xl border border-brand-800">
                                    <p className="text-brand-400 text-sm">No active branches found.</p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                    {branches.map(b => {
                                        const isClaimedByOther = b.active_device_id && b.active_device_id !== localStorage.getItem('ws_device_id')
                                        return (
                                            <button
                                                key={b.id}
                                                disabled={isLoading}
                                                onClick={() => {
                                                    if (isClaimedByOther) {
                                                        if (!confirm('This branch is already bound to another device. Taking over will log the other device out. Continue?')) return
                                                    }
                                                    handleClaimBranch(b.id)
                                                }}
                                                className={`w-full text-left p-4 rounded-xl border transition-all ${
                                                    isClaimedByOther
                                                        ? 'bg-brand-900 border-red-900/50 hover:border-red-500/50'
                                                        : 'bg-brand-900 border-brand-800 hover:border-gold-500/50 hover:bg-brand-800/80 active:scale-95'
                                                }`}
                                            >
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="font-bold text-white text-base">{b.name}</span>
                                                    {isClaimedByOther && (
                                                        <span className="text-[10px] uppercase font-bold text-red-400 px-2 py-0.5 rounded bg-red-500/10">Override Claim</span>
                                                    )}
                                                </div>
                                                {b.location && <p className="text-xs text-brand-400">{b.location}</p>}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                            <button
                                onClick={() => setStep('auth')}
                                className="w-full mt-4 py-3 text-sm text-brand-400 hover:text-white transition-colors"
                            >
                                ← Back to Login
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
    )
}
