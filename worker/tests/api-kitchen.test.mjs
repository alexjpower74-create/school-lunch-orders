// Kitchen totals equal the sum of orders; labels; allergies as they are now; the teacher's list and marks.
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { call, familyToken, get, order, prng, reset, staffToken } from './client.mjs'

beforeEach(() => reset())

const KIDS = { 'fam-1': ['ch-liam', 'ch-ava'], 'fam-2': ['ch-noah'], 'fam-3': ['ch-emma', 'ch-jack', 'ch-chloe'], 'fam-4': ['ch-owen'] }
const MENUS = {
  '2026-09-17': [
    ['chili', 1],
    ['mac', 1],
    ['milk', 2],
    ['apple', 2],
    ['cookie', 1],
  ],
  '2026-09-18': [
    ['pizza', 2],
    ['fishcakes', 1],
    ['milk', 2],
    ['apple', 2],
    ['cookie', 1],
  ],
  '2026-09-21': [
    ['soup', 1],
    ['wrap', 1],
    ['milk', 2],
    ['apple', 2],
    ['cookie', 1],
  ],
}
const SEED = 91817
const sum = (xs) => xs.reduce((s, x) => s + x, 0)
const RANK = { conflict: 0, allergy: 1, null: 2 }

test('kitchen totals = sum of orders: random orders over two days plus cancellations and a closure', async () => {
  const rnd = prng(SEED)
  const office = await staffToken('admin')
  const kitchen = await staffToken('kitchen')
  const tokens = {}
  for (const fam of Object.keys(KIDS)) {
    tokens[fam] = await familyToken(fam)
    const lines = []
    for (const [date, menu] of Object.entries(MENUS)) {
      for (const child_id of KIDS[fam]) {
        for (const [item_id, max] of menu) {
          if (rnd() < 0.5) lines.push({ child_id, date, item_id, qty: max === 2 && rnd() < 0.5 ? 2 : 1, allergen_ack: true })
        }
      }
    }
    if (fam === 'fam-2') {
      const forced = [
        ['2026-09-17', 'milk'],
        ['2026-09-18', 'apple'],
      ]
      const kept = lines.filter((l) => !forced.some(([d, i]) => l.date === d && l.item_id === i))
      lines.length = 0
      lines.push(...kept, ...forced.map(([date, item_id]) => ({ child_id: 'ch-noah', date, item_id, qty: 2 })))
    }
    await order(tokens[fam], lines)
  }
  // Cancel about a quarter of the lines, then close Monday.
  for (const fam of Object.keys(KIDS)) {
    for (const l of (await get('/api/family/orders', tokens[fam])).body.lines) {
      if (l.child_id === 'ch-noah' && l.qty === 2) continue
      if (rnd() < 0.25) assert.equal((await call('POST', `/api/family/lines/${l.id}/cancel`, { token: tokens[fam] })).status, 200)
    }
  }
  assert.equal(
    (await call('POST', '/api/admin/no-school', { token: office, body: { date: '2026-09-21', kind: 'closure', note: '' } })).status,
    201,
  )

  const all = []
  for (const fam of Object.keys(KIDS)) all.push(...(await get('/api/family/orders', tokens[fam])).body.lines)
  assert.ok(all.some((l) => l.status === 'cancelled') && all.some((l) => l.status === 'closed'), 'cancelled and closed lines exist')

  for (const date of Object.keys(MENUS)) {
    const active = all.filter((l) => l.date === date && l.status === 'active')
    const k = (await get(`/api/kitchen/day?date=${date}`, kitchen)).body
    const want = sum(active.map((l) => l.qty))
    if (date !== '2026-09-21')
      assert.ok(
        active.some((l) => l.qty === 2),
        `${date} has a qty 2 line`,
      )
    assert.equal(sum(k.items.map((i) => i.qty)), want, `${date}: Σ items[].qty = Σ qty of active lines`)
    assert.equal(k.totals.item_count, want, `${date}: totals.item_count = Σ qty of active lines`)
    assert.equal(k.totals.line_count, active.length, `${date}: line_count`)
    assert.equal(k.totals.children, new Set(active.map((l) => l.child_id)).size)
    for (const item of k.items)
      assert.equal(item.qty, sum(active.filter((l) => l.item_id === item.item_id).map((l) => l.qty)), `${date} ${item.item_id}`)
    for (const cl of k.classes) {
      assert.equal(cl.qty, sum(cl.items.map((i) => i.qty)), `${date} class ${cl.class_id}: qty = Σ items`)
      assert.ok(cl.qty >= 1)
    }
    assert.equal(sum(k.classes.map((c) => c.qty)), want)
    assert.deepEqual(
      k.classes.map((c) => c.sort),
      [...k.classes.map((c) => c.sort)].sort((a, b) => a - b),
      'classes by sort',
    )
    for (let i = 1; i < k.items.length; i++)
      assert.ok(
        k.items[i - 1].qty > k.items[i].qty || (k.items[i - 1].qty === k.items[i].qty && k.items[i - 1].name <= k.items[i].name),
        'items: qty desc, then name',
      )

    const seen = k.children.flatMap((ch) => ch.lines.map((l) => l.line_id))
    assert.deepEqual([...seen].sort(), active.map((l) => l.id).sort(), `${date}: every active line under exactly one child`)
    const ranks = k.children.map((ch) => RANK[ch.flag])
    assert.deepEqual(
      ranks,
      [...ranks].sort((a, b) => a - b),
      `${date}: flag order conflict, allergy, none`,
    )
    for (const ch of k.children) {
      const hasConflict = ch.lines.some((l) => l.conflicts.length)
      assert.equal(ch.flag, hasConflict ? 'conflict' : ch.allergies.length ? 'allergy' : null, `${date} ${ch.child_id}`)
      for (const l of ch.lines) assert.equal(l.acknowledged, true, 'every conflict here was acknowledged')
    }

    const labels = (await get(`/api/kitchen/labels?date=${date}`, kitchen)).body
    assert.equal(labels.labels.length, active.length, `${date}: one label per active line`)
    assert.deepEqual(labels.labels.map((l) => l.line_id).sort(), active.map((l) => l.id).sort())
    assert.equal(labels.school_name, 'SAMPLE Harbour Pond Elementary (demo)')
    assert.equal(labels.sample, true)
  }
  const monday = (await get('/api/kitchen/day?date=2026-09-21', kitchen)).body
  assert.equal(monday.status, 'no_school')
  assert.equal(monday.totals.item_count, 0)
})

