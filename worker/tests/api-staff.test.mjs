// The office (payments, adjustments, undo, families, CSV) and settings (menu, fill, school, items, classes, staff), and the
// demo scenario's promises.
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { call, familyToken, get, order, reset, staffToken } from './client.mjs'

beforeEach(() => reset())

test('office: payment, adjustment and undo arithmetic to the cent', async () => {
  const office = await staffToken('admin')
  const fam = await familyToken('fam-1')
  await order(fam, [{ child_id: 'ch-ava', date: '2026-09-17', item_id: 'chili', qty: 1 }, { child_id: 'ch-liam', date: '2026-09-17', item_id: 'apple', qty: 1 }])
  const pay = await call('POST', '/api/office/payments', { token: office, body: { family_id: 'fam-1', amount_cents: 250, method: 'cash', note: 'Envelope' } })
  assert.equal(pay.status, 201, pay.text)
  assert.equal(pay.body.balance_cents, 350)
  assert.deepEqual({ ...pay.body.entry, id: 'x' }, { id: 'x', at: '2026-09-15T13:30:00.000Z', at_label: 'Tue Sep 15, 11:00 AM', date: '2026-09-15',
    kind: 'payment', amount_cents: -250, label: 'Payment: Cash', method: 'cash', note: 'Envelope', voided: false })
  const adj = await call('POST', '/api/office/adjustments', { token: office, body: { family_id: 'fam-1', amount_cents: -100, note: 'Spilled milk' } })
  assert.equal(adj.body.balance_cents, 250)
  assert.equal(adj.body.entry.label, 'Adjustment')
  assert.equal((await call('POST', '/api/office/adjustments', { token: office, body: { family_id: 'fam-1', amount_cents: 55, note: 'Late fee' } })).body.balance_cents, 305)
  const et = await call('POST', '/api/office/payments', { token: office, body: { family_id: 'fam-1', amount_cents: 1, method: 'etransfer' } })
  assert.equal(et.body.entry.label, 'Payment: e-Transfer')
  assert.equal(et.body.entry.note, '')
  const undo = await call('POST', `/api/office/entries/${pay.body.entry.id}/void`, { token: office })
  assert.equal(undo.status, 200)
  assert.equal(undo.body.entry.voided, true)
  assert.equal(undo.body.balance_cents, 554)
  const twice = await call('POST', `/api/office/entries/${pay.body.entry.id}/void`, { token: office })
  assert.deepEqual([twice.status, twice.body.error], [409, 'That entry is already undone.'])
  const ledger = (await get('/api/family/ledger', fam)).body
  assert.equal(ledger.balance_cents, 554)
  const orderEntry = ledger.entries.find((e) => e.kind === 'order')
  const noVoid = await call('POST', `/api/office/entries/${orderEntry.id}/void`, { token: office })
  assert.deepEqual([noVoid.status, noVoid.body.error], [409, 'Only payments and adjustments can be undone.'])
  assert.equal(ledger.entries.find((e) => e.id === pay.body.entry.id).voided, true, 'a voided entry stays in the list')
  assert.equal((await call('POST', '/api/office/entries/ent_nope/void', { token: office })).status, 404)

  const bads = [
    ['payments', { family_id: 'fam-1', amount_cents: 0, method: 'cash' }, 400, 'amount_cents'],
    ['payments', { family_id: 'fam-1', amount_cents: 1000001, method: 'cash' }, 400, 'amount_cents'],
    ['payments', { family_id: 'fam-1', amount_cents: 12.5, method: 'cash' }, 400, 'amount_cents'],
    ['payments', { family_id: 'fam-1', amount_cents: 100, method: 'bitcoin' }, 400, 'method'],
    ['payments', { family_id: 'fam-1', amount_cents: 100, method: 'cash', note: 'x'.repeat(201) }, 400, 'note'],
    ['payments', { family_id: 'fam-9', amount_cents: 100, method: 'cash' }, 404, undefined],
    ['adjustments', { family_id: 'fam-1', amount_cents: 0, note: 'x' }, 400, 'amount_cents'],
    ['adjustments', { family_id: 'fam-1', amount_cents: -1000001, note: 'x' }, 400, 'amount_cents'],
    ['adjustments', { family_id: 'fam-1', amount_cents: 100, note: '' }, 400, 'note'],
    ['adjustments', { family_id: 'fam-1', amount_cents: 100 }, 400, 'note'],
  ]
  for (const [kind, body, status, field] of bads) {
    const r = await call('POST', `/api/office/${kind}`, { token: office, body })
    assert.equal(r.status, status, `${kind} ${JSON.stringify(body)}`)
    assert.equal(r.body.field, field)
  }
  assert.equal((await get('/api/family/ledger', fam)).body.balance_cents, 554, 'refusals changed nothing')
})

