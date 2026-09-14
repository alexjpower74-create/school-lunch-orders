// A migrated, empty D1 (before anything resets it): /api/info still answers with the contract's defaults.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { call } from './client.mjs'

test('info on an empty D1: blank school, sample false, the default cut-off rule and the full allergen list', async () => {
  const r = await call('GET', '/api/info')
  assert.equal(r.status, 200, r.text)
  assert.equal(r.headers.get('cache-control'), 'no-store')
  const b = r.body
  assert.equal(b.school_name, '')
  assert.equal(b.sample, false)
  assert.equal(b.payment_instructions, '')
  assert.equal(b.cutoff_days_before, 1)
  assert.equal(b.cutoff_time, '09:00')
  assert.equal(b.cutoff_rule_label, 'Order by 9:00 AM the school day before.')
  assert.equal(b.zone, 'America/St_Johns')
  assert.equal(b.today, '2026-09-15')
  assert.equal(b.time_label, '11:00 AM')
  assert.equal(b.next_school_day, null)
  assert.equal(b.allergens.length, 12)
  assert.deepEqual(b.allergens[0], { key: 'eggs', label: 'Eggs' })
})

test('an empty D1 has no families: any code is refused with the plain message', async () => {
  const r = await call('POST', '/api/family/signin', { body: { code: 'KQ7M-4RTX' } })
  assert.equal(r.status, 401)
  assert.equal(r.body.field, 'code')
})
