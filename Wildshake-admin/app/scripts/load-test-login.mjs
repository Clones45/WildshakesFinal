// Concurrency load test for the /login -> /dashboard -> /menu path.
//
// Fires N fully independent browser sessions at once (real cookies, real
// isolated context per "user" — this is what genuinely reproduces the
// refresh-token race under concurrency, not just N raw HTTP requests
// sharing one client). Each session logs in, then visits /dashboard and
// /menu, and reports timing plus whether it hit a crash page.
//
// Setup (once):
//   npm i -D playwright
//   npx playwright install chromium
//
// Accounts file (gitignored — holds real credentials):
//   load-test-accounts.json
//   [{ "email": "manager1@wildshakes.com", "password": "..." }, ...]
//   Need at least CONCURRENCY accounts — reusing the same account across
//   concurrent sessions does not reproduce this bug, since each account's
//   refresh token is independent.
//
// Usage:
//   BASE_URL=https://your-app.vercel.app node scripts/load-test-login.mjs
//   BASE_URL=... CONCURRENCY=50 node scripts/load-test-login.mjs
//
// After it finishes, check Supabase Dashboard > Logs > Auth (or
// `get_logs` service:"auth") for the printed time window and confirm:
//   - zero POST /token entries with status 400
//   - zero GET /user entries with status 403

import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const BASE_URL = process.env.BASE_URL
const ACCOUNTS_FILE = process.env.ACCOUNTS_FILE ?? './load-test-accounts.json'
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 30)

if (!BASE_URL) {
  console.error('Set BASE_URL to your deployed URL, e.g. https://admin.wildshakes.com')
  process.exit(1)
}

let accounts
try {
  accounts = JSON.parse(readFileSync(ACCOUNTS_FILE, 'utf-8'))
} catch (err) {
  console.error(`Could not read ${ACCOUNTS_FILE}: ${err.message}`)
  console.error('Expected format: [{ "email": "...", "password": "..." }, ...]')
  process.exit(1)
}

if (accounts.length < CONCURRENCY) {
  console.error(`Need at least ${CONCURRENCY} accounts in ${ACCOUNTS_FILE}, found ${accounts.length}.`)
  process.exit(1)
}

async function runOne(browser, { email, password }, index) {
  // Separate context per "user" == separate cookie jar == a real independent
  // session, exactly like a separate branch tablet/terminal.
  const context = await browser.newContext()
  const page = await context.newPage()
  const result = { index, email, ok: true, steps: {}, errors: [] }

  try {
    const t0 = Date.now()
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('#email', email)
    await page.fill('#password', password)
    await Promise.all([
      page.waitForURL(/\/(dashboard|franchiser|commissary-portal)/, { timeout: 15000 }),
      page.click('button[type="submit"]'),
    ])
    result.steps.login = Date.now() - t0

    for (const path of ['/dashboard', '/menu']) {
      const t1 = Date.now()
      const response = await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded', timeout: 15000 })
      result.steps[path] = Date.now() - t1

      const status = response?.status() ?? 0
      const bodyText = (await page.textContent('body').catch(() => '')) || ''
      const crashed = status >= 500 || /application error|something went wrong/i.test(bodyText)

      if (crashed) {
        result.ok = false
        result.errors.push(`${path} -> status ${status}, crash page detected`)
      }
    }
  } catch (err) {
    result.ok = false
    result.errors.push(err instanceof Error ? err.message : String(err))
  } finally {
    await context.close()
  }

  return result
}

async function main() {
  const browser = await chromium.launch()
  const selected = accounts.slice(0, CONCURRENCY)

  const startedAt = new Date()
  console.log(`Launching ${selected.length} concurrent sessions against ${BASE_URL} ...`)

  const results = await Promise.all(
    selected.map((acct, i) => runOne(browser, acct, i))
  )

  await browser.close()
  const finishedAt = new Date()

  const failed = results.filter(r => !r.ok)
  console.log(`\nDone in ${((finishedAt - startedAt) / 1000).toFixed(1)}s — ${results.length - failed.length}/${results.length} sessions completed cleanly\n`)

  for (const r of results) {
    const tag = r.ok ? 'OK  ' : 'FAIL'
    console.log(`[${tag}] #${r.index} ${r.email} — login ${r.steps.login ?? '-'}ms, /dashboard ${r.steps['/dashboard'] ?? '-'}ms, /menu ${r.steps['/menu'] ?? '-'}ms`)
    for (const e of r.errors) console.log(`        ${e}`)
  }

  console.log(`\nCheck Supabase Dashboard > Logs > Auth for this window:`)
  console.log(`  ${startedAt.toISOString()} -> ${finishedAt.toISOString()}`)
  console.log('Pass criteria: zero POST /token with status 400, zero GET /user with status 403.')

  if (failed.length > 0) {
    console.log(`\n${failed.length} session(s) showed a visible crash — see FAIL lines above.`)
    process.exitCode = 1
  }
}

main()
