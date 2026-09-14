// A Worker started WITHOUT TEST_MODE: the test routes do not exist and the test clock and test IP headers are ignored.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { call } from './client.mjs'

test('without TEST_MODE: /api/test/reset and /api/test/seed are 404', async () => {
  assert.equal((await call('POST', '/api/test/reset')).status, 404)
  assert.equal((await call('POST', '/api/test/seed', { body: { scenario: 'demo' } })).status, 404)
})

test('without TEST_MODE: X-Test-Now is ignored (info.now is the real clock)', async () => {
  const r = await call('GET', '/api/info', { now: '2001-01-01T12:00:00Z' })
  assert.equal(r.status, 200)
  assert.ok(Math.abs(new Date(r.body.now).getTime() - Date.now()) < 5 * 60e3, `now was ${r.body.now}`)
})

test('without TEST_MODE: X-Test-IP does not split the wrong-code guard (11 wrong codes from "different" test IPs → 429)', async () => {
  let last
  for (let i = 0; i < 11; i++) last = await call('POST', '/api/family/signin', { body: { code: 'AAAA-AAAA' }, ip: `plain-${i}` })
  assert.equal(last.status, 429, last.text)
})

test('without TEST_MODE, after tools/first-setup.mjs: the school name with sample false, and the setup PIN signs in as the office', async () => {
  const info = await call('GET', '/api/info')
  assert.equal(info.body.school_name, process.env.SETUP_SCHOOL)
  assert.equal(info.body.sample, false)
  assert.equal(info.body.cutoff_rule_label, 'Order by 9:00 AM the school day before.')
  const r = await call('POST', '/api/staff/signin', { body: { pin: process.env.SETUP_PIN } })
  assert.equal(r.status, 200, r.text)
  assert.equal(r.body.role, 'admin')
  assert.equal(r.body.staff.name, process.env.SETUP_ADMIN)
  const settings = await call('GET', '/api/admin/settings', { token: r.body.token })
  assert.deepEqual([settings.body.classes.length, settings.body.items.length, settings.body.staff.length], [0, 0, 1], 'nothing else was created')
  assert.equal((await call('POST', '/api/test/reset', { token: r.body.token })).status, 404)
})
