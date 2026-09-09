/* global self */
// Runs inside the generated service worker (pulled in via workbox.importScripts
// in vite.config.ts). Plain JS on purpose: it is not bundled.
//
// Why this exists: the POS is a web app loaded live by the tablet shell. When a
// new build is deployed, the new service worker installs and takes control, but
// the page keeps running whatever JavaScript it loaded at launch, and on the
// next launch the *old* cached index is served first. In practice a tablet
// needed two full force-stops to reach new code, so branches stayed on stale
// builds for days after a deploy (a printer fix went live and the receipt kept
// printing the old way).
//
// After this worker activates and claims the open app, it tells the page. A
// current build answers and restarts itself when the cart is empty (see
// src/lib/appUpdate.ts) so a cashier is never reloaded mid-sale. A page that
// does not answer is running a build from before this handshake existed; it
// is reloaded here so the tablet is not left stuck on stale code.
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      await self.clients.claim()
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of clients) {
        let acked = false
        const onMessage = (e) => {
          if (e.source && e.source.id === client.id && e.data && e.data.type === 'WS_POS_UPDATE_ACK') acked = true
        }
        self.addEventListener('message', onMessage)
        try { client.postMessage({ type: 'WS_POS_NEW_VERSION' }) } catch (_) { /* client gone */ }
        await new Promise((r) => setTimeout(r, 3000))
        self.removeEventListener('message', onMessage)
        if (!acked && typeof client.navigate === 'function') {
          try { await client.navigate(client.url) } catch (_) { /* not navigable; it will pick the build up on its next launch */ }
        }
      }
    } catch (_) {
      // Never let the handshake block activation.
    }
  })())
})
