import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Shown on the login/setup screens so anyone can tell which build a tablet is
// running — the question that comes up every time a fix "doesn't seem to be
// there yet". Vercel sets the commit; locally it reads "local".
const buildStamp = `${(process.env.VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7)} · ${new Date().toLocaleString('en-PH', {
  timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
})}`

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(buildStamp) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // The app registers the worker itself (src/lib/appUpdate.ts) so it can
      // decide when a new build takes effect — never mid-sale.
      injectRegister: false,
      includeAssets: ['*.png'],
      manifest: {
        name: 'Wildshakes Nexus POS',
        short_name: 'WS POS',
        description: 'Multi-branch POS system for Wildshakes Cafe',
        theme_color: '#7c3aed',
        background_color: '#0a0a0f',
        display: 'standalone',
        orientation: 'landscape',
        start_url: '/',
        icons: [
          { src: '/Wild-Shakes-PNG-Transparent-Square.png', sizes: '192x192', type: 'image/png' },
          { src: '/Wild-Shakes-PNG-Transparent-Square.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // A new worker takes control immediately; public/sw-takeover.js then
        // hands off to the page (or reloads a page too old to answer) so a
        // tablet never sits on a stale build.
        skipWaiting: true,
        clientsClaim: true,
        importScripts: ['sw-takeover.js'],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
})
