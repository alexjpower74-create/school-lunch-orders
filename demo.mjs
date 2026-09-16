// npm run demo: School Lunch Orders on this computer with the SAMPLE school, families and orders.
// Local only. TEST_MODE is on so the seed route exists; never deploy with it (docs/DEPLOY.md). The browser sends no test clock,
// so the demo runs on the real time.
// Usage: npm run demo            keeps everything from last time (seeds only the first time)
//        npm run demo -- --fresh starts again from the SAMPLE seed (orders around today)
// PORT (default 8601) picks the port; the wrangler inspector uses PORT + 10.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const worker = join(dirname(fileURLToPath(import.meta.url)), 'worker')
const PORT = Number(process.env.PORT || 8601)
const BASE = `http://127.0.0.1:${PORT}`
const state = join(worker, '.state-demo')
const fresh = process.argv.includes('--fresh') || !existsSync(state)
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' }

if (fresh) {
  rmSync(state, { recursive: true, force: true })
  const m = spawnSync('wrangler', ['d1', 'migrations', 'apply', 'school-lunch-orders', '--local', '--persist-to', state], {
    cwd: worker,
    env,
    stdio: 'inherit',
  })
  if (m.status !== 0) process.exit(m.status ?? 1)
}

const child = spawn(
  'wrangler',
  [
    'dev',
    '--local',
    '--port',
    String(PORT),
    '--inspector-port',
    String(PORT + 10),
    '--persist-to',
    state,
    '--var',
    'TEST_MODE:1',
    '--show-interactive-dev-session=false',
  ],
  { cwd: worker, env, stdio: ['ignore', 'ignore', 'inherit'], detached: true },
)
const stop = () => {
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {}
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
child.on('exit', (code) => {
  console.error(`wrangler dev stopped (${code}).`)
  process.exit(code ?? 1)
})

for (let i = 0; ; i++) {
  try {
    if ((await fetch(`${BASE}/api/info`)).ok) break
  } catch {}
  if (i > 120) {
    console.error(`The Worker did not answer on ${BASE}.`)
    stop()
  }
  await new Promise((r) => setTimeout(r, 500))
}

let codes = '  Family codes (SAMPLE)          KQ7M-4RTX Liam and Ava · W3PH-8JND Noah · C9VB-6FYE Emma, Jack and Chloe · T5ZA-2GUK Owen'
if (fresh) {
  const r = await fetch(`${BASE}/api/test/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario: 'demo' }),
  })
  const body = await r.json().catch(() => ({}))
  console.log(r.ok ? `Seeded the SAMPLE school around ${body.today ?? 'today'}.` : `Seeding failed: ${JSON.stringify(body)}`)
  if (Array.isArray(body.families) && body.families.length) {
    codes = `  Family codes (SAMPLE)          ${body.families.map((f) => `${f.code} ${f.label.replace(/ \(SAMPLE\)$/, '')}`).join(' · ')}`
  }
}

console.log(`
School Lunch Orders is running (SAMPLE school, families and orders; local only, no payments, nothing is sent).
  Parents (phone)                ${BASE}/
${codes}
  Staff sign-in                  ${BASE}/staff/
    Office and settings          PIN 3141 (Ms. Janes)  → ${BASE}/office/  and  ${BASE}/admin/
    Kitchen                      PIN 2718 (Mr. Kean)   → ${BASE}/kitchen/
    Teacher, Room 4              PIN 1618 (Ms. Oldford) → ${BASE}/teacher/
Press Ctrl+C to stop.`)