test('office: families sorted by balance with totals, add a family (the code once), rename, detail', async () => {
  const office = await staffToken('admin')
  await order(await familyToken('fam-2'), [{ child_id: 'ch-noah', date: '2026-09-17', item_id: 'chili', qty: 1 }])
  await call('POST', '/api/office/adjustments', { token: office, body: { family_id: 'fam-4', amount_cents: -300, note: 'Credit from last year' } })
  await call('POST', '/api/office/payments', { token: office, body: { family_id: 'fam-2', amount_cents: 100, method: 'cheque' } })
  const list = (await get('/api/office/families', office)).body
  assert.deepEqual(list.families.map((f) => [f.id, f.balance_cents]), [['fam-2', 375], ['fam-3', 0], ['fam-1', 0], ['fam-4', -300]])
  assert.deepEqual(list.totals, { families: 4, owing_cents: 375, credit_cents: -300 })
  assert.equal(list.families[0].last_payment_label, 'Tue Sep 15')
  assert.equal(list.families[1].last_payment_at, null)
  assert.deepEqual(list.families[1].children.map((c) => c.first_name), ['Chloe', 'Emma', 'Jack'])
  assert.deepEqual(list.families[2].children[0], { id: 'ch-ava', first_name: 'Ava', class_name: 'Room 8' })

  const add = await call('POST', '/api/office/families', { token: office, body: { label: '  Mia (SAMPLE)  ' } })
  assert.equal(add.status, 201)
  assert.equal(add.body.family.label, 'Mia (SAMPLE)')
  assert.match(add.body.code, /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/)
  const s = await call('POST', '/api/family/signin', { body: { code: add.body.code } })
  assert.equal(s.body.family.id, add.body.family.id)
  const detail = await get(`/api/office/families/${add.body.family.id}`, office)
  assert.equal(detail.status, 200)
  assert.equal(JSON.stringify(detail.body).includes(add.body.code.replace('-', '')), false, 'the code is never shown again')
  assert.equal(JSON.stringify((await get('/api/office/families', office)).body).includes(add.body.code), false)
  assert.equal((await call('POST', '/api/office/families', { token: office, body: { label: '' } })).body.field, 'label')
  const rename = await call('PUT', `/api/office/families/${add.body.family.id}`, { token: office, body: { label: 'Mia and Ben (SAMPLE)' } })
  assert.equal(rename.body.family.label, 'Mia and Ben (SAMPLE)')
  assert.equal((await call('PUT', '/api/office/families/nope', { token: office, body: { label: 'x' } })).status, 404)

  const fam2 = (await get('/api/office/families/fam-2', office)).body
  assert.equal(fam2.balance_cents, 375)
  assert.equal(fam2.children[0].allergies.join(), 'peanuts,tree_nuts')
  assert.deepEqual(fam2.entries.map((e) => e.kind), ['payment', 'order'], 'newest first')
  assert.equal(fam2.upcoming.lines.length, 1)
  assert.equal(fam2.upcoming.total_cents, 475)
  assert.equal((await get('/api/office/families/nope', office)).status, 404)
})