test('kitchen: a new allergy ticked after ordering shows as a conflict with acknowledged false', async () => {
  const fam = await familyToken('fam-1')
  const kitchen = await staffToken('kitchen')
  await order(fam, [
    { child_id: 'ch-ava', date: '2026-09-17', item_id: 'mac', qty: 1 },
    { child_id: 'ch-liam', date: '2026-09-17', item_id: 'mac', qty: 1, allergen_ack: true },
    { child_id: 'ch-liam', date: '2026-09-17', item_id: 'chili', qty: 1 },
  ])
  const noah = await familyToken('fam-2')
  await order(noah, [{ child_id: 'ch-noah', date: '2026-09-17', item_id: 'chili', qty: 1 }])
  await order(await familyToken('fam-4'), [{ child_id: 'ch-owen', date: '2026-09-17', item_id: 'apple', qty: 1 }])
  let k = (await get('/api/kitchen/day?date=2026-09-17', kitchen)).body
  assert.deepEqual(
    k.children.map((c) => [c.first_name, c.flag]),
    [
      ['Liam', 'conflict'],
      ['Noah', 'allergy'],
      ['Owen', null],
      ['Ava', null],
    ],
    'conflict first, then allergy (Room 1 Noah), then the rest by class sort',
  )
  const liam = k.children[0]
  assert.deepEqual(
    liam.lines.map((l) => [l.item_name, l.conflicts, l.acknowledged]),
    [
      ['Beef chili with rice', [], true],
      ['Macaroni and cheese', ['milk'], true],
    ],
  )

  assert.equal(
    (await call('PUT', '/api/family/children/ch-ava', { token: fam, body: { first_name: 'Ava', class_id: 'room-5', allergies: ['milk'] } }))
      .status,
    200,
  )
  k = (await get('/api/kitchen/day?date=2026-09-17', kitchen)).body
  const ava = k.children.find((c) => c.child_id === 'ch-ava')
  assert.equal(ava.flag, 'conflict')
  assert.deepEqual(ava.lines[0].conflicts, ['milk'])
  assert.equal(ava.lines[0].acknowledged, false)
  assert.deepEqual(
    k.children.slice(0, 2).map((c) => c.first_name),
    ['Liam', 'Ava'],
    'conflicts by class sort: Room 4 then Room 8',
  )
  const label = (await get('/api/kitchen/labels?date=2026-09-17', kitchen)).body.labels.find((l) => l.first_name === 'Ava')
  assert.deepEqual([label.conflicts, label.allergies, label.acknowledged], [['milk'], ['milk'], false])
  const lines = (await get('/api/family/orders', fam)).body.lines
  assert.deepEqual(lines.find((l) => l.child_id === 'ch-ava').ack_allergens, [], 'the stored acknowledgement is unchanged')
})

