// A storm closure cancels and credits every order for that day to the cent.
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { call, familyToken, get, order, prng, reset, staffToken } from './client.mjs'

beforeEach(() => reset())

const DAY = '2026-09-17' // Thursday: chili, mac, milk, apple, cookie
const OTHER = '2026-09-18'
const THU = [
  ['chili', 1],
  ['mac', 1],
  ['milk', 2],
  ['apple', 2],
  ['cookie', 1],
]
const KIDS = { 'fam-1': ['ch-liam', 'ch-ava'], 'fam-2': ['ch-noah'], 'fam-3': ['ch-emma', 'ch-jack', 'ch-chloe'], 'fam-4': ['ch-owen'] }
const SEED = 20260917

const sum = (xs) => xs.reduce((s, x) => s + x, 0)

test('storm closure to the cent: seeded random orders, a price change and a cancelled line; preview = cancelled, credit = active totals, each balance drops by its own sum', async () => {
  const rnd = prng(SEED)
  const office = await staffToken('admin')
  const tokens = Object.fromEntries(await Promise.all(Object.keys(KIDS).map(async (f) => [f, await familyToken(f)])))

  // Two rounds of orders with a price change between them, so the day's lines carry different snapshots.
  const plan = (round) => {
    const out = {}
    for (const [fam, kids] of Object.entries(KIDS)) {
      out[fam] = []
      for (const child_id of kids) {
        for (const [item_id, max] of THU) {
          const r = rnd()
          if (r < (round === 0 ? 0.45 : 0.3))
            out[fam].push({ child_id, date: DAY, item_id, qty: max === 2 && rnd() < 0.5 ? 2 : 1, allergen_ack: true })
        }
      }
    }
    return out
  }
  const first = plan(0)
  // Always at least one qty 2 line and a mac line before the price change.
  first['fam-1'] = first['fam-1'].filter((l) => !(l.child_id === 'ch-ava' && ['mac', 'milk', 'apple'].includes(l.item_id)))
  first['fam-1'].push(
    { child_id: 'ch-ava', date: DAY, item_id: 'mac', qty: 1 },
    { child_id: 'ch-ava', date: DAY, item_id: 'milk', qty: 2 },
    { child_id: 'ch-ava', date: DAY, item_id: 'apple', qty: 2 },
  )
  first['fam-3'] = first['fam-3'].filter((l) => !(l.child_id === 'ch-jack' && l.item_id === 'mac'))
  for (const [fam, lines] of Object.entries(first)) if (lines.length) await order(tokens[fam], lines)

  const { id, ...mac } = (await get('/api/admin/settings', office)).body.items.find((i) => i.id === 'mac')
  assert.equal((await call('PUT', '/api/admin/items/mac', { token: office, body: { ...mac, price_cents: 435 } })).status, 200)

  // Second round: only items each child does not have yet (max 1 items would be over the limit).
  const have = new Set(
    Object.values(first)
      .flat()
      .map((l) => `${l.child_id}|${l.item_id}`),
  )
  const second = plan(1)
  second['fam-3'].push({ child_id: 'ch-jack', date: DAY, item_id: 'mac', qty: 1 })
  for (const [fam, lines] of Object.entries(second)) {
    const fresh = lines.filter(
      (l, i, all) =>
        !have.has(`${l.child_id}|${l.item_id}`) && all.findIndex((x) => x.child_id === l.child_id && x.item_id === l.item_id) === i,
    )
    if (fresh.length) await order(tokens[fam], fresh)
  }
  // Lines on another day that the closure must not touch.
  await order(tokens['fam-4'], [{ child_id: 'ch-owen', date: OTHER, item_id: 'pizza', qty: 2 }])

  // One line cancelled first: it is credited by its cancellation, never again by the closure.
  const fam1Lines = (await get('/api/family/orders', tokens['fam-1'])).body.lines
  const toCancel = fam1Lines.find((l) => l.child_id === 'ch-ava' && l.item_id === 'milk')
  assert.equal((await call('POST', `/api/family/lines/${toCancel.id}/cancel`, { token: tokens['fam-1'] })).status, 200)

  const before = {}
  for (const fam of Object.keys(KIDS)) {
    const lines = (await get('/api/family/orders', tokens[fam])).body.lines
    before[fam] = {
      lines,
      balance: (await get('/api/family/ledger', tokens[fam])).body.balance_cents,
      dayActive: lines.filter((l) => l.date === DAY && l.status === 'active'),
    }
  }
  const allActive = Object.values(before).flatMap((b) => b.dayActive)
  const prices = new Set(allActive.filter((l) => l.item_id === 'mac').map((l) => l.unit_price_cents))
  assert.deepEqual([...prices].sort(), [400, 435], 'mac lines carry both snapshots')
  assert.ok(
    allActive.some((l) => l.qty === 2),
    'at least one line has qty 2',
  )
  assert.ok(allActive.length >= 8, `a real spread of lines (${allActive.length})`)
  const wantCredit = sum(allActive.map((l) => l.total_cents))
  assert.equal(wantCredit, sum(allActive.map((l) => l.qty * l.unit_price_cents)))

  const preview = await get(`/api/admin/no-school/preview?date=${DAY}`, office)
  assert.equal(preview.status, 200)
  const post = await call('POST', '/api/admin/no-school', { token: office, body: { date: DAY, kind: 'closure', note: 'Storm (SAMPLE)' } })
  assert.equal(post.status, 201, post.text)
  assert.deepEqual(post.body.day, {
    date: DAY,
    date_label: 'Thu Sep 17',
    kind: 'closure',
    kind_label: 'School closed',
    note: 'Storm (SAMPLE)',
  })
  const { date, date_label, ...previewNumbers } = preview.body
  assert.deepEqual(previewNumbers, post.body.cancelled, 'the preview equals what the POST cancelled')
  assert.equal(post.body.cancelled.credit_cents, wantCredit, "credit = the sum of that day's active line totals before")
  assert.equal(post.body.cancelled.lines, allActive.length)
  assert.equal(post.body.cancelled.item_count, sum(allActive.map((l) => l.qty)))
  assert.equal(post.body.cancelled.families, Object.values(before).filter((b) => b.dayActive.length).length)
  // Read back afterwards: the closure entries add up to exactly the lines that were closed.
  let closedSum = 0
  let creditSum = 0
  for (const fam of Object.keys(KIDS)) {
    closedSum += sum(
      (await get('/api/family/orders', tokens[fam])).body.lines
        .filter((l) => l.date === DAY && l.status === 'closed')
        .map((l) => l.total_cents),
    )
    creditSum -= sum(
      (await get('/api/family/ledger', tokens[fam])).body.entries.filter((e) => e.kind === 'closure').map((e) => e.amount_cents),
    )
  }
  assert.equal(creditSum, closedSum, 'closure entries = closed lines, read back')
  assert.equal(closedSum, wantCredit)

  for (const fam of Object.keys(KIDS)) {
    const own = sum(before[fam].dayActive.map((l) => l.total_cents))
    const ledger = (await get('/api/family/ledger', tokens[fam])).body
    assert.equal(ledger.balance_cents, before[fam].balance - own, `${fam} balance drops by exactly its own sum`)
    const credits = ledger.entries.filter((e) => e.kind === 'closure')
    if (own) {
      assert.equal(credits.length, 1, `${fam}: one closure entry`)
      assert.equal(credits[0].amount_cents, -own)
      assert.equal(credits[0].label, 'Credit: School closed Thu Sep 17')
    } else {
      assert.equal(credits.length, 0)
    }
    const after = (await get('/api/family/orders', tokens[fam])).body.lines
    for (const l of after.filter((x) => x.date === DAY)) {
      const was = before[fam].lines.find((x) => x.id === l.id)
      assert.equal(l.status, was.status === 'cancelled' ? 'cancelled' : 'closed', `${l.id} was ${was.status}`)
      if (l.status === 'closed') {
        assert.equal(l.status_label, 'No school, credited')
        assert.equal(l.can_cancel, false)
      }
    }
    for (const l of after.filter((x) => x.date !== DAY)) assert.equal(l.status, 'active', 'other days untouched')
  }

  const kitchen = await get(`/api/kitchen/day?date=${DAY}`, office)
  assert.equal(kitchen.body.status, 'no_school')
  assert.deepEqual(kitchen.body.totals, { item_count: 0, line_count: 0, children: 0 })
  assert.deepEqual(kitchen.body.items, [])
  assert.deepEqual(kitchen.body.children, [])
  assert.equal(kitchen.body.orders_open, false)
  assert.equal((await get(`/api/kitchen/day?date=${OTHER}`, office)).body.totals.item_count, 2)

  const again = await call('POST', '/api/family/orders', {
    token: tokens['fam-4'],
    body: { lines: [{ child_id: 'ch-owen', date: DAY, item_id: 'chili', qty: 1 }] },
  })
  assert.equal(again.status, 409)
  assert.equal(again.body.code, 'no_school')
  assert.equal(again.body.error, "There's no school on Thu Sep 17 (School closed).")
  const twice = await call('POST', '/api/admin/no-school', { token: office, body: { date: DAY, kind: 'closure', note: '' } })
  assert.equal(twice.status, 409)
  assert.equal(twice.body.error, 'Thu Sep 17 is already a no-school day.')
  assert.equal((await get(`/api/admin/no-school/preview?date=${DAY}`, office)).status, 409, 'the preview refuses a day that is already off')

  const balances = Object.fromEntries(
    await Promise.all(Object.keys(KIDS).map(async (f) => [f, (await get('/api/family/ledger', tokens[f])).body.balance_cents])),
  )
  const del = await call('DELETE', `/api/admin/no-school/${DAY}`, { token: office })
  assert.deepEqual(del.body, { ok: true, restored_lines: 0 })
  for (const fam of Object.keys(KIDS)) {
    assert.equal((await get('/api/family/ledger', tokens[fam])).body.balance_cents, balances[fam], 'DELETE restores no money')
    for (const l of (await get('/api/family/orders', tokens[fam])).body.lines.filter((x) => x.date === DAY))
      assert.notEqual(l.status, 'active')
  }
  assert.equal((await get(`/api/kitchen/day?date=${DAY}`, office)).body.totals.item_count, 0, 'DELETE restores no lines')
  const reorder = await call('POST', '/api/family/orders', {
    token: tokens['fam-4'],
    body: { lines: [{ child_id: 'ch-owen', date: DAY, item_id: 'chili', qty: 1 }] },
  })
  assert.equal(reorder.status, 201, 'parents may order again once it is a school day')
})