test('office CSV: ledger and balances, header, -3.00 and the formula guard on a family label =SUM(A1)', async () => {
  const office = await staffToken('admin')
  const add = await call('POST', '/api/office/families', { token: office, body: { label: '=SUM(A1)' } })
  const evil = add.body.family.id
  await call('POST', '/api/office/adjustments', { token: office, body: { family_id: evil, amount_cents: 300, note: '+cmd, "quoted"' } })
  await call('POST', '/api/office/payments', { token: office, body: { family_id: 'fam-4', amount_cents: 300, method: 'etransfer', note: '@home' } })
  await order(await familyToken('fam-3'), [{ child_id: 'ch-jack', date: '2026-09-17', item_id: 'mac', qty: 1 }])

  const r = await fetch(`${process.env.API_BASE}/api/office/ledger.csv`, { headers: { Authorization: `Bearer ${office}`, 'X-Test-Now': '2026-09-15T13:30:00Z' } })
  assert.equal(r.status, 200)
  assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8')
  assert.equal(r.headers.get('content-disposition'), 'attachment; filename="lunch-ledger-2026-09-08-to-2026-09-15.csv"')
  const text = await r.text()
  const rows = text.split('\r\n')
  assert.equal(rows[0], 'Date,Time,Family,Kind,Description,Amount,Method,Note,Voided')
  assert.equal(rows[rows.length - 1], '', 'ends with CRLF')
  assert.equal(rows[1], `2026-09-15,11:00 AM,'=SUM(A1),Adjustment,Adjustment,3.00,,"'+cmd, ""quoted""",`)
  assert.equal(rows[2], "2026-09-15,11:00 AM,Owen (SAMPLE),Payment,Payment: e-Transfer,-3.00,e-Transfer,'@home,")
  assert.equal(rows[3], '2026-09-15,11:00 AM,"Emma, Jack and Chloe (SAMPLE)",Order,"Order: 1 item, Thu Sep 17",4.00,,,')
  assert.equal(text.includes('\n=SUM') || text.includes(',=SUM'), false, 'no cell starts with =')
  const range = await fetch(`${process.env.API_BASE}/api/office/ledger.csv?from=2026-09-16&to=2026-09-30`, { headers: { Authorization: `Bearer ${office}`, 'X-Test-Now': '2026-09-15T13:30:00Z' } })
  assert.equal((await range.text()).split('\r\n').length, 2, 'header only outside the range')
  assert.equal(range.headers.get('content-disposition'), 'attachment; filename="lunch-ledger-2026-09-16-to-2026-09-30.csv"')

  const b = await fetch(`${process.env.API_BASE}/api/office/balances.csv`, { headers: { Authorization: `Bearer ${office}`, 'X-Test-Now': '2026-09-15T13:30:00Z' } })
  const brows = (await b.text()).split('\r\n')
  assert.equal(brows[0], 'Family,Children,Balance')
  assert.deepEqual(brows.slice(1, -1), [
    '"Emma, Jack and Chloe (SAMPLE)",Chloe (Room 2); Emma (Room 9); Jack (Room 4),4.00',
    "'=SUM(A1),,3.00",
    'Liam and Ava (SAMPLE),Ava (Room 8); Liam (Room 4),0.00',
    'Noah (SAMPLE),Noah (Room 1),0.00',
    'Owen (SAMPLE),Owen (Room 7),-3.00',
  ])
  assert.equal((await get('/api/office/ledger.csv', await staffToken('kitchen'))).status, 403)
})

test('menu PUT: refused when an ordered item is left out; saved otherwise; a past day, a day off and an unknown item are refused', async () => {
  const office = await staffToken('admin')
  const fam = await familyToken('fam-1')
  await order(fam, [{ child_id: 'ch-ava', date: '2026-09-17', item_id: 'mac', qty: 1 }, { child_id: 'ch-liam', date: '2026-09-17', item_id: 'milk', qty: 2, allergen_ack: true }])
  const put = (date, item_ids, token = office) => call('PUT', `/api/admin/menu/${date}`, { token, body: { item_ids } })
  const refused = await put('2026-09-17', ['chili', 'milk', 'apple'])
  assert.equal(refused.status, 409)
  assert.equal(refused.body.code, 'bad_state')
  assert.equal(refused.body.error, '1 of Macaroni and cheese is already ordered for Thu Sep 17. Keep it on the menu, or make the day a no-school day.')
  const milkOut = await put('2026-09-17', ['mac'])
  assert.equal(milkOut.body.error, '2 of White milk (250 mL) are already ordered for Thu Sep 17. Keep it on the menu, or make the day a no-school day.')
  let week = (await get('/api/admin/menu?week=2026-09-17', office)).body
  assert.deepEqual(week.days[3].item_ids, ['chili', 'mac', 'milk', 'apple', 'cookie'], 'unchanged after a refusal')
  assert.deepEqual(week.days[3].ordered, { mac: 1, milk: 2 })

  const ok = await put('2026-09-17', ['mac', 'milk', 'cookie'])
  assert.equal(ok.status, 200, ok.text)
  assert.deepEqual(ok.body.day.item_ids, ['mac', 'milk', 'cookie'])
  assert.equal(ok.body.day.status, 'school_day')
  week = (await get('/api/family/menu?week=2026-09-17', fam)).body
  assert.deepEqual(week.days[3].items.map((i) => i.id), ['mac', 'milk', 'cookie'])
  assert.equal((await put('2026-09-17', [])).status, 409)

  assert.deepEqual([(await put('2026-09-14', ['apple'])).status, (await put('2026-09-14', ['apple'])).body.error], [409, 'That day has passed.'])
  assert.equal((await put('2026-09-19', ['apple'])).status, 400, 'Saturday')
  assert.equal((await put('2026-10-12', ['apple'])).status, 400, 'a holiday')
  assert.equal((await put('2026-09-18', ['lobster'])).body.field, 'item_ids')
  assert.equal((await put('2026-09-18', ['apple', 'apple'])).status, 400)
  assert.equal((await put('2026-09-18', ['apple'], await staffToken('kitchen'))).status, 403)

  const m = (await get('/api/admin/menu?week=2026-10-12', office)).body
  assert.equal(m.week_label, 'Oct 12 to 16')
  assert.deepEqual([m.days[0].status, m.days[0].no_school.kind], ['no_school', 'holiday'])
  assert.equal((await get('/api/admin/menu?week=2027-06-28', office)).body.days[0].status, 'outside_year')
})

