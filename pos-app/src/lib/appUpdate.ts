/**
 * appUpdate.ts — keep every tablet on the latest deploy, without ever
 * restarting mid-sale.
 *
 * The POS is loaded live from the web by the tablet shell, so a deploy should
 * reach every branch on its own. It didn't: the service worker cached the old
 * build and nothing ever reloaded the page, so tablets ran stale code for days.
 *
 * This module registers the worker itself (the plugin's default registration is
 * turned off in vite.config.ts), checks for a new build every 15 minutes and
 * whenever the app comes back to the foreground, and — when one has taken
 * control — restarts the app the moment it is safe: immediately if the cart is
 * empty, otherwise right after the current sale finishes. Login, the branch
 * claim, held orders and queued sales all survive a restart; only an
 * in-progress cart wouldn't, which is exactly what we wait for.
 *
 * It also answers the new worker's handshake (see public/sw-takeover.js) so the
 * worker knows this page will handle the restart and must not force one.
 */

const CHECK_EVERY_MS = 15 * 60 * 1000
const SETTLE_MS = 6000   // let "Receipt printed" / the receipt modal finish before restarting

let registration: ServiceWorkerRegistration | null = null
let updatePending = false
let isSafeToReload: () => boolean = () => true
let onUpdateReady: () => void = () => {}

export function hasPendingUpdate(): boolean {
    return updatePending
}

/** Restart into the new build now. Returns false if no update is waiting. */
export function applyPendingUpdate(): boolean {
    if (!updatePending) return false
    updatePending = false
    window.location.reload()
    return true
}

/** Call when the app reaches a safe moment (e.g. the cart just emptied). */
export function applyPendingUpdateWhenSettled(): void {
    if (!updatePending) return
    window.setTimeout(() => {
        if (updatePending && isSafeToReload()) applyPendingUpdate()
    }, SETTLE_MS)
}

function noteNewVersion() {
    if (updatePending) return
    updatePending = true
    if (isSafeToReload()) {
        applyPendingUpdate()
        return
    }
    onUpdateReady()
}

export function setupAppUpdates(opts: { isSafeToReload: () => boolean; onUpdateReady: () => void }): void {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    isSafeToReload = opts.isSafeToReload
    onUpdateReady = opts.onUpdateReady

    // The handshake from a freshly activated worker. Answering it is what stops
    // the worker from reloading this page on its own.
    navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
        if (e.data?.type !== 'WS_POS_NEW_VERSION') return
        const src = e.source as { postMessage?: (m: unknown) => void } | null
        try { src?.postMessage?.({ type: 'WS_POS_UPDATE_ACK' }) } catch { /* ignore */ }
        try { navigator.serviceWorker.controller?.postMessage({ type: 'WS_POS_UPDATE_ACK' }) } catch { /* ignore */ }
        noteNewVersion()
    })

    // A new worker taking control means a new build is now the one that will be
    // served. Ignore the very first install on a fresh device — that one just
    // brought the app online, nothing to restart into.
    let controllerSeen = !!navigator.serviceWorker.controller
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (controllerSeen) noteNewVersion()
        controllerSeen = true
    })

    const register = async () => {
        try {
            // updateViaCache 'none': always fetch sw.js and the scripts it imports
            // from the network when checking, never from the HTTP cache.
            registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
            const check = () => { registration?.update().catch(() => { /* offline — try again later */ }) }
            window.setInterval(check, CHECK_EVERY_MS)
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') check()
            })
        } catch (err) {
            console.warn('[appUpdate] service worker registration failed', err)
        }
    }
    if (document.readyState === 'complete') void register()
    else window.addEventListener('load', () => { void register() }, { once: true })
}