test('no-school days: validation, a closure does not move the next cut-off, and a past day cannot be removed', async () => {
  const office = await staffToken('admin')
  const add = (body, now) => call('POST', '/api/admin/no-school', { token: office, body, now })
  const bads = [
    [{ date: '2026-09-19', kind: 'closure' }, 'date'],
    [{ date: '2026-09-14', kind: 'closure' }, 'date'],
    [{ date: '2027-07-05', kind: 'holiday' }, 'date'],
    [{ date: '2026-09-30', kind: 'storm' }, 'kind'],
    [{ date: '2026-09-30', kind: 'closure', note: 'x'.repeat(121) }, 'note'],
    [{ date: 'Sep 30', kind: 'closure' }, 'date'],
  ]
  for (const [body, field] of bads) {
    const r = await add(body)
    assert.equal(r.status, 400, JSON.stringify(body))
    assert.equal(r.body.field, field)
    if (field === 'date') {
      const p = await get(`/api/admin/no-school/preview?date=${encodeURIComponent(body.date)}`, office)
      assert.deepEqual(
        [p.status, p.body.field, p.body.error],
        [400, 'date', r.body.error],
        `the preview refuses ${body.date} like the POST`,
      )
    }
  }
  const dup = await add({ date: '2026-10-12', kind: 'holiday' })
  assert.deepEqual([dup.status, dup.body.code, dup.body.error], [409, 'bad_state', 'Mon Oct 12 is already a no-school day.'])
  const dupPreview = await get('/api/admin/no-school/preview?date=2026-10-12', office)
  assert.deepEqual([dupPreview.status, dupPreview.body.code, dupPreview.body.error], [409, 'bad_state', dup.body.error])
  assert.equal((await get('/api/admin/no-school/preview', office)).status, 400, 'no date')
  assert.deepEqual((await get('/api/admin/no-school/preview?date=2026-09-30', office)).body, {
    date: '2026-09-30',
    date_label: 'Wed Sep 30',
    lines: 0,
    item_count: 0,
    families: 0,
    credit_cents: 0,
  })
  const today = await add({ date: '2026-09-15', kind: 'closure', note: '' })
  assert.equal(today.status, 201, 'today is allowed (a storm on the morning)')

  assert.equal((await add({ date: '2026-09-23', kind: 'closure', note: 'Power out' })).status, 201)
  const fam = await familyToken('fam-1')
  const week = (await get('/api/family/menu?week=2026-09-21', fam)).body.days
  assert.equal(week[2].status_label, 'School closed')
  assert.equal(week[2].no_school.note, 'Power out')
  assert.equal(week[3].cutoff_label, 'Order by 9:00 AM Wed Sep 23', 'Thu Sep 24 still closes at 9:00 AM Wed Sep 23')

  const pd = await add({ date: '2026-09-29', kind: 'pd_day', note: '' })
  assert.equal(pd.status, 201)
  assert.equal(
    (await get('/api/family/menu?week=2026-09-28', fam)).body.days[2].cutoff_label,
    'Order by 9:00 AM Mon Sep 28',
    'a PD day does move it',
  )

  assert.equal((await call('DELETE', '/api/admin/no-school/2026-09-14', { token: office })).status, 404)
  const settings = (await get('/api/admin/settings', office)).body
  assert.deepEqual(
    settings.no_school_days.map((d) => d.date),
    ['2026-09-15', '2026-09-23', '2026-09-29', '2026-10-12', '2026-10-23', '2026-11-11'],
  )
  assert.equal(settings.no_school_days[1].kind_label, 'School closed')
  const office2 = await staffToken('admin', '2026-09-16T12:00:00Z')
  const past = await call('DELETE', '/api/admin/no-school/2026-09-15', { token: office2, now: '2026-09-16T12:00:00Z' })
  assert.equal(past.status, 409)
  assert.equal(past.body.error, 'That day has passed.')
  assert.equal((await call('DELETE', '/api/admin/no-school/2026-10-23', { token: office })).status, 200)
  assert.equal((await get('/api/family/menu?week=2026-10-23', fam)).body.days[4].status, 'no_menu', 'the removed PD day never had a menu')
})
