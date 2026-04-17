import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase, type UserProfile, type Branch } from '../lib/supabase'
import { getDeviceId, saveClaimedBranch, clearClaimedBranch } from '../lib/device'

interface AuthState {
    // ── Cashier session (Phase 2 → 3) ──────────────────────────────────────
    user:         UserProfile | null
    branch:       Branch | null
    sessionToken: string | null
    isLoading:    boolean
    error:        string | null

    // ── Phase 1: claim a branch for this device via owner email/password ────
    claimBranchForDevice: (
        email: string,
        password: string,
        branchId: string
    ) => Promise<{ success: boolean; error?: string }>

    // ── Phase 2: cashier PIN login (branch already known by device) ─────────
    loginWithPin: (pin: string, branchId: string) => Promise<boolean>

    // ── Cashier logout → returns to PIN screen (keeps branch claim) ─────────
    logoutCashier: () => void

    // ── Owner action: unclaim this device (clears device lock in DB + local) ─
    releaseDevice: (branchId: string) => Promise<void>

    clearError: () => void
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user:         null,
            branch:       null,
            sessionToken: null,
            isLoading:    false,
            error:        null,

            // ── Phase 1 ────────────────────────────────────────────────────
            claimBranchForDevice: async (email, password, branchId) => {
                set({ isLoading: true, error: null })
                try {
                    const deviceId = getDeviceId()

                    // Sign in with owner credentials
                    const { data: authData, error: authError } =
                        await supabase.auth.signInWithPassword({ email, password })

                    if (authError) {
                        set({ isLoading: false })
                        return { success: false, error: authError.message }
                    }

                    const role = authData.user?.app_metadata?.role
                    if (role !== 'franchisee' && role !== 'master_admin') {
                        await supabase.auth.signOut()
                        set({ isLoading: false })
                        return { success: false, error: 'This account is not authorized for POS setup.' }
                    }

                    // Fetch the target branch and check device lock
                    const { data: branchRow, error: branchErr } = await supabase
                        .from('branches')
                        .select('*')
                        .eq('id', branchId)
                        .single()

                    if (branchErr || !branchRow) {
                        set({ isLoading: false })
                        return { success: false, error: 'Branch not found.' }
                    }

                    // Allow owner to override if it's claimed by another device.
                    // This prevents lockouts if local storage is cleared.
                    // const existing = branchRow.active_device_id
                    // if (existing && existing !== deviceId) { ... }

                    // Claim the device slot
                    const { error: updateErr } = await supabase
                        .from('branches')
                        .update({ active_device_id: deviceId })
                        .eq('id', branchId)

                    if (updateErr) {
                        set({ isLoading: false })
                        return { success: false, error: updateErr.message }
                    }

                    // Persist branch locally so Phase 2 works on restart
                    saveClaimedBranch({
                        id:       branchRow.id,
                        name:     branchRow.name,
                        location: branchRow.location ?? '',
                    })

                    // Sign the owner OUT of Supabase Auth — they only
                    // authenticated to prove ownership, cashiers use PIN
                    await supabase.auth.signOut()

                    set({
                        branch: branchRow as Branch,
                        isLoading: false,
                        error: null,
                        user: null,
                        sessionToken: null,
                    })
                    return { success: true }

                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : 'Setup failed'
                    set({ isLoading: false })
                    return { success: false, error: message }
                }
            },

            // ── Phase 2 ────────────────────────────────────────────────────
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
                        set({ isLoading: false, error: 'Incorrect PIN. Try again.' })
                        return false
                    }

                    const userProfile = users[0] as UserProfile

                    // Re-fetch branch freshly
                    const { data: branch } = await supabase
                        .from('branches')
                        .select('*')
                        .eq('id', branchId)
                        .single()

                    set({
                        user:         userProfile,
                        branch:       (branch as Branch) ?? null,
                        sessionToken: `${userProfile.id}:${Date.now()}`,
                        isLoading:    false,
                        error:        null,
                    })
                    return true
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : 'Login failed'
                    set({ isLoading: false, error: message })
                    return false
                }
            },

            // ── Cashier logout (keeps branch, back to PIN screen) ───────────
            logoutCashier: () => {
                set({ user: null, sessionToken: null, error: null })
            },

            // ── Release device (owner action) ───────────────────────────────
            releaseDevice: async (branchId: string) => {
                const deviceId = getDeviceId()
                await supabase
                    .from('branches')
                    .update({ active_device_id: null })
                    .eq('id', branchId)
                    .eq('active_device_id', deviceId)

                clearClaimedBranch()
                set({ user: null, branch: null, sessionToken: null, error: null })
            },

            clearError: () => set({ error: null }),
        }),
        {
            name: 'wildshakes-auth',
            // Only persist branch (Phase 1 result) — user/session are ephemeral
            partialize: (state) => ({
                branch:       state.branch,
                sessionToken: state.sessionToken,
                user:         state.user,
            }),
        }
    )
)
