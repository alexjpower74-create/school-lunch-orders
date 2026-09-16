// Placing and cancelling orders: the cut-off on a fake clock, allergen acknowledgements, the order of the checks, all or
// nothing, the price snapshot, the ledger labels and the family menu.
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { NOW, call, familyToken, get, order, reset, staffToken } from './client.mjs'

beforeEach(() => reset())

const line = (child_id, date, item_id, qty = 1, extra = {}) => ({ child_id, date, item_id, qty, ...extra })
const post = (token, lines, now = NOW) => call('POST', '/api/family/orders', { token, body: { lines }, now })

test('cut-off on a fake clock: Wed Sep 16 at 8:59 AM → 201, at 9:00 AM → 409 cutoff_passed, at the anchor → 409; Thu Sep 17 at the anchor → 201', async () => {
  const token = await familyToken('fam-1')
  const early = await post(token, [line('ch-ava', '2026-09-16', 'apple')], '2026-09-15T11:29:00Z')
  assert.equal(early.status, 201, early.text)
  const atNine = await post(token, [line('ch-ava', '2026-09-16', 'milk')], '2026-09-15T11:30:00Z')
  assert.equal(atNine.status, 409, atNine.text)
  assert.equal(atNine.body.code, 'cutoff_passed')
  assert.equal(atNine.body.error, 'Ordering for Wed Sep 16 closed at 9:00 AM Tue Sep 15.')
  assert.equal(atNine.body.date, '2026-09-16')
  assert.equal(atNine.body.index, 0)
  const anchor = await post(token, [line('ch-ava', '2026-09-16', 'milk')])
  assert.equal(anchor.status, 409)
  assert.equal(anchor.body.code, 'cutoff_passed')
  const thu = await post(token, [line('ch-ava', '2026-09-17', 'milk')])
  assert.equal(thu.status, 201, thu.text)
  const mixed = await post(token, [line('ch-liam', '2026-09-18', 'apple'), line('ch-liam', '2026-09-16', 'apple')])
  assert.equal(mixed.status, 409)
  assert.equal(mixed.body.index, 1)
  assert.equal((await get('/api/family/orders', token)).body.lines.length, 2, 'the mixed request stored nothing')
})

test('cut-off on a fake clock: cancel follows the same rule (8:59 AM yes, 9:00 AM and later no) and can_cancel says so', async () => {
  const token = await familyToken('fam-1')
  const placed = await order(token, [line('ch-ava', '2026-09-16', 'apple'), line('ch-ava', '2026-09-16', 'milk')], '2026-09-15T11:00:00Z')
  const [apple, milk] = ['apple', 'milk'].map((id) => placed.order.lines.find((l) => l.item_id === id))
  assert.equal(apple.can_cancel, true)
  const ok = await call('POST', `/api/family/lines/${apple.id}/cancel`, { token, now: '2026-09-15T11:29:59Z' })
  assert.equal(ok.status, 200, ok.text)
  assert.equal(ok.body.line.status, 'cancelled')
  assert.equal(ok.body.line.status_label, 'Cancelled')
  const late = await call('POST', `/api/family/lines/${milk.id}/cancel`, { token, now: '2026-09-15T11:30:00Z' })
  assert.equal(late.status, 409, late.text)
  assert.equal(late.body.code, 'cutoff_passed')
  assert.equal(late.body.error, 'Ordering for Wed Sep 16 closed at 9:00 AM Tue Sep 15.')
  assert.equal((await call('POST', `/api/family/lines/${milk.id}/cancel`, { token })).status, 409)
  const lines = (await get('/api/family/orders', token)).body.lines
  assert.equal(lines.find((l) => l.id === milk.id).can_cancel, false)
  assert.equal(lines.find((l) => l.id === milk.id).cutoff_label, 'Ordering closed at 9:00 AM Tue Sep 15')
  const again = await call('POST', `/api/family/lines/${apple.id}/cancel`, { token, now: '2026-09-15T11:10:00Z' })
  assert.equal(again.status, 409)
  assert.equal(again.body.code, 'bad_state')
  assert.equal(again.body.error, 'That lunch is already cancelled.')
})

