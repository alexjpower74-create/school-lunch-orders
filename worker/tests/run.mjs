// `npm test`: pure unit tests, the API suites against a fresh local Worker in TEST_MODE, then the no-test-mode check against a
// fresh Worker WITHOUT TEST_MODE, set up with tools/first-setup.mjs (the /api/test/* routes are 404, X-Test-Now / X-Test-IP are
// ignored, and the setup PIN signs in as the office).
// Scaffold adapted from Visitor Log by sl-lead; sl1 owns it.
//   PORT (default 8602, inspector PORT+10). State in worker/.state-<PORT> (and .state-<PORT>-plain), wiped first and removed after.
//   If something already answers on PORT, it is used as is and not stopped (unless --fresh), and the empty/plain checks are skipped.
//   --unit-only       unit tests only
//   --api-only        skip the unit tests
//   --grep <regex>    only tests whose name matches (unit and API; the empty and plain checks are skipped)
//   --fresh           refuse to reuse a Worker already answering on PORT (negative controls must test their own copy)
// Exit code is non-zero when anything fails. Local only: never --remote.
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.PORT || 8602)
const BASE = `http://127.0.0.1:${PORT}`
const args = process.argv.slice(2)
const flag = (f) => args.includes(f)
const opt = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : null)
const env = { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' }
const reporter = process.env.TEST_REPORTER ? [`--test-reporter=${process.env.TEST_REPORTER}`] : []
const TESTS = path.join(WORKER, 'tests')
// api-empty runs first, on its own, before anything resets the D1; api-plain runs against a Worker without TEST_MODE.
const SPECIAL = new Set(['api-empty.test.mjs', 'api-plain.test.mjs'])
const API_FILES = readdirSync(TESTS)
  .filter((f) => /^api-.+\.test\.mjs$/.test(f) && !SPECIAL.has(f))
  .sort()
  .map((f) => path.join('tests', f))
const UNIT_FILES = readdirSync(TESTS)
  .filter((f) => f.endsWith('.test.mjs') && !f.startsWith('api-'))
  .sort()
  .map((f) => path.join('tests', f))
// A made-up school for the no-test-mode check only (no SAMPLE rows on purpose: that is what the check proves).
const PLAIN = { school: 'First Setup Check School', admin: 'Setup Check Office', pin: '582714' }
const grep = opt('--grep')
const grepArgs = grep ? [`--test-name-pattern=${grep}`] : []

function runNodeTests(files, extra = [], extraEnv = {}) {
  if (!files.length) return 0
  const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...reporter, ...extra, ...files], {
    cwd: WORKER,
    stdio: 'inherit',
    env: { ...env, ...extraEnv },
  })
  return r.status === 0 ? 0 : 1
}

async function answers() {
  try {
    const r = await fetch(`${BASE}/api/info`, { signal: AbortSignal.timeout(1500) })
    return r.status > 0
  } catch {
    return false
  }
}

const wrangler = (argv) => spawnSync('wrangler', argv, { cwd: WORKER, stdio: ['ignore', 'ignore', 'inherit'], env }).status === 0

function freshState(dir) {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  return wrangler(['d1', 'migrations', 'apply', 'school-lunch-orders', '--local', '--persist-to', dir])
}

async function startWorker(dir, testVars = true) {
  const dev = spawn(
    'wrangler',
    [
      'dev',
      '--local',
      '--port',
      String(PORT),
      '--inspector-port',
      String(PORT + 10),
      '--persist-to',
      dir,
      ...(testVars ? ['--var', 'TEST_MODE:1'] : []),
      '--show-interactive-dev-session=false',
    ],
    { cwd: WORKER, stdio: ['ignore', 'ignore', 'inherit'], env, detached: true },
  )
  const t0 = Date.now()
  while (!(await answers())) {
    if (dev.exitCode !== null || Date.now() - t0 > 90000) {
      try {
        process.kill(-dev.pid, 'SIGTERM')
      } catch {}
      return null
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  return dev
}

async function stopWorker(dev) {
  try {
    process.kill(-dev.pid, 'SIGTERM')
  } catch {}
  // Wait until the port is really free, so the next run cannot talk to this Worker.
  const t0 = Date.now()
  while ((await answers()) && Date.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 200))
  if (await answers()) {
    try {
      process.kill(-dev.pid, 'SIGKILL')
    } catch {}
    await new Promise((r) => setTimeout(r, 1000))
  }
}

let failed = 0

if (!flag('--api-only')) {
  console.log(`\n== unit: ${UNIT_FILES.join(' ')}`)
  failed |= runNodeTests(UNIT_FILES, grepArgs)
}

if (!flag('--unit-only')) {
  let reused = false
  let dev = null
  const STATE = path.join(WORKER, `.state-${PORT}`)
  if (await answers()) {
    if (flag('--fresh')) {
      console.error(`\n== api: REFUSED — something already answers on ${BASE} and --fresh was given`)
      process.exit(1)
    }
    reused = true
    console.log(`\n== api: using the Worker already answering on ${BASE}`)
  } else {
    console.log(`\n== api: fresh Worker on ${BASE} (state ${path.relative(WORKER, STATE)})`)
    if (!freshState(STATE)) {
      console.error('migrations failed')
      process.exit(1)
    }
    dev = await startWorker(STATE)
    if (!dev) {
      console.error('the Worker did not start')
      process.exit(1)
    }
  }
  // A freshly migrated D1 is empty: checked first, before any test resets it, and only on a Worker this run started.
  if (!reused && !grep) failed |= runNodeTests(['tests/api-empty.test.mjs'], [], { API_BASE: BASE })
  else console.log('== api-empty: SKIPPED — --grep, or the Worker on this port was not started by this run')
  console.log(`== api: ${API_FILES.join(' ')}`)
  failed |= runNodeTests(API_FILES, grepArgs, { API_BASE: BASE })
  if (dev) {
    await stopWorker(dev)
    rmSync(STATE, { recursive: true, force: true })
  }

  if (grep) {
    console.log('\n== plain: skipped (--grep)')
  } else if (reused) {
    console.log(`\n== plain: SKIPPED — a Worker this run did not start holds ${BASE}; run again with the port free`)
  } else {
    const PSTATE = path.join(WORKER, `.state-${PORT}-plain`)
    console.log(`\n== plain: a fresh Worker on ${BASE} WITHOUT TEST_MODE`)
    // A real school's start: tools/first-setup.mjs SQL applied to a fresh D1 (the school row and one office PIN, nothing else).
    const sqlFile = path.join(PSTATE, 'first-setup.sql')
    let ok = freshState(PSTATE)
    ok =
      ok &&
      spawnSync(
        process.execPath,
        ['tools/first-setup.mjs', '--school', PLAIN.school, '--admin', PLAIN.admin, '--pin', PLAIN.pin, '--out', sqlFile],
        { cwd: WORKER, stdio: 'inherit' },
      ).status === 0
    ok = ok && wrangler(['d1', 'execute', 'school-lunch-orders', '--local', '--persist-to', PSTATE, '--file', sqlFile])
    const plain = ok ? await startWorker(PSTATE, false) : null
    if (!plain) {
      console.error('the no-test-mode check could not start')
      failed = 1
    } else {
      failed |= runNodeTests(['tests/api-plain.test.mjs'], [], {
        API_BASE: BASE,
        SETUP_SCHOOL: PLAIN.school,
        SETUP_ADMIN: PLAIN.admin,
        SETUP_PIN: PLAIN.pin,
      })
      await stopWorker(plain)
    }
    rmSync(PSTATE, { recursive: true, force: true })
  }
}

process.exit(failed ? 1 : 0)