test('menu fill: empty school days from today on get their usual items; days with items are not touched', async () => {
  const office = await staffToken('admin')
  const before = (await get('/api/admin/menu?week=2026-12-21', office)).body
  assert.ok(before.days.every((d) => d.item_ids.length === 0), 'past the seeded menu')
  assert.equal((await call('PUT', '/api/admin/menu/2026-12-22', { token: office, body: { item_ids: ['chili'] } })).status, 200)
  const fill = await call('POST', '/api/admin/menu/fill', { token: office, body: { week: '2026-12-24' } })
  assert.equal(fill.status, 200, fill.text)
  assert.equal(fill.body.week_start, '2026-12-21')
  assert.deepEqual(fill.body.days.map((d) => d.item_ids), [
    ['soup', 'wrap', 'milk', 'apple', 'cookie'], ['chili'], ['soup', 'wrap', 'stirfry', 'milk', 'apple', 'cookie'],
    ['chili', 'mac', 'milk', 'apple', 'cookie'], ['pizza', 'fishcakes', 'milk', 'apple', 'cookie']])
  const again = await call('POST', '/api/admin/menu/fill', { token: office, body: { week: '2026-12-21' } })
  assert.deepEqual(again.body.days, fill.body.days, 'a second fill changes nothing')
  const pdWeek = (await call('POST', '/api/admin/menu/fill', { token: office, body: { week: '2026-10-19' } })).body
  assert.deepEqual(pdWeek.days[4].item_ids, [], 'the PD day gets nothing')
  assert.equal((await call('POST', '/api/admin/menu/fill', { token: office, body: {} })).status, 400)
})

test('school settings: validation, sample never changes, and the cut-off rule follows the setting', async () => {
  const office = await staffToken('admin')
  const good = { school_name: 'SAMPLE Harbour Pond Elementary (demo)', payment_instructions: 'Cash in an envelope (SAMPLE).', cutoff_days_before: 0,
    cutoff_time: '09:00', year_start: '2026-09-08', year_end: '2027-06-25', sample: false }
  const bads = [
    [{ school_name: '' }, 'school_name'], [{ school_name: 'x'.repeat(81) }, 'school_name'], [{ payment_instructions: '' }, 'payment_instructions'],
    [{ payment_instructions: 'x'.repeat(601) }, 'payment_instructions'], [{ cutoff_days_before: 6 }, 'cutoff_days_before'],
    [{ cutoff_days_before: -1 }, 'cutoff_days_before'], [{ cutoff_time: '9:00' }, 'cutoff_time'], [{ cutoff_time: '24:00' }, 'cutoff_time'],
    [{ year_start: '2026-13-01' }, 'year_start'], [{ year_end: '2026-09-08' }, 'year_end'],
  ]
  for (const [patch, field] of bads) {
    const r = await call('PUT', '/api/admin/school', { token: office, body: { ...good, ...patch } })
    assert.equal(r.status, 400, JSON.stringify(patch))
    assert.equal(r.body.field, field, JSON.stringify(patch))
  }
  const ok = await call('PUT', '/api/admin/school', { token: office, body: good })
  assert.equal(ok.status, 200, ok.text)
  assert.equal(ok.body.school.sample, true, 'sample is never changed here')
  assert.equal(ok.body.school.cutoff_days_before, 0)
  const info = (await call('GET', '/api/info')).body
  assert.equal(info.cutoff_rule_label, 'Order by 9:00 AM on the day.')
  assert.equal(info.payment_instructions, 'Cash in an envelope (SAMPLE).')
  const fam = await familyToken('fam-1')
  assert.equal((await get('/api/family/menu?week=2026-09-17', fam)).body.days[3].cutoff_label, 'Order by 9:00 AM Thu Sep 17')
  assert.equal((await call('PUT', '/api/admin/school', { token: office, body: { ...good, cutoff_days_before: 2, cutoff_time: '14:30' } })).status, 200)
  assert.equal((await call('GET', '/api/info')).body.cutoff_rule_label, 'Order by 2:30 PM 2 school days before.')
})

