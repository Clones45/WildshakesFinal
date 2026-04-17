/**
 * Device identity management.
 * Generates a permanent UUID per device and stores it in localStorage.
 * Also manages the claimed branch binding for Phase 1 → Phase 2 login.
 */

const DEVICE_ID_KEY   = 'ws_device_id'
const DEVICE_BRANCH_KEY = 'ws_device_branch'

/** Returns the device's permanent UUID (creates one if first launch). */
export function getDeviceId(): string {
    let id = localStorage.getItem(DEVICE_ID_KEY)
    if (!id) {
        id = crypto.randomUUID()
        localStorage.setItem(DEVICE_ID_KEY, id)
    }
    return id
}

export interface ClaimedBranch {
    id: string
    name: string
    location: string
}

/** Persist the branch this device has claimed. */
export function saveClaimedBranch(branch: ClaimedBranch): void {
    localStorage.setItem(DEVICE_BRANCH_KEY, JSON.stringify(branch))
}

/** Retrieve the claimed branch, or null if not yet set up. */
export function getClaimedBranch(): ClaimedBranch | null {
    const raw = localStorage.getItem(DEVICE_BRANCH_KEY)
    if (!raw) return null
    try { return JSON.parse(raw) as ClaimedBranch }
    catch { return null }
}

/** Clear the device's branch claim (used when owner unclaims this device). */
export function clearClaimedBranch(): void {
    localStorage.removeItem(DEVICE_BRANCH_KEY)
}
