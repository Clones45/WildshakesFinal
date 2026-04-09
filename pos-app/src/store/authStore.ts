import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase, type UserProfile, type Branch } from '../lib/supabase'

interface AuthState {
    user: UserProfile | null
    branch: Branch | null
    sessionToken: string | null
    isLoading: boolean
    error: string | null
    loginWithPin: (pin: string, branchId: string) => Promise<boolean>
    logout: () => void
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

            loginWithPin: async (pin: string, branchId: string) => {
                set({ isLoading: true, error: null })
                try {
                    // Fetch user by branch + pin
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

                    // Fetch branch info
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

            logout: () => {
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