test('cut-off: Tue Oct 13 open until 9:00 AM Fri Oct 9 and closed one minute after', async () => {
  const token = await familyToken('fam-1')
  const week = await get('/api/family/menu?week=2026-10-13', token, '2026-10-09T11:29:00Z')
  const [mon, tue] = week.body.days
  assert.equal(mon.status, 'no_school')
  assert.equal(mon.status_label, 'Holiday')
  assert.deepEqual(mon.no_school, { kind: 'holiday', kind_label: 'Holiday', note: 'Thanksgiving Day' })
  assert.deepEqual(mon.items, [])
  assert.equal(tue.status, 'open')
  assert.equal(tue.cutoff_label, 'Order by 9:00 AM Fri Oct 9')
  assert.equal(tue.cutoff_at, '2026-10-09T11:30:00.000Z')
  assert.equal((await post(token, [line('ch-ava', '2026-10-13', 'chili')], '2026-10-09T11:29:00Z')).status, 201)
  const late = await post(token, [line('ch-liam', '2026-10-13', 'chili')], '2026-10-09T11:31:00Z')
  assert.equal(late.status, 409, late.text)
  assert.equal(late.body.code, 'cutoff_passed')
  assert.equal(late.body.error, 'Ordering for Tue Oct 13 closed at 9:00 AM Fri Oct 9.')
  const closed = await get('/api/family/menu?week=2026-10-13', token, '2026-10-09T11:31:00Z')
  assert.equal(closed.body.days[1].status, 'closed')
  assert.equal(closed.body.days[1].items.length, 5, 'a closed day still lists its items for reading')
})

test('allergens: Liam + mac without allergen_ack → 409 allergen_ack_required listing that index', async () => {
  const token = await familyToken('fam-1')
  const r = await post(token, [line('ch-liam', '2026-09-17', 'mac')])
  assert.equal(r.status, 409, r.text)
  assert.equal(r.body.code, 'allergen_ack_required')
  assert.equal(r.body.error, 'Liam is allergic to Milk. Macaroni and cheese contains Milk. Tick "I understand" to order it anyway.')
  assert.deepEqual(r.body.lines, [
    { index: 0, child_id: 'ch-liam', first_name: 'Liam', item_id: 'mac', item_name: 'Macaroni and cheese', allergens: ['milk'] },
  ])
  const f = await post(token, [line('ch-liam', '2026-09-17', 'mac', 1, { allergen_ack: false })])
  assert.equal(f.status, 409, 'allergen_ack: false is not an acknowledgement')
  assert.deepEqual((await get('/api/family/orders', token)).body.lines, [])
})

test('allergens: Liam + mac with the ack → 201 and ack_allergens ["milk"]', async () => {
  const token = await familyToken('fam-1')
  const r = await post(token, [line('ch-liam', '2026-09-17', 'mac', 1, { allergen_ack: true })])
  assert.equal(r.status, 201, r.text)
  assert.deepEqual(r.body.order.lines[0].ack_allergens, ['milk'])
  assert.deepEqual((await get('/api/family/orders', token)).body.lines[0].ack_allergens, ['milk'])
})

test('allergens: Ava (no allergies) + mac on Thu Sep 17 without an ack → 201', async () => {
  const token = await familyToken('fam-1')
  const r = await post(token, [line('ch-ava', '2026-09-17', 'mac')])
  assert.equal(r.status, 201, r.text)
  assert.deepEqual(r.body.order.lines[0].ack_allergens, [])
  const acked = await post(token, [line('ch-ava', '2026-09-18', 'cookie', 1, { allergen_ack: true })])
  assert.deepEqual(acked.body.order.lines[0].ack_allergens, [], 'an ack with no conflict stores nothing')
})

