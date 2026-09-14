// tools/first-setup.mjs: refuses bad input, never prints the PIN, and writes only the school row and one admin.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { hashPin } from '../src/auth.js'
import { buildSetupSql } from '../tools/first-setup.mjs'

const TOOL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'first-setup.mjs')
const run = (args) => spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8' })

test('first setup: refuses a PIN that is not 4 to 6 digits and never prints the PIN', async () => {
  // Inside the worktree (worker/.state-* is git-ignored), never the system temp folder.
  const dir = path.join(path.dirname(TOOL), '..', `.state-setup-test-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  try {
    const out = path.join(dir, 'setup.sql')
    for (const pin of ['123', '1234567', '12a4', '']) {
      const r = run(['--school', 'A School', '--admin', 'Ms. Office', '--pin', pin, '--out', out])
      assert.notEqual(r.status, 0, `PIN "${pin}" refused`)
    }
    await assert.rejects(buildSetupSql({ school: '', admin: 'x', pin: '1234' }), /--school/)
    await assert.rejects(buildSetupSql({ school: 'x', admin: 'x', pin: '1234', yearStart: '2026-09-08' }), /go together/)
    const ok = run(['--school', "St. Mary's (test)", '--admin', 'Ms. Office', '--pin', '583901', '--out', out])
    assert.equal(ok.status, 0, ok.stderr)
    assert.equal(`${ok.stdout}${ok.stderr}`.includes('583901'), false, 'the PIN is never printed')
    const text = readFileSync(out, 'utf8')
    assert.equal(text.includes('583901'), false, 'the PIN is not in the SQL, only its hash')
    assert.match(text, /INSERT INTO school .*'St\. Mary''s \(test\)', 0,/)
    assert.equal((text.match(/INSERT INTO/g) || []).length, 2, 'the school row and one staff row, nothing else')
    const [, hash, salt] = text.match(/'admin', '([0-9a-f]{64})', '([0-9a-f]{32})'/)
    assert.equal(await hashPin('583901', salt), hash, 'the hash matches what the Worker computes')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
