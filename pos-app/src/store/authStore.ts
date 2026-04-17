import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase, type UserProfile, type Branch } from '../lib/supabase'

interface AuthState {
    user: UserProfile | null
    branch: Branch | null
    sessionToken: string | null
    isLoading: boolean
    error: string | null
    // Staff login (PIN)
    loginWithPin: (pin: string, branchId: string) => Promise<boolean>
    // Owner/franchisee login (email + password via Supabase Auth)
    loginWithEmail: (email: string, password: string) => Promise<boolean>
    logout: () => Promise<void>
    clearError: () => void
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            branch: null,
            sessionToken: null,
            isLoading: false,
            error: null,

            // ── Staff PIN login (unchanged) ──────────────────────────────────
            loginWithPin: async (pin: string, branchId: string) => {
                set({ isLoading: true, error: null })
                try {
                    const { data: users, error } = await supabase
                        .from('users')
                        .select('*')
                        .eq('branch_id', branchId)
                        .eq('pin_code', pin)
                        .eq('is_active', true)
                        .limit(1)

                    if (error) throw error
                    if (!users || users.length === 0) {
                        set({ isLoading: false, error: 'Invalid PIN or branch' })
                        return false
                    }

                    const user = users[0] as UserProfile

                    const { data: branch } = await supabase
                        .from('branches')
                        .select('*')
                        .eq('id', branchId)
                        .single()

                    set({
                        user,
                        branch: branch || null,
                        sessionToken: `${user.id}:${Date.now()}`,
                        isLoading: false,
                        error: null,
                    })
                    return true
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : 'Login failed'
                    set({ isLoading: false, error: message, user: null })
                    return false
                }
            },

            // ── Franchisee email login (Supabase Auth) ───────────────────────
            loginWithEmail: async (email: string, password: string) => {
                set({ isLoading: true, error: null })
                try {
                    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                        email,
                        password,
                    })

                    if (authError) {
                        set({ isLoading: false, error: authError.message })
                        return false
                    }

                    const role = authData.user?.app_metadata?.role
                    if (role !== 'franchisee' && role !== 'master_admin') {
                        await supabase.auth.signOut()
                        set({ isLoading: false, error: 'This account is not authorized for the POS.' })
                        return false
                    }

                    // Fetch linked public.users profile
                    const { data: profile } = await supabase
                        .from('users')
                        .select('*')
                        .eq('auth_id', authData.user.id)
                        .single()

                    // Fetch the franchisee's branches (first active branch)
                    const franchiseId = authData.user.app_metadata?.franchise_id
                    let branch: Branch | null = null

                    if (franchiseId) {
                        const { data: branches } = await supabase
                            .from('branches')
                            .select('*')
                            .eq('status', 'active')
                            .limit(1)
                        branch = branches?.[0] ?? null
                    }

                    const fallbackProfile: UserProfile = {
                        id: authData.user.id,
                        auth_id: authData.user.id,
                        name: authData.user.user_metadata?.full_name ?? email,
                        email,
                        role: 'investor',
                        branch_id: branch?.id ?? null,
                        pin_code: null,
                        is_active: true,
                        created_at: authData.user.created_at,
                    }

                    set({
                        user: (profile as UserProfile) ?? fallbackProfile,
                        branch,
                        sessionToken: authData.session?.access_token ?? null,
                        isLoading: false,
                        error: null,
                    })
                    return true
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : 'Login failed'
                    set({ isLoading: false, error: message, user: null })
                    return false
                }
            },

            logout: async () => {
                await supabase.auth.signOut()
                set({ user: null, branch: null, sessionToken: null, error: null })
            },

            clearError: () => set({ error: null }),
        }),
        {
            name: 'wildshakes-auth',
            partialize: (state) => ({ user: state.user, branch: state.branch, sessionToken: state.sessionToken }),
        }
    )
)
