import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.wildshakes.pos.app',
  appName: 'Wildshakes POS',
  webDir: 'dist',

  // ─── Live URL Strategy ────────────────────────────────────────────────────
  // The APK loads your hosted website directly. Whenever you deploy an update
  // to Vercel/Netlify, all tablets pick it up automatically — no APK rebuild!
  //
  // ⚠️  REPLACE the URL below with your actual deployed Vercel/Netlify URL.
  //     Comment this block out only if you want to bundle the app locally.
  // ─────────────────────────────────────────────────────────────────────────
  server: {
    url: 'https://wildshakes-final.vercel.app', // 👈 Live URL Strategy active!
    cleartext: false,   // keep false — always use HTTPS in production
  },
};

export default config;