test('items: add, validation, and taking one off is refused while it is ordered for days to come', async () => {
  const office = await staffToken('admin')
  const item = { name: 'Toutons and molasses (SAMPLE)', price_cents: 375, ingredients: 'Bread dough (wheat), molasses', allergens: ['gluten', 'wheat_triticale'],
    vegetarian: true, days: [5, 1], max_per_child: null, active: true }
  const add = await call('POST', '/api/admin/items', { token: office, body: item })
  assert.equal(add.status, 201, add.text)
  assert.match(add.body.item.id, /^item_[0-9a-f]{16}$/)
  assert.deepEqual(add.body.item.allergens, ['wheat_triticale', 'gluten'])
  assert.deepEqual(add.body.item.days, [1, 5])
  const bads = [[{ name: '' }, 'name'], [{ price_cents: 5001 }, 'price_cents'], [{ price_cents: -1 }, 'price_cents'], [{ allergens: ['nuts'] }, 'allergens'],
    [{ days: [6] }, 'days'], [{ days: [1, 1] }, 'days'], [{ max_per_child: 0 }, 'max_per_child'], [{ max_per_child: 11 }, 'max_per_child'],
    [{ vegetarian: 'yes' }, 'vegetarian'], [{ active: 1 }, 'active'], [{ ingredients: 'x'.repeat(401) }, 'ingredients']]
  for (const [patch, field] of bads) {
    const r = await call('POST', '/api/admin/items', { token: office, body: { ...item, ...patch } })
    assert.equal(r.body.field, field, JSON.stringify(patch))
  }
  const fam = await familyToken('fam-1')
  const placed = await order(fam, [{ child_id: 'ch-ava', date: '2026-09-17', item_id: 'mac', qty: 1 }])
  const { id, ...mac } = (await get('/api/admin/settings', office)).body.items.find((i) => i.id === 'mac')
  const off = await call('PUT', '/api/admin/items/mac', { token: office, body: { ...mac, active: false } })
  assert.equal(off.status, 409)
  assert.equal(off.body.error, '1 of Macaroni and cheese is ordered for days still to come. Leave it on until those days pass.')
  await call('POST', `/api/family/lines/${placed.order.lines[0].id}/cancel`, { token: fam })
  const off2 = await call('PUT', '/api/admin/items/mac', { token: office, body: { ...mac, active: false } })
  assert.equal(off2.status, 200, off2.text)
  assert.equal(off2.body.item.active, false)
  const week = (await get('/api/admin/menu?week=2026-09-14', office)).body
  assert.equal(week.days[1].item_ids.includes('mac'), false, 'taken off from today (Tue Sep 15) on')
  assert.equal(week.days[3].item_ids.includes('mac'), false, 'Thu Sep 17')
  assert.equal((await get('/api/admin/menu?week=2026-09-07', office)).body.days[1].item_ids.includes('mac'), true, 'past days keep their menu (Tue Sep 8)')
  assert.equal((await call('POST', '/api/family/orders', { token: fam, body: { lines: [{ child_id: 'ch-ava', date: '2026-09-22', item_id: 'mac', qty: 1 }] } })).body.code, 'not_on_menu')
})

