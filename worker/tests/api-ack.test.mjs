// An allergy ticked after ordering: the family's Line carries conflicts and acknowledged exactly as the kitchen computes them, and
// POST /api/family/lines/:id/ack confirms it (no cut-off; refused for another family, a cancelled line, a past day, nothing to confirm).
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { call, familyToken, get, order, reset, staffToken } from './client.mjs'

beforeEach(() => reset())

const kitchenLine = (day, lineId) => day.children.flatMap((c) => c.lines).find((l) => l.line_id === lineId)
const THU_LATE = '2026-09-16T12:00:00Z' // after Thu Sep 17's cut-off (9:00 AM Wed Sep 16)

test('allergy ticked after ordering: the family line and the kitchen show it unconfirmed; "I understand, keep it" confirms it for both', async () => {
  const fam = await familyToken('fam-1')
  const kitchen = await staffToken('kitchen')
  const placed = await order(fam, [
    { child_id: 'ch-ava', date: '2026-09-17', item_id: 'mac', qty: 1 },
    { child_id: 'ch-ava', date: '2026-09-17', item_id: 'cookie', qty: 1 },
    { child_id: 'ch-liam', date: '2026-09-17', item_id: 'mac', qty: 1, allergen_ack: true },
  ])
  const byItem = (lines, child, item) => lines.find((l) => l.child_id === child && l.item_id === item)
  const avaMac = byItem(placed.order.lines, 'ch-ava', 'mac')
  const avaCookie = byItem(placed.order.lines, 'ch-ava', 'cookie')
  assert.deepEqual([avaMac.conflicts, avaMac.acknowledged], [[], true], 'no allergy yet')
  const liam = byItem(placed.order.lines, 'ch-liam', 'mac')
  assert.deepEqual([liam.conflicts, liam.acknowledged, liam.ack_allergens], [['milk'], true, ['milk']])

  assert.equal(
    (await call('PUT', '/api/family/children/ch-ava', { token: fam, body: { first_name: 'Ava', class_id: 'room-5', allergies: ['milk'] } }))
      .status,
    200,
  )
  let lines = (await get('/api/family/orders', fam)).body.lines
  assert.deepEqual([byItem(lines, 'ch-ava', 'mac').conflicts, byItem(lines, 'ch-ava', 'mac').acknowledged], [['milk'], false])
  let day = (await get('/api/kitchen/day?date=2026-09-17', kitchen)).body
  assert.deepEqual(
    [kitchenLine(day, avaMac.id).conflicts, kitchenLine(day, avaMac.id).acknowledged],
    [['milk'], false],
    'the kitchen agrees',
  )

  const ack = await call('POST', `/api/family/lines/${avaMac.id}/ack`, { token: fam })
  assert.equal(ack.status, 200, ack.text)
  assert.deepEqual([ack.body.line.conflicts, ack.body.line.acknowledged, ack.body.line.ack_allergens], [['milk'], true, ['milk']])
  day = (await get('/api/kitchen/day?date=2026-09-17', kitchen)).body
  assert.equal(kitchenLine(day, avaMac.id).acknowledged, true, 'the kitchen no longer shows "Not confirmed by the parent"')
  assert.equal(kitchenLine(day, avaCookie.id).acknowledged, false, 'only that line was confirmed')
  lines = (await get('/api/family/orders', fam)).body.lines
  assert.equal(byItem(lines, 'ch-ava', 'mac').acknowledged, true)

  const late = await call('POST', `/api/family/lines/${avaCookie.id}/ack`, { token: fam, now: THU_LATE })
  assert.equal(late.status, 200, `no cut-off on confirming: ${late.text}`)
  assert.equal(late.body.line.acknowledged, true)
  assert.equal((await get('/api/family/ledger', fam)).body.balance_cents, 900, 'confirming changes no money')
})

test('confirming a late allergy: 404 for another family, 409 for a cancelled line, a past day, or nothing to confirm', async () => {
  const fam = await familyToken('fam-1')
  const wed = await order(fam, [{ child_id: 'ch-ava', date: '2026-09-16', item_id: 'cookie', qty: 1 }], '2026-09-15T11:00:00Z')
  const thu = await order(fam, [
    { child_id: 'ch-ava', date: '2026-09-17', item_id: 'mac', qty: 1 },
    { child_id: 'ch-ava', date: '2026-09-17', item_id: 'cookie', qty: 1 },
    { child_id: 'ch-ava', date: '2026-09-17', item_id: 'chili', qty: 1 },
  ])
  const line = (item) => thu.order.lines.find((l) => l.item_id === item)
  assert.equal(
    (await call('PUT', '/api/family/children/ch-ava', { token: fam, body: { first_name: 'Ava', class_id: 'room-5', allergies: ['milk'] } }))
      .status,
    200,
  )

  const other = await call('POST', `/api/family/lines/${line('mac').id}/ack`, { token: await familyToken('fam-2') })
  assert.equal(other.status, 404)
  assert.equal(
    (await get('/api/family/orders', fam)).body.lines.find((l) => l.id === line('mac').id).acknowledged,
    false,
    'nothing changed',
  )

  assert.equal((await call('POST', `/api/family/lines/${line('cookie').id}/cancel`, { token: fam })).status, 200)
  const cancelled = await call('POST', `/api/family/lines/${line('cookie').id}/ack`, { token: fam })
  assert.deepEqual([cancelled.status, cancelled.body.code, cancelled.body.error], [409, 'bad_state', 'That lunch is already cancelled.'])

  const past = await call('POST', `/api/family/lines/${wed.order.lines[0].id}/ack`, { token: fam, now: '2026-09-17T12:00:00Z' })
  assert.deepEqual([past.status, past.body.code, past.body.error], [409, 'bad_state', 'That lunch was for a day that has passed.'])

  const nothing = await call('POST', `/api/family/lines/${line('chili').id}/ack`, { token: fam })
  assert.deepEqual([nothing.status, nothing.body.code, nothing.body.error], [409, 'bad_state', "There's nothing to confirm on that lunch."])

  assert.equal((await call('POST', '/api/family/lines/ln_nope/ack', { token: fam })).status, 404)
  assert.equal(
    (await call('POST', `/api/family/lines/${line('mac').id}/ack`, { token: await staffToken('admin') })).status,
    401,
    'a staff token',
  )
})