test('kitchen: default date, statuses, and orders_open flips at the cut-off', async () => {
  const kitchen = await staffToken('kitchen')
  const def = (await get('/api/kitchen/day', kitchen)).body
  assert.equal(def.date, '2026-09-16', 'the next school day')
  assert.equal(def.today, '2026-09-15')
  assert.equal(def.is_today, false)
  assert.equal(def.orders_open, false, 'Wed Sep 16 closed at 9:00 AM today')
  assert.equal(def.cutoff_label, 'Ordering closed at 9:00 AM Tue Sep 15')
  assert.equal(def.items.length, 6)
  assert.ok(def.items.every((i) => i.qty === 0))
  const thu = (await get('/api/kitchen/day?date=2026-09-17', kitchen)).body
  assert.equal(thu.orders_open, true)
  assert.equal(thu.long_label, 'Thursday, September 17')
  const k2 = await staffToken('kitchen', '2026-09-16T11:30:00Z')
  assert.equal((await get('/api/kitchen/day?date=2026-09-17', k2, '2026-09-16T11:30:00Z')).body.orders_open, false)
  const sat = (await get('/api/kitchen/day?date=2026-09-19', kitchen)).body
  assert.deepEqual([sat.status, sat.status_label, sat.cutoff_at, sat.items.length], ['weekend', 'Weekend', null, 0])
  const hol = (await get('/api/kitchen/day?date=2026-10-12', kitchen)).body
  assert.deepEqual([hol.status, hol.no_school.note], ['no_school', 'Thanksgiving Day'])
  assert.equal((await get('/api/kitchen/day?date=2027-07-02', kitchen)).body.status, 'outside_year')
  assert.equal((await get('/api/kitchen/day?date=tomorrow', kitchen)).status, 400)
  assert.equal((await get('/api/kitchen/labels', kitchen)).body.date, '2026-09-16')
})