test('staff: a taken PIN is refused, a new PIN signs in, and the school always keeps one office PIN', async () => {
  const office = await staffToken('admin')
  const base = { name: 'Ms. Test (SAMPLE)', role: 'teacher', class_id: 'room-3' }
  const taken = await call('POST', '/api/admin/staff', { token: office, body: { ...base, pin: '1618' } })
  assert.deepEqual([taken.status, taken.body.code, taken.body.field], [409, 'pin_taken', 'pin'])
  assert.equal((await call('POST', '/api/admin/staff', { token: office, body: { ...base, pin: '12' } })).body.field, 'pin')
  assert.equal((await call('POST', '/api/admin/staff', { token: office, body: { ...base, pin: '9999', class_id: 'room-99' } })).body.field, 'class_id')
  assert.equal((await call('POST', '/api/admin/staff', { token: office, body: { ...base, pin: '9999', role: 'boss' } })).body.field, 'role')
  const add = await call('POST', '/api/admin/staff', { token: office, body: { ...base, pin: '9999' } })
  assert.equal(add.status, 201, add.text)
  assert.deepEqual({ ...add.body.staff, id: 'x' }, { id: 'x', name: 'Ms. Test (SAMPLE)', role: 'teacher', class_id: 'room-3', active: true })
  const s = await call('POST', '/api/staff/signin', { body: { pin: '9999' } })
  assert.equal(s.body.staff.id, add.body.staff.id)

  const me = { name: 'Ms. Janes (SAMPLE)', class_id: null }
  const demote = await call('PUT', '/api/admin/staff/st-office', { token: office, body: { ...me, role: 'kitchen', active: true } })
  assert.deepEqual([demote.status, demote.body.error], [409, 'The school needs at least one office PIN.'])
  assert.equal((await call('PUT', '/api/admin/staff/st-office', { token: office, body: { ...me, role: 'admin', active: false } })).status, 409)
  const second = await call('PUT', `/api/admin/staff/${add.body.staff.id}`, { token: office, body: { ...base, role: 'admin', active: true } })
  assert.equal(second.status, 200)
  assert.equal((await call('PUT', '/api/admin/staff/st-office', { token: office, body: { ...me, role: 'kitchen', active: true } })).status, 200)
  const t2 = s.body.token
  const off = await call('PUT', `/api/admin/staff/${add.body.staff.id}`, { token: t2, body: { ...base, role: 'admin', active: false } })
  assert.equal(off.body.error, 'The school needs at least one office PIN.', 'the last admin cannot switch themself off')
  const pinChange = await call('PUT', '/api/admin/staff/st-kitchen', { token: t2, body: { name: 'Mr. Kean (SAMPLE)', role: 'kitchen', class_id: null, active: false } })
  assert.equal(pinChange.status, 200)
  assert.equal((await call('POST', '/api/staff/signin', { body: { pin: '2718' } })).status, 401, 'an inactive PIN no longer signs in')
  assert.equal((await call('PUT', '/api/admin/staff/st-oldford', { token: t2, body: { name: 'Ms. Oldford (SAMPLE)', role: 'teacher', class_id: 'room-2', active: true, pin: '9999' } })).body.code, 'pin_taken')
  assert.equal((await call('PUT', '/api/admin/staff/nope', { token: t2, body: { ...base, active: true } })).status, 404)
})

test('classes: add and edit with validation; settings lists them with child counts', async () => {
  const office = await staffToken('admin')
  const add = await call('POST', '/api/admin/classes', { token: office, body: { name: 'Room 10', grade: 'Grade 6', sort: 7 } })
  assert.equal(add.status, 201)
  assert.equal(add.body.class.name, 'Room 10')
  assert.equal((await call('POST', '/api/admin/classes', { token: office, body: { name: '', grade: 'x', sort: 1 } })).body.field, 'name')
  assert.equal((await call('POST', '/api/admin/classes', { token: office, body: { name: 'x', grade: 'x', sort: 100 } })).body.field, 'sort')
  const edit = await call('PUT', `/api/admin/classes/${add.body.class.id}`, { token: office, body: { name: 'Room 11', grade: 'Grade 6', sort: 8 } })
  assert.equal(edit.body.class.name, 'Room 11')
  assert.equal((await call('PUT', '/api/admin/classes/nope', { token: office, body: { name: 'x', grade: 'x', sort: 1 } })).status, 404)
  const settings = (await get('/api/admin/settings', office)).body
  assert.deepEqual(settings.classes.map((c) => [c.id, c.child_count]).slice(0, 3), [['room-k', 1], ['room-1', 1], ['room-2', 2]])
  assert.equal(settings.classes.length, 8)
  assert.equal(settings.staff.length, 4)
  assert.equal(settings.items.length, 10)
  assert.equal(settings.allergens.length, 12)
})

