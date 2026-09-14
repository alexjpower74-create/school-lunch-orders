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