test('teacher: today only, no lunch → 409, counts come back in the answer, null clears, absent credits nothing', async () => {
  const fam1 = await familyToken('fam-1')
  const fam3 = await familyToken('fam-3')
  await order(fam1, [
    { child_id: 'ch-liam', date: '2026-09-17', item_id: 'mac', qty: 1, allergen_ack: true },
    { child_id: 'ch-ava', date: '2026-09-17', item_id: 'chili', qty: 1 },
  ])
  await order(fam3, [
    { child_id: 'ch-jack', date: '2026-09-17', item_id: 'chili', qty: 1 },
    { child_id: 'ch-jack', date: '2026-09-17', item_id: 'apple', qty: 2 },
  ])
  const T = '2026-09-17T15:00:00Z' // Thu Sep 17, 12:30 PM
  const teacher = await staffToken('oldford', T)
  const classes = (await get('/api/teacher/classes', teacher, T)).body
  assert.equal(classes.my_class_id, 'room-2')
  assert.equal(classes.classes.length, 7)
  assert.equal(
    (await get('/api/teacher/classes', await staffToken('admin', T), T)).body.my_class_id,
    'room-k',
    'an admin gets the first class',
  )

  const day = (await get('/api/teacher/day', teacher, T)).body
  assert.equal(day.date, '2026-09-17')
  assert.equal(day.is_today, true)
  assert.equal(day.class.name, 'Room 4')
  assert.deepEqual(
    day.children.map((c) => [c.first_name, c.flag, c.state, c.state_label]),
    [
      ['Jack', null, null, 'Waiting'],
      ['Liam', 'conflict', null, 'Waiting'],
    ],
  )
  assert.deepEqual(
    day.children[0].lines.map((l) => [l.item_name, l.qty]),
    [
      ['Apple slices', 2],
      ['Beef chili with rice', 1],
    ],
  )
  assert.deepEqual(day.counts, { children: 2, delivered: 0, absent: 0, waiting: 2 })

  const mark = (body, now = T) => call('POST', '/api/teacher/mark', { token: teacher, body, now })
  const m1 = await mark({ date: '2026-09-17', child_id: 'ch-liam', state: 'delivered' })
  assert.equal(m1.status, 200, m1.text)
  assert.equal(m1.body.child.state_label, 'Given out')
  assert.deepEqual(m1.body.counts, { children: 2, delivered: 1, absent: 0, waiting: 1 })
  const m2 = await mark({ date: '2026-09-17', child_id: 'ch-jack', state: 'absent' })
  assert.deepEqual(m2.body.counts, { children: 2, delivered: 1, absent: 1, waiting: 0 })
  assert.equal((await get('/api/teacher/day', teacher, T)).body.children[0].state, 'absent', 'survives a reload')
  const m3 = await mark({ date: '2026-09-17', child_id: 'ch-liam', state: null })
  assert.deepEqual(m3.body.counts, { children: 2, delivered: 0, absent: 1, waiting: 1 })
  await mark({ date: '2026-09-17', child_id: 'ch-liam', state: 'delivered' })
  const liamLine = (await get('/api/family/orders', fam1, T)).body.lines.find((l) => l.child_id === 'ch-liam')
  assert.equal(liamLine.delivery, 'delivered')

  const notToday = await mark({ date: '2026-09-18', child_id: 'ch-liam', state: 'delivered' })
  assert.equal(notToday.status, 409)
  assert.equal(notToday.body.error, "You can only mark today's lunches.")
  const noLunch = await mark({ date: '2026-09-17', child_id: 'ch-owen', state: 'delivered' })
  assert.equal(noLunch.status, 409)
  assert.equal(noLunch.body.error, 'Owen has no lunch ordered today.')
  assert.equal((await mark({ date: '2026-09-17', child_id: 'ch-liam', state: 'eaten' })).status, 400)
  assert.equal((await mark({ date: '2026-09-17', child_id: 'ch-nobody', state: 'absent' })).status, 404)

  const other = (await get('/api/teacher/day?class_id=room-5', teacher, T)).body
  assert.deepEqual(
    other.children.map((c) => c.first_name),
    ['Ava'],
    'any teacher may look at any class',
  )
  assert.equal((await get('/api/teacher/day?class_id=room-99', teacher, T)).status, 404)
  const tomorrow = (await get('/api/teacher/day?date=2026-09-18', teacher, T)).body
  assert.equal(tomorrow.is_today, false)
  assert.equal((await get('/api/family/ledger', fam3, T)).body.balance_cents, 475 + 250, 'absent does not credit')
})