test('demo scenario: the promises in docs/API.md hold (Thu Sep 24 2026, 1:30 PM)', async () => {
  const T = '2026-09-24T16:00:00Z'
  const seed = await call('POST', '/api/test/seed', { body: { scenario: 'demo' }, now: T })
  assert.equal(seed.status, 200, seed.text)
  assert.equal(seed.body.today, '2026-09-24')
  assert.deepEqual(seed.body.families.map((f) => f.code), ['KQ7M-4RTX', 'W3PH-8JND', 'C9VB-6FYE', 'T5ZA-2GUK'])
  const office = await staffToken('admin', T)
  const tokens = {}
  for (const f of seed.body.families) tokens[f.id] = await familyToken(f.id, T)
  const items = new Map((await get('/api/admin/settings', office, T)).body.items.map((i) => [i.id, i]))

  const k = (await get('/api/kitchen/day', office, T)).body
  assert.equal(k.date, '2026-09-25', "the kitchen's next school day")
  const liam = k.children.find((c) => c.first_name === 'Liam')
  assert.equal(liam.flag, 'conflict')
  assert.ok(liam.lines.some((l) => l.conflicts.includes('milk') && l.acknowledged), 'Liam with an acknowledged milk item')
  assert.ok(k.children.some((c) => c.flag === 'allergy'), 'an allergy row')

  const lines = {}
  for (const f of Object.keys(tokens)) lines[f] = (await get('/api/family/orders', tokens[f], T)).body.lines
  const emma = lines['fam-3'].filter((l) => l.child_id === 'ch-emma')
  assert.ok(emma.length > 0)
  for (const l of emma) assert.equal(items.get(l.item_id).allergens.includes('gluten'), false, `Emma never gets gluten (${l.item_name})`)
  const dates = [...new Set(lines['fam-1'].filter((l) => l.date >= '2026-09-24').map((l) => l.date))]
  assert.equal(dates.length, 9, 'today and the next 8 school days with a menu')
  assert.equal(dates[0], '2026-09-24')

  const ledgers = {}
  for (const f of Object.keys(tokens)) ledgers[f] = (await get('/api/family/ledger', tokens[f], T)).body
  const payments = (f) => ledgers[f].entries.filter((e) => e.kind === 'payment')
  assert.equal(payments('fam-1')[0].method, 'etransfer')
  assert.equal(payments('fam-3')[0].method, 'cash')
  assert.ok(ledgers['fam-3'].balance_cents > 0, 'a part payment')
  assert.equal(payments('fam-4').length, 0)
  assert.ok(ledgers['fam-4'].balance_cents > 0, 'fam-4 unpaid')
  assert.equal(Object.values(ledgers).flatMap((l) => l.entries).filter((e) => e.kind === 'cancel').length, 1, 'one cancel credit')

  const closure = (await get('/api/admin/settings', office, T)).body.no_school_days.find((d) => d.kind === 'closure')
  assert.deepEqual([closure.date, closure.note], ['2026-09-23', 'Storm closure (SAMPLE)'])
  for (const f of Object.keys(tokens)) {
    const day = lines[f].filter((l) => l.date === '2026-09-23')
    assert.ok(day.length && day.every((l) => l.status === 'closed'), `${f}: that day's lines are closed`)
    const credit = ledgers[f].entries.filter((e) => e.kind === 'closure')
    assert.equal(credit.length, 1)
    assert.equal(credit[0].amount_cents, -day.reduce((s, l) => s + l.total_cents, 0), `${f}: credited to the cent`)
    const sum = ledgers[f].entries.reduce((s, e) => (e.voided ? s : s + e.amount_cents), 0)
    assert.equal(ledgers[f].balance_cents, sum)
  }
  const teacher = (await get('/api/teacher/day?class_id=room-2', office, T)).body
  assert.ok(teacher.counts.children >= 2)
  assert.equal(teacher.counts.delivered, Math.ceil(teacher.counts.children / 2), 'about half of Room 4 given out after noon')
  const morning = await call('POST', '/api/test/seed', { body: { scenario: 'demo' }, now: '2026-09-24T12:00:00Z' })
  assert.equal(morning.status, 200)
  assert.equal((await get('/api/teacher/day?class_id=room-2', await staffToken('admin', '2026-09-24T12:00:00Z'), '2026-09-24T12:00:00Z')).body.counts.delivered, 0, 'nothing given out before noon')
})