test("allergens: a request mixing Liam's and Ava's mac lists only Liam's line; several allergens are named in list order", async () => {
  const token = await familyToken('fam-1')
  const r = await post(token, [
    line('ch-ava', '2026-09-17', 'mac'),
    line('ch-liam', '2026-09-17', 'mac'),
    line('ch-liam', '2026-09-17', 'cookie'),
  ])
  assert.equal(r.status, 409)
  assert.deepEqual(
    r.body.lines.map((l) => [l.index, l.child_id, l.item_id]),
    [
      [1, 'ch-liam', 'mac'],
      [2, 'ch-liam', 'cookie'],
    ],
  )
  assert.equal(r.body.error, 'Liam is allergic to Milk. Macaroni and cheese contains Milk. Tick "I understand" to order it anyway.')
  const fam3 = await familyToken('fam-3')
  assert.equal(
    (
      await call('PUT', '/api/family/children/ch-chloe', {
        token: fam3,
        body: { first_name: 'Chloe', class_id: 'room-1', allergies: ['soy', 'sesame', 'eggs'] },
      })
    ).status,
    200,
  )
  const two = await post(fam3, [line('ch-chloe', '2026-09-23', 'stirfry')])
  assert.equal(
    two.body.error,
    'Chloe is allergic to Sesame seeds and Soy. Vegetable stir-fry with rice contains Sesame seeds and Soy. Tick "I understand" to order it anyway.',
  )
  assert.deepEqual(two.body.lines[0].allergens, ['sesame', 'soy'])
  const ok = await post(fam3, [
    line('ch-chloe', '2026-09-23', 'stirfry', 1, { allergen_ack: true }),
    line('ch-jack', '2026-09-23', 'stirfry'),
  ])
  assert.equal(ok.status, 201)
  assert.deepEqual(ok.body.order.lines.find((l) => l.child_id === 'ch-chloe').ack_allergens, ['sesame', 'soy'])
})

test('all or nothing: a request with one bad line stores nothing (ledger and lines unchanged)', async () => {
  const token = await familyToken('fam-1')
  await order(token, [line('ch-ava', '2026-09-17', 'chili')])
  const before = [(await get('/api/family/orders', token)).body, (await get('/api/family/ledger', token)).body]
  const bads = [
    [line('ch-ava', '2026-09-18', 'pizza'), line('ch-ava', '2026-09-18', 'milk', 3)],
    [line('ch-ava', '2026-09-18', 'pizza'), line('ch-liam', '2026-09-18', 'milk')],
    [line('ch-ava', '2026-09-18', 'pizza'), line('ch-ava', '2026-09-18', 'chili')],
    [line('ch-ava', '2026-09-18', 'pizza'), line('ch-ava', '2026-09-17', 'chili')],
  ]
  const codes = []
  for (const lines of bads) codes.push((await post(token, lines)).body.code)
  assert.deepEqual(codes, ['over_max', 'allergen_ack_required', 'not_on_menu', 'over_max'])
  const after = [(await get('/api/family/orders', token)).body, (await get('/api/family/ledger', token)).body]
  assert.deepEqual(after, before)
})

test('order checks run in the contract order: 400, 404, no_school, not_on_menu, cutoff_passed, over_max', async () => {
  const token = await familyToken('fam-1')
  const cases = [
    [[], 400, 'bad_request'],
    [[line('ch-ava', '2026-09-17', 'chili', 0)], 400, 'bad_request'],
    [[line('ch-ava', '2026-09-17', 'chili', 1.5)], 400, 'bad_request'],
    [[line('ch-ava', '2026-09-17', 'chili', 11)], 400, 'bad_request'],
    [[line('ch-ava', '2026-02-30', 'chili')], 400, 'bad_request'],
    [[line('ch-ava', '2026-09-17', 'chili', 1, { allergen_ack: 'yes' })], 400, 'bad_request'],
    [[line('ch-ava', '2026-09-17', 'chili'), line('ch-ava', '2026-09-17', 'chili')], 400, 'bad_request'],
    [[line('ch-noah', '2026-09-17', 'chili')], 404, 'not_found'],
    [[line('ch-ava', '2026-09-17', 'lobster')], 404, 'not_found'],
    [[line('ch-ava', '2026-10-12', 'chili'), line('ch-ava', '2026-09-17', 'lobster')], 404, 'not_found'],
    [[line('ch-ava', '2026-10-12', 'chili')], 409, 'no_school'],
    [[line('ch-ava', '2026-09-17', 'fishcakes'), line('ch-ava', '2026-09-19', 'chili')], 409, 'no_school'],
    [[line('ch-ava', '2026-09-16', 'apple'), line('ch-ava', '2026-09-17', 'fishcakes')], 409, 'not_on_menu'],
    [[line('ch-ava', '2026-09-17', 'milk', 3), line('ch-ava', '2026-09-16', 'apple')], 409, 'cutoff_passed'],
    [[line('ch-liam', '2026-09-17', 'mac'), line('ch-ava', '2026-09-17', 'milk', 3)], 409, 'over_max'],
  ]
  for (const [lines, status, code] of cases) {
    const r = await post(token, lines)
    assert.equal(r.status, status, `${JSON.stringify(lines)}: ${r.text}`)
    assert.equal(r.body.code, code, JSON.stringify(lines))
  }
  const sixtyOne = Array.from({ length: 61 }, (_, i) => line('ch-ava', '2026-09-17', `x${i}`))
  assert.equal((await post(token, sixtyOne)).body.field, 'lines')
  const dup = await post(token, [line('ch-ava', '2026-09-17', 'chili'), line('ch-ava', '2026-09-17', 'chili')])
  assert.equal(dup.body.index, 1)
  assert.equal((await post(token, [line('ch-ava', '2026-10-12', 'chili')])).body.error, "There's no school on Mon Oct 12 (Holiday).")
  const sat = await post(token, [line('ch-ava', '2026-09-19', 'chili')])
  assert.equal(sat.body.error, "There's no school on Sat Sep 19.")
  assert.equal(sat.body.date, '2026-09-19')
  assert.equal(
    (await post(token, [line('ch-ava', '2026-09-17', 'fishcakes')])).body.error,
    "Fish cakes and potatoes isn't on the menu for Thu Sep 17.",
  )
  assert.equal((await call('POST', '/api/family/orders', { token, body: { lines: 'milk' } })).status, 400)
  assert.equal((await call('POST', '/api/family/orders', { token })).status, 400)
})

test('over_max counts lunches already ordered for that child that day, and a cancelled one frees the place', async () => {
  const token = await familyToken('fam-1')
  const first = await order(token, [line('ch-liam', '2026-09-17', 'milk', 2, { allergen_ack: true })])
  const more = await post(token, [line('ch-liam', '2026-09-17', 'milk', 1, { allergen_ack: true })])
  assert.equal(more.status, 409)
  assert.equal(more.body.code, 'over_max')
  assert.equal(more.body.error, 'Liam can have at most 2 of White milk (250 mL) on Thu Sep 17.')
  assert.equal((await post(token, [line('ch-ava', '2026-09-17', 'milk', 2)])).status, 201, 'per child')
  await call('POST', `/api/family/lines/${first.order.lines[0].id}/cancel`, { token })
  const again = await post(token, [line('ch-liam', '2026-09-17', 'milk', 1, { allergen_ack: true })])
  assert.equal(again.status, 201)
  const once = await post(token, [line('ch-liam', '2026-09-17', 'milk', 1, { allergen_ack: true })])
  assert.equal(once.status, 201, 'a second line for the same child, day and item is its own line (1 + 1 = 2)')
  assert.equal(
    (await get('/api/family/orders', token)).body.lines.filter((l) => l.child_id === 'ch-liam' && l.status === 'active').length,
    2,
  )
})

test('price snapshot: a later price change never changes a placed line', async () => {
  const token = await familyToken('fam-1')
  const office = await staffToken('admin')
  await order(token, [line('ch-ava', '2026-09-17', 'mac', 1)])
  const settings = (await get('/api/admin/settings', office)).body
  const { id, ...mac } = settings.items.find((i) => i.id === 'mac')
  const put = await call('PUT', '/api/admin/items/mac', { token: office, body: { ...mac, price_cents: 450 } })
  assert.equal(put.status, 200, put.text)
  const lines = (await get('/api/family/orders', token)).body.lines
  assert.equal(lines[0].unit_price_cents, 400)
  assert.equal(lines[0].total_cents, 400)
  assert.equal((await get('/api/family/ledger', token)).body.balance_cents, 400)
  const fam3 = await familyToken('fam-3')
  const later = await order(fam3, [line('ch-jack', '2026-09-17', 'mac', 1)])
  assert.equal(later.order.lines[0].unit_price_cents, 450)
  assert.equal(later.order.total_cents, 450)
  const menu = (await get('/api/family/menu?week=2026-09-17', token)).body
  assert.equal(menu.days[3].items.find((i) => i.id === 'mac').price_cents, 450)
})

test('ledger labels and amounts: an order across a week and a cancellation', async () => {
  const token = await familyToken('fam-1')
  const week = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25']
  const placed = await order(token, [
    ...week.map((d) => line('ch-ava', d, 'apple')),
    line('ch-liam', '2026-09-17', 'mac', 1, { allergen_ack: true }),
  ])
  assert.equal(placed.order.item_count, 6)
  assert.equal(placed.order.total_cents, 5 * 125 + 400)
  assert.equal(placed.balance_cents, 1025)
  assert.deepEqual(
    placed.order.lines.map((l) => l.date),
    ['2026-09-17', ...week],
    'lines by date',
  )
  const ledger = (await get('/api/family/ledger', token)).body
  assert.equal(ledger.entries[0].label, 'Order: 6 items, Thu Sep 17 to Fri Sep 25')
  assert.equal(ledger.entries[0].kind, 'order')
  assert.equal(ledger.entries[0].amount_cents, 1025)
  assert.equal(ledger.entries[0].at_label, 'Tue Sep 15, 11:00 AM')
  const mac = placed.order.lines.find((l) => l.item_id === 'mac')
  const c = await call('POST', `/api/family/lines/${mac.id}/cancel`, { token })
  assert.equal(c.body.balance_cents, 625)
  const after = (await get('/api/family/ledger', token)).body
  assert.equal(after.entries[0].label, 'Cancelled: Macaroni and cheese ×1 for Liam, Thu Sep 17')
  assert.equal(after.entries[0].amount_cents, -400)
  assert.equal(after.balance_cents, 625)
  const one = await order(await familyToken('fam-2'), [line('ch-noah', '2026-09-17', 'chili')])
  assert.equal(one.order.item_count, 1)
  assert.equal((await get('/api/family/ledger', await familyToken('fam-2'))).body.entries[0].label, 'Order: 1 item, Thu Sep 17')
})

test('family menu: the default week, day statuses, items for reading when closed and none on a no-school day', async () => {
  const token = await familyToken('fam-1')
  const m = (await get('/api/family/menu', token)).body
  assert.equal(m.week_start, '2026-09-14')
  assert.equal(m.week_label, 'Sep 14 to 18')
  assert.equal(m.prev_week, '2026-09-07')
  assert.equal(m.next_week, '2026-09-21')
  assert.deepEqual(
    m.days.map((d) => d.status),
    ['closed', 'closed', 'closed', 'open', 'open'],
  )
  assert.equal(m.days[2].status_label, 'Closed for orders')
  assert.equal(m.days[2].cutoff_label, 'Ordering closed at 9:00 AM Tue Sep 15')
  assert.equal(m.days[3].date_label, 'Thu Sep 17')
  assert.equal(m.days[3].long_label, 'Thursday, September 17')
  assert.deepEqual(
    m.days[3].items.map((i) => i.id),
    ['chili', 'mac', 'milk', 'apple', 'cookie'],
  )
  assert.deepEqual(m.days[3].items[1], {
    id: 'mac',
    name: 'Macaroni and cheese',
    price_cents: 400,
    ingredients: 'Wheat macaroni, milk, cheddar cheese, butter',
    allergens: ['wheat_triticale', 'gluten', 'milk'],
    vegetarian: true,
    max_per_child: 1,
  })
  assert.equal(m.days[0].items.length, 5, 'closed days list their items for reading')
  const friday = await get('/api/family/menu', token, '2026-09-18T12:00:00Z')
  assert.equal(friday.body.week_start, '2026-09-21', 'after Friday 9:00 AM the first open day is next week')
  const oct = (await get('/api/family/menu?week=2026-10-01', token)).body
  assert.equal(oct.week_label, 'Sep 28 to Oct 2')
  const pd = (await get('/api/family/menu?week=2026-10-23', token)).body.days[4]
  assert.equal(pd.status, 'no_school')
  assert.equal(pd.status_label, 'PD day')
  assert.equal(pd.cutoff_label, null)
  const dec = (await get('/api/family/menu?week=2027-01-20', token)).body.days[0]
  assert.equal(dec.status, 'no_menu', 'past the seeded menu')
  assert.equal(dec.status_label, 'No menu yet')
  assert.equal((await get('/api/family/menu?week=nope', token)).status, 400)
})
